import { Injectable, inject } from "@angular/core";

import { ControlPlaneApiService, DatasetAccess, EgressDomain, SkillRow, WorkspaceAgent, WorkspaceAgentChannel, WorkspaceAgentChannelType, Connector, ConnectorCategory, WorkspaceLlmProvider, CapabilityItem, DataNetworkDataset, LlmProviderOption, ModelRouteCategory } from "@opencrane/core";

import { AccountProfile, AccountProfileUpdate, AwarenessContractInfo, BudgetSpend, SettingsGateway, PersonalApiKey } from "./settings-gateway.types.js";
import { WorkspaceMember, WorkspaceOrgRow, WorkspaceProject } from "./workspace-members.types.js";
import { WorkspaceBudgetMember, WorkspaceBudgetDraft } from "./workspace-budgets.types.js";
import { PodSettingsFixture, PodSettingsDraftFixture } from "./pod-settings.types.js";
import { AccountTenantWire, BudgetSpendWire, DatasetsWire, EffectiveContractWire, PolicyWire, SkillCatalogWire } from "./settings-mapper.types.js";
import { _MapAccountProfile, _MapAccountUpdateToTenantPatch, _MapAwarenessContract, _MapBudgetSpend, _MapDatasetAccess, _MapEgressDomains, _MapSkills } from "./settings-mapper.util.js";

/**
 * Live SettingsGateway backed by the OpenCrane Tenants API.
 *
 * Issues typed `GET`/`PUT /tenants/{name}` through the shared `ControlPlaneApiService`
 * (the openapi-fetch client generated from the pinned contract) and maps the
 * `Tenant` response onto the `AccountProfile` read model. WeOwnAI never imports
 * OpenCrane source; this network contract is the only coupling.
 *
 * Bound as the default provider in the operator app via `provideControlPlaneGateways`.
 */
@Injectable()
export class OpenCraneSettingsGateway implements SettingsGateway
{
	/** Typed OpenCrane opencrane-ui client. */
	private readonly _api = inject(ControlPlaneApiService);

	/** @inheritdoc */
	public async getAccountProfile(tenantName: string): Promise<AccountProfile>
	{
		const { data, error } = await this._api.client.GET("/tenants/{name}", { params: { path: { name: tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load account profile: ${tenantName}`));
		}
		return _MapAccountProfile(data as AccountTenantWire, tenantName);
	}

	/** @inheritdoc */
	public async updateAccountProfile(tenantName: string, update: AccountProfileUpdate): Promise<AccountProfile>
	{
		const body = _MapAccountUpdateToTenantPatch(update);
		const { error } = await this._api.client.PUT("/tenants/{name}", { params: { path: { name: tenantName } }, body });
		if (error)
		{
			throw new Error(this._errorMessage(error, `failed to update account profile: ${tenantName}`));
		}
		// `PUT /tenants/{name}` returns only `{ name, status }`, not the full
		// tenant — re-read for the authoritative, fully-populated profile.
		return this.getAccountProfile(tenantName);
	}

	/** @inheritdoc */
	public async getBudgetSpend(tenantName: string): Promise<BudgetSpend>
	{
		const { data, error } = await this._api.client.GET("/ai-budget/{tenantName}/spend", { params: { path: { tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load budget spend: ${tenantName}`));
		}
		return _MapBudgetSpend(data as BudgetSpendWire);
	}

	/** @inheritdoc */
	public async getAwarenessContract(tenantName: string): Promise<AwarenessContractInfo>
	{
		const { data, error } = await this._api.client.GET("/tenants/{name}/effective-contract", { params: { path: { name: tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load awareness contract: ${tenantName}`));
		}
		return _MapAwarenessContract(data as EffectiveContractWire);
	}

	/** @inheritdoc */
	public async getDatasetAccess(tenantName: string): Promise<DatasetAccess[]>
	{
		const { data, error } = await this._api.client.GET("/tenants/{name}/datasets", { params: { path: { name: tenantName } } });
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, `failed to load dataset access: ${tenantName}`));
		}
		return _MapDatasetAccess(data as DatasetsWire);
	}

	/** @inheritdoc */
	public async getSkills(): Promise<SkillRow[]>
	{
		const { data, error } = await this._api.client.GET("/skills/catalog");
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, "failed to load skill catalogue"));
		}
		return _MapSkills(data as SkillCatalogWire[]);
	}

	/** @inheritdoc */
	public async getWorkspaceCapabilities(_tenantName: string): Promise<CapabilityItem[]>
	{
		throw new Error("WorkspaceCapabilities API not implemented in backend contracts yet.");
	}

	/** @inheritdoc */
	public async getEgressDomains(): Promise<EgressDomain[]>
	{
		const { data, error } = await this._api.client.GET("/policies");
		if (error || !data)
		{
			throw new Error(this._errorMessage(error, "failed to load egress policies"));
		}
		return _MapEgressDomains(data as PolicyWire[]);
	}

	/** @inheritdoc */
	public async getWorkspaceDataNetworks(_tenantName: string): Promise<DataNetworkDataset[]>
	{
		throw new Error("WorkspaceDataNetworks API not implemented in backend contracts yet.");
	}

	/** @inheritdoc */
	public async getWorkspaceEgressDomains(_tenantName: string): Promise<EgressDomain[]>
	{
		throw new Error("WorkspaceEgressDomains API not implemented in backend contracts yet.");
	}

	/** @inheritdoc */
	public async addWorkspaceEgressDomain(_tenantName: string, _domain: string, _purpose: string): Promise<EgressDomain>
	{
		throw new Error("WorkspaceEgressDomain add API not implemented in backend contracts yet.");
	}

	// ==========================================
	// Workspace Members (Not Implemented)
	// ==========================================
	
	/** @inheritdoc */
	public async getWorkspaceMembers(_tenantName: string): Promise<WorkspaceMember[]> 
	{
		throw new Error("WorkspaceMembers API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async getWorkspaceOrganization(_tenantName: string): Promise<WorkspaceOrgRow[]> 
	{
		throw new Error("WorkspaceOrganization API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async getWorkspaceProjects(_tenantName: string): Promise<WorkspaceProject[]> 
	{
		throw new Error("WorkspaceProjects API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async updateWorkspaceMember(_tenantName: string, _memberId: string, _update: Partial<WorkspaceMember>): Promise<WorkspaceMember> 
	{
		throw new Error("WorkspaceMember update API not implemented.");
	}
	
	/** @inheritdoc */
	public async addWorkspaceMember(_tenantName: string, _member: Partial<WorkspaceMember>): Promise<WorkspaceMember> 
	{
		throw new Error("WorkspaceMember add API not implemented.");
	}
	
	/** @inheritdoc */
	public async removeWorkspaceMember(_tenantName: string, _memberId: string): Promise<void> 
	{
		throw new Error("WorkspaceMember remove API not implemented.");
	}

	// ==========================================
	// Workspace Budgets (Not Implemented)
	// ==========================================
	
	/** @inheritdoc */
	public async getWorkspaceBudgetMembers(_tenantName: string): Promise<WorkspaceBudgetMember[]> 
	{
		throw new Error("WorkspaceBudgetMembers API not implemented.");
	}
	
	/** @inheritdoc */
	public async getWorkspaceBudgetDraft(_tenantName: string): Promise<WorkspaceBudgetDraft> 
	{
		throw new Error("WorkspaceBudgetDraft API not implemented.");
	}
	
	/** @inheritdoc */
	public async getWorkspaceBudgetResetDate(_tenantName: string): Promise<string> 
	{
		throw new Error("WorkspaceBudgetResetDate API not implemented.");
	}
	
	/** @inheritdoc */
	public async updateWorkspaceBudgetDraft(_tenantName: string, _draft: WorkspaceBudgetDraft): Promise<WorkspaceBudgetDraft> 
	{
		throw new Error("WorkspaceBudget update API not implemented.");
	}

	// ==========================================
	// Pod Settings (Not Implemented)
	// ==========================================
	
	/** @inheritdoc */
	public async getPodSettings(_tenantName: string): Promise<PodSettingsFixture> 
	{
		throw new Error("PodSettings API not implemented.");
	}
	
	/** @inheritdoc */
	public async updatePodSettings(_tenantName: string, _draft: PodSettingsDraftFixture): Promise<PodSettingsFixture> 
	{
		throw new Error("PodSettings update API not implemented.");
	}

	// ==========================================
	// Workspace Agents (Not Implemented)
	// ==========================================
	
	/** @inheritdoc */
	public async getWorkspaceAgents(_tenantName: string): Promise<WorkspaceAgent[]> 
	{
		throw new Error("WorkspaceAgents API not implemented.");
	}
	
	/** @inheritdoc */
	public async getWorkspaceAgentChannels(_tenantName: string): Promise<WorkspaceAgentChannel[]> 
	{
		throw new Error("WorkspaceAgentChannels API not implemented.");
	}
	
	/** @inheritdoc */
	public async updateWorkspaceAgent(_tenantName: string, _agentId: string, _update: Partial<WorkspaceAgent>): Promise<WorkspaceAgent> 
	{
		throw new Error("WorkspaceAgent update API not implemented.");
	}
	
	/** @inheritdoc */
	public async addWorkspaceAgent(_tenantName: string, _agent: Partial<WorkspaceAgent>): Promise<WorkspaceAgent> 
	{
		throw new Error("WorkspaceAgent add API not implemented.");
	}
	
	/** @inheritdoc */
	public async removeWorkspaceAgent(_tenantName: string, _agentId: string): Promise<void> 
	{
		throw new Error("WorkspaceAgent remove API not implemented.");
	}
	
	/** @inheritdoc */
	public async addWorkspaceAgentChannel(_tenantName: string, _typeId: string, _credential?: string): Promise<WorkspaceAgentChannel> 
	{
		throw new Error("WorkspaceAgentChannel add API not implemented.");
	}
	
	/** @inheritdoc */
	public async updateWorkspaceAgentChannel(_tenantName: string, _channelId: string, _credential?: string): Promise<WorkspaceAgentChannel> 
	{
		throw new Error("WorkspaceAgentChannel update API not implemented.");
	}
	
	/** @inheritdoc */
	public async removeWorkspaceAgentChannel(_tenantName: string, _channelId: string): Promise<void> 
	{
		throw new Error("WorkspaceAgentChannel remove API not implemented.");
	}
	
	/** @inheritdoc */
	public async getWorkspaceAgentChannelTypes(): Promise<WorkspaceAgentChannelType[]> 
	{
		throw new Error("WorkspaceAgentChannelType get API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async getWorkspaceAgentScopeOptions(_tenantName: string): Promise<
	{
		value: string; label: string }[]> { throw new Error("WorkspaceAgentScopeOptions get API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async testWorkspaceAgentChannel(_tenantName: string, _typeId: string, _credential?: string): Promise<void> 
	{
		throw new Error("WorkspaceAgentChannel test API not implemented.");
	}

	// ==========================================
	// Connectors (Not Implemented)
	// ==========================================
	
	/** @inheritdoc */
	public async getConnectors(): Promise<Connector[]> 
	{
		throw new Error("Connectors API not implemented.");
	}
	
	/** @inheritdoc */
	public async getConnectorCategories(): Promise<ConnectorCategory[]> 
	{
		throw new Error("ConnectorCategories API not implemented.");
	}
	
	/** @inheritdoc */
	public async addConnector(_connector: Partial<Connector>): Promise<Connector> 
	{
		throw new Error("Connector add API not implemented.");
	}
	
	/** @inheritdoc */
	public async updateConnector(_connectorId: string, _update: Partial<Connector>): Promise<Connector> 
	{
		throw new Error("Connector update API not implemented.");
	}
	
	/** @inheritdoc */
	public async removeConnector(_connectorId: string): Promise<void> 
	{
		throw new Error("Connector remove API not implemented.");
	}

	// ==========================================
	// LLM Providers (Not Implemented)
	// ==========================================
	
	/** @inheritdoc */
	public async getWorkspaceLlmProviders(_tenantName: string): Promise<WorkspaceLlmProvider[]> 
	{
		throw new Error("WorkspaceLlmProviders API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async testWorkspaceLlmProviderConnection(_tenantName: string, _providerId: string, _credential?: string): Promise<void> 
	{
		throw new Error("WorkspaceLlmProvider test connection API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async addWorkspaceLlmProvider(_tenantName: string, _provider: Partial<WorkspaceLlmProvider>): Promise<WorkspaceLlmProvider> 
	{
		throw new Error("WorkspaceLlmProvider add API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async removeWorkspaceLlmProvider(_tenantName: string, _providerId: string): Promise<void> 
	{
		throw new Error("WorkspaceLlmProvider remove API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async getLlmProviderOptions(): Promise<LlmProviderOption[]> 
	{
		throw new Error("LLM Provider options API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async getLlmModelOptions(): Promise<string[]> 
	{
		throw new Error("LLM Model options API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async getLlmAnalysisModelOptions(): Promise<string[]> 
	{
		throw new Error("LLM Analysis Model options API not implemented in backend contracts yet.");
	}
	
	/** @inheritdoc */
	public async getModelRouteCategories(): Promise<ModelRouteCategory[]> 
	{
		throw new Error("Model Route Categories API not implemented in backend contracts yet.");
	}

	// ==========================================
	// Personal API Keys (Not Implemented)
	// ==========================================
	
	/** @inheritdoc */
	public async getPersonalApiKeys(): Promise<PersonalApiKey[]> 
	{
		throw new Error("PersonalApiKeys API not implemented.");
	}
	
	/** @inheritdoc */
	public async addPersonalApiKey(_name: string): Promise<PersonalApiKey> 
	{
		throw new Error("PersonalApiKey add API not implemented.");
	}
	
	/** @inheritdoc */
	public async removePersonalApiKey(_keyId: string): Promise<void> 
	{
		throw new Error("PersonalApiKey remove API not implemented.");
	}

	/** Build a user-facing message from the API error payload, falling back to `fallback`.
	 *  Never surfaces `detail` — it may contain server internals. */
	private _errorMessage(error: unknown, fallback: string): string
	{
		if (!error || typeof error !== "object") return fallback;
		const e = error as Record<string, unknown>;
		if (typeof e["code"] === "string")
		{
			switch (e["code"])
			{
				case "UNAUTHORIZED": return "You are not authorised to perform this action.";
				case "FORBIDDEN": return "You do not have permission to perform this action.";
			}
		}
		if (typeof e["error"] === "string" && e["error"]) return e["error"];
		return fallback;
	}
}
