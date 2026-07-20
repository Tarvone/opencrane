import type { AgentControllerRunAttemptAssignmentCommand } from "@opencrane/contracts";
import { describe, expect, it } from "vitest";

import { __CreateHttpAgentControllerAuthority } from "../http-agent-controller-authority.js";
import type { AgentControllerFetch } from "../agent-controller.types.js";

/** One exact claim response returned by the OpenCrane authority. */
function _ClaimBody()
{
	return {
		lease: { eventId: "event/1", claimedAt: "2026-07-20T00:00:00.000Z", deliveryCount: 1, expiresAt: "2026-07-20T00:01:00.000Z" },
		attempt: { runId: "run-1", attempt: 1, siloId: "silo-1", agentServiceId: "service-1", agentRevisionId: "revision-1", inputSnapshotDigest: "sha256:snapshot", namespace: "silo-a", workloadProfile: "personal-default" },
	};
}

/** Exact assignment command echoed by the commit endpoint. */
function _Assignment(): AgentControllerRunAttemptAssignmentCommand
{
	return { claimedAt: "2026-07-20T00:00:00.000Z", deliveryCount: 1, runId: "run-1", attempt: 1, expectedWorkloadProfile: "personal-default", namespace: "silo-a", serviceAccountName: "agent-runtime-default", workloadUid: "job-uid" };
}

describe("agent-controller OpenCrane HTTP authority", function _Suite()
{
	it("claims and commits over the exact projected-token-authenticated routes", async function _CallsAuthority()
	{
		const requests: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
		const fetchRequest: AgentControllerFetch = async function _fetch(input, init)
		{
			requests.push({ url: String(input), init });
			if (String(input).endsWith("run-attempts:claim")) return new Response(JSON.stringify(_ClaimBody()), { status: 200 });
			return new Response(JSON.stringify({ outcome: "assigned", runId: "run-1", attempt: 1, workloadUid: "job-uid" }), { status: 200 });
		};
		const authority = __CreateHttpAgentControllerAuthority({ openCraneInternalUrl: "http://opencrane-server.silo-a.svc.cluster.local:3001", tokenPath: "/token", requestTimeoutMilliseconds: 5_000, fetch: fetchRequest, readToken: async function _token() { return "rotated-token"; } });

		expect(await authority.__Claim(new AbortController().signal)).toEqual(_ClaimBody());
		expect(await authority.__CommitAssignment("event/1", _Assignment(), new AbortController().signal)).toEqual({ outcome: "assigned", runId: "run-1", attempt: 1, workloadUid: "job-uid" });
		expect(requests.map(request => [request.init?.method, request.url])).toEqual([
			["POST", "http://opencrane-server.silo-a.svc.cluster.local:3001/api/internal/agent-controller/run-attempts:claim"],
			["PUT", "http://opencrane-server.silo-a.svc.cluster.local:3001/api/internal/agent-controller/run-attempts/event%2F1/assignment"],
		]);
		expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe("Bearer rotated-token");
		expect(requests[1]?.init?.body).toBe(JSON.stringify(_Assignment()));
	});

	it("treats 204 as idle and rejects malformed or mismatched authority data", async function _FailsClosed()
	{
		const idle = __CreateHttpAgentControllerAuthority({ openCraneInternalUrl: "http://opencrane-server.silo-a.svc.cluster.local:3001", tokenPath: "/token", requestTimeoutMilliseconds: 5_000, fetch: async function _idle() { return new Response(null, { status: 204 }); }, readToken: async function _token() { return "token"; } });
		expect(await idle.__Claim(new AbortController().signal)).toBeNull();

		const malformed = __CreateHttpAgentControllerAuthority({ openCraneInternalUrl: "http://opencrane-server.silo-a.svc.cluster.local:3001", tokenPath: "/token", requestTimeoutMilliseconds: 5_000, fetch: async function _malformed() { return new Response(JSON.stringify({ lease: {}, attempt: {} }), { status: 200 }); }, readToken: async function _token() { return "token"; } });
		await expect(malformed.__Claim(new AbortController().signal)).rejects.toThrow(/malformed controller claim/);

		const mismatched = __CreateHttpAgentControllerAuthority({ openCraneInternalUrl: "http://opencrane-server.silo-a.svc.cluster.local:3001", tokenPath: "/token", requestTimeoutMilliseconds: 5_000, fetch: async function _mismatched() { return new Response(JSON.stringify({ outcome: "assigned", runId: "other", attempt: 1, workloadUid: "job-uid" }), { status: 200 }); }, readToken: async function _token() { return "token"; } });
		await expect(mismatched.__CommitAssignment("event-1", _Assignment(), new AbortController().signal)).rejects.toThrow(/mismatched controller assignment/);
	});
});
