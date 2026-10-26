import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleSession } from "../frontend/google-session.js";

test("concurrent mounts initialize once and route callbacks use the current mount", async () => {
  let release,
    requests = 0,
    initialized = 0,
    config;
  const session = createGoogleSession({
    challenge: () => {
      requests++;
      return new Promise((r) => (release = r));
    },
    initialize: (c) => {
      initialized++;
      config = c;
    },
  });
  const calls = [];
  const a = session.ready("anonymous", () => calls.push("old"));
  const b = session.ready("anonymous", () => calls.push("current"));
  release({ client_id: "fixture", nonce: "single-use" });
  await Promise.all([a, b]);
  assert.equal(requests, 1);
  assert.equal(initialized, 1);
  config.callback({ credential: "test" });
  assert.deepEqual(calls, ["current"]);
  session.detach();
  config.callback({ credential: "test" });
  assert.equal(calls.length, 1);
});

test("changed login session cannot reuse the initialized anonymous nonce", async () => {
  let initialized = 0;
  const session = createGoogleSession({
    challenge: async () => ({ nonce: "n" }),
    initialize: () => initialized++,
  });
  await session.ready("anonymous", () => {});
  await assert.rejects(
    session.ready("user:session-2", () => {}),
    { code: "google_document_restart" },
  );
  assert.throws(() => session.consume("user:session-2"), {
    code: "google_document_restart",
  });
  assert.equal(initialized, 1);
});

test("used and expired challenges require a fresh document, never a second SDK initialization", async () => {
  let now = 0,
    initialized = 0;
  const make = () =>
    createGoogleSession({
      challenge: async () => ({ nonce: "n" }),
      initialize: () => initialized++,
      now: () => now,
    });
  const used = make();
  await used.ready("u", () => {});
  used.consume("u");
  assert.throws(() => used.consume("u"), { code: "google_document_restart" });
  await assert.rejects(
    used.ready("u", () => {}),
    { code: "google_document_restart" },
  );
  const expired = make();
  await expired.ready("u", () => {});
  now = 540001;
  await assert.rejects(
    expired.ready("u", () => {}),
    { code: "google_document_restart" },
  );
  assert.equal(initialized, 2);
});

test("challenge network failure can retry before SDK initialization", async () => {
  let calls = 0,
    initialized = 0;
  const session = createGoogleSession({
    challenge: async () => {
      if (!calls++) throw new Error("offline");
      return { nonce: "n" };
    },
    initialize: () => initialized++,
  });
  await assert.rejects(
    session.ready("u", () => {}),
    /offline/,
  );
  await session.ready("u", () => {});
  assert.equal(initialized, 1);
});
