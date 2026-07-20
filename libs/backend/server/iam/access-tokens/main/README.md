# @opencrane/backend/server/iam/access-tokens — API keys for callers who cannot open a browser

> [backend](../../../../README.md) › [server](../../../README.md) › [iam](../../README.md) › access-tokens

## What it owns

This package is part of **IAM** — *identity and access management*, the side of OpenCrane that
answers **who is making this request, and are they allowed to do this?** Access-tokens owns one way of
answering the *who*: long-lived **personal access tokens** — API keys — for callers that cannot go
through an interactive browser sign-in, such as scripts, automation, and continuous-integration jobs.

Most people sign in through their browser and get a session (that is the [identity](../../identity/main/README.md)
package's job). But a script has no browser. Instead, a person creates a token here, once, and the
script sends it on every request as a bearer token. This package manages that token's whole life:
creating it, listing the ones that exist, and revoking them. The raw secret is shown only at creation
and never stored in the clear — only a one-way hash is kept, so a database leak cannot reveal a
usable key.

```
 person creates a token (authenticated)   POST /api/v1/access-tokens
        │  raw secret returned ONCE; only its hash is stored
        ▼
 ┌───────────────────────────────┐
 │   access-tokens   ◄── HERE     │  create · list · revoke
 └───────────────────────────────┘
        │  script sends the token as a bearer credential
        ▼
  server authenticates the API caller (the browser-session alternative)
```

**In this flow:** [identity](../../identity/main/README.md) *(the interactive browser-session path)*

Invariant: the raw token is never persisted and never echoed back by a read — the stored hash cannot
be reversed into a working key. Mounted at `/api/v1/access-tokens`.

## Public surface

- `accessTokensRouter` — the Express router for creating, listing, and revoking personal access tokens.
- `_AccessTokensOpenapiPaths` — the OpenAPI path fragment this domain contributes to the aggregated spec.

## Boundary

Consumed by the server's HTTP composition root, which mounts the router at `/api/v1/access-tokens`,
and by [api-spec](../../../api-spec/main/README.md), which aggregates its OpenAPI paths. It manages
token lifecycle only; verifying a presented token on the request path is the server's auth layer, not
this package.

## Dependency direction

Tagged `scope:access-tokens`: it may depend only on `scope:access-tokens` and `scope:shared` — never
on apps or other sibling domains.

## Data & persistence

Owns the `AccessToken` model in `apps/opencrane/prisma/schema/access-tokens.prisma`.

## See also

- Parent index: [iam](../../README.md)
- Siblings: [identity](../../identity/main/README.md) · [audit](../../audit/main/README.md) · [groups](../../groups/main/README.md)
