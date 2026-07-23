import { ChangeDetectionStrategy, Component, Signal, computed, signal, inject, resource } from "@angular/core";

import { ActiveConnectorMutation, Connector, ConnectorCategory, ConnectorFeedback, ConnectorFeedbackKind, ConnectorMutationKind, DestructiveActionPhase, DestructiveActionState } from "@opencrane/core";
import { DestructiveConfirmationComponent } from "@opencrane/elements/ui";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { _settledValue } from "../../resource.util.js";

/** Mock-only Workspace Connectors section and its route-owned marketplace view. */
@Component({
	selector: "wo-connectors-section",
	standalone: true,
	imports: [DestructiveConfirmationComponent],
	templateUrl: "./connectors-section.component.html",
	styleUrl: "./connectors-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConnectorsSectionComponent
{
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Connector catalogue backing installed and marketplace views. */
	public readonly connectorsResource = resource({
		loader: () => this._gateway.getConnectors()
	});
	public readonly connectors = computed(() => _settledValue(this.connectorsResource) ?? []);

	/** Marketplace categories in canonical handoff order. */
	public readonly categoriesResource = resource({
		loader: () => this._gateway.getConnectorCategories()
	});
	public readonly categories = computed(() => _settledValue(this.categoriesResource) ?? []);

	/** Whether the route-owned marketplace sub-page is active. */
	public readonly marketplaceOpen = signal(false);

	/** Current case-insensitive main-page search draft. */
	public readonly searchDraft = signal("");

	/** Marketplace category preserved while the sub-page remains active. */
	public readonly selectedCategory = signal<"All" | ConnectorCategory>("All");

	/** Connector currently waiting for destructive uninstall confirmation. */
	public readonly uninstallTarget = signal<Connector | null>(null);

	/** Button that opened the confirmation and should regain focus. */
	public readonly uninstallFocusTarget = signal<HTMLElement | null>(null);

	/** Currently locked lifecycle operation. */
	public readonly activeMutation = signal<ActiveConnectorMutation | null>(null);

	/** Accessible outcome feedback for toggle, install, and uninstall. */
	public readonly feedback = signal<ConnectorFeedback | null>(null);

	/** External state consumed by the shared destructive-confirmation dialog. */
	public readonly destructiveState = signal<DestructiveActionState>({ phase: DestructiveActionPhase.Idle });

	/** Connector categories exposed to the external template. */
	public readonly ConnectorCategory = ConnectorCategory;

	/** Feedback kinds exposed to the external template. */
	public readonly ConnectorFeedbackKind = ConnectorFeedbackKind;

	/** Mutation kinds exposed to pending labels in the external template. */
	public readonly ConnectorMutationKind = ConnectorMutationKind;

	/** Connected connectors matching the current main-page search. */
	public readonly installedConnectors: Signal<readonly Connector[]> = computed((): readonly Connector[] => this._matchingConnectors(true));

	/** Available connectors matching the current main-page search. */
	public readonly availableConnectors: Signal<readonly Connector[]> = computed((): readonly Connector[] => this._matchingConnectors(false));

	/** Capture the handoff search input. */
	public updateSearch(event: Event): void
	{
		this.searchDraft.set((event.target as HTMLInputElement).value);
	}

	/** Marketplace connectors filtered by the selected category. */
	public readonly marketplaceConnectors: Signal<readonly Connector[]> = computed((): readonly Connector[] =>
	{
		const category = this.selectedCategory();
		return this.connectors().filter(function inCategory(connector): boolean
		{
			return category === "All" || connector.category === category;
		});
	});

	/** Accessible announcement for the currently pending lifecycle operation. */
	public readonly pendingMessage: Signal<string | null> = computed((): string | null =>
	{
		const active = this.activeMutation();
		if (active === null) return null;
		const connector = this.connectors().find(function matches(candidate): boolean { return candidate.id === active.connectorId; });
		if (connector === undefined) return "Connector update in progress.";
		switch (active.kind)
		{
			case ConnectorMutationKind.Toggle: return `Updating ${connector.name}…`;
			case ConnectorMutationKind.Install: return `Installing ${connector.name}…`;
			case ConnectorMutationKind.Uninstall: return `Uninstalling ${connector.name}…`;
		}
	});

	/** Open the route-owned marketplace without resetting its active filter. */
	public openMarketplace(): void
	{
		this.feedback.set(null);
		this.marketplaceOpen.set(true);
	}

	/** Return to installed connectors while preserving the marketplace filter. */
	public closeMarketplace(): void
	{
		if (this.activeMutation() === null)
		{
			this.feedback.set(null);
			this.marketplaceOpen.set(false);
		}
	}

	/** Select one marketplace category. */
	public selectCategory(category: "All" | ConnectorCategory): void
	{
		this.selectedCategory.set(category);
	}

	/** Toggle an installed connector through the deterministic mutation boundary. */
	public async toggle(connector: Connector): Promise<void>
	{
		await this._mutate(connector, ConnectorMutationKind.Toggle);
	}

	/** Install one marketplace connector through the deterministic mutation boundary. */
	public async install(connector: Connector): Promise<void>
	{
		await this._mutate(connector, ConnectorMutationKind.Install);
	}

	/** Install an available connector or request confirmation for an installed one. */
	public marketplaceAction(connector: Connector, event: Event): void
	{
		if (connector.installed)
		{
			this.requestUninstall(connector, event);
		}
		else
		{
			void this.install(connector);
		}
	}

	/** Open explicit uninstall confirmation for one installed connector. */
	public requestUninstall(connector: Connector, event: Event): void
	{
		if (this.activeMutation() !== null) return;
		this.destructiveState.set({ phase: DestructiveActionPhase.Idle });
		this.uninstallFocusTarget.set(event.currentTarget as HTMLElement | null);
		this.uninstallTarget.set(connector);
	}

	/** Cancel uninstall confirmation unless its mutation is pending. */
	public cancelUninstall(): void
	{
		if (this.destructiveState().phase !== DestructiveActionPhase.Pending)
		{
			this.uninstallTarget.set(null);
		}
	}

	/** Confirm and execute the currently selected uninstall action. */
	public async confirmUninstall(): Promise<void>
	{
		const connector = this.uninstallTarget();
		if (connector === null || this.activeMutation() !== null) return;
		this.destructiveState.set({ phase: DestructiveActionPhase.Pending });
		await this._mutate(connector, ConnectorMutationKind.Uninstall);
		if (this.feedback()?.kind === ConnectorFeedbackKind.Success)
		{
			this.destructiveState.set({ phase: DestructiveActionPhase.Success });
			this.uninstallTarget.set(null);
		}
		else
		{
			this.destructiveState.set({ phase: DestructiveActionPhase.Error, message: this.feedback()?.message ?? "Connector could not be uninstalled." });
		}
	}

	/** Determine whether one connector control owns the current pending lock. */
	public isPending(connector: Connector, kind: ConnectorMutationKind): boolean
	{
		const active = this.activeMutation();
		return active?.connectorId === connector.id && active.kind === kind;
	}

	/** Execute one locked lifecycle operation and project its outcome into local fixture state. */
	private async _mutate(connector: Connector, kind: ConnectorMutationKind): Promise<void>
	{
		if (this.activeMutation() !== null) return;

		this.feedback.set(null);
		this.activeMutation.set({ connectorId: connector.id, kind });

		try
		{
			if (kind === ConnectorMutationKind.Toggle) {
				await this._gateway.updateConnector(connector.id, { enabled: !connector.enabled });
			} else if (kind === ConnectorMutationKind.Install) {
				await this._gateway.updateConnector(connector.id, { installed: true, enabled: true });
			} else if (kind === ConnectorMutationKind.Uninstall) {
				await this._gateway.updateConnector(connector.id, { installed: false, enabled: false });
			}
			
			this.connectorsResource.reload();
			this.feedback.set({ kind: ConnectorFeedbackKind.Success, message: this._successMessage(connector, kind) });
		}
		catch
		{
			this.feedback.set({ kind: ConnectorFeedbackKind.Error, message: `${connector.name} could not be updated. Try again.` });
		}
		finally
		{
			this.activeMutation.set(null);
		}
	}

	/** Build operation-specific success feedback for assistive and visual users. */
	private _successMessage(connector: Connector, kind: ConnectorMutationKind): string
	{
		switch (kind)
		{
			case ConnectorMutationKind.Toggle: return `${connector.name} ${connector.enabled ? "disabled" : "enabled"}.`;
			case ConnectorMutationKind.Install: return `${connector.name} installed and enabled.`;
			case ConnectorMutationKind.Uninstall: return `${connector.name} uninstalled.`;
		}
	}

	/** Filter one installation collection by connector name or category. */
	private _matchingConnectors(installed: boolean): readonly Connector[]
	{
		const query = this.searchDraft().trim().toLowerCase();
		return this.connectors().filter(function matching(connector): boolean
		{
			return connector.installed === installed && (query === "" || connector.name.toLowerCase().includes(query) || connector.category.toLowerCase().includes(query));
		});
	}
}
