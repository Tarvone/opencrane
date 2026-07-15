import { ChangeDetectionStrategy, Component, Signal, computed, input } from "@angular/core";

import type { AvatarCircleSize } from "./avatar-circle.types.js";

/** Diameter lookup for the documented avatar size variants. */
const AVATAR_SIZE_PIXELS: Record<AvatarCircleSize, number> =
{
	xs: 18,
	small: 20,
	medium: 24,
	large: 28,
	xl: 32
};

/** Accessible avatar palette from the Paper handoff. */
const AVATAR_PALETTE: readonly string[] = ["#2a5c9a", "#2a7d4f", "#c1392b", "#9a6b2a", "#6a2a9a"];

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

	/** Diameter resolved from the named size variant. */
	public readonly sizePixels: Signal<number> = computed((): number => AVATAR_SIZE_PIXELS[this.size()]);

	/** Stable palette colour resolved from the initials. */
	public readonly backgroundColor: Signal<string> = computed((): string => AVATAR_PALETTE[_paletteIndex(this.initials())]);
}
