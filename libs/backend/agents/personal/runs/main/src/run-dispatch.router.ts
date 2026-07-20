import { Router, type Request, type Response } from "express";

import { AGENT_CONTROLLER_PROJECTED_TOKEN_AUDIENCE, AGENT_CONTROLLER_SERVICE_ACCOUNT_NAME, type AgentControllerRunAttemptAssignmentCommand } from "@opencrane/contracts";

import type { AgentControllerRunDispatchRouterDependencies, ReviewedAgentControllerIdentity } from "./run-dispatch.types.js";

/** Build the workload-authenticated internal run-dispatch API for the sole agent controller. */
export function __CreateAgentControllerRunDispatchRouter(dependencies: AgentControllerRunDispatchRouterDependencies): Router
{
	const router = Router();

	router.post("/run-attempts:claim", async function _claim(request: Request, response: Response)
	{
		try
		{
			// 1. TokenReview the dedicated controller credential and reject caller-supplied policy or time.
			if (!await _IsController(request, dependencies) || !_IsEmptyObject(request.body))
			{
				_RespondProblem(response, 401, "controller_identity_denied");
				return;
			}

			// 2. Claim one database-fenced command; an empty queue is normal long-poll input.
			const result = await dependencies.repository.claimNextAttemptAtomically();
			if (result.status === "none")
			{
				response.status(204).end();
				return;
			}
			response.status(200).json(result.claim);
		}
		catch (err)
		{
			dependencies.logger.error({ err, operation: "agent_controller.claim" }, "Agent-controller claim failed");
			_RespondProblem(response, 503, "dispatch_authority_unavailable");
		}
	});

	router.put("/run-attempts/:eventId/assignment", async function _assign(request: Request, response: Response)
	{
		try
		{
			// 1. Authenticate before parsing assignment evidence so unauthorised callers learn no claim state.
			if (!await _IsController(request, dependencies))
			{
				_RespondProblem(response, 401, "controller_identity_denied");
				return;
			}
			const command = _ParseAssignmentCommand(request.body);
			const eventId = request.params["eventId"];
			if (!command || typeof eventId !== "string" || !eventId)
			{
				_RespondProblem(response, 400, "invalid_assignment");
				return;
			}

			// 2. Let the run authority compare the exact claim generation and persist all state atomically.
			const result = await dependencies.repository.commitSuspendedJobAssignmentAtomically(eventId, command);
			if (result.status === "conflict")
			{
				_RespondProblem(response, 409, result.reason);
				return;
			}
			response.status(200).json(result.result);
		}
		catch (err)
		{
			dependencies.logger.error({ err, operation: "agent_controller.assignment" }, "Agent-controller assignment failed");
			_RespondProblem(response, 503, "dispatch_authority_unavailable");
		}
	});

	return router;
}

/** TokenReview one bearer and require the exact controller KSA, namespace, username, and audience. */
async function _IsController(request: Request, dependencies: AgentControllerRunDispatchRouterDependencies): Promise<boolean>
{
	const token = _BearerValue(request.header("authorization"));
	if (!token) return false;
	const identity = await dependencies.tokenReviewer.__Review(token);
	return identity !== null && _IdentityMatches(identity, dependencies.namespace);
}

/** Require every independently reviewed workload coordinate to match fixed controller identity. */
function _IdentityMatches(identity: ReviewedAgentControllerIdentity, namespace: string): boolean
{
	return identity.username === `system:serviceaccount:${namespace}:${AGENT_CONTROLLER_SERVICE_ACCOUNT_NAME}`
		&& identity.namespace === namespace
		&& identity.serviceAccountName === AGENT_CONTROLLER_SERVICE_ACCOUNT_NAME
		&& identity.audiences.includes(AGENT_CONTROLLER_PROJECTED_TOKEN_AUDIENCE);
}

/** Read one unambiguous standard bearer credential. */
function _BearerValue(value: string | undefined): string | null
{
	if (!value) return null;
	return /^Bearer ([^\s,]+)$/u.exec(value)?.[1] ?? null;
}

/** Accept only an empty object for a server-owned claim request. */
function _IsEmptyObject(value: unknown): boolean
{
	return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

/** Parse the exact bounded assignment shape without accepting extra self-asserted fields. */
function _ParseAssignmentCommand(value: unknown): AgentControllerRunAttemptAssignmentCommand | null
{
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const body = value as Record<string, unknown>;
	const expectedKeys = ["attempt", "claimedAt", "deliveryCount", "expectedWorkloadProfile", "namespace", "runId", "serviceAccountName", "workloadUid"];
	if (Object.keys(body).length !== expectedKeys.length || !expectedKeys.every(key => key in body)) return null;
	if (typeof body["claimedAt"] !== "string" || typeof body["deliveryCount"] !== "number" || typeof body["runId"] !== "string" || typeof body["attempt"] !== "number" || typeof body["expectedWorkloadProfile"] !== "string" || typeof body["namespace"] !== "string" || typeof body["serviceAccountName"] !== "string" || typeof body["workloadUid"] !== "string") return null;
	return { claimedAt: body["claimedAt"], deliveryCount: body["deliveryCount"], runId: body["runId"], attempt: body["attempt"], expectedWorkloadProfile: body["expectedWorkloadProfile"], namespace: body["namespace"], serviceAccountName: body["serviceAccountName"], workloadUid: body["workloadUid"] };
}

/** Write one bounded, non-sensitive internal problem response. */
function _RespondProblem(response: Response, status: number, reason: string): void
{
	response.status(status).json({ error: reason });
}
