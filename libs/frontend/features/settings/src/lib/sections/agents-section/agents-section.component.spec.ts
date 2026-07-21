// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ɵresolveComponentResources } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AgentSettingsMutationKind, WorkspaceAgentTrigger } from "@opencrane/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { MockSettingsGateway } from "@opencrane/state/gateways/testing";
import { signal } from "@angular/core";
import { DestructiveConfirmationComponent } from "@opencrane/elements/ui";
import { AgentsSectionComponent } from "./agents-section.component.js";

/** Resolve external resources for the Agents section and shared confirmation dialog. */
function _componentResource(resourceUrl: string): string
{
	const file = resourceUrl.replace(/^\.\//, "");
	const componentFolder = file.split(".component")[0];
	const folder = file.startsWith("agents-section") ? "src/lib/sections/agents-section" : `../../elements/ui/src/lib/components/${componentFolder}`;
	return readFileSync(resolve(process.cwd(), folder, file), "utf8");
}

/** Render the fixture-backed Agents section. */
async function _render(): Promise<ComponentFixture<AgentsSectionComponent>>
{
	TestBed.configureTestingModule({ 
		imports: [AgentsSectionComponent],
		providers: [
			{ provide: SETTINGS_GATEWAY, useClass: MockSettingsGateway },
			{ provide: ActiveTenantStore, useValue: { tenant: signal("elewa-default") } }
		]
	});
	
	TestBed.overrideComponent(DestructiveConfirmationComponent, {
		remove: { 
			templateUrl: './destructive-confirmation.component.html',
			styleUrl: './destructive-confirmation.component.scss'
		},
		add: {
			template: ''
		}
	});
	
	const fixture = TestBed.createComponent(AgentsSectionComponent);
	fixture.detectChanges();
	await fixture.whenStable();
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
	it("renders the App.dc.html agent catalogue and exact primary copy", async function catalogue(): Promise<void>
	{
		const fixture = await _render();
		const root = fixture.nativeElement as HTMLElement;

		expect(root.querySelector("h2")?.textContent?.trim()).toBe("Agents");
		expect(root.querySelector(".wo-agents__header p")?.textContent).toContain("Automations that watch information sources");
		expect(Array.from(root.querySelectorAll(".wo-agents__agent-name strong")).map(function text(node): string { return node.textContent?.trim() ?? ""; })).toEqual(["Scope reviewer", "Update indexer"]);
		expect(root.querySelectorAll(".wo-agents__agent-row")).toHaveLength(2);
		expect(root.querySelectorAll("[data-agent-icon]")).toHaveLength(2);
		expect(root.querySelector(".wo-agents__summary")?.textContent).toContain("WhatsApp indexer, Ticket indexer");
	});

	it("opens and saves the handoff editor through the deterministic boundary", async function editorSave(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		vi.spyOn(gateway, "updateWorkspaceAgent").mockResolvedValue({ id: "scope", name: "Commercial scope reviewer", trigger: WorkspaceAgentTrigger.Schedule } as any);
		vi.spyOn(gateway, "getWorkspaceAgents").mockResolvedValue(
			component.agents().map(a => a.id === "scope" ? { ...a, name: "Commercial scope reviewer", trigger: WorkspaceAgentTrigger.Schedule } : a)
		);
		
		component.openEditor("scope");
		component.nameDraft.set("Commercial scope reviewer");
		component.selectTrigger(WorkspaceAgentTrigger.Schedule);
		await component.saveAgent();
		await fixture.whenStable();
		fixture.detectChanges();

		expect(component.agents()[0]?.name).toBe("Commercial scope reviewer");
		expect(component.agents()[0]?.trigger).toBe(WorkspaceAgentTrigger.Schedule);
		expect(component.feedback()?.kind).toBe("success");
		expect(gateway.updateWorkspaceAgent).toHaveBeenCalledTimes(1);
		expect((fixture.nativeElement as HTMLElement).querySelectorAll(".wo-agents__runs > div")).toHaveLength(4);
		component.togglePrompt();
		fixture.detectChanges();
		expect((fixture.nativeElement as HTMLElement).querySelector("textarea[aria-label='Agent instructions']")).not.toBeNull();
	});

	it("keeps the submitted editor snapshot stable and locks duplicate saves", async function delayedEditorSave(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		let resolveUpdate: any;
		vi.spyOn(gateway, "updateWorkspaceAgent").mockImplementation(() => new Promise(r => resolveUpdate = r));
		
		component.openEditor("scope");
		component.nameDraft.set("Submitted name");
		const first = component.saveAgent();
		const duplicate = component.saveAgent();
		fixture.detectChanges();

		expect(gateway.updateWorkspaceAgent).toHaveBeenCalledTimes(1);
		expect(((fixture.nativeElement as HTMLElement).querySelector("[aria-label='Agent name']") as HTMLInputElement).disabled).toBe(true);
		component.updateTextDraft("name", { target: { value: "Late name" } } as unknown as Event);
		expect(component.nameDraft()).toBe("Submitted name");
		
		vi.spyOn(gateway, "getWorkspaceAgents").mockResolvedValue(
			component.agents().map(a => a.id === "scope" ? { ...a, name: "Submitted name" } : a)
		);
		resolveUpdate({ id: "scope", name: "Submitted name" } as any);
		await Promise.all([first, duplicate]);
		await fixture.whenStable();
		expect(component.selectedAgent()?.name).toBe("Submitted name");
	});

	it("creates a new draft and returns through the owned editor back control", async function newAgentBack(): Promise<void>
	{
		const fixture = await _render();
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
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		let resolveTest: any;
		vi.spyOn(gateway, "testWorkspaceAgentChannel").mockImplementation(() => new Promise(r => resolveTest = r));
		component.openEditor("scope");
		component.openAddChannel();
		component.selectChannelType("telegram");
		component.credentialDraft.set("credential A");
		const pending = component.testChannel();
		fixture.detectChanges();

		expect(((fixture.nativeElement as HTMLElement).querySelector("input[type='password']") as HTMLInputElement).disabled).toBe(true);
		component.updateCredential({ target: { value: "credential B" } } as unknown as Event);
		expect(component.credentialDraft()).toBe("credential A");
		resolveTest();
		await pending;
		expect(component.connectionPhase()).toBe("valid");
	});

	it("keeps editor state on a recoverable save outcome", async function recoverableSave(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		vi.spyOn(gateway, "updateWorkspaceAgent").mockRejectedValue(new Error("Agent changed elsewhere."));
		component.openEditor("scope");
		component.nameDraft.set("Unsaved conflict name");
		await component.saveAgent();
		await fixture.whenStable();

		expect(component.selectedAgent()?.name).toBe("Scope reviewer");
		expect(component.nameDraft()).toBe("Unsaved conflict name");
		expect(component.feedback()).toEqual({ kind: "error", message: "The agent could not be saved. Try again." });
	});

	it("represents invalid tests and recoverable add failures without losing input", async function channelFailures(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		component.openEditor("scope");
		component.openAddChannel();
		component.selectChannelType("slack");
		component.credentialDraft.set("mounted input");
		vi.spyOn(gateway, "testWorkspaceAgentChannel").mockRejectedValue(new Error("Credential rejected."));
		await component.testChannel();

		expect(component.connectionPhase()).toBe("invalid");
		expect(component.feedback()?.message).toBe("Credential rejected.");
		vi.spyOn(gateway, "addWorkspaceAgentChannel").mockRejectedValue(new Error("Channel service unavailable."));
		await component.addChannel();
		expect(component.view()).toBe("add-channel");
		expect(component.credentialDraft()).toBe("mounted input");
		expect(component.channels()).toHaveLength(2);
	});

	it("clears transient channel credentials on selection, back, and destruction", async function credentialLifetime(): Promise<void>
	{
		const fixture = await _render();
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
		const fixture = await _render();
		const component = fixture.componentInstance;
		component.openEditor("scope");
		component.openAddChannel();
		component.selectChannelType("discord");
		component.credentialDraft.set("transient discord credential");

		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		vi.spyOn(gateway, "addWorkspaceAgentChannel").mockResolvedValue({ id: "sl", name: "Slack", typeId: "discord", agentId: "scope" } as any);
		vi.spyOn(gateway, "getWorkspaceAgentChannels").mockResolvedValue([...component.channels(), { id: "sl", name: "Slack", typeId: "discord", agentId: "scope" } as any]);
		vi.spyOn(gateway, "getWorkspaceAgents").mockResolvedValue(component.agents().map(a => a.id === "scope" ? { ...a, channelIds: [...a.channelIds, "sl"] } : a));

		await component.addChannel();
		await fixture.whenStable();
		const added = component.channels().at(-1);
		if (!added) throw new Error("Expected a newly added channel");

		expect(component.selectedAgent()?.channelIds).toContain(added.id);
		expect(component.credentialDraft()).toBe("");
		component.openConfigureChannel(added.id);
		component.credentialDraft.set("replacement before disconnect");
		component.requestDisconnect({ currentTarget: document.createElement("button") } as unknown as Event, document.createElement("section"));
		vi.spyOn(gateway, "getWorkspaceAgentChannels").mockResolvedValue(component.channels().filter(c => c.id !== "sl"));
		await component.confirmDestructive();
		await fixture.whenStable();

		expect(component.channels().some(function matches(channel): boolean { return channel.id === added.id; })).toBe(false);
		expect(component.credentialDraft()).toBe("");
		expect(component.pendingKind()).not.toBe(AgentSettingsMutationKind.DisconnectChannel);
	});

	it("retires an agent only after explicit confirmation", async function retirement(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		component.openEditor("indexer");
		component.requestRetire({ currentTarget: document.createElement("button") } as unknown as Event, document.createElement("section"));
		await fixture.whenStable();
		expect(component.agents()).toHaveLength(2);
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		vi.spyOn(gateway, "getWorkspaceAgents").mockResolvedValue(component.agents().filter(a => a.id !== "indexer"));
		await component.confirmDestructive();
		await fixture.whenStable();

		expect(component.agents().map(function identity(agent): string { return agent.id; })).toEqual(["scope"]);
		expect(component.view()).toBe("list");
	});

	it("saves configured replacement credentials and copies the safe webhook", async function configureChannel(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		vi.spyOn(gateway, "updateWorkspaceAgentChannel").mockResolvedValue({ id: "tg" } as any);
		let copied = "";
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: function writeText(value: string): Promise<void> { copied = value; return Promise.resolve(); } } });
		component.openEditor("scope");
		component.openConfigureChannel("tg");
		component.credentialDraft.set("replacement credential");
		await component.copyWebhook();
		expect(copied).toBe("https://pod.example.com/webhook/telegram");
		await component.saveChannel();
		await fixture.whenStable();

		expect(gateway.updateWorkspaceAgentChannel).toHaveBeenCalledWith(expect.any(String), "tg", "replacement credential");
		expect(component.credentialDraft()).toBe("");
		expect(component.view()).toBe("editor");
	});
});
