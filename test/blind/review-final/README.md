# Reviewer's blind set (v1 final review, 2026-10-04)

Copied verbatim from the independent reviewer's session scratchpad (temporary) so the
material survives. Nothing here was seen by the engine author before the review.

- `ads/` — four job ads (2 EN, 2 DE) written blind, with `expected.json` = the reviewer's
  expected keywords per ad. First truly blind recall measure for the keyword engine.
  Do not tune the dictionary on these ads; use them only to report recall.
- `pdf/` — long-name probe documents (HTML + PDF + extractions) behind the review's
  split-contact finding (blocker 1).
- `drv/` — the reviewer's Jest drivers as written (absolute scratchpad paths, excluded
  from jest/tsc/lint). `extract.mjs`, `jr.sh` — the reviewer's helper scripts.
