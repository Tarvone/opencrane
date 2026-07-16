// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ɵresolveComponentResources } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CapabilityGroup } from "@opencrane/core";
import { SkillsSectionComponent } from "./skills-section.component.js";

/** Resolve an external Skills section template or stylesheet. */
function _componentResource(resourceUrl: string): string
{
	return readFileSync(resolve(process.cwd(), "src/lib/sections/skills-section", resourceUrl.replace(/^\.\//, "")), "utf8");
}

/** Render the fixture-backed Skills section. */
function _render(): ComponentFixture<SkillsSectionComponent>
{
	TestBed.configureTestingModule({ imports: [SkillsSectionComponent] });
	const fixture = TestBed.createComponent(SkillsSectionComponent);
	fixture.detectChanges();
	return fixture;
}

beforeAll(async function prepareAngularSkills(): Promise<void>
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
	await ɵresolveComponentResources(async function loadComponentResource(resourceUrl: string): Promise<string>
	{
		const resource = _componentResource(resourceUrl);
		return resourceUrl.endsWith(".scss") ? compileString(resource).css : resource;
	});
});

afterEach(function resetSkillsTestBed(): void
{
	TestBed.resetTestingModule();
});

afterAll(function releaseAngularSkills(): void
{
	TestBed.resetTestEnvironment();
});

describe("SkillsSectionComponent", function skillsSectionSuite(): void
{
	it("renders the App.dc.html heading, ordered scopes, and capability fixtures", function rendersFixtures(): void
	{
		const fixture = _render();
		const root = fixture.nativeElement as HTMLElement;

		expect(root.querySelector("h2")?.textContent?.trim()).toBe("Skills");
		expect(root.querySelector(".wo-skills__subtitle")?.textContent?.trim()).toBe("What your agents know how to do, by scope.");
		expect(Array.from(root.querySelectorAll(".wo-skills__scope")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["Organisation", "Departments", "Teams", "Personal"]);
		expect(Array.from(root.querySelectorAll(".wo-skills__name")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual([
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

	it("distinguishes MCP, tool, and department tags", function rendersTagKinds(): void
	{
		const root = _render().nativeElement as HTMLElement;
		const labels = function labels(selector: string): string[]
		{
			return Array.from(root.querySelectorAll(selector)).map(function text(element): string { return element.textContent?.trim() ?? ""; });
		};

		expect(labels(".wo-skills__tag--mcp")).toEqual(["Ahrefs MCP", "Odoo MCP", "Odoo MCP"]);
		expect(labels(".wo-skills__tag--tool")).toEqual(["GitHub"]);
		expect(labels(".wo-skills__tag--department")).toContain("Engineering · Frontend");
		expect(labels(".wo-skills__tag--department")).toContain("Only you");
	});

	it("renders every unavailable kebab as a semantic disabled button", function rendersDisabledMenus(): void
	{
		const buttons = Array.from((_render().nativeElement as HTMLElement).querySelectorAll(".wo-skills__menu")) as HTMLButtonElement[];

		expect(buttons).toHaveLength(8);
		expect(buttons.every(function nativeButton(button): boolean { return button instanceof HTMLButtonElement; })).toBe(true);
		expect(buttons.every(function disabled(button): boolean { return button.disabled; })).toBe(true);
		expect(buttons[0]?.getAttribute("aria-label")).toBe("More actions for Develop proposals (not available)");
	});

	it("keeps an empty scope labelled and visible", function rendersEmptyGroup(): void
	{
		const fixture = _render();
		const groups: readonly CapabilityGroup[] = [{ id: "personal", scope: "Personal", items: [] }];
		fixture.componentInstance.groups.set(groups);
		fixture.detectChanges();

		const root = fixture.nativeElement as HTMLElement;
		expect(root.querySelector(".wo-skills__scope")?.textContent?.trim()).toBe("Personal");
		expect(root.querySelector(".wo-skills__empty")?.textContent?.trim()).toBe("No capabilities in this scope.");
		expect(root.querySelectorAll(".wo-skills__capability")).toHaveLength(0);
	});
});
