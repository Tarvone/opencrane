import { AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE } from "@opencrane/contracts";
import { describe, expect, it } from "vitest";

import { __BuildSuspendedAgentRuntimeJobResources } from "../agent-runtime-job.js";
import type { AgentRuntimeJobAssignment, AgentRuntimeJobProfile } from "../agent-runtime-job.types.js";

/** Create one valid immutable run-attempt assignment. */
function _Assignment(): AgentRuntimeJobAssignment
{
	return {
		runId: "run-1",
		attempt: 2,
		agentServiceId: "service-1",
		agentRevisionId: "revision-1",
		siloId: "silo-1",
		namespace: "opencrane-silo-1",
	};
}

/** Create the release-fixed resource profile for runtime Jobs. */
function _Profile(): AgentRuntimeJobProfile
{
	return {
		image: "ghcr.io/italanta/opencrane-agent-runtime@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		imagePullPolicy: "IfNotPresent",
		runtimeStreamUrl: "http://opencrane-server.opencrane-silo-1.svc.cluster.local:3001/api/internal/agent-runtime",
		serverNamespace: "opencrane-silo-1",
		serviceAccountName: "agent-runtime-personal",
		releaseSelectorLabels: { "app.kubernetes.io/name": "opencrane-silo", "app.kubernetes.io/instance": "opencrane" },
		serverPort: 3001,
		projectedTokenTtlSeconds: 600,
		scratchSize: "64Mi",
		activeDeadlineSeconds: 900,
		ttlSecondsAfterFinished: 300,
		resources: { requests: { cpu: "25m", memory: "64Mi" }, limits: { cpu: "250m", memory: "128Mi" } },
	};
}

describe("personal-runtime attempt Job resources", function _Suite()
{
	it("derives one stable resource identity per run attempt", function _DeterministicIdentity()
	{
		const first = __BuildSuspendedAgentRuntimeJobResources(_Assignment(), _Profile());
		const replay = __BuildSuspendedAgentRuntimeJobResources(_Assignment(), _Profile());
		const nextAttempt = __BuildSuspendedAgentRuntimeJobResources({ ..._Assignment(), attempt: 3 }, _Profile());

		expect(replay).toEqual(first);
		expect(first.networkPolicy.metadata?.name).toBe(first.job.metadata?.name);
		expect(first.job.metadata?.name?.length).toBeLessThanOrEqual(63);
		expect(nextAttempt.job.metadata?.name).not.toBe(first.job.metadata?.name);
	});

	it("keeps the Job suspended, single-Pod, zero-retry, and non-privileged", function _SuspendedJob()
	{
		const resources = __BuildSuspendedAgentRuntimeJobResources(_Assignment(), _Profile());
		const podSpec = resources.job.spec?.template.spec;
		const runtime = podSpec?.containers[0];

		expect(resources.job.kind).toBe("Job");
		expect(resources.job.spec).toMatchObject({ suspend: true, parallelism: 1, completions: 1, backoffLimit: 0, activeDeadlineSeconds: 900, ttlSecondsAfterFinished: 300 });
		expect(podSpec).toMatchObject({ automountServiceAccountToken: false, enableServiceLinks: false, restartPolicy: "Never", securityContext: { runAsNonRoot: true, runAsUser: 65532, runAsGroup: 65532, fsGroup: 65532, fsGroupChangePolicy: "OnRootMismatch", seccompProfile: { type: "RuntimeDefault" } } });
		expect(runtime?.securityContext).toMatchObject({ allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } });
		expect(podSpec?.serviceAccountName).toBe("agent-runtime-personal");
		expect(resources).not.toHaveProperty("serviceAccount");
		expect(resources.job.spec?.template.metadata?.labels).toMatchObject({ "app.kubernetes.io/name": "opencrane-silo", "app.kubernetes.io/instance": "opencrane", "app.kubernetes.io/component": "agent-runtime" });
	});

	it("projects only the runtime audience and mounts bounded ephemeral scratch", function _BoundedVolumes()
	{
		const resources = __BuildSuspendedAgentRuntimeJobResources(_Assignment(), _Profile());
		const volumes = resources.job.spec?.template.spec?.volumes;
		const tokenProjection = volumes?.find(volume => volume.name === "runtime-token")?.projected?.sources?.[0]?.serviceAccountToken;
		const tokenMode = volumes?.find(volume => volume.name === "runtime-token")?.projected?.defaultMode;
		const serialized = JSON.stringify(resources);

		expect(tokenProjection).toMatchObject({ audience: AGENT_RUNTIME_PROJECTED_TOKEN_AUDIENCE, expirationSeconds: 600, path: "runtime.token" });
		expect(tokenMode).toBe(0o440);
		expect(volumes?.find(volume => volume.name === "scratch")?.emptyDir).toEqual({ sizeLimit: "64Mi" });
		expect(serialized).not.toContain("persistentVolumeClaim");
		expect(serialized).not.toContain("secretKeyRef");
	});

	it("denies ingress and limits egress to the server and cluster DNS", function _NetworkBoundary()
	{
		const resources = __BuildSuspendedAgentRuntimeJobResources(_Assignment(), _Profile());

		expect(resources.networkPolicy.spec?.policyTypes).toEqual(["Ingress", "Egress"]);
		expect(resources.networkPolicy.spec?.ingress).toEqual([]);
		expect(resources.networkPolicy.spec?.egress).toHaveLength(2);
		expect(resources.networkPolicy.spec?.egress?.[0]).toMatchObject({ to: [{ podSelector: { matchLabels: { "app.kubernetes.io/name": "opencrane-silo", "app.kubernetes.io/instance": "opencrane", "app.kubernetes.io/component": "opencrane-server" } } }], ports: [{ protocol: "TCP", port: 3001 }] });
	});

	it("rejects Internet endpoints and non-positive attempts before adapter I/O", function _InvalidInputs()
	{
		expect(function _InternetEndpoint() { __BuildSuspendedAgentRuntimeJobResources(_Assignment(), { ..._Profile(), runtimeStreamUrl: "https://example.com/runtime" }); }).toThrow(/in-cluster HTTP stream URL/);
		expect(function _InvalidAttempt() { __BuildSuspendedAgentRuntimeJobResources({ ..._Assignment(), attempt: 0 }, _Profile()); }).toThrow(/positive safe integer/);
		expect(function _MutableImageTag() { __BuildSuspendedAgentRuntimeJobResources(_Assignment(), { ..._Profile(), image: "ghcr.io/italanta/opencrane-agent-runtime:latest" }); }).toThrow(/immutable image/);
		expect(function _CrossNamespaceServer() { __BuildSuspendedAgentRuntimeJobResources(_Assignment(), { ..._Profile(), serverNamespace: "other-silo", runtimeStreamUrl: "http://opencrane-server.other-silo.svc.cluster.local:3001/api/internal/agent-runtime" }); }).toThrow(/share one namespace/);
		expect(function _MismatchedServerPort() { __BuildSuspendedAgentRuntimeJobResources(_Assignment(), { ..._Profile(), serverPort: 3002 }); }).toThrow(/in-cluster HTTP stream URL/);
		expect(function _UnboundedScratch() { __BuildSuspendedAgentRuntimeJobResources(_Assignment(), { ..._Profile(), scratchSize: "2Gi" }); }).toThrow(/bounded scratch/);
		expect(function _MissingResourceLimits() { __BuildSuspendedAgentRuntimeJobResources(_Assignment(), { ..._Profile(), resources: {} }); }).toThrow(/CPU and memory requests/);
	});

	it("does not mutate assignment or release-profile inputs", function _DoesNotMutateInputs()
	{
		const assignment = _Assignment();
		const profile = _Profile();
		const expectedAssignment = structuredClone(assignment);
		const expectedProfile = structuredClone(profile);

		__BuildSuspendedAgentRuntimeJobResources(assignment, profile);

		expect(assignment).toEqual(expectedAssignment);
		expect(profile).toEqual(expectedProfile);
	});
});
