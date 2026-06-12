import { createHash, randomBytes } from "crypto";
import { Router } from "express";
import type { PrismaClient } from "@prisma/client";
import type * as k8s from "@kubernetes/client-node";

import type { OidcAuthService } from "./oidc.service.js";
import { _AuthorizeDeviceGrant, _CreateDeviceGrant, _FindGrantByUserCode, _PollDeviceGrant } from "./device-grant.js";
import { _MintPodToken } from "./pod-token.js";

/**
 * Audience bound to the token minted here for the **browser/BFF → OpenClaw pod**
 * session — the tenant pod's own inbound session audience.
 *
 * Override via `POD_TOKEN_AUDIENCE`. The exact string the OpenClaw session
 * expects is platform-defined; @see `docs/auth.md` (open question on the pod
 * session API).
 */
const _POD_TOKEN_AUDIENCE = process.env.POD_TOKEN_AUDIENCE ?? "openclaw";

/** Tenant-pod access token lifetime in seconds (override via POD_TOKEN_TTL_SECONDS). */
const _POD_TOKEN_TTL_SECONDS = Number(process.env.POD_TOKEN_TTL_SECONDS ?? "600");

/** Namespace tenant ServiceAccounts live in (matches the AI-budget convention). */
const _TENANT_NAMESPACE = process.env.NAMESPACE ?? "default";

/**
 * Build the auth router covering:
 *  - Session introspection (GET /me)
 *  - OIDC browser flow (GET /login, GET /callback, POST /logout)
 *  - Device authorization grant for CLI (POST /device, GET /device/activate, GET /device/token)
 *
 * All routes in this router are mounted before `___AuthMiddleware` and are
 * therefore public — authentication is enforced per-handler where required.
 *
 * @param authService - OIDC auth service instance.
 * @param prisma      - Prisma client used to persist device-issued access tokens.
 * @param coreApi     - Kubernetes Core V1 API client, used to mint tenant-pod tokens.
 */
export function ___AuthRouter(authService: OidcAuthService, prisma: PrismaClient, coreApi: k8s.CoreV1Api): Router
{
  const router = Router();

  // --------------------------------------------------------------------------
  // Session introspection
  // --------------------------------------------------------------------------

  /** Report the current auth mode and authenticated user session, if any. */
  router.get("/me", function _me(req, res)
  {
    res.json(authService.getStatus(req));
  });

  // --------------------------------------------------------------------------
  // Tenant-pod token exchange (single sign-on across control plane + pod)
  // --------------------------------------------------------------------------

  /**
   * Exchange the caller's OIDC session for a short-lived, audience-bound token
   * to **their own** OpenClaw pod session — so the user logs in once and the pod
   * token is derived, never a second login (see `docs/auth.md`).
   *
   * The token is minted via the Kubernetes TokenRequest API against the tenant's
   * pod ServiceAccount (`openclaw-<tenant>`), bound to the OpenClaw session
   * audience (see `_POD_TOKEN_AUDIENCE`) and a ~600s TTL. It lets the browser/BFF
   * reach the tenant pod at `ingressHost`; the pod validates it via TokenReview.
   * It is **not** an `obot-gateway` token — Obot is called only from inside the
   * pod, never from the browser. Clients re-call this before the TTL expires;
   * only when the OIDC session itself expires is a fresh login required.
   *
   * **Cross-tenant safety:** the target tenant is resolved solely from the
   * session's IdP-verified email — there is no request-supplied tenant input —
   * and an email matching more than one tenant fails closed. A caller therefore
   * cannot mint a token for another user's pod.
   *
   * **This route is mounted before `___AuthMiddleware`** (the whole auth router
   * is public), so it enforces the session check inline.
   */
  router.post("/pod-token", async function _podToken(req, res, next)
  {
    try
    {
      // 1. Require an established OIDC browser session.
      const authUser = req.session?.authUser;
      if (!authUser)
      {
        res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
        return;
      }

      // 2. Resolve the caller's tenant by their verified email (one pod per user).
      const email = typeof authUser.email === "string" ? authUser.email.toLowerCase() : "";
      if (!email)
      {
        res.status(403).json({ error: "Session has no email claim; cannot resolve a tenant", code: "FORBIDDEN" });
        return;
      }

      const matches = await prisma.tenant.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { name: true, ingressHost: true },
      });

      if (matches.length === 0)
      {
        res.status(403).json({ error: "No OpenClaw is provisioned for this account", code: "NO_TENANT" });
        return;
      }

      // Fail closed: an ambiguous email→tenant mapping must never silently pick
      // one pod, which could hand the caller a token for the wrong tenant.
      if (matches.length > 1)
      {
        res.status(409).json({ error: "Multiple OpenClaw pods match this account; contact your administrator", code: "AMBIGUOUS_TENANT" });
        return;
      }

      const tenant = matches[0];

      if (!tenant.ingressHost)
      {
        res.status(409).json({ error: "OpenClaw pod has no ingress host yet", code: "POD_NOT_READY" });
        return;
      }

      // 3. Mint a pod-scoped token bound to the gateway audience.
      const minted = await _MintPodToken(coreApi, {
        namespace: _TENANT_NAMESPACE,
        serviceAccountName: `openclaw-${tenant.name}`,
        audience: _POD_TOKEN_AUDIENCE,
        expirationSeconds: _POD_TOKEN_TTL_SECONDS,
      });

      // 4. Return the token, its expiry, and where to reach the pod.
      res.status(200).json({
        token: minted.token,
        expiresAt: minted.expiresAt,
        tenant: tenant.name,
        ingressHost: tenant.ingressHost,
        audience: _POD_TOKEN_AUDIENCE,
      });
    }
    catch (err)
    {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // OIDC browser flow
  // --------------------------------------------------------------------------

  /** Start the browser-based OIDC login flow. */
  router.get("/login", async function _login(req, res, next)
  {
    try
    {
      if (!authService.isEnabled())
      {
        res.status(503).json({ error: "OIDC is not configured for this control-plane instance" });
        return;
      }

      const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";

      // 1. Discover the provider and store the PKCE replay-protection values.
      const loginUrl = await authService.buildLoginUrl(req, returnTo);

      // 2. Redirect the browser to the external identity provider.
      res.redirect(302, loginUrl);
    }
    catch (err)
    {
      next(err);
    }
  });

  /** Complete the OIDC callback and redirect back into the SPA. */
  router.get("/callback", async function _callback(req, res, next)
  {
    try
    {
      if (!authService.isEnabled())
      {
        res.status(503).json({ error: "OIDC is not configured for this control-plane instance" });
        return;
      }

      // 1. Validate the authorization response and establish the local session.
      const returnTo = await authService.completeLogin(req);

      // 2. Redirect the user back into the control-plane UI.
      res.redirect(302, returnTo);
    }
    catch (err)
    {
      next(err);
    }
  });

  /** Destroy the local session without requiring a provider-specific logout endpoint. */
  router.post("/logout", async function _logout(req, res, next)
  {
    try
    {
      await authService.logout(req);
      res.status(204).send();
    }
    catch (err)
    {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // Device authorization grant (CLI login — RFC 8628-style)
  // --------------------------------------------------------------------------

  /**
   * Step 1 — CLI initiates: create a device grant and return the codes.
   *
   * The CLI uses the returned deviceCode for polling and opens verificationUri
   * in the operator's browser so they can authenticate and approve the grant.
   */
  router.post("/device", function _deviceRequest(req, res)
  {
    // 1. Allocate a new pending grant with a 5-minute TTL.
    const grant = _CreateDeviceGrant();

    // 2. Build the browser URL the CLI will print for the user to open.
    const verificationUri = `/api/v1/auth/device/activate?userCode=${encodeURIComponent(grant.userCode)}`;

    // 3. Return codes and metadata so the CLI can start polling.
    res.status(200).json({
      deviceCode: grant.deviceCode,
      userCode: grant.userCode,
      verificationUri,
      expiresIn: 300,
      interval: 5,
    });
  });

  /**
   * Step 2 — Browser activates: the user opens this URL in a browser after OIDC login.
   *
   * If the user has no OIDC session yet, this endpoint redirects to the login flow
   * with a `returnTo` pointing back here — `_sanitizeReturnTo` in the OIDC service
   * allows relative paths, so the redirect-back survives the callback intact.
   */
  router.get("/device/activate", async function _deviceActivate(req, res, next)
  {
    try
    {
      const userCode = typeof req.query.userCode === "string" ? req.query.userCode.trim() : "";

      // 1. Redirect to OIDC login when the operator has no active session.
      if (!req.session?.authUser)
      {
        if (!authService.isEnabled())
        {
          res.status(503).json({ error: "OIDC is not configured — cannot activate device grant" });
          return;
        }

        const returnTo = `/api/v1/auth/device/activate?userCode=${encodeURIComponent(userCode)}`;
        const loginUrl = await authService.buildLoginUrl(req, returnTo);
        res.redirect(302, loginUrl);
        return;
      }

      // 2. Look up the grant; reject unknown or expired user codes immediately.
      const grant = _FindGrantByUserCode(userCode);
      if (!grant)
      {
        res.status(404).json({ error: "Device code not found or expired. Run `oc auth login` again." });
        return;
      }

      // 3. Create a named access token in the database on behalf of the authenticated user.
      const plainText = `ocp_${randomBytes(24).toString("hex")}`;
      const tokenHash = createHash("sha256").update(plainText).digest("hex");
      const owner = (req.session.authUser as { sub?: string; email?: string }).sub
        ?? (req.session.authUser as { sub?: string; email?: string }).email
        ?? "unknown";

      await prisma.accessToken.create({
        data: {
          name: `cli-device-${grant.userCode}`,
          owner,
          tokenHash,
          expiresAt: null,
        },
      });

      // 4. Mark the in-memory grant as authorized so the polling CLI can collect the token.
      _AuthorizeDeviceGrant(grant.deviceCode, plainText);

      // 5. Return a plain success page — the CLI picks up the token via polling.
      res.status(200).send(
        "<!DOCTYPE html><html><body><h1>Login successful</h1>"
        + "<p>You may close this tab. The CLI has been authenticated.</p>"
        + "</body></html>",
      );
    }
    catch (err)
    {
      next(err);
    }
  });

  /**
   * Step 3 — CLI polls: returns the token once the operator has activated in the browser.
   *
   * Returns one of three states:
   *   - pending   → the operator has not yet opened the activation URL
   *   - authorized → token is present; the CLI stores it and stops polling
   *   - expired   → the grant timed out; the CLI must restart the login flow
   *
   * The token is delivered exactly once: after "authorized" is returned the
   * grant is deleted from the store.
   */
  router.get("/device/token", function _deviceToken(req, res)
  {
    const deviceCode = typeof req.query.deviceCode === "string" ? req.query.deviceCode.trim() : "";

    const result = _PollDeviceGrant(deviceCode);

    if (result.status === "authorized")
    {
      res.status(200).json({ status: "authorized", token: result.accessToken });
      return;
    }

    if (result.status === "expired")
    {
      res.status(410).json({ status: "expired", error: "Grant expired. Run `oc auth login` again." });
      return;
    }

    res.status(202).json({ status: "pending" });
  });

  return router;
}
