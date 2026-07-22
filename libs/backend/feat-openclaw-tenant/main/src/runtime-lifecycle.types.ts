import type * as k8s from "@kubernetes/client-node";
import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";

import type { HostingAdapter } from "@opencrane/server/_infra/tenant-hosting";
import type { OpenClawTenantOperatorConfig } from "./operator-config.types.js";

/** Dependencies injected by the OpenCrane process composition root. */
export interface OpenClawTenantLifecycleOptions
{
  /** Loaded Kubernetes client configuration. */
  kubeConfig: k8s.KubeConfig;
  /** Kubernetes custom-resource client shared with app routes. */
  customApi: k8s.CustomObjectsApi;
  /** Kubernetes core client shared with app routes. */
  coreApi: k8s.CoreV1Api;
  /** Silo database client. */
  prisma: PrismaClient;
  /** Public control-plane port used by the local channel proxy delegate-auth call. */
  publicPort: number;
  /** Parse the app environment into the legacy runtime contract pending package deletion. */
  loadConfig(): OpenClawTenantOperatorConfig;
  /** Select the concrete tenant hosting provider at the app composition boundary. */
  buildHostingAdapter(config: OpenClawTenantOperatorConfig): HostingAdapter;
  /** Structured application logger. */
  log: Logger;
}
