# Review workflow

How every change reaches `main` in this repo. Written to be followed by a human **or** an agent
starting from a fresh session, including models other than the one that wrote the code.

`main` is protected. A change lands only through a pull request that passes both required
checks and carries a review pinned to a commit SHA.

## The three properties

A pull request is not "a web page where code waits". It is three guarantees, and every step
below exists to preserve one of them:

1. **A frozen head.** The reviewer judges a tree that cannot move underneath them.
2. **A gate that runs somewhere other than the author's checkout.** CI on a clean runner, plus
   a local run in a separate checkout.
3. **A sign-off bound to a SHA.** The verdict names the commit it applies to, so a later commit
   cannot inherit an earlier approval.

## Roles

- **Author** — writes the change. May be a person or an agent.
- **Reviewer** — a fresh context that did **not** write the code. See [§5](#5-independent-review).
- **Gate** — GitHub Actions: `verify (ubuntu-latest)` and `verify (macos-latest)`.

The review is advisory by design: branch protection requires **0 approvals**, because a solo
maintainer cannot approve their own PR and requiring one would deadlock the repo. Protection
enforces the checks and conversation resolution; the maintainer enforces the review record.
If a second maintainer joins, raise `required_approving_review_count` to 1.

## 0. Setup

This checkout has two remotes (`origin` = the fork, `upstream` = OpenMicro), so **never let a
`gh` command infer the repository** — it has picked `upstream` before, where none of these
branches exist.

```sh
REPO=YutingPang/dualsense-codex
cd ~/Documents/DualSense          # the author checkout
git switch main && git pull --ff-only
BASE=$(git rev-parse HEAD)        # record it; the delta review needs it later
```

Every `gh` command below passes `--repo "$REPO"` explicitly.

## 1. Branch and commits

```sh
git switch -c feat/<slug>
```

One commit per concern. Fold fixups before review (`git rebase -i "$BASE"`) — a reviewer cannot
hold a 12k-line diff, but it can hold 400 lines.

## 2. Freeze the head

```sh
git tag review/<slug>-r1 HEAD
```

The tag is the PR head. The branch may keep moving; the reviewed tree cannot. Re-freeze after
every round of fixes: `-r2`.

## 3. Run the gate outside your checkout

```sh
git worktree add ~/dev/reviews/<slug>-r1 review/<slug>-r1
cd ~/dev/reviews/<slug>-r1
npm ci && npm run verify
```

Use a path **outside** `~/Documents`. A linked worktree still shares the original object
database, so it fixes the `tsc`/`node_modules` problem (the working files are new) but not
iCloud eviction of `.git`. If `git` itself keeps stalling, take a real clone instead:

```sh
git clone --no-hardlinks ~/Documents/DualSense ~/dev/clones/<slug>-r1
cd ~/dev/clones/<slug>-r1 && git switch --detach review/<slug>-r1
npm ci && npm run verify
```

Note the different destination: the worktree above already occupies `~/dev/reviews/<slug>-r1`,
and `git clone` refuses a non-empty directory. `--detach` is required — the tag is not a branch.

`--no-hardlinks` matters: hardlinked object files stay tied to the iCloud originals.

If `npm` cannot write `~/.npm`: `npm ci --cache /tmp/npm-cache`.

**You are now in the review checkout, not the author checkout.** Step 7 returns you.

## 4. Publish and open the pull request

From the **author** checkout, once step 3 is green:

```sh
cd ~/Documents/DualSense
git switch feat/<slug>
git push -u origin feat/<slug>
git push origin review/<slug>-r1
# fill in .github/pull_request_template.md, save it as /tmp/pr.md
gh pr create --repo "$REPO" --base main --head feat/<slug> \
  --title "<type>: <summary>" --body-file /tmp/pr.md
```

`gh pr create --head` does **not** push the branch for you. Publish only after the gate passes —
never push a tree you have not verified.

Fill the template honestly. The **Verified** section is the one reviewers trust least and need
most: say what you ran, what you ran it on, and what you did not verify.

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
  mode.
- **Confirm CI before you assert it.** The prompt template says the gate is green; check
  `gh pr checks <n> --repo "$REPO"` first, and paste the pinned SHAs, not `HEAD`.

Post the result as a review comment, so the record lives on the PR:

```sh
gh pr review <n> --repo "$REPO" --comment --body-file /tmp/review.md
```

Prefix it with the reviewer, model, and pinned SHA — for example
**Delta review — Codex, `bd4eb43..ca6d237`** — so nobody mistakes it for an approval of a later
commit.

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

P1 = stuck modifier, crash, data loss, or a security issue with a reachable exploit path.
Classify other security-hardening gaps by demonstrated impact, not by category.
Never invent a line number — confirm each citation with git show or grep before writing it.
```

## 6. Triage

- **P1 blocks the merge.** Fix it on the same branch.
- **P2/P3 become issues**, not review rounds — unless the fix is trivial and in the same file.
  File the accepted ones **before** merging (`P2` + `review-finding`), so the merge cannot quietly
  bury them.
- Reproduce a finding before acting on it. If it is a false positive, close it in the thread
  with the evidence that disproves it — do not silently ignore it, and do not argue it down
  without evidence either way.

## 7. Fix, verify, re-freeze

Back in the author checkout — **not** the review worktree from step 3:

```sh
cd ~/Documents/DualSense
git switch feat/<slug>
# fix
git add -A
npm run verify
git commit -m "fix: <what the review found>"
git tag review/<slug>-r2 HEAD
git push origin feat/<slug>
git push origin review/<slug>-r2
```

`git add -A` before the gate, not `commit -am` after it: `-a` only stages **tracked** changes, so
a new regression test or new source file would be tested but never committed — and the frozen
tag would silently exclude the evidence.

Every fix for a real defect needs a test that **fails against the old code**, where such a test
is meaningful. Verify it by temporarily reverting the fix, watching the test fail, and putting
it back. For hardware and UI behaviour a test cannot reach, record what you observed manually
instead — "not verified" is an acceptable answer, a fabricated test is not.

## 8. Delta review

Review only what changed since the last verdict.

- Commits were appended: `git diff review/<slug>-r1..review/<slug>-r2`
- History was rewritten: `git range-diff "$BASE"..review/<slug>-r1 "$BASE"..review/<slug>-r2`

Using the recorded `$BASE` commit rather than `main` keeps the ranges stable after `main` moves.

Ask for three things and nothing else:

1. Per previously raised finding: **fixed / partial / not fixed**, with evidence.
2. New issues introduced by the fix itself.
3. Whether the new tests actually distinguish fixed from broken.

**At most two rounds per attempt.** Unresolved P1s block the merge: stop and revise the scope or
the design rather than looping. Accepted P2/P3 findings are filed as issues before merging.

## 9. Merge

Merge the exact commit that was reviewed:

```sh
# the round the final review actually named — r2 only if a second round happened
REVIEWED=$(git rev-parse review/<slug>-rN)
gh pr view <n> --repo "$REPO" --json headRefOid,mergeable,statusCheckRollup
gh pr merge <n> --repo "$REPO" --merge --match-head-commit "$REVIEWED"
```

`--match-head-commit` aborts if anything landed on the branch after the verdict — the guard
that makes "the reviewed SHA is what merges" true rather than aspirational.

A merge commit, not a squash: it keeps the individual fix commits and the review trail
reachable from `main`. The head branch is auto-deleted. Then:

- Delete the review tags when they are noise: `git tag -d review/<slug>-r1 review/<slug>-r2`
  (`git tag -d` does not expand globs, so name each one).

## Severity rubric

| Level | Meaning                                                        | In this repo that has meant                                                                                         |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P1    | Stuck modifier, crash, data loss, reachable security bug       | Unhandled child-process `error` killing the host; a chord left held machine-wide; a restore overwriting a clipboard |
| P2    | Wrong behaviour on a realistic path                            | Touchpad deadzone discarding slow movement; a config edit with no recovery path                                     |
| P3    | Robustness, maintainability, hardening without a known exploit | Missing CSP; unvalidated IPC sender while only one renderer exists                                                  |

## Environment notes

- **This checkout is iCloud-synced.** Files report `dataless` and block on read. Keep review
  checkouts outside `~/Documents`.
- **If a git command hangs** — `push` sitting for minutes, `tsc` stalling — iCloud has probably
  evicted objects. A linked worktree has a `.git` _file_, so resolve the real object store
  first:

  ```sh
  GIT_DIR=$(git rev-parse --path-format=absolute --git-common-dir)
  find "$GIT_DIR" -flags +dataless -type f | wc -l     # non-zero: evicted
  find "$GIT_DIR" -flags +dataless -type f -print0 \
    | xargs -0 -P 12 -n 1 sh -c 'cat "$0" >/dev/null'
  ```

  The second command took a 57-second `git push` down to an instant one. Evicted objects are
  also why `git push` hangs while `git log` is fine: log reads commits, push needs blobs.

- **`gh` and `npm` live under `/opt/homebrew/bin`.** `/usr/local/bin/gh` is an Intel build that
  fails on this machine with "Bad CPU type". Prepend the arm64 path.
- **If `git push` hangs at `git credential-osxkeychain get`**, macOS is showing a keychain
  approval prompt that a terminal agent cannot click. Either approve it, or push with `gh`'s
  token instead of the keychain:

  ```sh
  git -c credential.helper= \
      -c credential.helper='!/opt/homebrew/bin/gh auth git-credential' push
  ```

  Reads still work while this is broken — the repo is public, so `fetch`, `ls-remote` and `log`
  succeed anonymously and only the push blocks.

- **Sandboxed agents may not write `~/.npm`.** Use `npm ci --cache /tmp/npm-cache`.
- **CI is the authoritative gate.** A local run is a pre-check; the branch protection rules key
  off the GitHub checks, not your laptop.
