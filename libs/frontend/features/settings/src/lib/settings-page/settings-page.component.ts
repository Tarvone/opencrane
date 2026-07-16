import { ChangeDetectionStrategy, Component, ElementRef, Signal, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { filter, map } from "rxjs";

import { PERSONAL_SETTINGS_NAVIGATION, WORKSPACE_SETTINGS_NAVIGATION, _SettingsScopeFromUrl } from "../settings-navigation.js";
import { SettingsNavigationItem, SettingsScope } from "../settings-navigation.types.js";

/** Settings view: section nav + active section content. */
@Component({
	selector: "wo-settings-page",
	standalone: true,
	imports: [RouterLink, RouterLinkActive, RouterOutlet],
	templateUrl: "./settings-page.component.html",
	styleUrl: "./settings-page.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPageComponent
{
	/** Typed scope values exposed to the route-driven template. */
	public readonly scopes = SettingsScope;

	/** Router providing the canonical settings scope and section state. */
	private readonly _router = inject(Router);

	/** Settings host used to find the persistent routed-content focus target. */
	private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

	/** Active scope derived from completed router navigations. */
	public readonly activeScope: Signal<SettingsScope> = toSignal(this._router.events.pipe(
		filter((event): event is NavigationEnd => event instanceof NavigationEnd),
		map((event): SettingsScope => _SettingsScopeFromUrl(event.urlAfterRedirects))
	), { initialValue: _SettingsScopeFromUrl(this._router.url) });

	/** Navigation items for the active route scope. */
	public readonly navigation: Signal<readonly SettingsNavigationItem[]> = computed((): readonly SettingsNavigationItem[] =>
	{
		return this.activeScope() === SettingsScope.Personal ? PERSONAL_SETTINGS_NAVIGATION : WORKSPACE_SETTINGS_NAVIGATION;
	});

	/** Switch to another settings scope while preserving an already-active scope. */
	public async selectScope(scope: SettingsScope): Promise<void>
	{
		// 1. Active scope — return without navigation so the current route and draft component remain intact.
		if (scope === this.activeScope()) return;

		// 2. Scope default — enter the requested scope at its canonical first section.
		const destination = scope === SettingsScope.Personal ? "/settings/personal/account" : "/settings/workspace/pod";
		const navigated = await this._router.navigateByUrl(destination);

		// 3. Focus transfer — move keyboard users into the newly routed settings content after activation.
		if (navigated) this._host.nativeElement.querySelector<HTMLElement>(".wo-settings__content")?.focus();
	}
}
