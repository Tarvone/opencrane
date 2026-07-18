// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ɵresolveComponentResources } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { LlmProviderId, ProviderConnectionOutcome, ProviderConnectionResult, ProviderMutationOutcome, ProviderMutationResult, WorkspaceLlmProviderMutation } from "@opencrane/core";
import { LlmProvidersSectionComponent } from "./llm-providers-section.component.js";

/** Resolve the section and shared dialog resources used by this standalone component. */
function _componentResource(resourceUrl: string): string
{
	const file = resourceUrl.replace(/^\.\//, "");
	const folder = file.startsWith("llm-providers-section") ? "src/lib/sections/llm-providers-section" : `../../elements/ui/src/lib/components/${file.split(".component")[0]}`;
	return readFileSync(resolve(process.cwd(), folder, file), "utf8");
}

/** Render the fixture-backed LLM Providers section. */
function _render(): ComponentFixture<LlmProvidersSectionComponent>
{
	TestBed.configureTestingModule({ imports: [LlmProvidersSectionComponent] });
	const fixture = TestBed.createComponent(LlmProvidersSectionComponent);
	fixture.detectChanges();
	return fixture;
}

/** Controllable boundary that counts calls but intentionally never retains credential text. */
class TestProviderMutation implements WorkspaceLlmProviderMutation
{
	public testCalls = 0;
	public saveCalls = 0;
	public removeCalls = 0;
	public connectionResult: ProviderConnectionResult = { outcome: ProviderConnectionOutcome.Valid, message: "Connection successful." };
	public mutationResult: ProviderMutationResult = { outcome: ProviderMutationOutcome.Success, message: "Provider updated." };

	public async testConnection(_providerId: LlmProviderId, _apiKey: string): Promise<ProviderConnectionResult>
	{
		this.testCalls += 1;
		return this.connectionResult;
	}

	public async save(_providerId: LlmProviderId, _apiKey: string): Promise<ProviderMutationResult>
	{
		this.saveCalls += 1;
		return this.mutationResult;
	}

	public async remove(_providerId: LlmProviderId): Promise<ProviderMutationResult>
	{
		this.removeCalls += 1;
		return this.mutationResult;
	}
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
	it("renders the handoff provider list and complete routing flow without secret-shaped fragments", function rendersHandoff(): void
	{
		const root = _render().nativeElement as HTMLElement;

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

	it("matches the seven-provider add sub-page and clears transient input on selection and back", function transientBackFlow(): void
	{
		const fixture = _render();
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
		const fixture = _render();
		const component = fixture.componentInstance;
		const mutation = new TestProviderMutation();
		component.mutation = mutation;
		component.openAddPage();
		component.selectProvider(LlmProviderId.Cohere);
		component.keyDraft.set("transient connection value");

		mutation.connectionResult = { outcome: ProviderConnectionOutcome.Invalid, message: "Provider rejected this credential." };
		await component.testConnection();
		expect(component.connectionPhase()).toBe("invalid");
		expect(component.feedback()?.kind).toBe("error");

		mutation.connectionResult = { outcome: ProviderConnectionOutcome.Valid, message: "Connection successful." };
		await component.testConnection();
		await component.saveKey();
		fixture.detectChanges();

		expect(mutation.testCalls).toBe(2);
		expect(mutation.saveCalls).toBe(1);
		expect(component.keyDraft()).toBe("");
		expect(component.addPageOpen()).toBe(false);
		expect(component.providers().some(function cohere(row): boolean { return row.id === LlmProviderId.Cohere; })).toBe(true);
		expect((fixture.nativeElement as HTMLElement).innerHTML).not.toContain("transient connection value");
	});

	it("keeps a provider after a recoverable removal error and removes it after retry", async function confirmedRemoval(): Promise<void>
	{
		const component = _render().componentInstance;
		const mutation = new TestProviderMutation();
		component.mutation = mutation;
		component.requestRemove(component.providers()[0]!, { currentTarget: null } as unknown as Event, document.createElement("button"));
		mutation.mutationResult = { outcome: ProviderMutationOutcome.RecoverableError, message: "Temporary removal failure." };
		await component.confirmRemove();

		expect(component.providers()).toHaveLength(3);
		expect(component.destructiveState()).toMatchObject({ phase: "error", message: "Temporary removal failure." });

		mutation.mutationResult = { outcome: ProviderMutationOutcome.Success, message: "Provider key removed." };
		await component.confirmRemove();
		expect(component.providers()).toHaveLength(2);
		expect(component.removeTarget()).toBeNull();
	});

	it("changes the analysis model and adds, changes, and removes a category", function routingMutations(): void
	{
		const component = _render().componentInstance;
		component.updateAnalysisModel({ target: { value: "gpt-4o-mini" } } as unknown as Event);
		component.addCategory();
		const added = component.routeCategories().at(-1)!;
		component.updateCategoryModel(added.id, { target: { value: "mistral-large-2" } } as unknown as Event);

		expect(component.analysisModel()).toBe("gpt-4o-mini");
		expect(component.routeCategories().at(-1)?.model).toBe("mistral-large-2");
		component.removeCategory(added.id);
		expect(component.routeCategories()).toHaveLength(6);
	});

	it("keeps added category identities unique after add, add, remove, and add", function uniqueCategoryIds(): void
	{
		const component = _render().componentInstance;
		component.addCategory();
		component.addCategory();
		const firstAddedId = component.routeCategories()[6]!.id;
		component.removeCategory(firstAddedId);
		component.addCategory();
		const ids = component.routeCategories().map(function identity(row): string { return row.id; });

		expect(new Set(ids).size).toBe(ids.length);
	});

	it("passes the invoking Remove button to the shared focus-restoration contract", function removeFocus(): void
	{
		const component = _render().componentInstance;
		const removeButton = document.createElement("button");
		const addProviderButton = document.createElement("button");
		component.requestRemove(component.providers()[0]!, { currentTarget: removeButton } as unknown as Event, addProviderButton);

		expect(component.removeFocusTarget()).toBe(removeButton);
		expect(component.removeSuccessFocusTarget()).toBe(addProviderButton);
		expect(component.removeTarget()?.id).toBe(component.providers()[0]?.id);
	});

	it("switches focus restoration to the surviving Add provider key control after removal", async function successfulRemoveFocus(): Promise<void>
	{
		const component = _render().componentInstance;
		const removeButton = document.createElement("button");
		const addProviderButton = document.createElement("button");
		component.requestRemove(component.providers()[0]!, { currentTarget: removeButton } as unknown as Event, addProviderButton);
		await component.confirmRemove();

		expect(component.removeFocusTarget()).toBe(addProviderButton);
		expect(component.removeTarget()).toBeNull();
	});
});
