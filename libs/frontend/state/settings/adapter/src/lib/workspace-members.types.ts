/** A workspace person rendered in the People view. */
export interface WorkspaceMember
{
	/** Stable fixture identifier. */
	id: string;
	/** Display name. */
	name: string;
	/** Contact address. */
	email: string;
	/** Workspace role label. */
	role: string;
	/** Team label shown in the people grid. */
	team: string;
	/** Last activity label. */
	lastActive: string;
	/** Avatar initials. */
	avatar: string;
	/** Paper token used for the avatar surface. */
	avatarBackground: string;
}

/** A nested department/team row in the organization view. */
export interface WorkspaceOrgRow
{
	/** Stable fixture identifier. */
	id: string;
	/** Row kind used for indentation and actions. */
	kind: "department" | "team";
	/** Display name. */
	name: string;
	/** Parent department identifier for team rows. */
	departmentId?: string;
	/** Number of child teams. */
	teamCount: number;
	/** Number of members assigned to the row. */
	memberCount: number;
}

/** A workspace project row rendered below the organization tree. */
export interface WorkspaceProject
{
	/** Stable fixture identifier. */
	id: string;
	/** Project display name. */
	name: string;
	/** Project lifecycle badge. */
	status: "Active" | "Draft";
	/** Team count for the project. */
	teamCount: number;
	/** Member count for the project. */
	memberCount: number;
}

/** Draft fields shared by department, team, and project editors. */
export interface MembersEditorDraft
{
	/** Editable entity name. */
	name: string;
	/** Optional department selection for team drafts. */
	department: string;
	/** Optional lifecycle selection for project drafts. */
	status: "Active" | "Draft" | "Archived";
	/** Selected member identifiers for team drafts. */
	memberIds: readonly string[];
}

/** Editor route kind supported by the handoff sub-pages. */
export type MembersEditorKind = "department" | "team" | "project";
