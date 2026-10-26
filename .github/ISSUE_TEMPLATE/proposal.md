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
— "not verified" is acceptable there. A criterion that explicitly requires evidence is
different: if that evidence is unavailable, the work stays incomplete rather than passing. -->

## Dependencies and open questions

<!-- Link prerequisites and identify questions that block implementation or verification.
Use "None" if there are none. Do not hide unresolved decisions in assumptions. -->

## Execution and merge permission

<!-- Keep the defaults unless the maintainer has authorized a change. Replace each field with a
single value. Authorization is a free-text line, not a dropdown choice: name who granted it and
link the maintainer comment or body edit that records it. Only the maintainer may set Ready or
Automatic after gates pass. -->

- Readiness: **Draft** (or **Ready** once the maintainer has approved the scope for execution,
  the criteria are concrete, dependencies are identified, and no open question blocks
  implementation).
- Merge permission: **Hold for maintainer** (or **Automatic after gates pass** once a maintainer
  has authorized it on this issue).
- Authorization: Not yet granted.

<!-- Ready does not imply permission to merge, and neither does a green CI run. An automatic
merge still requires every acceptance criterion, every required manual check, an independent
review pinned to the commit being merged, and no open P1 finding — see docs/REVIEW.md. The
review happens before the merge, never instead of it. No release is implied. -->
