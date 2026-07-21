// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ɵresolveComponentResources } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { MockSettingsGateway } from "@opencrane/state/gateways/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { SkillsSectionComponent } from "./skills-section.component.js";

/** Resolve an external Skills section template or stylesheet. */
function _componentResource(resourceUrl: string): string
{
	return readFileSync(resolve(process.cwd(), "src/lib/sections/skills-section", resourceUrl.replace(/^\.\//, "")), "utf8");
}

async function _render(): Promise<ComponentFixture<SkillsSectionComponent>>
{
	TestBed.configureTestingModule({ 
		imports: [SkillsSectionComponent],
		providers: [
			{ provide: SETTINGS_GATEWAY, useValue: new MockSettingsGateway() },
			{ provide: ActiveTenantStore, useValue: { tenant: signal("elewa-default") } }
		]
	});
	const fixture = TestBed.createComponent(SkillsSectionComponent);
	fixture.detectChanges();
	await fixture.whenStable();
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
	it("renders the current handoff heading, ordered collections, and fixtures", async function rendersFixtures(): Promise<void>
	{
		const fixture = await _render();
		const root = fixture.nativeElement as HTMLElement;

		expect(root.querySelector("h2")?.textContent?.trim()).toBe("Skills");
		expect(root.querySelector(".wo-skills__header p")?.textContent?.trim()).toBe("What your agents know how to do. The Admin badge means you can manage the skill.");
		expect(Array.from(root.querySelectorAll(".wo-skills__collection h3")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["Shared", "Personal", "Available"]);
		expect(Array.from(root.querySelectorAll(".wo-skills__copy h4")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual([
			"Develop proposals", "Develop department SOPs", "Skill builder", "Campaign planner", "SEO audit", "Retainer pricing", "Sprint reporter", "Meeting debriefs", "Competitor tracker", "Invoice drafting", "Contract clause finder"
		]);
	});

	it("distinguishes admin, access, MCP, and direct-tool badges", async function rendersTagKinds(): Promise<void>
	{
		const fixture = await _render();
		const root = fixture.nativeElement as HTMLElement;
		const labels = function labels(selector: string): string[]
		{
			return Array.from(root.querySelectorAll(selector)).map(function text(element): string { return element.textContent?.trim() ?? ""; });
		};

		expect(labels(".wo-skills__tag--admin")).toHaveLength(6);
		expect(labels(".wo-skills__tag--organization")).toEqual(["Org-wide", "Org-wide", "Org-wide"]);
		expect(labels(".wo-skills__tag--mcp")).toEqual(["Ahrefs MCP", "Odoo MCP", "Odoo MCP"]);
		expect(labels(".wo-skills__tag--tool")).toEqual(["GitHub"]);
	});

	it("filters every collection case-insensitively by description and shows scoped empty states", async function filtersCatalogue(): Promise<void>
	{
		const fixture = await _render();
		const input = fixture.nativeElement.querySelector("input[type='search']") as HTMLInputElement;
		input.value = "LOGGED TIME";
		input.dispatchEvent(new Event("input"));
		fixture.detectChanges();

		const root = fixture.nativeElement as HTMLElement;
		expect(Array.from(root.querySelectorAll(".wo-skills__copy h4")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["Invoice drafting"]);
		expect(Array.from(root.querySelectorAll(".wo-skills__empty")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["No shared skills match your search.", "No personal skills match your search."]);

		input.value = "no matching skill";
		input.dispatchEvent(new Event("input"));
		fixture.detectChanges();

		expect(Array.from(root.querySelectorAll(".wo-skills__empty")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["No shared skills match your search.", "No personal skills match your search.", "No available skills match your search."]);
		expect(root.querySelectorAll(".wo-skills__card")).toHaveLength(0);
	});

	it("keeps mock-only actions semantic and unavailable", async function rendersDisabledActions(): Promise<void>
	{
		const fixture = await _render();
		const root = fixture.nativeElement as HTMLElement;
		const menus = Array.from(root.querySelectorAll(".wo-skills__menu")) as HTMLButtonElement[];
		const addButtons = Array.from(root.querySelectorAll(".wo-skills__add")) as HTMLButtonElement[];

		expect(menus).toHaveLength(8);
		expect(addButtons).toHaveLength(3);
		expect([...menus, ...addButtons].every(function disabled(button): boolean { return button.disabled; })).toBe(true);
		expect(addButtons.map(function labels(button): string { return button.textContent?.trim() ?? ""; })).toEqual(["+ Add", "+ Add", "+ Add"]);
	});
});
