import { ChangeDetectionStrategy, Component, input } from "@angular/core";

import { CapabilityGroup, CapabilityIcon, CapabilityIntegrationKind } from "@opencrane/core";
import { CAPABILITY_GROUPS_FIXTURE } from "@opencrane/core/testing";

/** Mock-only Workspace Skills section rendered from the authoritative capability fixtures. */
@Component({
	selector: "wo-skills-section",
	standalone: true,
	templateUrl: "./skills-section.component.html",
	styleUrl: "./skills-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillsSectionComponent
{
	/** Capability groups rendered in the handoff's canonical scope order. */
	public readonly groups = input<readonly CapabilityGroup[]>(CAPABILITY_GROUPS_FIXTURE);

	/** Origami icon values exposed to the external template. */
	public readonly CapabilityIcon = CapabilityIcon;

	/** Integration tag kinds exposed to the external template. */
	public readonly CapabilityIntegrationKind = CapabilityIntegrationKind;
}
