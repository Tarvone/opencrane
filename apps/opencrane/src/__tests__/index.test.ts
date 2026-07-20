import type { PrismaClient } from "@prisma/client";
import express from "express";
import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { ___AuthMiddleware } from "@opencrane/server/_infra/auth";
import { _CheckDbHealth, _RateLimit } from "@opencrane/server/_infra/http";

/**
 * Build a minimal Express app with a mocked database health handler.
 * @param dbHealthy - Whether the mock DB query should succeed
 * @returns An Express app wired for health-check testing
 */
function _buildHealthApp(dbHealthy: boolean): Express
{
  const prisma = {
    $queryRaw: dbHealthy ? vi.fn().mockResolvedValue([{ 1: 1 }]) : vi.fn().mockRejectedValue(new Error("db unavailable")),
  } as unknown as PrismaClient;

  const app = express();
  app.use(express.json());
  app.get("/healthz", _CheckDbHealth(prisma));

  return app;
}

/**
 * Build a minimal Express app that exercises OIDC/session or development auth.
 * @returns An Express app wired for auth testing
 */
function _buildAuthApp(): Express
{
  const app = express();
  app.use(express.json());
  // Mirror production middleware order: the per-IP limiter is mounted before auth + routes.
  app.use(_RateLimit());
  app.use(___AuthMiddleware());

  app.get("/healthz", function _healthz(req, res)
  {
    res.json({ status: "ok", db: true });
  });

  app.get("/api/test", function _test(req, res)
  {
    res.json({ ok: true });
  });

  return app;
}

describe("Control Plane", () =>
{
  it("healthz endpoint returns ok", async () =>
  {
    const app = _buildHealthApp(true);
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", db: true });
  });

  it("healthz endpoint returns degraded when DB is unavailable", async () =>
  {
    const app = _buildHealthApp(false);
    const res = await request(app).get("/healthz");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", db: false });
  });

  describe("auth middleware", () =>
  {
    it("allows all requests when OIDC is not configured (development mode)", async () =>
    {
      const app = _buildAuthApp();

      const res = await request(app).get("/api/test");
      expect(res.status).toBe(200);
    });

    it("healthz bypasses auth", async () =>
    {
      const app = _buildAuthApp();

      const res = await request(app).get("/healthz");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("serves /api/internal tokenless on the internal listener, and never mounts a session gate there", async () =>
    {
      // The internal API lives on its OWN listener (createInternalApp) with NO session/token
      // auth — the NetworkPolicy-only routes authenticate at the network layer, kept off the
      // public ingress-facing listener so they can't be reached from the internet. We mirror
      // createInternalApp's wiring here (importing ../index.js would boot the real servers) and
      // assert /api/internal is reachable tokenless AND that a would-be auth gate never runs.
      const { _RegisterInternalRoutes } = await import("../app/routes.js");

      const prisma = {
        tenant: { findUnique: vi.fn().mockResolvedValue(null) },
        modelDefinition: { findMany: vi.fn().mockResolvedValue([]) },
        modelRoutingDefault: { findFirst: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      let gateRan = false;
      const app = express();
      app.use(express.json());
      _RegisterInternalRoutes(app, prisma, {} as never);
      // A stand-in for any auth middleware: on the internal listener it must NEVER run for
      // /api/internal (those routes handle the request first and end it).
      app.use(function _wouldBeGate(req, res, next) { gateRan = true; next(); });

      const internal = await request(app).get("/api/internal/tenant-models/some-tenant");
      expect(internal.status).toBe(200);
      expect(internal.body).toEqual({ models: [], defaultModel: null });
      expect(gateRan).toBe(false);
    });
  });
});
