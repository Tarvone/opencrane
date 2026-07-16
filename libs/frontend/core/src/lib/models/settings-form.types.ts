/** Lifecycle phases shared by editable settings forms. */
export enum SettingsFormPhase
{
	/** Draft and accepted baseline match. */
	Pristine = "pristine",
	/** Draft differs from the baseline and passes validation. */
	Dirty = "dirty",
	/** Draft contains one or more control validation errors. */
	Invalid = "invalid",
	/** A captured draft is being submitted. */
	Pending = "pending",
	/** The captured draft was accepted and is now the baseline. */
	Success = "success",
	/** The stored value changed while the user was editing. */
	Conflict = "conflict",
	/** The mutation failed without discarding the valid draft. */
	RecoverableError = "recoverable-error"
}

/** Mutation outcomes produced by settings gateways and deterministic mocks. */
export enum SettingsMutationOutcome
{
	/** The captured draft was accepted. */
	Success = "success",
	/** The stored value changed and needs reconciliation. */
	Conflict = "conflict",
	/** The attempt failed and may be retried. */
	RecoverableError = "recoverable-error"
}

/** Accessible feedback kinds exposed by a settings form. */
export enum SettingsFormFeedbackKind
{
	/** A mutation completed successfully. */
	Success = "success",
	/** User action is required before a conflict can be resolved. */
	Conflict = "conflict",
	/** A recoverable mutation failure occurred. */
	Error = "error"
}

/** Validation messages keyed by stable control name. */
export interface SettingsValidationErrors
{
	/** Accessible validation message for each invalid control. */
	readonly [controlName: string]: string;
}

/** Visible, non-colour-only feedback announced by the form action area. */
export interface SettingsFormFeedback<TKind extends SettingsFormFeedbackKind = SettingsFormFeedbackKind>
{
	/** Determines the announcement semantics and available recovery actions. */
	readonly kind: TKind;
	/** Human-readable status or recovery guidance. */
	readonly message: string;
}

/** Values common to every reusable settings form phase. */
export interface SettingsFormSnapshot<TDraft>
{
	/** Last value accepted by the backing store. */
	readonly baseline: TDraft;
	/** Current user-authored value. */
	readonly draft: TDraft;
}

/** Pristine settings form with no unsaved work. */
export interface SettingsFormPristineState<TDraft> extends SettingsFormSnapshot<TDraft>
{
	/** Pristine phase discriminator. */
	readonly phase: SettingsFormPhase.Pristine;
	/** Empty validation map. */
	readonly validationErrors: SettingsValidationErrors;
}

/** Valid settings form containing unsaved user work. */
export interface SettingsFormDirtyState<TDraft> extends SettingsFormSnapshot<TDraft>
{
	/** Dirty phase discriminator. */
	readonly phase: SettingsFormPhase.Dirty;
	/** Empty validation map. */
	readonly validationErrors: SettingsValidationErrors;
}

/** Invalid settings form preserving the user's unsaved draft. */
export interface SettingsFormInvalidState<TDraft> extends SettingsFormSnapshot<TDraft>
{
	/** Invalid phase discriminator. */
	readonly phase: SettingsFormPhase.Invalid;
	/** Control-associated validation messages. */
	readonly validationErrors: SettingsValidationErrors;
}

/** Pending settings form with a required captured mutation draft. */
export interface SettingsFormPendingState<TDraft> extends SettingsFormSnapshot<TDraft>
{
	/** Pending phase discriminator. */
	readonly phase: SettingsFormPhase.Pending;
	/** Immutable snapshot used by the active mutation attempt. */
	readonly pendingDraft: TDraft;
	/** Empty validation map. */
	readonly validationErrors: SettingsValidationErrors;
}

/** Successful settings form whose accepted value is the new baseline. */
export interface SettingsFormSuccessState<TDraft> extends SettingsFormSnapshot<TDraft>
{
	/** Success phase discriminator. */
	readonly phase: SettingsFormPhase.Success;
	/** Empty validation map. */
	readonly validationErrors: SettingsValidationErrors;
	/** Accessible transient success announcement. */
	readonly feedback: SettingsFormFeedback<SettingsFormFeedbackKind.Success>;
}

/** Conflicting settings form with both preserved draft and latest stored value. */
export interface SettingsFormConflictState<TDraft> extends SettingsFormSnapshot<TDraft>
{
	/** Conflict phase discriminator. */
	readonly phase: SettingsFormPhase.Conflict;
	/** Most recent stored value offered for explicit reconciliation. */
	readonly latest: TDraft;
	/** Empty validation map. */
	readonly validationErrors: SettingsValidationErrors;
	/** Accessible conflict announcement. */
	readonly feedback: SettingsFormFeedback<SettingsFormFeedbackKind.Conflict>;
}

/** Recoverable settings form preserving a valid retryable draft. */
export interface SettingsFormRecoverableErrorState<TDraft> extends SettingsFormSnapshot<TDraft>
{
	/** Recoverable-error phase discriminator. */
	readonly phase: SettingsFormPhase.RecoverableError;
	/** Empty validation map. */
	readonly validationErrors: SettingsValidationErrors;
	/** Accessible recoverable error announcement. */
	readonly feedback: SettingsFormFeedback<SettingsFormFeedbackKind.Error>;
}

/** Phase-discriminated settings state that prevents incomplete pending and conflict shapes. */
export type SettingsFormState<TDraft> = SettingsFormPristineState<TDraft> | SettingsFormDirtyState<TDraft> | SettingsFormInvalidState<TDraft> | SettingsFormPendingState<TDraft> | SettingsFormSuccessState<TDraft> | SettingsFormConflictState<TDraft> | SettingsFormRecoverableErrorState<TDraft>;

/** Successful settings mutation result. */
export interface SettingsMutationSuccess<TDraft>
{
	/** Successful result discriminator. */
	readonly outcome: SettingsMutationOutcome.Success;
	/** Accepted value returned by the mutation boundary. */
	readonly accepted: TDraft;
	/** Accessible success announcement. */
	readonly message: string;
}

/** Conflicting settings mutation result. */
export interface SettingsMutationConflict<TDraft>
{
	/** Conflict result discriminator. */
	readonly outcome: SettingsMutationOutcome.Conflict;
	/** Latest stored value offered for explicit reload or reconciliation. */
	readonly latest: TDraft;
	/** Accessible conflict announcement. */
	readonly message: string;
}

/** Recoverable settings mutation error. */
export interface SettingsMutationRecoverableError
{
	/** Recoverable-error result discriminator. */
	readonly outcome: SettingsMutationOutcome.RecoverableError;
	/** Accessible error and retry guidance. */
	readonly message: string;
}

/** Result union returned by a settings mutation. */
export type SettingsMutationResult<TDraft> = SettingsMutationSuccess<TDraft> | SettingsMutationConflict<TDraft> | SettingsMutationRecoverableError;

/** Mutation boundary implemented by real gateways or deterministic mocks. */
export interface SettingsMutation<TDraft>
{
	/** Submit one captured draft and resolve its explicit outcome. */
	mutate(draft: TDraft): Promise<SettingsMutationResult<TDraft>>;
}

/** Deterministic mutation fixture used by settings reference forms. */
export interface SettingsMutationFixture<TDraft>
{
	/** Explicit mutation result returned for this attempt. */
	readonly result: SettingsMutationResult<TDraft>;
	/** Optional delay used to exercise locked pending state. */
	readonly delayMilliseconds?: number;
}

/** Minimal contract consumed by a reusable unsaved-navigation guard. */
export interface SettingsUnsavedNavigationSource
{
	/** Current phase used to decide whether leaving needs confirmation. */
	readonly phase: SettingsFormPhase;
}

/** Result returned by a reusable unsaved-navigation confirmation boundary. */
export type SettingsNavigationDecision = boolean | Promise<boolean>;

/** Confirmation boundary adapted by browser, router, or native-shell hosts. */
export interface SettingsUnsavedNavigationConfirmation
{
	/** Ask whether the user explicitly permits discarding unsaved settings work. */
	confirmDiscardChanges(source: SettingsUnsavedNavigationSource): SettingsNavigationDecision;
}

/** Destructive action lifecycle controlled by its owning feature. */
export enum DestructiveActionPhase
{
	/** Confirmation is available and no mutation is active. */
	Idle = "idle",
	/** Confirmation was accepted and the mutation is in flight. */
	Pending = "pending",
	/** The destructive mutation completed. */
	Success = "success",
	/** The destructive mutation failed and can be retried or cancelled. */
	Error = "error"
}

/** Controlled state presented by the destructive confirmation component. */
export interface DestructiveActionState
{
	/** Current destructive action phase. */
	readonly phase: DestructiveActionPhase;
	/** Accessible success or failure announcement. */
	readonly message?: string;
}
