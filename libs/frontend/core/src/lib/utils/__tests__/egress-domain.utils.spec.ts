import { describe, expect, it } from "vitest";

import { ScopeLevel } from "../../models/scope.types.js";
import { DATA_NETWORK_DATASETS_FIXTURE, EGRESS_SUCCESS_MUTATION_RESULT_FIXTURE, MockEgressMutation } from "../../data/__test__/data-network.fixtures.js";
import { _ValidateEgressDomain } from "../egress-domain.utils.js";

describe("_ValidateEgressDomain", function egressDomainValidationSuite(): void
{
	it("normalizes exact and leading-wildcard hosts", function validHosts(): void
	{
		expect(_ValidateEgressDomain("API.Example.COM", [])).toEqual({ normalizedDomain: "api.example.com", error: null });
		expect(_ValidateEgressDomain("*.Example.com", [])).toEqual({ normalizedDomain: "*.example.com", error: null });
	});

	it("rejects schemes, paths, ports, whitespace, misplaced wildcards, and invalid labels", function invalidHosts(): void
	{
		const candidates = ["https://api.example.com", "api.example.com/path", "api.example.com:443", " api.example.com", "api .example.com", "api.*.example.com", "-api.example.com", "localhost"];
		for (const candidate of candidates)
		{
			expect(_ValidateEgressDomain(candidate, []).normalizedDomain).toBeNull();
		}
	});

	it("rejects case-insensitive duplicates without conflating exact and wildcard hosts", function duplicateHosts(): void
	{
		expect(_ValidateEgressDomain("API.EXAMPLE.COM", ["api.example.com"]).error).toBe("This domain is already allowlisted.");
		expect(_ValidateEgressDomain("*.example.com", ["api.example.com"]).normalizedDomain).toBe("*.example.com");
	});
});

describe("DATA_NETWORK_DATASETS_FIXTURE", function dataNetworkDatasetProjectionSuite(): void
{
	it("projects the handoff rows from the existing Cognee source", function projectedRows(): void
	{
		expect(DATA_NETWORK_DATASETS_FIXTURE).toEqual([
			{ id: "ds-org", name: "Company knowledge base", graph: "Cognee graph", nodes: 1240, scope: ScopeLevel.Org, active: true },
			{ id: "ds-dept", name: "Team playbooks", graph: "Cognee graph", nodes: 340, scope: ScopeLevel.Dept, active: true }
		]);
	});
});

describe("MockEgressMutation", function mockEgressMutationSuite(): void
{
	it("repeats the default success without an artificial addition limit", async function repeatableSuccess(): Promise<void>
	{
		const mutation = new MockEgressMutation([], EGRESS_SUCCESS_MUTATION_RESULT_FIXTURE);
		for (let index = 0; index < 20; index += 1)
		{
			expect((await mutation.mutate(`api-${index}.example.com`)).outcome).toBe("success");
		}
		expect(mutation.callCount).toBe(20);
	});
});
