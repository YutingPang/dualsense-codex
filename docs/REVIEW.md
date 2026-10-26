# Review workflow

How every change reaches `main` in this repo. Written to be followed by a human **or** an
agent starting from a fresh session, including models other than the one that wrote the code.

`main` is protected. A change lands only through a pull request that passes both required
checks and carries a review pinned to a commit SHA.

## The three properties

A pull request is not "a web page where code waits". It is three guarantees, and every step
below exists to preserve one of them:

1. **A frozen head.** The reviewer judges a tree that cannot move underneath them.
2. **A gate that runs somewhere other than the author's checkout.** CI on a clean runner,
   plus a local run in a throwaway worktree.
3. **A sign-off bound to a SHA.** The verdict names the commit it applies to, so a later
   commit cannot inherit an earlier approval.

## Roles

- **Author** — writes the change. May be a person or an agent.
- **Reviewer** — a fresh context that did **not** write the code. See [§5](#5-independent-review).
- **Gate** — GitHub Actions: `verify (ubuntu-latest)` and `verify (macos-latest)`.

The review is advisory by design: branch protection requires **0 approvals**, because a solo
maintainer cannot approve their own PR and requiring one would deadlock the repo. The gate and
the review record are the control, not the approval count. If a second maintainer joins, raise
`required_approving_review_count` to 1.

## 1. Branch and commits

```sh
git switch main && git pull --ff-only
git switch -c feat/<slug>
```

One commit per concern. Fold fixups before review (`git rebase -i main`) — a reviewer cannot
hold a 12k-line diff, but it can hold 400 lines.

## 2. Freeze the head

```sh
git tag review/<slug>-r1 HEAD
git push origin review/<slug>-r1
```

The tag is the PR head. The branch may keep moving; the reviewed tree cannot. Re-freeze after
every round of fixes: `review/<slug>-r2`, `-r3`.

## 3. Run the gate outside your checkout

```sh
git worktree add ~/dev/reviews/<slug>-r1 review/<slug>-r1
cd ~/dev/reviews/<slug>-r1
npm ci && npm run verify
```

Use a path **outside** `~/Documents`. This checkout lives under iCloud, which evicts files
(`dataless`) and makes `tsc` stall and `git push` hang; a worktree in `~/dev` or `/tmp` does not
have that problem.

The worktree also proves the tagged tree builds on its own, without uncommitted WIP lending a
hand. If `npm` cannot write `~/.npm`:

```sh
npm ci --cache /tmp/npm-cache && npm run verify
```

## 4. Open the pull request

```sh
gh pr create --base main --head feat/<slug> --title "<type>: <summary>" --body-file /tmp/pr.md
```

Fill `.github/pull_request_template.md` honestly. The **Verified** section is the one reviewers
trust least and need most: say what you ran, what you ran it on, and what you did not verify.

## 5. Independent review

Rules, in order of how often they are broken:

- **The reviewer must not be the context that wrote the code.** Start a new session or a fresh
  subagent. In DSH that means `subagent` (clean context), never `subagent_fork` (inherits the
  authoring conversation and will rationalise its decisions). In Codex or Claude Code, a new
  session with the prompt below.
- **Give it the tree, not your reasoning.** The prompt carries the base SHA, the head SHA, the
  PR body, and the risk areas. Not your plan, not your doubts, not this conversation.
- **Git reads only.** The working tree may be checked out on another branch. Tell the reviewer
  to use `git diff <base>...<head>` and `git show <head>:<path>`.
- **Read-only.** A reviewer that edits what it finds is an author. Refuse the temptation.
- **Require the "could not verify" section.** A review that claims full coverage is the failure
  mode. The most useful line in this repo's history was "tsc never completed".

Post the result as a review comment, so the record lives on the PR:

```sh
gh pr review <n> --comment --body-file /tmp/review.md
```

Prefix it with the reviewer, model, and pinned SHA — for example
**Delta review — Codex, `bd4eb43..ca6d237`** — so nobody mistakes it for an approval of a
later commit.

Annotate what you independently reproduced. A finding is a lead until someone checks it; say
which ones you checked.

### Reviewer prompt template

```text
You are reviewing PR #<n> in <repo path>. Read-only: do not modify, create, or delete files,
do not commit, push, or make network requests. Output only the review text.

Base: <base-sha>   Head: <head-sha>   (<k> commits)

The working tree may be checked out elsewhere. Inspect this PR with git only:
  git diff --stat <base-sha>...<head-sha>
  git diff <base-sha>...<head-sha> -- <path>
  git show <head-sha>:<path>

What this PR claims: <2-3 sentences, or paste the PR body>

Already established — do not re-litigate: `npm run verify` passes at <head-sha>, and CI is
green on ubuntu-latest and macos-latest. Spend your effort on what a green gate cannot catch.

Priorities, highest first:
1. <specific risk area>
2. <specific risk area>
3. <test adequacy: what is only mock-asserted, what would not survive real hardware>

Output exactly this structure:

VERDICT: <approve | approve-with-nits | changes-requested>
## Summary
<2-4 sentences: what this does, and whether it is safe to merge.>
## Findings
<Numbered, max 8, ranked. Each: **P1|P2|P3 — short title** — `path:line` — what is wrong, the
concrete failure mode, the smallest fix direction. Cite exact identifiers. No praise.>
## Could not verify
<What a static read cannot establish: hardware, timing, OS permission state.>
## Nits
<Max 5, or "none".>

P1 = stuck modifier, crash, data loss, security. Never invent a line number — confirm each
citation with git show or grep before writing it.
```

## 6. Triage

- **P1 blocks the merge.** Fix it on the same branch.
- **P2/P3 become issues**, not review rounds — unless the fix is trivial and in the same file.
- Never argue a finding down in the PR thread. Reproduce it or file it.

## 7. Fix, and re-freeze

```sh
# fix, then:
git tag review/<slug>-r2 HEAD
```

Every fix for a real defect needs a test that **fails against the old code**. Verify that by
temporarily reverting the fix, running the test, and putting the fix back. A test that passes
either way is decoration.

## 8. Delta review

Review only what changed since the last verdict.

- Commits were appended: `git diff review/<slug>-r1..review/<slug>-r2`
- History was rewritten: `git range-diff main...review/<slug>-r1 main...review/<slug>-r2`

Ask for three things and nothing else:

1. Per previously raised finding: **fixed / partial / not fixed**, with evidence.
2. New issues introduced by the fix itself.
3. Whether the new tests actually distinguish fixed from broken.

**Two rounds maximum.** After that, either ship with the remaining findings filed as issues, or
stop and reconsider the design. An unbounded review loop is a way of not deciding.

## 9. Merge

```sh
gh pr merge <n> --merge
```

A merge commit, not a squash: it keeps the individual fix commits and the review trail
reachable from `main`. The head branch is auto-deleted. Then:

- File any remaining P2/P3 findings as issues (`P2` + `review-finding`).
- Delete the review tags locally if they are noise: `git tag -d review/<slug>-r*`.

## Severity rubric

| Level | Meaning                                    | In this repo that has meant                                                                                               |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| P1    | Stuck modifier, crash, data loss, security | Unhandled child-process `error` killing the host; a chord left held machine-wide; a restore overwriting a newer clipboard |
| P2    | Wrong behaviour on a realistic path        | Touchpad deadzone discarding slow movement; a config edit with no recovery path                                           |
| P3    | Robustness, maintainability                | Missing CSP; unvalidated IPC sender                                                                                       |

## Environment notes

- **This checkout is iCloud-synced.** Files report `dataless` and block on read. Keep worktrees
  and clones outside `~/Documents`. `find . -flags +dataless | head` tells you if you are bitten.
- **If a git command hangs** — `push` sitting for minutes, `tsc` stalling — iCloud has probably
  evicted objects again. Pull them back in parallel before assuming the remote is at fault:

  ```sh
  find .git -flags +dataless -type f | wc -l     # non-zero: evicted
  find .git -flags +dataless -type f -print0 \
    | xargs -0 -P 12 -n 1 sh -c 'cat "$0" >/dev/null'
  ```

  The second command took a 57-second `git push` down to an instant one. Evicted objects are
  also why `git push` hangs while `git log` is fine: log reads only commits, push needs blobs.

- **`gh` and `npm` live under `/opt/homebrew/bin`.** `/usr/local/bin/gh` is an Intel build that
  fails on this machine with "Bad CPU type". Prepend the arm64 path.
- **If `git push` hangs at `git credential-osxkeychain get`**, macOS is showing a keychain
  approval prompt that a terminal agent cannot click. Either approve it, or push with `gh`'s
  token instead of the keychain:

  ```sh
  git -c credential.helper= \
      -c credential.helper='!/opt/homebrew/bin/gh auth git-credential' push
  ```

  Note that reads still work while this is broken — the repo is public, so `fetch`, `ls-remote`
  and `log` succeed anonymously and only the push blocks.

- **Sandboxed agents may not write `~/.npm`.** Use `npm ci --cache /tmp/npm-cache`.
- **CI is the authoritative gate.** A local run is a pre-check; the branch protection rules key
  off the GitHub checks, not your laptop.
