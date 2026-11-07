Current state: the prepared patch is APPLIED. See application-record.json for the current code hash and checks. Preparation files below are retained historical evidence; do not apply the old patch again.

# Prepared India audit repairs — collector unchanged

Three offline repairs are ready for the next safe code checkpoint. They add no provider requests or library passes. The active collector implementation was checked against recorded baseline hashes and left unchanged.

- `prepared-repairs.json`: exact findings, source dates/hashes, candidate hashes, tests and safe application sequence.
- `patches/native-search-repairs.patch`: the three fixes, six regression tests and three sanitized saved fixtures. Verify baseline hashes before applying. Archive this patch/manifest/log into PR #188; do not commit the entire source snapshot or its dependency/data symlinks.
- `candidate-regressions.log`: 147 passing audit/provider/app book-search regressions in the separate snapshot, including loopback API tests. This is not a current implementation attestation for the running collector.
- `open-entry-review.csv`: checkpoint view of open work, including the unconfirmed BN College block. It is saved analysis, not fresh library verification.

The CMD parser now recognizes the native public MARC display link while preserving same-origin/unique-ID checks. Twenty native titled rows match the independent fidelity oracle in saved evidence; live detail, membership, relevance and item-link checks remain.

Bhatkhande has nineteen native result IDs, including two untitled rows. The prepared native audit path retains those two as empty titles with metadataWarnings, so the independent row check no longer falsely reports omitted IDs. The evaluator rejects them; no titles are invented and no empty-title row counts as a book. Ordinary app search still skips untitled rows.

The challenge detector distinguishes a dormant script loader or bibliography word from actual challenge controls/pages. Real challenges and HTTP refusals remain blocked. The exact raw substring triggering the original BN College failure is unavailable after sanitization, so this does not claim the original cause was conclusively reproduced or its search succeeded. Append revalidation_outcome_invalidated with the old normal-form response hash and original date before a meaningful fresh recheck, preserving the old failure.

Do not apply code, change Git state or start another provider worker until the existing collector has stopped and its locks are safely released. Re-run regressions and refresh the implementation attestation after applying; all 554 entries must have honest outcomes and reconciliation must pass before opening the full-run gate. No production changes.
