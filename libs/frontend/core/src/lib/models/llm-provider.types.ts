/** Stable identifiers for providers offered by the Workspace LLM Providers handoff. */
export enum LlmProviderId
{
	Anthropic = "anthropic",
	OpenAi = "openai",
	GoogleAi = "google-ai",
	AzureOpenAi = "azure-openai",
	MistralAi = "mistral-ai",
	Cohere = "cohere",
	AwsBedrock = "aws-bedrock"
}

/** Provider choice shown on the Add Provider Key sub-page. */
export interface LlmProviderOption
{
	readonly id: LlmProviderId;
	readonly name: string;
	readonly models: string;
}

/** Safe provider status displayed by the list; it never contains key material. */
export interface WorkspaceLlmProvider extends LlmProviderOption
{
	readonly added: string;
	readonly lastUsed: string;
}

/** One prompt category and its selected answer model. */
export interface ModelRouteCategory
{
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly model: string;
}

/** Connection-test outcomes supported by the deterministic UI boundary. */
export enum ProviderConnectionOutcome
{
	Valid = "valid",
	Invalid = "invalid",
	RecoverableError = "recoverable-error"
}

/** Save and removal outcomes supported by the deterministic UI boundary. */
export enum ProviderMutationOutcome
{
	Success = "success",
	RecoverableError = "recoverable-error"
}

/** Result from testing a transient key. */
export interface ProviderConnectionResult
{
	readonly outcome: ProviderConnectionOutcome;
	readonly message: string;
}

/** Result from saving or removing a provider key. */
export interface ProviderMutationResult
{
	readonly outcome: ProviderMutationOutcome;
	readonly message: string;
}

/** Mockable boundary whose implementations must not retain the supplied key. */
export interface WorkspaceLlmProviderMutation
{
	testConnection(providerId: LlmProviderId, apiKey: string): Promise<ProviderConnectionResult>;
	save(providerId: LlmProviderId, apiKey: string): Promise<ProviderMutationResult>;
	remove(providerId: LlmProviderId): Promise<ProviderMutationResult>;
}

/** Accessible feedback projected beneath provider controls. */
export interface LlmProviderFeedback
{
	readonly kind: "success" | "error";
	readonly message: string;
}
