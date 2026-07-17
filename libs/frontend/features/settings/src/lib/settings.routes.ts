import { Route, Routes } from "@angular/router";

import { SettingsPageComponent } from "./settings-page/settings-page.component.js";
import { SettingsPlaceholderComponent } from "./settings-placeholder/settings-placeholder.component.js";

/** Create a leaf route for a later-milestone settings section. */
function _placeholderRoute(path: string, title: string, description: string): Route
{
	return { path, component: SettingsPlaceholderComponent, data: { title, description } };
}

/** Workspace-owned settings routes in the canonical navigation order. */
const WORKSPACE_SETTINGS_ROUTES: Routes =
[
	{ path: "", pathMatch: "full", redirectTo: "pod" },
	{
		path: "pod",
		loadComponent: function loadPodSection()
		{
			return import("./sections/pod-section/pod-section.component.js").then(function pickPodSection(module)
			{
				return module.PodSectionComponent;
			});
		}
	},
	_placeholderRoute("members", "Members", "Workspace access, people, teams, and projects will be delivered in milestone 4."),
	_placeholderRoute("budgets", "Budgets", "Workspace allocations and member spend controls will be delivered in milestone 4."),
	{
		path: "skills",
		loadComponent: function loadSkillsSection()
		{
			return import("./sections/skills-section/skills-section.component.js").then(function pickSkillsSection(module)
			{
				return module.SkillsSectionComponent;
			});
		}
	},
	{
		path: "connectors",
		loadComponent: function loadConnectorsSection()
		{
			return import("./sections/connectors-section/connectors-section.component.js").then(function pickConnectorsSection(module)
			{
				return module.ConnectorsSectionComponent;
			});
		}
	},
	_placeholderRoute("agents", "Agents", "Agent and messaging-surface configuration will be delivered in milestone 4."),
	{
		path: "data-network",
		loadComponent: function loadDataNetworkSection()
		{
			return import("./sections/data-network-section/data-network-section.component.js").then(function pickDataNetworkSection(module)
			{
				return module.DataNetworkSectionComponent;
			});
		}
	},
	_placeholderRoute("provider-keys", "LLM Providers", "Workspace model-provider configuration will be delivered in milestone 4."),
	{ path: "**", redirectTo: "pod" }
];

/** Personal settings routes in the canonical navigation order. */
const PERSONAL_SETTINGS_ROUTES: Routes =
[
	{ path: "", pathMatch: "full", redirectTo: "account" },
	{
		path: "account",
		loadComponent: function loadAccountSection()
		{
			return import("./sections/account-section/account-section.component.js").then(function pickAccountSection(module)
			{
				return module.AccountSectionComponent;
			});
		}
	},
	{
		path: "awareness",
		loadComponent: function loadAwarenessSection()
		{
			return import("./sections/awareness-section/awareness-section.component.js").then(function pickAwarenessSection(module)
			{
				return module.AwarenessSectionComponent;
			});
		}
	},
	_placeholderRoute("budget", "My Budget", "Personal spend and model-class usage will be delivered in milestone 5."),
	_placeholderRoute("api-keys", "API Keys", "Personal API key management will be delivered in milestone 5."),
	{ path: "**", redirectTo: "account" }
];

/** Routed settings feature mounted by the workspace at `/settings`. */
export const SETTINGS_ROUTES: Routes =
[
	{
		path: "",
		component: SettingsPageComponent,
		children:
		[
			{ path: "", pathMatch: "full", redirectTo: "workspace/pod" },
			{ path: "workspace", children: WORKSPACE_SETTINGS_ROUTES },
			{ path: "personal", children: PERSONAL_SETTINGS_ROUTES },
			{ path: "**", redirectTo: "workspace/pod" }
		]
	}
];
