import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";

/** Route-safe placeholder for a settings section delivered by a later milestone. */
@Component({
	selector: "wo-settings-placeholder",
	standalone: true,
	templateUrl: "./settings-placeholder.component.html",
	styleUrl: "./settings-placeholder.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPlaceholderComponent
{
	/** Active leaf route carrying the placeholder's display metadata. */
	private readonly _route = inject(ActivatedRoute);

	/** Intended settings section title. */
	public readonly title = String(this._route.snapshot.data["title"] ?? "Settings");

	/** Short explanation of the future section boundary. */
	public readonly description = String(this._route.snapshot.data["description"] ?? "This section is ready for its milestone implementation.");
}
