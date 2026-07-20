import type { V1Job, V1NetworkPolicy } from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";

import { __BuildSuspendedAgentRuntimeJobResources } from "@opencrane/backend/agents/runtime/k8s-launcher";

import { __CreateKubernetesAgentControllerStore } from "../kubernetes-agent-controller-store.js";
import type { AgentControllerBatchApi, AgentControllerNetworkingApi } from "../agent-controller.types.js";

/** Build one valid attempt resource pair for adapter tests. */
function _Resources()
{
	return __BuildSuspendedAgentRuntimeJobResources(
		{ runId: "run-1", attempt: 1, agentServiceId: "service-1", agentRevisionId: "revision-1", siloId: "silo-1", namespace: "silo-a" },
		{ image: "ghcr.io/italanta/opencrane-agent-runtime@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", imagePullPolicy: "IfNotPresent", runtimeStreamUrl: "http://opencrane-server.silo-a.svc.cluster.local:3001/api/internal/agent-runtime", serverNamespace: "silo-a", serviceAccountName: "agent-runtime-default", releaseSelectorLabels: { "app.kubernetes.io/name": "opencrane-silo", "app.kubernetes.io/instance": "opencrane" }, serverPort: 3001, projectedTokenTtlSeconds: 600, scratchSize: "64Mi", activeDeadlineSeconds: 900, ttlSecondsAfterFinished: 300, resources: { requests: { cpu: "25m", memory: "64Mi" }, limits: { cpu: "250m", memory: "128Mi" } } },
	);
}

/** Return an AlreadyExists error in a Kubernetes-client-compatible shape. */
function _Conflict(): Error & { statusCode: number }
{
	return Object.assign(new Error("already exists"), { statusCode: 409 });
}

describe("get/create-only Kubernetes controller store", function _Suite()
{
	it("creates exact resources without any update API", async function _Creates()
	{
		const resources = _Resources();
		const networkingApi: AgentControllerNetworkingApi = { async createNamespacedNetworkPolicy() { return resources.networkPolicy; }, async readNamespacedNetworkPolicy() { throw new Error("unexpected read"); } };
		const batchApi: AgentControllerBatchApi = { async createNamespacedJob() { return { ...resources.job, metadata: { ...resources.job.metadata, uid: "job-uid" } }; }, async readNamespacedJob() { throw new Error("unexpected read"); } };
		const store = __CreateKubernetesAgentControllerStore({ batchApi, networkingApi });

		expect(await store.__EnsureNetworkPolicy(resources.networkPolicy)).toEqual(resources.networkPolicy);
		expect((await store.__EnsureSuspendedJob(resources.job)).metadata?.uid).toBe("job-uid");
	});

	it("exact-adopts deterministic resources after create conflicts", async function _Adopts()
	{
		const resources = _Resources();
		const currentPolicy: V1NetworkPolicy = { ...resources.networkPolicy, metadata: { ...resources.networkPolicy.metadata, uid: "policy-uid", resourceVersion: "3" } };
		const currentJob: V1Job = { ...resources.job, metadata: { ...resources.job.metadata, uid: "job-uid", resourceVersion: "4" } };
		const networkingApi: AgentControllerNetworkingApi = { async createNamespacedNetworkPolicy() { throw _Conflict(); }, async readNamespacedNetworkPolicy() { return currentPolicy; } };
		const batchApi: AgentControllerBatchApi = { async createNamespacedJob() { throw _Conflict(); }, async readNamespacedJob() { return currentJob; } };
		const store = __CreateKubernetesAgentControllerStore({ batchApi, networkingApi });

		expect((await store.__EnsureNetworkPolicy(resources.networkPolicy)).metadata?.uid).toBe("policy-uid");
		expect((await store.__EnsureSuspendedJob(resources.job)).metadata?.uid).toBe("job-uid");
	});

	it("accepts only documented API defaults and an equal deprecated ServiceAccount alias", async function _NormalizesApiDefaults()
	{
		const resources = _Resources();
		const expectedPodSpec = resources.job.spec?.template.spec;
		const currentJob: V1Job = {
			...resources.job,
			metadata: { ...resources.job.metadata, uid: "job-uid", resourceVersion: "4" },
			spec: {
				...resources.job.spec!,
				manualSelector: false,
				completionMode: "NonIndexed",
				template: {
					...resources.job.spec!.template,
					spec: {
						...expectedPodSpec!,
						serviceAccount: expectedPodSpec?.serviceAccountName,
						dnsPolicy: "ClusterFirst",
						schedulerName: "default-scheduler",
						terminationGracePeriodSeconds: 30,
						containers: expectedPodSpec!.containers.map(function _container(container) { return { ...container, terminationMessagePath: "/dev/termination-log", terminationMessagePolicy: "File" }; }),
					},
				},
			},
		};
		const networkingApi: AgentControllerNetworkingApi = { async createNamespacedNetworkPolicy() { return resources.networkPolicy; }, async readNamespacedNetworkPolicy() { throw new Error("unexpected read"); } };
		const batchApi: AgentControllerBatchApi = { async createNamespacedJob() { throw _Conflict(); }, async readNamespacedJob() { return currentJob; } };
		const store = __CreateKubernetesAgentControllerStore({ batchApi, networkingApi });

		expect((await store.__EnsureSuspendedJob(resources.job)).metadata?.uid).toBe("job-uid");
	});

	it("rejects a deprecated ServiceAccount alias that differs from the owned profile", async function _RejectsServiceAccountAliasDrift()
	{
		const resources = _Resources();
		const podSpec = resources.job.spec?.template.spec;
		const currentJob: V1Job = { ...resources.job, metadata: { ...resources.job.metadata, uid: "job-uid" }, spec: { ...resources.job.spec!, template: { ...resources.job.spec!.template, spec: { ...podSpec!, serviceAccount: "foreign-controller" } } } };
		const networkingApi: AgentControllerNetworkingApi = { async createNamespacedNetworkPolicy() { return resources.networkPolicy; }, async readNamespacedNetworkPolicy() { throw new Error("unexpected read"); } };
		const batchApi: AgentControllerBatchApi = { async createNamespacedJob() { throw _Conflict(); }, async readNamespacedJob() { return currentJob; } };
		const store = __CreateKubernetesAgentControllerStore({ batchApi, networkingApi });

		await expect(store.__EnsureSuspendedJob(resources.job)).rejects.toThrow(/refusing to adopt/);
	});

	it("refuses to adopt a broadened policy or executable Job", async function _RejectsDrift()
	{
		const resources = _Resources();
		const broadenedPolicy: V1NetworkPolicy = { ...resources.networkPolicy, spec: { ...resources.networkPolicy.spec, ingress: [{}] } };
		const executableJob: V1Job = { ...resources.job, metadata: { ...resources.job.metadata, uid: "foreign-uid" }, spec: { ...resources.job.spec!, suspend: false } };
		const networkingApi: AgentControllerNetworkingApi = { async createNamespacedNetworkPolicy() { throw _Conflict(); }, async readNamespacedNetworkPolicy() { return broadenedPolicy; } };
		const batchApi: AgentControllerBatchApi = { async createNamespacedJob() { throw _Conflict(); }, async readNamespacedJob() { return executableJob; } };
		const store = __CreateKubernetesAgentControllerStore({ batchApi, networkingApi });

		await expect(store.__EnsureNetworkPolicy(resources.networkPolicy)).rejects.toThrow(/refusing to adopt/);
		await expect(store.__EnsureSuspendedJob(resources.job)).rejects.toThrow(/refusing to adopt/);
	});
});
