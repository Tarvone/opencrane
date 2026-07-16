// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ɵresolveComponentResources } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { Route, Router, Routes, provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PERSONAL_SETTINGS_NAVIGATION, WORKSPACE_SETTINGS_NAVIGATION, _SettingsNavigationForUrl, _SettingsScopeFromUrl } from "../settings-navigation.js";
import { SettingsScope, SettingsSectionId } from "../settings-navigation.types.js";
import { SettingsPlaceholderComponent } from "../settings-placeholder/settings-placeholder.component.js";
import { SETTINGS_ROUTES } from "../settings.routes.js";

/** Resolve an external settings component template or stylesheet. */
function _componentResource(resourceUrl: string): string
{
	const file = resourceUrl.replace(/^\.\//, "");
	const folder = file.startsWith("settings-page") ? "settings-page" : "settings-placeholder";
	return readFileSync(resolve(process.cwd(), "src/lib", folder, file), "utf8");
}

/** Return the settings shell's child routes. */
function _shellChildren(): Route[]
{
	return SETTINGS_ROUTES[0]?.children ?? [];
}

/** Return the children declared for one settings scope. */
function _scopeChildren(scope: SettingsScope): Route[]
{
	return _shellChildren().find(function findScope(route): boolean { return route.path === scope; })?.children ?? [];
}

/** Replace lazy production leaves with the placeholder while preserving the real redirect tree. */
function _testableRoutes(routes: Routes): Routes
{
	return routes.map(function testableRoute(route): Route
	{
		if (route.children) return { ...route, children: _testableRoutes(route.children) };
		if (route.redirectTo !== undefined || route.component) return route;
		return { ...route, loadComponent: undefined, component: SettingsPlaceholderComponent };
	});
}

beforeAll(async function prepareAngularRouter(): Promise<void>
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
	await ɵresolveComponentResources(async function loadComponentResource(resourceUrl: string): Promise<string>
	{
		const resource = _componentResource(resourceUrl);
		return resourceUrl.endsWith(".scss") ? compileString(resource).css : resource;
	});
});

beforeEach(function configureRouter(): void
{
	TestBed.configureTestingModule({
		providers: [provideRouter([{ path: "settings", children: _testableRoutes(SETTINGS_ROUTES) }])]
	});
});

afterEach(function resetRouter(): void
{
	TestBed.resetTestingModule();
});

afterAll(function releaseAngularRouter(): void
{
	TestBed.resetTestEnvironment();
});

describe("settings navigation contract", function settingsNavigationSuite(): void
{
	it("keeps workspace labels, stable identities, and routes in handoff order", function workspaceNavigation(): void
	{
		expect(WORKSPACE_SETTINGS_NAVIGATION.map(function identity(item): SettingsSectionId { return item.id; })).toEqual([
			SettingsSectionId.Pod,
			SettingsSectionId.Members,
			SettingsSectionId.Budgets,
			SettingsSectionId.Capabilities,
			SettingsSectionId.Connectors,
			SettingsSectionId.Channels,
			SettingsSectionId.DataNetwork,
			SettingsSectionId.ProviderKeys
		]);
		expect(WORKSPACE_SETTINGS_NAVIGATION.map(function label(item): string { return item.label; })).toEqual([
			"Pod", "Members", "Budgets", "Skills", "Connectors", "Channels", "Data & Network", "API Keys"
		]);
		expect(WORKSPACE_SETTINGS_NAVIGATION.map(function route(item): string { return item.route; })).toEqual([
			"/settings/workspace/pod",
			"/settings/workspace/members",
			"/settings/workspace/budgets",
			"/settings/workspace/skills",
			"/settings/workspace/connectors",
			"/settings/workspace/channels",
			"/settings/workspace/data-network",
			"/settings/workspace/provider-keys"
		]);
	});

	it("keeps personal labels and routes in handoff order", function personalNavigation(): void
	{
		expect(PERSONAL_SETTINGS_NAVIGATION.map(function label(item): string { return item.label; })).toEqual([
			"Account", "Awareness", "My Budget", "API Keys"
		]);
		expect(PERSONAL_SETTINGS_NAVIGATION.map(function route(item): string { return item.route; })).toEqual([
			"/settings/personal/account",
			"/settings/personal/awareness",
			"/settings/personal/budget",
			"/settings/personal/api-keys"
		]);
	});

	it("derives the visible navigation group from the routed scope", function navigationScope(): void
	{
		expect(_SettingsScopeFromUrl("/settings/workspace/pod")).toBe(SettingsScope.Workspace);
		expect(_SettingsScopeFromUrl("/settings/personal/account")).toBe(SettingsScope.Personal);
		expect(_SettingsNavigationForUrl("/settings/workspace/skills")).toBe(WORKSPACE_SETTINGS_NAVIGATION);
		expect(_SettingsNavigationForUrl("/settings/personal/budget")).toBe(PERSONAL_SETTINGS_NAVIGATION);
	});
});

describe("settings route contract", function settingsRoutesSuite(): void
{
	it("declares canonical defaults and scope-local fallbacks", function routeDefaults(): void
	{
		const shellChildren = _shellChildren();
		const workspace = _scopeChildren(SettingsScope.Workspace);
		const personal = _scopeChildren(SettingsScope.Personal);

		expect(shellChildren[0]).toMatchObject({ path: "", pathMatch: "full", redirectTo: "workspace/pod" });
		expect(shellChildren.at(-1)).toMatchObject({ path: "**", redirectTo: "workspace/pod" });
		expect(workspace[0]).toMatchObject({ path: "", pathMatch: "full", redirectTo: "pod" });
		expect(workspace.at(-1)).toMatchObject({ path: "**", redirectTo: "pod" });
		expect(personal[0]).toMatchObject({ path: "", pathMatch: "full", redirectTo: "account" });
		expect(personal.at(-1)).toMatchObject({ path: "**", redirectTo: "account" });
	});

	it("declares every public leaf route without legacy aliases", function routeLeaves(): void
	{
		expect(_scopeChildren(SettingsScope.Workspace).slice(1, -1).map(function path(route): string | undefined { return route.path; })).toEqual([
			"pod", "members", "budgets", "skills", "connectors", "channels", "data-network", "provider-keys"
		]);
		expect(_scopeChildren(SettingsScope.Personal).slice(1, -1).map(function path(route): string | undefined { return route.path; })).toEqual([
			"account", "awareness", "budget", "api-keys"
		]);
	});

	it("executes root, scope, and invalid-route redirects", async function routeRedirects(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings");
		const router = TestBed.inject(Router);

		expect(router.url).toBe("/settings/workspace/pod");
		await harness.navigateByUrl("/settings/workspace/not-a-section");
		expect(router.url).toBe("/settings/workspace/pod");
		await harness.navigateByUrl("/settings/personal");
		expect(router.url).toBe("/settings/personal/account");
		await harness.navigateByUrl("/settings/personal/not-a-section");
		expect(router.url).toBe("/settings/personal/account");
		await harness.navigateByUrl("/settings/not-a-scope");
		expect(router.url).toBe("/settings/workspace/pod");
	});

	it("updates route-derived navigation and destroys the previous leaf component", async function routedLifecycle(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/members");
		const router = TestBed.inject(Router);
		const firstPlaceholder = harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent)).componentInstance as SettingsPlaceholderComponent;
		const firstActiveLink = harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null;
		const scopeLinks = Array.from(harness.fixture.nativeElement.querySelectorAll(".wo-settings__scope-link")) as HTMLAnchorElement[];

		expect(firstPlaceholder.title).toBe("Members");
		expect(firstActiveLink?.getAttribute("href")).toBe("/settings/workspace/members");
		expect(scopeLinks.map(function label(link): string { return link.textContent?.trim() ?? ""; })).toEqual(["Workspace", "Personal"]);
		expect(scopeLinks.map(function route(link): string | null { return link.getAttribute("href"); })).toEqual([
			"/settings/workspace/pod", "/settings/personal/account"
		]);
		expect(scopeLinks[0]?.getAttribute("aria-current")).toBe("page");
		expect(scopeLinks[1]?.hasAttribute("aria-current")).toBe(false);

		await harness.navigateByUrl("/settings/personal/budget");
		harness.detectChanges();

		const secondPlaceholder = harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent)).componentInstance as SettingsPlaceholderComponent;
		const secondActiveLink = harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null;

		expect(router.url).toBe("/settings/personal/budget");
		expect(secondPlaceholder.title).toBe("My Budget");
		expect(secondPlaceholder).not.toBe(firstPlaceholder);
		expect(secondActiveLink?.getAttribute("href")).toBe("/settings/personal/budget");
		expect(scopeLinks[0]?.hasAttribute("aria-current")).toBe(false);
		expect(scopeLinks[1]?.getAttribute("aria-current")).toBe("page");
	});

});
