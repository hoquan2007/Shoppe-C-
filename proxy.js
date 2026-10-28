import { next } from "@vercel/functions";

// Only the absence of a session cookie can be decided without the backend.
// Any cookie bearing this name (including malformed/expired ones) goes through
// the existing verifier. This layer never authenticates a user.
export default function proxy(request) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/auth/me" ||
      !["GET", "HEAD"].includes(request.method) ||
      /(?:^|;\s*)shoppe_session\s*=/.test(request.headers.get("cookie") || ""))
    return next();
  const guest = { user: null, csrf: "", shop: null };
  if (["cart", "cart-view", "checkout"].includes(url.searchParams.get("include")))
    guest.cart_summary = { quantity: 0, revision: 0 };
  return new Response(request.method === "HEAD" ? null : JSON.stringify(guest), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Session-Source": "guest-routing",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
