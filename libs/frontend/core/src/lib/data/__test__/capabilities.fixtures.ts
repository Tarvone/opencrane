import { CapabilityGroup, CapabilityIcon, CapabilityIntegrationKind } from "../../models/capability.types.js";

/** Deterministic Workspace Skills groups copied from the authoritative App.dc.html handoff. */
export const CAPABILITY_GROUPS_FIXTURE: readonly CapabilityGroup[] =
[
	{
		id: "organisation",
		scope: "Organisation",
		items:
		[
			{ id: "develop-proposals", name: "Develop proposals", description: "Draft client proposals from briefs, past work, and rate cards.", icon: CapabilityIcon.Plane, mcpList: [], deptList: ["All departments"] },
			{ id: "develop-department-sops", name: "Develop department SOPs", description: "Turn recurring workflows into documented standard procedures.", icon: CapabilityIcon.Diamond, mcpList: [], deptList: ["All departments"] },
			{ id: "skill-builder", name: "Skill builder", description: "Create new skills for your agents from examples and instructions.", icon: CapabilityIcon.Pinwheel, mcpList: [], deptList: ["All departments"] }
		]
	},
	{
		id: "departments",
		scope: "Departments",
		items:
		[
			{ id: "campaign-planner", name: "Campaign planner", description: "Plan multi-channel campaigns with budget and timeline.", icon: CapabilityIcon.Boat, mcpList: [], deptList: ["Marketing"] },
			{ id: "seo-audit", name: "SEO audit", description: "Run technical and content audits for client sites.", icon: CapabilityIcon.Fox, mcpList: [{ label: "Ahrefs MCP", kind: CapabilityIntegrationKind.Mcp }], deptList: ["Marketing", "Engineering"] },
			{ id: "retainer-pricing", name: "Retainer pricing", description: "Build retainer scenarios from utilisation and rate data.", icon: CapabilityIcon.Star, mcpList: [{ label: "Odoo MCP", kind: CapabilityIntegrationKind.Mcp }], deptList: ["Business Development"] }
		]
	},
	{
		id: "teams",
		scope: "Teams",
		items:
		[
			{ id: "sprint-reporter", name: "Sprint reporter", description: "Summarise sprint progress and blockers for clients.", icon: CapabilityIcon.Lily, mcpList: [{ label: "Odoo MCP", kind: CapabilityIntegrationKind.Mcp }, { label: "GitHub", kind: CapabilityIntegrationKind.Tool }], deptList: ["Engineering · Frontend"] }
		]
	},
	{
		id: "personal",
		scope: "Personal",
		items:
		[
			{ id: "meeting-debriefs", name: "Meeting debriefs", description: "Turn your call notes into action items and follow-up emails.", icon: CapabilityIcon.Plane, mcpList: [], deptList: ["Only you"] }
		]
	}
];
