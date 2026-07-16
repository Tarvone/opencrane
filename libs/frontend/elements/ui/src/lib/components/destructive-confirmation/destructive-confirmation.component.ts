import { ChangeDetectionStrategy, Component, ElementRef, Signal, computed, effect, inject, input, output } from "@angular/core";

import { DestructiveActionPhase, DestructiveActionState } from "@opencrane/core";

/** Default externally controlled destructive action state. */
const DEFAULT_DESTRUCTIVE_STATE: DestructiveActionState = { phase: DestructiveActionPhase.Idle };

/** Monotonic suffix used to keep dialog relationships unique. */
let nextDestructiveConfirmationId = 0;

/** Allocate stable ids for one destructive confirmation instance. */
function _nextDestructiveConfirmationId(): number
{
	nextDestructiveConfirmationId += 1;
	return nextDestructiveConfirmationId;
}

/** Controlled destructive confirmation with safe focus and keyboard behaviour. */
@Component({
	selector: "wo-destructive-confirmation",
	standalone: true,
	templateUrl: "./destructive-confirmation.component.html",
	styleUrl: "./destructive-confirmation.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DestructiveConfirmationComponent
{
	/** Host element used to focus the safe action after the dialog opens. */
	private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

	/** Whether the owning feature currently presents the confirmation. */
	public readonly open = input<boolean>(false);

	/** Human-readable name of the entity affected by the action. */
	public readonly entityName = input.required<string>();

	/** Specific destructive action, such as delete or revoke. */
	public readonly actionName = input.required<string>();

	/** Concrete impact of confirming the action. */
	public readonly impact = input.required<string>();

	/** Explicit destructive label shown on the confirmation button. */
	public readonly confirmationLabel = input.required<string>();

	/** External mutation state; the component emits intent but never performs mutation. */
	public readonly state = input<DestructiveActionState>(DEFAULT_DESTRUCTIVE_STATE);

	/** Invoker restored after cancellation or a surviving completed action. */
	public readonly focusTarget = input<HTMLElement | null>(null);

	/** Emitted for Escape, safe-action activation, or backdrop-independent cancellation. */
	public readonly cancelIntent = output<void>();

	/** Emitted once when explicit destructive confirmation is available. */
	public readonly confirmIntent = output<void>();

	/** Destructive action phase enum exposed to the external template. */
	public readonly DestructiveActionPhase = DestructiveActionPhase;

	/** Stable suffix for accessible dialog relationships. */
	public readonly confirmationId = _nextDestructiveConfirmationId();

	/** Id of the impact-specific dialog heading. */
	public readonly titleId = `wo-destructive-title-${this.confirmationId}`;

	/** Id of the impact-specific dialog description. */
	public readonly descriptionId = `wo-destructive-description-${this.confirmationId}`;

	/** Whether duplicate confirmation is blocked while mutation is active. */
	public readonly pending: Signal<boolean> = computed((): boolean => this.state().phase === DestructiveActionPhase.Pending);

	/** Previous visibility used to detect open and close focus transitions. */
	private _wasOpen = false;

	/** Previous pending state used to move focus when an active confirmation locks. */
	private _wasPending = false;

	/** Register focus synchronization within the component injection context. */
	public constructor()
	{
		effect(this._synchronizeFocus.bind(this));
	}

	/** Cancel safely and restore focus to the documented surviving target. */
	public cancel(): void
	{
		if (!this.pending())
		{
			this.cancelIntent.emit();
			queueMicrotask(this._restoreFocus.bind(this));
		}
	}

	/** Emit at most one destructive intent while an action is available. */
	public confirm(): void
	{
		if (!this.pending())
		{
			this.confirmIntent.emit();
		}
	}

	/** Treat Escape as explicit safe cancellation before mutation begins. */
	public onEscape(event: Event): void
	{
		event.preventDefault();
		this.cancel();
	}

	/** Keep Tab navigation within the two available dialog actions. */
	public onTab(event: KeyboardEvent): void
	{
		const actions = Array.from(this._host.nativeElement.querySelectorAll<HTMLElement>("[data-dialog-focus]:not(:disabled), button:not(:disabled)"));
		const first = actions[0];
		const last = actions.at(-1);
		if (event.shiftKey && document.activeElement === first)
		{
			event.preventDefault();
			last?.focus();
		}
		else if (!event.shiftKey && document.activeElement === last)
		{
			event.preventDefault();
			first?.focus();
		}
	}

	/** Focus the safe default when opening and restore the invoker when closing. */
	private _synchronizeFocus(): void
	{
		const isOpen = this.open();
		const isPending = this.pending();
		if (isOpen && (!this._wasOpen || (isPending && !this._wasPending)))
		{
			queueMicrotask(this._focusSafeAction.bind(this));
		}
		else if (!isOpen && this._wasOpen)
		{
			queueMicrotask(this._restoreFocus.bind(this));
		}
		this._wasOpen = isOpen;
		this._wasPending = isPending;
	}

	/** Move keyboard focus to the non-destructive default action. */
	private _focusSafeAction(): void
	{
		const cancel = this._host.nativeElement.querySelector<HTMLButtonElement>(".wo-destructive__cancel:not(:disabled)");
		const pendingStatus = this._host.nativeElement.querySelector<HTMLElement>(".wo-destructive__pending");
		(cancel ?? pendingStatus)?.focus();
	}

	/** Restore focus after cancellation or to a documented surviving target. */
	private _restoreFocus(): void
	{
		this.focusTarget()?.focus();
	}
}
