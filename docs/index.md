---
layout: home

hero:
  name: codex-app-server-client
  text: A typed TypeScript client for codex app-server
  tagline: Start threads, run turns, stream events, and handle approvals with a layered API built for the app-server protocol.
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

`codex-app-server-client` gives TypeScript applications a structured way to talk to `codex app-server` without hand-rolling transport, RPC lifecycle, streamed turn handling, or approval callbacks.

Start with the guide for an end-to-end setup, then use the reference pages when you need method-level details for the exported client surface.
