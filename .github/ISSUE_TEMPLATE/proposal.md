---
name: Work proposal
about: Define a bug fix or improvement for discussion or later agent execution.
title: ''
labels: ''
assignees: ''
---

## Problem and context

<!-- What happens now, who is affected, and why does it matter? Include a concrete example.
For bugs, include reproduction steps and relevant OS/controller/connection/harness details.
Separate confirmed observations from hypotheses. Link supporting evidence or related issues. -->

## Desired behavior

<!-- What should happen instead? Include a concrete before/after example. -->

## Scope and non-goals

<!-- What is included? What is explicitly excluded? Record any required compatibility or
design constraints. Keep optional implementation suggestions separate from requirements. -->

## Acceptance criteria

<!-- Replace this placeholder with observable outcomes, including relevant failure cases
and existing behavior that must be preserved. -->

- [ ] Describe an observable outcome.

## Verification

<!-- Explain how each acceptance criterion will be checked. Identify automated regression
checks and any manual/hardware checks, who can perform them, and prerequisites.
Follow docs/REVIEW.md: a fix test must fail without the fix where such a test is meaningful, and
for behavior no test can reach (hardware, OS permission state) record what was observed instead
— "not verified" is acceptable there. A criterion whose own text names a check is different: if
that check cannot be performed, the work stays incomplete rather than passing. -->

## Dependencies and open questions

<!-- Link prerequisites and identify questions that block implementation or verification.
Use "None" if there are none. Do not hide unresolved decisions in assumptions. -->

## Execution and merge permission

<!-- File this as Draft / Hold for maintainer. Both fields below are the maintainer's to change,
on the issue, after it is filed — do not fill in a readiness or merge value as the proposer, and
do not delete the conditions in the two lines: they are what a later reader sees, because GitHub
does not render these comments. -->

- Readiness: **Draft**. Ready only once the maintainer has approved the scope for execution —
  the criteria are concrete, dependencies are identified, and no open question blocks
  implementation. Only the maintainer sets **Ready**.
- Merge permission: **Hold for maintainer** — the PR waits for the maintainer's merge
  instruction. **Automatic after gates pass** is granted only by a maintainer-authored issue
  comment, linked from Authorization; even then the merge still requires the automated gate, an
  independent review pinned to the commit being merged, no open P1, every required manual check,
  every acceptance criterion with the evidence it names, and the accepted P2/P3 findings filed.
  The review happens before the merge, never instead of it, and no release is implied.
- Authorization: none — link the maintainer comment that grants either of the above.
