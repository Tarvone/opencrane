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
		if (t === MessageCardKind.Observation) return { bg: '#ddeeff', color: '#1d4d8a', short: 'R' };
		if (t === MessageCardKind.Policy) return { bg: '#fef0d0', color: '#7a5010', short: 'P' };
		if (t === MessageCardKind.Action) return { bg: '#d8f0e4', color: '#1a5c38', short: 'A' };
		return { bg: '#d9f4f8', color: '#0a94a7', short: 'Ag' }; // Default
	});

	public readonly scopeColor = computed(() => {
		const s = this.card().scope || 'org';
		if (s === 'dept') return { bg: '#fef0d0', color: '#7a5010' };
		if (s === 'project') return { bg: '#e0f0e8', color: '#1a5c38' };
		if (s === 'personal') return { bg: '#fce8e4', color: '#c1392b' };
		return { bg: '#e8e8e4', color: '#4a4845' }; // org
	});

	public readonly statusColor = computed(() => {
		const s = this.card().status;
		if (s === 'applied') return '#9a6b2a';
		if (s === 'done') return '#2a7d4f';
		if (s === 'pending') return '#c1392b';
		if (s === 'resolved') return '#8a8682';
		return null;
	});

	public readonly displayId = computed(() => {
		const id = this.card().id;
		if (!id) return this.typeColor().short + '1';
		return id;
	});
}
