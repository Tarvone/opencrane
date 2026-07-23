import { ChangeDetectionStrategy, Component, signal, WritableSignal, inject, resource, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { SectionHeadingComponent, DestructiveConfirmationComponent } from "@opencrane/elements/ui";
import { DestructiveActionPhase, DestructiveActionState } from "@opencrane/core";
import { SETTINGS_GATEWAY } from "@opencrane/state/settings/adapter";

type CreatePhase = "idle" | "naming" | "revealing";

/**
 * Personal API Keys view managing transient key generation.
 * All state is managed through the injected gateway.
 */
@Component({
	selector: "wo-api-keys-section",
	standalone: true,
	imports: [SectionHeadingComponent, DestructiveConfirmationComponent, FormsModule],
	templateUrl: "./api-keys-section.component.html",
	styleUrl: "./api-keys-section.component.scss",
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApiKeysSectionComponent
{
	private readonly _gateway = inject(SETTINGS_GATEWAY);

	/** Resource-backed list of generated keys. */
	public readonly keys = resource({
		loader: () => this._gateway.getPersonalApiKeys()
	});

	/** Computed array for template binding. */
	public readonly keyList = computed(() => this.keys.value() ?? []);

	/** Current phase of the creation interaction. */
	public readonly createPhase: WritableSignal<CreatePhase> = signal("idle");

	/** Bound to the naming input field. */
	public readonly pendingKeyName: WritableSignal<string> = signal("");

	/** Held only during 'revealing'; destroyed on dismiss. */
	public readonly revealedKey: WritableSignal<string> = signal("");

	/** Checkbox state for acknowledging one-time reveal. */
	public readonly acknowledged: WritableSignal<boolean> = signal(false);

	/** ID of the key currently pending revocation. */
	public readonly revokeTarget: WritableSignal<string | null> = signal(null);

	/** Passed into the destructive confirmation component. */
	public readonly revokeState: WritableSignal<DestructiveActionState> = signal({ phase: DestructiveActionPhase.Idle });

	public openCreate(): void
	{
		this.createPhase.set("naming");
		this.pendingKeyName.set("");
	}

	public cancelCreate(): void
	{
		this.createPhase.set("idle");
		this.pendingKeyName.set("");
	}

	public async submitCreate(): Promise<void>
	{
		const name = this.pendingKeyName().trim();
		if (!name) return;

		try
		{
			const key = await this._gateway.addPersonalApiKey(name);
			this.keys.reload();
			
			this.revealedKey.set(key.rawKey ?? key.redacted);
			this.acknowledged.set(false);
			this.createPhase.set("revealing");
		}
		catch (e)
		{
			// Ignore mock failures
		}
	}

	public async copyKey(): Promise<void>
	{
		try
		{
			await navigator.clipboard.writeText(this.revealedKey());
		}
		catch (e)
		{
			// Ignore mock copy failures
		}
	}

	public dismissReveal(): void
	{
		// Non-recoverable dismissal
		this.revealedKey.set("");
		this.createPhase.set("idle");
	}

	public openRevoke(id: string): void
	{
		this.revokeTarget.set(id);
		this.revokeState.set({ phase: DestructiveActionPhase.Idle });
	}

	public cancelRevoke(): void
	{
		this.revokeTarget.set(null);
	}

	public async confirmRevoke(): Promise<void>
	{
		this.revokeState.set({ phase: DestructiveActionPhase.Pending });
		
		const id = this.revokeTarget();
		if (!id) return;

		try
		{
			await this._gateway.removePersonalApiKey(id);
			this.keys.reload();
			this.revokeTarget.set(null);
			this.revokeState.set({ phase: DestructiveActionPhase.Idle });
		}
		catch (e)
		{
			this.revokeState.set({ phase: DestructiveActionPhase.Idle });
		}
	}
}
