import { put, get, list, del } from "@vercel/blob";
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function suppressionRecord(job) {
  if (
    !UUID.test(job.id) ||
    !UUID.test(job.appUserId) ||
    typeof job.authUserId !== "string" ||
    job.authUserId.length > 128
  )
    throw Error("Invalid suppression record.");
  return {
    version: 1,
    operationId: job.id,
    appUserId: job.appUserId,
    authUserId: job.authUserId,
    requestedAt: new Date(job.requestedAt).toISOString(),
  };
}
export function createDeletionLedger(
  config,
  { blob = { put, get, list, del } } = {},
) {
  const token = config.deletionLedgerToken;
  if (!token) return null;
  const options = () => ({ token, abortSignal: AbortSignal.timeout(8000) });
  const read = async (pathname) => {
    const response = await blob.get(pathname, {
      ...options(),
      access: "private",
      useCache: false,
    });
    if (!response) return null;
    if (response.statusCode !== 200)
      throw Error("Suppression ledger is unavailable.");
    const text = await new Response(response.stream).text();
    if (text.length > (pathname.startsWith("cleanup/") ? 70000 : 4096))
      throw Error("Invalid suppression record.");
    return JSON.parse(text);
  };
  const immutable = async (pathname, value) => {
    const same = (record) => JSON.stringify(record) === JSON.stringify(value);
    const existing = await read(pathname);
    if (existing) {
      if (!same(existing)) throw Error("Suppression ledger conflict.");
      return;
    }
    try {
      await blob.put(pathname, JSON.stringify(value), {
        ...options(),
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      });
    } catch (error) {
      const prior = await read(pathname);
      if (!prior || !same(prior)) throw error;
    }
  };
  return {
    async persistProviderJob(job) {
      if (
        !UUID.test(job.id) ||
        !["google", "apple"].includes(job.provider) ||
        typeof job.payload !== "string" ||
        job.payload.length > 65536 ||
        !job.payload.startsWith("v1.")
      )
        throw Error("Invalid provider cleanup job.");
      await immutable("cleanup/" + job.id + ".json", {
        version: 1,
        id: job.id,
        authUserId: job.authUserId,
        deletionId: job.deletionId ?? null,
        provider: job.provider,
        payload: job.payload,
        expiresAt: new Date(job.expiresAt).toISOString(),
        createdAt: new Date(job.createdAt).toISOString(),
      });
    },
    async removeProviderJob(id) {
      if (!UUID.test(id)) throw Error("Invalid cleanup job.");
      await blob.del("cleanup/" + id + ".json", options());
    },
    async providerJobs() {
      const jobs = [];
      let cursor;
      do {
        const page = await blob.list({
          ...options(),
          prefix: "cleanup/",
          cursor,
          limit: 1000,
        });
        for (const item of page.blobs) {
          const job = await read(item.pathname);
          if (
            !job ||
            !UUID.test(job.id) ||
            item.pathname !== "cleanup/" + job.id + ".json" ||
            !["google", "apple"].includes(job.provider) ||
            typeof job.payload !== "string" ||
            !job.payload.startsWith("v1.") ||
            !Number.isFinite(Date.parse(job.expiresAt)) ||
            !Number.isFinite(Date.parse(job.createdAt)) ||
            Date.parse(job.expiresAt) >
              Date.parse(job.createdAt) + 30 * 86400000
          )
            throw Error("Invalid cleanup ledger.");
          if (new Date(job.expiresAt) <= new Date())
            await blob.del(item.pathname, options());
          else jobs.push(job);
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return jobs;
    },
    async persistRequest(job) {
      const record = suppressionRecord(job);
      await immutable("requests/" + record.operationId + ".json", record);
    },
    async persistCompletion(job) {
      const record = suppressionRecord(job),
        cleanedAt = new Date(job.cleanedAt).toISOString();
      await immutable("completed/" + record.operationId + ".json", {
        ...record,
        cleanedAt,
        suppressUntil: new Date(
          new Date(cleanedAt).getTime() + 35 * 86400000,
        ).toISOString(),
      });
    },
    async records() {
      const records = [];
      let cursor;
      do {
        const page = await blob.list({
          ...options(),
          prefix: "requests/",
          cursor,
          limit: 1000,
        });
        for (const item of page.blobs) {
          const record = await read(item.pathname);
          if (
            !record ||
            !UUID.test(record.operationId) ||
            item.pathname !== "requests/" + record.operationId + ".json"
          )
            throw Error("Invalid suppression ledger.");
          suppressionRecord({ ...record, id: record.operationId });
          const completed = await read(
            "completed/" + record.operationId + ".json",
          );
          if (
            completed &&
            (completed.authUserId !== record.authUserId ||
              completed.appUserId !== record.appUserId ||
              !Number.isFinite(Date.parse(completed.suppressUntil)) ||
              Date.parse(completed.suppressUntil) <
                Date.parse(completed.cleanedAt) + 35 * 86400000)
          )
            throw Error("Invalid completion record.");
          records.push({
            ...record,
            ...(completed
              ? {
                  cleanedAt: completed.cleanedAt,
                  suppressUntil: completed.suppressUntil,
                }
              : {}),
          });
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return records;
    },
    async removeExpired(record, now = new Date()) {
      if (!record.suppressUntil || new Date(record.suppressUntil) > now)
        return false;
      // The supported backup window has ended. Remove the request first so a
      // crash cannot turn an expired completion into an indefinitely pending entry.
      await blob.del("requests/" + record.operationId + ".json", options());
      await blob.del("completed/" + record.operationId + ".json", options());
      return true;
    },
    async pruneExpired(now = new Date()) {
      let cursor,
        removed = 0;
      do {
        const page = await blob.list({
          ...options(),
          prefix: "completed/",
          cursor,
          limit: 1000,
        });
        for (const item of page.blobs) {
          const record = await read(item.pathname);
          if (
            !record ||
            !UUID.test(record.operationId) ||
            item.pathname !== "completed/" + record.operationId + ".json" ||
            !Number.isFinite(Date.parse(record.suppressUntil)) ||
            !Number.isFinite(Date.parse(record.cleanedAt)) ||
            Date.parse(record.suppressUntil) <
              Date.parse(record.cleanedAt) + 35 * 86400000
          )
            throw Error("Invalid completion ledger.");
          if (new Date(record.suppressUntil) <= now) {
            await blob.del(
              "requests/" + record.operationId + ".json",
              options(),
            );
            await blob.del(item.pathname, options());
            removed++;
          }
        }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return removed;
    },
  };
}
