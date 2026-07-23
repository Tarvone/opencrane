/** Origami icon variants used by the authoritative Skills handoff. */
export enum CapabilityIcon
{
	Plane = "plane",
	Diamond = "diamond",
	Boat = "boat",
	Fox = "fox",
	Pinwheel = "pinwheel",
	Star = "star",
	Lily = "lily"
}

/** Skills collections rendered in the current handoff order. */
export enum CapabilityCollection
{
	Shared = "shared",
	Personal = "personal",
	Available = "available"
}

/** Visual kinds supported by an inline capability integration tag. */
export enum CapabilityIntegrationKind
{
	Mcp = "mcp",
	Tool = "tool"
}

/** Scope kinds attached to shared capabilities. */
export enum CapabilityAccessKind
{
	Organization = "organization",
	Department = "department",
	Team = "team",
	Project = "project"
}

/** One MCP or direct-tool tag attached to a capability. */
export interface CapabilityIntegrationTag
{
	readonly label: string;
	readonly kind: CapabilityIntegrationKind;
}

/** One scope-access badge attached to a shared capability. */
export interface CapabilityAccessTag
{
	readonly label: string;
	readonly kind: CapabilityAccessKind;
}

/** One searchable skill rendered by the Workspace Skills catalogue. */
export interface CapabilityItem
{
	readonly id: string;
	readonly collection: CapabilityCollection;
	readonly name: string;
	readonly description: string;
	readonly icon: CapabilityIcon;
	readonly canManage: boolean;
	readonly accessList: readonly CapabilityAccessTag[];
	readonly integrationList: readonly CapabilityIntegrationTag[];
}
