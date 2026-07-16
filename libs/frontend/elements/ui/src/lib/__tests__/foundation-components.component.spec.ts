// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ApplicationRef, Component, ComponentRef, EnvironmentInjector, Injector, InputSignal, WritableSignal, createComponent, runInInjectionContext, signal, ɵInputSignalNode, ɵSIGNAL, ɵresolveComponentResources } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AvatarCircleComponent } from "../components/avatar-circle/avatar-circle.component.js";
import { DestructiveConfirmationComponent } from "../components/destructive-confirmation/destructive-confirmation.component.js";
import { ProgressMeterComponent } from "../components/progress-meter/progress-meter.component.js";
import { SaveButtonComponent } from "../components/save-button/save-button.component.js";
import { SettingsRowComponent } from "../components/settings-row/settings-row.component.js";
import { ToggleFieldComponent } from "../components/toggle-field/toggle-field.component.js";
import { MockSettingsMutation, SETTINGS_PROFILE_BASELINE_FIXTURE, SettingsProfileDraftFixture } from "@opencrane/core/testing";
import { DestructiveActionPhase, SettingsFormPhase, SettingsFormState, SettingsMutationOutcome, _CreateSettingsFormState, _EditSettingsForm, _ResetSettingsForm, _ResolveSettingsForm, _SubmitSettingsForm } from "@opencrane/core";

/** Shared empty injector used to construct signal-input components. */
const TEST_INJECTOR = Injector.create({ providers: [] });

/** TestBed application used to attach low-level projected component fixtures. */
let testApplication: ApplicationRef;

/** TestBed environment used by low-level standalone component fixtures. */
let testEnvironment: EnvironmentInjector;

/** Resolve the external resource URL of one foundation component. */
function _componentResource(resourceUrl: string): string
{
	const component = resourceUrl.replace(/^\.\//, "").split(".component")[0];
	return _resource(`${component}/${resourceUrl.replace(/^\.\//, "")}`);
}

beforeAll(async function prepareAngularDom(): Promise<void>
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: false } });
	await ɵresolveComponentResources(async function loadComponentResource(resourceUrl: string): Promise<string>
	{
		const resource = _componentResource(resourceUrl);
		return resourceUrl.endsWith(".scss") ? compileString(resource).css : resource;
	});
	TestBed.configureTestingModule({});
	testApplication = TestBed.inject(ApplicationRef);
	testEnvironment = TestBed.inject(EnvironmentInjector);
});

afterAll(function releaseAngularDom(): void
{
	TestBed.resetTestEnvironment();
});

/** Apply a value to an input signal in a framework-light component unit test. */
function _setInput<T>(target: InputSignal<T>, value: T): void
{
	const node = target[ɵSIGNAL] as ɵInputSignalNode<T, T>;
	node.applyValueToInputSignal(node, value);
}

/** Construct an avatar in Angular's required injection context. */
function _avatar(): AvatarCircleComponent
{
	return runInInjectionContext(TEST_INJECTOR, function createAvatar(): AvatarCircleComponent
	{
		return new AvatarCircleComponent();
	});
}

/** Construct a progress meter in Angular's required injection context. */
function _progress(): ProgressMeterComponent
{
	return runInInjectionContext(TEST_INJECTOR, function createProgress(): ProgressMeterComponent
	{
		return new ProgressMeterComponent();
	});
}

/** Construct a toggle field in Angular's required injection context. */
function _toggle(): ToggleFieldComponent
{
	return runInInjectionContext(TEST_INJECTOR, function createToggle(): ToggleFieldComponent
	{
		return new ToggleFieldComponent();
	});
}

/** Read an elements/ui component resource from the project source root. */
function _resource(relativePath: string): string
{
	return readFileSync(resolve(process.cwd(), "src/lib/components", relativePath), "utf8");
}

/** Render a standalone component with explicit content-projection slots. */
function _render<T>(component: new (...args: never[]) => T, projectableNodes: Node[][] = []): ComponentRef<T>
{
	const host = document.createElement("div");
	document.body.append(host);
	const reference = createComponent(component, { environmentInjector: testEnvironment, hostElement: host, projectableNodes });
	testApplication.attachView(reference.hostView);
	return reference;
}

/** Run change detection and the post-render accessibility wiring. */
function _detect(reference: ComponentRef<unknown>): void
{
	reference.changeDetectorRef.detectChanges();
	testApplication.tick();
}

/** Fixture-backed reference form proving the controlled action contract end to end. */
@Component({
	selector: "wo-settings-reference-host",
	standalone: true,
	template: `
		<label for="reference-name">Display name</label>
		<input
			id="reference-name"
			type="text"
			[value]="state().draft.displayName"
			[disabled]="state().phase === SettingsFormPhase.Pending"
			[attr.aria-invalid]="state().phase === SettingsFormPhase.Invalid"
			aria-describedby="reference-errors"
			(input)="editName($event)"
		/>
		@if (state().validationErrors.displayName) {
			<p id="reference-errors" role="alert">{{ state().validationErrors.displayName }}</p>
		}
	`
})
class SettingsReferenceHostComponent
{
	/** Form phase enum exposed to the inline test template. */
	public readonly SettingsFormPhase = SettingsFormPhase;

	/** Representative form state consumed by the controlled action component. */
	public readonly state: WritableSignal<SettingsFormState<SettingsProfileDraftFixture>> = signal(_CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE));

	/** Deterministic retry sequence used instead of backend or live identity. */
	public readonly mutation = new MockSettingsMutation<SettingsProfileDraftFixture>([
		{
			result: {
				outcome: SettingsMutationOutcome.RecoverableError,
				message: "Profile save failed. Try again."
			},
			delayMilliseconds: 20
		},
		{
			result: {
				outcome: SettingsMutationOutcome.Success,
				accepted: { displayName: "Fixture Accepted", notificationsEnabled: true },
				message: "Profile saved."
			},
			delayMilliseconds: 20
		}
	]);

	/** Apply a control edit and associate validation with the native input. */
	public editName(event: Event): void
	{
		const displayName = (event.target as HTMLInputElement).value;
		const draft = { ...this.state().draft, displayName };
		const errors = displayName.trim().length === 0 ? { displayName: "Display name is required." } : {};
		this.state.set(_EditSettingsForm(this.state(), draft, errors));
	}

	/** Capture, submit, and externally resolve the current valid draft. */
	public async save(): Promise<void>
	{
		// 1. Capture the current draft so later control activity cannot change this attempt.
		const pending = _SubmitSettingsForm(this.state());
		this.state.set(pending);

		// 2. Delegate outcome selection to the deterministic mutation boundary.
		const result = await this.mutation.mutate(pending.pendingDraft as SettingsProfileDraftFixture);

		// 3. Apply the explicit outcome so presentation remains controlled by form state.
		this.state.set(_ResolveSettingsForm(this.state(), result));
	}

	/** Restore the last accepted baseline. */
	public reset(): void
	{
		this.state.set(_ResetSettingsForm(this.state()));
	}
}

describe("AvatarCircleComponent", function avatarCircleSuite(): void
{
	it("uses a named size, deterministic palette colour, and accessible name", function avatarState(): void
	{
		const first = _avatar();
		const second = _avatar();
		_setInput(first.initials, "AK");
		_setInput(first.accessibleName, "Alex Kim");
		_setInput(first.size, "large");
		_setInput(second.initials, "AK");

		expect(first.accessibleName()).toBe("Alex Kim");
		expect(first.sizePixels()).toBe(28);
		expect(first.backgroundColor()).toBe(second.backgroundColor());
		_setInput(first.color, "#0db5cc");
		expect(first.backgroundColor()).toBe("#0db5cc");
		expect(_resource("avatar-circle/avatar-circle.component.html")).toContain("role=\"img\"");
	});

	it("renders an accessible image with the requested geometry", function renderedAvatar(): void
	{
		const reference = _render(AvatarCircleComponent);
		_setInput(reference.instance.initials, "AK");
		_setInput(reference.instance.accessibleName, "Alex Kim");
		_setInput(reference.instance.size, "large");
		_setInput(reference.instance.color, "#0db5cc");
		_detect(reference);

		const avatar = reference.location.nativeElement.querySelector("[role='img']") as HTMLElement;
		expect(avatar.getAttribute("aria-label")).toBe("Alex Kim");
		expect(avatar.style.width).toBe("28px");
		expect(avatar.style.background).toBe("rgb(13, 181, 204)");
		reference.destroy();
	});
});

describe("ProgressMeterComponent", function progressMeterSuite(): void
{
	it("clamps over-limit usage and exposes the danger status as text", function dangerState(): void
	{
		const meter = _progress();
		_setInput(meter.label, "Monthly budget");
		_setInput(meter.used, 120);
		_setInput(meter.limit, 100);
		_setInput(meter.prefix, "$");

		expect(meter.percentage()).toBe(100);
		expect(meter.status()).toBe("Near limit");
		expect(meter.valueText()).toBe("$120 of $100 used — Near limit");
		_setInput(meter.used, 80);
		expect(meter.isDanger()).toBe(true);
		expect(_resource("progress-meter/progress-meter.component.html")).toContain("role=\"progressbar\"");
	});

	it("renders progress semantics and the visible threshold status", function renderedProgress(): void
	{
		const reference = _render(ProgressMeterComponent);
		_setInput(reference.instance.label, "Monthly budget");
		_setInput(reference.instance.used, 85);
		_setInput(reference.instance.limit, 100);
		_setInput(reference.instance.prefix, "$");
		_detect(reference);

		const progress = reference.location.nativeElement.querySelector("[role='progressbar']") as HTMLElement;
		expect(progress.getAttribute("aria-label")).toBe("Monthly budget");
		expect(progress.getAttribute("aria-valuenow")).toBe("85");
		expect(progress.getAttribute("aria-valuetext")).toBe("$85 of $100 used — Near limit");
		expect(reference.location.nativeElement.textContent).toContain("Near limit");
		reference.destroy();
	});

	it("clamps negative usage and handles a zero limit", function boundaryState(): void
	{
		const meter = _progress();
		_setInput(meter.label, "Storage");
		_setInput(meter.used, -5);
		_setInput(meter.limit, 0);

		expect(meter.percentage()).toBe(0);
		expect(meter.status()).toBe("On track");
	});
});

describe("SettingsRowComponent", function settingsRowSuite(): void
{
	it("projects content and wires row semantics to the native control", function renderedProjection(): void
	{
		const control = document.createElement("input");
		control.setAttribute("woSettingsControl", "");
		const help = document.createElement("p");
		help.setAttribute("woSettingsHelp", "");
		help.textContent = "Use your public name.";
		const error = document.createElement("p");
		error.setAttribute("woSettingsError", "");
		error.textContent = "A name is required.";
		const reference = _render(SettingsRowComponent, [[control], [help], [error]]);
		_setInput(reference.instance.label, "Display name");
		_setInput(reference.instance.description, "Shown to workspace members.");
		_setInput(reference.instance.controlId, "display-name");
		_setInput(reference.instance.invalid, true);
		_detect(reference);

		expect(control.id).toBe("display-name");
		expect(control.getAttribute("aria-labelledby")).toContain(reference.instance.labelId);
		expect(control.getAttribute("aria-describedby")).toContain(reference.instance.descriptionId);
		expect(control.getAttribute("aria-describedby")).toContain(reference.instance.helpId);
		expect(control.getAttribute("aria-describedby")).toContain(reference.instance.errorId);
		expect(control.getAttribute("aria-invalid")).toBe("true");
		expect(reference.location.nativeElement.textContent).toContain("Use your public name.");
		reference.destroy();
	});

	it("merges row relationships into a nested PrimeNG switch", function renderedNestedToggle(): void
	{
		const toggle = _render(ToggleFieldComponent);
		toggle.location.nativeElement.setAttribute("woSettingsControl", "");
		_setInput(toggle.instance.label, "Enabled");
		_setInput(toggle.instance.description, "Store each request cost.");
		_detect(toggle);

		const row = _render(SettingsRowComponent, [[toggle.location.nativeElement], [], []]);
		_setInput(row.instance.label, "Cost tracking");
		_setInput(row.instance.description, "Dual-write spend data to the audit log.");
		_detect(row);

		const control = toggle.location.nativeElement.querySelector("input") as HTMLInputElement;
		expect(control.getAttribute("aria-labelledby")).toContain(row.instance.labelId);
		expect(control.getAttribute("aria-labelledby")).toContain(toggle.instance.labelId);
		expect(control.getAttribute("aria-describedby")).toContain(row.instance.descriptionId);
		expect(control.getAttribute("aria-describedby")).toContain(toggle.instance.descriptionId);
		row.destroy();
		toggle.destroy();
	});

	it("defines the desktop grid and narrow-screen collapse", function responsiveState(): void
	{
		const styles = _resource("settings-row/settings-row.component.scss");

		expect(styles).toContain("grid-template-columns: 260px minmax(0, 1fr)");
		expect(styles).toContain("@media (max-width: 720px)");
		expect(styles).toContain("grid-template-columns: minmax(0, 1fr)");
	});
});

describe("ToggleFieldComponent", function toggleFieldSuite(): void
{
	it("labels the native switch and defines the Paper geometry", function normalState(): void
	{
		const toggle = _toggle();
		_setInput(toggle.label, "Citation mode");
		_setInput(toggle.description, "Require grounded citations.");
		const styles = _resource("toggle-field/toggle-field.component.scss");

		expect(toggle.describedBy()).toBe(toggle.descriptionId);
		expect(toggle.passThrough().input["aria-describedby"]).toBe(toggle.descriptionId);
		expect(styles).toContain("width: 44px");
		expect(styles).toContain("height: 24px");
		expect(styles).toContain("flex-shrink: 0");
		expect(styles).toContain("gap: 10px");
		expect(styles).toContain("width: 20px");
		expect(styles).toContain("height: 20px");
		expect(styles).toContain("inset-inline-start: 2px");
		expect(styles).toContain("inset-inline-start: 22px");
		expect(styles).toContain("box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18)");
		toggle.onValueChange(true);
		expect(toggle.value()).toBe(true);
	});

	it("renders native labelled, described, and disabled switch states", function renderedToggle(): void
	{
		const reference = _render(ToggleFieldComponent);
		_setInput(reference.instance.label, "Citation mode");
		_setInput(reference.instance.description, "Require grounded citations.");
		_setInput(reference.instance.disabled, true);
		_detect(reference);

		const control = reference.location.nativeElement.querySelector("input") as HTMLInputElement;
		const field = reference.location.nativeElement.querySelector(".wo-toggle__control") as HTMLElement;
		const toggleSwitch = reference.location.nativeElement.querySelector(".p-toggleswitch") as HTMLElement;
		const slider = reference.location.nativeElement.querySelector(".p-toggleswitch-slider") as HTMLElement;
		const handle = reference.location.nativeElement.querySelector(".p-toggleswitch-handle") as HTMLElement;
		const label = reference.location.nativeElement.querySelector(".wo-toggle__label") as HTMLElement;
		expect(control.disabled).toBe(true);
		expect(control.getAttribute("aria-labelledby")).toBe(reference.instance.labelId);
		expect(control.getAttribute("aria-describedby")).toContain(reference.instance.descriptionId);
		expect(getComputedStyle(field).gap).toBe("10px");
		expect(getComputedStyle(toggleSwitch).width).toBe("44px");
		expect(getComputedStyle(toggleSwitch).height).toBe("24px");
		expect(getComputedStyle(toggleSwitch).flexShrink).toBe("0");
		expect(getComputedStyle(slider).borderRadius).toBe("12px");
		expect(getComputedStyle(handle).width).toBe("20px");
		expect(getComputedStyle(handle).height).toBe("20px");
		expect(getComputedStyle(handle).insetInlineStart).toBe("2px");
		expect(getComputedStyle(handle).backgroundColor).toBe("rgb(255, 255, 255)");
		expect(getComputedStyle(handle).boxShadow).toBe("0 1px 3px rgba(0, 0, 0, 0.18)");
		expect(getComputedStyle(label).fontSize).toBe("13.5px");
		expect(getComputedStyle(label).color).toBe("var(--oc-text-secondary, #6a6660)");
		control.click();
		expect(reference.instance.value()).toBe(false);
		toggleSwitch.classList.add("p-toggleswitch-checked");
		expect(getComputedStyle(handle).insetInlineStart).toBe("22px");
		reference.location.nativeElement.dir = "rtl";
		toggleSwitch.classList.remove("p-toggleswitch-checked");
		expect(getComputedStyle(handle).insetInlineStart).toBe("2px");
		toggleSwitch.classList.add("p-toggleswitch-checked");
		expect(getComputedStyle(handle).insetInlineStart).toBe("22px");
		reference.destroy();
	});

	it("blocks changes and announces pending state", function pendingState(): void
	{
		const toggle = _toggle();
		_setInput(toggle.label, "Auto-update");
		_setInput(toggle.pending, true);

		toggle.onValueChange(true);
		expect(toggle.value()).toBe(false);
		expect(toggle.isBlocked()).toBe(true);
		expect(toggle.describedBy()).toContain(toggle.pendingId);
		expect(_resource("toggle-field/toggle-field.component.html")).toContain("role=\"status\"");
	});

	it("renders pending and validation state on the native switch", function renderedPendingError(): void
	{
		const reference = _render(ToggleFieldComponent);
		_setInput(reference.instance.label, "Auto-update");
		_setInput(reference.instance.pending, true);
		_setInput(reference.instance.error, "Update failed.");
		_detect(reference);

		const control = reference.location.nativeElement.querySelector("input") as HTMLInputElement;
		const status = reference.location.nativeElement.querySelector("[role='status']") as HTMLElement;
		const alert = reference.location.nativeElement.querySelector("[role='alert']") as HTMLElement;
		expect(control.disabled).toBe(true);
		expect(control.getAttribute("aria-describedby")).toContain(reference.instance.pendingId);
		expect(control.getAttribute("aria-describedby")).toContain(reference.instance.errorId);
		expect(status.textContent).toContain("Saving");
		expect(alert.textContent).toContain("Update failed.");
		reference.destroy();
	});

	it("blocks disabled switches and associates validation errors", function invalidState(): void
	{
		const toggle = _toggle();
		_setInput(toggle.label, "Cost tracking");
		_setInput(toggle.disabled, true);
		_setInput(toggle.error, "Selection is required.");

		toggle.onValueChange(true);
		expect(toggle.value()).toBe(false);
		expect(toggle.isBlocked()).toBe(true);
		expect(toggle.describedBy()).toContain(toggle.errorId);
		expect(_resource("toggle-field/toggle-field.component.html")).toContain("role=\"alert\"");
	});
});

describe("SaveButtonComponent", function saveButtonSuite(): void
{
	it("uses the authoritative Paper save-action recipe", function paperSaveStyles(): void
	{
		const styles = _resource("save-button/save-button.component.scss");

		expect(styles).toContain("padding: 10px 20px");
		expect(styles).toContain("border-radius: 7px");
		expect(styles).toContain("background: #0db5cc");
		expect(styles).toContain("box-shadow: 0 1px 0 #0a94a7, 0 2px 3px rgba(13, 181, 204, 0.25)");
		expect(styles).toContain("linear-gradient(135deg, #22c7dd 0%, #22c7dd 50%, #0db5cc 50%)");
	});

	it("keeps save disabled until external state permits submission", function controlledSubmission(): void
	{
		const reference = _render(SaveButtonComponent);
		_setInput(reference.instance.state, _CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE));
		let submissions = 0;
		reference.instance.submitIntent.subscribe(function recordSubmission(): void
		{
			submissions += 1;
		});
		_detect(reference);
		const button = reference.location.nativeElement.querySelector(".wo-save__button") as HTMLButtonElement;
		expect(button.disabled).toBe(true);

		const dirty = _EditSettingsForm(_CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE), { displayName: "Dirty", notificationsEnabled: true });
		_setInput(reference.instance.state, dirty);
		_detect(reference);
		button.click();
		expect(submissions).toBe(1);

		const pending = _SubmitSettingsForm(dirty);
		_setInput(reference.instance.state, pending);
		_detect(reference);
		button.click();
		expect(button.disabled).toBe(true);
		expect(button.textContent).toContain("Saving");
		expect(submissions).toBe(1);
		reference.destroy();
	});

	it("announces errors and exposes explicit conflict recovery intents", function recoveryPresentation(): void
	{
		const reference = _render(SaveButtonComponent);
		const dirty = _EditSettingsForm(_CreateSettingsFormState(SETTINGS_PROFILE_BASELINE_FIXTURE), { displayName: "Preserved", notificationsEnabled: true });
		const conflict = _ResolveSettingsForm(_SubmitSettingsForm(dirty), {
			outcome: SettingsMutationOutcome.Conflict,
			latest: { displayName: "Latest", notificationsEnabled: true },
			message: "The stored profile changed."
		});
		_setInput(reference.instance.state, conflict);
		_detect(reference);

		const alert = reference.location.nativeElement.querySelector("[role='alert']") as HTMLElement;
		const actions = Array.from(reference.location.nativeElement.querySelectorAll("button"), function buttonText(button): string
		{
			return button.textContent.trim();
		});
		expect(alert.textContent).toContain("stored profile changed");
		expect(actions).toEqual(["Return to editing", "Reload latest"]);
		expect(reference.location.nativeElement.textContent).not.toContain("Overwrite");
		reference.destroy();
	});
});

describe("DestructiveConfirmationComponent", function destructiveConfirmationSuite(): void
{
	it("names the impact, defaults focus to cancel, and restores the invoker", async function safeCancellation(): Promise<void>
	{
		const invoker = document.createElement("button");
		document.body.append(invoker);
		const reference = _render(DestructiveConfirmationComponent);
		_setInput(reference.instance.entityName, "API key Billing automation");
		_setInput(reference.instance.actionName, "Revoke");
		_setInput(reference.instance.impact, "Requests using this key will stop immediately.");
		_setInput(reference.instance.confirmationLabel, "Revoke API key");
		_setInput(reference.instance.focusTarget, invoker);
		_setInput(reference.instance.open, true);
		let cancellations = 0;
		reference.instance.cancelIntent.subscribe(function recordCancellation(): void
		{
			cancellations += 1;
		});
		_detect(reference);
		await Promise.resolve();

		const dialog = reference.location.nativeElement.querySelector("[role='alertdialog']") as HTMLElement;
		const cancel = reference.location.nativeElement.querySelector(".wo-destructive__cancel") as HTMLButtonElement;
		const confirm = reference.location.nativeElement.querySelector(".wo-destructive__confirm") as HTMLButtonElement;
		expect(dialog.textContent).toContain("Revoke API key Billing automation?");
		expect(dialog.textContent).toContain("Requests using this key will stop immediately.");
		expect(document.activeElement).toBe(cancel);
		cancel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
		expect(document.activeElement).toBe(confirm);
		confirm.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
		expect(document.activeElement).toBe(cancel);
		dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		await Promise.resolve();
		expect(cancellations).toBe(1);
		expect(document.activeElement).toBe(invoker);
		cancel.click();
		await Promise.resolve();
		expect(cancellations).toBe(2);
		reference.destroy();
		invoker.remove();
	});

	it("blocks duplicate confirmation while keeping pending focus inside and announces failure", async function pendingAndError(): Promise<void>
	{
		const reference = _render(DestructiveConfirmationComponent);
		_setInput(reference.instance.entityName, "pod Atlas");
		_setInput(reference.instance.actionName, "Delete");
		_setInput(reference.instance.impact, "All pod-local configuration will be removed.");
		_setInput(reference.instance.confirmationLabel, "Delete pod");
		_setInput(reference.instance.open, true);
		let confirmations = 0;
		reference.instance.confirmIntent.subscribe(function recordConfirmation(): void
		{
			confirmations += 1;
		});
		_detect(reference);
		await Promise.resolve();
		const confirm = reference.location.nativeElement.querySelector(".wo-destructive__confirm") as HTMLButtonElement;
		confirm.focus();
		expect(document.activeElement).toBe(confirm);
		_setInput(reference.instance.state, { phase: DestructiveActionPhase.Pending });
		_detect(reference);
		await Promise.resolve();
		const pendingStatus = reference.location.nativeElement.querySelector(".wo-destructive__pending") as HTMLElement;
		confirm.click();
		expect(confirm.disabled).toBe(true);
		expect(confirmations).toBe(0);
		expect(document.activeElement).toBe(pendingStatus);
		pendingStatus.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
		expect(document.activeElement).toBe(pendingStatus);

		_setInput(reference.instance.state, { phase: DestructiveActionPhase.Error, message: "Pod deletion failed. Try again." });
		_detect(reference);
		const alert = reference.location.nativeElement.querySelector("[role='alert']") as HTMLElement;
		expect(alert.textContent).toContain("deletion failed");
		confirm.click();
		expect(confirmations).toBe(1);
		reference.destroy();
	});

	it("announces success and restores a documented surviving target after close", async function successAndSurvivingFocus(): Promise<void>
	{
		const survivingTarget = document.createElement("button");
		document.body.append(survivingTarget);
		const reference = _render(DestructiveConfirmationComponent);
		_setInput(reference.instance.entityName, "API key Billing automation");
		_setInput(reference.instance.actionName, "Revoke");
		_setInput(reference.instance.impact, "Requests using this key will stop immediately.");
		_setInput(reference.instance.confirmationLabel, "Revoke API key");
		_setInput(reference.instance.focusTarget, survivingTarget);
		_setInput(reference.instance.state, { phase: DestructiveActionPhase.Success, message: "API key revoked." });
		_setInput(reference.instance.open, true);
		_detect(reference);
		await Promise.resolve();

		const status = reference.location.nativeElement.querySelector("[role='status']") as HTMLElement;
		expect(status.textContent).toContain("API key revoked");
		_setInput(reference.instance.open, false);
		_detect(reference);
		await Promise.resolve();
		expect(document.activeElement).toBe(survivingTarget);
		reference.destroy();
		survivingTarget.remove();
	});
});

describe("SettingsReferenceHostComponent", function settingsReferenceHostSuite(): void
{
	it("exercises validation, reset, pending locking, preserved retry, and success", async function completeReferenceFlow(): Promise<void>
	{
		vi.useFakeTimers();
		const fixture = TestBed.createComponent(SettingsReferenceHostComponent);
		const reference = fixture.componentRef;
		const actions = _render(SaveButtonComponent);
		actions.instance.submitIntent.subscribe(reference.instance.save.bind(reference.instance));
		actions.instance.resetIntent.subscribe(reference.instance.reset.bind(reference.instance));
		fixture.detectChanges();
		_setInput(actions.instance.state, reference.instance.state());
		_detect(actions);
		const input = reference.location.nativeElement.querySelector("input") as HTMLInputElement;
		const save = actions.location.nativeElement.querySelector(".wo-save__button") as HTMLButtonElement;

		input.value = "";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		fixture.detectChanges();
		_setInput(actions.instance.state, reference.instance.state());
		_detect(actions);
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(reference.location.nativeElement.querySelector("[role='alert']").textContent).toContain("required");
		expect(save.disabled).toBe(true);
		const reset = actions.location.nativeElement.querySelector(".wo-save__secondary") as HTMLButtonElement;
		reset.click();
		fixture.detectChanges();
		_setInput(actions.instance.state, reference.instance.state());
		_detect(actions);
		expect(reference.instance.state().phase).toBe(SettingsFormPhase.Pristine);
		expect(input.value).toBe("Alex Kim");

		input.value = "Fixture Draft";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		fixture.detectChanges();
		_setInput(actions.instance.state, reference.instance.state());
		_detect(actions);
		expect(save.disabled).toBe(false);
		save.click();
		fixture.detectChanges();
		_setInput(actions.instance.state, reference.instance.state());
		_detect(actions);
		expect(input.disabled).toBe(true);
		expect(save.disabled).toBe(true);
		expect(reference.instance.mutation.capturedDrafts[0]?.displayName).toBe("Fixture Draft");

		await vi.advanceTimersByTimeAsync(20);
		fixture.detectChanges();
		_setInput(actions.instance.state, reference.instance.state());
		_detect(actions);
		expect(reference.instance.state().phase).toBe(SettingsFormPhase.RecoverableError);
		expect(reference.instance.state().draft.displayName).toBe("Fixture Draft");
		expect(actions.location.nativeElement.querySelector("[role='alert']").textContent).toContain("Try again");
		expect(save.textContent).toContain("Retry save");
		save.click();
		fixture.detectChanges();
		_setInput(actions.instance.state, reference.instance.state());
		_detect(actions);
		expect(input.disabled).toBe(true);
		expect(reference.instance.mutation.capturedDrafts[1]?.displayName).toBe("Fixture Draft");

		await vi.advanceTimersByTimeAsync(20);
		fixture.detectChanges();
		_setInput(actions.instance.state, reference.instance.state());
		_detect(actions);
		expect(reference.instance.state().phase).toBe(SettingsFormPhase.Success);
		expect(reference.instance.state().baseline.displayName).toBe("Fixture Accepted");
		expect(actions.location.nativeElement.querySelector("[role='status']").textContent).toContain("Profile saved");
		vi.useRealTimers();
		actions.destroy();
		fixture.destroy();
	});
});
