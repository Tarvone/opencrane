import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { MessageCard, MessageCardKind } from "@opencrane/core";

@Component({
	selector: "wo-citation-strip",
	standalone: true,
	templateUrl: "./citation-strip.component.html",
	styleUrl: "./citation-strip.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class CitationStripComponent
{
	public readonly card = input.required<MessageCard>();

	public readonly typeColor = computed(() => {
		const t = this.card().type;
		if (t === MessageCardKind.Observation) return { bg: 'var(--wo-observation-bg)', color: 'var(--wo-observation)', short: 'R' };
		if (t === MessageCardKind.Policy) return { bg: 'var(--wo-policy-bg)', color: 'var(--wo-policy)', short: 'P' };
		if (t === MessageCardKind.Action) return { bg: 'var(--oc-green-tint-bg)', color: 'var(--oc-green-feedback)', short: 'A' };
		return { bg: 'var(--oc-teal-tint-bg)', color: 'var(--oc-teal-edge)', short: 'Ag' }; // Default
	});

	public readonly scopeColor = computed(() => {
		const s = this.card().scope || 'org';
		if (s === 'dept') return { bg: 'var(--wo-scope-dept-bg)', color: 'var(--wo-scope-dept-accent)' };
		if (s === 'project') return { bg: 'var(--wo-observation-bg)', color: 'var(--wo-scope-project)' };
		if (s === 'personal') return { bg: 'var(--oc-red-tint-bg)', color: 'var(--oc-red)' };
		return { bg: 'var(--oc-surface-muted)', color: 'var(--wo-scope-org)' }; // org
	});

	public readonly statusColor = computed(() => {
		const s = this.card().status;
		if (s === 'applied') return 'var(--oc-amber)';
		if (s === 'done') return 'var(--wo-ok)';
		if (s === 'pending') return 'var(--oc-red)';
		if (s === 'resolved') return 'var(--oc-text-muted)';
		return null;
	});

	public readonly displayId = computed(() => {
		const id = this.card().id;
		if (!id) return this.typeColor().short + '1';
		return id;
	});
}
