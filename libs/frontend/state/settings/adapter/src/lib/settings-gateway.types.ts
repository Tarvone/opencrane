import { InjectionToken } from "@angular/core";

import { CapabilityItem, DatasetAccess, EgressDomain, SkillRow, WorkspaceAgent, WorkspaceAgentChannel, WorkspaceAgentChannelType, Connector, ConnectorCategory, WorkspaceLlmProvider, DataNetworkDataset, LlmProviderOption, ModelRouteCategory } from "@opencrane/core";
import { WorkspaceMember, WorkspaceOrgRow, WorkspaceProject } from "./workspace-members.types.js";
import { WorkspaceBudgetMember, WorkspaceBudgetDraft } from "./workspace-budgets.types.js";
import { PodSettingsFixture, PodSettingsDraftFixture } from "./pod-settings.types.js";

/** Key generated for personal programmatic access. */
export interface PersonalApiKey
{
	id: string;
	name: string;
	createdAt: string;
	redacted: string;
	rawKey?: string;
}

/**
 * Read model for the Account settings section.
 *
 * Mirrors the identity fields the OpenCrane `Tenant` contract exposes for a pod
 * (`/tenants/{name}`) and that the Account section renders: full name, the
 * org-managed email, and the team the pod belongs to. WeOwnAI is a pure network
 * client and never imports OpenCrane source — this is a local projection of the
 * wire shape, not a re-export of it.
 */
export interface AccountProfile
{
	/** Stable pod/tenant identifier the profile was loaded for. */
	name: string;

	/** Display name shown in the "Full name" field. */
	fullName: string;

	/** Org-managed email address (read-only in the section). */
	email: string;

	/** Team the pod belongs to, surfaced as "Department". */
	department: string;

	/** Role of the user in the workspace. */
	role: string;
}

/**
 * Editable subset of {@link AccountProfile} the Account/Pod section can persist.
 *
 * Only the writable identity fields appear: `email` is org-managed and read-only
 * in the section, and `name` is the immutable pod key (the path param), so
 * neither is updatable here. Both fields are optional so a caller can patch one
 * without the other (maps onto the partial `PUT /tenants/{name}` body).
 */
export interface AccountProfileUpdate
{
	/** New display name ("Full name"), when changing it. */
	fullName?: string;

	/** New team ("Department"), when changing it. */
	department?: string;
}

/**
 * Read model for the Model & Budget section's live spend figures.
 *
 * Local projection of `GET /ai-budget/{tenantName}/spend`. The model catalogue
 * and routing classes the section also renders are static configuration, not
 * part of this per-tenant read.
 */
/** A single by-model-class spend row. */
export interface ModelClassSpend
{
	/** Display name for the model class (e.g. "Writing"). */
	className: string;

	/** Comma-separated model names used for this class (e.g. "claude-sonnet-4-6"). */
	modelNames: string;

	/** Spend for this class in USD. */
	spendUsd: number;

	/** Percentage of total spend (0–100). */
	percentage: number;
}

/** Personal budget read model containing spend limit and active breakdown. */
export interface BudgetSpend
{
	/** Monthly spend ceiling in USD. */
	monthlyLimitUsd: number;

	/** Spend so far this month in USD. */
	currentSpendUsd: number;

	/** Budget alert band derived server-side. */
	alertState: "ok" | "warning" | "exceeded";

	/** Spend breakdown by model class, ordered by spend descending. */
	modelClasses: ModelClassSpend[];

	/** ISO date string of next monthly reset (e.g. "Jul 1"). */
	resetDate: string;
}

/**
 * Read model for the Awareness Contract section's identity banner.
 *
 * Local projection of the typed fields on `GET /tenants/{name}/effective-contract`
 * (`contractId`, `contractVersion`); the nested `awareness`/`mcp`/`skills` blocks
 * are opaque in the pinned contract, so the rich per-dataset Cognee stats the
 * section also shows remain fixture-backed until an endpoint exposes them.
 */
export interface AwarenessContractInfo
{
	/** Stable contract identifier. */
	contractId: string;

	/** Resolved contract version string (e.g. `v2.3.1`). */
	contractVersion: string;

	/** Fallback behaviour when Cognee is unreachable mid-loop. */
	fallbackBehaviour: "proceed" | "pause" | "abort";

	/** Whether citation mode is enabled on grounded responses. */
	citationMode: boolean;
}

/**
 * Abstraction over the OpenCrane settings reads/writes backing the operator
 * app's settings sections.
 *
 * Components depend only on this interface, so the data source can be swapped
 * (mock fixtures → live OpenCrane client, web → desktop) without touching the
 * section components. Implementations live in this `adapter` lib; the binding is
 * provided in the app's `app.config.ts`. Carries the live-backed sections that
 * still read through the gateway; sections that are mock-only stay fixture-based
 * until their issue scope calls for a backend projection.
 */
export interface SettingsGateway
{
	/**
	 * Load the account profile for a pod by its tenant name.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getAccountProfile(tenantName: string): Promise<AccountProfile>;

	/**
	 * Persist edits to a pod's account profile and resolve with the saved profile.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param update     - The fields to change (see {@link AccountProfileUpdate}).
	 */
	updateAccountProfile(tenantName: string, update: AccountProfileUpdate): Promise<AccountProfile>;

	/**
	 * Load a pod's live monthly spend for the Model & Budget section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getBudgetSpend(tenantName: string): Promise<BudgetSpend>;

	/**
	 * Load a pod's effective awareness-contract identity for the Awareness section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getAwarenessContract(tenantName: string): Promise<AwarenessContractInfo>;

	/**
	 * Load a pod's dataset memberships for the Access & Datasets section.
	 *
	 * @param tenantName - Stable pod/tenant identifier.
	 */
	getDatasetAccess(tenantName: string): Promise<DatasetAccess[]>;

	/**
	 * Load the skill catalogue rows for the old Skills section.
	 *
	 * Cluster-wide (`GET /skills/catalog`), so it takes no tenant key.
	 */
	getSkills(): Promise<SkillRow[]>;

	/**
	 * * Load the capabilities for the new Workspace Skills section.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceCapabilities(tenantName: string): Promise<CapabilityItem[]>;

	/**
	 * Load the egress allowlist rows for the old Network & Egress section.
	 */
	getEgressDomains(): Promise<EgressDomain[]>;

	/**
	 * Load the datasets for the Workspace Data & Network section.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceDataNetworks(tenantName: string): Promise<DataNetworkDataset[]>;

	/**
	 * Load the egress domains for the Workspace Data & Network section.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceEgressDomains(tenantName: string): Promise<EgressDomain[]>;

	/**
	 * Add an egress domain for the Workspace Data & Network section.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param domain     - The domain name.
	 * @param purpose    - The business purpose.
	 */
	addWorkspaceEgressDomain(tenantName: string, domain: string, purpose: string): Promise<EgressDomain>;

	// ==========================================
	// Workspace Members
	// ==========================================
	
	/**
	 * Load all members belonging to the given workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceMembers(tenantName: string): Promise<WorkspaceMember[]>;
	
	/**
	 * Load the organization structure rows for the workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceOrganization(tenantName: string): Promise<WorkspaceOrgRow[]>;
	
	/**
	 * Load the active projects within the workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceProjects(tenantName: string): Promise<WorkspaceProject[]>;
	
	/**
	 * Update a specific workspace member's properties.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param memberId   - The unique identifier.
	 * @param update     - The fields to change.
	 */
	updateWorkspaceMember(tenantName: string, memberId: string, update: Partial<WorkspaceMember>): Promise<WorkspaceMember>;
	
	/**
	 * Add a new member to the workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param member     - The member configuration.
	 */
	addWorkspaceMember(tenantName: string, member: Partial<WorkspaceMember>): Promise<WorkspaceMember>;
	
	/**
	 * Remove a member from the workspace by ID.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param memberId   - The unique identifier.
	 */
	removeWorkspaceMember(tenantName: string, memberId: string): Promise<void>;
	
	/**
	 * Load the available channel types for workspace agents.
	 */
	getWorkspaceAgentChannelTypes(): Promise<WorkspaceAgentChannelType[]>;
	
	/**
	 * Load the available scope options for workspace agents.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceAgentScopeOptions(tenantName: string): Promise<{ value: string; label: string }[]>;

	// ==========================================
	// Workspace Budgets
	// ==========================================
	
	/**
	 * Load the workspace members along with their associated budget data.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceBudgetMembers(tenantName: string): Promise<WorkspaceBudgetMember[]>;
	
	/**
	 * Load the active budget draft for the given workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceBudgetDraft(tenantName: string): Promise<WorkspaceBudgetDraft>;
	
	/**
	 * Load the next reset date for the workspace budget cycle.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceBudgetResetDate(tenantName: string): Promise<string>;
	
	/**
	 * Apply an updated budget draft to the given workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param draft      - The draft state.
	 */
	updateWorkspaceBudgetDraft(tenantName: string, draft: WorkspaceBudgetDraft): Promise<WorkspaceBudgetDraft>;

	// ==========================================
	// Pod Settings
	// ==========================================
	
	/**
	 * Load the current general Pod settings.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getPodSettings(tenantName: string): Promise<PodSettingsFixture>;
	
	/**
	 * Apply a draft update to the Pod settings.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param draft      - The draft state.
	 */
	updatePodSettings(tenantName: string, draft: PodSettingsDraftFixture): Promise<PodSettingsFixture>;

	// ==========================================
	// Workspace Agents
	// ==========================================
	
	/**
	 * Load all configured agents for the workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceAgents(tenantName: string): Promise<WorkspaceAgent[]>;
	
	/**
	 * Load all connected channels mapped to workspace agents.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceAgentChannels(tenantName: string): Promise<WorkspaceAgentChannel[]>;
	
	/**
	 * Update a specific workspace agent configuration.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param agentId    - The unique identifier.
	 * @param update     - The fields to change.
	 */
	updateWorkspaceAgent(tenantName: string, agentId: string, update: Partial<WorkspaceAgent>): Promise<WorkspaceAgent>;
	
	/**
	 * Add a new agent to the workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param agent      - The agent configuration.
	 */
	addWorkspaceAgent(tenantName: string, agent: Partial<WorkspaceAgent>): Promise<WorkspaceAgent>;
	
	/**
	 * Remove a workspace agent by ID.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param agentId    - The unique identifier.
	 */
	removeWorkspaceAgent(tenantName: string, agentId: string): Promise<void>;
	
	/**
	 * Add a new channel for a workspace agent.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param typeId     - The unique identifier.
	 * @param credential - Optional credential payload.
	 */
	addWorkspaceAgentChannel(tenantName: string, typeId: string, credential?: string): Promise<WorkspaceAgentChannel>;
	
	/**
	 * Update an existing workspace agent channel.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param channelId  - The unique identifier.
	 * @param credential - Optional credential payload.
	 */
	updateWorkspaceAgentChannel(tenantName: string, channelId: string, credential?: string): Promise<WorkspaceAgentChannel>;
	
	/**
	 * Remove a workspace agent channel by ID.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param channelId  - The unique identifier.
	 */
	removeWorkspaceAgentChannel(tenantName: string, channelId: string): Promise<void>;
	
	/**
	 * Test connectivity to an agent channel provider.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param typeId     - The unique identifier.
	 * @param credential - Optional credential payload.
	 */
	testWorkspaceAgentChannel(tenantName: string, typeId: string, credential?: string): Promise<void>;

	// ==========================================
	// Connectors
	// ==========================================
	
	/**
	 * Load all configured external system connectors.
	 */
	getConnectors(): Promise<Connector[]>;
	
	/**
	 * Load available connector categories.
	 */
	getConnectorCategories(): Promise<ConnectorCategory[]>;
	
	/**
	 * Add a new connector configuration.
	 *
	 * @param connector - The connector configuration.
	 */
	addConnector(connector: Partial<Connector>): Promise<Connector>;
	
	/**
	 * Update an existing connector configuration.
	 *
	 * @param connectorId - The unique identifier.
	 * @param update      - The fields to change.
	 */
	updateConnector(connectorId: string, update: Partial<Connector>): Promise<Connector>;
	
	/**
	 * Remove a connector configuration.
	 *
	 * @param connectorId - The unique identifier.
	 */
	removeConnector(connectorId: string): Promise<void>;

	// ==========================================
	// LLM Providers
	// ==========================================
	
	/**
	 * Load all configured LLM providers for the workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 */
	getWorkspaceLlmProviders(tenantName: string): Promise<WorkspaceLlmProvider[]>;
	
	/**
	 * Test connectivity to an LLM provider endpoint.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param providerId - The unique identifier.
	 * @param credential - Optional credential payload.
	 */
	testWorkspaceLlmProviderConnection(tenantName: string, providerId: string, credential?: string): Promise<void>;
	
	/**
	 * Add a new LLM provider configuration to the workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param provider   - The provider configuration.
	 */
	addWorkspaceLlmProvider(tenantName: string, provider: Partial<WorkspaceLlmProvider>): Promise<WorkspaceLlmProvider>;
	
	/**
	 * Remove an LLM provider configuration from the workspace.
	 *
	 * @param tenantName - Stable pod/tenant identifier (the `/tenants/{name}` key).
	 * @param providerId - The unique identifier.
	 */
	removeWorkspaceLlmProvider(tenantName: string, providerId: string): Promise<void>;
	
	/**
	 * Load the list of supported LLM provider platforms.
	 */
	getLlmProviderOptions(): Promise<LlmProviderOption[]>;
	
	/**
	 * Load the standard model choices available.
	 */
	getLlmModelOptions(): Promise<string[]>;
	
	/**
	 * Load the analysis model choices available.
	 */
	getLlmAnalysisModelOptions(): Promise<string[]>;
	
	/**
	 * Load the available routing categories for LLM models.
	 */
	getModelRouteCategories(): Promise<ModelRouteCategory[]>;

	// ==========================================
	// Personal API Keys
	// ==========================================
	
	/**
	 * Load the personal API keys for the current user.
	 */
	getPersonalApiKeys(): Promise<PersonalApiKey[]>;
	
	/**
	 * Generate a new personal API key with the given name.
	 *
	 * @param name - The human-readable name.
	 */
	addPersonalApiKey(name: string): Promise<PersonalApiKey>;
	
	/**
	 * Revoke a personal API key by ID.
	 *
	 * @param keyId - The unique identifier.
	 */
	removePersonalApiKey(keyId: string): Promise<void>;
}

/** DI token for the active SettingsGateway implementation. */
export const SETTINGS_GATEWAY: InjectionToken<SettingsGateway> = new InjectionToken<SettingsGateway>("WO_SETTINGS_GATEWAY");
