import { ChangeDetectionStrategy, Component, Signal, computed, inject } from "@angular/core";
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
}
