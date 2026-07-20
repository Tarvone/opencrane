# @opencrane/features/conversation — the centre conversation pane

> [frontend](../../README.md) › [features](../README.md) › conversation

## What it owns

This is a frontend **feature** package: it owns one UI slice — the centre pane of the workspace
console — and exports the component the shell drops into that slot. That pane is the conversation
itself: a thread header (department, model, files, share, plus a sync and scope rail), the scrolling
message stream, and the composer where the user types.

It reads the current thread and its messages from the conversation **store** (a client-side state
holder: a singleton service that keeps the browser app's copy of the conversation and exposes it as signals)
and renders them. Agent messages can carry text, an observation/policy/action ledger, a decision, or
an image; markdown prose is turned into safe HTML through the shared render pipeline.

## Public surface

- `ConversationViewComponent` — the pane: header, message stream, composer. Its `messages`,
  `typing`, and `shareOpen` signals reset when the user switches thread.
- `FilePanelComponent` — the attached-files side panel.
- `FilePreviewService` — resolves a preview for an attached file.

## Boundary

Consumed by `features/workspace`, which hosts it as the centre pane. It must not import other
feature packages; shared visuals come from `elements/ui`. It renders conversation state and raises
composer events — it does not own the transport that streams messages to and from the agent.

## Dependency direction

Tagged `scope:web` (the frontend dependency tier): it may import only other `scope:web` packages
and `scope:shared` contracts. It depends on `@opencrane/core` (thread and scope models),
`@opencrane/state/core` (the conversation store), `@opencrane/state/conversation/render` (safe
markdown rendering), and `@opencrane/elements/ui` (ledger card).

## See also

- Parent index: [features](../README.md)
- Consumer: [features/workspace](../workspace/README.md)
- Render pipeline: [state/conversation/render](../../state/conversation/render/README.md)
