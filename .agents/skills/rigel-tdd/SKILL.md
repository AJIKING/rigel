---
name: rigel-tdd
description: Implement one Rigel behavior with an observed Red-Green-Refactor cycle and focused verification. Use for production behavior changes, bug fixes, schema changes, and regression fixes where tests can express the expected result.
---

# Implement One Behavior With TDD

1. Read `AGENTS.md`, `docs/開発ガイド/02_TDD開発ガイド.md`, the owning module, and
   nearby tests. Read the shared schema before changing a cross-layer contract.
2. Limit the cycle to one observable behavior.
3. Red:
   - add the smallest test that states the behavior;
   - prefer the repository's existing test framework and style;
   - use Japanese behavior names and table-driven cases where they improve clarity;
   - run the focused test and confirm it fails for the intended reason.
4. Green:
   - implement the smallest production change that makes the test pass;
   - rerun the focused test and confirm it passes.
5. Refactor:
   - improve names or structure without changing behavior;
   - keep the focused test green.
6. When relevant, cover trust boundaries: invalid Zod input, preserved `tile: null`
   slots and order, mixed AI response parts, successful-call-only billing, authorization,
   PII exclusion, and image non-persistence.
7. Run affected-package typecheck, lint, and tests. Run the full `$rigel-gate` workflow
   when the change is ready for completion or crosses package boundaries.
8. Report the observed Red failure, Green success, final checks, files affected, and
   remaining uncertainties.

Do not weaken a test or configuration merely to make the cycle green. If an
`[未確定]` decision blocks the expected value, stop and surface the decision instead of
encoding a guess.
