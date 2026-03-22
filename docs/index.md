---
layout: home

hero:
  name: codex-app-server-client
  text: A typed TypeScript guide for codex app-server
  tagline: Build against the app-server protocol with a layered client, typed events, and approval helpers.
  actions:
    - theme: brand
      text: Read the Guide
      link: /guide/
    - theme: alt
      text: Browse the API Surface
      link: /reference/
    - theme: alt
      text: View on GitHub
      link: https://github.com/BrandonMJohnson/codex-client

features:
  - title: Layered by design
    details: Keep transport, RPC, protocol bindings, and ergonomic client helpers separate so low-level protocol access stays available.
  - title: Typed streaming flows
    details: Subscribe to typed turn and item notifications or use the higher-level helpers that collect runs through `turn/completed`.
  - title: Approval-ready
    details: Handle app-server approval and request callbacks with typed request handlers instead of stringly-typed JSON plumbing.
---

`codex-app-server-client` is a focused library, so the docs site stays focused too: one practical guide, one concise API-surface reference, and links back to the source of truth for the protocol.

The guide is modeled after framework-style documentation rather than a README wall of text. Start with the guide if you want to connect to a live `codex app-server`, run turns, stream events, and respond to approvals end to end.
