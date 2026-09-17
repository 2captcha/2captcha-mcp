<!--
Security fix? Do not open a PR. See SECURITY.md — a public PR is a public
disclosure before anyone has upgraded.
-->

## What this changes

<!-- One or two sentences. What was wrong or missing, and what now happens. -->

## Why

<!-- The reasoning a reviewer cannot get from the diff. If it fixes a bug that
actually happened, say what the symptom was — that is what makes the comment
you left in the code worth keeping. -->

Closes #

## How it was verified

<!-- Not "tests pass" — what did you actually exercise? -->

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] Ran against the live service (`connect-check.mjs` or an example)
- [ ] Checked in a real client (which one: )

## Checklist

- [ ] New behaviour has a test
- [ ] `CHANGELOG.md` updated under `## Unreleased`
- [ ] No version bump, and no edits to the generated `2captcha-mcp.mjs`
- [ ] Nothing new is written to **stdout** — it is the MCP transport
- [ ] No API token in the diff, the tests or the output pasted above
