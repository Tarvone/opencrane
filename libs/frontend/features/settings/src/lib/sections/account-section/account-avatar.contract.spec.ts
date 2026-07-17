import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** Read one Account section source file for migration contract assertions. */
function _accountSource(fileName: string): string
{
	return readFileSync(resolve(import.meta.dirname, fileName), "utf8");
}

describe("Account avatar contract", function accountAvatarSuite(): void
{
	it("uses the shared semantic-token profile avatar without duplicate markup", function sharedProfileAvatar(): void
	{
		const template = _accountSource("account-section.component.html");
		const styles = _accountSource("account-section.component.scss");
		const component = _accountSource("account-section.component.ts");

		expect(template).toContain("<wo-avatar-circle");
		expect(template).toContain("size=\"profile\"");
		expect(template).toContain("color=\"var(--oc-teal)\"");
		expect(template).not.toContain("wo-account__avatar\"");
		expect(styles).not.toContain("&__avatar {");
		expect(component).toContain("AvatarCircleComponent");
	});
});
