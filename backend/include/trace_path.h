#pragma once
#include <set>
#include <string>
#include <string_view>

namespace shoppe {
// Static route vocabulary only. Never put IDs, search values or credentials in logs.
inline std::string tracePath(std::string_view path) {
    static const std::set<std::string_view> words = {
        "api", "home", "products", "shops", "meta", "auth", "me", "login", "logout",
        "register", "forgot", "reset", "verify", "google", "challenge", "account",
        "addresses", "cart", "checkout", "context", "quote", "payments", "cancel",
        "orders", "reviews", "returns", "wishlist", "seller", "admin", "dashboard",
        "settings", "catalog", "import", "export", "users", "conversations", "messages",
        "notifications", "outbox", "retry", "audit", "storage", "images", "live", "health",
        "jobs", "maintenance", "vouchers", "variants", "status", "items", "read"};
    path = path.substr(0, path.find('?'));
    std::string result;
    for (std::size_t start = 0; start < path.size();) {
        if (path[start] == '/') { result += '/'; ++start; continue; }
        auto end = path.find('/', start);
        if (end == std::string_view::npos) end = path.size();
        auto part = path.substr(start, end - start);
        result += words.contains(part) ? std::string(part) : ":id";
        start = end;
    }
    return result;
}
} // namespace shoppe
