---
name: implement
description: "Implement a piece of work based on a PRD or set of issues."
disable-model-invocation: true
---

Implement the work described by the user in the PRD or issues.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /peer-review to review the work — the review is performed by the opposite CLI tool (if you are Claude, Codex reviews; if you are Codex, Claude reviews).

Commit your work to the current branch.
