# Rigel Repository Guidance

## Purpose

Rigel converts photographs of physical mahjong tables into editable game-record drafts.
The AI output is never authoritative: unreadable tiles stay `null`, every boundary is
schema-validated, and a person reviews the draft before it becomes trusted data.

Use this file as the repository-wide Codex entry point. Read only the task-relevant
documents and code; do not load all of `docs/` by default.

## Sources Of Truth

- Product scope and decisions: `docs/mahjong-kifu-app-design.md`
- Development method: `docs/開発ガイド/`
- Shared runtime schemas and plan limits: `packages/schema/src/`
- Validation commands: `package.json`, `turbo.json`, and `.github/workflows/ci.yml`
- Dependency pins and their rationale: `docs/開発ガイド/07_依存固定台帳.md`

If documentation and executable code disagree, do not silently choose one. Report the
conflict and establish the intended behavior before changing production behavior.

## Repository Map

- `packages/schema`: shared Zod schemas and cross-layer policy constants
- `packages/ui`: framework-independent mahjong, board, editing, quiz, and scoring logic
- `packages/client`: shared API client and DTO boundary
- `apps/api`: Cloudflare Workers, Hono, Drizzle, and D1; layered domain/application/
  infrastructure/interfaces architecture
- `apps/web`: Next.js App Router; Vitest component tests and Playwright layout E2E
- `apps/mobile`: Expo/React Native; Jest and React Native Testing Library

Keep changes inside the owning module. Do not duplicate schema or policy definitions in
an app when they belong in a shared package.

## Hard Rules

1. Use test-first development for behavior changes: prove Red, implement the smallest
   Green, then refactor while green. Documentation/config-only changes are exempt.
2. Treat Zod schemas as the cross-layer contract. Parse AI output before downstream use.
3. Never infer an unreadable tile. Preserve its slot and order with `tile: null`.
4. Do not turn `[未確定]` items into implementation assumptions. Validate them first and
   update the decision document when they become `[決定]`.
5. Count Gemini calls only according to the shared plan policy and only after successful
   analysis. Inspect `packages/schema/src/plan.ts` instead of copying numeric limits.
6. Never persist captured source images **permanently**. Persist only validated game-record
   JSON. Amendment (decided 2026-08-01, owner): temporary R2 storage scoped to one analysis
   job is allowed — objects must be deleted at the job's terminal state (done/failed), with a
   1-day bucket lifecycle rule as backstop. Do not add other uses of the temp bucket.
   See docs/plans/async-analysis.md and CLAUDE.md rule 7.
7. Never expose email or other private identity data through public API responses or
   analytics. Do not use Google profile data to initialize public profiles. For problem
   answers and favorites, return only aggregates plus the viewer's own state — never who
   answered or who favorited. Favorites reference their target polymorphically, so no
   foreign key protects them: deleting a game/problem and closing an account must remove
   the rows explicitly (a missed cleanup makes account deletion fail on the users FK).
8. Do not read or print `.env`, `.dev.vars`, keys, certificates, or credentials. Use
   committed example files to discover variable names.
9. Ask before adding a dependency or external service. Read the dependency pin ledger
   before changing pinned versions.
10. Do not deploy, push, commit, delete files, or call a paid/external API without the
    user's explicit request. Do not overwrite unrelated or untracked user work.

## Workflow

1. Inspect the relevant design section, package manifest, tests, and implementation.
2. For substantial or ambiguous work, present a scoped plan with acceptance criteria and
   wait for approval. After the user approves a plan or directly requests its
   implementation, do not ask for the same approval again.
3. Implement one behavior at a time with Red-Green-Refactor.
4. Run the narrowest relevant check during iteration, then the appropriate completion
   gates.
5. Review the diff for behavioral regressions, trust-boundary violations, secrets, and
   unrelated changes.
6. Report changed behavior, commands actually run, failures or skipped checks, and any
   remaining `[未確定]` item. Never claim a check passed unless it was run.

## Commands

From the repository root:

```text
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Focused checks:

```text
pnpm --filter @rigel/schema test
pnpm --filter @rigel/ui test
pnpm --filter api test
pnpm --filter web test
pnpm --filter mobile test
pnpm --filter web test:e2e
```

The full completion gate is typecheck, lint, format check, tests, and build. Run the AI
eval only when explicitly needed; it uses real fixtures and may require external
credentials. Mobile device/EAS checks and Cloudflare deployment checks are separate from
the normal local gate.

## Task Workflows

Repository skills provide the detailed procedures:

- `$rigel-plan`: scope and approve a non-trivial implementation plan
- `$rigel-tdd`: implement one behavior with a verified Red-Green-Refactor cycle
- `$rigel-gate`: run and report validation gates
- `$rigel-trust-check`: audit AI, billing, and privacy trust boundaries

## Code Review Rules

Prioritize correctness and regressions over style. Flag missing tests for changed
behavior, raw AI responses used without parsing, inferred replacements for `null` tiles,
billing changes that bypass shared plan constants, image persistence, PII exposure,
authorization gaps, and implementation of unresolved decisions. Give file and line
references and state residual test risk even when no defect is found.
