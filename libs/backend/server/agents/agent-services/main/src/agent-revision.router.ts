import { Router, type Request, type Response } from "express";

import { __AdmitManagedRunNow, __ChangeAgentServiceState, __CompareAgentRevisions, __CreateManagedAgentService, __ReadAgentServiceHistory, __RestoreAgentRevision, __ReviseAgentRevision } from "./agent-revision-lifecycle.js";
import type { AgentRevisionContent, AgentRevisionLifecycleDenial, AgentServiceLifecycleAction } from "./agent-revision-lifecycle.types.js";
import type { AgentServicesRouterDependencies, ManagementCaller } from "./agent-revision.router.types.js";
import { __PublishAgentRevision } from "./agent-publication.js";
import type { PublishAgentRevisionFailureReason } from "./agent-publication.types.js";

/** Legal observed states a caller may claim on a lifecycle transition. */
const _SERVICE_STATES = ["draft", "active", "paused", "retired"] as const;

/** Returns whether a value is a non-empty string. */
function _isNonEmptyString(value: unknown): value is string
{
	return typeof value === "string" && value.trim().length > 0;
}

/** Parses and validates the immutable executable content from a request body. */
function _parseContent(raw: unknown): AgentRevisionContent | null
{
	if (raw === null || typeof raw !== "object") return null;
	const body = raw as Record<string, unknown>;
	const budget = body.budget as Record<string, unknown> | undefined;
	if (!_isNonEmptyString(body.promptPolicyVersion) || !_isNonEmptyString(body.modelPolicyId) || budget === undefined || typeof budget !== "object") return null;
	if (typeof budget.maxTurns !== "number" || typeof budget.maxTokens !== "number" || typeof budget.maxDurationMs !== "number") return null;
	const personaRevisionId = body.personaRevisionId === undefined || body.personaRevisionId === null ? null : body.personaRevisionId;
	if (personaRevisionId !== null && !_isNonEmptyString(personaRevisionId)) return null;
	const skills = _parseSkills(body.skills);
	const integrationAssignments = _parseIntegrations(body.integrationAssignments);
	const scopeAttachments = _parseScopeAttachments(body.scopeAttachments);
	if (skills === null || integrationAssignments === null || scopeAttachments === null) return null;
	return { promptPolicyVersion: body.promptPolicyVersion, personaRevisionId, modelPolicyId: body.modelPolicyId, budget: { maxTurns: budget.maxTurns, maxTokens: budget.maxTokens, maxDurationMs: budget.maxDurationMs }, skills, integrationAssignments, scopeAttachments };
}

/** Parses the optional skill-reference array. */
function _parseSkills(raw: unknown): AgentRevisionContent["skills"] | null
{
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) return null;
	const skills = raw.map(function _skill(entry) { const item = entry as Record<string, unknown>; return _isNonEmptyString(item?.skillId) && _isNonEmptyString(item?.revisionId) ? { skillId: item.skillId, revisionId: item.revisionId } : null; });
	return skills.some(skill => skill === null) ? null : (skills as AgentRevisionContent["skills"]);
}

/** Parses the optional integration-assignment array. */
function _parseIntegrations(raw: unknown): AgentRevisionContent["integrationAssignments"] | null
{
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) return null;
	const assignments = raw.map(function _assignment(entry)
	{
		const item = entry as Record<string, unknown>;
		if (!_isNonEmptyString(item?.integrationId) || !_isNonEmptyString(item?.custodyReferenceId) || !Array.isArray(item?.allowedTools) || !item.allowedTools.every(_isNonEmptyString)) return null;
		return { integrationId: item.integrationId, custodyReferenceId: item.custodyReferenceId, allowedTools: item.allowedTools as string[] };
	});
	return assignments.some(assignment => assignment === null) ? null : (assignments as AgentRevisionContent["integrationAssignments"]);
}

/**
 * Parses the optional revision-scoped scope-attachment array against the canonical vocabulary.
 *
 * Slice 5 only shape-validates the `{ scope, subjectType, subjectId }` triple; attachments are
 * silo-bounded (every read/write is scoped to the caller's silo) and org-admin-gated. Validating
 * the caller's authority over each attached scope — and the runtime intersection so a stored
 * attachment grants nothing beyond the agent's actual effective grants — lands in slice 6 (#332),
 * which introduces the per-scope attach-authority and effective-access enforcement paths.
 */
function _parseScopeAttachments(raw: unknown): AgentRevisionContent["scopeAttachments"] | null
{
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) return null;
	const scopes = new Set(["org", "department", "team", "project", "personal"]);
	const subjectTypes = new Set(["group", "tenant", "user"]);
	const attachments = raw.map(function _attachment(entry)
	{
		const item = entry as Record<string, unknown>;
		if (typeof item?.scope !== "string" || !scopes.has(item.scope) || typeof item?.subjectType !== "string" || !subjectTypes.has(item.subjectType) || !_isNonEmptyString(item?.subjectId)) return null;
		return { scope: item.scope as AgentRevisionContent["scopeAttachments"][number]["scope"], subjectType: item.subjectType as AgentRevisionContent["scopeAttachments"][number]["subjectType"], subjectId: item.subjectId };
	});
	return attachments.some(attachment => attachment === null) ? null : (attachments as AgentRevisionContent["scopeAttachments"]);
}

/** Maps a definition-plane denial reason to a fail-closed HTTP status. */
function _denialStatus(reason: AgentRevisionLifecycleDenial): number
{
	switch (reason)
	{
		case "invalid_command": return 400;
		case "service_not_found": return 404;
		case "revision_not_found": return 404;
		case "revision_service_mismatch": return 409;
		case "service_retired": return 409;
		case "transition_not_allowed": return 409;
		case "service_not_runnable": return 409;
		case "run_admission_unavailable": return 503;
		default: return 400;
	}
}

/** Maps a publication denial reason to a fail-closed HTTP status. */
function _publishDenialStatus(reason: PublishAgentRevisionFailureReason): number
{
	switch (reason)
	{
		case "invalid_command": return 400;
		case "service_not_found": return 404;
		case "revision_not_found": return 404;
		case "service_retired": return 409;
		case "revision_service_mismatch": return 409;
		case "revision_not_draft": return 409;
		case "invalid_revision": return 422;
		case "publication_conflict": return 409;
		default: return 400;
	}
}

/**
 * Mount the authoritative managed-agent management API.
 *
 * Every capability is exposed here (the UI and parity client are just clients): create, revise,
 * compare, publish, restore, enable, pause, run-now, history, and retire. Mutations require the
 * organisation-admin role; reads require an authenticated caller. Publishing reuses the existing
 * compare-and-swap publication path, and every state change carries optimistic concurrency so two
 * administrators cannot silently overwrite each other. run-now records an admission on the shared
 * run substrate and never dispatches or executes anything.
 *
 * @param dependencies - Composition-root persistence, admission, caller, clock, and logging ports.
 * @returns The configured Express router.
 */
export function __CreateAgentServicesRouter(dependencies: AgentServicesRouterDependencies): Router
{
	const router = Router();
	const { lifecycle, publicationFor, runAdmission, resolveCaller, clock, logger } = dependencies;

	/** Resolves an org-admin caller, or sends the fail-closed 401/403 envelope. */
	function _requireAdmin(req: Request, res: Response): ManagementCaller | null
	{
		const caller = resolveCaller(req);
		if (caller === null) { res.status(401).json({ error: "Authentication required.", code: "UNAUTHORIZED" }); return null; }
		if (!caller.isOrgAdmin) { res.status(403).json({ error: "Organisation admin role required.", code: "FORBIDDEN_NOT_ORG_ADMIN" }); return null; }
		return caller;
	}

	/** Resolves an authenticated caller for read-only surfaces, or sends 401. */
	function _requireCaller(req: Request, res: Response): ManagementCaller | null
	{
		const caller = resolveCaller(req);
		if (caller === null) { res.status(401).json({ error: "Authentication required.", code: "UNAUTHORIZED" }); return null; }
		return caller;
	}

	router.post("/", async function _create(req: Request, res: Response)
	{
		try
		{
			const caller = _requireAdmin(req, res);
			if (caller === null) return;
			const body = (req.body ?? {}) as Record<string, unknown>;
			const content = _parseContent(body.content);
			if (!_isNonEmptyString(body.name) || !_isNonEmptyString(body.workloadProfile) || !_isNonEmptyString(body.changeMessage) || content === null) { res.status(400).json({ error: "name, workloadProfile, changeMessage, and valid content are required.", code: "VALIDATION_ERROR" }); return; }
			const result = await __CreateManagedAgentService(lifecycle, { siloId: caller.siloId, name: body.name, workloadProfile: body.workloadProfile, authoredBy: caller.subjectId, changeMessage: body.changeMessage, content }, clock.now().toISOString());
			if (result.outcome === "denied") { res.status(_denialStatus(result.reason)).json({ error: "Create denied.", code: result.reason.toUpperCase() }); return; }
			res.status(201).json({ service: result.service, revision: result.revision });
		}
		catch (error) { _fail(res, error, "create"); }
	});

	router.post("/:serviceId/revisions", async function _revise(req: Request, res: Response)
	{
		try
		{
			const caller = _requireAdmin(req, res);
			if (caller === null) return;
			const body = (req.body ?? {}) as Record<string, unknown>;
			const content = _parseContent(body.content);
			const expectedParentRevisionId = body.expectedParentRevisionId === undefined || body.expectedParentRevisionId === null ? null : body.expectedParentRevisionId;
			if (!_isNonEmptyString(body.changeMessage) || content === null || (expectedParentRevisionId !== null && !_isNonEmptyString(expectedParentRevisionId))) { res.status(400).json({ error: "changeMessage, valid content, and an expectedParentRevisionId are required.", code: "VALIDATION_ERROR" }); return; }
			const result = await __ReviseAgentRevision(lifecycle, { siloId: caller.siloId, agentServiceId: String(req.params.serviceId), expectedParentRevisionId: expectedParentRevisionId as string | null, authoredBy: caller.subjectId, changeMessage: body.changeMessage, content }, clock.now().toISOString());
			_sendAppend(res, result);
		}
		catch (error) { _fail(res, error, "revise"); }
	});

	router.post("/:serviceId/restore", async function _restore(req: Request, res: Response)
	{
		try
		{
			const caller = _requireAdmin(req, res);
			if (caller === null) return;
			const body = (req.body ?? {}) as Record<string, unknown>;
			const expectedParentRevisionId = body.expectedParentRevisionId === undefined || body.expectedParentRevisionId === null ? null : body.expectedParentRevisionId;
			if (!_isNonEmptyString(body.sourceRevisionId) || !_isNonEmptyString(body.changeMessage) || (expectedParentRevisionId !== null && !_isNonEmptyString(expectedParentRevisionId))) { res.status(400).json({ error: "sourceRevisionId, changeMessage, and an expectedParentRevisionId are required.", code: "VALIDATION_ERROR" }); return; }
			const result = await __RestoreAgentRevision(lifecycle, { siloId: caller.siloId, agentServiceId: String(req.params.serviceId), sourceRevisionId: body.sourceRevisionId, expectedParentRevisionId: expectedParentRevisionId as string | null, authoredBy: caller.subjectId, changeMessage: body.changeMessage }, clock.now().toISOString());
			_sendAppend(res, result);
		}
		catch (error) { _fail(res, error, "restore"); }
	});

	router.get("/:serviceId/compare", async function _compare(req: Request, res: Response)
	{
		try
		{
			const caller = _requireCaller(req, res);
			if (caller === null) return;
			const base = typeof req.query.base === "string" ? req.query.base : "";
			const target = typeof req.query.target === "string" ? req.query.target : "";
			const result = await __CompareAgentRevisions(lifecycle, caller.siloId, base, target);
			if (result.outcome === "denied") { res.status(_denialStatus(result.reason)).json({ error: "Compare denied.", code: result.reason.toUpperCase() }); return; }
			if (result.base.agentServiceId !== String(req.params.serviceId)) { res.status(404).json({ error: "Revisions do not belong to this service.", code: "REVISION_SERVICE_MISMATCH" }); return; }
			res.status(200).json({ base: result.base, target: result.target, diff: result.diff });
		}
		catch (error) { _fail(res, error, "compare"); }
	});

	router.post("/:serviceId/publish", async function _publish(req: Request, res: Response)
	{
		try
		{
			const caller = _requireAdmin(req, res);
			if (caller === null) return;
			const body = (req.body ?? {}) as Record<string, unknown>;
			const expectedActiveRevisionId = body.expectedActiveRevisionId === undefined || body.expectedActiveRevisionId === null ? null : body.expectedActiveRevisionId;
			if (!_isNonEmptyString(body.agentRevisionId) || (expectedActiveRevisionId !== null && !_isNonEmptyString(expectedActiveRevisionId))) { res.status(400).json({ error: "agentRevisionId and an expectedActiveRevisionId are required.", code: "VALIDATION_ERROR" }); return; }
			const result = await __PublishAgentRevision(publicationFor(caller), { siloId: caller.siloId, agentServiceId: String(req.params.serviceId), agentRevisionId: body.agentRevisionId, expectedActiveRevisionId: expectedActiveRevisionId as string | null, publishedAt: clock.now().toISOString() });
			if (result.outcome === "denied") { res.status(_publishDenialStatus(result.reason)).json({ error: "Publish denied.", code: result.reason.toUpperCase(), currentActiveRevisionId: result.currentActiveRevisionId ?? null }); return; }
			res.status(200).json({ service: result.service, revision: result.revision });
		}
		catch (error) { _fail(res, error, "publish"); }
	});

	_mountStateAction(router, "enable");
	_mountStateAction(router, "pause");
	_mountStateAction(router, "retire");

	router.post("/:serviceId/run-now", async function _runNow(req: Request, res: Response)
	{
		try
		{
			const caller = _requireAdmin(req, res);
			if (caller === null) return;
			const body = (req.body ?? {}) as Record<string, unknown>;
			if (!_isNonEmptyString(body.requestIdempotencyKey)) { res.status(400).json({ error: "requestIdempotencyKey is required.", code: "VALIDATION_ERROR" }); return; }
			const result = await __AdmitManagedRunNow(lifecycle, runAdmission, { agentServiceId: String(req.params.serviceId), siloId: caller.siloId, requestedBy: caller.subjectId, requestIdempotencyKey: body.requestIdempotencyKey });
			if (result.outcome === "denied") { res.status(_runDenialStatus(result.reason)).json({ error: "Run-now denied.", code: result.reason.toUpperCase() }); return; }
			res.status(result.outcome === "accepted" ? 202 : 200).json({ outcome: result.outcome, runId: result.runId });
		}
		catch (error) { _fail(res, error, "run-now"); }
	});

	router.get("/:serviceId/history", async function _history(req: Request, res: Response)
	{
		try
		{
			const caller = _requireCaller(req, res);
			if (caller === null) return;
			const serviceId = String(req.params.serviceId);
			// Silo-scoped existence guard: a service in another silo is a 404, not an empty history.
			if (await lifecycle.getService(serviceId, caller.siloId) === null) { res.status(404).json({ error: "Service not found.", code: "SERVICE_NOT_FOUND" }); return; }
			const runLimit = typeof req.query.runLimit === "string" && Number.isSafeInteger(Number(req.query.runLimit)) ? Number(req.query.runLimit) : 50;
			const history = await __ReadAgentServiceHistory(lifecycle, serviceId, caller.siloId, runLimit);
			res.status(200).json(history);
		}
		catch (error) { _fail(res, error, "history"); }
	});

	/** Mounts one optimistic-concurrency service state transition endpoint. */
	function _mountStateAction(mounted: Router, action: AgentServiceLifecycleAction): void
	{
		mounted.post(`/:serviceId/${action}`, async function _changeState(req: Request, res: Response)
		{
			try
			{
				const caller = _requireAdmin(req, res);
				if (caller === null) return;
				const body = (req.body ?? {}) as Record<string, unknown>;
				const expectedState = typeof body.expectedState === "string" ? body.expectedState : "";
				if (!(_SERVICE_STATES as readonly string[]).includes(expectedState)) { res.status(400).json({ error: "expectedState must be one of draft|active|paused|retired.", code: "VALIDATION_ERROR" }); return; }
				const result = await __ChangeAgentServiceState(lifecycle, { siloId: caller.siloId, agentServiceId: String(req.params.serviceId), expectedState: expectedState as typeof _SERVICE_STATES[number], action }, clock.now().toISOString());
				if (result.outcome === "conflict") { res.status(409).json({ error: "Service state changed concurrently.", code: "STATE_CONFLICT", currentState: result.currentState }); return; }
				if (result.outcome === "denied") { res.status(_denialStatus(result.reason)).json({ error: "State change denied.", code: result.reason.toUpperCase() }); return; }
				res.status(200).json({ service: result.service });
			}
			catch (error) { _fail(res, error, action); }
		});
	}

	/** Emits the shared append (revise/restore) result envelope. */
	function _sendAppend(res: Response, result: Awaited<ReturnType<typeof __ReviseAgentRevision>>): void
	{
		if (result.outcome === "conflict") { res.status(409).json({ error: "A newer revision exists; rebase on the current head.", code: "REVISION_CONFLICT", currentHeadRevisionId: result.currentHeadRevisionId }); return; }
		if (result.outcome === "denied") { res.status(_denialStatus(result.reason)).json({ error: "Revision denied.", code: result.reason.toUpperCase() }); return; }
		res.status(201).json({ revision: result.revision });
	}

	/** Logs an unexpected failure and returns the fail-closed 500 envelope. */
	function _fail(res: Response, error: unknown, action: string): void
	{
		logger.error({ err: error, action }, "managed agent management action failed");
		res.status(500).json({ error: "Internal error.", code: "INTERNAL_ERROR" });
	}

	return router;
}

/** Maps a run-now denial reason to a fail-closed HTTP status. */
function _runDenialStatus(reason: string): number
{
	if (reason === "service_not_found") return 404;
	if (reason === "service_not_runnable") return 409;
	if (reason === "run_admission_unavailable") return 503;
	return 400;
}
