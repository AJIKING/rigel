---
name: rigel-gate
description: Run and report Rigel validation gates, including typecheck, lint, formatting, tests, and build. Use when the user asks to verify a change, run the gate, check readiness, or confirm that implementation is complete.
---

# Run The Rigel Gate

1. Read `AGENTS.md`, `docs/開発ガイド/04_検証とCIゲート.md`, root `package.json`,
   and `.github/workflows/ci.yml`.
2. For a completion gate, run these root commands without altering their configuration:

   ```text
   pnpm typecheck
   pnpm lint
   pnpm format:check
   pnpm test
   pnpm build
   ```

3. Run additional focused checks when the changed area requires them:
   - schema: `pnpm --filter @rigel/schema test`
   - API: `pnpm --filter api test`
   - web layout or browser behavior: `pnpm --filter web test:e2e`
   - mobile device behavior: report the required manual/EAS validation separately
4. Do not run `pnpm --filter api eval` unless the user requests AI accuracy evaluation
   and the credentialed external call is approved.
5. If a command fails, preserve the evidence, diagnose the responsible files, and treat
   the gate as failed. Do not skip, disable, or relax a check to report success.
6. Report each command as PASS, FAIL, or SKIPPED with the reason. Include relevant test
   counts when available, trust-gate coverage for affected boundaries, and the next
   concrete action for every failure.

Completion means every applicable gate actually passed.
