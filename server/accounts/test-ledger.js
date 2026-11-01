import assert from "node:assert/strict";
export function memoryBlob() {
  const files = new Map();
  return {
    files,
    async get(path, options) {
      assert.equal(options.access, "private");
      assert.equal(options.useCache, false);
      return files.has(path)
        ? { statusCode: 200, stream: new Response(files.get(path)).body }
        : null;
    },
    async put(path, body, options) {
      assert.equal(options.access, "private");
      assert.equal(options.addRandomSuffix, false);
      assert.equal(options.allowOverwrite, false);
      if (files.has(path)) throw Error("Already exists");
      files.set(path, body);
    },
    async list({ prefix }) {
      return {
        blobs: [...files.keys()]
          .filter((key) => key.startsWith(prefix))
          .map((pathname) => ({ pathname })),
        hasMore: false,
      };
    },
    async del(path) {
      files.delete(path);
    },
  };
}
