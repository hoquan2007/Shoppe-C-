// GSI is initialized once per document. Never reuse a nonce across user/session changes.
export function createGoogleSession({ challenge, initialize, now = Date.now }) {
  let session = null;
  let pending = null;
  const restart = () =>
    Object.assign(
      new Error("Phiên Google cần được làm mới. Bạn thử lại nhé."),
      { code: "google_document_restart" },
    );
  return {
    async ready(context, callback) {
      if (pending) await pending;
      if (session) {
        if (
          session.context !== context ||
          session.used ||
          now() >= session.expires
        )
          throw restart();
        session.callback = callback;
        return;
      }
      pending = (async () => {
        const started = now();
        const config = await challenge();
        session = { context, expires: started + 540000, used: false, callback };
        // Mark initialized before calling the SDK: concurrent mounts share this instance.
        try {
          initialize({
            ...config,
            callback: (value) => session.callback?.(value),
          });
        } catch (error) {
          session.used = true;
          throw error;
        }
      })();
      try {
        await pending;
      } finally {
        pending = null;
      }
    },
    consume(context) {
      if (
        !session ||
        session.context !== context ||
        session.used ||
        now() >= session.expires
      )
        throw restart();
      session.used = true;
    },
    detach() {
      if (session) session.callback = null;
    },
  };
}
