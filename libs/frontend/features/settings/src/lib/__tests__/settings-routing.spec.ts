// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LocationStrategy } from "@angular/common";
import { MockLocationStrategy } from "@angular/common/testing";
import { ɵresolveComponentResources } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { NavigationEnd, Route, Router, Routes, provideRouter, withComponentInputBinding } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { filter, firstValueFrom, take } from "rxjs";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PERSONAL_SETTINGS_NAVIGATION, WORKSPACE_SETTINGS_NAVIGATION, _SettingsNavigationForUrl, _SettingsScopeFromUrl } from "../settings-navigation.js";
import { SettingsScope, SettingsSectionId } from "../settings-navigation.types.js";
import { SettingsPlaceholderComponent } from "../settings-placeholder/settings-placeholder.component.js";
import { SETTINGS_ROUTES } from "../settings.routes.js";
import { _CanDeactivatePodSection } from "../sections/pod-section/pod-section.guard.js";
import { ConnectorsSectionComponent } from "../sections/connectors-section/connectors-section.component.js";
import { DataNetworkSectionComponent } from "../sections/data-network-section/data-network-section.component.js";
import { SkillsSectionComponent } from "../sections/skills-section/skills-section.component.js";
import { MembersSectionComponent } from "../sections/members-section/members-section.component.js";
import { _CanDeactivateMembersSection } from "../sections/members-section/members-section.guard.js";
import { BudgetsSectionComponent } from "../sections/budgets-section/budgets-section.component.js";
import { _CanDeactivateBudgetsSection } from "../sections/budgets-section/budgets-section.guard.js";

/** Resolve an external settings component template or stylesheet. */
function _componentResource(resourceUrl: string): string
{
	const file = resourceUrl.replace(/^\.\//, "");
	const componentFolder = file.split(".component")[0];
	const folder = file.startsWith("settings-page") ? "settings-page" : file.startsWith("skills-section") ? "sections/skills-section" : file.startsWith("connectors-section") ? "sections/connectors-section" : file.startsWith("data-network-section") ? "sections/data-network-section" : file.startsWith("members-section") ? "sections/members-section" : file.startsWith("budgets-section") ? "sections/budgets-section" : file.startsWith("settings-placeholder") ? "settings-placeholder" : `../../../../elements/ui/src/lib/components/${componentFolder}`;
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

/** Reject a test-only nested route transition to verify cancelled scope navigation. */
function _denyNavigation(): boolean
{
	return false;
}

/** Replace lazy production leaves with the placeholder while preserving the real redirect tree. */
function _testableRoutes(routes: Routes): Routes
{
	return routes.map(function testableRoute(route): Route
	{
	if (route.path === "agents" && route.component) return { ...route, component: undefined, children: [{ path: "", pathMatch: "full", component: route.component, data: route.data }, { path: "edit", component: route.component, data: { title: "Edit agent", description: "Nested agent configuration." }, canDeactivate: [_denyNavigation] }] };
	if (route.path === "members" || route.path === "budgets") return route;
	if (route.children) return { ...route, children: _testableRoutes(route.children) };
	if (route.redirectTo !== undefined || route.component) return route;
	if (route.path === "skills" || route.path === "connectors" || route.path === "data-network") return route;
	if (route.path === "budget") return { ...route, loadComponent: undefined, component: SettingsPlaceholderComponent, data: { title: "My Budget", description: "Personal budget controls." }, canDeactivate: undefined };
	return { ...route, loadComponent: undefined, component: SettingsPlaceholderComponent, canDeactivate: undefined };
	});
}

/** Await the next completed router navigation. */
function _nextNavigation(router: Router): Promise<NavigationEnd>
{
	return firstValueFrom(router.events.pipe(filter(function navigationEnded(event): event is NavigationEnd
	{
		return event instanceof NavigationEnd;
	}), take(1)));
}

/** Emulate the native browser activation jsdom omits for focused buttons. */
function _activateNativeButton(button: HTMLButtonElement, key: "Enter" | " "): void
{
	// 1. Focus — reproduce keyboard traversal placing the native control in the tab order.
	button.focus();

	// 2. Key lifecycle — expose the same events assistive and application listeners observe.
	button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	button.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));

	// 3. Default action — jsdom omits the browser's keyboard-generated button click.
	button.click();
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
		providers: [provideRouter([{ path: "settings", children: _testableRoutes(SETTINGS_ROUTES) }], withComponentInputBinding()), { provide: LocationStrategy, useClass: MockLocationStrategy }]
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
			SettingsSectionId.Agents,
			SettingsSectionId.DataNetwork,
			SettingsSectionId.ProviderKeys
		]);
		expect(WORKSPACE_SETTINGS_NAVIGATION.map(function label(item): string { return item.label; })).toEqual([
			"Pod", "Members", "Budgets", "Skills", "Connectors", "Agents", "Data & Network", "LLM Providers"
		]);
		expect(WORKSPACE_SETTINGS_NAVIGATION.map(function route(item): string { return item.route; })).toEqual([
			"/settings/workspace/pod",
			"/settings/workspace/members",
			"/settings/workspace/budgets",
			"/settings/workspace/skills",
			"/settings/workspace/connectors",
			"/settings/workspace/agents",
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
		const workspaceRoutes = _scopeChildren(SettingsScope.Workspace);
		expect(workspaceRoutes.slice(1, -1).map(function path(route): string | undefined { return route.path; })).toEqual([
			"pod", "members", "budgets", "skills", "connectors", "agents", "data-network", "provider-keys"
		]);
		expect(workspaceRoutes.find(function pod(route): boolean { return route.path === "pod"; })?.canDeactivate).toEqual([_CanDeactivatePodSection]);
		expect(workspaceRoutes.find(function members(route): boolean { return route.path === "members"; })?.children?.filter(function editor(route): boolean { return route.path?.startsWith("edit/") ?? false; }).every(function guarded(route): boolean { return route.canDeactivate?.includes(_CanDeactivateMembersSection) ?? false; })).toBe(true);
		expect(workspaceRoutes.find(function budgets(route): boolean { return route.path === "budgets"; })?.canDeactivate).toEqual([_CanDeactivateBudgetsSection]);
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

	it("activates the Skills implementation at its stable route", async function skillsRoute(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/skills");
		const skills = harness.fixture.debugElement.query(By.directive(SkillsSectionComponent)).componentInstance as SkillsSectionComponent;

		expect(harness.fixture.debugElement.query(By.directive(SkillsSectionComponent))).not.toBeNull();
		expect(harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent))).toBeNull();
		expect((harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null)?.getAttribute("href")).toBe("/settings/workspace/skills");
		expect(skills.groups()).toHaveLength(4);
	});

	it("activates the Connectors implementation at its stable route", async function connectorsRoute(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/connectors");
		const connectors = harness.fixture.debugElement.query(By.directive(ConnectorsSectionComponent)).componentInstance as ConnectorsSectionComponent;

		expect(harness.fixture.debugElement.query(By.directive(ConnectorsSectionComponent))).not.toBeNull();
		expect(harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent))).toBeNull();
		expect((harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null)?.getAttribute("href")).toBe("/settings/workspace/connectors");
		expect(connectors.installedConnectors()).toHaveLength(5);
	});

	it("activates Workspace Budgets at its stable route", async function budgetsRoute(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/budgets");
		const budgets = harness.fixture.debugElement.query(By.directive(BudgetsSectionComponent)).componentInstance as BudgetsSectionComponent;

		expect(harness.fixture.debugElement.query(By.directive(BudgetsSectionComponent))).not.toBeNull();
		expect(harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent))).toBeNull();
		expect((harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null)?.getAttribute("href")).toBe("/settings/workspace/budgets");
		expect(budgets.totals()).toEqual({ spent: 273, allocated: 350 });
		expect(harness.fixture.nativeElement.querySelectorAll(".wo-budgets__row:not(.wo-budgets__row--heading)")).toHaveLength(5);
	});

	it("activates Data & Network at its stable route", async function dataNetworkRoute(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/data-network");
		const dataNetwork = harness.fixture.debugElement.query(By.directive(DataNetworkSectionComponent)).componentInstance as DataNetworkSectionComponent;

		expect(harness.fixture.debugElement.query(By.directive(DataNetworkSectionComponent))).not.toBeNull();
		expect(harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent))).toBeNull();
		expect((harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null)?.getAttribute("href")).toBe("/settings/workspace/data-network");
		expect(dataNetwork.domains()).toHaveLength(3);
	});

	it("keeps the owning navigation item active on a nested section route", async function nestedSectionRoute(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/agents/edit");
		const router = TestBed.inject(Router);
		const activeLink = harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null;
		const nestedPlaceholder = harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent)).componentInstance as SettingsPlaceholderComponent;

		expect(router.url).toBe("/settings/workspace/agents/edit");
		expect(activeLink?.getAttribute("href")).toBe("/settings/workspace/agents");
		expect(nestedPlaceholder.title).toBe("Edit agent");
	});

	it("updates route-derived navigation and destroys the previous leaf component", async function routedLifecycle(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/members");
		const router = TestBed.inject(Router);
		const firstMembers = harness.fixture.debugElement.query(By.directive(MembersSectionComponent)).componentInstance as MembersSectionComponent;
		const firstActiveLink = harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null;
		const scopeButtons = Array.from(harness.fixture.nativeElement.querySelectorAll(".wo-settings__scope-link")) as HTMLButtonElement[];
		const navigationIcons = Array.from(harness.fixture.nativeElement.querySelectorAll(".wo-settings__nav-item svg")) as SVGElement[];
		const brandFacets = Array.from(harness.fixture.nativeElement.querySelectorAll(".wo-settings__nav-title polygon")) as SVGPolygonElement[];

		expect(firstMembers.members).toHaveLength(5);
		expect(harness.fixture.nativeElement.querySelector(".wo-members__header")?.textContent).toContain("5 of 10");
		expect(harness.fixture.nativeElement.querySelector("[role='tab'][aria-selected='true']")?.textContent?.trim()).toBe("People");
		expect(firstActiveLink?.getAttribute("href")).toBe("/settings/workspace/members");
		expect(navigationIcons.every(function iconSize(icon): boolean { return icon.getAttribute("width") === "14" && icon.getAttribute("height") === "14"; })).toBe(true);
		expect(brandFacets.map(function fill(facet): string | null { return facet.getAttribute("fill"); })).toEqual(["var(--oc-teal)", "var(--oc-teal-fold-dark)", "var(--oc-teal-hover)", "var(--oc-orange)"]);
		expect(harness.fixture.nativeElement.querySelector(".wo-settings__sovereignty")).toBeNull();
		expect(scopeButtons.map(function label(button): string { return button.textContent?.trim() ?? ""; })).toEqual(["Workspace", "Personal"]);
		expect(scopeButtons.every(function nativeButton(button): boolean { return button instanceof HTMLButtonElement; })).toBe(true);
		expect(scopeButtons[0]?.getAttribute("aria-pressed")).toBe("true");
		expect(scopeButtons[1]?.getAttribute("aria-pressed")).toBe("false");

		await harness.navigateByUrl("/settings/personal/budget");
		harness.detectChanges();

		const secondPlaceholder = harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent)).componentInstance as SettingsPlaceholderComponent;
		const secondActiveLink = harness.fixture.nativeElement.querySelector(".wo-settings__nav-item[aria-current='page']") as HTMLAnchorElement | null;

		expect(router.url).toBe("/settings/personal/budget");
		expect(secondPlaceholder.title).toBe("My Budget");
		expect(secondPlaceholder).not.toBe(firstMembers);
		expect(secondActiveLink?.getAttribute("href")).toBe("/settings/personal/budget");
		expect(scopeButtons[0]?.getAttribute("aria-pressed")).toBe("false");
		expect(scopeButtons[1]?.getAttribute("aria-pressed")).toBe("true");
	});

	it("renders the organization tab and preserves it through an editor route", async function membersEditorRoute(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/members");
		const router = TestBed.inject(Router);
		const organizationTab = harness.fixture.nativeElement.querySelectorAll("[role='tab']")[1] as HTMLButtonElement;
		organizationTab.click();
		await harness.fixture.whenStable();
		harness.detectChanges();

		expect(harness.fixture.nativeElement.querySelector("[role='tabpanel'] .wo-members__table")).not.toBeNull();
		const editButton = harness.fixture.nativeElement.querySelector(".wo-members__org-row .wo-members__row-button") as HTMLButtonElement;
		editButton.click();
		await harness.fixture.whenStable();
		expect(router.url).toContain("/settings/workspace/members/edit/department/eng");
		expect(harness.fixture.nativeElement.querySelector(".wo-members__editor-row")).not.toBeNull();
		expect((harness.fixture.nativeElement.querySelector("#members-editor-name") as HTMLInputElement).value).toBe("Engineering");
		expect(harness.fixture.nativeElement.querySelector(".wo-members__editor-card")).not.toBeNull();
		(harness.fixture.nativeElement.querySelector(".wo-members__back") as HTMLButtonElement).click();
		await harness.fixture.whenStable();
		expect(router.url).toBe("/settings/workspace/members?tab=org");
		expect(harness.fixture.nativeElement.querySelector("[role='tabpanel'] .wo-members__table")).not.toBeNull();

		await harness.navigateByUrl("/settings/workspace/members/edit/team/be?tab=org");
		harness.detectChanges();
		expect((harness.fixture.nativeElement.querySelector("#members-editor-name") as HTMLInputElement).value).toBe("Backend");
		expect((harness.fixture.nativeElement.querySelector("#members-editor-department") as HTMLSelectElement).value).toBe("Engineering");
		expect(harness.fixture.nativeElement.querySelectorAll(".wo-members__member-option")).toHaveLength(5);
		const teamName = harness.fixture.nativeElement.querySelector("#members-editor-name") as HTMLInputElement;
		teamName.value = "Backend team";
		teamName.dispatchEvent(new Event("input", { bubbles: true }));
		harness.detectChanges();
		const confirm = vi.fn(function confirmDiscard(): boolean { return false; });
		vi.stubGlobal("confirm", confirm);
		(harness.fixture.nativeElement.querySelector(".wo-members__back") as HTMLButtonElement).click();
		await harness.fixture.whenStable();
		expect(confirm).not.toHaveBeenCalled();
		expect(router.url).toBe("/settings/workspace/members?tab=org");
		vi.unstubAllGlobals();

		await harness.navigateByUrl("/settings/workspace/members/edit/project/p3?tab=org");
		harness.detectChanges();
		expect((harness.fixture.nativeElement.querySelector("#members-editor-name") as HTMLInputElement).value).toBe("Data Pipeline");
		expect((harness.fixture.nativeElement.querySelector("#members-editor-status") as HTMLSelectElement).value).toBe("Draft");

		await harness.navigateByUrl("/settings/workspace/members/edit/department/new?tab=org");
		harness.detectChanges();
		const newName = harness.fixture.nativeElement.querySelector("#members-editor-name") as HTMLInputElement;
		const saveButton = harness.fixture.nativeElement.querySelector(".wo-members__save-button") as HTMLButtonElement;
		expect(newName.value).toBe("");
		expect(saveButton.disabled).toBe(true);
		expect(harness.fixture.nativeElement.querySelector(".wo-members__danger-button")).toBeNull();
		newName.value = "New department";
		newName.dispatchEvent(new Event("input", { bubbles: true }));
		harness.detectChanges();
		expect(saveButton.disabled).toBe(false);
	});

	it("resets scopes to their defaults and preserves an already-rendered default", async function scopeSelection(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/members");
		const router = TestBed.inject(Router);
		const scopeButtons = Array.from(harness.fixture.nativeElement.querySelectorAll(".wo-settings__scope-link")) as HTMLButtonElement[];
		const workspaceButton = scopeButtons[0];
		const personalButton = scopeButtons[1];
		const workspaceLeaf = harness.fixture.debugElement.query(By.directive(MembersSectionComponent)).componentInstance as MembersSectionComponent;

		const workspaceNavigation = _nextNavigation(router);
		workspaceButton?.click();
		await workspaceNavigation;
		await harness.fixture.whenStable();
		harness.detectChanges();

		const workspaceDefault = harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent)).componentInstance as SettingsPlaceholderComponent;
		expect(router.url).toBe("/settings/workspace/pod");
		expect(workspaceDefault).not.toBe(workspaceLeaf);
		expect(document.activeElement).toBe(harness.fixture.nativeElement.querySelector("main"));

		const personalNavigation = _nextNavigation(router);
		personalButton?.click();
		await personalNavigation;
		await harness.fixture.whenStable();
		harness.detectChanges();

		const personalLeaf = harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent)).componentInstance as SettingsPlaceholderComponent;
		expect(router.url).toBe("/settings/personal/account");
		expect(personalLeaf).not.toBe(workspaceLeaf);
		expect(document.activeElement).toBe(harness.fixture.nativeElement.querySelector("main"));

		if (!personalButton || !workspaceButton) throw new Error("Settings scope controls were not rendered");
		personalButton.focus();
		_activateNativeButton(personalButton, "Enter");
		await harness.fixture.whenStable();
		expect(router.url).toBe("/settings/personal/account");
		expect(harness.fixture.debugElement.query(By.directive(SettingsPlaceholderComponent)).componentInstance).toBe(personalLeaf);
		expect(document.activeElement).toBe(personalButton);

		const restoredWorkspaceNavigation = _nextNavigation(router);
		_activateNativeButton(workspaceButton, " ");
		await restoredWorkspaceNavigation;
		await harness.fixture.whenStable();
		harness.detectChanges();
		expect(router.url).toBe("/settings/workspace/pod");
		expect(workspaceButton.getAttribute("aria-pressed")).toBe("true");
		expect(document.activeElement).toBe(harness.fixture.nativeElement.querySelector("main"));
	});

	it("keeps route and focus when a section guard cancels scope navigation", async function cancelledScopeSelection(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/agents/edit");
		const router = TestBed.inject(Router);
		const personalButton = Array.from(harness.fixture.nativeElement.querySelectorAll(".wo-settings__scope-link")).at(1) as HTMLButtonElement | undefined;

		if (!personalButton) throw new Error("Personal scope control was not rendered");
		personalButton.focus();
		personalButton.click();
		await harness.fixture.whenStable();

		expect(router.url).toBe("/settings/workspace/agents/edit");
		expect(document.activeElement).toBe(personalButton);
	});

	it("restores scope selection through browser history", async function scopeHistory(): Promise<void>
	{
		const harness = await RouterTestingHarness.create("/settings/workspace/members");
		const router = TestBed.inject(Router);
		const locationStrategy = TestBed.inject(LocationStrategy) as MockLocationStrategy;
		router.setUpLocationChangeListener();

		await harness.navigateByUrl("/settings/personal/budget");
		harness.detectChanges();
		expect(router.url).toBe("/settings/personal/budget");

		const backNavigation = _nextNavigation(router);
		locationStrategy.simulatePopState("/settings/workspace/members");
		await backNavigation;
		harness.detectChanges();
		expect(router.url).toBe("/settings/workspace/members");
		expect((harness.fixture.nativeElement.querySelector(".wo-settings__scope-link[aria-pressed='true']") as HTMLButtonElement | null)?.textContent?.trim()).toBe("Workspace");

		const forwardNavigation = _nextNavigation(router);
		locationStrategy.simulatePopState("/settings/personal/budget");
		await forwardNavigation;
		harness.detectChanges();
		expect(router.url).toBe("/settings/personal/budget");
		expect((harness.fixture.nativeElement.querySelector(".wo-settings__scope-link[aria-pressed='true']") as HTMLButtonElement | null)?.textContent?.trim()).toBe("Personal");
	});

});
