import { ChangeDetectionStrategy, Component, Signal, computed, signal, inject, resource } from "@angular/core";

import { CapabilityAccessKind, CapabilityCollection, CapabilityIcon, CapabilityIntegrationKind, CapabilityItem } from "@opencrane/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";
import { ActiveTenantStore } from "@opencrane/state/gateways";
import { _settledValue } from "../../resource.util.js";

/** One presentation collection rendered by the Skills route. */
interface SkillsCollectionSection
{
	readonly id: string;
	readonly label: string;
	readonly emptyMessage: string;
	readonly available: boolean;
	readonly items: Signal<readonly CapabilityItem[]>;
}

/** Searchable Workspace Skills catalogue from the current App.dc.html handoff. */
@Component({
	selector: "wo-skills-section",
	standalone: true,
	templateUrl: "./skills-section.component.html",
	styleUrl: "./skills-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillsSectionComponent
{
	private readonly _gateway = inject(SETTINGS_GATEWAY);
	private readonly _tenant = inject(ActiveTenantStore).tenant;

	/** Resource-backed catalogue. */
	public readonly capabilitiesResource = resource({
		params: () => this._tenant(),
		loader: ({ params }) => this._gateway.getWorkspaceCapabilities(params ?? "")
	});

	/** Mounted-only catalogue kept separate from connector installation state. */
	public readonly capabilities = computed(() => _settledValue(this.capabilitiesResource) ?? []);

	/** Current case-insensitive search draft. */
	public readonly searchDraft = signal("");

	/** Shared capabilities matching the current search. */
	public readonly sharedCapabilities: Signal<readonly CapabilityItem[]> = computed((): readonly CapabilityItem[] => this._matchingCapabilities(CapabilityCollection.Shared));

	/** Personal capabilities matching the current search. */
	public readonly personalCapabilities: Signal<readonly CapabilityItem[]> = computed((): readonly CapabilityItem[] => this._matchingCapabilities(CapabilityCollection.Personal));

	/** Available capabilities matching the current search. */
	public readonly availableCapabilities: Signal<readonly CapabilityItem[]> = computed((): readonly CapabilityItem[] => this._matchingCapabilities(CapabilityCollection.Available));

	/** Handoff collections in their authoritative display order. */
	public readonly sections: readonly SkillsCollectionSection[] =
	[
		{ id: "shared", label: "Shared", emptyMessage: "No shared skills match your search.", available: false, items: this.sharedCapabilities },
		{ id: "personal", label: "Personal", emptyMessage: "No personal skills match your search.", available: false, items: this.personalCapabilities },
		{ id: "available", label: "Available", emptyMessage: "No available skills match your search.", available: true, items: this.availableCapabilities }
	];

	/** Origami icon values exposed to the external template. */
	public readonly CapabilityIcon = CapabilityIcon;

	/** Integration kinds exposed to the external template. */
	public readonly CapabilityIntegrationKind = CapabilityIntegrationKind;

	/** Access-scope kinds exposed to the external template. */
	public readonly CapabilityAccessKind = CapabilityAccessKind;

	/** Capture the handoff search input. */
	public updateSearch(event: Event): void
	{
		this.searchDraft.set((event.target as HTMLInputElement).value);
	}

	/** Return one collection filtered by the normalized name-or-description query. */
	private _matchingCapabilities(collection: CapabilityCollection): readonly CapabilityItem[]
	{
		const query = this.searchDraft().trim().toLowerCase();
		return this.capabilities().filter(function matching(capability): boolean
		{
			return capability.collection === collection && (query === "" || capability.name.toLowerCase().includes(query) || capability.description.toLowerCase().includes(query));
		});
	}
}
