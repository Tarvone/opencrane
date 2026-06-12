# Authentication

How identities authenticate to OpenCrane and how a single human login grants
access to **both** the control-plane API and the user's own OpenClaw pod.

> **Status legend:** ✅ implemented · 🔶 planned/target. The OIDC control-plane
> session is implemented today; the browser-facing tenant token exchange
> (§ Tenant pod access) is the target design and is not yet exposed by the
> control-plane API.

## Two planes, one identity

OpenCrane has two backends a user touches, and they must not require two logins:

| Plane | What it serves | How it is reached |
|-------|----------------|-------------------|
| **Control plane** | management + metadata: tenants, policies, groups, budgets, skills, audit, auth | the versioned control-plane API |
| **Tenant pod (OpenClaw)** | the live agent session: chat, Cognee retrieval, canvas | the tenant's own `ingressHost`, via the Obot MCP Gateway |

The principle is **one identity, two audiences**: the human signs in once via
OIDC; the token used to reach their pod is *derived* from that session through
**RFC 8693 (OAuth 2.0 Token Exchange)** — never a second interactive login.

## End-to-end flow (single sign-on)

```
1. Browser → /auth/login (OIDC) → IdP → /auth/callback → session cookie     ← the ONLY login
2. Browser/BFF → control-plane token endpoint: "token for my OpenClaw"
3. Control plane: validates session, checks this user owns/may access the pod,
   TokenRequest → short-lived token, aud = openclaw (the tenant pod session), ~600s
4. Connect to the pod at tenant.ingressHost with that token
5. Before TTL expires → silently re-exchange (session still valid). Re-login only
   when the OIDC session itself expires.
```

The browser/BFF token targets the **OpenClaw pod's session audience**, not
`obot-gateway`. **Obot is never reached from the browser** — the pod (OpenClaw)
calls the Obot MCP Gateway server-side using its *own* kubelet-projected
`aud=obot-gateway` ServiceAccount token (see the token table below).

Step 1 and the `/auth/*` session are ✅ implemented. Steps 2–5 (the user-facing
pod token exchange) are 🔶 the target design — see the status note above.

### Why this shape

- **One login.** Users never authenticate twice for one identity; the pod token
  is issued from the established session, invisibly.
- **Data sovereignty.** The pod token is audience-bound to a single tenant's
  gateway and short-lived, so a leaked token grants little and expires fast.
- **No long-lived secrets in the browser.** The browser holds only its
  HTTP-only session cookie (see "Where the exchange runs").

## Token types (keep them distinct)

| Token | Subject | Audience | TTL / storage | Status |
|-------|---------|----------|---------------|--------|
| **Control-plane session cookie** | the human | control plane | server-signed, HTTP-only cookie (~12h) | ✅ |
| **User-delegated pod token** | the human (delegated) | `openclaw` — the tenant pod session (one pod) | ~600s, not persisted client-side beyond the live connection | 🔶 |
| **Projected SA token** | a Kubernetes service account | `obot-gateway` / `skill-registry` / `control-plane` | ~600s, kubelet-rotated, in-cluster only | ✅ |

The **projected SA token** is *workload* identity and must **never be handed to a
browser**. It is how the pod calls *outward* — e.g. OpenClaw → Obot MCP Gateway
with its `aud=obot-gateway` token. The **user-delegated pod token** carries the
human's identity and is what a browser/BFF uses to call *inward* to the pod's
OpenClaw session (`aud=openclaw`), which the pod validates via TokenReview. The
browser never holds an `obot-gateway` token and never talks to Obot directly.

## Control-plane session (OIDC)

OpenCrane uses a backend-for-frontend session model for human access to the
control plane.

- The browser is redirected to an OpenID Connect provider.
- The control-plane backend completes the Authorization Code flow with PKCE.
- The backend stores the authenticated user in a secure HTTP-only session cookie.
- Clients read login state from `/api/auth/me` and never keep an OAuth bearer
  token in browser storage.

This works with Google Identity and with self-hosted providers such as Keycloak,
Dex, Authentik, or Zitadel.

### Required environment variables

Set these on the control-plane deployment when enabling OIDC.

| Variable | Required | Purpose |
|----------|----------|---------|
| `OIDC_ISSUER_URL` | Yes | Issuer URL used for OIDC discovery |
| `OIDC_CLIENT_ID` | Yes | Client identifier registered with the IdP |
| `OIDC_CLIENT_SECRET` | Optional | Client secret for confidential clients |
| `OIDC_REDIRECT_URI` | Yes | Must point to `/api/auth/callback` on the control-plane |
| `OIDC_SESSION_SECRET` | Yes | Secret used to sign the control-plane session cookie |
| `OIDC_SCOPES` | No | Defaults to `openid email profile` |
| `OIDC_COOKIE_NAME` | No | Defaults to `opencrane_oidc` |
| `OIDC_COOKIE_SECURE` | No | Defaults to `true` when redirect URI is HTTPS |
| `OIDC_SESSION_MAX_AGE_SECONDS` | No | Defaults to 43200 (12 hours) |
| `OIDC_ALLOWED_EMAIL_DOMAINS` | No | Comma-separated allowlist of email domains |
| `OIDC_ALLOWED_EMAILS` | No | Comma-separated allowlist of exact email addresses |

### Google Identity example

1. Create a Web application OAuth client in Google Cloud.
2. Add the control-plane callback URL as an authorized redirect URI.
3. Set the control-plane environment variables.

```env
OIDC_ISSUER_URL=https://accounts.google.com
OIDC_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
OIDC_CLIENT_SECRET=replace-me
OIDC_REDIRECT_URI=https://control-plane.example.com/api/auth/callback
OIDC_SESSION_SECRET=replace-with-a-long-random-secret
OIDC_ALLOWED_EMAIL_DOMAINS=example.com
```

### Local or non-cloud example

Use any OIDC-capable IdP that exposes a discovery document. Example with Keycloak:

```env
OIDC_ISSUER_URL=https://keycloak.local/realms/opencrane
OIDC_CLIENT_ID=opencrane-control-plane
OIDC_CLIENT_SECRET=replace-me
OIDC_REDIRECT_URI=http://localhost:8080/api/auth/callback
OIDC_SESSION_SECRET=replace-with-a-long-random-secret
OIDC_COOKIE_SECURE=false
OIDC_ALLOWED_EMAIL_DOMAINS=local.test
```

The same model works with Dex or Authentik as long as the issuer supports
standard OpenID Connect discovery.

### CLI and automation

- **CLI** uses the OIDC device authorization grant (`POST /auth/device` →
  `/auth/device/activate` in a browser → poll `/auth/device/token`).
- **Automation / CI** uses a static bearer token (`Authorization: Bearer …`).
  Treat this as a migration target; prefer OIDC/IAM where possible.

## Tenant pod access (token exchange)

To reach a user's OpenClaw, a caller needs a token the **pod's own session API**
accepts (audience `openclaw`, configurable via `POD_TOKEN_AUDIENCE`) — **not** an
`obot-gateway` token. Obot is reached only from inside the pod (OpenClaw → Obot,
server-side). The **control plane is the broker**: it authenticates the human and
knows the user↔tenant mapping (`Tenant.email`), so it mints the token.

Implemented as **`POST /api/v1/auth/pod-token`** ✅ (the pod-side audience and
session API contract are the remaining 🔶 platform decision):

1. Resolve the caller's tenant **from the session's verified email only** — there
   is no request-supplied tenant input — matched case-insensitively to
   `Tenant.email`; more than one match fails closed (`409 AMBIGUOUS_TENANT`).
2. Mint via the Kubernetes TokenRequest API against `openclaw-<tenant>`, audience
   = `POD_TOKEN_AUDIENCE`, `expirationSeconds` = `POD_TOKEN_TTL_SECONDS` (~600s).
   Returns `{ token, expiresAt, tenant, ingressHost, audience }`.
3. Connect to `https://{ingressHost}/…` with that token; the pod validates it via
   TokenReview (audience + that the token's subject SA is its own).
4. Re-call before the ~600s TTL; the connection survives rotation. Re-login only
   when the OIDC session expires.

Because the tenant is derived solely from the session, **a caller cannot obtain a
token for another user's pod.**

### Where the exchange runs

- **BFF (recommended).** A backend-for-frontend holds the session, performs the
  exchange server-side, and proxies the pod stream. The browser holds only its
  session cookie; the pod token never reaches the client.
- **Token-to-client.** The control plane returns the short-lived pod token to the
  browser, which connects directly and refreshes it. Simpler, but an
  audience-bound token now lives in the client.

### Status

The control-plane endpoint (`POST /api/v1/auth/pod-token`) is implemented ✅ and
requires `create` on `serviceaccounts/token` for the control-plane SA (see
`platform/helm/templates/control-plane-rbac.yaml`). Still 🔶: the OpenClaw pod's
inbound **session API** (transport + the exact audience it validates) — set
`POD_TOKEN_AUDIENCE` to match once that lands.

## Authorization (who can do what)

Authentication establishes *who*; authorization is split across the two planes:

- **Control plane** — management routes are operator-facing. `/auth/me` carries
  identity (`sub`, `email`, `name`) but **no role claim today**; a roles/
  capabilities claim is a 🔶 target so gating can be explicit.
- **Data plane** — what a pod may retrieve/act on is governed by `AccessPolicy`,
  `Group` awareness grants, and tenant dataset memberships, compiled per tenant
  into the **effective contract** (`GET /tenants/{name}/effective-contract`).

## Kubernetes and IAM split

- Human identity is handled by the OIDC provider and the control-plane session.
- Kubernetes RBAC remains machine-facing and is bound to Kubernetes service
  accounts.
- Cloud IAM or local secret systems are bound to workloads through the
  Kubernetes service account identity, not through human bearer tokens.

## Review notes

- The static bearer-token path can remain as a temporary break-glass fallback for
  API-only usage; prefer OIDC/IAM for production.
- For production, prefer a confidential client with `OIDC_CLIENT_SECRET` set.
- Behind an ingress or reverse proxy, preserve forwarded headers so callback and
  secure-cookie handling use the external URL correctly.
- Never expose kubelet-projected SA tokens to browsers; the user-delegated pod
  token (token exchange) is the only browser-reachable path to a pod.
