import { Injectable } from "@angular/core";

import { DatasetAccess, EgressDomain, SkillRow, WorkspaceAgent, WorkspaceAgentChannel, WorkspaceAgentChannelType, Connector, ConnectorCategory, WorkspaceLlmProvider, CapabilityItem, DataNetworkDataset, LlmProviderOption, ModelRouteCategory } from "@opencrane/core";
import { DATASET_ACCESS, EGRESS_DOMAINS, SKILLS, DATA_NETWORK_DATASETS_FIXTURE } from "@opencrane/core/testing";
import { AccountProfile, AccountProfileUpdate, AwarenessContractInfo, BudgetSpend, SettingsGateway, WorkspaceMember, WorkspaceOrgRow, WorkspaceProject, WorkspaceBudgetMember, WorkspaceBudgetDraft, PodSettingsFixture, PodSettingsDraftFixture, PersonalApiKey } from "@opencrane/state/settings/adapter";

import { WORKSPACE_MEMBERS_FIXTURE, WORKSPACE_ORG_FIXTURE, WORKSPACE_PROJECTS_FIXTURE } from "./fixtures/members-section.fixtures.js";
import { WORKSPACE_BUDGET_DRAFT_FIXTURE, WORKSPACE_BUDGET_MEMBERS_FIXTURE } from "./fixtures/budgets-section.fixtures.js";
import { POD_SETTINGS_FIXTURE } from "./fixtures/pod-settings.fixtures.js";
import { WORKSPACE_AGENTS_FIXTURE, WORKSPACE_AGENT_CHANNELS_FIXTURE, WORKSPACE_AGENT_CHANNEL_TYPES_FIXTURE, WORKSPACE_AGENT_SCOPE_OPTIONS_FIXTURE } from "./fixtures/agent-settings.fixtures.js";
import { CONNECTORS_FIXTURE, CONNECTOR_CATEGORIES_FIXTURE } from "./fixtures/connectors.fixtures.js";
import { WORKSPACE_LLM_PROVIDERS_FIXTURE, LLM_PROVIDER_OPTIONS_FIXTURE, LLM_MODEL_OPTIONS_FIXTURE, LLM_ANALYSIS_MODEL_OPTIONS_FIXTURE, MODEL_ROUTE_CATEGORIES_FIXTURE } from "./fixtures/llm-provider.fixtures.js";
import { CAPABILITIES_FIXTURE } from "./fixtures/capabilities.fixtures.js";

const _FIXTURE: AccountProfile = { name: "alex.oc", fullName: "Alex Kim", email: "alex.kim@acme-corp.com", department: "Product", role: "member" };

/** In-memory SettingsGateway for tests — never imported by production code. */
@Injectable()
export class MockSettingsGateway implements SettingsGateway
{
	private readonly _byTenant = new Map<string, AccountProfile>();

	public getAccountProfile(tenantName: string): Promise<AccountProfile> 
	{
		return Promise.resolve({ ...this._seeded(tenantName) });
	}

	public updateAccountProfile(tenantName: string, update: AccountProfileUpdate): Promise<AccountProfile>
	{
		const current = this._seeded(tenantName);
		const next: AccountProfile = { ...current, fullName: update.fullName ?? current.fullName, department: update.department ?? current.department };
		this._byTenant.set(tenantName, next);
		return Promise.resolve({ ...next });
	}

	public getBudgetSpend(_t: string): Promise<BudgetSpend>
	{
		return Promise.resolve({
			monthlyLimitUsd: 150,
			currentSpendUsd: 124,
			alertState: "warning",
			resetDate: "Jul 1",
			modelClasses: [
				{ className: "Writing", modelNames: "claude-sonnet-4-6", spendUsd: 48, percentage: 39 },
				{ className: "Reasoning", modelNames: "claude-sonnet-4-6", spendUsd: 38, percentage: 31 },
				{ className: "Routing & Retrieval", modelNames: "haiku · gemini-flash", spendUsd: 10, percentage: 7 }
			]
		});
	}
	
	/** @inheritdoc */
	public getAwarenessContract(_t: string): Promise<AwarenessContractInfo> 
	{
		return Promise.resolve({ contractId: "contract-acme-corp", contractVersion: "v2.3.1", fallbackBehaviour: "proceed", citationMode: true });
	}
	
	/** @inheritdoc */
	public getDatasetAccess(_t: string): Promise<DatasetAccess[]> 
	{
		return Promise.resolve(DATASET_ACCESS.map((r): DatasetAccess => ({ ...r })));
	}
	
	/** @inheritdoc */
	public getSkills(): Promise<SkillRow[]> 
	{
		return Promise.resolve(SKILLS.map((r): SkillRow => ({ ...r })));
	}
	
	/** @inheritdoc */
	public getWorkspaceCapabilities(_tenantName: string): Promise<CapabilityItem[]> 
	{
		return Promise.resolve(structuredClone(CAPABILITIES_FIXTURE as unknown as CapabilityItem[]));
	}
	/** @inheritdoc */
	public getEgressDomains(): Promise<EgressDomain[]> 
	{
		return Promise.resolve(EGRESS_DOMAINS.map((r): EgressDomain => ({ ...r })));
	}
	
	/** @inheritdoc */
	public getWorkspaceDataNetworks(_tenantName: string): Promise<DataNetworkDataset[]> 
	{
		return Promise.resolve(structuredClone(DATA_NETWORK_DATASETS_FIXTURE as unknown as DataNetworkDataset[]));
	}
	
	/** @inheritdoc */
	public getWorkspaceEgressDomains(_tenantName: string): Promise<EgressDomain[]> 
	{
		return Promise.resolve(EGRESS_DOMAINS.map((r): EgressDomain => ({ ...r })));
	}
	
	/** @inheritdoc */
	public addWorkspaceEgressDomain(_tenantName: string, domain: string, purpose: string): Promise<EgressDomain> 
	{
		return Promise.resolve({ domain, purpose, status: "active" });
	}

	// Workspace Members
	
	/** @inheritdoc */
	public getWorkspaceMembers(_t: string): Promise<WorkspaceMember[]> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_MEMBERS_FIXTURE as unknown as WorkspaceMember[]));
	}
	
	/** @inheritdoc */
	public getWorkspaceOrganization(_t: string): Promise<WorkspaceOrgRow[]> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_ORG_FIXTURE as unknown as WorkspaceOrgRow[]));
	}
	
	/** @inheritdoc */
	public getWorkspaceProjects(_t: string): Promise<WorkspaceProject[]> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_PROJECTS_FIXTURE as unknown as WorkspaceProject[]));
	}
	
	/** @inheritdoc */
	public updateWorkspaceMember(_t: string, _id: string, _u: Partial<WorkspaceMember>): Promise<WorkspaceMember> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_MEMBERS_FIXTURE[0] as unknown as WorkspaceMember));
	}
	
	/** @inheritdoc */
	public addWorkspaceMember(_t: string, _u: Partial<WorkspaceMember>): Promise<WorkspaceMember> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_MEMBERS_FIXTURE[0] as unknown as WorkspaceMember));
	}
	
	/** @inheritdoc */
	public removeWorkspaceMember(_t: string, _id: string): Promise<void> 
	{
		return Promise.resolve();
	}

	// Workspace Budgets
	
	/** @inheritdoc */
	public getWorkspaceBudgetMembers(_t: string): Promise<WorkspaceBudgetMember[]> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_BUDGET_MEMBERS_FIXTURE as unknown as WorkspaceBudgetMember[]));
	}
	
	/** @inheritdoc */
	public getWorkspaceBudgetDraft(_t: string): Promise<WorkspaceBudgetDraft> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_BUDGET_DRAFT_FIXTURE as unknown as WorkspaceBudgetDraft));
	}
	
	/** @inheritdoc */
	public getWorkspaceBudgetResetDate(_t: string): Promise<string> 
	{
		return Promise.resolve("Jul 1, 2026");
	}
	
	/** @inheritdoc */
	public updateWorkspaceBudgetDraft(_t: string, draft: WorkspaceBudgetDraft): Promise<WorkspaceBudgetDraft> 
	{
		return Promise.resolve(structuredClone(draft));
	}

	// Pod Settings
	
	/** @inheritdoc */
	public getPodSettings(_t: string): Promise<PodSettingsFixture> 
	{
		return Promise.resolve(structuredClone(POD_SETTINGS_FIXTURE as unknown as PodSettingsFixture));
	}
	
	/** @inheritdoc */
	public updatePodSettings(_t: string, _draft: PodSettingsDraftFixture): Promise<PodSettingsFixture> 
	{
		return Promise.resolve(structuredClone(POD_SETTINGS_FIXTURE as unknown as PodSettingsFixture));
	}

	// Workspace Agents
	
	/** @inheritdoc */
	public getWorkspaceAgents(_t: string): Promise<WorkspaceAgent[]> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_AGENTS_FIXTURE as unknown as WorkspaceAgent[]));
	}
	
	/** @inheritdoc */
	public getWorkspaceAgentChannels(_t: string): Promise<WorkspaceAgentChannel[]> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_AGENT_CHANNELS_FIXTURE as unknown as WorkspaceAgentChannel[]));
	}
	
	/** @inheritdoc */
	public updateWorkspaceAgent(_t: string, agentId: string, update: Partial<WorkspaceAgent>): Promise<WorkspaceAgent> 
	{
		return Promise.resolve({ ...WORKSPACE_AGENTS_FIXTURE[0] as unknown as WorkspaceAgent, ...update, id: agentId });
	}
	
	/** @inheritdoc */
	public addWorkspaceAgentChannel(_t: string, typeId: string, _c: string): Promise<WorkspaceAgentChannel> 
	{
		return Promise.resolve({ ...WORKSPACE_AGENT_CHANNELS_FIXTURE[0] as unknown as WorkspaceAgentChannel, typeId });
	}
	
	/** @inheritdoc */
	public updateWorkspaceAgentChannel(_t: string, channelId: string, _c?: string): Promise<WorkspaceAgentChannel> 
	{
		return Promise.resolve({ ...WORKSPACE_AGENT_CHANNELS_FIXTURE[0] as unknown as WorkspaceAgentChannel, id: channelId });
	}
	
	/** @inheritdoc */
	public removeWorkspaceAgentChannel(_t: string, _c: string): Promise<void> 
	{
		return Promise.resolve();
	}
	
	/** @inheritdoc */
	public removeWorkspaceAgent(_t: string, _a: string): Promise<void> 
	{
		return Promise.resolve();
	}
	
	/** @inheritdoc */
	public getWorkspaceAgentChannelTypes(): Promise<WorkspaceAgentChannelType[]> 
	{
		return Promise.resolve([...WORKSPACE_AGENT_CHANNEL_TYPES_FIXTURE]);
	}
	
	/** @inheritdoc */
	public getWorkspaceAgentScopeOptions(_t: string): Promise<
	{
		value: string; label: string }[]> { return Promise.resolve([...WORKSPACE_AGENT_SCOPE_OPTIONS_FIXTURE]);
	}
	
	/** @inheritdoc */
	public addWorkspaceAgent(_t: string, _u: Partial<WorkspaceAgent>): Promise<WorkspaceAgent> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_AGENTS_FIXTURE[0] as unknown as WorkspaceAgent));
	}
	
	/** @inheritdoc */
	public testWorkspaceAgentChannel(_t: string, _typeId: string, _credential?: string): Promise<void> 
	{
		return Promise.resolve();
	}

	// Connectors
	
	/** @inheritdoc */
	public getConnectors(): Promise<Connector[]> 
	{
		return Promise.resolve(structuredClone(CONNECTORS_FIXTURE as unknown as Connector[]));
	}
	
	/** @inheritdoc */
	public getConnectorCategories(): Promise<ConnectorCategory[]> 
	{
		return Promise.resolve(structuredClone(CONNECTOR_CATEGORIES_FIXTURE as unknown as ConnectorCategory[]));
	}
	
	/** @inheritdoc */
	public addConnector(connector: Partial<Connector>): Promise<Connector> 
	{
		return Promise.resolve(structuredClone(CONNECTORS_FIXTURE[0] as unknown as Connector));
	}
	
	/** @inheritdoc */
	public updateConnector(_id: string, update: Partial<Connector>): Promise<Connector> 
	{
		return Promise.resolve(structuredClone({ ...CONNECTORS_FIXTURE[0], ...update } as unknown as Connector));
	}
	
	/** @inheritdoc */
	public removeConnector(_id: string): Promise<void> 
	{
		return Promise.resolve();
	}

	// LLM Providers
	
	/** @inheritdoc */
	public getWorkspaceLlmProviders(_t: string): Promise<WorkspaceLlmProvider[]> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_LLM_PROVIDERS_FIXTURE as unknown as WorkspaceLlmProvider[]));
	}
	
	/** @inheritdoc */
	public testWorkspaceLlmProviderConnection(_t: string, _p: string, _c?: string): Promise<void> 
	{
		return Promise.resolve();
	}
	
	/** @inheritdoc */
	public addWorkspaceLlmProvider(_t: string, provider: Partial<WorkspaceLlmProvider>): Promise<WorkspaceLlmProvider> 
	{
		return Promise.resolve(structuredClone(WORKSPACE_LLM_PROVIDERS_FIXTURE[0] as unknown as WorkspaceLlmProvider));
	}
	
	/** @inheritdoc */
	public removeWorkspaceLlmProvider(_t: string, _p: string): Promise<void> 
	{
		return Promise.resolve();
	}
	
	/** @inheritdoc */
	public getLlmProviderOptions(): Promise<LlmProviderOption[]> 
	{
		return Promise.resolve([...LLM_PROVIDER_OPTIONS_FIXTURE]);
	}
	
	/** @inheritdoc */
	public getLlmModelOptions(): Promise<string[]> 
	{
		return Promise.resolve([...LLM_MODEL_OPTIONS_FIXTURE]);
	}
	
	/** @inheritdoc */
	public getLlmAnalysisModelOptions(): Promise<string[]> 
	{
		return Promise.resolve([...LLM_ANALYSIS_MODEL_OPTIONS_FIXTURE]);
	}
	
	/** @inheritdoc */
	public getModelRouteCategories(): Promise<ModelRouteCategory[]> 
	{
		return Promise.resolve([...MODEL_ROUTE_CATEGORIES_FIXTURE]);
	}

	private _apiKeys: PersonalApiKey[] = [];

	// Personal API Keys
	
	/** @inheritdoc */
	public getPersonalApiKeys(): Promise<PersonalApiKey[]> 
	{
		return Promise.resolve([...this._apiKeys]);
	}
	
	/** @inheritdoc */
	public addPersonalApiKey(name: string): Promise<PersonalApiKey> { 
		const key: PersonalApiKey = { id: `key-${Date.now()}`, name, createdAt: new Date().toISOString(), redacted: "sk-wo_••••••••••••••••••••••••••••••••", rawKey: `sk-wo_${crypto.randomUUID().replace(/-/g, "")}` };
		this._apiKeys = [key, ...this._apiKeys];
		return Promise.resolve(key);
	}
	
	/** @inheritdoc */
	public removePersonalApiKey(id: string): Promise<void> { 
		this._apiKeys = this._apiKeys.filter(k => k.id !== id);
		return Promise.resolve();
	}

	private _seeded(tenantName: string): AccountProfile
	{
		const ex = this._byTenant.get(tenantName);
		if (ex) return ex;
		const s: AccountProfile = { ..._FIXTURE, name: tenantName };
		this._byTenant.set(tenantName, s);
		return s;
	}
}
