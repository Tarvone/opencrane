import { describe, expect, it } from "vitest";

import { __UnavailableMemoryGatewayClient, MemoryGatewayUnavailableError } from "../unavailable-memory-gateway-client.js";

describe("unavailable memory gateway client", function _suite()
{
	it("fails closed instead of returning an empty recall", async function _query()
	{
		const client = new __UnavailableMemoryGatewayClient();
		await expect(client.query({ siloId: "silo-1", subjectId: "subject-1", query: "what do I know", maxResults: 5 })).rejects.toBeInstanceOf(MemoryGatewayUnavailableError);
	});

	it("fails closed rather than pretending a correction landed", async function _correct()
	{
		const client = new __UnavailableMemoryGatewayClient();
		await expect(client.correct({ siloId: "silo-1", subjectId: "subject-1", factId: "fact-1", correctedContent: "corrected" })).rejects.toBeInstanceOf(MemoryGatewayUnavailableError);
	});

	it("fails closed rather than pretending a fact was forgotten", async function _forget()
	{
		const client = new __UnavailableMemoryGatewayClient();
		await expect(client.forget({ siloId: "silo-1", subjectId: "subject-1", factId: "fact-1" })).rejects.toBeInstanceOf(MemoryGatewayUnavailableError);
	});
});
