import { ApprovalRequestState, type Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { __DecideDeferredToolRequest } from "../deferred-tool-approval.js";

/** Build a transaction whose approvalRequest reads return the supplied row and writes report a count. */
function _transaction(row: unknown, updatedCount: number): { transaction: Prisma.TransactionClient; updateMany: ReturnType<typeof vi.fn> }
{
	const findUnique = vi.fn().mockResolvedValue(row);
	const updateMany = vi.fn().mockResolvedValue({ count: updatedCount });
	return { transaction: { approvalRequest: { findUnique, updateMany } } as unknown as Prisma.TransactionClient, updateMany };
}

/** A pending deferred-tool approval bound to a tool invocation row. */
function _pending(): unknown
{
	return { id: "approval-1", runId: "run-1", attempt: 2, toolInvocationRowId: "tool-1", state: ApprovalRequestState.Pending };
}

const NOW = new Date("2026-07-21T09:00:00.000Z");

describe("deferred tool approval authority", function _suite()
{
	it("approves and records the authorized deferred result and resume-token hash", async function _approve()
	{
		const { transaction, updateMany } = _transaction(_pending(), 1);
		const result = await __DecideDeferredToolRequest(transaction, { approvalRequestId: "approval-1", runId: "run-1", attempt: 2, decision: "approved", decidedBy: "reviewer-1", now: NOW, resumeTokenHash: "hash-1", deferredToolResult: { ok: true } });
		expect(result).toEqual({ outcome: "approved", deferredToolResult: { ok: true } });
		expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "approval-1", state: ApprovalRequestState.Pending }, data: expect.objectContaining({ state: ApprovalRequestState.Approved, resumeTokenHash: "hash-1" }) }));
	});

	it("denies by closing the pending request without a result", async function _deny()
	{
		const { transaction } = _transaction(_pending(), 1);
		const result = await __DecideDeferredToolRequest(transaction, { approvalRequestId: "approval-1", runId: "run-1", attempt: 2, decision: "denied", decidedBy: "reviewer-1", now: NOW });
		expect(result).toEqual({ outcome: "denied" });
	});

	it("replays an identical decision idempotently", async function _idempotent()
	{
		const { transaction, updateMany } = _transaction({ ..._pending() as object, state: ApprovalRequestState.Approved }, 0);
		const result = await __DecideDeferredToolRequest(transaction, { approvalRequestId: "approval-1", runId: "run-1", attempt: 2, decision: "approved", decidedBy: "reviewer-1", now: NOW });
		expect(result).toEqual({ outcome: "already_decided", decision: "approved" });
		expect(updateMany).not.toHaveBeenCalled();
	});

	it("conflicts when re-decided the other way", async function _conflict()
	{
		const { transaction } = _transaction({ ..._pending() as object, state: ApprovalRequestState.Approved }, 0);
		const result = await __DecideDeferredToolRequest(transaction, { approvalRequestId: "approval-1", runId: "run-1", attempt: 2, decision: "denied", decidedBy: "reviewer-1", now: NOW });
		expect(result).toEqual({ outcome: "conflict" });
	});

	it("conflicts on a row that is not a deferred-tool approval", async function _notTool()
	{
		const { transaction } = _transaction({ ..._pending() as object, toolInvocationRowId: null }, 0);
		const result = await __DecideDeferredToolRequest(transaction, { approvalRequestId: "approval-1", runId: "run-1", attempt: 2, decision: "approved", decidedBy: "reviewer-1", now: NOW });
		expect(result).toEqual({ outcome: "conflict" });
	});
});
