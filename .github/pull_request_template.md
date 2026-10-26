## What

<!-- What this changes and why. One paragraph a reviewer can hold in their head. -->

## Risk surface

<!-- The parts a green test run cannot prove: hardware, macOS permissions, process ownership, concurrency, timing. Write "none" if genuinely none. -->

## Verified

- [ ] `npm run verify` (CI runs the same gate on ubuntu + macos)
- [ ] Physical controller (state wired or Bluetooth, and which model)
- [ ] macOS Accessibility / Automation prompts
- [ ] Packaged app (`npm run desktop:package`)
- [ ] **Not verified** — say so explicitly rather than leaving this section blank

## Review notes

<!-- What a reviewer should challenge: claimed fixes, behaviour deliberately dropped, follow-ups deferred, anything you are unsure about. -->

## Backlog

<!-- Findings deliberately left out of this PR, filed as issues (label: P2 + review-finding). Link them here. -->
