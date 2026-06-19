---
name: peer-review
description: Review the current change set with the *opposite* CLI tool — if you (Claude) wrote the code, Codex reviews it; if you (Codex) wrote it, Claude reviews it. Runs the repo's existing /review skill on the peer tool, then triages every finding. Use when the user wants a peer or cross-tool review of a diff, branch, or PR, or when /implement hands off for review.
---

Whoever wrote the code should not be the one to bless it. **You** — Claude or Codex — just implemented this change set, so the review goes to your **peer**: the other CLI tool. A model is blind to its own blind spots; a different model on a fresh context catches what self-review misses.

The review itself is the repo's existing `/review` skill (`.agents/skills/review/SKILL.md`) — the two-axis Standards + Spec review. This skill does not redefine it; it runs that skill **on the peer tool**, read-only, then **triages** what comes back.

## Process

### 1. Pick your peer

You are the agent running this skill — **Claude** or **Codex**. Your peer reviewer is the other one:

| You are | Peer (reviewer) | Command |
| --- | --- | --- |
| Claude | **Codex** | `codex exec --skip-git-repo-check --sandbox read-only -m gpt-5.5 -c model_reasoning_effort="high" "<prompt>" 2>/dev/null` |
| Codex | **Claude** | `claude -p --model opus --effort high --permission-mode plan "<prompt>"` |

Both invocations are read-only: Codex's `read-only` sandbox and Claude's `plan` permission mode let the peer run `git` and read files but never edit. `2>/dev/null` on Codex suppresses its thinking tokens — drop it only if the run errors and you need to debug. `gpt-5.5` is the current Codex model; `opus` is the current Claude model.

### 2. Pin the fixed point

The peer runs non-interactively, so it cannot do `/review`'s "ask the user for the fixed point" step — you must pin it here and pass it in concretely.

Whatever the user named is the fixed point — a SHA, branch, tag, `main`, `HEAD~5`. If they named none, ask. Then confirm it resolves (`git rev-parse <fixed-point>`) and that `git diff <fixed-point>...HEAD` is non-empty. A bad ref or empty diff fails here — not inside an expensive peer process.

### 3. Run the review skill on your peer

`<prompt>` for the command in step 1:

```
Follow the review skill at .agents/skills/review/SKILL.md to review the changes
since <fixed-point>. You are read-only — do not edit anything. Output only the
findings report.
```

If the user already named a spec/PRD path, append it so `/review` doesn't have to hunt: `The spec is at <path>.`

Run it and capture stdout. If the peer exits non-zero or returns nothing, report the failure to the user and stop — do not silently fall back to reviewing your own work.

### 4. Triage every finding

For **each** finding the peer returned, take exactly one path:

- **Accept** — the finding is right. Fix it.
- **Reject** — the finding is wrong or not worth it. State why in one line.
- **Ask** — you are unsure. Ask the user (via `AskUserQuestion`; if you are Codex, pause and ask directly). Always lead with a recommendation and the reason for it.

Completion criterion: every finding has a disposition — accepted-and-fixed, rejected-with-reason, or escalated. Present the dispositions back to the user as a list. Don't stop with findings left unaddressed.
