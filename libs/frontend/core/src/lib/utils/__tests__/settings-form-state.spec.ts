import { afterEach, describe, expect, it, vi } from "vitest";

import { MockSettingsMutation, SETTINGS_PROFILE_BASELINE_FIXTURE, SettingsProfileDraftFixture } from "@opencrane/core/testing";
import { SettingsFormFeedbackKind, SettingsFormPhase, SettingsMutationOutcome } from "../../models/settings-form.types.js";
import { _CanSubmitSettingsForm, _ConfirmSettingsNavigation, _CreateSettingsFormState, _DismissSettingsFormSuccess, _EditSettingsForm, _ReloadLatestSettingsForm, _ResetSettingsForm, _ResolveSettingsForm, _ReturnToEditingSettingsForm, _ShouldConfirmUnsavedNavigation, _SubmitSettingsForm } from "../settings-form-state.js";

afterEach(function restoreTimers(): void
{
	vi.useRealTimers();
});

describe("settings form transitions", function settingsFormTransitionsSuite(): void
{
	it("moves from pristine through invalid and valid dirty edits", function editTransitions(): void
	{
		const pristine = _CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE);
		const invalidDraft = { ...pristine.draft, displayName: "" };
		const invalid = _EditSettingsForm(pristine, invalidDraft, { displayName: "Display name is required." });
		const dirtyDraft = { ...invalid.draft, displayName: "Alex Rivera" };
		const dirty = _EditSettingsForm(invalid, dirtyDraft);

		expect(pristine.phase).toBe(SettingsFormPhase.Pristine);
		expect(invalid.phase).toBe(SettingsFormPhase.Invalid);
		expect(invalid.validationErrors.displayName).toBe("Display name is required.");
		expect(dirty.phase).toBe(SettingsFormPhase.Dirty);
		expect(dirty.draft.displayName).toBe("Alex Rivera");
		expect(_CanSubmitSettingsForm(invalid)).toBe(false);
		expect(_CanSubmitSettingsForm(dirty)).toBe(true);
	});

	it("returns to pristine when a valid edit matches the complete baseline", function revertedEdit(): void
	{
		const baseline = { displayName: "Alex", notificationsEnabled: true };
		const dirty = _EditSettingsForm(_CreateSettingsFormState(baseline), { ...baseline, displayName: "Changed" });
		const reverted = _EditSettingsForm(dirty, baseline);

		expect(reverted.phase).toBe(SettingsFormPhase.Pristine);
		expect(reverted.draft).toEqual(baseline);
	});

	it("captures one pending draft and blocks edits and duplicate submission", function pendingTransition(): void
	{
		const pristine = _CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE);
		const dirty = _EditSettingsForm(pristine, { ...pristine.draft, displayName: "Pending Name" });
		const pending = _SubmitSettingsForm(dirty);
		const attemptedEdit = _EditSettingsForm(pending, { ...pending.draft, displayName: "Late Edit" });

		expect(pending.phase).toBe(SettingsFormPhase.Pending);
		expect(pending.pendingDraft?.displayName).toBe("Pending Name");
		expect(_SubmitSettingsForm(pending)).toBe(pending);
		expect(attemptedEdit).toBe(pending);
		expect(_ResetSettingsForm(pending)).toBe(pending);
	});

	it("accepts success as the new pristine-equivalent baseline", function successTransition(): void
	{
		const dirty = _EditSettingsForm(_CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE), { displayName: "Accepted Name", notificationsEnabled: false });
		const success = _ResolveSettingsForm(_SubmitSettingsForm(dirty), {
			outcome: SettingsMutationOutcome.Success,
			accepted: dirty.draft,
			message: "Settings saved."
		});

		expect(success.phase).toBe(SettingsFormPhase.Success);
		expect(success.baseline).toEqual(dirty.draft);
		expect(success.draft).toEqual(dirty.draft);
		expect(success.feedback).toEqual({ kind: SettingsFormFeedbackKind.Success, message: "Settings saved." });
		expect(_CanSubmitSettingsForm(success)).toBe(false);
		expect(_ShouldConfirmUnsavedNavigation(success)).toBe(false);
		expect(_DismissSettingsFormSuccess(success).phase).toBe(SettingsFormPhase.Pristine);
	});

	it("preserves a conflict draft and requires explicit reload or return to editing", function conflictTransition(): void
	{
		const original = _CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE);
		const dirty = _EditSettingsForm(original, { ...original.draft, displayName: "My Draft" });
		const latest = { ...original.baseline, displayName: "Stored Elsewhere" };
		const conflict = _ResolveSettingsForm(_SubmitSettingsForm(dirty), {
			outcome: SettingsMutationOutcome.Conflict,
			latest,
			message: "The stored profile changed."
		});

		expect(conflict.phase).toBe(SettingsFormPhase.Conflict);
		expect(conflict.draft.displayName).toBe("My Draft");
		expect(conflict.latest).toEqual(latest);
		expect(_ShouldConfirmUnsavedNavigation(conflict)).toBe(true);
		expect(_ReturnToEditingSettingsForm(conflict).draft.displayName).toBe("My Draft");
		expect(_ReturnToEditingSettingsForm(conflict).phase).toBe(SettingsFormPhase.Dirty);
		expect(_ReloadLatestSettingsForm(conflict).draft).toEqual(latest);
		expect(_ReloadLatestSettingsForm(conflict).phase).toBe(SettingsFormPhase.Pristine);
	});

	it("preserves a recoverable-error draft for retry and supports reset", function errorAndResetTransitions(): void
	{
		const pristine = _CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE);
		const dirty = _EditSettingsForm(pristine, { ...pristine.draft, displayName: "Retry Me" });
		const failed = _ResolveSettingsForm(_SubmitSettingsForm(dirty), {
			outcome: SettingsMutationOutcome.RecoverableError,
			message: "Save failed. Try again."
		});

		expect(failed.phase).toBe(SettingsFormPhase.RecoverableError);
		expect(failed.draft.displayName).toBe("Retry Me");
		expect(_CanSubmitSettingsForm(failed)).toBe(true);
		expect(_ShouldConfirmUnsavedNavigation(failed)).toBe(true);
		expect(_SubmitSettingsForm(failed).pendingDraft?.displayName).toBe("Retry Me");
		expect(_ResetSettingsForm(failed)).toEqual(pristine);
	});

	it("prompts only for phases with unsaved user work", function navigationContract(): void
	{
		let confirmations = 0;
		const confirmation = {
			confirmDiscardChanges(): boolean
			{
				confirmations += 1;
				return false;
			}
		};

		expect(_ShouldConfirmUnsavedNavigation({ phase: SettingsFormPhase.Pristine })).toBe(false);
		expect(_ShouldConfirmUnsavedNavigation({ phase: SettingsFormPhase.Dirty })).toBe(true);
		expect(_ShouldConfirmUnsavedNavigation({ phase: SettingsFormPhase.Invalid })).toBe(true);
		expect(_ShouldConfirmUnsavedNavigation({ phase: SettingsFormPhase.Pending })).toBe(false);
		expect(_ShouldConfirmUnsavedNavigation({ phase: SettingsFormPhase.Conflict })).toBe(true);
		expect(_ConfirmSettingsNavigation({ phase: SettingsFormPhase.Pristine }, confirmation)).toBe(true);
		expect(_ConfirmSettingsNavigation({ phase: SettingsFormPhase.Dirty }, confirmation)).toBe(false);
		expect(confirmations).toBe(1);
	});
});

describe("MockSettingsMutation", function mockMutationSuite(): void
{
	it("deterministically exercises delayed success, conflict, and retryable error", async function queuedOutcomes(): Promise<void>
	{
		vi.useFakeTimers();
		const accepted: SettingsProfileDraftFixture = { displayName: "Accepted", notificationsEnabled: false };
		const latest: SettingsProfileDraftFixture = { displayName: "Latest", notificationsEnabled: true };
		const mutation = new MockSettingsMutation<SettingsProfileDraftFixture>([
			{ result: { outcome: SettingsMutationOutcome.Success, accepted, message: "Saved." }, delayMilliseconds: 250 },
			{ result: { outcome: SettingsMutationOutcome.Conflict, latest, message: "Changed elsewhere." } },
			{ result: { outcome: SettingsMutationOutcome.RecoverableError, message: "Try again." } }
		]);

		const delayed = mutation.mutate(accepted);
		expect(mutation.callCount).toBe(1);
		expect(mutation.capturedDrafts[0]).toEqual(accepted);
		await vi.advanceTimersByTimeAsync(249);
		let settled = false;
		delayed.then(function markSettled(): void
		{
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect((await delayed).outcome).toBe(SettingsMutationOutcome.Success);

		const conflict = mutation.mutate(accepted);
		await vi.runAllTimersAsync();
		expect((await conflict).outcome).toBe(SettingsMutationOutcome.Conflict);
		const error = mutation.mutate(accepted);
		await vi.runAllTimersAsync();
		expect((await error).outcome).toBe(SettingsMutationOutcome.RecoverableError);
	});
});
