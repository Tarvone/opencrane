import { describe, expect, it } from "vitest";

import type { ClusterTenantCreateBody } from "@weownai/core";

import { ClusterTenantPhase } from "@weownai/state/cluster-tenant/adapter";
import { MockClusterTenantGateway } from "../__test__/mock-cluster-tenant-gateway";

/** A valid create body for the tests. */
function _body(name: string): ClusterTenantCreateBody
{
	return {
		name,
		displayName: `${name} Inc`,
		isolationTier: "shared",
		compute: { mode: "shared" },
		resources: { quota: { cpu: "2", memory: "4Gi" } }
	};
}

describe("MockClusterTenantGateway", () =>
{
	it("is seeded with two ready customers", async () =>
	{
		const gateway = new MockClusterTenantGateway();
		const tenants = await gateway.list();

		expect(tenants).toHaveLength(2);
		expect(tenants.map((t) => t.name).sort()).toEqual(["acme", "globex"]);
		expect(tenants.every((t) => t.status?.phase === ClusterTenantPhase.Ready)).toBe(true);
	});

	it("creates a tenant in the pending phase", async () =>
	{
		const gateway = new MockClusterTenantGateway();
		const created = await gateway.create(_body("nova"));

		expect(created.name).toBe("nova");
		expect(created.status?.phase).toBe(ClusterTenantPhase.Pending);
		expect(await gateway.list()).toHaveLength(3);
	});

	it("rejects creating a tenant whose name already exists", async () =>
	{
		const gateway = new MockClusterTenantGateway();
		await expect(gateway.create(_body("acme"))).rejects.toThrow(/already exists/);
	});

	it("advances a created tenant pending → provisioning → ready over successive getStatus calls", async () =>
	{
		const gateway = new MockClusterTenantGateway();
		await gateway.create(_body("nova"));

		const first = await gateway.getStatus("nova");
		const second = await gateway.getStatus("nova");
		const third = await gateway.getStatus("nova");
		const fourth = await gateway.getStatus("nova");

		expect(first.phase).toBe(ClusterTenantPhase.Provisioning);
		expect(second.phase).toBe(ClusterTenantPhase.Ready);
		expect(third.phase).toBe(ClusterTenantPhase.Ready);
		expect(fourth.phase).toBe(ClusterTenantPhase.Ready);
		expect(second.boundNamespace).toBe("ct-nova");
	});

	it("reflects the advanced phase on a subsequent get", async () =>
	{
		const gateway = new MockClusterTenantGateway();
		await gateway.create(_body("nova"));
		await gateway.getStatus("nova");

		const fetched = await gateway.get("nova");
		expect(fetched.status?.phase).toBe(ClusterTenantPhase.Provisioning);
	});

	it("updates a tenant's display fields while preserving status", async () =>
	{
		const gateway = new MockClusterTenantGateway();
		const updated = await gateway.update("acme", { ..._body("acme"), displayName: "Acme Renamed" });

		expect(updated.displayName).toBe("Acme Renamed");
		expect(updated.status?.phase).toBe(ClusterTenantPhase.Ready);
	});

	it("removes a tenant", async () =>
	{
		const gateway = new MockClusterTenantGateway();
		await gateway.remove("globex");

		expect((await gateway.list()).map((t) => t.name)).toEqual(["acme"]);
		await expect(gateway.get("globex")).rejects.toThrow(/not found/);
	});

	it("rejects status/get/update for an unknown tenant", async () =>
	{
		const gateway = new MockClusterTenantGateway();
		await expect(gateway.getStatus("ghost")).rejects.toThrow(/not found/);
		await expect(gateway.get("ghost")).rejects.toThrow(/not found/);
		await expect(gateway.update("ghost", _body("ghost"))).rejects.toThrow(/not found/);
	});
});
