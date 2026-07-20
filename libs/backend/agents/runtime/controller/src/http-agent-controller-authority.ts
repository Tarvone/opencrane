import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { ___DoWithTrace } from "@opencrane/observability";
import type { AgentControllerRunAttemptAssignmentCommand, AgentControllerRunAttemptAssignmentResult, AgentControllerRunAttemptClaim } from "@opencrane/contracts";

import type { AgentControllerAuthority, AgentControllerFetch, AgentControllerHttpAuthorityOptions, AgentControllerTokenReader } from "./agent-controller.types.js";

/** Maximum JSON response accepted from one internal controller authority call. */
const _MAX_RESPONSE_BYTES = 64 * 1024;

/** Stable internal claim route appended to the configured OpenCrane base URL. */
const _CLAIM_PATH = "/api/internal/agent-controller/run-attempts:claim";

/** Return whether an untrusted JSON value is a non-empty bounded identifier. */
function _IsIdentifier(value: unknown): value is string
{
	return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Return whether an untrusted JSON value is a positive safe integer. */
function _IsPositiveInteger(value: unknown): value is number
{
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Return whether an untrusted JSON value is a valid ISO instant. */
function _IsTime(value: unknown): value is string
{
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Return a plain object suitable for security-boundary parsing. */
function _AsObject(value: unknown): Record<string, unknown> | null
{
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Parse and bound one JSON response without trusting its content type alone. */
async function _ReadJson(response: Response): Promise<unknown>
{
	const text = await response.text();
	if (Buffer.byteLength(text, "utf8") > _MAX_RESPONSE_BYTES)
	{
		throw new Error("OpenCrane controller response exceeded the 64 KiB boundary");
	}
	try
	{
		return JSON.parse(text) as unknown;
	}
	catch
	{
		throw new Error("OpenCrane controller response was not valid JSON");
	}
}

/** Parse the exact desired-state projection returned by the claim endpoint. */
function _ParseClaim(value: unknown): AgentControllerRunAttemptClaim
{
	const root = _AsObject(value);
	const lease = _AsObject(root?.lease);
	const attempt = _AsObject(root?.attempt);
	if (!root || !lease || !attempt || !_IsIdentifier(lease.eventId) || !_IsTime(lease.claimedAt) || !_IsPositiveInteger(lease.deliveryCount) || !_IsTime(lease.expiresAt) || Date.parse(lease.claimedAt) >= Date.parse(lease.expiresAt) || !_IsIdentifier(attempt.runId) || !_IsPositiveInteger(attempt.attempt) || !_IsIdentifier(attempt.siloId) || !_IsIdentifier(attempt.agentServiceId) || !_IsIdentifier(attempt.agentRevisionId) || !_IsIdentifier(attempt.inputSnapshotDigest) || !_IsIdentifier(attempt.namespace) || !_IsIdentifier(attempt.workloadProfile))
	{
		throw new Error("OpenCrane returned a malformed controller claim");
	}
	return {
		lease: { eventId: lease.eventId, claimedAt: lease.claimedAt, deliveryCount: lease.deliveryCount, expiresAt: lease.expiresAt },
		attempt: { runId: attempt.runId, attempt: attempt.attempt, siloId: attempt.siloId, agentServiceId: attempt.agentServiceId, agentRevisionId: attempt.agentRevisionId, inputSnapshotDigest: attempt.inputSnapshotDigest, namespace: attempt.namespace, workloadProfile: attempt.workloadProfile },
	};
}

/** Parse an assignment result and bind it back to the exact submitted command. */
function _ParseAssignmentResult(value: unknown, command: AgentControllerRunAttemptAssignmentCommand): AgentControllerRunAttemptAssignmentResult
{
	const root = _AsObject(value);
	if (!root || (root.outcome !== "assigned" && root.outcome !== "idempotent") || root.runId !== command.runId || root.attempt !== command.attempt || root.workloadUid !== command.workloadUid)
	{
		throw new Error("OpenCrane returned a mismatched controller assignment result");
	}
	return { outcome: root.outcome, runId: command.runId, attempt: command.attempt, workloadUid: command.workloadUid };
}

/** Read the latest rotated projected token from its mounted file. */
function _CreateTokenReader(path: string): AgentControllerTokenReader
{
	return async function _readToken(): Promise<string>
	{
		const token = (await readFile(path, "utf8")).trim();
		if (token.length === 0)
		{
			throw new Error("projected agent-controller token is empty");
		}
		return token;
	};
}

/** Build headers for one authenticated JSON authority call. */
function _Headers(token: string): Headers
{
	const headers = new Headers();
	headers.set("authorization", `Bearer ${token}`);
	headers.set("content-type", "application/json");
	headers.set("accept", "application/json");
	return headers;
}

/** Combine process cancellation with the hard per-request timeout. */
function _RequestSignal(signal: AbortSignal, timeoutMilliseconds: number): AbortSignal
{
	return AbortSignal.any([signal, AbortSignal.timeout(timeoutMilliseconds)]);
}

/** Validate and normalize the internal OpenCrane origin. */
function _BaseUrl(value: string): URL
{
	const parsed = URL.parse(value);
	if (!parsed || parsed.protocol !== "http:" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" || parsed.username !== "" || parsed.password !== "")
	{
		throw new Error("OPENCRANE_INTERNAL_URL must be one in-cluster HTTP origin with no path or credentials");
	}
	return parsed;
}

/**
 * Create the projected-token-authenticated OpenCrane desired-state adapter.
 *
 * The token file is reread for every exchange to honour kubelet rotation. Responses are size-bounded
 * and rebound to the submitted run/attempt/UID before the controller may treat them as authority.
 * @param options - Internal URL, rotating token path, timeout, and optional test seams.
 * @returns An authority that claims attempts and commits only exact Job UIDs.
 */
export function __CreateHttpAgentControllerAuthority(options: AgentControllerHttpAuthorityOptions): AgentControllerAuthority
{
	const baseUrl = _BaseUrl(options.openCraneInternalUrl);
	if (!isAbsolute(options.tokenPath) || !Number.isSafeInteger(options.requestTimeoutMilliseconds) || options.requestTimeoutMilliseconds < 1_000 || options.requestTimeoutMilliseconds > 60_000)
	{
		throw new Error("agent controller HTTP authority requires an absolute token path and 1-60s timeout");
	}
	const fetchRequest: AgentControllerFetch = options.fetch ?? fetch;
	const readToken = options.readToken ?? _CreateTokenReader(options.tokenPath);

	return {
		async __Claim(signal: AbortSignal): Promise<AgentControllerRunAttemptClaim | null>
		{
			return ___DoWithTrace("agent_controller.attempt.claim", {}, async function _claim()
			{
				const token = await readToken();
				const response = await fetchRequest(new URL(_CLAIM_PATH, baseUrl), { method: "POST", headers: _Headers(token), body: "{}", signal: _RequestSignal(signal, options.requestTimeoutMilliseconds) });
				if (response.status === 204) return null;
				if (response.status !== 200) throw new Error(`OpenCrane controller claim failed with HTTP ${response.status}`);
				return _ParseClaim(await _ReadJson(response));
			});
		},
		async __CommitAssignment(eventId: string, command: AgentControllerRunAttemptAssignmentCommand, signal: AbortSignal): Promise<AgentControllerRunAttemptAssignmentResult>
		{
			return ___DoWithTrace("agent_controller.assignment.commit", { eventId, runId: command.runId, attempt: command.attempt, workloadUid: command.workloadUid }, async function _commit()
			{
				if (!_IsIdentifier(eventId)) throw new Error("agent controller assignment requires one valid event id");
				const token = await readToken();
				const path = `/api/internal/agent-controller/run-attempts/${encodeURIComponent(eventId)}/assignment`;
				const response = await fetchRequest(new URL(path, baseUrl), { method: "PUT", headers: _Headers(token), body: JSON.stringify(command), signal: _RequestSignal(signal, options.requestTimeoutMilliseconds) });
				if (response.status !== 200) throw new Error(`OpenCrane controller assignment failed with HTTP ${response.status}`);
				return _ParseAssignmentResult(await _ReadJson(response), command);
			});
		},
	};
}
