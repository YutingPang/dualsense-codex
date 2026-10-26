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

## Approval status

<!-- File this as Draft and leave these two lines for the maintainer. Do not set Ready yourself
and do not delete the explanation below it: a reader of the issue does not see this comment. -->

- Status: **Draft**. Ready means the maintainer has approved the scope for execution: the
  criteria are concrete, dependencies are identified, and no open question blocks
  implementation.
- Approved by: none.

Approval here covers starting the work, not landing it. It is not merge permission: every pull
request still needs the maintainer's merge instruction and the full `docs/REVIEW.md` workflow,
whatever this issue says. The maintainer's comment, not this line, is the record — if the status
line is stale, read the comments.
