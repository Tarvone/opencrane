import { ChangeDetectionStrategy, Component, signal, WritableSignal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { SectionHeadingComponent, DestructiveConfirmationComponent } from "@opencrane/elements/ui";
import { DestructiveActionPhase, DestructiveActionState } from "@opencrane/core";

/** Shape of an API key locally managed in the UI list. */
interface MockApiKey
{
	id: string;
	name: string;
	createdAt: string;
	redacted: string;
}

type CreatePhase = "idle" | "naming" | "revealing";

/**
 * Personal API Keys view managing transient key generation.
 * All state is mock/local to demonstrate the UI interaction flow;
 * secret values are purposefully non-persistent.
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
	/** In-memory list of generated keys. */
	public readonly keys: WritableSignal<MockApiKey[]> = signal([]);

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

	public submitCreate(): void
	{
		const name = this.pendingKeyName().trim();
		if (!name) return;

		const id = crypto.randomUUID();
		const rawKey = `sk-wo_${crypto.randomUUID().replace(/-/g, "")}`;
		const redacted = `sk-wo_••••••••••••••••••••••••••••••••`;

		// Format date as "Jul 17, 2026"
		const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
		const createdAt = formatter.format(new Date());

		this.keys.update(k => [{ id, name, createdAt, redacted }, ...k]);
		
		this.revealedKey.set(rawKey);
		this.acknowledged.set(false);
		this.createPhase.set("revealing");
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

	public confirmRevoke(): void
	{
		this.revokeState.set({ phase: DestructiveActionPhase.Pending });
		
		// Mock a short delay
		setTimeout(() => {
			this.keys.update(list => list.filter(k => k.id !== this.revokeTarget()));
			this.revokeTarget.set(null);
			this.revokeState.set({ phase: DestructiveActionPhase.Idle });
		}, 300);
	}
}
