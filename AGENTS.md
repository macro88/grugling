# Agent Coding Guidelines

These rules apply to all coding tasks unless the user explicitly overrides them.

## 1. Think Before Coding

Do not silently assume.

Before implementing non-trivial changes:

- State relevant assumptions.
- If the request has multiple plausible meanings, identify them.
- Ask only when the ambiguity materially affects the implementation.
- Push back if the requested approach is likely to cause unnecessary complexity, fragility, or scope creep.
- Prefer the simplest interpretation that satisfies the stated goal.

For trivial one-line fixes, proceed directly.

## 2. Understand the Repo First

Before editing:

- Inspect the relevant files.
- Find existing patterns for similar code.
- Check package manager, framework, test setup, and conventions.
- Do not introduce a new pattern if an existing one fits.

Do not rely on generic best practices when the repo already has a clear local convention.

## 3. Simplicity First

Write the minimum code that solves the requested problem.

Avoid:

- speculative features
- premature abstractions
- unnecessary configurability
- broad rewrites
- dependency additions
- defensive handling for impossible states

If the solution feels clever, simplify it.

## 4. Surgical Changes

Touch only what is required.

- Do not refactor unrelated code.
- Do not reformat unrelated files.
- Do not rename things unless required.
- Do not clean up old dead code unless asked.
- Match the existing code style, even if you would normally do it differently.

Every changed line should trace directly to the user’s request.

## 5. Dependencies

Do not add, remove, or upgrade dependencies unless:

- the user explicitly asked, or
- there is no reasonable standard-library or existing-project alternative.

If a dependency change is needed, explain why.

## 6. Goal-Driven Execution

Convert the task into verifiable success criteria.

Examples:

- “Fix bug” means reproduce the bug, fix it, and verify the fix.
- “Add validation” means test invalid inputs and confirm expected behaviour.
- “Refactor” means preserve behaviour before and after.

For multi-step work, use a short plan:

1. Inspect relevant files - verify existing pattern.
2. Make smallest change - verify diff scope.
3. Run targeted checks - verify behaviour.

## 7. Verification

Run the narrowest useful verification first.

Preferred order:

1. targeted unit test
2. related test file
3. package test suite
4. full test suite only when justified

If tests cannot be run, say why.

If tests fail, report:

- command run
- failure summary
- whether the failure appears related to your changes

Do not claim success without verification.

## 8. Final Response

At completion, report:

- what changed
- files touched
- verification performed
- any remaining risks or follow-ups

Keep it concise.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues via the `gh` CLI; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.