# Proposing an issue

Use this guide when the user says something like "I want to propose an issue" or wants to
turn an idea into work a future agent can pick up. The result should stand on its own: the
implementing agent should not need the original conversation to understand the intent.

## Discuss before drafting

1. Understand the problem and why it matters. Ask for a concrete example of the current and
   desired behavior. For a bug, capture reproduction steps and relevant environment details
   such as OS, controller, connection type, and harness (the agent CLI adapter under `src/harness/`).
2. Inspect relevant code, documentation, and existing issues when accessible. Distinguish
   observed behavior from user reports and hypotheses. Do not make the user answer questions
   the repository already answers, and do not claim to have checked an issue tracker you
   cannot access.
3. Agree on scope and non-goals. Surface meaningful tradeoffs and dependencies. Split work
   when it contains independently useful changes or requires an unresolved design decision.
4. Turn the desired behavior into observable acceptance criteria. Include relevant failure
   cases and existing behavior that must be preserved. Describe outcomes rather than forcing
   an implementation unless the implementation itself is a constraint.
5. Decide how each criterion can be verified. Identify automated checks, manual checks, and
   hardware or permissions that may be unavailable to an unattended agent.
6. Present a complete proposal using the issue template, with unresolved questions visible.
   File it as **Draft**; the approval status is the maintainer's to set, under
   [Approval status](#approval-status).

Keep this conversational. Ask a few high-value questions at a time; do not send the entire
template as a questionnaire. Carry forward answers already given. Suggest reasonable defaults,
but label assumptions and resolve material uncertainty before proposing that the maintainer
mark the issue ready. Scale the discussion to the change: a small bug does not need a design
document.

## Write a self-contained proposal

Use the body of [.github/ISSUE_TEMPLATE/proposal.md](../.github/ISSUE_TEMPLATE/proposal.md) —
everything below its closing `---` — for the final issue, both in chat and on GitHub. The YAML
front matter above that line configures GitHub's template chooser; it is not part of the issue.
Strip it before `gh issue create --body-file`, and do not paste it into chat.

Replace the template's HTML comments with concrete content and use "None" or "Not applicable"
where appropriate, but leave the Status and Approved by entries and the sentence under
them exactly as written: those are what a reader of the issue sees, because GitHub does not
render the comments. Prefer a title describing the outcome or failure, such as "Release held
modifiers when the controller disconnects".

Acceptance criteria should make success assessable. For example:

- Weak: "Improve disconnect handling."
- Better: "When a controller disconnects while a modifier is held, the modifier is released;
  reconnecting the controller does not restore the previous held state."

Specify the evidence needed for that example: an automated regression test where feasible,
plus a real-controller disconnect/reconnect check for behavior the test cannot establish. Do
not treat mock assertions as proof of OS or hardware behavior.

Implementation suggestions may be recorded as optional notes. Keep them separate from required
outcomes so the next agent can choose an approach based on the code it actually finds.

## Approval status

A proposal has one status, and the maintainer sets it. Nothing else about merge permission is
recorded on the issue.

- **Draft** is the default. It can be filed for discussion with open questions. Filing an
  issue does not authorize implementation.
- **Ready** means the maintainer has approved the scope for execution: the criteria are
  concrete, dependencies are identified, and no unanswered question blocks implementation. A
  known manual verification step may still block completion later.

A proposing agent files every proposal as **Draft** and leaves the status lines as the template
has them. It does not set Ready and does not record an approval value, because it cannot
produce evidence that the maintainer approved anything. When the maintainer approves the scope
they say so in an issue comment; the **Approved by** line points at that comment, and the
comment — not the line — is the record, so a stale line does not override a later comment. The
maintainer may update the line; it can also stay `none`, because the comment is what counts.

"Maintainer" means the person with merge rights on `main` — on this fork, the repository owner.
A body edit alone is not approval. An agent must not promote its own proposal to ready, must not
infer approval from a value already present in the body, must not infer it from a label, and
must not treat a comment from anyone without the maintainer role as approval. Resolve
conflicting signals before starting dependent work.

**This is not merge permission.** Merging is decided on the pull request, not on the issue: an
approved proposal still waits for the maintainer's merge instruction and the full
[REVIEW.md](REVIEW.md) workflow. If an `agent-ready` label is ever introduced, only the
maintainer applies it, and only after execution is approved; the proposal template defines no
such label today.

When the user asks to create the issue, that authorizes publishing the agreed proposal; do not
ask for redundant confirmation. If the request is only to discuss or draft, return the draft
without posting. When using `gh`, always specify `--repo YutingPang/dualsense-codex` as
required by [REVIEW.md](REVIEW.md). Include the created issue link after successful publication.

## Handoff to implementation

A future worker should re-read the issue and repository instructions, check dependencies and
existing linked PRs, and assess whether the criteria still fit the current code. Material scope
changes require an updated agreement rather than silent expansion.

Completion requires every acceptance criterion to be met with the evidence its own text names,
and the repository review workflow to be satisfied. Where a fix test is meaningful, demonstrate
that it fails without the fix. For behavior no test can reach — hardware, OS permission state —
record what was observed instead, as [REVIEW.md](REVIEW.md) allows. Recording it is honest, but
it does not make the criterion met: an unverified criterion is outstanding evidence, not a pass.

A criterion whose own text names a check — a specific test, a hardware run, a permission
state — is different: if that check cannot be performed, the work stays incomplete rather than
passing. The criterion says which it is; do not decide retroactively that a named check was the
kind no test can reach. Do not close an issue merely because code was written or a PR was
opened.

This guide defines how to prepare work. It does not install a scheduler, create labels, or
enforce merge gates; those are separate implementation tasks.
