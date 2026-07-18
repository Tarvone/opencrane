import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Logger } from "pino";

import type { ResolveOutcome } from "./auth-client.types.js";
import type { FixedWindowRateLimiter } from "./rate-limit.js";

/** Proxy runtime settings consumed by the channel-upgrade handler. */
export interface GatewayProxyRuntime
{
  /** Internal control-plane base URL for delegated auth. */
  controlPlaneUrl: string;
  /** Tenant gateway target port. */
  gatewayPort: number;
  /** Kubernetes cluster DNS suffix. */
  clusterDomain: string;
  /** Header receiving the verified identity. */
  userHeader: string;
  /** Exact browser origins accepted for upgrades. */
  allowedOrigins: string[];
  /** Base domains accepted for org-host upgrades. */
  allowedOriginBaseDomains: string[];
}

/** Minimal WebSocket reverse-proxy surface satisfied by http-proxy. */
export interface WsProxy
{
  /** Forward an authorised upgrade to its tenant target. */
  ws(req: IncomingMessage, socket: Duplex, head: Buffer, options: { target: string; headers?: Record<string, string> }, callback: (err: Error) => void): void;
}

/** Injectable dependencies for the channel-upgrade handler. */
export interface UpgradeDeps
{
  /** Runtime channel-proxy settings. */
  config: GatewayProxyRuntime;
  /** WebSocket forwarding adapter. */
  proxy: WsProxy;
  /** Per-user upgrade limiter. */
  limiter: FixedWindowRateLimiter;
  /** Structured logger. */
  log: Logger;
  /** Optional delegated-auth seam used by tests. */
  resolve?: (controlPlaneUrl: string, cookie: string | undefined, host: string | undefined, signal: AbortSignal) => Promise<ResolveOutcome>;
}
