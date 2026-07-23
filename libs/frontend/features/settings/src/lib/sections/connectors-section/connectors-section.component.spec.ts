// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { signal, ɵresolveComponentResources } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { compileString } from "sass";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ConnectorCategory, ConnectorMutationKind, DestructiveActionPhase } from "@opencrane/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { MockSettingsGateway } from "@opencrane/state/gateways/testing";
import { DestructiveConfirmationComponent } from "@opencrane/elements/ui";
import { ConnectorsSectionComponent } from "./connectors-section.component.js";

/** Resolve external resources for the Connectors section and its shared dialog. */
function _componentResource(resourceUrl: string): string
{
	const file = resourceUrl.replace(/^\.\//, "");
	const componentFolder = file.split(".component")[0];
	const folder = file.startsWith("connectors-section") ? "src/lib/sections/connectors-section" : `../../elements/ui/src/lib/components/${componentFolder}`;
	return readFileSync(resolve(process.cwd(), folder, file), "utf8");
}

/** Render the fixture-backed Connectors section. */
async function _render(): Promise<ComponentFixture<ConnectorsSectionComponent>>
{
	TestBed.configureTestingModule({ 
        imports: [ConnectorsSectionComponent],
        providers: [
            { provide: SETTINGS_GATEWAY, useClass: MockSettingsGateway },
            { provide: ActiveTenantStore, useValue: { tenant: signal("elewa-default") } }
        ]
    });
	
	// Register signal inputs for JIT compiler
	TestBed.overrideComponent(DestructiveConfirmationComponent, {
		remove: { 
			templateUrl: './destructive-confirmation.component.html',
			styleUrl: './destructive-confirmation.component.scss'
		},
		add: {
			template: ''
		}
	});
	
	const fixture = TestBed.createComponent(ConnectorsSectionComponent);
	fixture.detectChanges();
	await fixture.whenStable();
	fixture.detectChanges();
	return fixture;
}

beforeAll(async function prepareAngularConnectors(): Promise<void>
{
	TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), { teardown: { destroyAfterEach: true } });
	await ɵresolveComponentResources(async function loadComponentResource(resourceUrl: string): Promise<string>
	{
		const resource = _componentResource(resourceUrl);
		return resourceUrl.endsWith(".scss") ? compileString(resource).css : resource;
	});
});

afterEach(function resetConnectorsTestBed(): void
{
	TestBed.resetTestingModule();
});

afterAll(function releaseAngularConnectors(): void
{
	TestBed.resetTestEnvironment();
});

describe("ConnectorsSectionComponent", function connectorsSectionSuite(): void
{
	it("renders the handoff Connected and Available collections with rights and switches", async function installedFixtures(): Promise<void>
	{
		const root = (await _render()).nativeElement as HTMLElement;
		const connectedNames = Array.from(root.querySelectorAll(".wo-connectors__connected-row .wo-connectors__copy h4")).map(function text(element): string { return element.textContent?.trim() ?? ""; });
		const availableNames = Array.from(root.querySelectorAll(".wo-connectors__available-row .wo-connectors__copy h4")).map(function text(element): string { return element.textContent?.trim() ?? ""; });
		const adminNames = Array.from(root.querySelectorAll(".wo-connectors__connected-row, .wo-connectors__available-row")).filter(function manageable(row): boolean { return row.querySelector(".wo-connectors__admin") !== null; }).map(function name(row): string { return row.querySelector("h4")?.textContent?.trim() ?? ""; });
		const switches = Array.from(root.querySelectorAll("[role='switch']"));

		expect(root.querySelector("h2")?.textContent?.trim()).toBe("Connectors");
		expect(root.querySelector(".wo-connectors__subtitle")?.textContent?.trim()).toBe("External tools and data sources your agents can call. The Admin badge means you can manage the connector.");
		expect(Array.from(root.querySelectorAll(".wo-connectors__collection > h3")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["Connected", "Available"]);
		expect(connectedNames).toEqual(["Cognee Search", "GitHub", "Google Calendar", "Slack", "Web Browser"]);
		expect(availableNames).toEqual(["GitLab", "Linear", "Notion", "Perplexity", "SQL Query"]);
		expect(adminNames).toEqual(["Cognee Search", "GitHub", "Google Calendar", "GitLab", "Linear", "Notion"]);
		expect(switches.map(function checked(control): string | null { return control.getAttribute("aria-checked"); })).toEqual(["true", "true", "true", "false", "true"]);
	});

	it("filters both collections by category and renders their exact empty states", async function searchesCollections(): Promise<void>
	{
		const fixture = await _render();
		const root = fixture.nativeElement as HTMLElement;
		const input = root.querySelector("input[type='search']") as HTMLInputElement;
		input.value = "DEV";
		input.dispatchEvent(new Event("input"));
		fixture.detectChanges();

		expect(Array.from(root.querySelectorAll(".wo-connectors__copy h4")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["GitHub", "GitLab", "Linear"]);

		input.value = "calendar";
		input.dispatchEvent(new Event("input"));
		fixture.detectChanges();
		expect(Array.from(root.querySelectorAll(".wo-connectors__copy h4")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["Google Calendar"]);

		input.value = "no matching connector";
		input.dispatchEvent(new Event("input"));
		fixture.detectChanges();

		expect(Array.from(root.querySelectorAll(".wo-connectors__empty")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["No connected tools match your search.", "No available connectors match your search."]);
		expect(root.querySelectorAll(".wo-connectors__card")).toHaveLength(0);
	});

	it("opens the marketplace from an Available connector action", async function availableConnectAction(): Promise<void>
	{
		const fixture = await _render();
		_rootButton(fixture, ".wo-connectors__available-row .wo-connectors__row-button").click();
		fixture.detectChanges();

		expect(fixture.componentInstance.marketplaceOpen()).toBe(true);
		expect((fixture.nativeElement as HTMLElement).querySelector("h2")?.textContent?.trim()).toBe("Connector Marketplace");
	});

	it("opens the owned marketplace, filters all seven categories, and preserves selection on return", async function marketplaceNavigation(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		(_rootButton(fixture, ".wo-connectors__primary")).click();
		fixture.detectChanges();

		const root = fixture.nativeElement as HTMLElement;
		expect(root.querySelector("h2")?.textContent?.trim()).toBe("Connector Marketplace");
		expect(Array.from(root.querySelectorAll(".wo-connectors__filter")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["All", "Memory", "Dev", "Productivity", "Comms", "Research", "Data"]);
		component.selectCategory(ConnectorCategory.Data);
		fixture.detectChanges();
		expect(Array.from(root.querySelectorAll(".wo-connectors__copy h3")).map(function text(element): string { return element.textContent?.trim() ?? ""; })).toEqual(["SQL Query"]);

		_rootButton(fixture, ".wo-connectors__back").click();
		fixture.detectChanges();
		expect(root.querySelector("h2")?.textContent?.trim()).toBe("Connectors");
		_rootButton(fixture, ".wo-connectors__primary").click();
		fixture.detectChanges();
		expect(component.selectedCategory()).toBe(ConnectorCategory.Data);
		expect(root.querySelector(".wo-connectors__filter--active")?.textContent?.trim()).toBe("Data");
	});

	it("locks duplicate toggles while pending and applies one successful outcome", async function toggleLocking(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		const connector = component.installedConnectors()[0];
		if (!connector) throw new Error("Expected an installed connector fixture");

		let resolveUpdate: any;
		vi.spyOn(gateway, "updateConnector").mockImplementation(() => new Promise(r => resolveUpdate = r));

		const first = component.toggle(connector);
		const duplicate = component.toggle(connector);
		expect(component.isPending(connector, ConnectorMutationKind.Toggle)).toBe(true);
		expect(component.pendingMessage()).toBe("Updating Cognee Search…");
		expect(gateway.updateConnector).toHaveBeenCalledTimes(1);
		
		vi.spyOn(gateway, "getConnectors").mockResolvedValue(
			component.connectors().map(c => c.id === connector.id ? { ...c, enabled: !c.enabled } : c)
		);
		
		resolveUpdate();
		await Promise.all([first, duplicate]);
		await fixture.whenStable();
		fixture.detectChanges();

		expect(component.connectors().find(function matches(candidate): boolean { return candidate.id === connector.id; })?.enabled).toBe(false);
		expect((fixture.nativeElement as HTMLElement).querySelector("[role='status']")?.textContent?.trim()).toBe("Cognee Search disabled.");
	});

	it("installs once while pending and projects success into both route views", async function installSuccess(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		const connector = component.connectors().find(function gitLab(candidate): boolean { return candidate.id === "gl"; });
		if (!connector) throw new Error("Expected the GitLab marketplace fixture");
		
		let resolveUpdate: any;
		vi.spyOn(gateway, "updateConnector").mockImplementation(() => new Promise(r => resolveUpdate = r));

		const first = component.install(connector);
		const duplicate = component.install(connector);
		expect(gateway.updateConnector).toHaveBeenCalledTimes(1);
		expect(component.pendingMessage()).toBe("Installing GitLab…");
		
		vi.spyOn(gateway, "getConnectors").mockResolvedValue([
			...component.connectors(),
			{ ...connector, installed: true, enabled: true, canManage: true }
		]);
		
		resolveUpdate();
		await Promise.all([first, duplicate]);
		await fixture.whenStable();
		fixture.detectChanges();

		expect(component.installedConnectors().map(function identity(candidate): string { return candidate.id; })).toContain("gl");
		expect(component.feedback()?.message).toBe("GitLab installed and enabled.");
	});

	it("keeps catalogue state after a recoverable install failure", async function installFailure(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		const connector = component.connectors().find(function gitLab(candidate): boolean { return candidate.id === "gl"; });
		if (!connector) throw new Error("Expected the GitLab marketplace fixture");
		
		vi.spyOn(gateway, "updateConnector").mockRejectedValue(new Error("Registry unavailable. Try again."));

		await component.install(connector);
		fixture.detectChanges();

		expect(component.connectors().find(function matches(candidate): boolean { return candidate.id === connector.id; })?.installed).toBe(false);
		expect((fixture.nativeElement as HTMLElement).querySelector("[role='alert']")?.textContent?.trim()).toBe("GitLab could not be updated. Try again.");
	});

	it("requires confirmation for uninstall and supports retry after recoverable failure", async function uninstallConfirmation(): Promise<void>
	{
		const fixture = await _render();
		const component = fixture.componentInstance;
		const gateway = TestBed.inject(SETTINGS_GATEWAY);
		const connector = component.installedConnectors()[1];
		if (!connector) throw new Error("Expected an installed connector fixture");

		component.openMarketplace();
		fixture.detectChanges();
		const uninstall = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(".wo-connectors__row-button--danger"))[1] as HTMLButtonElement;
		uninstall.click();
		expect(component.uninstallTarget()?.id).toBe(connector.id);
		expect(component.destructiveState().phase).toBe(DestructiveActionPhase.Idle);

		let resolveError: any;
		vi.spyOn(gateway, "updateConnector").mockImplementationOnce(() => new Promise((_, rej) => resolveError = rej));
		
		const first = component.confirmUninstall();
		const duplicate = component.confirmUninstall();
		expect(gateway.updateConnector).toHaveBeenCalledTimes(1);
		resolveError(new Error("Uninstall failed safely."));
		await Promise.all([first, duplicate].map(p => p.catch(() => {})));
		expect(component.destructiveState().phase).toBe(DestructiveActionPhase.Error);
		expect(component.uninstallTarget()?.id).toBe(connector.id);

		vi.spyOn(gateway, "updateConnector").mockResolvedValue({} as any);
		
		vi.spyOn(gateway, "getConnectors").mockResolvedValue(
			component.connectors().map(c => c.id === connector.id ? { ...c, installed: false, enabled: false } : c)
		);
		
		await component.confirmUninstall();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(component.uninstallTarget()).toBeNull();
		expect(component.connectors().find(function matches(candidate): boolean { return candidate.id === connector.id; })?.installed).toBe(false);
	});
});

/** Return one required button from a rendered Connectors fixture. */
function _rootButton(fixture: ComponentFixture<ConnectorsSectionComponent>, selector: string): HTMLButtonElement
{
	const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected button ${selector}`);
	return button;
}
