import { onCLS, onINP, onLCP } from "web-vitals";

// Keep only the latest local measurement. No analytics endpoint, cookies, or user data.
const debug = new URLSearchParams(location.search).has("debug-perf");
const routeParts = new Set(
  "api home search product products shop shops meta auth me login register logout forgot reset verify google challenge account addresses cart checkout context quote payments cancel orders reviews returns wishlist seller admin dashboard settings catalog import export users conversations messages notifications outbox retry audit storage images live health".split(
    " ",
  ),
);
function safePath(path) {
  return path
    .split("?")[0]
    .split("/")
    .map((part) => (!part || routeParts.has(part) ? part : ":id"))
    .join("/");
}
export function recordApi({ path, ...detail }) {
  if (debug)
    console.info(
      "[shoppe:api] " + JSON.stringify({ route: safePath(path), ...detail }),
    );
}
function record({ name, value, rating, navigationType, attribution }) {
  const detail = { name, value, rating, navigationType };
  const entryName = "shoppe:web-vital:" + name;
  performance.clearMarks(entryName);
  performance.mark(entryName, { detail });
  if (debug) {
    console.info("[shoppe:performance] " + JSON.stringify(detail));
    if (attribution)
      console.info(
        "[shoppe:interaction] " +
          JSON.stringify({
            value,
            target: attribution.interactionTarget,
            inputDelay: attribution.inputDelay,
            processingDuration: attribution.processingDuration,
            presentationDelay: attribution.presentationDelay,
            longFrames: attribution.longAnimationFrameEntries?.map((e) => ({
              duration: e.duration,
              blocking: e.blockingDuration,
            })),
            visibility: document.visibilityState,
          }),
      );
  }
}
onCLS(record, { reportAllChanges: debug });
onLCP(record, { reportAllChanges: debug });
if (debug) {
  void import("web-vitals/attribution")
    .then(({ onINP }) =>
      onINP(record, {
        reportAllChanges: true,
        // Stable control type only: never input values, text, account names, query strings or IDs.
        generateTarget: (node) =>
          node instanceof Element
            ? node.tagName.toLowerCase() +
              (node.getAttribute("data-action")
                ? "[data-action=" + node.getAttribute("data-action") + "]"
                : "")
            : "removed-control",
      }),
    )
    .catch(() => onINP(record, { reportAllChanges: true }));
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const path = new URL(entry.name).pathname;
      if (!path.startsWith("/api/")) continue;
      console.info(
        "[shoppe:request] " +
          JSON.stringify({
            route: safePath(path),
            duration: entry.duration,
            start: entry.startTime,
            dns: entry.domainLookupEnd - entry.domainLookupStart,
            connect: entry.connectEnd - entry.connectStart,
            tls: entry.secureConnectionStart
              ? entry.connectEnd - entry.secureConnectionStart
              : 0,
            waitForHeaders: entry.responseStart - entry.requestStart,
            body: entry.responseEnd - entry.responseStart,
            protocol: entry.nextHopProtocol,
            transferBytes: entry.transferSize,
            encodedBytes: entry.encodedBodySize,
            decodedBytes: entry.decodedBodySize,
            serverTiming: entry.serverTiming?.map(({ name, duration }) => ({
              name,
              duration,
            })),
          }),
      );
    }
  });
  observer.observe({ type: "resource", buffered: true });
}
export function recordRoute(path, duration) {
  if (debug)
    console.info(
      "[shoppe:route] " +
        JSON.stringify({
          route: "/" + (path.split("/")[1] || "home"),
          duration,
        }),
    );
}
