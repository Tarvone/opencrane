import { SettingsMutation, SettingsMutationFixture, SettingsMutationResult } from "../../models/settings-form.types.js";
import { SettingsProfileDraftFixture } from "./settings-form-fixtures.types.js";

/** Accepted baseline for the representative settings form. */
export const SETTINGS_PROFILE_BASELINE_FIXTURE: SettingsProfileDraftFixture =
{
	displayName: "Alex Kim",
	notificationsEnabled: true
};

/** Deterministic queued mutation harness with no HTTP or identity dependency. */
export class MockSettingsMutation<TDraft> implements SettingsMutation<TDraft>
{
	/** Number of submitted attempts, including a currently pending attempt. */
	public callCount = 0;

	/** Captured drafts in submission order. */
	public readonly capturedDrafts: TDraft[] = [];

	/** Ordered outcomes consumed one per mutation attempt. */
	private readonly _fixtures: readonly SettingsMutationFixture<TDraft>[];

	/** Create a deterministic mutation harness from an ordered fixture queue. */
	public constructor(fixtures: readonly SettingsMutationFixture<TDraft>[])
	{
		this._fixtures = fixtures;
	}

	/** Capture a draft and resolve the next configured outcome after its delay. */
	public async mutate(draft: TDraft): Promise<SettingsMutationResult<TDraft>>
	{
		// 1. Capture a clone so subsequent edits cannot alter the pending attempt.
		this.callCount += 1;
		this.capturedDrafts.push(structuredClone(draft));

		// 2. Select the matching deterministic outcome so tests never depend on backend state.
		const fixture = this._fixtures[this.callCount - 1];
		if (fixture === undefined)
		{
			throw new Error(`No settings mutation fixture configured for attempt ${this.callCount}.`);
		}

		// 3. Preserve a configured pending window so duplicate-submission locking is testable.
		await new Promise<void>(function waitForFixture(resolve): void
		{
			setTimeout(function deliverFixture(): void
			{
				resolve();
			}, fixture.delayMilliseconds ?? 0);
		});

		return structuredClone(fixture.result);
	}
}
