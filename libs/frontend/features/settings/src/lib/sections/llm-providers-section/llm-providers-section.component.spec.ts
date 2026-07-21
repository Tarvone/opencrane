// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ɵresolveComponentResources, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LlmProviderId } from "@opencrane/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { MockSettingsGateway } from "@opencrane/state/gateways/testing";
import { DestructiveConfirmationComponent } from "@opencrane/elements/ui";
import { LlmProvidersSectionComponent } from "./llm-providers-section.component.js";

/** Resolve the section and shared dialog resources used by this standalone component. */
function _componentResource(resourceUrl: string): string
{
	const file = resourceUrl.replace(/^\.\//, "");
	const folder = file.startsWith("llm-providers-section") ? "src/lib/sections/llm-providers-section" : `../../elements/ui/src/lib/components/${file.split(".component")[0]}`;
	return readFileSync(resolve(process.cwd(), folder, file), "utf8");
}

/** Render the fixture-backed LLM Providers section. */
async function _render(): Promise<ComponentFixture<LlmProvidersSectionComponent>>
{
	TestBed.configureTestingModule({ 
        imports: [LlmProvidersSectionComponent],
        providers: [
            { provide: SETTINGS_GATEWAY, useClass: MockSettingsGateway },
            { provide: ActiveTenantStore, useValue: { tenant: signal("elewa-default") } }
        ]
    });
	
	// Register signal inputs for JIT compiler
	TestBed.overrideComponent(DestructiveConfirmationComponent, {
		remove: { 
			templateUrl: './destructive-confirmation.component.html',
			styleUrl: './destructive-confirmation.component.scss'
		},
		add: {
			template: ''
		}
	});
	
	const fixture = TestBed.createComponent(LlmProvidersSectionComponent);
	fixture.detectChanges();
	await fixture.whenStable();
	fixture.detectChanges();
	return fixture;
}



beforeAll(async function prepareAngularLlmProviders(): Promise<void>
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
	await ɵresolveComponentResources(async function loadComponentResource(resourceUrl: string): Promise<string>
	{
		const resource = _componentResource(resourceUrl);
		return resourceUrl.endsWith(".scss") ? compileString(resource).css : resource;
	});
});

afterEach(function resetLlmProvidersTestBed(): void
{
	TestBed.resetTestingModule();
});

afterAll(function releaseAngularLlmProviders(): void
{
	TestBed.resetTestEnvironment();
});

describe("LlmProvidersSectionComponent", function llmProvidersSectionSuite(): void
{
	it("renders the handoff provider list and complete routing flow without secret-shaped fragments", async function rendersHandoff(): Promise<void>
	{
		const root = (await _render()).nativeElement as HTMLElement;

		expect(root.querySelector("h2")?.textContent?.trim()).toBe("LLM Providers");
		expect(Array.from(root.querySelectorAll(".wo-llm-providers__provider-row h4")).map(function text(node): string { return node.textContent?.trim() ?? ""; })).toEqual(["Anthropic", "Google AI", "OpenAI"]);
		expect(Array.from(root.querySelectorAll(".wo-llm-providers__provider-row > p")).map(function text(node): string { return node.textContent?.trim() ?? ""; })).toEqual(["claude-opus-4-7 · claude-sonnet-4-6 · claude-haiku-4-5", "gemini-2.0-flash · gemini-1.5-pro", "gpt-4o · gpt-4o-mini"]);
		expect(Array.from(root.querySelectorAll(".wo-llm-providers__key-state")).map(function text(node): string { return node.textContent?.trim() ?? ""; })).toEqual(["Encrypted key", "Encrypted key", "Encrypted key"]);
		expect(root.querySelector(".wo-llm-providers__flow")?.textContent).toContain("Prompt analysis model");
		expect(root.querySelectorAll(".wo-llm-providers__route-row")).toHaveLength(6);
		expect(Array.from(root.querySelectorAll(".wo-llm-providers__route-row h5")).map(function text(node): string { return node.textContent?.trim() ?? ""; })).toEqual(["Simple / factual lookup", "Complex reasoning", "Code & technical", "Creative & writing", "Confidential / sensitive", "Long context"]);
		expect(Array.from(root.querySelectorAll(".wo-llm-providers__route-row select")).map(function value(node): string { return (node as HTMLSelectElement).value; })).toEqual(["claude-haiku-4-5", "claude-opus-4-7", "claude-sonnet-4-6", "claude-sonnet-4-6", "azure · in-region", "gemini-1.5-pro"]);
		expect(root.innerHTML).not.toMatch(/sk-[A-Za-z0-9]|••|\*{4,}/);
	});

	it("matches the seven-provider add sub-page and clears transient input on selection and back", async function transientBackFlow(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		component.openAddPage();
		fixture.detectChanges();

		expect((fixture.nativeElement as HTMLElement).querySelectorAll(".wo-llm-providers__provider-option")).toHaveLength(7);
		component.selectProvider(LlmProviderId.Anthropic);
		component.keyDraft.set("temporary credential text");
		component.selectProvider(LlmProviderId.OpenAi);
		expect(component.keyDraft()).toBe("");
		component.keyDraft.set("another temporary value");
		component.closeAddPage();

		expect(component.addPageOpen()).toBe(false);
		expect(component.selectedProviderId()).toBeNull();
		expect(component.keyDraft()).toBe("");
	});

	it("exposes valid and invalid test outcomes and clears the key after successful save", async function testAndSave(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		component.openAddPage();
		component.selectProvider(LlmProviderId.Cohere);
		component.keyDraft.set("transient connection value");

		vi.spyOn(gateway, "testWorkspaceLlmProviderConnection").mockRejectedValue(new Error("Provider rejected this credential."));
		await component.testConnection();
		expect(component.connectionPhase()).toBe("invalid");
		expect(component.feedback()?.kind).toBe("error");

		vi.spyOn(gateway, "testWorkspaceLlmProviderConnection").mockResolvedValue();
		vi.spyOn(gateway, "addWorkspaceLlmProvider").mockResolvedValue({ id: LlmProviderId.Cohere } as any);
		vi.spyOn(gateway, "getWorkspaceLlmProviders").mockResolvedValue([
			...component.providers(),
			{ id: LlmProviderId.Cohere, name: "Cohere", models: "command-r" } as any
		]);
		await component.testConnection();
		await component.saveKey();
		await fixture.whenStable();
		fixture.detectChanges();

		expect(gateway.testWorkspaceLlmProviderConnection).toHaveBeenCalledTimes(2);
		expect(gateway.addWorkspaceLlmProvider).toHaveBeenCalledTimes(1);
		expect(component.keyDraft()).toBe("");
		expect(component.addPageOpen()).toBe(false);
		expect(component.providers().some(function cohere(row): boolean { return row.id === LlmProviderId.Cohere; })).toBe(true);
		expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain("transient connection value");
	});

	it("keeps a provider after a recoverable removal error and removes it after retry", async function confirmedRemoval(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		component.requestRemove(component.providers()[0]!, { currentTarget: null } as unknown as Event, document.createElement("button"));
		
		vi.spyOn(gateway, "removeWorkspaceLlmProvider").mockRejectedValue(new Error("Temporary removal failure."));
		await component.confirmRemove();

		expect(component.providers()).toHaveLength(3);
		expect(component.destructiveState()).toMatchObject({ phase: "error", message: "The provider key could not be removed. Try again." });

		vi.spyOn(gateway, "removeWorkspaceLlmProvider").mockResolvedValue({} as any);
		vi.spyOn(gateway, "getWorkspaceLlmProviders").mockResolvedValue(component.providers().slice(1));
		await component.confirmRemove();
		await fixture.whenStable();
		expect(component.providers()).toHaveLength(2);
		expect(component.removeTarget()).toBeNull();
	});

	it("changes the analysis model and adds, changes, and removes a category", async function routingMutations(): Promise<void>
	{
		const component = (await _render()).componentInstance;
		component.updateAnalysisModel({ target: { value: "gpt-4o-mini" } } as unknown as Event);
		component.addCategory();
		const added = component.routeCategories().at(-1)!;
		component.updateCategoryModel(added.id, { target: { value: "mistral-large-2" } } as unknown as Event);

		expect(component.analysisModel()).toBe("gpt-4o-mini");
		expect(component.routeCategories().at(-1)?.model).toBe("mistral-large-2");
		component.removeCategory(added.id);
		expect(component.routeCategories()).toHaveLength(6);
	});

	it("keeps added category identities unique after add, add, remove, and add", async function uniqueCategoryIds(): Promise<void>
	{
		const component = (await _render()).componentInstance;
		component.addCategory();
		component.addCategory();
		const firstAddedId = component.routeCategories()[6]!.id;
		component.removeCategory(firstAddedId);
		component.addCategory();
		const ids = component.routeCategories().map(function identity(row): string { return row.id; });

		expect(new Set(ids).size).toBe(ids.length);
	});

	it("passes the invoking Remove button to the shared focus-restoration contract", async function removeFocus(): Promise<void>
	{
		const component = (await _render()).componentInstance;
		const removeButton = document.createElement("button");
		const addProviderButton = document.createElement("button");
		component.requestRemove(component.providers()[0]!, { currentTarget: removeButton } as unknown as Event, addProviderButton);

		expect(component.removeFocusTarget()).toBe(removeButton);
		expect(component.removeSuccessFocusTarget()).toBe(addProviderButton);
		expect(component.removeTarget()?.id).toBe(component.providers()[0]?.id);
	});

	it("switches focus restoration to the surviving Add provider key control after removal", async function successfulRemoveFocus(): Promise<void>
	{
		const component = (await _render()).componentInstance;
		const removeButton = document.createElement("button");
		const addProviderButton = document.createElement("button");
		component.requestRemove(component.providers()[0]!, { currentTarget: removeButton } as unknown as Event, addProviderButton);
		await component.confirmRemove();

		expect(component.removeFocusTarget()).toBe(addProviderButton);
		expect(component.removeTarget()).toBeNull();
	});
});
