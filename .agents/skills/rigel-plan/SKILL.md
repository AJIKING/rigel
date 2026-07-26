---
name: rigel-plan
description: Create a scoped, approval-ready implementation plan for a non-trivial Rigel feature or change. Use when the user asks for planning, when requirements span modules, or when a change touches unresolved product decisions, AI output, billing, privacy, or architecture.
---

# Plan A Rigel Change

1. Read `AGENTS.md`, the relevant section of `docs/mahjong-kifu-app-design.md`,
   `docs/開発ガイド/03_タスク分解とPlan運用.md`, and the owning code and tests.
   Read `packages/schema/src/` when the change touches a shared contract.
2. Separate applicable `[決定]` items from `[未確定]` items. Put an explicit validation
   task before any implementation that depends on an unresolved item.
3. Define:
   - goal and user-visible behavior;
   - in-scope and out-of-scope work;
   - affected packages, APIs, schemas, storage, and UI;
   - trust concerns: AI parsing and null slots, billing, privacy, authorization;
   - acceptance criteria that can become the first failing tests;
   - verification commands and any manual/device/eval checks.
4. Break work into independently verifiable behaviors. Prefer shared schema and
   transformations before API, UI, persistence, and billing consumers.
5. Use `docs/templates/Plan.md` when the plan will be saved under `docs/plans/`.
   Otherwise present a concise plan in the response.
6. Request human approval before editing production code. Do not create implementation
   or test changes during a planning-only request.

Keep uncertainties explicit. Do not invent product decisions or dependency choices to
make the plan appear complete.
