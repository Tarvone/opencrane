import { describe, expect, it } from "vitest";

import { SettingsFormPhase, SettingsMutationOutcome, SettingsMutationResult, SettingsUnsavedNavigationConfirmation } from "@opencrane/core";

import { BudgetsSectionComponent } from "./budgets-section.component.js";
import { WorkspaceBudgetDraft } from "./budgets-section.types.js";

/** Create the native-like number input event consumed by the component. */
function _limitEvent(value: string, valueAsNumber: number): Event
{
	return { target: { value, valueAsNumber } } as unknown as Event;
}

describe("Workspace Budgets component", function budgetsComponentSuite(): void
{
	it("edits totals and exposes invalid limits through shared form state", function edits(): void
	{
		const component = new BudgetsSectionComponent();
		component.editLimit("1", _limitEvent("200", 200));
		expect(component.formState().phase).toBe(SettingsFormPhase.Dirty);
		expect(component.totals()).toEqual({ spent: 273, allocated: 400 });

		component.editLimit("1", _limitEvent("-1", -1));
		expect(component.formState().phase).toBe(SettingsFormPhase.Invalid);
		expect(component.formState().validationErrors["1"]).toBeDefined();
	});

	it("locks duplicate submissions and resolves success", async function successfulSave(): Promise<void>
	{
		const component = new BudgetsSectionComponent();
		let resolveMutation: ((result: SettingsMutationResult<WorkspaceBudgetDraft>) => void) | undefined;
		component.mutation = { mutate: function mutate(): Promise<SettingsMutationResult<WorkspaceBudgetDraft>> { return new Promise(function pending(resolve): void { resolveMutation = resolve; }); } };
		component.editLimit("2", _limitEvent("75", 75));
		const firstSave = component.submit();
		const secondSave = component.submit();
		expect(component.formState().phase).toBe(SettingsFormPhase.Pending);
		resolveMutation?.({ outcome: SettingsMutationOutcome.Success, accepted: component.formState().draft, message: "Saved." });
		await Promise.all([firstSave, secondSave]);
		expect(component.formState().phase).toBe(SettingsFormPhase.Success);
	});

	it("preserves the captured draft after conflict and recoverable error", async function recovery(): Promise<void>
	{
		const component = new BudgetsSectionComponent();
		component.editLimit("3", _limitEvent("90", 90));
		const edited = structuredClone(component.formState().draft);
		component.mutation = { mutate: async function conflict(): Promise<SettingsMutationResult<WorkspaceBudgetDraft>> { return { outcome: SettingsMutationOutcome.Conflict, latest: { limits: { ...edited.limits, "3": 80 } }, message: "Changed elsewhere." }; } };
		await component.submit();
		expect(component.formState().phase).toBe(SettingsFormPhase.Conflict);
		expect(component.formState().draft).toEqual(edited);
		component.returnToEditing();
		component.mutation = { mutate: async function error(): Promise<SettingsMutationResult<WorkspaceBudgetDraft>> { return { outcome: SettingsMutationOutcome.RecoverableError, message: "Try again." }; } };
		await component.submit();
		expect(component.formState().phase).toBe(SettingsFormPhase.RecoverableError);
		expect(component.formState().draft).toEqual(edited);
	});

	it("confirms only unsafe navigation phases", function navigation(): void
	{
		const component = new BudgetsSectionComponent();
		let prompts = 0;
		const confirmation: SettingsUnsavedNavigationConfirmation = { confirmDiscardChanges: function confirm(): boolean { prompts += 1; return false; } };
		expect(component.canDeactivate(confirmation)).toBe(true);
		component.editLimit("4", _limitEvent("30", 30));
		expect(component.canDeactivate(confirmation)).toBe(false);
		expect(prompts).toBe(1);
	});
});
