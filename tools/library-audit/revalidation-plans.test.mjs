import test from "node:test";
import assert from "node:assert/strict";
import {
  completedRevalidationKeys,
  revalidationAttemptKey,
} from "./revalidation-plans.mjs";

test("an actual query-plan change reopens a completed attempt without changing its implementation", () => {
  const original = { queries: ["History"], reviewedAt: "old" };
  const key = revalidationAttemptKey("library:a", "implementation", original);
  const completed = completedRevalidationKeys([
    {
      type: "revalidation_attempt_completed",
      libraryId: "library:a",
      implementationHash: "implementation",
      attemptKey: key,
    },
  ]);
  assert.equal(
    completed.has(
      revalidationAttemptKey("library:a", "implementation", {
        ...original,
        reviewedAt: "new",
        basis: "Updated explanation",
      }),
    ),
    true,
  );
  assert.equal(
    completed.has(
      revalidationAttemptKey("library:a", "implementation", {
        queries: ["History", "Classical mechanics"],
      }),
    ),
    false,
  );
  assert.equal(
    completed.has(
      revalidationAttemptKey("library:b", "implementation", original),
    ),
    false,
  );
});

test("legacy completion applies to its original default plan and implementation, never a new custom plan", () => {
  const completed = completedRevalidationKeys([
    {
      type: "revalidation_attempt_completed",
      libraryId: "library:a",
      implementationHash: "old",
    },
  ]);
  assert.equal(
    completed.has(revalidationAttemptKey("library:a", "old", null)),
    true,
  );
  assert.equal(
    completed.has(
      revalidationAttemptKey("library:a", "old", {
        queries: ["Title from primary evidence"],
      }),
    ),
    false,
  );
  assert.equal(
    completed.has(revalidationAttemptKey("library:a", "repaired", null)),
    false,
  );
});
