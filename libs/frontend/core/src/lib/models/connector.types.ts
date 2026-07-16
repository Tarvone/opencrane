/** Connector categories exposed by the authoritative marketplace handoff. */
export enum ConnectorCategory
{
	/** Durable workspace memory and retrieval tools. */
	Memory = "Memory",
	/** Software delivery and source-control tools. */
	Dev = "Dev",
	/** Personal and team productivity tools. */
	Productivity = "Productivity",
	/** Communication and collaboration tools. */
	Comms = "Comms",
	/** Web and knowledge research tools. */
	Research = "Research",
	/** Structured-data access tools. */
	Data = "Data"
}

/** One connector available to a workspace or its marketplace. */
export interface Connector
{
	/** Stable fixture identity used for updates and row tracking. */
	readonly id: string;
	/** Human-readable connector name. */
	readonly name: string;
	/** Marketplace category used by filters and badges. */
	readonly category: ConnectorCategory;
	/** Concise capability description shown in the marketplace. */
	readonly description: string;
	/** Installed or available connector version. */
	readonly version: string;
	/** Whether the connector is installed in the current workspace. */
	readonly installed: boolean;
	/** Whether an installed connector may currently be called. */
	readonly enabled: boolean;
}

/** Mutations supported by the mock-only connector lifecycle. */
export enum ConnectorMutationKind
{
	/** Enable or disable an installed connector. */
	Toggle = "toggle",
	/** Install a marketplace connector. */
	Install = "install",
	/** Remove an installed connector after confirmation. */
	Uninstall = "uninstall"
}

/** Deterministic connector mutation outcomes. */
export enum ConnectorMutationOutcome
{
	/** The fixture-backed mutation completed. */
	Success = "success",
	/** The mutation failed safely and may be retried. */
	RecoverableError = "recoverable-error"
}

/** One connector mutation captured by the fixture boundary. */
export interface ConnectorMutationRequest
{
	/** Connector affected by the mutation. */
	readonly connectorId: string;
	/** Lifecycle operation requested by the user. */
	readonly kind: ConnectorMutationKind;
}

/** Result returned by the deterministic connector mutation boundary. */
export interface ConnectorMutationResult
{
	/** Explicit success or recoverable-failure outcome. */
	readonly outcome: ConnectorMutationOutcome;
	/** Accessible feedback presented after the outcome resolves. */
	readonly message: string;
}

/** Mockable connector mutation boundary consumed by the settings section. */
export interface ConnectorMutation
{
	/** Resolve one fixture-backed lifecycle operation. */
	mutate(request: ConnectorMutationRequest): Promise<ConnectorMutationResult>;
}

/** Deterministic fixture for one connector mutation attempt. */
export interface ConnectorMutationFixture
{
	/** Explicit result returned for the attempt. */
	readonly result: ConnectorMutationResult;
	/** Optional delay that keeps duplicate-action locking observable. */
	readonly delayMilliseconds?: number;
}

/** Visible connector action feedback kind. */
export enum ConnectorFeedbackKind
{
	/** Polite successful-action announcement. */
	Success = "success",
	/** Assertive recoverable-error announcement. */
	Error = "error"
}

/** Accessible connector action feedback. */
export interface ConnectorFeedback
{
	/** Presentation and live-region semantics for the message. */
	readonly kind: ConnectorFeedbackKind;
	/** Human-readable mutation outcome. */
	readonly message: string;
}

/** Currently locked connector mutation. */
export interface ActiveConnectorMutation
{
	/** Connector whose controls are locked. */
	readonly connectorId: string;
	/** Operation currently in flight. */
	readonly kind: ConnectorMutationKind;
}
