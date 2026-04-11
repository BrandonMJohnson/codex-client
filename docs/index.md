---
layout: home

hero:
  name: codex-app-server-client
  text: A typed TypeScript client for codex app-server
  tagline: Start threads, run turns, stream events, and approve side-effecting app and MCP tool calls with a layered API built for the app-server protocol.
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
    details: Handle app-server approval and request callbacks, including mutating app and MCP tool approvals, with typed request handlers instead of stringly-typed JSON plumbing.
---

`codex-app-server-client` gives TypeScript applications a structured way to talk to `codex app-server` without hand-rolling transport, RPC lifecycle, streamed turn handling, or approval callbacks.

When a side-effecting app or MCP tool call needs confirmation, app-server can pause on either `item/tool/requestUserInput` or `mcpServer/elicitation/request`. The client now exposes a single normalized approval path through `handleApprovalRequests()` so mutating flows such as Linear updates can proceed without dropping to raw JSON-RPC handling.

Start with the guide for an end-to-end setup, then use the reference pages when you need method-level details for the exported client surface.
