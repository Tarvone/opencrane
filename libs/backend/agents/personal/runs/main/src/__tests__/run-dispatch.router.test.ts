import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { AGENT_CONTROLLER_PROJECTED_TOKEN_AUDIENCE } from "@opencrane/contracts";

import { __CreateAgentControllerRunDispatchRouter } from "../run-dispatch.router.js";
import type { AgentControllerRunDispatchRouterDependencies } from "../run-dispatch.types.js";

/** Creates an Express app with one configurable controller-dispatch boundary. */
function _App(overrides: Partial<AgentControllerRunDispatchRouterDependencies> = {})
{
	const dependencies: AgentControllerRunDispatchRouterDependencies = {
		namespace: "silo-a",
		tokenReviewer: { __Review: vi.fn().mockResolvedValue({ username: "system:serviceaccount:silo-a:agent-controller", namespace: "silo-a", serviceAccountName: "agent-controller", audiences: [AGENT_CONTROLLER_PROJECTED_TOKEN_AUDIENCE] }) },
		repository: { claimNextAttemptAtomically: vi.fn().mockResolvedValue({ status: "none" }), commitSuspendedJobAssignmentAtomically: vi.fn().mockResolvedValue({ status: "conflict", reason: "stale_claim" }) },
		logger: { error: vi.fn() },
		...overrides,
	};
	const app = express();
	app.use(express.json());
	app.use(__CreateAgentControllerRunDispatchRouter(dependencies));
	return { app, dependencies };
}

describe("agent-controller run-dispatch router", function _DescribeRouter()
{
	it("requires the exact reviewed controller identity and audience", async function _RejectWrongIdentity()
	{
		const { app, dependencies } = _App({ tokenReviewer: { __Review: vi.fn().mockResolvedValue({ username: "system:serviceaccount:silo-a:other", namespace: "silo-a", serviceAccountName: "other", audiences: [AGENT_CONTROLLER_PROJECTED_TOKEN_AUDIENCE] }) } });

		const response = await request(app).post("/run-attempts:claim").set("authorization", "Bearer projected-token").send({});

		expect(response.status).toBe(401);
		expect(response.body).toEqual({ error: "controller_identity_denied" });
		expect(dependencies.repository.claimNextAttemptAtomically).not.toHaveBeenCalled();
	});

	it("returns an empty normal poll without exposing authority state", async function _ReturnNoContent()
	{
		const { app, dependencies } = _App();

		const response = await request(app).post("/run-attempts:claim").set("authorization", "Bearer projected-token").send({});

		expect(response.status).toBe(204);
		expect(dependencies.tokenReviewer.__Review).toHaveBeenCalledWith("projected-token");
		expect(dependencies.repository.claimNextAttemptAtomically).toHaveBeenCalledOnce();
	});

	it("forwards exact assignment evidence and maps a stale claim to conflict", async function _CommitConflict()
	{
		const { app, dependencies } = _App();
		const command = { runId: "run-1", attempt: 1, claimedAt: "2026-07-20T00:00:00.000Z", deliveryCount: 1, expectedWorkloadProfile: "personal-small", namespace: "silo-a", serviceAccountName: "agent-runtime-small", workloadUid: "job-uid-1" };

		const response = await request(app).put("/run-attempts/event-1/assignment").set("authorization", "Bearer projected-token").send(command);

		expect(response.status).toBe(409);
		expect(response.body).toEqual({ error: "stale_claim" });
		expect(dependencies.repository.commitSuspendedJobAssignmentAtomically).toHaveBeenCalledWith("event-1", command);
	});

	it("logs a structured operation and never logs the token or body when authority fails", async function _LogFailure()
	{
		const failure = new Error("database unavailable");
		const logger = { error: vi.fn() };
		const repository = { claimNextAttemptAtomically: vi.fn().mockRejectedValue(failure), commitSuspendedJobAssignmentAtomically: vi.fn() };
		const { app } = _App({ repository, logger });

		const response = await request(app).post("/run-attempts:claim").set("authorization", "Bearer secret-projected-token").send({});

		expect(response.status).toBe(503);
		expect(logger.error).toHaveBeenCalledWith({ err: failure, operation: "agent_controller.claim" }, "Agent-controller claim failed");
		expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret-projected-token");
	});
});
