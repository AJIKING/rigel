---
name: rigel-trust-check
description: Audit Rigel changes at AI-output, billing, privacy, authorization, and unresolved-decision boundaries. Use for analysis pipelines, Gemini integration, game-record parsing, plan or quota changes, profile data, image handling, public/private visibility, or an explicit trust review.
---

# Audit Rigel Trust Boundaries

Read `AGENTS.md`, `docs/開発ガイド/04_検証とCIゲート.md`, the applicable product
decision, `packages/schema/src/`, and the target implementation and tests.

Evaluate each applicable item as `充足`, `不足`, or `該当なし`:

- AI responses are parsed with the applicable Zod schema before use.
- Unreadable tiles remain `tile: null`; slots, counts, and order are preserved.
- The UI exposes null tiles for human correction and treats the full AI result as a draft.
- Mixed Gemini parts are classified before extracting the final JSON.
- Gemini usage is recorded only after success and by actual call count.
- Plan and storage limits come from `packages/schema/src/plan.ts`.
- Captured images are not persisted.
- Email and other PII are excluded from public responses and analytics.
- Public/private ownership and authorization rules are enforced.
- No `[未確定]` item has been implemented as an assumed decision.
- Tests enforce each changed trust property rather than relying on comments.

Lead with concrete findings ordered by severity and include file and line references.
For every gap, propose the smallest test that would expose it and the intended safe
behavior. State residual risk and checks not run.

Treat this as read-only review unless the user also asks for fixes. Do not read secret
files or invoke real external services during the audit.
