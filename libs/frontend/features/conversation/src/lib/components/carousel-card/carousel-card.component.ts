import { ChangeDetectionStrategy, Component, input } from "@angular/core";

@Component({
	selector: "wo-carousel-card",
	standalone: true,
	templateUrl: "./carousel-card.component.html",
	styleUrl: "./carousel-card.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class CarouselCardComponent
{
	public readonly label = input.required<string>();
}
