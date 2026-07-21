// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ɵresolveComponentResources, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { MockSettingsGateway } from "@opencrane/state/gateways/testing";
import { DataNetworkSectionComponent } from "./data-network-section.component.js";

/** Resolve an external Data & Network template or stylesheet. */
function _componentResource(resourceUrl: string): string
{
	return readFileSync(resolve(process.cwd(), "src/lib/sections/data-network-section", resourceUrl.replace(/^\.\//, "")), "utf8");
}

/** Render the fixture-backed Data & Network section. */
async function _render(): Promise<ComponentFixture<DataNetworkSectionComponent>>
{
	TestBed.configureTestingModule({ 
        imports: [DataNetworkSectionComponent],
        providers: [
            { provide: SETTINGS_GATEWAY, useClass: MockSettingsGateway },
            { provide: ActiveTenantStore, useValue: { tenant: signal("elewa-default") } }
        ]
    });
	const fixture = TestBed.createComponent(DataNetworkSectionComponent);
	fixture.detectChanges();
	await fixture.whenStable();
	fixture.detectChanges();
	return fixture;
}

beforeAll(async function prepareAngularDataNetwork(): Promise<void>
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
	await ɵresolveComponentResources(async function loadComponentResource(resourceUrl: string): Promise<string>
	{
		const resource = _componentResource(resourceUrl);
		return resourceUrl.endsWith(".scss") ? compileString(resource).css : resource;
	});
});

afterEach(function resetDataNetworkTestBed(): void
{
	TestBed.resetTestingModule();
});

afterAll(function releaseAngularDataNetwork(): void
{
	TestBed.resetTestEnvironment();
});

describe("DataNetworkSectionComponent", function dataNetworkSectionSuite(): void
{
	it("renders sovereignty, Cognee projections, and explicit egress purposes from App.dc.html", async function rendersFixtures(): Promise<void>
	{
		const root = (await _render()).nativeElement as HTMLElement;

		expect(root.querySelector("h2")?.textContent?.trim()).toBe("Data & Network");
		expect(root.querySelector(".wo-data-network__boundary")?.textContent?.trim()).toBe("self-hosted · AES-256");
		expect(Array.from(root.querySelectorAll(".wo-data-network__dataset h4")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["Company knowledge base", "Team playbooks"]);
		expect(Array.from(root.querySelectorAll(".wo-data-network__dataset p")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["Cognee graph · 1,240 nodes · org scope", "Cognee graph · 340 nodes · dept scope"]);
		expect(Array.from(root.querySelectorAll(".wo-data-network__domain-row")).map(function text(element): string
		{
			return `${element.querySelector("code")?.textContent?.trim()} ${element.querySelector("span")?.textContent?.trim()}`;
		})).toEqual(["*.anthropic.com AI provider", "*.googleapis.com AI provider", "api.github.com Skill: GitHub"]);
	});

	it("opens a labelled inline form and reports invalid domain feedback", async function invalidForm(): Promise<void>
	{
		const fixture = await _render();
		const root = fixture.nativeElement as HTMLElement;
		(root.querySelector(".wo-data-network__add-row button") as HTMLButtonElement).click();
		fixture.detectChanges();

		expect(root.querySelector("form")?.getAttribute("aria-labelledby")).toBe("add-domain-title");
		fixture.componentInstance.domainDraft.set("https://bad.example.com/path");
		await fixture.componentInstance.addDomain();
		fixture.detectChanges();

		expect(root.querySelector("[role='alert']")?.textContent?.trim()).toBe("Enter a host without a scheme, port, path, query, or fragment.");
		expect(root.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
	});

	it("normalizes a successful addition and locks duplicate submissions while pending", async function successfulAdd(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		let resolveUpdate: any;
		vi.spyOn(gateway, "addWorkspaceEgressDomain").mockImplementation(() => new Promise(r => resolveUpdate = r));
		
		component.openAddForm();
		component.domainDraft.set("API.Example.COM");
		component.purposeDraft.set("Research source");

		const first = component.addDomain();
		const duplicate = component.addDomain();
		expect(component.pending()).toBe(true);
		expect(gateway.addWorkspaceEgressDomain).toHaveBeenCalledTimes(1);
		
		vi.spyOn(gateway, "getWorkspaceEgressDomains").mockResolvedValue([
			...component.domains(),
			{ domain: "api.example.com", purpose: "Research source", status: "active" }
		]);
		
		resolveUpdate();
		await Promise.all([first, duplicate]);
		fixture.detectChanges();
		await fixture.whenStable();

		expect(component.domains().at(-1)).toEqual({ domain: "api.example.com", purpose: "Research source", status: "active" });
		expect(component.addFormOpen()).toBe(false);
		expect(component.domainDraft()).toBe("");
		expect((fixture.nativeElement as HTMLElement).querySelector(".wo-data-network__feedback[role='status']")?.textContent).toContain("api.example.com added");
	});

	it("rejects case-insensitive duplicates before mutation", async function duplicateDomain(): Promise<void>
	{
		const component = (await _render()).componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		vi.spyOn(gateway, "addWorkspaceEgressDomain");
		
		component.domainDraft.set("*.ANTHROPIC.COM");

		await component.addDomain();

		expect(component.validationError()).toBe("This domain is already allowlisted.");
		expect(gateway.addWorkspaceEgressDomain).toHaveBeenCalledTimes(0);
	});

	it("preserves the draft and form after a recoverable mutation failure", async function recoverableFailure(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		vi.spyOn(gateway, "addWorkspaceEgressDomain").mockRejectedValue(new Error("Policy preview unavailable. Try again."));
		
		component.openAddForm();
		component.domainDraft.set("*.research.example.com");

		await component.addDomain();
		fixture.detectChanges();

		expect(component.addFormOpen()).toBe(true);
		expect(component.domainDraft()).toBe("*.research.example.com");
		expect(component.domains()).toHaveLength(3);
		expect(component.feedback()?.message).toBe("Policy preview unavailable. Try again.");
	});

	it("returns purpose and feedback to pristine state after cancel and reopen", async function pristineReopen(): Promise<void>
	{
		const component = (await _render()).componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		vi.spyOn(gateway, "addWorkspaceEgressDomain").mockRejectedValue(new Error("Temporary failure."));
		component.openAddForm();
		component.domainDraft.set("api.example.com");
		component.purposeDraft.set("Research source");
		await component.addDomain();

		component.cancelAddForm();
		component.openAddForm();

		expect(component.domainDraft()).toBe("");
		expect(component.purposeDraft()).toBe("AI provider");
		expect(component.feedback()).toBeNull();
		expect(component.validationError()).toBeNull();
	});
});
