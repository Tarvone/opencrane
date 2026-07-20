# @opencrane/server/_infra/obot-custody — the Obot credential-custody port

> [server](../../README.md) › [_infra](../README.md) › obot-custody

## What it owns

This library owns the **boundary for handing an integration's secret to Obot to hold**, instead of
storing it in OpenCrane. *Obot* is the external tool-connection system OpenCrane runs alongside (see
`apps/_infra/obot`); "custody" means Obot keeps the credential and gives back only an opaque
reference, so the raw secret never has to live in an OpenCrane database. This package is a
**port** — a runtime-neutral contract (a TypeScript interface) that says *what* custody operations
exist, with the real transport wired in elsewhere.

It sits between the integrations backend and the remote Obot authority:

```
 integrations gateway  (user connects a tool, supplies a credential)
          │  ProvisionObotCustodyCommand  (write-only credential)
          ▼
 ┌────────────────────────────┐
 │  obot-custody  ◄── HERE     │  ObotCustodyPort: provision · revoke
 └────────────────────────────┘
          │  ProvisionedObotCustody  (Obot-minted opaque reference + expiry)
          ▼
 remote Obot management authority
```

**In this flow:** the `integrations` backend gateway *(sole consumer)* · the remote Obot authority
*(mints the reference)*

It owns: the `ObotCustodyPort` interface (`provision` / `revoke`); the request/result types where
the credential is **write-only** (passed straight through, never persisted, logged, or returned) and
the result carries only an Obot-originated opaque reference plus its remote expiry; and a
**fail-closed** default implementation, `__UnavailableObotCustodyAdapter`, which throws
`ObotCustodyUnavailableError` for every call. That default ships until an authenticated Obot
management transport is verified, so no code path can mint a fake local custody handle in the
meantime. Invariant: a custody reference is only ever real if Obot minted it — the platform never
synthesises one, and absent a working transport the answer is a hard failure, not a placeholder.

## Public surface

- `ObotCustodyPort` — the runtime-neutral provision/revoke contract.
- `ProvisionObotCustodyCommand`, `ProvisionedObotCustody`, `ObotCustodyCredential` — the I/O types.
- `__UnavailableObotCustodyAdapter`, `ObotCustodyUnavailableError` — the fail-closed default and its error.

## Boundary

Consumed by the `integrations` backend gateway. It defines the custody contract and a safe default;
it does not talk to Obot itself yet — a concrete, authenticated adapter is wired when the Obot API
contract is confirmed. It stores nothing and holds no secret beyond the single in-flight call.

## Dependency direction

Tagged `scope:obot-custody` (`layer:infra`): it may depend only on `scope:obot-custody` and
`scope:shared` packages — never on backend domains, the frontend, or app entrypoints.

## See also

- Parent index: [_infra](../README.md) · [server libraries](../../README.md)
- Siblings: [api](../api/README.md) · [auth](../auth/README.md) · [http](../http/README.md) · [tenant-hosting](../tenant-hosting/README.md) · [channel-proxy](../channel-proxy/README.md)
