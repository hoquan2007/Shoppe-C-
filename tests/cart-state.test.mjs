import test from "node:test";
import assert from "node:assert/strict";
import {
  createCartWriter,
  waitForCartWrites,
  readSettledCart,
  createCartBootstrap,
} from "../frontend/cart-state.js";

const initial = () => ({
  cart: { items: [{ variant_id: "v", quantity: 1, selected: true }] },
  lines: [
    { variant_id: "v", quantity: 1, selected: true, variant: { price: 1000 } },
  ],
});
const saved = (items) => ({
  ...initial(),
  cart: { items },
  lines: items.map((item) => ({ ...initial().lines[0], ...item })),
});
const increment = (items) => {
  items[0].quantity++;
  return items;
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("private bootstrap is one-use, cloned, identity/route scoped and expires", () => {
  let time = 100;
  const seed = createCartBootstrap({ now: () => time });
  const data = initial();
  seed.save(data, "buyer-a:/checkout:revision-1");
  data.cart.items[0].quantity = 99;
  assert.equal(seed.take("buyer-a:/checkout:revision-1").cart.items[0].quantity, 1);
  assert.equal(seed.take("buyer-a:/checkout:revision-1"), null);
  for (const wrong of ["buyer-b:/checkout:revision-1", "buyer-a:/cart:revision-1", "buyer-a:/checkout:revision-2"]) {
    seed.save(initial(), "buyer-a:/checkout:revision-1");
    assert.equal(seed.take(wrong), null);
    assert.equal(seed.take("buyer-a:/checkout:revision-1"), null);
  }
  seed.save(initial(), "same");
  time += 1000;
  assert.equal(seed.take("same"), null);
  seed.save(initial(), "same");
  const version = seed.version();
  seed.invalidate();
  assert.notEqual(seed.version(), version);
  assert.equal(seed.take("same"), null);
});

test("a conflict rebases only pending intent and preserves another tab's added item", async () => {
  const remote = { variant_id: "remote", quantity: 2, selected: true };
  const latest = saved([
    { variant_id: "v", quantity: 5, selected: true },
    remote,
  ]);
  latest.cart.revision = 9;
  let releaseLoad;
  const writes = [],
    frames = [];
  const writer = createCartWriter({
    snapshot: initial,
    load: () => new Promise((resolve) => (releaseLoad = () => resolve(latest))),
    change: (value) => frames.push(value),
    write: async (items, revision) => {
      writes.push({ items, revision });
      if (writes.length === 1)
        throw Object.assign(new Error("conflict"), { code: "cart_conflict" });
      const result = saved(items);
      result.cart.revision = revision + 1;
      return result;
    },
  });
  const first = writer.update(increment);
  await tick();
  const second = writer.update(increment),
    third = writer.update(increment);
  releaseLoad();
  await Promise.all([first, second, third]);
  assert.equal(writes[1].revision, 9);
  assert.equal(writes[1].items[0].quantity, 6);
  assert.equal(writes[2].revision, 10);
  assert.equal(frames.at(-1).cart.items[0].quantity, 8);
  assert.deepEqual(frames.at(-1).cart.items[1], remote);
});

test("persistent cart conflicts stop after three attempts without overwriting remote data", async () => {
  let writes = 0;
  const frames = [];
  const writer = createCartWriter({
    snapshot: initial,
    load: async () => saved([{ variant_id: "v", quantity: 7, selected: true }]),
    change: (value) => frames.push(value),
    write: async () => {
      writes++;
      throw Object.assign(new Error("conflict"), { code: "cart_conflict" });
    },
  });
  await assert.rejects(writer.update(increment), { code: "cart_conflict" });
  assert.equal(writes, 3);
  assert.equal(frames.at(-1).cart.items[0].quantity, 7);
});

test("checkout waits for the final coalesced cart write before reading its quote", async () => {
  let pending = null,
    persisted = 1,
    quoted = null;
  const deliveries = [];
  const cart = createCartWriter({
    snapshot: initial,
    change: () => {},
    write: (items) =>
      new Promise((resolve) =>
        deliveries.push(() => {
          persisted = items[0].quantity;
          resolve(saved(items));
        }),
      ),
  });
  const update = () => {
    const done = cart.update(increment);
    pending = done;
    void done.finally(() => {
      if (pending === done) pending = null;
    });
    return done;
  };
  const first = update();
  await tick();
  const second = update(),
    third = update();
  const checkout = waitForCartWrites(() => pending).then(
    () => (quoted = persisted),
  );
  deliveries.shift()();
  await first;
  assert.equal(persisted, 2);
  assert.equal(quoted, null, "checkout cannot quote the intermediate quantity");
  await tick();
  deliveries.shift()();
  await Promise.all([second, third, checkout]);
  assert.equal(quoted, 4);
});

test("checkout is stopped when saving the latest cart fails", async () => {
  const failure = Promise.reject(new Error("cart save failed"));
  await assert.rejects(
    waitForCartWrites(() => failure),
    /cart save failed/,
  );
});

test("a cart edit during the checkout read is saved and re-read before quoting", async () => {
  let revision = 0,
    finishRead,
    reads = 0,
    current = true;
  const checkout = readSettledCart({
    pending: () => null,
    revision: () => revision,
    current: () => current,
    load: async () => {
      reads++;
      return reads === 1
        ? new Promise((resolve) => (finishRead = resolve))
        : { quantity: 4 };
    },
  });
  await tick();
  revision++;
  finishRead({ quantity: 1 });
  assert.deepEqual(await checkout, { quantity: 4 });
  assert.equal(reads, 2);
  current = false;
  assert.equal(
    await readSettledCart({
      pending: () => null,
      revision: () => 0,
      load: () => assert.fail("left route"),
      current: () => current,
    }),
    null,
  );
});

test("rapid cart clicks render immediately and coalesce into one server write", async () => {
  const frames = [],
    writes = [];
  const cart = createCartWriter({
    snapshot: initial,
    change: (result) => frames.push(result),
    write: async (items) => {
      writes.push(items);
      return saved(items);
    },
  });
  const first = cart.update(increment),
    second = cart.update(increment),
    third = cart.update(increment);
  assert.equal(frames.at(-1).cart.items[0].quantity, 4);
  assert.equal(writes.length, 0);
  await Promise.all([first, second, third]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].quantity, 4);
});
test("an older response never overwrites newer cart intent; only one write runs at a time", async () => {
  const frames = [],
    writes = [],
    release = [];
  const cart = createCartWriter({
    snapshot: initial,
    change: (result) => frames.push(result),
    write: (items) => {
      writes.push(items);
      return new Promise((resolve) =>
        release.push(() => resolve(saved(items))),
      );
    },
  });
  const first = cart.update(increment);
  await tick();
  const second = cart.update(increment),
    third = cart.update(increment);
  assert.equal(writes.length, 1);
  assert.equal(frames.at(-1).cart.items[0].quantity, 4);
  release[0]();
  await first;
  await tick();
  assert.equal(frames.at(-1).cart.items[0].quantity, 4);
  assert.equal(writes.length, 2);
  assert.equal(writes[1][0].quantity, 4);
  release[1]();
  await Promise.all([second, third]);
});
test("failed writes restore the last confirmed cart and reject queued intent", async () => {
  const frames = [];
  let rejectWrite;
  const cart = createCartWriter({
    snapshot: initial,
    change: (result, options) => frames.push({ result, options }),
    write: () => new Promise((_resolve, reject) => (rejectWrite = reject)),
  });
  const first = cart.update(increment);
  await tick();
  const second = cart.update(increment);
  const failed = Promise.allSettled([first, second]);
  rejectWrite(new Error("offline"));
  assert.deepEqual(
    (await failed).map((item) => item.status),
    ["rejected", "rejected"],
  );
  assert.equal(frames.at(-1).result.cart.items[0].quantity, 1);
  assert.equal(frames.at(-1).options.rollback, true);
});
test("removing a cart line updates both items and rendered lines before the response", async () => {
  const frames = [];
  let complete;
  const cart = createCartWriter({
    snapshot: initial,
    change: (result) => frames.push(result),
    write: (items) =>
      new Promise((resolve) => (complete = () => resolve(saved(items)))),
  });
  const removed = cart.update(() => []);
  assert.equal(frames.at(-1).cart.items.length, 0);
  assert.equal(frames.at(-1).lines.length, 0);
  await tick();
  complete();
  await removed;
});
