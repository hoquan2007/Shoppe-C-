import { mountSpiral } from "./spiral.js";
import { gsap } from "gsap";


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
    }
    const stopSpiral = mountSpiral(root.querySelector(".infinite-spiral"));
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

    return () => {
      active = false;
      observer.disconnect();
      stopSpiral();
    };
  }, root);
  return () => media.revert();
}
