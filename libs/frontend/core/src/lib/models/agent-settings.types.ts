/** Trigger modes offered by the authoritative agent editor. */
export enum WorkspaceAgentTrigger
{
	Manual = "manual",
	Schedule = "schedule",
	After = "after"
}

/** One upstream source watched by a workspace agent. */
export interface WorkspaceAgentSource
{
	readonly name: string;
}

/** One contributor displayed in the agent editor avatar stack. */
export interface WorkspaceAgentContributor
{
	readonly initials: string;
	readonly name: string;
	readonly background: string;
}

/** Recent execution result displayed by the agent editor. */
export interface WorkspaceAgentRun
{
	readonly time: string;
	readonly trigger: string;
	readonly duration: string;
	readonly note: string;
	readonly status: "done" | "action" | "failed";
}

/** Fixture-backed workspace automation managed by the Agents screen. */
export interface WorkspaceAgent
{
	readonly id: string;
	readonly name: string;
	readonly icon: "fox" | "diamond";
	readonly version: string;
	readonly scope: string;
	readonly trigger: WorkspaceAgentTrigger;
	readonly skillNames: readonly string[];
	readonly channelIds: readonly string[];
	readonly description: string;
	readonly prompt: string;
	readonly sources: readonly WorkspaceAgentSource[];
	readonly contributors: readonly WorkspaceAgentContributor[];
	readonly runs: readonly WorkspaceAgentRun[];
}

/** Connected channel metadata safe to keep in reusable fixtures. */
export interface WorkspaceAgentChannel
{
	readonly id: string;
	readonly typeId: string;
	readonly name: string;
	readonly handle: string;
	readonly status: "active" | "inactive";
}

/** Channel type offered by the Add Channel handoff. */
export interface WorkspaceAgentChannelType
{
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly icon: string;
	readonly fieldLabel: string;
}

/** Deterministic mutation operations owned by the routed Agents feature. */
export enum AgentSettingsMutationKind
{
	SaveAgent = "save-agent",
	RetireAgent = "retire-agent",
	TestChannel = "test-channel",
	AddChannel = "add-channel",
	SaveChannel = "save-channel",
	DisconnectChannel = "disconnect-channel"
}

/** Outcomes explicitly represented by fixture-backed agent and channel actions. */
export enum AgentSettingsMutationOutcome
{
	Success = "success",
	Conflict = "conflict",
	Invalid = "invalid",
	RecoverableError = "recoverable-error"
}

/** Safe result returned by the deterministic mutation boundary. */
export interface AgentSettingsMutationResult
{
	readonly outcome: AgentSettingsMutationOutcome;
	readonly message: string;
}

/** Mockable boundary that must never retain optional credential text. */
export interface AgentSettingsMutation
{
	/** Execute one fixture action without retaining the optional transient credential. */
	mutate(kind: AgentSettingsMutationKind, entityId: string, credential?: string): Promise<AgentSettingsMutationResult>;
}

/** Accessible feedback projected by the feature. */
export interface AgentSettingsFeedback
{
	readonly kind: "success" | "error";
	readonly message: string;
}
