import { ChangeDetectionStrategy, Component, ElementRef, Signal, afterRenderEffect, computed, inject, input } from "@angular/core";

/** Monotonic suffix used to keep row relationships unique. */
let nextSettingsRowId = 0;

/** Allocate a stable id for one settings-row instance. */
function _nextSettingsRowId(): string
{
	nextSettingsRowId += 1;
	return `wo-settings-row-${nextSettingsRowId}`;
}

/** Labelled settings field row: label + hint on the left, control on the right. */
@Component({
	selector: "wo-settings-row",
	standalone: true,
	templateUrl: "./settings-row.component.html",
	styleUrl: "./settings-row.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsRowComponent
{
	/** Host used to associate row copy with the projected interactive control. */
	private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

	/** Field label. */
	public readonly label = input.required<string>();

	/** Optional explanatory copy under the label. */
	public readonly description = input<string | undefined>(undefined);

	/** Optional id of a projected native form control. */
	public readonly controlId = input<string | undefined>(undefined);

	/** Whether projected validation content represents an invalid value. */
	public readonly invalid = input<boolean>(false);

	/** Unique relationship prefix for the row. */
	public readonly rowId = _nextSettingsRowId();

	/** Id used by the row's visible label. */
	public readonly labelId = `${this.rowId}-label`;

	/** Id used by the optional description. */
	public readonly descriptionId = `${this.rowId}-description`;

	/** Id used by projected help content. */
	public readonly helpId = `${this.rowId}-help`;

	/** Id used by projected validation content. */
	public readonly errorId = `${this.rowId}-error`;

	/** Descriptions associated with the projected control group. */
	public readonly describedBy: Signal<string> = computed((): string =>
	{
		const ids = [this.helpId, this.errorId];
		if (this.description())
		{
			ids.unshift(this.descriptionId);
		}
		return ids.join(" ");
	});

	/** Keep projected native controls wired to the row label and supporting copy. */
	public constructor()
	{
		afterRenderEffect((): void =>
		{
			const projected = this._host.nativeElement.querySelector<HTMLElement>("[woSettingsControl]");
			const control = projected?.matches("input, select, textarea, button, [role='switch']")
				? projected
				: projected?.querySelector<HTMLElement>("input, select, textarea, button, [role='switch']");
			if (!control)
			{
				return;
			}

			const labelledBy = new Set([this.labelId, ..._attributeIds(control, "aria-labelledby")]);
			const describedBy = new Set([...this.describedBy().split(" "), ..._attributeIds(control, "aria-describedby")]);
			control.setAttribute("aria-labelledby", Array.from(labelledBy).join(" "));
			control.setAttribute("aria-describedby", Array.from(describedBy).filter(Boolean).join(" "));
			control.setAttribute("aria-invalid", String(this.invalid()));
			if (this.controlId())
			{
				control.id = this.controlId() as string;
			}
		});
	}
}

/** Split an id-reference attribute into its non-empty ids. */
function _attributeIds(element: HTMLElement, attribute: string): string[]
{
	return (element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean);
}
