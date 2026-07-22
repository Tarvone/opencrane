# @opencrane/state/conversation/cache — IndexedDB conversation cache

> [frontend](../../../README.md) › [state](../../README.md) › conversation › cache

## What it owns

Part of the OpenCrane **frontend state layer** (the code between the browser UI and the backend). This
package is the browser-side implementation of the **`ConversationCache`** port defined in
[`state/core`](../../core/README.md) — a port is just a TypeScript interface, and this is the class
that fulfils it using **IndexedDB** (the browser's built-in on-disk key-value database). Its whole job
is to let a chat thread paint instantly from its last-seen state when you reopen it, before the live
conversation gateway reconnects to the pod and re-fetches the real transcript.

It keeps two IndexedDB object stores in a database named `weownai`: one holding each thread's most
recent message window (keyed by thread id), and one holding each tenant's sidebar session list
(keyed by tenant). The live gateway writes snapshots here and treats them as a **hint** on reopen —
cached messages show only until a fresh `chat.history` fetch supersedes them.

Invariant: every operation is **best-effort**. If IndexedDB is missing or throws (server-side
rendering, a locked-down or private-mode browser), each method degrades to a no-op rather than
throwing — the cache is an optimisation, never a source of truth, so a cache failure can only cost a
brief blank frame, never data.

## Public surface

- `IndexedDbConversationCache` — the web `ConversationCache` implementation (`load`/`save`,
  `loadSessions`/`saveSessions`, `clear`). Bound to `CONVERSATION_CACHE` by the app config.

## Boundary

Consumed by `apps/opencrane-ui` (which binds it to the `CONVERSATION_CACHE` token) and read/written
by the conversation gateway through that port. It implements the port only; it defines no contract and
speaks no network protocol.

## Dependency direction

Tagged `scope:web` (`type:state`): it may depend only on other `scope:web` and `scope:shared`
packages — here `state/core`, `@opencrane/core`, and Angular — never on apps or server domains.

## See also

- Parent index: [state](../../README.md)
- Siblings: [conversation/adapter](../adapter/README.md) · [conversation/render](../render/README.md)
