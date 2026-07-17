/** Named avatar diameters supported by the shared initials primitive. */
export type AvatarCircleSize = "xs" | "small" | "medium" | "large" | "xl" | "profile";

/** Diameter and initials typography for a named avatar size. */
export interface AvatarCircleGeometry
{
	readonly diameter: number;
	readonly fontSize: number;
}
