import { Injectable, Signal, computed, signal, resource } from "@angular/core";
import { Capabilities, SessionTenant, SessionUser } from "@opencrane/state/core";

/**
 * Mock SessionStore for the UI handoff.
 * Bypasses the live OIDC flow and backend calls, returning deterministic
 * mock data so the workspace shell and UI components render completely.
 */
@Injectable()
export class MockSessionStore
{
	public readonly me = resource({
		loader: async () => ({
			authenticated: true,
			user: {
				sub: "mock-user-1",
				email: "alex@example.com",
				name: "Alex Kim",
				groups: [],
				isPlatformOperator: false,
				isOrgAdmin: true,
				clusterTenant: null
			}
		})
	});

	public readonly authenticated: Signal<boolean> = computed(() => true);

	public readonly user: Signal<SessionUser | undefined> = computed(() => ({
		sub: "mock-user-1",
		email: "alex@example.com",
		name: "Alex Kim",
		groups: [],
		isPlatformOperator: false,
		isOrgAdmin: true,
		clusterTenant: null
	}));

	public readonly displayName: Signal<string | undefined> = computed(() => "Alex Kim");

	public readonly tenants = resource({
		loader: async (): Promise<SessionTenant[]> => [{
			name: "design-handoff-tenant",
			email: "alex@example.com",
			ingressHost: "pod.example.com"
		}]
	});

	private readonly _selectedTenant = signal<string | null>(null);

	public readonly currentTenant: Signal<SessionTenant | undefined> = computed(() => this.tenants.value()?.[0]);

	public readonly capabilities: Signal<Capabilities> = computed(() => ({
		isOperator: true,
		isPlatformOperator: false,
		customerAdmin: true,
		manageTenants: true,
		manageCustomers: false,
		managePolicies: true,
		manageBudgets: true
	}));

	public switchTenant(name: string): void {
		this._selectedTenant.set(name);
	}

	public reload(): void {
		this.me.reload();
		this.tenants.reload();
	}

	public async logout(): Promise<void> {
		if (typeof window !== "undefined") {
			window.location.assign("/login");
		}
	}
}
