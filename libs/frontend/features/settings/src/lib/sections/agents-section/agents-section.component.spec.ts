// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ɵresolveComponentResources } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AgentSettingsMutation, AgentSettingsMutationKind, AgentSettingsMutationOutcome, AgentSettingsMutationResult, WorkspaceAgentTrigger } from "@opencrane/core";
import { AgentsSectionComponent } from "./agents-section.component.js";

/** Controllable mutation boundary that never retains supplied credential text. */
class TestAgentMutation implements AgentSettingsMutation
{
	/** Calls captured without credential arguments. */
	public readonly calls: { kind: AgentSettingsMutationKind; entityId: string }[] = [];

	/** Result returned by immediate operations. */
	public result: AgentSettingsMutationResult = { outcome: AgentSettingsMutationOutcome.Success, message: "Updated." };

	/** When true, the next operation remains pending until `complete` is called. */
	public delayed = false;

	/** Resolver for the currently delayed operation. */
	private _resolve: ((result: AgentSettingsMutationResult) => void) | null = null;

	/** Capture safe call metadata and return the configured outcome. */
	public mutate(kind: AgentSettingsMutationKind, entityId: string, _credential?: string): Promise<AgentSettingsMutationResult>
	{
		this.calls.push({ kind, entityId });
		if (!this.delayed) return Promise.resolve(this.result);
		const mutation = this;
		return new Promise<AgentSettingsMutationResult>(function delay(resolvePromise): void { mutation._resolve = resolvePromise; });
	}

	/** Resolve the outstanding delayed operation. */
	public complete(): void
	{
		this._resolve?.(this.result);
		this._resolve = null;
		this.delayed = false;
	}
}

/** Resolve external resources for the Agents section and shared confirmation dialog. */
function _componentResource(resourceUrl: string): string
{
	const file = resourceUrl.replace(/^\.\//, "");
	const componentFolder = file.split(".component")[0];
	const folder = file.startsWith("agents-section") ? "src/lib/sections/agents-section" : `../../elements/ui/src/lib/components/${componentFolder}`;
	return readFileSync(resolve(process.cwd(), folder, file), "utf8");
}

/** Render the fixture-backed Agents section. */
function _render(): ComponentFixture<AgentsSectionComponent>
{
	TestBed.configureTestingModule({ imports: [AgentsSectionComponent] });
	const fixture = TestBed.createComponent(AgentsSectionComponent);
	fixture.detectChanges();
	return fixture;
}

beforeAll(async function prepareAngularAgents(): Promise<void>
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
	await ɵresolveComponentResources(async function loadComponentResource(resourceUrl: string): Promise<string>
	{
		const resource = _componentResource(resourceUrl);
		return resourceUrl.endsWith(".scss") ? compileString(resource).css : resource;
	});
});

afterEach(function resetAgentsTestBed(): void
{
	TestBed.resetTestingModule();
});

afterAll(function releaseAngularAgents(): void
{
	TestBed.resetTestEnvironment();
});

describe("AgentsSectionComponent", function agentsSectionSuite(): void
{
	it("renders the App.dc.html agent catalogue and exact primary copy", function catalogue(): void
	{
		const root = _render().nativeElement as HTMLElement;

		expect(root.querySelector("h2")?.textContent?.trim()).toBe("Agents");
		expect(root.querySelector(".wo-agents__header p")?.textContent).toContain("Automations that watch information sources");
		expect(Array.from(root.querySelectorAll(".wo-agents__agent-name strong")).map(function text(node): string { return node.textContent?.trim() ?? ""; })).toEqual(["Scope reviewer", "Update indexer"]);
		expect(root.querySelectorAll(".wo-agents__agent-row")).toHaveLength(2);
		expect(root.querySelectorAll("[data-agent-icon]")).toHaveLength(2);
		expect(root.querySelector(".wo-agents__summary")?.textContent).toContain("WhatsApp indexer, Ticket indexer");
	});

	it("opens and saves the handoff editor through the deterministic boundary", async function editorSave(): Promise<void>
	{
		const fixture = _render();
		const component = fixture.componentInstance;
		component.openEditor("scope");
		component.nameDraft.set("Commercial scope reviewer");
		component.selectTrigger(WorkspaceAgentTrigger.Schedule);
		await component.saveAgent();
		fixture.detectChanges();

		expect(component.agents()[0]?.name).toBe("Commercial scope reviewer");
		expect(component.agents()[0]?.trigger).toBe(WorkspaceAgentTrigger.Schedule);
		expect(component.feedback()?.kind).toBe("success");
		expect((component.mutation as { callCount: number }).callCount).toBe(1);
		expect((fixture.nativeElement as HTMLElement).querySelectorAll(".wo-agents__runs > div")).toHaveLength(4);
		component.togglePrompt();
		fixture.detectChanges();
		expect((fixture.nativeElement as HTMLElement).querySelector("textarea[aria-label='Agent instructions']")).not.toBeNull();
	});

	it("keeps the submitted editor snapshot stable and locks duplicate saves", async function delayedEditorSave(): Promise<void>
	{
		const fixture = _render();
		const component = fixture.componentInstance;
		const mutation = new TestAgentMutation();
		mutation.delayed = true;
		component.mutation = mutation;
		component.openEditor("scope");
		component.nameDraft.set("Submitted name");
		const first = component.saveAgent();
		const duplicate = component.saveAgent();
		fixture.detectChanges();

		expect(mutation.calls).toHaveLength(1);
		expect(((fixture.nativeElement as HTMLElement).querySelector("[aria-label='Agent name']") as HTMLInputElement).disabled).toBe(true);
		component.updateTextDraft("name", { target: { value: "Late name" } } as unknown as Event);
		expect(component.nameDraft()).toBe("Submitted name");
		mutation.complete();
		await Promise.all([first, duplicate]);
		expect(component.selectedAgent()?.name).toBe("Submitted name");
	});

	it("creates a new draft and returns through the owned editor back control", function newAgentBack(): void
	{
		const fixture = _render();
		const component = fixture.componentInstance;
		component.newAgent();
		fixture.detectChanges();

		expect(component.view()).toBe("editor");
		expect(component.selectedAgent()?.name).toBe("New agent");
		expect(component.promptExpanded()).toBe(false);
		expect((fixture.nativeElement as HTMLElement).querySelector(".wo-agents__prompt-heading")?.textContent).toContain("Expand & edit");
		expect((fixture.nativeElement as HTMLElement).querySelector(".wo-agents__prompt textarea")).toBeNull();
		expect((fixture.nativeElement as HTMLElement).querySelector(".wo-agents__runs")).toBeNull();
		component.goBack();
		expect(component.view()).toBe("list");
		expect(component.selectedAgentId()).toBeNull();
	});

	it("locks credential editing while a connection test is pending", async function pendingCredentialLock(): Promise<void>
	{
		const fixture = _render();
		const component = fixture.componentInstance;
		const mutation = new TestAgentMutation();
		mutation.delayed = true;
		component.mutation = mutation;
		component.openEditor("scope");
		component.openAddChannel();
		component.selectChannelType("telegram");
		component.credentialDraft.set("credential A");
		const pending = component.testChannel();
		fixture.detectChanges();

		expect(((fixture.nativeElement as HTMLElement).querySelector("input[type='password']") as HTMLInputElement).disabled).toBe(true);
		component.updateCredential({ target: { value: "credential B" } } as unknown as Event);
		expect(component.credentialDraft()).toBe("credential A");
		mutation.complete();
		await pending;
		expect(component.connectionPhase()).toBe("valid");
	});

	it("keeps editor state on a recoverable save outcome", async function recoverableSave(): Promise<void>
	{
		const component = _render().componentInstance;
		const mutation = new TestAgentMutation();
		mutation.result = { outcome: AgentSettingsMutationOutcome.Conflict, message: "Agent changed elsewhere." };
		component.mutation = mutation;
		component.openEditor("scope");
		component.nameDraft.set("Unsaved conflict name");
		await component.saveAgent();

		expect(component.selectedAgent()?.name).toBe("Scope reviewer");
		expect(component.nameDraft()).toBe("Unsaved conflict name");
		expect(component.feedback()).toEqual({ kind: "error", message: "Agent changed elsewhere." });
	});

	it("represents invalid tests and recoverable add failures without losing input", async function channelFailures(): Promise<void>
	{
		const component = _render().componentInstance;
		const mutation = new TestAgentMutation();
		component.mutation = mutation;
		component.openEditor("scope");
		component.openAddChannel();
		component.selectChannelType("slack");
		component.credentialDraft.set("mounted input");
		mutation.result = { outcome: AgentSettingsMutationOutcome.Invalid, message: "Credential rejected." };
		await component.testChannel();

		expect(component.connectionPhase()).toBe("invalid");
		expect(component.feedback()?.message).toBe("Credential rejected.");
		mutation.result = { outcome: AgentSettingsMutationOutcome.RecoverableError, message: "Channel service unavailable." };
		await component.addChannel();
		expect(component.view()).toBe("add-channel");
		expect(component.credentialDraft()).toBe("mounted input");
		expect(component.channels()).toHaveLength(2);
	});

	it("clears transient channel credentials on selection, back, and destruction", function credentialLifetime(): void
	{
		const fixture = _render();
		const component = fixture.componentInstance;
		component.openEditor("scope");
		component.openAddChannel();
		component.selectChannelType("telegram");
		component.credentialDraft.set("mounted-only credential");
		component.selectChannelType("slack");
		expect(component.credentialDraft()).toBe("");

		component.credentialDraft.set("another mounted-only value");
		component.goBack();
		expect(component.credentialDraft()).toBe("");
		component.credentialDraft.set("unmount value");
		fixture.destroy();
		expect(component.credentialDraft()).toBe("");
	});

	it("adds and disconnects a channel while keeping mounted identities unique", async function channelLifecycle(): Promise<void>
	{
		const component = _render().componentInstance;
		component.openEditor("scope");
		component.openAddChannel();
		component.selectChannelType("discord");
		component.credentialDraft.set("transient discord credential");
		await component.addChannel();
		const added = component.channels().at(-1);
		if (!added) throw new Error("Expected a newly added channel");

		expect(component.selectedAgent()?.channelIds).toContain(added.id);
		expect(component.credentialDraft()).toBe("");
		component.openConfigureChannel(added.id);
		component.credentialDraft.set("replacement before disconnect");
		component.requestDisconnect({ currentTarget: document.createElement("button") } as unknown as Event, document.createElement("section"));
		await component.confirmDestructive();

		expect(component.channels().some(function matches(channel): boolean { return channel.id === added.id; })).toBe(false);
		expect(component.credentialDraft()).toBe("");
		expect(component.pendingKind()).not.toBe(AgentSettingsMutationKind.DisconnectChannel);
	});

	it("retires an agent only after explicit confirmation", async function retirement(): Promise<void>
	{
		const component = _render().componentInstance;
		component.openEditor("indexer");
		component.requestRetire({ currentTarget: document.createElement("button") } as unknown as Event, document.createElement("section"));
		expect(component.agents()).toHaveLength(2);
		await component.confirmDestructive();

		expect(component.agents().map(function identity(agent): string { return agent.id; })).toEqual(["scope"]);
		expect(component.view()).toBe("list");
	});

	it("saves configured replacement credentials and copies the safe webhook", async function configureChannel(): Promise<void>
	{
		const component = _render().componentInstance;
		const mutation = new TestAgentMutation();
		let copied = "";
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: function writeText(value: string): Promise<void> { copied = value; return Promise.resolve(); } } });
		component.mutation = mutation;
		component.openEditor("scope");
		component.openConfigureChannel("tg");
		component.credentialDraft.set("replacement credential");
		await component.copyWebhook();
		expect(copied).toBe("https://pod.example.com/webhook/telegram");
		await component.saveChannel();

		expect(mutation.calls.at(-1)).toEqual({ kind: AgentSettingsMutationKind.SaveChannel, entityId: "tg" });
		expect(component.credentialDraft()).toBe("");
		expect(component.view()).toBe("editor");
	});
});
