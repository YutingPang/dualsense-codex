# OpenMicro — project conventions

## Proposing issues

When the user wants to propose an issue, discuss an idea, or prepare work for a later agent,
read [docs/ISSUES.md](docs/ISSUES.md). Use its discussion workflow and the matching
[issue template](.github/ISSUE_TEMPLATE/proposal.md). Issue discussion does not authorize
implementation; distinguish a draft from approved work and record merge permission explicitly.

## Review workflow (required)

`main` is protected. Every change lands through a pull request that passes
`verify (ubuntu-latest)` + `verify (macos-latest)` and carries an independent review pinned to a
commit SHA. **Read [docs/REVIEW.md](docs/REVIEW.md) before starting work in a fresh session** —
it has the commands, the reviewer prompt, and the severity rubric.

The non-negotiables:

- **Never push to `main`.** Branch, open a PR, merge with a merge commit.
- **Review a frozen tree, not a moving branch.** Tag `review/<slug>-rN` before every review round.
- **The reviewer must not be the context that wrote the code.** A fresh session or subagent, git
  reads only, no access to the authoring conversation. Never use a forked/continued context.
- **P1 blocks the merge; P2/P3 become issues.** At most two review rounds per attempt —
  unresolved P1s mean stop and revise the scope or design, not another loop.
- **A fix test must fail against the code it fixes**, where such a test is meaningful. Revert the
  fix, watch it fail, put it back; for hardware behaviour, record what you observed instead.

## Releases

- **Release inside the parent PR**: when a fix/feature PR is going to ship as a release, push the version bump (`npm version X.Y.Z --no-git-tag-version`) and CHANGELOG entry as a commit on that same PR — do not open a separate release PR. After the parent PR merges, tag `vX.Y.Z` on main and push the tag; the publish workflow handles npm.
- Verification gate before any release commit: `npm run typecheck && npm run lint && npm run format:check && npm test`.
