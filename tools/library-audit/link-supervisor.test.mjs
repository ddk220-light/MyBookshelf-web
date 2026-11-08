import test from "node:test";
import assert from "node:assert/strict";
import { publishLinkCheckpoint } from "./link-supervisor.mjs";
const path = "docs/research/india-library-audit/revalidation/fixture";
function fake({
  staged = "",
  remote = "old",
  head = "old",
  changed = path + "/events.jsonl",
} = {}) {
  const calls = [];
  let added = false,
    committed = false;
  const git = (args) => {
    calls.push(args);
    if (args[0] === "diff") return added ? changed : staged;
    if (args[0] === "rev-parse")
      return args[1] === "FETCH_HEAD" ? remote : committed ? "new" : head;
    if (args[0] === "add") added = true;
    if (args[0] === "commit") committed = true;
    return "";
  };
  return { git, calls };
}
test("link checkpoint publication preserves unrelated staged changes without adding or pushing", () => {
  const f = fake({ staged: "unrelated.txt" });
  assert.throws(
    () => publishLinkCheckpoint({ git: f.git, path, expectedLocal: "old" }),
    /Unrelated staged/,
  );
  assert.equal(
    f.calls.some((c) => ["add", "commit", "push"].includes(c[0])),
    false,
  );
});
test("a changed remote head stops before staging and never force pushes", () => {
  const f = fake({ remote: "other-writer" });
  assert.throws(
    () => publishLinkCheckpoint({ git: f.git, path, expectedLocal: "old" }),
    /Remote branch changed/,
  );
  assert.equal(
    f.calls.some((c) => ["add", "commit", "push"].includes(c[0])),
    false,
  );
});
test("normal publication stages only the owned audit directory and fast-forwards the research branch", () => {
  const f = fake();
  assert.equal(
    publishLinkCheckpoint({ git: f.git, path, expectedLocal: "old" }),
    "new",
  );
  assert.deepEqual(
    f.calls.find((c) => c[0] === "add"),
    ["add", "--", path],
  );
  assert.deepEqual(
    f.calls.find((c) => c[0] === "push"),
    ["push", "origin", "HEAD:refs/heads/feat/library-connector-audit"],
  );
  assert.equal(
    f.calls.some((c) => c.includes("--force") || c.includes("-f")),
    false,
  );
});
test("publication rejects production or out-of-scope paths before Git mutations", () => {
  for (const options of [{ path: "server" }, { path, branch: "main" }]) {
    const f = fake();
    assert.throws(
      () =>
        publishLinkCheckpoint({
          git: f.git,
          path,
          expectedLocal: "old",
          ...options,
        }),
      /Unapproved/,
    );
    assert.equal(f.calls.length, 0);
  }
});
