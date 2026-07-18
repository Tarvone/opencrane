import { ChangeDetectionStrategy, Component, OnDestroy, Signal, computed, signal } from "@angular/core";

import { AgentSettingsFeedback, AgentSettingsMutation, AgentSettingsMutationKind, AgentSettingsMutationOutcome, DestructiveActionPhase, DestructiveActionState, WorkspaceAgent, WorkspaceAgentChannel, WorkspaceAgentChannelType, WorkspaceAgentTrigger } from "@opencrane/core";
import { MockAgentSettingsMutation, WORKSPACE_AGENT_CHANNELS_FIXTURE, WORKSPACE_AGENT_CHANNEL_TYPES_FIXTURE, WORKSPACE_AGENT_SCOPE_OPTIONS_FIXTURE, WORKSPACE_AGENTS_FIXTURE } from "@opencrane/core/testing";
import { DestructiveConfirmationComponent } from "@opencrane/elements/ui";

/** Mounted views owned by the stable `/settings/workspace/agents` route. */
type AgentsView = "list" | "editor" | "add-channel" | "configure-channel";

/** Transient channel connection phases represented by the add flow. */
type ChannelConnectionPhase = "idle" | "testing" | "valid" | "invalid";

/** Workspace Agents list, editor, and channel sub-pages from App.dc.html. */
@Component({
	selector: "wo-agents-section",
	standalone: true,
	imports: [DestructiveConfirmationComponent],
	templateUrl: "./agents-section.component.html",
	styleUrl: "./agents-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentsSectionComponent implements OnDestroy
{
	/** Monotonic mounted-only identity for newly created agents. */
	private _nextAgentIdentity = WORKSPACE_AGENTS_FIXTURE.length + 1;

	/** Monotonic mounted-only identity for newly connected channels. */
	private _nextChannelIdentity = WORKSPACE_AGENT_CHANNELS_FIXTURE.length + 1;

	/** Stable focus destination used after a destructive sub-page closes. */
	private _destructiveSuccessFocusTarget: HTMLElement | null = null;

	/** Mounted-only workspace agent catalogue. */
	public readonly agents = signal<readonly WorkspaceAgent[]>(structuredClone(WORKSPACE_AGENTS_FIXTURE));

	/** Safe connected-channel metadata. */
	public readonly channels = signal<readonly WorkspaceAgentChannel[]>(structuredClone(WORKSPACE_AGENT_CHANNELS_FIXTURE));

	/** Add Channel choices in handoff order. */
	public readonly channelTypes = WORKSPACE_AGENT_CHANNEL_TYPES_FIXTURE;

	/** Scope options available to the editor. */
	public readonly scopeOptions = WORKSPACE_AGENT_SCOPE_OPTIONS_FIXTURE;

	/** Current route-owned view. */
	public readonly view = signal<AgentsView>("list");

	/** Agent currently owned by the editor. */
	public readonly selectedAgentId = signal<string | null>(null);

	/** Agent whose overflow menu is open. */
	public readonly menuAgentId = signal<string | null>(null);

	/** Editor drafts kept separate from the rendered catalogue until Save. */
	public readonly nameDraft = signal("");
	public readonly descriptionDraft = signal("");
	public readonly scopeDraft = signal("org");
	public readonly triggerDraft = signal<WorkspaceAgentTrigger>(WorkspaceAgentTrigger.Manual);
	public readonly promptDraft = signal("");
	public readonly promptExpanded = signal(false);

	/** Channel type selected by the add flow. */
	public readonly selectedChannelTypeId = signal<string | null>(null);

	/** Raw channel credential retained only by this mounted component. */
	public readonly credentialDraft = signal("");

	/** Current channel connection-test phase. */
	public readonly connectionPhase = signal<ChannelConnectionPhase>("idle");

	/** Channel currently owned by the configure sub-page. */
	public readonly configuredChannelId = signal<string | null>(null);

	/** Active mutation lock; null means all controls are available. */
	public readonly pendingKind = signal<AgentSettingsMutationKind | null>(null);

	/** Accessible action feedback. */
	public readonly feedback = signal<AgentSettingsFeedback | null>(null);

	/** Destructive action currently represented by the shared dialog. */
	public readonly destructiveKind = signal<"retire" | "disconnect" | null>(null);

	/** Shared destructive-confirmation state. */
	public readonly destructiveState = signal<DestructiveActionState>({ phase: DestructiveActionPhase.Idle });

	/** Invoker restored when a destructive dialog closes. */
	public readonly destructiveFocusTarget = signal<HTMLElement | null>(null);

	/** Deterministic mutation boundary replaceable by focused tests. */
	public mutation: AgentSettingsMutation = new MockAgentSettingsMutation();

	/** Trigger enum exposed to the external template. */
	public readonly WorkspaceAgentTrigger = WorkspaceAgentTrigger;

	/** Selected editor agent. */
	public readonly selectedAgent: Signal<WorkspaceAgent | null> = computed((): WorkspaceAgent | null =>
	{
		const id = this.selectedAgentId();
		return this.agents().find(function matches(agent): boolean { return agent.id === id; }) ?? null;
	});

	/** Selected channel type metadata. */
	public readonly selectedChannelType: Signal<WorkspaceAgentChannelType | null> = computed((): WorkspaceAgentChannelType | null =>
	{
		const id = this.selectedChannelTypeId();
		return this.channelTypes.find(function matches(type): boolean { return type.id === id; }) ?? null;
	});

	/** Channel owned by the configure sub-page. */
	public readonly configuredChannel: Signal<WorkspaceAgentChannel | null> = computed((): WorkspaceAgentChannel | null =>
	{
		const id = this.configuredChannelId();
		return this.channels().find(function matches(channel): boolean { return channel.id === id; }) ?? null;
	});

	/** Channels connected to the selected agent. */
	public readonly selectedAgentChannels: Signal<readonly WorkspaceAgentChannel[]> = computed((): readonly WorkspaceAgentChannel[] =>
	{
		const ids = new Set(this.selectedAgent()?.channelIds ?? []);
		return this.channels().filter(function connected(channel): boolean { return ids.has(channel.id); });
	});

	/** Toggle one agent row's overflow menu. */
	public toggleMenu(agentId: string, event: Event): void
	{
		event.stopPropagation();
		this.menuAgentId.update(function toggle(current): string | null { return current === agentId ? null : agentId; });
	}

	/** Open one existing agent in a pristine editor. */
	public openEditor(agentId: string): void
	{
		const agent = this.agents().find(function matches(candidate): boolean { return candidate.id === agentId; });
		if (agent === undefined) return;
		this.menuAgentId.set(null);
		this.selectedAgentId.set(agent.id);
		this.nameDraft.set(agent.name);
		this.descriptionDraft.set(agent.description);
		this.scopeDraft.set(agent.scope);
		this.triggerDraft.set(agent.trigger);
		this.promptDraft.set(agent.prompt);
		this.promptExpanded.set(false);
		this.feedback.set(null);
		this.view.set("editor");
	}

	/** Create one mounted-only agent draft and open its expanded prompt editor. */
	public newAgent(): void
	{
		const id = `agent-${this._nextAgentIdentity}`;
		this._nextAgentIdentity += 1;
		const draft: WorkspaceAgent = { id, name: "New agent", icon: "diamond", version: "0.1.0", scope: "org", trigger: WorkspaceAgentTrigger.Manual, skillNames: [], channelIds: [], description: "", prompt: "", sources: [], contributors: [], runs: [] };
		this.agents.update(function append(agents): readonly WorkspaceAgent[] { return [...agents, draft]; });
		this.openEditor(id);
	}

	/** Return to the owning parent view and destroy any transient credential. */
	public goBack(): void
	{
		if (this.pendingKind() !== null) return;
		this._clearCredential();
		this.feedback.set(null);
		if (this.view() === "editor")
		{
			this.selectedAgentId.set(null);
			this.view.set("list");
		}
		else
		{
			this.selectedChannelTypeId.set(null);
			this.configuredChannelId.set(null);
			this.view.set("editor");
		}
	}

	/** Capture one plain-text agent editor field. */
	public updateTextDraft(field: "name" | "description" | "prompt", event: Event): void
	{
		if (this.pendingKind() !== null) return;
		const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
		if (field === "name") this.nameDraft.set(value);
		else if (field === "description") this.descriptionDraft.set(value);
		else this.promptDraft.set(value);
		this.feedback.set(null);
	}

	/** Capture the selected scope. */
	public updateScope(event: Event): void
	{
		if (this.pendingKind() !== null) return;
		this.scopeDraft.set((event.target as HTMLSelectElement).value);
	}

	/** Select one trigger pill. */
	public selectTrigger(trigger: WorkspaceAgentTrigger): void
	{
		if (this.pendingKind() !== null) return;
		this.triggerDraft.set(trigger);
	}

	/** Toggle collapsed prompt preview and expanded editor. */
	public togglePrompt(): void
	{
		this.promptExpanded.update(function toggle(expanded): boolean { return !expanded; });
	}

	/** Save validated editor drafts through the deterministic boundary. */
	public async saveAgent(): Promise<void>
	{
		const agent = this.selectedAgent();
		if (agent === null || this.pendingKind() !== null) return;
		if (this.nameDraft().trim() === "")
		{
			this.feedback.set({ kind: "error", message: "Agent name is required." });
			return;
		}
		const drafts = { name: this.nameDraft().trim(), description: this.descriptionDraft().trim(), scope: this.scopeDraft(), trigger: this.triggerDraft(), prompt: this.promptDraft() };

		this.pendingKind.set(AgentSettingsMutationKind.SaveAgent);
		this.feedback.set(null);
		try
		{
			const result = await this.mutation.mutate(AgentSettingsMutationKind.SaveAgent, agent.id);
			if (result.outcome !== AgentSettingsMutationOutcome.Success)
			{
				this.feedback.set({ kind: "error", message: result.message });
				return;
			}
			const next = { ...agent, ...drafts };
			this.agents.update(function replace(agents): readonly WorkspaceAgent[] { return agents.map(function update(candidate): WorkspaceAgent { return candidate.id === agent.id ? next : candidate; }); });
			this.feedback.set({ kind: "success", message: result.message });
		}
		catch
		{
			this.feedback.set({ kind: "error", message: "The agent could not be saved. Try again." });
		}
		finally
		{
			this.pendingKind.set(null);
		}
	}

	/** Open explicit retirement confirmation for the selected agent. */
	public requestRetire(event: Event, successFocusTarget: HTMLElement): void
	{
		if (this.selectedAgent() === null || this.pendingKind() !== null) return;
		this.destructiveKind.set("retire");
		this.destructiveFocusTarget.set(event.currentTarget as HTMLElement | null);
		this._destructiveSuccessFocusTarget = successFocusTarget;
		this.destructiveState.set({ phase: DestructiveActionPhase.Idle });
	}

	/** Open Add Channel with pristine secret state. */
	public openAddChannel(): void
	{
		this._clearCredential();
		this.selectedChannelTypeId.set(null);
		this.feedback.set(null);
		this.view.set("add-channel");
	}

	/** Select one channel type and clear credentials entered for another type. */
	public selectChannelType(typeId: string): void
	{
		if (this.pendingKind() !== null) return;
		this._clearCredential();
		this.selectedChannelTypeId.set(typeId);
		this.feedback.set(null);
	}

	/** Open Configure Channel for one channel connected to the selected agent. */
	public openConfigureChannel(channelId: string): void
	{
		this._clearCredential();
		this.configuredChannelId.set(channelId);
		this.feedback.set(null);
		this.view.set("configure-channel");
	}

	/** Capture channel credential input only in mounted component state. */
	public updateCredential(event: Event): void
	{
		if (this.pendingKind() !== null) return;
		this.credentialDraft.set((event.target as HTMLInputElement).value);
		this.connectionPhase.set("idle");
		this.feedback.set(null);
	}

	/** Test the transient channel credential. */
	public async testChannel(): Promise<void>
	{
		const type = this.selectedChannelType();
		const credential = this.credentialDraft();
		if (type === null || credential.trim() === "" || this.pendingKind() !== null) return;
		this.pendingKind.set(AgentSettingsMutationKind.TestChannel);
		this.connectionPhase.set("testing");
		this.feedback.set(null);
		try
		{
			const result = await this.mutation.mutate(AgentSettingsMutationKind.TestChannel, type.id, credential);
			if (result.outcome === AgentSettingsMutationOutcome.Success)
			{
				this.connectionPhase.set("valid");
				this.feedback.set({ kind: "success", message: result.message });
			}
			else
			{
				this.connectionPhase.set("invalid");
				this.feedback.set({ kind: "error", message: result.message });
			}
		}
		catch
		{
			this.connectionPhase.set("invalid");
			this.feedback.set({ kind: "error", message: "The channel connection could not be tested." });
		}
		finally
		{
			this.pendingKind.set(null);
		}
	}

	/** Add a selected channel and connect it to the current agent. */
	public async addChannel(): Promise<void>
	{
		const type = this.selectedChannelType();
		const agent = this.selectedAgent();
		const credential = this.credentialDraft();
		if (type === null || agent === null || credential.trim() === "" || this.pendingKind() !== null) return;
		this.pendingKind.set(AgentSettingsMutationKind.AddChannel);
		this.feedback.set(null);
		try
		{
			const result = await this.mutation.mutate(AgentSettingsMutationKind.AddChannel, type.id, credential);
			if (result.outcome !== AgentSettingsMutationOutcome.Success)
			{
				this.feedback.set({ kind: "error", message: result.message });
				return;
			}
			const channel: WorkspaceAgentChannel = { id: `${type.id}-${this._nextChannelIdentity}`, typeId: type.id, name: type.name, handle: "Connected workspace channel", status: "active" };
			this._nextChannelIdentity += 1;
			this.channels.update(function append(channels): readonly WorkspaceAgentChannel[] { return [...channels, channel]; });
			this.agents.update(function connect(agents): readonly WorkspaceAgent[] { return agents.map(function update(candidate): WorkspaceAgent { return candidate.id === agent.id ? { ...candidate, channelIds: [...candidate.channelIds, channel.id] } : candidate; }); });
			this._clearCredential();
			this.selectedChannelTypeId.set(null);
			this.view.set("editor");
			this.feedback.set({ kind: "success", message: result.message });
		}
		catch
		{
			this.feedback.set({ kind: "error", message: "The channel could not be added. Try again." });
		}
		finally
		{
			this.pendingKind.set(null);
		}
	}

	/** Save optional replacement credentials for the configured channel. */
	public async saveChannel(): Promise<void>
	{
		const channel = this.configuredChannel();
		if (channel === null || this.pendingKind() !== null) return;
		this.pendingKind.set(AgentSettingsMutationKind.SaveChannel);
		this.feedback.set(null);
		try
		{
			const result = await this.mutation.mutate(AgentSettingsMutationKind.SaveChannel, channel.id, this.credentialDraft() || undefined);
			if (result.outcome !== AgentSettingsMutationOutcome.Success)
			{
				this.feedback.set({ kind: "error", message: result.message });
				return;
			}
			this._clearCredential();
			this.view.set("editor");
			this.feedback.set({ kind: "success", message: result.message });
		}
		catch
		{
			this.feedback.set({ kind: "error", message: "Channel changes could not be saved." });
		}
		finally
		{
			this.pendingKind.set(null);
		}
	}

	/** Copy the safe channel webhook URL. */
	public async copyWebhook(): Promise<void>
	{
		const channel = this.configuredChannel();
		if (channel === null) return;
		try
		{
			await navigator.clipboard.writeText(this.webhookUrl(channel));
			this.feedback.set({ kind: "success", message: "Webhook URL copied." });
		}
		catch
		{
			this.feedback.set({ kind: "error", message: "Webhook URL could not be copied." });
		}
	}

	/** Request confirmed disconnection of the configured channel. */
	public requestDisconnect(event: Event, successFocusTarget: HTMLElement): void
	{
		if (this.configuredChannel() === null || this.pendingKind() !== null) return;
		this.destructiveKind.set("disconnect");
		this.destructiveFocusTarget.set(event.currentTarget as HTMLElement | null);
		this._destructiveSuccessFocusTarget = successFocusTarget;
		this.destructiveState.set({ phase: DestructiveActionPhase.Idle });
	}

	/** Cancel a non-pending destructive action. */
	public cancelDestructive(): void
	{
		if (this.destructiveState().phase !== DestructiveActionPhase.Pending) this.destructiveKind.set(null);
	}

	/** Execute the active retirement or disconnection action. */
	public async confirmDestructive(): Promise<void>
	{
		const kind = this.destructiveKind();
		if (kind === null || this.pendingKind() !== null) return;
		const mutationKind = kind === "retire" ? AgentSettingsMutationKind.RetireAgent : AgentSettingsMutationKind.DisconnectChannel;
		const entityId = kind === "retire" ? this.selectedAgent()?.id : this.configuredChannel()?.id;
		if (entityId === undefined) return;
		this.pendingKind.set(mutationKind);
		this.destructiveState.set({ phase: DestructiveActionPhase.Pending });
		try
		{
			const result = await this.mutation.mutate(mutationKind, entityId);
			if (result.outcome !== AgentSettingsMutationOutcome.Success)
			{
				this.destructiveState.set({ phase: DestructiveActionPhase.Error, message: result.message });
				return;
			}
			this.destructiveFocusTarget.set(this._destructiveSuccessFocusTarget);
			if (kind === "retire") this._retireAgent(entityId);
			else this._disconnectChannel(entityId);
			this.destructiveState.set({ phase: DestructiveActionPhase.Success });
			this.destructiveKind.set(null);
			this.feedback.set({ kind: "success", message: result.message });
		}
		catch
		{
			this.destructiveState.set({ phase: DestructiveActionPhase.Error, message: "The action could not be completed. Try again." });
		}
		finally
		{
			this.pendingKind.set(null);
		}
	}

	/** Format the compact scope badge used in agent rows. */
	public scopeLabel(scope: string): string
	{
		if (scope === "org") return "Org-wide";
		if (scope === "project:p1") return "Project · Customer Portal";
		if (scope.startsWith("project:")) return "Project";
		if (scope.startsWith("dept:")) return "Department";
		return "Team";
	}

	/** Format one trigger summary for the list. */
	public triggerLabel(trigger: WorkspaceAgentTrigger): string
	{
		if (trigger === WorkspaceAgentTrigger.Schedule) return "on a schedule";
		if (trigger === WorkspaceAgentTrigger.After) return "after upstream agents";
		return "manually";
	}

	/** Return the exact handoff source names rendered in one row summary. */
	public watchingSummary(agent: WorkspaceAgent): string
	{
		return agent.sources.length > 0 ? agent.sources.map(function name(source): string { return source.name; }).join(", ") : "nothing yet";
	}

	/** Return the connected channel names rendered in one row summary. */
	public channelSummary(agent: WorkspaceAgent): string
	{
		const ids = new Set(agent.channelIds);
		const names = this.channels().filter(function connected(channel): boolean { return ids.has(channel.id); }).map(function name(channel): string { return channel.name; });
		return names.length > 0 ? names.join(", ") : "no channels";
	}

	/** Safe webhook URL derived only from a non-secret fixture identity. */
	public webhookUrl(channel: WorkspaceAgentChannel): string
	{
		return `https://pod.example.com/webhook/${channel.typeId}`;
	}

	/** Human-readable entity used by the shared confirmation dialog. */
	public destructiveEntityName(): string
	{
		return this.destructiveKind() === "retire" ? this.selectedAgent()?.name ?? "agent" : this.configuredChannel()?.name ?? "channel";
	}

	/** Action label used by the shared confirmation dialog. */
	public destructiveActionName(): string
	{
		return this.destructiveKind() === "retire" ? "Retire" : "Disconnect";
	}

	/** Destroy any raw credential text when the routed component unmounts. */
	public ngOnDestroy(): void
	{
		this._clearCredential();
	}

	/** Remove one agent and return to the list. */
	private _retireAgent(agentId: string): void
	{
		this.agents.update(function remove(agents): readonly WorkspaceAgent[] { return agents.filter(function keep(agent): boolean { return agent.id !== agentId; }); });
		this.selectedAgentId.set(null);
		this.view.set("list");
	}

	/** Remove one channel and unlink it from every mounted agent. */
	private _disconnectChannel(channelId: string): void
	{
		this._clearCredential();
		this.channels.update(function remove(channels): readonly WorkspaceAgentChannel[] { return channels.filter(function keep(channel): boolean { return channel.id !== channelId; }); });
		this.agents.update(function unlink(agents): readonly WorkspaceAgent[] { return agents.map(function update(agent): WorkspaceAgent { return { ...agent, channelIds: agent.channelIds.filter(function keep(id): boolean { return id !== channelId; }) }; }); });
		this.configuredChannelId.set(null);
		this.view.set("editor");
	}

	/** Destroy the only state that may contain raw channel credential text. */
	private _clearCredential(): void
	{
		this.credentialDraft.set("");
		this.connectionPhase.set("idle");
	}
}
