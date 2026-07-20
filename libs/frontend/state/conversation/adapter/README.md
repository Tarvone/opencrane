# @opencrane/state/conversation/adapter — live conversation gateway

> [frontend](../../../README.md) › [state](../../README.md) › conversation › adapter

## What it owns

Part of the OpenCrane **frontend state layer** (the code between the browser UI and the backend). The
UI talks to conversations through the **`ConversationGateway`** port — a plain TypeScript interface
defined in [`state/core`](../../core/README.md) — so it never knows about HTTP or WebSockets. This
package is the **adapter**: the class that actually opens the connection and speaks the wire protocol.
All knowledge of the *blue* OpenClaw pod runtime (the legacy chat runtime being replaced) is
deliberately confined here, so features stay runtime-agnostic.

Opening a thread runs two steps. First the adapter **brokers a pod token**: it POSTs to
`/auth/pod-token` to resolve the caller's pod and get its gateway URL. (No secret is returned — the
socket is authorised at the ingress against the login session; a 409/403 maps to a `provisioning` or
`refused` connection status.) Then it opens a validated **OpenClaw Gateway v4 WebSocket** and maps
each streamed chunk onto the gateway's signals (`messages`, `status`, `typing`, `sessions`).

```
 features/conversation (UI)
        │ injects CONVERSATION_GATEWAY (the port)
        ▼
 OpenClawConversationGateway  ◄── HERE
   ├─ POST /auth/pod-token ....... resolve pod + gateway URL (no token to browser)
   └─ OpenClaw Gateway v4 WS ..... chat.send / chat.history / stream events
        │ hydrates signals + writes CONVERSATION_CACHE
        ▼
 conversation/cache (instant reopen)
```

**In this flow:** [core](../../core/README.md) · [conversation/cache](../cache/README.md) · [features/conversation](../../../features/conversation/README.md)

Invariant: the browser holds no pod credential (trusted-proxy auth), and the history window is capped
at 1000 rows — there is no cursor, so `loadOlder` re-fetches a larger tail. If the protocol assumptions
are wrong the connection fails closed to a visible status; it never fabricates transcript content.

## Public surface

- `OpenClawConnection` — the TypeBox-validated Gateway v4 WebSocket client.
- `OpenClawConversationGateway` — the live `ConversationGateway` implementation bound in `state/gateways`.
- `gateway-protocol.schema` / `gateway-protocol.types` — the validated v4 frame/event shapes.
- `history.util`, `pod-token.util`, `session-list.util` — pure helpers (history windowing, pod-token failure → status, session mapping).

## Boundary

Bound to `CONVERSATION_GATEWAY` by [`state/gateways`](../../gateways/README.md); consumed only
through that port by `features/conversation`. It is the sole home of OpenClaw wire knowledge on the
frontend — no other package imports the protocol schema.

## Dependency direction

Tagged `scope:web` (`type:state`): it may depend only on other `scope:web` and `scope:shared`
packages — here `state/core`, `@opencrane/core`, and Angular — never on apps or server domains.

## Status

Bridges the **blue** (frozen) OpenClaw pod runtime, which is scheduled for replacement. Blue-runtime
protocol knowledge is intentionally quarantined in this package so its eventual removal is contained.

## See also

- Parent index: [state](../../README.md)
- Siblings: [conversation/cache](../cache/README.md) · [conversation/render](../render/README.md)
