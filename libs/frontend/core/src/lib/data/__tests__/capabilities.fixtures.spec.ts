import { describe, expect, it } from "vitest";

import { CapabilityIntegrationKind } from "../../models/capability.types.js";
import { CAPABILITY_GROUPS_FIXTURE } from "../__test__/capabilities.fixtures.js";

describe("Workspace Skills capability fixtures", function capabilityFixturesSuite(): void
{
	it("preserves the authoritative scope and capability order", function fixtureOrder(): void
	{
		expect(CAPABILITY_GROUPS_FIXTURE.map(function scope(group): string { return group.scope; })).toEqual(["Organisation", "Departments", "Teams", "Personal"]);
		expect(CAPABILITY_GROUPS_FIXTURE.flatMap(function names(group): string[] { return group.items.map(function name(item): string { return item.name; }); })).toEqual([
			"Develop proposals",
			"Develop department SOPs",
			"Skill builder",
			"Campaign planner",
			"SEO audit",
			"Retainer pricing",
			"Sprint reporter",
			"Meeting debriefs"
		]);
	});

	it("keeps MCP and direct-tool integrations distinct from department tags", function fixtureTags(): void
	{
		const integrations = CAPABILITY_GROUPS_FIXTURE.flatMap(function groups(group) { return group.items.flatMap(function items(item) { return item.mcpList; }); });
		const departments = CAPABILITY_GROUPS_FIXTURE.flatMap(function groups(group) { return group.items.flatMap(function items(item) { return item.deptList; }); });

		expect(integrations.filter(function mcps(tag): boolean { return tag.kind === CapabilityIntegrationKind.Mcp; }).map(function labels(tag): string { return tag.label; })).toEqual(["Ahrefs MCP", "Odoo MCP", "Odoo MCP"]);
		expect(integrations.filter(function tools(tag): boolean { return tag.kind === CapabilityIntegrationKind.Tool; }).map(function labels(tag): string { return tag.label; })).toEqual(["GitHub"]);
		expect(departments).toContain("Engineering · Frontend");
		expect(departments).toContain("Only you");
	});
});
