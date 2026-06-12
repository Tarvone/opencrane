import type * as k8s from "@kubernetes/client-node";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { ___AuthRouter } from "../../infra/auth/auth.router.js";
import type { OidcAuthService } from "../../infra/auth/oidc.service.js";

/** Session shape the pod-token route reads. */
interface TestSession
{
	/** Authenticated user, or undefined for an anonymous request. */
	authUser?: { sub: string; email?: string };
}

/** Build a CoreV1Api stub whose TokenRequest returns a fixed token. */
function _buildCoreApi(token: string | undefined, expiresAt: Date): k8s.CoreV1Api
{
	return {
		createNamespacedServiceAccountToken: vi.fn().mockResolvedValue({
			status: { token, expirationTimestamp: expiresAt },
		}),
	} as unknown as k8s.CoreV1Api;
}

/** Build a Prisma stub whose tenant.findMany returns the given matches. */
function _buildPrisma(matches: unknown[]): PrismaClient
{
	return {
		tenant: { findMany: vi.fn().mockResolvedValue(matches) },
	} as unknown as PrismaClient;
}

/** Mount the auth router with an injected session for testing. */
function _buildApp(session: TestSession, prisma: PrismaClient, coreApi: k8s.CoreV1Api): Express
{
	const app = express();
	app.use(express.json());
	app.use(function _injectSession(req: Request, _res: Response, next: NextFunction): void
	{
		(req as unknown as { session: TestSession }).session = session;
		next();
	});
	app.use("/auth", ___AuthRouter({} as OidcAuthService, prisma, coreApi));
	return app;
}

describe("POST /auth/pod-token", function _suite()
{
	const expiry = new Date("2026-06-12T10:10:00.000Z");

	it("mints a pod-scoped token for the caller's tenant", async function _ok()
	{
		const coreApi = _buildCoreApi("pod-jwt", expiry);
		const prisma = _buildPrisma([{ name: "alex.oc", ingressHost: "alex.oc.example.com" }]);
		const app = _buildApp({ authUser: { sub: "u1", email: "Alex@acme.com" } }, prisma, coreApi);

		const res = await request(app).post("/auth/pod-token");

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			token: "pod-jwt",
			expiresAt: expiry.toISOString(),
			tenant: "alex.oc",
			ingressHost: "alex.oc.example.com",
			audience: "openclaw",
		});

		const mintArgs = (coreApi.createNamespacedServiceAccountToken as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(mintArgs.name).toBe("openclaw-alex.oc");
		expect(mintArgs.body.spec.audiences).toEqual(["openclaw"]);
		expect(mintArgs.body.spec.expirationSeconds).toBe(600);
	});

	it("returns 401 without a session", async function _noSession()
	{
		const app = _buildApp({}, _buildPrisma([]), _buildCoreApi("x", expiry));
		const res = await request(app).post("/auth/pod-token");
		expect(res.status).toBe(401);
		expect(res.body.code).toBe("UNAUTHORIZED");
	});

	it("returns 403 when the session has no email", async function _noEmail()
	{
		const app = _buildApp({ authUser: { sub: "u1" } }, _buildPrisma([]), _buildCoreApi("x", expiry));
		const res = await request(app).post("/auth/pod-token");
		expect(res.status).toBe(403);
		expect(res.body.code).toBe("FORBIDDEN");
	});

	it("returns 403 when no tenant matches the session email", async function _noTenant()
	{
		const app = _buildApp({ authUser: { sub: "u1", email: "ghost@acme.com" } }, _buildPrisma([]), _buildCoreApi("x", expiry));
		const res = await request(app).post("/auth/pod-token");
		expect(res.status).toBe(403);
		expect(res.body.code).toBe("NO_TENANT");
	});

	it("fails closed with 409 when the email maps to more than one tenant", async function _ambiguous()
	{
		const coreApi = _buildCoreApi("x", expiry);
		const prisma = _buildPrisma([
			{ name: "alex.oc", ingressHost: "a.example.com" },
			{ name: "alex2.oc", ingressHost: "b.example.com" },
		]);
		const app = _buildApp({ authUser: { sub: "u1", email: "alex@acme.com" } }, prisma, coreApi);
		const res = await request(app).post("/auth/pod-token");
		expect(res.status).toBe(409);
		expect(res.body.code).toBe("AMBIGUOUS_TENANT");
		expect(coreApi.createNamespacedServiceAccountToken).not.toHaveBeenCalled();
	});

	it("returns 409 when the tenant pod has no ingress host", async function _noIngress()
	{
		const prisma = _buildPrisma([{ name: "alex.oc", ingressHost: null }]);
		const app = _buildApp({ authUser: { sub: "u1", email: "alex@acme.com" } }, prisma, _buildCoreApi("x", expiry));
		const res = await request(app).post("/auth/pod-token");
		expect(res.status).toBe(409);
		expect(res.body.code).toBe("POD_NOT_READY");
	});
});
