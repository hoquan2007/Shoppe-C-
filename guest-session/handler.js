// This handler cannot authenticate anyone and has no database dependencies.
// Public routing selects it only when the session cookie is absent.
export function guestSession(request) {
  const url = new URL(request.url);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Session-Source": "guest-native",
    "X-Content-Type-Options": "nosniff",
  };
  const error = (status, code, message) => new Response(
    request.method === "HEAD" ? null : JSON.stringify({ error: { code, message } }),
    { status, headers },
  );
  if (url.pathname !== "/api/auth/me") return error(404, "not_found", "Không tìm thấy API.");
  if (!["GET", "HEAD"].includes(request.method)) {
    headers.Allow = "GET, HEAD";
    return error(405, "method_not_allowed", "Phương thức không được hỗ trợ.");
  }
  // Fail closed if platform routing ever sends a cookie holder here.
  // Never silently replace a potentially authenticated session with guest data.
  if (/(?:^|;\s*)shoppe_session\s*=/.test(request.headers.get("cookie") || ""))
    return error(503, "session_routing_mismatch", "Không thể đọc phiên. Vui lòng thử lại.");
  const guest = { user: null, csrf: "", shop: null };
  if (["cart", "cart-view", "checkout"].includes(url.searchParams.get("include")))
    guest.cart_summary = { quantity: 0, revision: 0 };
  return new Response(request.method === "HEAD" ? null : JSON.stringify(guest), { headers });
}
