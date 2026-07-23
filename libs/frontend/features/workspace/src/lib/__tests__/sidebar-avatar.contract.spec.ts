import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** Read the sidebar template as normalized markup for consumer-contract checks. */
function _sidebarTemplate(): string
{
	return readFileSync(resolve(process.cwd(), "src/lib/components/sidebar/sidebar.component.html"), "utf8").replace(/\s+/g, " ");
}

describe("Sidebar avatar contract", function sidebarAvatarSuite(): void
{
	it("uses the handoff color, geometry, and current-user accessible name", function avatarContract(): void
	{
		const template = _sidebarTemplate();

		expect(template).toContain("[accessibleName]=\"userName() || 'Current user'\"");
		expect(template).toContain("color=\"var(--oc-teal)\"");
		expect(template).toContain("size=\"large\"");
		expect(template).not.toMatch(/#[0-9a-fA-F]{3,6}/);
	});
});
