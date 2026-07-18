import type { GatewayProxyRuntime } from "./proxy.types.js";

/** Runtime and listener settings for the in-process channel proxy server. */
export interface GatewayProxyServerConfig extends GatewayProxyRuntime
{
  /** Dedicated proxy listener port. */
  port: number;
  /** Maximum gateway sockets opened per identity per minute. */
  rateLimitPerMinute: number;
}
