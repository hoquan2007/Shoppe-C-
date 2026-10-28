// Checkout must not read an intermediate server cart while newer intent is queued.
// One private first-load snapshot, scoped to identity/route/revisions by the caller.
// Never reusable after consumption, invalidation or a short handoff window.
export function createCartBootstrap({ now = Date.now, maxAgeMs = 1000 } = {}) {
  let saved = null, generation = 0;
  return {
    version: () => generation,
    invalidate() { saved = null; generation++; },
    save(data, key) { saved = { data: structuredClone(data), key, until: now() + maxAgeMs }; },
    take(key) {
      const value = saved;
      saved = null;
      return value && value.key === key && value.until > now() ? value.data : null;
    },
  };
}

export async function waitForCartWrites(readPending) {
  while (true) {
    const pending = readPending();
    if (!pending) return;
    await pending;
  }
}

export async function readSettledCart({ pending, revision, load, current }) {
  while (current()) {
    await waitForCartWrites(pending);
    if (!current()) return null;
    const before = revision();
    const cart = await load();
    if (!current()) return null;
    if (before === revision()) return cart;
    // The previous cart view can still be visible while this request is loading.
    // A click during that read must be saved and read again before quoting.
  }
  return null;
}

// One in-flight cart write; newer intent remains visible until its own server acknowledgement.
export function createCartWriter({ snapshot, write, load, change }) {
  let confirmed = null,
    flight = false,
    pending = [];
  const apply = (operations) =>
    operations.reduce(
      (items, operation) => operation.update(structuredClone(items)),
      structuredClone(confirmed.cart.items),
    );
  function optimistic() {
    const draft = apply(pending);
    const byId = new Map(draft.map((item) => [item.variant_id, item]));
    return {
      ...confirmed,
      cart: { ...confirmed.cart, items: structuredClone(draft) },
      lines: confirmed.lines
        .filter((line) => byId.has(line.variant_id))
        .map((line) => ({ ...line, ...byId.get(line.variant_id) })),
    };
  }
  async function flush() {
    if (flight || !pending.length) return;
    flight = true;
    const batch = pending.slice();
    let rebased = false;
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          confirmed = await write(apply(batch), confirmed.cart.revision || 0);
          break;
        } catch (error) {
          if (error.code !== "cart_conflict" || !load || attempt >= 2)
            throw error;
          confirmed = await load();
          rebased = true;
          change(optimistic(), { rebase: true });
        }
      }
      pending.splice(0, batch.length);
      change(pending.length ? optimistic() : confirmed, {
        rebase: rebased,
        committed: true,
      });
      batch.forEach(({ resolve }) => resolve(confirmed));
    } catch (error) {
      const failed = pending.splice(0);
      change(confirmed, { rollback: true });
      failed.forEach(({ reject }) => reject(error));
    } finally {
      flight = false;
      if (pending.length) queueMicrotask(flush);
    }
  }
  return {
    update(update) {
      if (!flight && !pending.length) confirmed = structuredClone(snapshot());
      const done = new Promise((resolve, reject) =>
        pending.push({ update, resolve, reject }),
      );
      change(optimistic());
      queueMicrotask(flush);
      return done;
    },
  };
}
