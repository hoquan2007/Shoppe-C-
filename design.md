# Shoppe frontend direction

User direction: “Cam ấm, cửa hàng tuyển chọn, chuyển động tinh tế”.

The site is a Vietnamese marketplace. Lead with real catalog products and their existing names, prices, availability and shop links. Keep every existing route, form, data attribute and checkout/session/cart invariant. The user requested removal of demo captions from product images/cards on 2026-10-28; these captions are removed. Catalog and payment disclosures remain in product information. Do not invent social proof, sales counts or discounts.

The visual direction is a specimen catalogue: generous flat fields, a varied product composition in the hero, readable item names and warm orange actions. The useful interaction is browsing/searching/filtering real products. Public pages can be expressive; cart, checkout and workspaces stay quiet and legible.

Use the semantic tokens in frontend/tokens.css. One self-hosted variable family with Vietnamese coverage, Manrope, replaces the system stack. Functional text stays readable and controls retain visible focus. Desktop and phone have separate hero compositions. Containers are capped; html/body clip only accidental horizontal overflow, while deliberate rails can scroll.

Motion uses opacity and transforms only. GSAP loads dynamically after the route commits; it never delays API reads, session restoration, checkout quotes or enabling an action. Kill/revert all route animations on navigation. Use one bounded hero depth scene, one-shot grouped reveals, photo hover and press feedback. Native scrolling only: no scroll hijack, pinned empty spans, autoplay video, perpetual loops or WebGL at startup. Respect reduced-motion, Save-Data and coarse pointers.

Three.js skills are installed for future appropriate 3D work; the current catalog has photos rather than 3D assets, so this redesign does not ship a renderer solely as decoration.

## Infinite Spiral — 2026-10-28
User replaces the four-photo hero composition with a looping image helix. Preserve warm orange copy/actions and real catalog links. Adapt supplied React reference to optional vanilla motion; eight bounded cards, transforms/opacity, no dynamic blur or added renderer. Pause on hover/focus, explicit pause, offscreen/hidden suspension, reduced-motion/save-data static fallback, cleanup on route exit. Configure speed, depth, spacing, cards-per-turn and perspective through hero data attributes; no technical tuning panel in the storefront.
