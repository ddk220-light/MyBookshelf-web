import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readManifest, reduceRun, run } from "./runner.mjs";

export const defaultSchedule = {
  schemaVersion: 1,
  enabled: false,
  healthEveryHours: 168,
  requalifyEveryHours: 720,
  maxLibrariesPerTick: 25,
  concurrency: 3,
};
export function dueJobs(progress, config, now = Date.now()) {
  const jobs = [];
  for (const library of progress.libraries) {
    if (library.blocker || library.lastAttemptState === "needs_review")
      continue; // only a useful recovery/query trigger retries these
    const lastQualified = Date.parse(library.lastQualifiedAt || "") || 0,
      lastHealth = Date.parse(library.lastHealth?.at || "") || 0;
    if (library.books.length < 20)
      jobs.push({ libraryId: library.libraryId, mode: "qualify", dueAt: 0 });
    else if (now - lastQualified >= config.requalifyEveryHours * 3600000)
      jobs.push({
        libraryId: library.libraryId,
        mode: "requalify",
        dueAt: lastQualified + config.requalifyEveryHours * 3600000,
      });
    else if (now - lastHealth >= config.healthEveryHours * 3600000)
      jobs.push({
        libraryId: library.libraryId,
        mode: "health",
        dueAt: lastHealth + config.healthEveryHours * 3600000,
      });
  }
  return jobs.sort(
    (a, b) => a.dueAt - b.dueAt || a.libraryId.localeCompare(b.libraryId),
  );
}
export async function tick(store, service, { execute = false, signal } = {}) {
  const path = join(store.root, "schedule.json"),
    config = existsSync(path)
      ? JSON.parse(readFileSync(path))
      : defaultSchedule;
  for (const k of [
    "healthEveryHours",
    "requalifyEveryHours",
    "maxLibrariesPerTick",
    "concurrency",
  ])
    if (!Number.isSafeInteger(config[k]) || config[k] < 1)
      throw new Error("Invalid schedule budget");
  if (config.concurrency > 8 || config.maxLibrariesPerTick > 6703)
    throw new Error("Schedule budget too large");
  if (!existsSync(path)) store.save("schedule.json", config);
  const progress = reduceRun(readManifest(store), store.events()),
    jobs = dueJobs(progress, config);
  const plan = {
    at: new Date().toISOString(),
    enabled: config.enabled,
    due: jobs.length,
    selected: jobs.slice(0, config.maxLibrariesPerTick),
  };
  store.save("schedule-status.json", plan);
  if (execute && !config.enabled)
    throw new Error(
      "Schedule is disabled; explicitly enable schedule.json before executing",
    );
  if (execute)
    for (const mode of ["qualify", "requalify", "health"]) {
      const ids = plan.selected
        .filter((j) => j.mode === mode)
        .map((j) => j.libraryId);
      if (!ids.length) continue;
      await run(store, service, {
        libraryIds: ids,
        mode,
        cycle: `rolling-${Math.floor(Date.now() / (config.requalifyEveryHours * 3600000))}`,
        concurrency: config.concurrency,
        signal,
      });
    }
  return plan;
}
