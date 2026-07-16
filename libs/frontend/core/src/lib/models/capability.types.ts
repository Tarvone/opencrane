/** Origami icon variants used by the authoritative capability handoff. */
export enum CapabilityIcon
{
	/** Three-facet paper plane. */
	Plane = "plane",
	/** Four-facet diamond. */
	Diamond = "diamond",
	/** Three-facet paper boat. */
	Boat = "boat",
	/** Three-facet fox. */
	Fox = "fox",
	/** Four-facet pinwheel. */
	Pinwheel = "pinwheel",
	/** Four-facet star. */
	Star = "star",
	/** Three-facet lily. */
	Lily = "lily"
}

/** Visual kinds supported by an inline capability integration tag. */
export enum CapabilityIntegrationKind
{
	/** Model Context Protocol integration. */
	Mcp = "mcp",
	/** Direct tool integration. */
	Tool = "tool"
}

/** One MCP or tool tag attached to a capability. */
export interface CapabilityIntegrationTag
{
	/** User-facing integration name. */
	readonly label: string;
	/** Visual and semantic integration kind. */
	readonly kind: CapabilityIntegrationKind;
}

/** One agent capability rendered inside a scope group. */
export interface CapabilityItem
{
	/** Stable fixture identity used for list tracking. */
	readonly id: string;
	/** User-facing capability name. */
	readonly name: string;
	/** Short explanation of what the capability enables. */
	readonly description: string;
	/** Origami icon variant shown beside the name. */
	readonly icon: CapabilityIcon;
	/** MCP and direct-tool integrations used by the capability. */
	readonly mcpList: readonly CapabilityIntegrationTag[];
	/** Department, team, or ownership labels that receive the capability. */
	readonly deptList: readonly string[];
}

/** Ordered capability collection for one organization scope. */
export interface CapabilityGroup
{
	/** Stable group identity used for list tracking and accessible labelling. */
	readonly id: string;
	/** User-facing scope heading. */
	readonly scope: string;
	/** Capabilities available at this scope. */
	readonly items: readonly CapabilityItem[];
}
