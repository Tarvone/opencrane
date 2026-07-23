import { LlmProviderId, LlmProviderOption, ModelRouteCategory, ProviderConnectionOutcome, ProviderConnectionResult, ProviderMutationOutcome, ProviderMutationResult, WorkspaceLlmProvider, WorkspaceLlmProviderMutation } from "@opencrane/core";

/** Provider catalogue in the exact order used by the current design handoff. */
export const LLM_PROVIDER_OPTIONS_FIXTURE: readonly LlmProviderOption[] =
[
	{ id: LlmProviderId.Anthropic, name: "Anthropic", models: "claude-opus-4-7 · claude-sonnet-4-6 · claude-haiku-4-5" },
	{ id: LlmProviderId.OpenAi, name: "OpenAI", models: "gpt-4o · gpt-4o-mini · gpt-4-turbo" },
	{ id: LlmProviderId.GoogleAi, name: "Google AI", models: "gemini-2.0-flash · gemini-1.5-pro" },
	{ id: LlmProviderId.AzureOpenAi, name: "Azure OpenAI", models: "gpt-4o · gpt-4-turbo (your deployment)" },
	{ id: LlmProviderId.MistralAi, name: "Mistral AI", models: "mistral-large-2 · mistral-small" },
	{ id: LlmProviderId.Cohere, name: "Cohere", models: "command-r-plus · command-r" },
	{ id: LlmProviderId.AwsBedrock, name: "AWS Bedrock", models: "Claude 3 · Llama 3 (via AWS)" }
];

/** Configured provider rows contain safe metadata only and no secret-shaped values. */
export const WORKSPACE_LLM_PROVIDERS_FIXTURE: readonly WorkspaceLlmProvider[] =
[
	{ ...LLM_PROVIDER_OPTIONS_FIXTURE[0]!, models: "claude-opus-4-7 · claude-sonnet-4-6 · claude-haiku-4-5", added: "Jun 1, 2026", lastUsed: "2 min ago" },
	{ ...LLM_PROVIDER_OPTIONS_FIXTURE[2]!, added: "May 15, 2026", lastUsed: "4h ago" },
	{ ...LLM_PROVIDER_OPTIONS_FIXTURE[1]!, models: "gpt-4o · gpt-4o-mini", added: "Apr 3, 2026", lastUsed: "2d ago" }
];

/** Answer models available to routing controls. */
export const LLM_MODEL_OPTIONS_FIXTURE: readonly string[] =
[
	"claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "gpt-4o", "gpt-4o-mini", "gemini-2.0-flash", "gemini-1.5-pro", "azure · in-region", "mistral-large-2"
];

/** Fast, low-cost models offered for prompt classification. */
export const LLM_ANALYSIS_MODEL_OPTIONS_FIXTURE: readonly string[] =
[
	"claude-haiku-4-5", "gpt-4o-mini", "gemini-2.0-flash", "mistral-large-2"
];

/** Default category-to-model routing table from the current handoff. */
export const MODEL_ROUTE_CATEGORIES_FIXTURE: readonly ModelRouteCategory[] =
[
	{ id: "simple", name: "Simple / factual lookup", description: "Short questions, definitions, quick edits.", model: "claude-haiku-4-5" },
	{ id: "reasoning", name: "Complex reasoning", description: "Multi-step analysis, planning, maths.", model: "claude-opus-4-7" },
	{ id: "code", name: "Code & technical", description: "Writing, reviewing, or debugging code.", model: "claude-sonnet-4-6" },
	{ id: "creative", name: "Creative & writing", description: "Drafting, tone, long-form copy.", model: "claude-sonnet-4-6" },
	{ id: "confidential", name: "Confidential / sensitive", description: "PII or client-confidential content.", model: "azure · in-region" },
	{ id: "longctx", name: "Long context", description: "Large documents and transcripts.", model: "gemini-1.5-pro" }
];

/** Default mutation boundary: deterministic success without retaining credential text. */
export class MockWorkspaceLlmProviderMutation implements WorkspaceLlmProviderMutation
{
	public testCount = 0;
	public saveCount = 0;
	public removeCount = 0;

	public async testConnection(_providerId: LlmProviderId, _apiKey: string): Promise<ProviderConnectionResult>
	{
		this.testCount += 1;
		return { outcome: ProviderConnectionOutcome.Valid, message: "Connection successful." };
	}

	public async save(_providerId: LlmProviderId, _apiKey: string): Promise<ProviderMutationResult>
	{
		this.saveCount += 1;
		return { outcome: ProviderMutationOutcome.Success, message: "Provider key saved." };
	}

	public async remove(_providerId: LlmProviderId): Promise<ProviderMutationResult>
	{
		this.removeCount += 1;
		return { outcome: ProviderMutationOutcome.Success, message: "Provider key removed." };
	}
}
