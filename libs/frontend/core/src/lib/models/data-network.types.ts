import { ScopeLevel } from "./scope.types.js";

/** Cognee dataset projection rendered by Workspace Data & Network. */
export interface DataNetworkDataset
{
	/** Stable source dataset identity. */
	readonly id: string;
	/** Handoff-facing dataset name. */
	readonly name: string;
	/** Graph implementation label. */
	readonly graph: string;
	/** Number of nodes currently available to retrieval. */
	readonly nodes: number;
	/** Knowledge scope controlling dataset access. */
	readonly scope: ScopeLevel;
	/** Whether the source dataset is active. */
	readonly active: boolean;
}

/** Handoff-specific presentation fields layered over a Cognee dataset source. */
export interface DataNetworkDatasetPresentation
{
	/** Reader-facing dataset name. */
	readonly name: string;
	/** Reader-facing graph node count. */
	readonly nodes: number;
}

/** Result of validating and normalizing one egress host draft. */
export interface EgressDomainValidation
{
	/** Lowercase exact or leading-wildcard host when valid. */
	readonly normalizedDomain: string | null;
	/** Accessible validation feedback when invalid. */
	readonly error: string | null;
}

/** Outcomes supported by the mock egress-add boundary. */
export enum EgressMutationOutcome
{
	/** The domain was accepted into mounted fixture state. */
	Success = "success",
	/** The mock mutation failed safely and can be retried. */
	RecoverableError = "recoverable-error"
}

/** Result returned by the deterministic egress mutation boundary. */
export interface EgressMutationResult
{
	/** Explicit success or recoverable-error outcome. */
	readonly outcome: EgressMutationOutcome;
	/** Accessible outcome message. */
	readonly message: string;
}

/** Mockable egress mutation boundary consumed by Data & Network. */
export interface EgressMutation
{
	/** Resolve one normalized domain addition. */
	mutate(domain: string): Promise<EgressMutationResult>;
}

/** Deterministic fixture for one egress mutation attempt. */
export interface EgressMutationFixture
{
	/** Explicit result returned for the attempt. */
	readonly result: EgressMutationResult;
	/** Optional delay that exposes duplicate-submit locking. */
	readonly delayMilliseconds?: number;
}

/** Feedback presentation for a completed egress mutation. */
export enum EgressFeedbackKind
{
	/** Polite success announcement. */
	Success = "success",
	/** Assertive recoverable-error announcement. */
	Error = "error"
}

/** Accessible completed-action feedback. */
export interface EgressFeedback
{
	/** Live-region presentation kind. */
	readonly kind: EgressFeedbackKind;
	/** Human-readable outcome. */
	readonly message: string;
}
