import { ChangeDetectionStrategy, Component } from "@angular/core";

@Component({
	selector: "wo-origami-loader",
	standalone: true,
	templateUrl: "./origami-loader.component.html",
	styleUrl: "./origami-loader.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrigamiLoaderComponent
{
	public facets = ['#0db5cc', '#22c7dd', '#0d8ba0', '#66d7e6', '#f47920'];
}
