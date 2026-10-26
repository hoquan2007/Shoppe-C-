// Let the interaction's visual feedback paint before parsing/replacing a full view.
export function afterPaint() {
  if (document.visibilityState !== "visible") return Promise.resolve();
  return new Promise((resolve) => {
    let frame;
    const done = () => {
      clearTimeout(fallback);
      cancelAnimationFrame(frame);
      resolve();
    };
    const fallback = setTimeout(done, 60);
    frame = requestAnimationFrame(() => setTimeout(done, 0));
  });
}
