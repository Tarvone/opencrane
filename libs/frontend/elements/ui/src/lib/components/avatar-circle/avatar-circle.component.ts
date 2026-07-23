import { ChangeDetectionStrategy, Component, Signal, computed, input } from "@angular/core";

import type { AvatarCircleGeometry, AvatarCircleSize } from "./avatar-circle.types.js";

/** Geometry lookup for the documented avatar size variants. */
const AVATAR_GEOMETRY: Record<AvatarCircleSize, AvatarCircleGeometry> =
{
	xs: { diameter: 18, fontSize: 7.2 },
	small: { diameter: 20, fontSize: 8 },
	medium: { diameter: 24, fontSize: 9.6 },
	large: { diameter: 28, fontSize: 11.2 },
	xl: { diameter: 32, fontSize: 12.8 },
	profile: { diameter: 44, fontSize: 15 }
};

/** Accessible avatar palette from the Paper handoff. */
const AVATAR_PALETTE: readonly string[] = ["var(--oc-blue)", "var(--oc-avatar-green)", "var(--oc-red)", "var(--oc-amber)", "var(--wo-scope-dept)"];

/** Resolve a stable palette entry from the supplied initials. */
function _paletteIndex(initials: string): number
{
	const hash = Array.from(initials.trim().toUpperCase()).reduce(function add(total: number, character: string): number
	{
		return total + (character.codePointAt(0) ?? 0);
	}, 0);
	return hash % AVATAR_PALETTE.length;
}

/** Initials avatar with deterministic colour and documented size variants. */
@Component({
	selector: "wo-avatar-circle",
	standalone: true,
	templateUrl: "./avatar-circle.component.html",
	styleUrl: "./avatar-circle.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class AvatarCircleComponent
{
	/** Initials to render. */
	public readonly initials = input.required<string>();

	/** Accessible name announced instead of the abbreviated initials. */
	public readonly accessibleName = input.required<string>();

	/** Named diameter variant. */
	public readonly size = input<AvatarCircleSize>("medium");

	/** Optional fixed background for branded or context-specific avatars. */
	public readonly color = input<string | undefined>(undefined);

	/** Diameter resolved from the named size variant. */
	public readonly sizePixels: Signal<number> = computed((): number => AVATAR_GEOMETRY[this.size()].diameter);

	/** Initials font size resolved from the named size variant. */
	public readonly fontSizePixels: Signal<number> = computed((): number => AVATAR_GEOMETRY[this.size()].fontSize);

	/** Explicit background or stable palette colour resolved from the initials. */
	public readonly backgroundColor: Signal<string> = computed((): string =>
	{
		return this.color() ?? AVATAR_PALETTE[_paletteIndex(this.initials())];
	});
}
