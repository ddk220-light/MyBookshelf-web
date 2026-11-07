import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  openSync,
  closeSync,
  fsyncSync,
  appendFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { hash, failure } from "./contracts.js";

const sensitive =
  /cookie|authorization|password|secret|token|csrf|viewstate|eventvalidation|sessionid|captcha|patron|borrower|email|phone|mobile|address|login|username|userid|cardnumber/i;
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        sensitive.test(k) ? "[redacted]" : redact(v),
      ]),
    );
  return value;
}
export function safeUrl(value) {
  const u = new URL(value);
  u.username = "";
  u.password = "";
  for (const key of u.searchParams.keys())
    if (sensitive.test(key)) u.searchParams.set(key, "[redacted]");
  return u.toString();
}
export function sanitizeBody(text, contentType = "") {
  if (contentType.includes("json")) {
    try {
      return JSON.stringify(redact(JSON.parse(text)));
    } catch {
      return "[invalid JSON body omitted]";
    }
  }
  // Scripts can contain session/identity material. Public request recipes are
  // reviewed separately; runtime evidence retains result and scope markup.
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "[script omitted]")
    .replace(/<input\b[^>]*>/gi, (tag) =>
      sensitive.test(tag.match(/(?:name|id)\s*=\s*["']([^"']*)/i)?.[1] || "")
        ? "[form state omitted]"
        : tag,
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email omitted]");
}
export class EvidenceStore {
  constructor(root) {
    this.root = root;
    this.cachedEvents = null;
    mkdirSync(join(root, "bodies"), { recursive: true });
    this.eventsPath = join(root, "events.jsonl");
  }
  acquire() {
    const path = join(this.root, "writer.lock");
    try {
      this.fd = openSync(path, "wx", 0o600);
    } catch {
      throw failure(
        "WRITER_ACTIVE",
        "Writer lock exists; verify host/process and recover explicitly",
        409,
      );
    }
    this.owner = {
      id: randomUUID(),
      pid: process.pid,
      host: hostname(),
      startedAt: new Date().toISOString(),
    };
    writeFileSync(this.fd, JSON.stringify(this.owner));
    fsyncSync(this.fd);
  }
  release() {
    if (this.fd == null) return;
    closeSync(this.fd);
    this.fd = null;
    unlinkSync(join(this.root, "writer.lock"));
  }
  body(text, contentType) {
    if (this.fd == null) throw new Error("Evidence writer lock required");
    const clean = sanitizeBody(text, contentType),
      sha256 = hash(clean),
      path = join(this.root, "bodies", `${sha256}.txt`);
    if (!existsSync(path)) {
      const fd = openSync(path, "w", 0o600);
      try {
        writeFileSync(fd, clean);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    return {
      sha256,
      path: `bodies/${sha256}.txt`,
      bytes: Buffer.byteLength(clean),
      redactorVersion: 1,
    };
  }
  append(event) {
    if (this.fd == null) throw new Error("Evidence writer lock required");
    const row = redact({
      schemaVersion: 1,
      eventId: randomUUID(),
      at: new Date().toISOString(),
      ...event,
    });
    const fd = openSync(this.eventsPath, "a", 0o600);
    try {
      appendFileSync(fd, JSON.stringify(row) + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    this.cachedEvents?.push(row);
    this.save("heartbeat.json", {
      ...this.owner,
      at: row.at,
      lastEventId: row.eventId,
    });
    return row;
  }
  save(name, value) {
    if (this.fd == null) throw new Error("Evidence writer lock required");
    if (!/^[a-zA-Z0-9_.-]+\.json$/.test(name))
      throw new Error("Invalid checkpoint name");
    const path = join(this.root, name),
      temp = `${path}.${process.pid}.tmp`;
    const fd = openSync(temp, "w", 0o600);
    try {
      writeFileSync(
        fd,
        JSON.stringify(
          value,
          null,
          ["manifest.json", "progress.json"].includes(name) ? 0 : 2,
        ) + "\n",
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  }
  events({ repairTail = false, cached = false } = {}) {
    if (cached && this.cachedEvents) return this.cachedEvents;
    if (!existsSync(this.eventsPath)) return [];
    const text = readFileSync(this.eventsPath, "utf8"),
      cut = text.lastIndexOf("\n") + 1;
    if (cut < text.length) {
      if (!repairTail || this.fd == null)
        throw new Error(
          "Incomplete event tail; acquire writer lock and recover",
        );
      writeFileSync(
        join(this.root, `interrupted-tail-${Date.now()}.txt`),
        text.slice(cut),
        { mode: 0o600 },
      );
      writeFileSync(this.eventsPath, text.slice(0, cut));
    }
    this.cachedEvents = text
      .slice(0, cut)
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return this.cachedEvents;
  }
  validate() {
    const rows = this.events();
    const ids = new Set();
    const checkedBodies = new Set();
    for (const row of rows) {
      if (ids.has(row.eventId)) throw new Error("Duplicate event ID");
      ids.add(row.eventId);
      if (
        row.type === "book_accepted" &&
        (!row.evidence?.length ||
          !row.book?.recordId ||
          !row.book?.title ||
          row.reason !== "identity_membership_relevance_and_book_proved")
      )
        throw new Error("Incomplete accepted-book evidence");
      for (const ref of row.evidence || []) {
        if (
          ref.path !== `bodies/${ref.sha256}.txt` ||
          !/^[a-f0-9]{64}$/.test(ref.sha256)
        )
          throw new Error("Missing or mismatched evidence");
        if (!checkedBodies.has(ref.sha256)) {
          if (
            hash(readFileSync(join(this.root, ref.path), "utf8")) !== ref.sha256
          )
            throw new Error("Missing or mismatched evidence");
          checkedBodies.add(ref.sha256);
        }
      }
    }
    return { events: rows.length, valid: true };
  }
}
