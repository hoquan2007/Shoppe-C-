// Adapted from the supplied InfiniteSpiral reference for this vanilla frontend.
// Only transforms/opacity change per frame; geometry is read on resize, never in the loop.
export function mountSpiral(root) {
  if (!root) return () => {};
  const cards = [...root.querySelectorAll('.spiral-card')];
  if (cards.length < 2) return () => {};
  const control = root.querySelector('.spiral-toggle');
  const number = (key, fallback, min, max) => Math.max(min, Math.min(max, Number(root.dataset[key]) || fallback));
  const speed = number('speed', .32, .05, 2);
  const spacing = number('spacing', 66, 36, 120);
  const turns = number('cardsPerTurn', 6, 3, 12);
  const depth = number('depth', 140, 40, 250);
  const perspective = number('perspective', 1000, 600, 2000);
  let progress = 0, frame = 0, previous = 0, width = 0, height = 0;
  let visible = true, hover = false, focused = false, paused = false, disposed = false;
  const mod = (n, d) => ((n % d) + d) % d;
  const draw = () => {
    const fit = Math.min(1, width / 470, height / 470);
    const radius = Math.min(depth, width * .28) * fit;
    const half = cards.length / 2;
    cards.forEach((card, index) => {
      const offset = mod(index - progress + half, cards.length) - half;
      const angle = offset * Math.PI * 2 / turns;
      const z = Math.cos(angle) * radius;
      const scale = (1 + .12 * (1 - Math.min(Math.abs(offset) / 2, 1))) * fit * perspective / (perspective - z);
      const edge = Math.abs(offset) / half;
      const fade = Math.min(1, Math.max(0, (1 - edge) / .28));
      card.style.transform = `translate(-50%,-50%) translate3d(${Math.sin(angle) * radius}px,${offset * spacing * fit}px,0) scale(${scale})`;
      card.style.opacity = String(fade * (.65 + .35 * (z / radius + 1) / 2));
      card.style.zIndex = String(Math.round(z + radius));
      card.style.pointerEvents = fade > .25 ? '' : 'none';
    });
  };
  const running = () => !disposed && visible && !document.hidden && !hover && !focused && !paused;
  const tick = time => {
    frame = 0;
    if (!running()) return;
    progress = mod(progress + Math.min((time - previous) / 1000, .05) * speed, cards.length);
    previous = time;
    draw();
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (running()) { previous = performance.now(); frame = requestAnimationFrame(tick); }
  };
  const enter = event => { if (event.pointerType === 'mouse') { hover = true; sync(); } };
  const leave = () => { hover = false; sync(); };
  const focus = event => {
    const index = cards.indexOf(event.target.closest('.spiral-card'));
    focused = index >= 0;
    if (index >= 0) { progress = index; draw(); }
    sync();
  };
  const blur = event => { if (!root.contains(event.relatedTarget)) { focused = false; sync(); } };
  const toggle = () => {
    paused = !paused;
    control.setAttribute('aria-pressed', String(paused));
    control.textContent = paused ? 'Tiếp tục chuyển động' : 'Tạm dừng chuyển động';
    sync();
  };
  const resize = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width; height = entry.contentRect.height;
    draw();
  });
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  root.classList.add('is-spiraling');
  root.style.setProperty('--spiral-perspective', `${perspective}px`);
  resize.observe(root.querySelector('.spiral-stage'));
  intersection.observe(root);
  root.addEventListener('pointerenter', enter);
  root.addEventListener('pointerleave', leave);
  root.addEventListener('focusin', focus);
  root.addEventListener('focusout', blur);
  document.addEventListener('visibilitychange', sync);
  control.addEventListener('click', toggle);
  sync();
  return () => {
    disposed = true; sync(); resize.disconnect(); intersection.disconnect();
    root.removeEventListener('pointerenter', enter); root.removeEventListener('pointerleave', leave);
    root.removeEventListener('focusin', focus); root.removeEventListener('focusout', blur);
    document.removeEventListener('visibilitychange', sync); control.removeEventListener('click', toggle);
    root.classList.remove('is-spiraling'); root.style.removeProperty('--spiral-perspective');
    cards.forEach(card => card.removeAttribute('style'));
    control.setAttribute('aria-pressed', 'false'); control.textContent = 'Tạm dừng chuyển động';
  };
}
