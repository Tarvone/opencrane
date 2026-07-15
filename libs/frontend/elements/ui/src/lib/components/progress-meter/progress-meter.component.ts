import { ChangeDetectionStrategy, Component, Signal, computed, input } from "@angular/core";

/** Usage meter with clamped progress and a textual threshold state. */
@Component({
	selector: "wo-progress-meter",
	standalone: true,
	templateUrl: "./progress-meter.component.html",
	styleUrl: "./progress-meter.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProgressMeterComponent
{
	/** Accessible subject announced with the current usage. */
	public readonly label = input.required<string>();

	/** Amount currently consumed. */
	public readonly used = input.required<number>();

	/** Maximum available amount. */
	public readonly limit = input.required<number>();

	/** Optional unit appended to displayed values. */
	public readonly unit = input<string>("");

	/** Optional prefix prepended to displayed values. */
	public readonly prefix = input<string>("");

	/** Percentage clamped to the visual range from zero to one hundred. */
	public readonly percentage: Signal<number> = computed((): number =>
	{
		if (this.limit() <= 0)
		{
			return 0;
		}
		return Math.min(100, Math.max(0, (this.used() / this.limit()) * 100));
	});

	/** Whether usage has reached the eighty-percent danger threshold. */
	public readonly isDanger: Signal<boolean> = computed((): boolean => this.percentage() >= 80);

	/** Human-readable state so threshold meaning never relies on colour. */
	public readonly status: Signal<string> = computed((): string => this.isDanger() ? "Near limit" : "On track");

	/** Full progress description announced by assistive technology. */
	public readonly valueText: Signal<string> = computed((): string =>
	{
		return `${this.prefix()}${this.used()}${this.unit()} of ${this.prefix()}${this.limit()}${this.unit()} used — ${this.status()}`;
	});
}
