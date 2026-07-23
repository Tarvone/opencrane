# OpenCrane — Settings restructuring proposal

## What's in here
- App.dc.html      — the whole design (chat/session view + settings). Open directly in any browser.
- MessageList.jsx  — chat message rendering (loader, citations, capability carousel). Loaded by App.dc.html.
- support.js       — runtime that renders the .dc.html file. Don't edit.

Keep all three files in the same folder.

## How to edit
Open App.dc.html in a text editor.
- Markup lives between <x-dc> and </x-dc>. All styling is inline (style="…"); hover/press states use style-hover / style-active attributes.
- Data & behavior live in the <script data-dc-script> class at the bottom: session titles, onboarding messages, members, skills, agents, runs, etc. are plain JS arrays — edit the text there.
- Chat bubbles, the origami "Folding…" loader, citation cards, and the capability carousel are in MessageList.jsx.

## Design tokens
- Teal (primary/active): #0db5cc · hover #22c7dd · edge #0a94a7
- Orange (accents/sparks): #f47920
- Danger: #c1392b (borders #f9c7b4)
- Paper background: #f5f2ec · cards #fff · borders #dedad2
- Text: #1a1918 primary · #6a6660 secondary · #9a9690 muted
- Type: system sans; code/chips in 'DM Mono'
- Paper button recipe: box-shadow "0 1px 0 <edge>, 0 2px 3px rgba(...)"; hover = translateY(-1px) + hard-stop 135deg gradient; active = flatten.

## Demo state
The onboarding chat is on by default. Toggle it in the data-props JSON on the <script data-dc-script> tag ("onboarding": false) to see the Nova rebrand session.
