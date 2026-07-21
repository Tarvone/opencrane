import { describe, expect, it } from "vitest";

import { CapabilityAccessKind, CapabilityCollection, CapabilityIntegrationKind } from "@opencrane/core";
import { CAPABILITIES_FIXTURE } from "./capabilities.fixtures.js";

describe("Workspace Skills capability fixtures", function capabilityFixturesSuite(): void
{
	it("preserves the authoritative collection and capability order", function fixtureOrder(): void
	{
		expect(CAPABILITIES_FIXTURE.map(function collection(item): CapabilityCollection { return item.collection; })).toEqual([
			...Array<CapabilityCollection>(7).fill(CapabilityCollection.Shared),
			CapabilityCollection.Personal,
			...Array<CapabilityCollection>(3).fill(CapabilityCollection.Available)
		]);
		expect(CAPABILITIES_FIXTURE.map(function names(item): string { return item.name; })).toEqual([
			"Develop proposals",
			"Develop department SOPs",
			"Skill builder",
			"Campaign planner",
			"SEO audit",
			"Retainer pricing",
			"Sprint reporter",
			"Meeting debriefs",
			"Competitor tracker",
			"Invoice drafting",
			"Contract clause finder"
		]);
	});

	it("keeps access scopes and integrations as distinct typed badges", function fixtureTags(): void
	{
		const integrations = CAPABILITIES_FIXTURE.flatMap(function items(item) { return item.integrationList; });
		const access = CAPABILITIES_FIXTURE.flatMap(function items(item) { return item.accessList; });

		expect(integrations.filter(function mcps(tag): boolean { return tag.kind === CapabilityIntegrationKind.Mcp; }).map(function labels(tag): string { return tag.label; })).toEqual(["Ahrefs MCP", "Odoo MCP", "Odoo MCP"]);
		expect(integrations.filter(function tools(tag): boolean { return tag.kind === CapabilityIntegrationKind.Tool; }).map(function labels(tag): string { return tag.label; })).toEqual(["GitHub"]);
		expect(access.filter(function departments(tag): boolean { return tag.kind === CapabilityAccessKind.Department; }).map(function labels(tag): string { return tag.label; })).toEqual(["Marketing", "Marketing", "Engineering", "Business Development"]);
		expect(access.filter(function teams(tag): boolean { return tag.kind === CapabilityAccessKind.Team; }).map(function labels(tag): string { return tag.label; })).toEqual(["Frontend"]);
	});
});
