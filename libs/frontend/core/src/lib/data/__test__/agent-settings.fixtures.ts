import { AgentSettingsMutation, AgentSettingsMutationKind, AgentSettingsMutationOutcome, AgentSettingsMutationResult, WorkspaceAgent, WorkspaceAgentChannel, WorkspaceAgentChannelType, WorkspaceAgentTrigger } from "../../models/agent-settings.types.js";

/** Workspace agents copied from the current App.dc.html handoff. */
export const WORKSPACE_AGENTS_FIXTURE: readonly WorkspaceAgent[] =
[
	{
		id: "scope", name: "Scope reviewer", icon: "fox", version: "1.4.2", scope: "project:p1", trigger: WorkspaceAgentTrigger.After,
		skillNames: ["Cognee Search"], channelIds: ["tg"], description: "Watches indexed project streams for scope changes with commercial impact.",
		prompt: "Review and act on the incoming information streams. Assess whether the client is asking for new scope, a new order, a change to agreed deliverables, or anything else with commercial impact.\n\nIf a scope change is detected: draft a change-order summary, cite the source message, and notify the account lead. If ambiguous, flag for human review instead of acting. Log every decision to the project record.",
		sources: [{ name: "WhatsApp indexer" }, { name: "Ticket indexer" }],
		contributors: [{ initials: "JR", name: "Jente Rosseel", background: "var(--oc-teal)" }, { initials: "SO", name: "Sarah Odhiambo", background: "var(--oc-blue)" }, { initials: "LB", name: "Liam van der Berg", background: "var(--oc-amber)" }],
		runs: [
			{ time: "Today 14:32", trigger: "after: email-indexer", duration: "42s", note: "No scope change detected", status: "done" },
			{ time: "Today 11:05", trigger: "after: slack-indexer", duration: "38s", note: "Change-order drafted → Nova rebrand", status: "action" },
			{ time: "Yesterday 17:48", trigger: "after: ticket-indexer", duration: "51s", note: "No scope change detected", status: "done" },
			{ time: "Yesterday 09:12", trigger: "after: teams-indexer", duration: "—", note: "Stream timeout, retried at 09:20", status: "failed" }
		]
	},
	{
		id: "indexer", name: "Update indexer", icon: "diamond", version: "2.1.0", scope: "org", trigger: WorkspaceAgentTrigger.Manual,
		skillNames: ["Cognee Search"], channelIds: ["sl"], description: "Indexes project updates from Slack, Teams, email and tickets into the org's brain.",
		prompt: "For each incoming message, ticket, or thread: extract project-relevant facts, decisions, and open questions. Attach them to the correct project record in the org brain with source references. Discard noise.",
		sources: [], contributors: [{ initials: "JR", name: "Jente Rosseel", background: "var(--oc-teal)" }, { initials: "DK", name: "David Kimani", background: "var(--oc-green-feedback)" }],
		runs: [{ time: "Today 15:01", trigger: "on: new messages", duration: "12s", note: "14 items indexed", status: "done" }, { time: "Today 14:20", trigger: "on: new messages", duration: "9s", note: "6 items indexed", status: "done" }]
	}
];

/** Safe connected-channel metadata from the current handoff. */
export const WORKSPACE_AGENT_CHANNELS_FIXTURE: readonly WorkspaceAgentChannel[] =
[
	{ id: "tg", typeId: "telegram", name: "Telegram", handle: "@elewa_crane_bot", status: "active" },
	{ id: "sl", typeId: "slack", name: "Slack", handle: "#opencrane", status: "active" }
];

/** Add Channel catalogue; credential-shaped placeholders are intentionally omitted. */
export const WORKSPACE_AGENT_CHANNEL_TYPES_FIXTURE: readonly WorkspaceAgentChannelType[] =
[
	{ id: "telegram", name: "Telegram", description: "Bot API", icon: "✈", fieldLabel: "Bot token" },
	{ id: "slack", name: "Slack", description: "Slash commands", icon: "◈", fieldLabel: "Bot OAuth token" },
	{ id: "whatsapp", name: "WhatsApp", description: "Business Cloud API", icon: "◎", fieldLabel: "Phone number ID" },
	{ id: "email", name: "Email", description: "SMTP / IMAP", icon: "✉", fieldLabel: "IMAP address" },
	{ id: "msteams", name: "MS Teams", description: "Teams bot connector", icon: "⊞", fieldLabel: "App ID" },
	{ id: "discord", name: "Discord", description: "Discord bot", icon: "◆", fieldLabel: "Bot token" }
];

/** Scope choices shown by the handoff editor. */
export const WORKSPACE_AGENT_SCOPE_OPTIONS_FIXTURE: readonly { value: string; label: string }[] =
[
	{ value: "org", label: "Org-wide (all projects)" },
	{ value: "dept:eng", label: "Department — Engineering" },
	{ value: "dept:ops", label: "Department — Operations" },
	{ value: "team:fe", label: "Team — Frontend" },
	{ value: "team:be", label: "Team — Backend" },
	{ value: "project:p1", label: "Project — Customer Portal" },
	{ value: "project:p2", label: "Project — Internal Automation" },
	{ value: "project:p3", label: "Project — Data Pipeline" }
];

/** Default deterministic success boundary that never stores credential input. */
export class MockAgentSettingsMutation implements AgentSettingsMutation
{
	public callCount = 0;

	/** Execute one successful mounted-only action. */
	public async mutate(_kind: AgentSettingsMutationKind, _entityId: string, _credential?: string): Promise<AgentSettingsMutationResult>
	{
		this.callCount += 1;
		return { outcome: AgentSettingsMutationOutcome.Success, message: "Workspace agent settings updated." };
	}
}
