# OpenMicro — project conventions

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
- **P1 blocks the merge; P2/P3 become issues.** Two review rounds maximum, then ship with the
  remaining findings filed.
- **A fix test must fail against the code it fixes.** Revert the fix, watch it fail, put it back.

## Releases

- **Release inside the parent PR**: when a fix/feature PR is going to ship as a release, push the version bump (`npm version X.Y.Z --no-git-tag-version`) and CHANGELOG entry as a commit on that same PR — do not open a separate release PR. After the parent PR merges, tag `vX.Y.Z` on main and push the tag; the publish workflow handles npm.
- Verification gate before any release commit: `npm run typecheck && npm run lint && npm run format:check && npm test`.
