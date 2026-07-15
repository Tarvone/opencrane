import { ChangeDetectionStrategy, Component, Signal, computed, input, model } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ToggleSwitchModule } from "primeng/toggleswitch";

/** Monotonic suffix used to keep switch relationships unique. */
let nextToggleFieldId = 0;

/** Allocate a stable id for one toggle-field instance. */
function _nextToggleFieldId(): string
{
	nextToggleFieldId += 1;
	return `wo-toggle-field-${nextToggleFieldId}`;
}

/** Paper-themed PrimeNG switch with labelled interaction states. */
@Component({
	selector: "wo-toggle-field",
	standalone: true,
	imports: [FormsModule, ToggleSwitchModule],
	templateUrl: "./toggle-field.component.html",
	styleUrl: "./toggle-field.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToggleFieldComponent
{
	/** Current on/off state with optional two-way binding. */
	public readonly value = model<boolean>(false);

	/** Accessible and visible label for the switch. */
	public readonly label = input.required<string>();

	/** Whether the visible label should remain screen-reader-only. */
	public readonly hideLabel = input<boolean>(false);

	/** Optional explanatory copy associated with the switch. */
	public readonly description = input<string | undefined>(undefined);

	/** Whether interaction is unavailable by policy or form state. */
	public readonly disabled = input<boolean>(false);

	/** Whether an update is in flight and interaction must pause. */
	public readonly pending = input<boolean>(false);

	/** Optional validation message. */
	public readonly error = input<string | undefined>(undefined);

	/** Unique id used for label and status relationships. */
	public readonly fieldId = _nextToggleFieldId();

	/** Id of the native input rendered by PrimeNG. */
	public readonly inputId = `${this.fieldId}-input`;

	/** Id of the visible switch label. */
	public readonly labelId = `${this.fieldId}-label`;

	/** Id of the optional switch description. */
	public readonly descriptionId = `${this.fieldId}-description`;

	/** Id of the pending status. */
	public readonly pendingId = `${this.fieldId}-pending`;

	/** Id of the validation status. */
	public readonly errorId = `${this.fieldId}-error`;

	/** Whether PrimeNG must prevent pointer and keyboard changes. */
	public readonly isBlocked: Signal<boolean> = computed((): boolean => this.disabled() || this.pending());

	/** Description ids applied directly to PrimeNG's native input via pass-through. */
	public readonly describedBy: Signal<string | undefined> = computed((): string | undefined =>
	{
		const ids: string[] = [];
		if (this.description())
		{
			ids.push(this.descriptionId);
		}
		if (this.pending())
		{
			ids.push(this.pendingId);
		}
		if (this.error())
		{
			ids.push(this.errorId);
		}
		return ids.length > 0 ? ids.join(" ") : undefined;
	});

	/** Attributes applied to the PrimeNG native input. */
	public readonly passThrough = computed(() =>
	{
		return { input: { "aria-describedby": this.describedBy() } };
	});

	/** Apply a user change only while interaction is available. */
	public onValueChange(nextValue: boolean): void
	{
		if (!this.isBlocked())
		{
			this.value.set(nextValue);
		}
	}
}
