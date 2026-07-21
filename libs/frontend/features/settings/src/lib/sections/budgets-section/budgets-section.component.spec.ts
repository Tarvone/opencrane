// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { TestBed } from "@angular/core/testing";
import { ɵresolveComponentResources, signal } from "@angular/core";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";

import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { MockSettingsGateway } from "@opencrane/state/gateways/testing";
import { _CreateSettingsFormState, SettingsFormPhase, SettingsUnsavedNavigationConfirmation } from "@opencrane/core";

import { BudgetsSectionComponent } from "./budgets-section.component.js";

beforeAll(async function prepareAngular(): Promise<void>
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
	await ɵresolveComponentResources(async function loadComponentResource(resourceUrl: string): Promise<string>
	{
		const file = resourceUrl.replace(/^\.\//, "");
		const componentFolder = file.split(".component")[0];
		const folder = file.startsWith("budgets-section") ? "src/lib/sections/budgets-section" : `../../elements/ui/src/lib/components/${componentFolder}`;
		const resource = readFileSync(resolve(process.cwd(), folder, file), "utf8");
		return resourceUrl.endsWith(".scss") ? compileString(resource).css : resource;
	});
});

afterAll(function releaseAngular(): void
{
	TestBed.resetTestEnvironment();
});

/** Create the native-like number input event consumed by the component. */
function _limitEvent(value: string, valueAsNumber: number): Event
{
	return { target: { value, valueAsNumber } } as unknown as Event;
}

async function setupComponent() {
    const gateway = new MockSettingsGateway();
    TestBed.configureTestingModule({
        providers: [
            { provide: SETTINGS_GATEWAY, useValue: gateway },
            { provide: ActiveTenantStore, useValue: { tenant: signal("elewa-default") } }
        ]
    });
    const fixture = TestBed.createComponent(BudgetsSectionComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    return { component, gateway, fixture };
}

describe("Workspace Budgets component", function budgetsComponentSuite(): void
{
	it("edits totals and exposes invalid limits through shared form state", async function edits(): Promise<void>
	{
		const { component } = await setupComponent();
		component.editLimit("1", _limitEvent("200", 200));
		expect(component.formState().phase).toBe(SettingsFormPhase.Dirty);
		expect(component.totals()).toEqual({ spent: 273, allocated: 400 });

		component.editLimit("1", _limitEvent("-1", -1));
		expect(component.formState().phase).toBe(SettingsFormPhase.Invalid);
		expect(component.formState().validationErrors["1"]).toBeDefined();
	});

	it("locks duplicate submissions and resolves success", async function successfulSave(): Promise<void>
	{
		const { component, gateway } = await setupComponent();
		let resolveUpdate: any;
		vi.spyOn(gateway, "updateWorkspaceBudgetDraft").mockImplementation(() => new Promise(r => resolveUpdate = r));
		component.editLimit("2", _limitEvent("75", 75));
		const firstSave = component.submit();
		const secondSave = component.submit();
		expect(component.formState().phase).toBe(SettingsFormPhase.Pending);
		resolveUpdate(component.formState().draft);
		await Promise.all([firstSave, secondSave]);
		expect(component.formState().phase).toBe(SettingsFormPhase.Success);
	});

	it("preserves the captured draft after conflict and recoverable error", async function recovery(): Promise<void>
	{
		const { component, gateway } = await setupComponent();
		component.editLimit("3", _limitEvent("90", 90));
		const edited = structuredClone(component.formState().draft);
		vi.spyOn(gateway, "updateWorkspaceBudgetDraft").mockRejectedValue(new Error("Conflict"));
		await component.submit();
		expect(component.formState().phase).toBe(SettingsFormPhase.RecoverableError);
		expect(component.formState().draft).toEqual(edited);
		component.returnToEditing();
		vi.spyOn(gateway, "updateWorkspaceBudgetDraft").mockRejectedValue(new Error("Recoverable error"));
		await component.submit();
		expect(component.formState().phase).toBe(SettingsFormPhase.RecoverableError);
		expect(component.formState().draft).toEqual(edited);
	});

	it("confirms only unsafe navigation phases", async function navigation(): Promise<void>
	{
		const { component } = await setupComponent();
		let prompts = 0;
		const confirmation: SettingsUnsavedNavigationConfirmation = { confirmDiscardChanges: function confirm(): boolean { prompts += 1; return false; } };
		expect(component.canDeactivate(confirmation)).toBe(true);
		component.editLimit("4", _limitEvent("30", 30));
		expect(component.canDeactivate(confirmation)).toBe(false);
		expect(prompts).toBe(1);
	});
});
