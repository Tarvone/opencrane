import { ScopeLevel } from "./scope.types.js";

/** A Cognee search mode definition. */
export interface SearchModeInfo
{
	/** Mode key. */
	label: string;
	/** What the mode does. */
	hint: string;
}

/** A Cognee scope dataset in the awareness contract settings. */
export interface CogneeDataset
{
	/** Stable dataset row id. */
	id: string;
	/** Scope level. */
	scope: ScopeLevel;
	/** Dataset display name. */
	name: string;
	/** Cognee dataset id. */
	datasetId: string;
	/** Whether the dataset is queried. */
	enabled: boolean;
	/** Extracted entity count. */
	entities: number;
	/** Chunk count. */
	chunks: number;
	/** Summary count. */
	summaries: number;
	/** Relationship count. */
	relationships: number;
	/** Last cognify run (relative). */
	lastCognify: string;
	/** Last cognify duration. */
	cognifyDuration: string;
	/** Cognify status ("completed" | "running" | "failed"). */
	cognifyStatus: string;
	/** Active search mode keys. */
	searchModes: string[];
	/** Freshness TTL in minutes. */
	freshnessMinutes: number;
	/** Citation coverage percentage. */
	citationCoverage: number;
	/** Connected source labels. */
	sources: string[];
}

/** A skill row in the skills table. */
export interface SkillRow
{
	/** Skill name. */
	name: string;
	/** Scope level. */
	scope: ScopeLevel;
	/** Version string. */
	version: string;
	/** OCI digest (or "—" for local). */
	digest: string;
	/** Status ("active" | "pending-promotion"). */
	status: string;
}

/** A dataset access membership row. */
export interface DatasetAccess
{
	/** Dataset label. */
	name: string;
	/** Scope level. */
	scope: ScopeLevel;
	/** Access mode ("read" | "read-write"). */
	access: string;
	/** Entry count. */
	entries: number;
	/** When access was granted. */
	granted: string;
}

/** An egress allowlist row. */
export interface EgressDomain
{
	/** Allowed domain. */
	domain: string;
	/** Why it is allowed. */
	purpose: string;
	/** Allowlist status. */
	status: string;
}
