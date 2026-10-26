# Proposing an issue

Use this guide when the user says something like "I want to propose an issue" or wants to
turn an idea into work a future agent can pick up. The result should stand on its own: the
implementing agent should not need the original conversation to understand the intent.

## Discuss before drafting

1. Understand the problem and why it matters. Ask for a concrete example of the current and
   desired behavior. For a bug, capture reproduction steps and relevant environment details
   such as OS, controller, connection type, and harness.
2. Inspect relevant code, documentation, and existing issues when accessible. Distinguish
   observed behavior from user reports and hypotheses. Do not make the user answer questions
   the repository already answers, and do not claim to have checked a tracker or board you
   cannot access.
3. Agree on scope and non-goals. Surface meaningful tradeoffs and dependencies. Split work
   when it contains independently useful changes or requires an unresolved design decision.
4. Turn the desired behavior into observable acceptance criteria. Include relevant failure
   cases and existing behavior that must be preserved. Describe outcomes rather than forcing
   an implementation unless the implementation itself is a constraint.
5. Decide how each criterion can be verified. Identify automated checks, manual checks, and
   hardware or permissions that may be unavailable to an unattended agent.
6. Present a complete proposal using the issue template, with unresolved questions visible.
   Record execution readiness and merge permission only as
   [Draft, ready, and merge permission](#draft-ready-and-merge-permission) permits.

Keep this conversational. Ask a few high-value questions at a time; do not send the entire
template as a questionnaire. Carry forward answers already given. Suggest reasonable defaults,
but label assumptions and resolve material uncertainty before marking the issue ready.
Scale the discussion to the change: a small bug does not need a design document.

## Write a self-contained proposal

Use the body of [.github/ISSUE_TEMPLATE/proposal.md](../.github/ISSUE_TEMPLATE/proposal.md) —
everything below its closing `---` — for the final issue, both in chat and on GitHub. The YAML
front matter above that line configures GitHub's template chooser; it is not part of the issue.
Strip it before `gh issue create --body-file`, and do not paste it into chat. Replace the
template's HTML comments with concrete content, and use "None" or "Not applicable" where
appropriate. Prefer a title describing the outcome or failure, such as "Release held modifiers
when the controller disconnects".

Acceptance criteria should make success assessable. For example:

- Weak: "Improve disconnect handling."
- Better: "When a controller disconnects while a modifier is held, the modifier is released;
  reconnecting the controller does not restore the previous held state."

Specify the evidence needed for that example: an automated regression test where feasible,
plus a real-controller disconnect/reconnect check for behavior the test cannot establish. Do
not treat mock assertions as proof of OS or hardware behavior.

Implementation suggestions may be recorded as optional notes. Keep them separate from required
outcomes so the next agent can choose an approach based on the code it actually finds.

## Draft, ready, and merge permission

- **Draft** is the default. It can be filed for discussion with open questions. Filing an
  issue does not authorize implementation.
- **Ready** means the maintainer has approved the scope for execution, the criteria are
  concrete, dependencies are identified, and no unanswered question blocks implementation. A
  known manual verification step may still block completion or merging later.
- **Hold for maintainer** is the default merge permission. Work may proceed when ready, but
  the resulting PR waits for the maintainer's merge instruction.
- **Automatic after gates pass** requires authority from the maintainer recorded on the issue
  itself: a maintainer-authored comment, or a maintainer edit of the body. It does not replace
  any part of [REVIEW.md](REVIEW.md) — the automated gate, an independent review pinned to the
  commit being merged, and the absence of an open P1 are still required, and the review happens
  before the merge rather than instead of it. It does not authorize a release.

### Who may set these fields

"Maintainer" means the person with merge rights on `main` — on this fork, the repository owner.
Only the maintainer sets **Ready** or **Automatic after gates pass**, by editing the issue body
or saying so in an issue comment.

A proposing agent records either value only when the person it is working with is that
maintainer and the instruction is quoted in the `Authorization` field. Otherwise it files the
proposal as **Draft** / **Hold for maintainer** and lists the outstanding decision as an open
question. An agent must not promote its own proposal to ready, infer permission from a value
already present in the body, infer permission from an unchecked option, or treat a comment or
body edit from anyone without the maintainer role as authorization. Resolve conflicting
readiness or permission signals before starting dependent work.

The instruction in [REVIEW.md](REVIEW.md) to branch, open a PR, and merge with a merge commit
describes merge mechanics, not permission to merge. A green CI run is not permission either.
If an `agent-ready` label is ever added, apply it only after execution is approved; no such
label exists today, and the template intentionally applies no readiness or automatic-merge
labels.

When the user asks to create the issue, that authorizes publishing the agreed proposal; do not
ask for redundant confirmation. If the request is only to discuss or draft, return the draft
without posting. When using `gh`, always specify `--repo YutingPang/dualsense-codex` as
required by [REVIEW.md](REVIEW.md). Include the created issue link after successful publication.

## Handoff to implementation

A future worker should re-read the issue and repository instructions, check dependencies and
existing linked PRs, and assess whether the criteria still fit the current code. Material scope
changes require an updated agreement rather than silent expansion.

Completion requires evidence for the acceptance criteria and the repository review workflow.
Where a fix test is meaningful, demonstrate that it fails without the fix. For behavior no test
can reach — hardware, OS permission state — record what was observed instead, as
[REVIEW.md](REVIEW.md) allows. A criterion that explicitly requires evidence is different: if
that evidence is unavailable, the work stays incomplete rather than passing. Do not close an
issue merely because code was written or a PR was opened.

This guide defines how to prepare work. It does not install a scheduler, create labels, or
enforce merge gates; those are separate implementation tasks.
