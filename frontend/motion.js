import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ syncInterval: 0, ignoreMobileResize: true });

// Optional enhancement. Content is fully visible before this chunk loads.
export function mountMotion(root) {
  if (!root?.isConnected) return () => {};
  const media = gsap.matchMedia();
  media.add({
    motion: "(prefers-reduced-motion: no-preference)",
    desktop: "(min-width: 900px) and (hover: hover) and (pointer: fine)",
  }, context => {
    if (!context.conditions.motion) return;
    const hero = root.querySelector(".market-lead");
    if (hero) {
      gsap.from(hero.querySelectorAll(".market-copy > *"), {
        y: 16, opacity: .8, duration: .65, stagger: .07,
        ease: "power2.out", clearProps: "transform,opacity",
      });
      gsap.from(hero.querySelectorAll(".stage-tile"), {
        y: 20, duration: .85, stagger: .065,
        ease: "power2.out", clearProps: "transform",
      });
    }
    let active = true;
    context.add("reveal", visible => gsap.from(visible, {
      y: 18, opacity: .78, duration: .55, stagger: .045,
      ease: "power2.out", clearProps: "transform,opacity",
    }));
    const observer = new IntersectionObserver(entries => {
      if (!active) return;
      const visible = entries.filter(entry => entry.isIntersecting).map(entry => entry.target);
      visible.forEach(element => observer.unobserve(element));
      if (visible.length) context.reveal(visible);
    }, { threshold: .1, rootMargin: "0px 0px -24px 0px" });
    root.querySelectorAll(".section-head, .product-card, .market-promo, .benefit, .newsletter")
      .forEach(element => observer.observe(element));

    let pointer, leave;
    if (hero && context.conditions.desktop) {
      const planes = [...hero.querySelectorAll(".stage-plane")];
      const depth = gsap.timeline({ scrollTrigger: {
        trigger: hero, start: "top top", end: "bottom top", scrub: .7,
        invalidateOnRefresh: true,
      } });
      planes.forEach((plane, index) => depth.to(plane, {
        y: [24, -14, 16, -20][index % 4], ease: "none",
      }, 0));
      const art = hero.querySelector(".stage-art");
      if (art) {
        const x = gsap.quickTo(art, "x", { duration: .6, ease: "power2.out" });
        const y = gsap.quickTo(art, "y", { duration: .6, ease: "power2.out" });
        pointer = event => {
          const rect = hero.getBoundingClientRect();
          x(((event.clientX - rect.left) / rect.width - .5) * 12);
          y(((event.clientY - rect.top) / rect.height - .5) * 10);
        };
        leave = () => { x(0); y(0); };
        hero.addEventListener("pointermove", pointer, { passive: true });
        hero.addEventListener("pointerleave", leave);
      }
    }
    return () => {
      active = false;
      observer.disconnect();
      if (pointer) hero.removeEventListener("pointermove", pointer);
      if (leave) hero.removeEventListener("pointerleave", leave);
    };
  }, root);
  return () => media.revert();
}
