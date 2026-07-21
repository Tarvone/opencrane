import { ApprovalRequestState, type Prisma } from "@prisma/client";

import type { JsonValue } from "@opencrane/util";

import type { DecideDeferredToolRequestCommand, DecideDeferredToolRequestResult, DeferredToolDecision } from "./deferred-tool-approval.types.js";

/** Maps a decided approval state back to the stable decision literal, or null while still pending. */
function _decisionOf(state: ApprovalRequestState): DeferredToolDecision | null
{
	if (state === ApprovalRequestState.Approved) return "approved";
	if (state === ApprovalRequestState.Denied) return "denied";
	return null;
}

/**
 * Decide one pending deferred tool request inside a caller-owned transaction.
 *
 * This extends the existing {@link ApprovalRequest} lifecycle for the deferred-tool flow: a runtime
 * external action that requires approval reserves its ToolInvocation, pauses (DeferredToolRequests),
 * and a reviewer calls this to move the pending row to Approved or Denied. Approval records the
 * authorized DeferredToolResults and the single-use resume-token hash so exactly one `resume_attempt`
 * can feed the result back; denial closes the request. Deciding is idempotent — re-deciding the same
 * way returns `already_decided`, and any conflicting decision (different outcome, or a row that was
 * cancelled/expired out from under the reviewer) returns `conflict` rather than mutating a terminal
 * approval. The caller commits this in the same transaction that transitions the owning run state.
 *
 * @param transaction - Prisma transaction already holding the owning run's approval fence.
 * @param command - Exact pending request, reviewer decision, and trusted instant.
 * @returns The authorized deferred result on approval, a denial, an idempotent replay, or a conflict.
 */
export async function __DecideDeferredToolRequest(transaction: Prisma.TransactionClient, command: DecideDeferredToolRequestCommand): Promise<DecideDeferredToolRequestResult>
{
	// 1. Lock and reload the exact approval row bound to the run attempt before any state change.
	const approval = await transaction.approvalRequest.findUnique({ where: { id: command.approvalRequestId } });
	if (approval === null || approval.runId !== command.runId || approval.attempt !== command.attempt || approval.toolInvocationRowId === null) return { outcome: "conflict" };

	// 2. A previously decided request replays idempotently or conflicts on a differing outcome.
	const priorDecision = _decisionOf(approval.state);
	if (priorDecision !== null) return priorDecision === command.decision ? { outcome: "already_decided", decision: priorDecision } : { outcome: "conflict" };
	if (approval.state !== ApprovalRequestState.Pending) return { outcome: "conflict" };

	// 3. Deny by closing the pending row; no result and no resume token are recorded.
	if (command.decision === "denied")
	{
		const denied = await transaction.approvalRequest.updateMany({
			where: { id: command.approvalRequestId, state: ApprovalRequestState.Pending },
			data: { state: ApprovalRequestState.Denied, decidedAt: command.now, decidedBy: command.decidedBy },
		});
		return denied.count === 1 ? { outcome: "denied" } : { outcome: "conflict" };
	}

	// 4. Approve atomically, recording the authorized deferred result and single-use resume-token hash.
	const deferredToolResult: JsonValue = command.deferredToolResult ?? null;
	const approved = await transaction.approvalRequest.updateMany({
		where: { id: command.approvalRequestId, state: ApprovalRequestState.Pending },
		data: {
			state: ApprovalRequestState.Approved,
			decidedAt: command.now,
			decidedBy: command.decidedBy,
			resumeTokenHash: command.resumeTokenHash ?? null,
			deferredToolResult: deferredToolResult as unknown as Prisma.InputJsonValue,
		},
	});
	return approved.count === 1 ? { outcome: "approved", deferredToolResult } : { outcome: "conflict" };
}
