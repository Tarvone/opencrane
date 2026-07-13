import { Injectable } from "@angular/core";

import { ClusterTenantCreateBody } from "@weownai/core";
import { ClusterTenant, ClusterTenantGateway, ClusterTenantPhase, ClusterTenantStatus } from "@weownai/state/cluster-tenant/adapter";

/** Ordered phase walk a freshly-created tenant follows across successive `getStatus` calls. */
const _PHASE_PROGRESSION: readonly ClusterTenantPhase[] = [ClusterTenantPhase.Pending, ClusterTenantPhase.Provisioning, ClusterTenantPhase.Ready];

/**
 * In-memory ClusterTenantGateway used by tests (never imported by production app code).
 *
 * Seeded with two customers so the list view has content. `create` returns a
 * tenant in `pending`; successive `getStatus` calls for a tenant advance it
 * `pending → provisioning → ready`, giving the polling UI something to animate.
 */
@Injectable()
export class MockClusterTenantGateway implements ClusterTenantGateway
{
	/** Backing store of tenants keyed by name. */
	private readonly _tenants = new Map<string, ClusterTenant>();

	/** Per-tenant index into `_PHASE_PROGRESSION`, advanced on each `getStatus`. */
	private readonly _phaseStep = new Map<string, number>();

	public constructor()
	{
		this._seed();
	}

	/** @inheritdoc */
	public list(): Promise<ClusterTenant[]>
	{
		return Promise.resolve(Array.from(this._tenants.values(), this._clone.bind(this)));
	}

	/** @inheritdoc */
	public get(name: string): Promise<ClusterTenant>
	{
		const tenant = this._tenants.get(name);
		if (!tenant)
		{
			return Promise.reject(new Error(`cluster tenant not found: ${name}`));
		}
		return Promise.resolve(this._clone(tenant));
	}

	/** @inheritdoc */
	public create(body: ClusterTenantCreateBody): Promise<ClusterTenant>
	{
		if (this._tenants.has(body.name))
		{
			return Promise.reject(new Error(`cluster tenant already exists: ${body.name}`));
		}
		const tenant: ClusterTenant = {
			name: body.name,
			displayName: body.displayName,
			baseDomain: body.baseDomain,
			isolationTier: body.isolationTier,
			compute: body.compute,
			resources: body.resources,
			status: { phase: ClusterTenantPhase.Pending }
		};
		this._tenants.set(tenant.name, tenant);
		this._phaseStep.set(tenant.name, 0);
		return Promise.resolve(this._clone(tenant));
	}

	/** @inheritdoc */
	public update(name: string, body: ClusterTenantCreateBody): Promise<ClusterTenant>
	{
		const existing = this._tenants.get(name);
		if (!existing)
		{
			return Promise.reject(new Error(`cluster tenant not found: ${name}`));
		}
		const tenant: ClusterTenant = {
			name,
			displayName: body.displayName,
			baseDomain: body.baseDomain,
			isolationTier: body.isolationTier,
			compute: body.compute,
			resources: body.resources,
			status: existing.status
		};
		this._tenants.set(name, tenant);
		return Promise.resolve(this._clone(tenant));
	}

	/** @inheritdoc */
	public remove(name: string): Promise<void>
	{
		this._tenants.delete(name);
		this._phaseStep.delete(name);
		return Promise.resolve();
	}

	/** @inheritdoc */
	public getStatus(name: string): Promise<ClusterTenantStatus>
	{
		const tenant = this._tenants.get(name);
		if (!tenant)
		{
			return Promise.reject(new Error(`cluster tenant not found: ${name}`));
		}
		const status = this._advance(name);
		this._tenants.set(name, { ...tenant, status });
		return Promise.resolve({ ...status });
	}

	/**
	 * Advance the tenant one step along the phase progression (clamped at `ready`)
	 * and return the resulting status, attaching the bound namespace once ready.
	 */
	private _advance(name: string): ClusterTenantStatus
	{
		const step = Math.min((this._phaseStep.get(name) ?? 0) + 1, _PHASE_PROGRESSION.length - 1);
		this._phaseStep.set(name, step);
		const phase = _PHASE_PROGRESSION[step];
		if (phase === ClusterTenantPhase.Ready)
		{
			return { phase, boundNamespace: `ct-${name}`, provisioner: "mock-provisioner" };
		}
		return { phase, provisioner: "mock-provisioner" };
	}

	/** Deep-ish clone so callers cannot mutate the mock's internal records. */
	private _clone(tenant: ClusterTenant): ClusterTenant
	{
		return {
			...tenant,
			compute: { ...tenant.compute },
			resources: { quota: { ...tenant.resources.quota } },
			status: tenant.status ? { ...tenant.status } : undefined
		};
	}

	/** Seed two ready customers so the list view is populated on first load. */
	private _seed(): void
	{
		const acme: ClusterTenant = {
			name: "acme",
			displayName: "Acme Corp",
			baseDomain: "ai.acme.example",
			isolationTier: "dedicatedNodes",
			compute: { mode: "dedicated", nodePool: "acme-pool" },
			resources: { quota: { cpu: "8", memory: "16Gi", pods: 40, storage: "100Gi" } },
			status: { phase: ClusterTenantPhase.Ready, boundNamespace: "ct-acme", provisioner: "mock-provisioner" }
		};
		const globex: ClusterTenant = {
			name: "globex",
			displayName: "Globex LLC",
			isolationTier: "shared",
			compute: { mode: "shared" },
			resources: { quota: { cpu: "2", memory: "4Gi", pods: 20 } },
			status: { phase: ClusterTenantPhase.Ready, boundNamespace: "ct-globex", provisioner: "mock-provisioner" }
		};
		this._tenants.set(acme.name, acme);
		this._tenants.set(globex.name, globex);
		this._phaseStep.set(acme.name, _PHASE_PROGRESSION.length - 1);
		this._phaseStep.set(globex.name, _PHASE_PROGRESSION.length - 1);
	}
}
