import { MembersEditorDraft, WorkspaceMember, WorkspaceOrgRow, WorkspaceProject } from "@opencrane/state/settings/adapter";

/** Deterministic member fixtures covering role and activity states. */
export const WORKSPACE_MEMBERS_FIXTURE: readonly WorkspaceMember[] =
[
	{ id: "1", name: "Jente Rosseel", email: "jente@elewa.ke", role: "member", team: "Frontend", lastActive: "2 min ago", avatar: "JR", avatarBackground: "var(--oc-blue)" },
	{ id: "2", name: "Sarah Odhiambo", email: "sarah@elewa.ke", role: "member", team: "Marketing", lastActive: "1h ago", avatar: "SO", avatarBackground: "var(--oc-avatar-green)" },
	{ id: "3", name: "David Kimani", email: "david@elewa.ke", role: "member", team: "Backend", lastActive: "35 min ago", avatar: "DK", avatarBackground: "var(--oc-red)" },
	{ id: "4", name: "Amara Osei", email: "amara@elewa.ke", role: "viewer", team: "Ops Core", lastActive: "3d ago", avatar: "AO", avatarBackground: "var(--oc-amber)" },
	{ id: "5", name: "Liam van der Berg", email: "liam@elewa.ke", role: "admin", team: "Backend", lastActive: "Just now", avatar: "LB", avatarBackground: "var(--wo-scope-dept-accent)" }
];

/** Nested department and team fixtures used by the organization table. */
export const WORKSPACE_ORG_FIXTURE: readonly WorkspaceOrgRow[] =
[
	{ id: "eng", kind: "department", name: "Engineering", teamCount: 2, memberCount: 8 },
	{ id: "fe", kind: "team", name: "Frontend", departmentId: "eng", teamCount: 0, memberCount: 3 },
	{ id: "be", kind: "team", name: "Backend", departmentId: "eng", teamCount: 0, memberCount: 5 },
	{ id: "ops", kind: "department", name: "Operations", teamCount: 1, memberCount: 4 },
	{ id: "opst", kind: "team", name: "Ops Core", departmentId: "ops", teamCount: 0, memberCount: 4 },
	{ id: "growth", kind: "department", name: "Growth", teamCount: 1, memberCount: 3 },
	{ id: "mktg", kind: "team", name: "Marketing", departmentId: "growth", teamCount: 0, memberCount: 3 }
];

/** Project fixtures covering the Active and Draft handoff badges. */
export const WORKSPACE_PROJECTS_FIXTURE: readonly WorkspaceProject[] =
[
	{ id: "p1", name: "Customer Portal", status: "Active", teamCount: 2, memberCount: 6 },
	{ id: "p2", name: "Internal Automation", status: "Active", teamCount: 1, memberCount: 3 },
	{ id: "p3", name: "Data Pipeline", status: "Draft", teamCount: 2, memberCount: 4 }
];

/** Starting draft used by every editor sub-page. */
export const MEMBERS_EDITOR_FIXTURE: MembersEditorDraft = { name: "", department: "Engineering", status: "Active", memberIds: [] };
