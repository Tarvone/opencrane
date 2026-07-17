import { ChangeDetectionStrategy, Component, computed, inject, Signal, resource } from "@angular/core";
import { SETTINGS_GATEWAY, BudgetSpend } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { SectionHeadingComponent } from "@opencrane/elements/ui";

/**
 * Personal Budget view rendering model-class level usage.
 * Read-only; uses standard resource fetching without SettingsFormState overhead.
 */
@Component({
	selector: "wo-budget-section",
	standalone: true,
	imports: [SectionHeadingComponent],
	templateUrl: "./budget-section.component.html",
	styleUrl: "./budget-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class BudgetSectionComponent
{
	private readonly _gateway = inject(SETTINGS_GATEWAY);
	private readonly _tenant: Signal<string | undefined> = inject(ActiveTenantStore).tenant;

	/** Fetches the budget spend based on the active tenant. */
	public readonly spendResource = resource({
		params: () => this._tenant(),
		loader: async ({ params }) => {
			if (!params) throw new Error("No tenant");
			return this._gateway.getBudgetSpend(params);
		}
	});

	/** Settled spend data or undefined. */
	public readonly spend: Signal<BudgetSpend | undefined> = this.spendResource.value;

	/** Clamped percentage of monthly budget used. */
	public readonly spendPct: Signal<number> = computed((): number =>
	{
		const s = this.spend();
		if (!s || s.monthlyLimitUsd <= 0) {
			return 0;
		}
		const pct = Math.round((s.currentSpendUsd / s.monthlyLimitUsd) * 100);
		return Math.min(Math.max(pct, 0), 100);
	});

	/** True if usage is >= 80%. */
	public readonly isWarning: Signal<boolean> = computed(() => this.spendPct() >= 80);

	/** True if usage explicitly breached limit. */
	public readonly isExceeded: Signal<boolean> = computed(() => this.spend()?.alertState === "exceeded");

	/** Unified flag for styling text/bars red. */
	public readonly isRed: Signal<boolean> = computed(() => this.isWarning() || this.isExceeded());

	/** Formatted current spend. */
	public readonly formattedUsed: Signal<string> = computed(() => `$${this.spend()?.currentSpendUsd ?? 0}`);

	/** Formatted limit. */
	public readonly formattedLimit: Signal<string> = computed(() => `of $${this.spend()?.monthlyLimitUsd ?? 0}`);

	/** Formatted reset date. */
	public readonly formattedReset: Signal<string> = computed(() => `Resets ${this.spend()?.resetDate ?? ""}`);
}
