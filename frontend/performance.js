import { onCLS, onINP, onLCP } from "web-vitals";

// Keep only the latest local measurement. No analytics endpoint, cookies, or user data.
const debug = new URLSearchParams(location.search).has("debug-perf");
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
            route: path
              .split("/")
              .slice(0, 4)
              .map((segment) =>
                /^[a-f0-9]{16,}$/.test(segment) ? ":id" : segment,
              )
              .join("/"),
            duration: entry.duration,
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
