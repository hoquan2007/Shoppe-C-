#include "application.h"
#include "request_log.h"
#include "trace_path.h"
#include "catalog.h"
#include "catalog_query.h"
#include "domain.h"
#include "payments.h"
#include "read_models.h"
#include "security.h"
#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <numeric>
#include <openssl/evp.h>
#include <regex>
#include <set>
#include <sstream>
#include <syncstream>

namespace shoppe {
namespace {
// Explicit method contract shared by every C++ API handler. Exact paths precede IDs.
void validateMethod(const httplib::Request &req, httplib::Response &res) {
    static const std::vector<std::pair<std::regex, std::string>> rules = {
        {std::regex(R"(^/api/health$)"), "GET"},
        {std::regex(R"(^/api/live$)"), "GET"},
        {std::regex(R"(^/api/meta$)"), "GET"},
        {std::regex(R"(^/api/home$)"), "GET"},
        {std::regex(R"(^/api/products$)"), "GET"},
        {std::regex(R"(^/api/vouchers$)"), "GET, POST"},
        {std::regex(R"(^/api/auth/me$)"), "GET"},
        {std::regex(R"(^/api/auth/register$)"), "POST"},
        {std::regex(R"(^/api/auth/login$)"), "POST"},
        {std::regex(R"(^/api/auth/google/challenge$)"), "POST"},
        {std::regex(R"(^/api/auth/google$)"), "POST"},
        {std::regex(R"(^/api/auth/logout$)"), "POST"},
        {std::regex(R"(^/api/auth/forgot$)"), "POST"},
        {std::regex(R"(^/api/auth/resend$)"), "POST"},
        {std::regex(R"(^/api/auth/reset$)"), "POST"},
        {std::regex(R"(^/api/auth/verify$)"), "POST"},
        {std::regex(R"(^/api/account$)"), "PATCH"},
        {std::regex(R"(^/api/addresses$)"), "GET, POST"},
        {std::regex(R"(^/api/cart$)"), "GET, PUT"},
        {std::regex(R"(^/api/wishlist$)"), "GET"},
        {std::regex(R"(^/api/shops/apply$)"), "POST"},
        {std::regex(R"(^/api/shops/mine$)"), "PATCH"},
        {std::regex(R"(^/api/seller/products$)"), "GET, POST"},
        {std::regex(R"(^/api/seller/import$)"), "POST"},
        {std::regex(R"(^/api/seller/export$)"), "GET"},
        {std::regex(R"(^/api/checkout/quote$)"), "POST"},
        {std::regex(R"(^/api/checkout/context$)"), "GET"},
        {std::regex(R"(^/api/checkout$)"), "POST"},
        {std::regex(R"(^/api/payments/webhook$)"), "POST"},
        {std::regex(R"(^/api/orders$)"), "GET"},
        {std::regex(R"(^/api/seller/orders$)"), "GET"},
        {std::regex(R"(^/api/admin/orders$)"), "GET"},
        {std::regex(R"(^/api/admin/refunds$)"), "POST"},
        {std::regex(R"(^/api/reviews$)"), "POST"},
        {std::regex(R"(^/api/conversations$)"), "GET, POST"},
        {std::regex(R"(^/api/notifications$)"), "GET, POST"},
        {std::regex(R"(^/api/dashboard$)"), "GET"},
        {std::regex(R"(^/api/admin/export$)"), "GET"},
        {std::regex(R"(^/api/admin/products$)"), "GET, POST"},
        {std::regex(R"(^/api/admin/shops$)"), "GET"},
        {std::regex(R"(^/api/admin/users$)"), "GET"},
        {std::regex(R"(^/api/admin/catalog/import$)"), "POST"},
        {std::regex(R"(^/api/admin/catalog/status$)"), "GET"},
        {std::regex(R"(^/api/admin/catalog/preview$)"), "POST"},
        {std::regex(R"(^/api/admin/catalog/commit$)"), "POST"},
        {std::regex(R"(^/api/admin/payments$)"), "GET"},
        {std::regex(R"(^/api/admin/reviews$)"), "GET"},
        {std::regex(R"(^/api/admin/outbox$)"), "GET"},
        {std::regex(R"(^/api/admin/outbox/retry$)"), "POST"},
        {std::regex(R"(^/api/admin/audit$)"), "GET"},
        {std::regex(R"(^/api/admin/settings$)"), "GET, POST"},
        {std::regex(R"(^/api/storage/images$)"), "POST"},
        {std::regex(R"(^/api/jobs/maintenance$)"), "GET"},
        {std::regex(R"(^/api/products/[^/]+$)"), "GET"},
        {std::regex(R"(^/api/shops/[^/]+$)"), "GET"},
        {std::regex(R"(^/api/addresses/[^/]+$)"), "DELETE"},
        {std::regex(R"(^/api/wishlist/[^/]+$)"), "POST, DELETE"},
        {std::regex(R"(^/api/seller/products/[^/]+$)"), "PUT, DELETE"},
        {std::regex(R"(^/api/vouchers/[^/]+$)"), "DELETE"},
        {std::regex(R"(^/api/payments/[^/]+$)"), "GET"},
        {std::regex(R"(^/api/payments/[^/]+/sync$)"), "POST"},
        {std::regex(R"(^/api/payments/[^/]+/cancel$)"), "POST"},
        {std::regex(R"(^/api/orders/[^/]+$)"), "GET"},
        {std::regex(R"(^/api/orders/[^/]+/status$)"), "POST"},
        {std::regex(R"(^/api/orders/[^/]+/collect$)"), "POST"},
        {std::regex(R"(^/api/orders/[^/]+/return$)"), "POST"},
        {std::regex(R"(^/api/returns/[^/]+$)"), "POST"},
        {std::regex(R"(^/api/conversations/[^/]+/messages$)"), "GET, POST"},
        {std::regex(R"(^/api/admin/products/[^/]+$)"), "PUT, POST"},
        {std::regex(R"(^/api/admin/shops/[^/]+$)"), "POST"},
        {std::regex(R"(^/api/admin/users/[^/]+$)"), "POST"},
        {std::regex(R"(^/api/admin/payments/[^/]+/refund$)"), "POST"},
        {std::regex(R"(^/api/admin/reviews/[^/]+$)"), "POST"},
    };
    auto method = req.method == "HEAD" ? "GET" : req.method;
    for (const auto &[pattern, allowed] : rules) {
        if (!std::regex_match(req.path, pattern))
            continue;
        std::string allow = allowed;
        if (allowed.find("GET") != std::string::npos)
            allow += ", HEAD";
        if ((", " + allowed + ", ").find(", " + method + ", ") == std::string::npos) {
            res.set_header("Allow", allow);
            throw Error(405, "method_not_allowed", "Phương thức không được hỗ trợ.");
        }
        return;
    }
    throw Error(404, "not_found", "Không tìm thấy API.");
}
std::string sid(const httplib::Request &req) {
    auto cookie = req.get_header_value("Cookie");
    std::regex re(R"((?:^|;\s*)shoppe_session=([a-f0-9]{64})(?:;|$))");
    std::smatch m;
    return std::regex_search(cookie, m, re) ? m[1].str() : "";
}
std::string googleNonce(const httplib::Request &req) {
    auto cookie = req.get_header_value("Cookie");
    std::smatch m;
    const std::regex re(R"((?:^|;\s*)shoppe_google_login=([a-f0-9]{64})(?:;|$))");
    return std::regex_search(cookie, m, re) ? m[1].str() : "";
}
std::vector<std::string> segments(std::string path) {
    std::vector<std::string> out;
    std::stringstream s(path);
    std::string p;
    while (std::getline(s, p, '/'))
        if (!p.empty())
            out.push_back(p);
    return out;
}
Json required(Json j) {
    if (j.is_null())
        throw Error(404, "not_found", "Không tìm thấy dữ liệu.");
    return j;
}
bool admin(const Json &u) {
    return !u.is_null() && u.value("role", "") == "admin";
}
void loginRequired(const Json &u) {
    if (u.is_null())
        throw Error(401, "unauthenticated", "Vui lòng đăng nhập.");
}
void adminRequired(const Json &u) {
    loginRequired(u);
    if (!admin(u))
        throw Error(403, "forbidden", "Bạn không có quyền quản trị.");
}
Json safeUser(Json u) {
    if (u.is_null())
        return u;
    u.erase("password_hash");
    return u;
}
Json userShop(Repository &r, const Json &u) {
    loginRequired(u);
    return r.one("shops", "owner_id = ?", {u.at("id")});
}
Json manageShop(Repository &r, const Json &u, const std::string &id) {
    loginRequired(u);
    auto shop = required(r.get("shops", id));
    if (!admin(u) && shop["owner_id"] != u["id"])
        throw Error(403, "forbidden", "Shop không thuộc quyền quản lý của bạn.");
    return shop;
}
void activeUser(const Json &u) {
    if (!u.is_null() && !u.value("active", true))
        throw Error(403, "account_locked", "Tài khoản đã bị khóa.");
}
Json productView(Repository &r, Json p) {
    p["variants"] = r.list("variants", "product_id = ?", {p.at("id")});
    p["shop"] = r.get("shops", p.at("shop_id"));
    const auto summary = r.query(
        "SELECT COUNT(*) AS count,COALESCE(AVG(CAST(" + jsonField(r, "t", "rating") +
        " AS REAL)),0) AS rating FROM reviews t WHERE t.product_id=? AND COALESCE(CAST(" +
        jsonField(r, "t", "hidden") + " AS TEXT),'false') NOT IN ('true','1')", {p.at("id")}).front();
    p["rating"] = std::stod(summary.at("rating"));
    p["review_count"] = std::stoll(summary.at("count"));
    return p;
}
Json relatedRows(Repository &r, const std::string &table, const std::string &column, const Json &parents,
                 const std::string &key = "id");
Json productViews(Repository &r, Json products) {
    // Batch related rows: database round trips must not grow with card count.
    std::map<std::string, Json> variants, shops;
    std::map<std::string, std::pair<double, int>> ratings;
    for (auto variant : relatedRows(r, "variants", "product_id", products)) {
        auto id = variant.at("product_id").get<std::string>();
        if (!variants.contains(id))
            variants[id] = Json::array();
        variants[id].push_back(std::move(variant));
    }
    for (auto shop : relatedRows(r, "shops", "id", products, "shop_id")) {
        auto id = shop.at("id").get<std::string>();
        shops.emplace(id, std::move(shop));
    }
    for (const auto &review : relatedRows(r, "reviews", "product_id", products))
        if (!review.value("hidden", false)) {
            auto &rating = ratings[review.at("product_id").get<std::string>()];
            rating.first += review.value("rating", 0);
            ++rating.second;
        }
    for (auto &product : products) {
        auto id = product.at("id").get<std::string>();
        auto shop = product.at("shop_id").get<std::string>();
        product["variants"] = variants.contains(id) ? variants.at(id) : Json::array();
        product["shop"] = shops.contains(shop) ? shops.at(shop) : Json();
        auto [sum, count] = ratings[id];
        product["rating"] = count ? sum / count : 0;
        product["review_count"] = count;
    }
    return products;
}
Json orderView(Repository &r, Json o) {
    o["items"] = r.list("order_items", "order_id = ?", {o.at("id")});
    auto g = required(r.get("checkouts", o.at("checkout_id")));
    o["payment_method"] = g["method"];
    o["payment_status"] =
        g["method"] == "cod" ? o.value("cod_status", "unpaid") : g.value("status", "pending");
    o["return_request"] = r.one("returns", "order_id = ?", {o.at("id")});
    o["refunds"] = r.list("refunds", "order_id = ?", {o.at("id")});
    return o;
}
// Restrict batches to authorized parent rows. Placeholders keep identifiers out of SQL text.
Json relatedRows(Repository &r, const std::string &table, const std::string &column, const Json &parents,
                 const std::string &key) {
    std::set<std::string> ids;
    for (const auto &parent : parents)
        ids.insert(parent.at(key).get<std::string>());
    Json rows = Json::array();
    Params parameters;
    std::string placeholders;
    auto flush = [&] {
        auto batch = r.list(table, column + " IN (" + placeholders + ")", parameters);
        for (auto &row : batch)
            rows.push_back(std::move(row));
        parameters.clear();
        placeholders.clear();
    };
    for (const auto &id : ids) {
        if (!parameters.empty())
            placeholders += ",";
        placeholders += "?";
        parameters.push_back(id);
        if (parameters.size() == 400)
            flush();
    }
    if (!parameters.empty())
        flush();
    return rows;
}
Json cartLines(Repository &r, const Json &items, bool requireVariants = false) {
    auto variants = relatedRows(r, "variants", "id", items, "variant_id");
    auto products = relatedRows(r, "products", "id", variants, "product_id");
    auto shops = relatedRows(r, "shops", "id", products, "shop_id");
    std::map<std::string, Json> variantById, productById, shopById;
    for (auto &v : variants) {
        auto id = v.at("id").get<std::string>();
        variantById[id] = std::move(v);
    }
    for (auto &p : products) {
        auto id = p.at("id").get<std::string>();
        productById[id] = std::move(p);
    }
    for (auto &s : shops) {
        auto id = s.at("id").get<std::string>();
        shopById[id] = std::move(s);
    }
    Json lines = Json::array();
    for (auto item : items) {
        auto variant = variantById.find(item.at("variant_id").get<std::string>());
        if (variant == variantById.end()) {
            if (requireVariants)
                throw Error(404, "not_found", "Không tìm thấy phân loại sản phẩm.");
            continue;
        }
        auto product = productById.find(variant->second.at("product_id").get<std::string>());
        if (product == productById.end())
            continue;
        auto shop = shopById.find(product->second.at("shop_id").get<std::string>());
        if (shop == shopById.end())
            continue;
        item["variant"] = variant->second;
        item["product"] = product->second;
        item["shop"] = shop->second;
        lines.push_back(std::move(item));
    }
    return lines;
}
Json orderViews(Repository &r, Json orders) {
    if (orders.empty())
        return orders;
    std::map<std::string, Json> checkouts, items, returns, refunds;
    for (auto row : relatedRows(r, "checkouts", "id", orders, "checkout_id")) {
        auto id = row.at("id").get<std::string>();
        checkouts[id] = std::move(row);
    }
    for (auto row : relatedRows(r, "returns", "order_id", orders)) {
        auto id = row.at("order_id").get<std::string>();
        returns[id] = std::move(row);
    }
    auto groupRows = [](auto &groups, Json rows) {
        for (auto &row : rows) {
            auto id = row.at("order_id").template get<std::string>();
            if (!groups.contains(id))
                groups[id] = Json::array();
            groups[id].push_back(std::move(row));
        }
    };
    groupRows(items, relatedRows(r, "order_items", "order_id", orders));
    groupRows(refunds, relatedRows(r, "refunds", "order_id", orders));
    for (auto &order : orders) {
        auto id = order.at("id").get<std::string>();
        auto group = required(checkouts.at(order.at("checkout_id").get<std::string>()));
        order["payment_method"] = group["method"];
        order["payment_status"] = group["method"] == "cod" ? order.value("cod_status", "unpaid")
                                                           : group.value("status", "pending");
        order["items"] = items.contains(id) ? items.at(id) : Json::array();
        order["refunds"] = refunds.contains(id) ? refunds.at(id) : Json::array();
        order["return_request"] = returns.contains(id) ? returns.at(id) : Json();
    }
    return orders;
}
bool accessOrder(Repository &r, const Json &u, const Json &o) {
    if (u.is_null())
        return false;
    if (admin(u) || o["buyer_id"] == u["id"])
        return true;
    auto s = r.get("shops", o.at("shop_id"));
    return !s.is_null() && s["owner_id"] == u["id"];
}
void audit(Repository &r, const Json &u, const std::string &action, const std::string &target) {
    r.save("audit", {{"id", randomId()},
                     {"actor_id", u.at("id")},
                     {"action", action},
                     {"target", target},
                     {"created_at", now()}});
}
void queueMail(Repository &r, const std::string &uid, const std::string &title,
               const std::string &message) {
    r.save("outbox", {{"id", randomId()},
                      {"user_id", uid},
                      {"subject", title},
                      {"text", message},
                      {"status", "queued"},
                      {"attempts", 0},
                      {"created_at", now()}});
}
Json siteSettings(Repository &r) {
    Json defaults{{"id", "site"},
                  {"banner_title", "Một chút mới. Thêm nhiều vui."},
                  {"banner_subtitle", "Khám phá những món đồ bạn yêu, từ những shop bạn tin."},
                  {"shipping_local", 20000},
                  {"shipping_remote", 35000},
                  {"shipping_step", 5000},
                  {"categories", Json::array({"Thời trang", "Điện tử", "Nhà cửa & Đời sống",
                                              "Sức khỏe & Làm đẹp", "Phụ kiện", "Thể thao"})}};
    auto saved = r.get("settings", "site");
    if (!saved.is_null())
        defaults.update(saved);
    return defaults;
}
bool gatewayReady();
Json publicMeta(Repository &r) {
    auto settings = siteSettings(r);
    return {{"payment_configured", gatewayReady()},
            {"google_configured", googleReady()},
            {"google_client_id", googleReady() ? env("GOOGLE_CLIENT_ID") : ""},
            {"email_configured", !env("RESEND_API_KEY").empty() && !env("EMAIL_FROM").empty()},
            {"storage_configured", !env("SUPABASE_URL").empty() && !env("SUPABASE_SERVICE_KEY").empty()},
            {"development", env("APP_ENV") != "production"},
            {"categories", settings["categories"]},
            {"settings", settings}};
}
Json privateCartView(Repository &r, const Json &user, bool checkout = false) {
    loginRequired(user);
    auto cart = r.one("carts", "user_id = ?", {user.at("id")});
    if (cart.is_null()) cart = {{"id", randomId()}, {"user_id", user.at("id")}, {"items", Json::array()}};
    cart["revision"] = cart.value("revision", 0LL);
    Json result{{"cart", cart}, {"lines", cartLines(r, cart["items"])}};
    if (checkout) {
        result["addresses"] = r.list("addresses", "user_id = ?", {user.at("id")});
        result["meta"] = publicMeta(r);
    }
    return result;
}
void notify(Repository &r, const std::string &uid, const std::string &title, const std::string &message,
            const std::string &link = "/orders") {
    r.save("notifications", {{"id", randomId()},
                             {"user_id", uid},
                             {"title", title},
                             {"message", message},
                             {"link", link},
                             {"read", false},
                             {"created_at", now()}});
    queueMail(r, uid, title, message);
}
void rateLimit(Repository &r, const std::string &key, int limit, int seconds) {
    auto id = sha256(key);
    auto row = r.get("rate_limits", id);
    auto time = now();
    if (row.is_null() || row.value("until", 0LL) < time)
        row = {{"id", id}, {"count", 0}, {"until", time + seconds}};
    if (row.value("count", 0) >= limit)
        throw Error(429, "rate_limited", "Bạn thao tác quá nhanh. Vui lòng thử lại sau.");
    row["count"] = row.value("count", 0) + 1;
    r.save("rate_limits", row);
}
void history(Json &o, const std::string &state, const std::string &actor) {
    o["status"] = state;
    o["updated_at"] = now();
    if (!o.contains("history"))
        o["history"] = Json::array();
    o["history"].push_back({{"status", state}, {"at", now()}, {"actor", actor}});
}
void releaseOrder(Repository &r, Json &o) {
    if (o.value("stock_released", false))
        return;
    for (auto &line : r.list("order_items", "order_id = ?", {o.at("id")})) {
        auto v = required(r.get("variants", line.at("variant_id")));
        v["stock"] = v.value("stock", 0LL) + line.value("quantity", 0LL);
        r.save("variants", v);
    }
    o["stock_released"] = true;
}
void releaseVouchers(Repository &r, const std::string &group) {
    for (auto &redemption : r.list("redemptions", "checkout_id = ?", {group}))
        r.erase("redemptions", redemption.at("id"));
}
void cancelGroup(Repository &r, Json &group, const std::string &state, const std::string &actor) {
    for (auto o : r.list("orders", "checkout_id = ?", {group.at("id")})) {
        if (o["status"] == "cancelled")
            continue;
        releaseOrder(r, o);
        history(o, "cancelled", actor);
        r.save("orders", o);
    }
    group["status"] = state;
    r.save("checkouts", group);
    releaseVouchers(r, group.at("id"));
}
std::string upper(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
    return s;
}
Json gatewayCall(const std::string &method, const std::string &path, const Json &body = Json()) {
    httplib::SSLClient client("api-merchant.payos.vn");
    client.set_connection_timeout(5);
    client.set_read_timeout(10);
    client.set_write_timeout(10);
    httplib::Headers headers{{"x-client-id", env("PAYOS_CLIENT_ID")},
                             {"x-api-key", env("PAYOS_API_KEY")}};
    auto response = method == "GET" ? client.Get(path, headers)
                                    : client.Post(path, headers, body.dump(), "application/json");
    if (!response)
        throw Error(503, "gateway_unavailable",
                    "Chưa nhận được phản hồi từ payOS. Có thể kiểm tra lại trạng thái thanh toán.");
    Json data;
    try {
        data = Json::parse(response->body);
    } catch (...) {
        throw Error(502, "gateway_error", "Phản hồi payOS không hợp lệ.");
    }
    if (response->status != 200 || data.value("code", "") != "00")
        throw Error(502, "gateway_error",
                    "payOS chưa chấp nhận yêu cầu thanh toán. Vui lòng kiểm tra cấu hình hoặc thử lại.");
    if (data.contains("signature") &&
        (!data["signature"].is_string() ||
         !constantEqual(hmac(env("PAYOS_CHECKSUM_KEY"), signatureData(data.at("data"))),
                        data["signature"].get<std::string>())))
        throw Error(502, "invalid_gateway_signature", "Chữ ký phản hồi payOS không hợp lệ.");
    return data.at("data");
}
bool gatewayReady() {
    return !env("PAYOS_CLIENT_ID").empty() && !env("PAYOS_API_KEY").empty() &&
           !env("PAYOS_CHECKSUM_KEY").empty();
}
Json uploadImage(const Json &b) {
    auto url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_KEY"),
         bucket = env("SUPABASE_BUCKET", "product-images");
    std::smatch match;
    if (key.empty() ||
        !std::regex_match(url, match, std::regex(R"(^https://([a-z0-9-]+\.supabase\.co)/?$)")))
        throw Error(503, "storage_not_configured", "Chưa cấu hình kho ảnh Supabase.");
    if (!std::regex_match(bucket, std::regex("[a-zA-Z0-9_-]+")))
        throw Error(503, "storage_not_configured", "Tên bucket không hợp lệ.");
    auto source = textField(b, "base64", 2800000);
    auto padding = source.find('=');
    if (source.size() % 4 ||
        !std::all_of(source.begin(),
                     source.begin() + (padding == std::string::npos ? source.size() : padding),
                     [](unsigned char c) { return std::isalnum(c) || c == '+' || c == '/'; }) ||
        (padding != std::string::npos &&
         (source.size() - padding > 2 || source.find_first_not_of('=', padding) != std::string::npos)))
        throw Error(422, "invalid_image", "Ảnh không hợp lệ.");
    std::string binary(source.size() / 4 * 3, '\0');
    auto size = EVP_DecodeBlock(reinterpret_cast<unsigned char *>(binary.data()),
                                reinterpret_cast<const unsigned char *>(source.data()),
                                static_cast<int>(source.size()));
    if (size < 0)
        throw Error(422, "invalid_image", "Ảnh không hợp lệ.");
    if (source.ends_with("=="))
        size -= 2;
    else if (source.ends_with("="))
        --size;
    binary.resize(size);
    if (binary.size() > 2 * 1024 * 1024 || binary.size() < 12)
        throw Error(422, "invalid_image", "Ảnh phải dưới 2MB.");
    std::string type, extension;
    if (binary.compare(0, 8, std::string("\x89PNG\r\n\x1a\n", 8)) == 0) {
        type = "image/png";
        extension = "png";
    } else if (static_cast<unsigned char>(binary[0]) == 0xff &&
               static_cast<unsigned char>(binary[1]) == 0xd8 &&
               static_cast<unsigned char>(binary[2]) == 0xff) {
        type = "image/jpeg";
        extension = "jpg";
    } else if (binary.substr(0, 4) == "RIFF" && binary.substr(8, 4) == "WEBP") {
        type = "image/webp";
        extension = "webp";
    } else
        throw Error(422, "invalid_image", "Chỉ hỗ trợ ảnh PNG, JPEG và WebP.");
    auto object = randomId() + "." + extension;
    httplib::SSLClient client(match[1].str());
    client.set_connection_timeout(5);
    client.set_read_timeout(10);
    client.set_write_timeout(10);
    httplib::Headers storageHeaders{{"apikey", key}, {"x-upsert", "false"}};
    // New Supabase secret keys are opaque API keys, not Bearer JWTs.
    if (key.rfind("sb_secret_", 0) != 0)
        storageHeaders.emplace("Authorization", "Bearer " + key);
    auto response =
        client.Post("/storage/v1/object/" + bucket + "/" + object, storageHeaders, binary, type);
    if (!response || response->status < 200 || response->status >= 300)
        throw Error(502, "storage_error", "Không tải được ảnh. Kiểm tra bucket và quyền lưu trữ.");
    return {{"url", "https://" + match[1].str() + "/storage/v1/object/public/" + bucket + "/" + object}};
}
void recordPayment(Repository &r, Json group, const Json &data) {
    std::string status = group.value("status", "");
    if (!recordReceipt(r, group, data))
        return;
    if (status == "paid") {
        group["excess_amount"] = group.value("received_amount", 0LL) - group.value("total", 0LL);
        group["needs_reconciliation"] = true;
        r.save("checkouts", group);
        notify(r, group.at("buyer_id"), "Có khoản thanh toán bổ sung",
               "Đơn vẫn được xử lý. Admin sẽ đối soát và hoàn khoản thu thừa.",
               "/payment/" + group.at("id").get<std::string>());
        return;
    }
    bool valid = data.value("amount", 0LL) == group.value("total", 0LL);
    if (!valid || status == "cancelled" || status == "expired" || status == "review" ||
        status == "refunded" || group.value("expires_at", 0LL) < now()) {
        if (status == "pending")
            cancelGroup(r, group, "review", "system");
        group["status"] = "review";
        r.save("checkouts", group);
        notify(r, group.at("buyer_id"), "Giao dịch cần đối soát",
               "Đã nhận thông báo giao dịch nhưng đơn cần admin kiểm tra.",
               "/payment/" + group.at("id").get<std::string>());
        return;
    }
    group["status"] = "paid";
    group["paid_at"] = now();
    r.save("checkouts", group);
    notify(r, group.at("buyer_id"), "Thanh toán thành công",
           "Thanh toán đã được xác minh. Các shop sẽ chuẩn bị đơn hàng của bạn.");
}
void recordPaymentSnapshot(Repository &r, Json group, const Json &snapshot) {
    auto transactions = paymentTransactions(group, snapshot);
    for (const auto &transaction : transactions) {
        group = required(r.get("checkouts", group.at("id")));
        recordPayment(r, group, transaction);
    }
}
std::int64_t discountFor(Repository &r, const std::string &code, const std::string &shop,
                         std::int64_t subtotal, const std::string &group, Json &reservations) {
    if (code.empty())
        return 0;
    auto v = required(r.one("vouchers", "code = ?", {upper(code)}));
    if (!v.value("active", false) || v.value("shop_id", "") != shop ||
        v.value("starts_at", 0LL) > now() || v.value("ends_at", 0LL) < now() ||
        subtotal < v.value("minimum", 0LL))
        throw Error(422, "invalid_voucher", "Voucher không áp dụng cho đơn hàng này.");
    auto used =
        std::stoll(r.query("SELECT COUNT(*) AS total FROM redemptions WHERE voucher_id=?", {v.at("id")})
                       .front()
                       .at("total"));
    if (used >= v.value("limit", 0U))
        throw Error(409, "voucher_used_up", "Voucher đã hết lượt sử dụng.");
    auto d = v.value("type", "") == "percent" ? subtotal * v.value("value", 0LL) / 100
                                              : v.value("value", 0LL);
    d = std::min<std::int64_t>({d, subtotal, v.value("max_discount", subtotal)});
    reservations.push_back(
        {{"id", randomId()}, {"voucher_id", v.at("id")}, {"checkout_id", group}, {"amount", d}});
    return d;
}
Json saveProduct(Repository &r, const Json &u, const Json &b, const std::string &id) {
    auto shopId = textField(b, "shop_id", 64);
    auto shop = manageShop(r, u, shopId);
    if (shop.value("status", "") != "approved")
        throw Error(403, "shop_not_approved", "Shop chưa được duyệt hoạt động.");
    auto p = id.empty() ? Json{{"id", randomId()}, {"created_at", now()}, {"sold", 0}}
                        : required(r.get("products", id));
    if (!id.empty() && p["shop_id"] != shopId)
        throw Error(403, "forbidden", "Không thể chuyển sản phẩm sang shop khác.");
    p["shop_id"] = shopId;
    p["name"] = textField(b, "name", 200);
    p["description"] = textField(b, "description", 10000);
    p["category"] = textField(b, "category", 100);
    p["active"] = b.value("active", true);
    p["weight"] = numberField(b, "weight", 1, 100000, 300);
    p["image"] = textField(b, "image", 2048, false);
    const auto image = p["image"].get<std::string>();
    if (!image.empty() && image.rfind("/assets/", 0) != 0 && image.rfind("https://", 0) != 0)
        throw Error(422, "invalid_image", "Ảnh phải dùng HTTPS hoặc tài nguyên của website.");
    if (!b.contains("variants") || !b["variants"].is_array() || b["variants"].empty() ||
        b["variants"].size() > 50)
        throw Error(422, "invalid_variants", "Sản phẩm cần từ 1 đến 50 biến thể.");
    r.save("products", p);
    std::set<std::string> kept;
    Json result = Json::array();
    for (const auto &input : b["variants"]) {
        auto vid = textField(input, "id", 64, false);
        auto v = vid.empty() ? Json{{"id", randomId()}} : required(r.get("variants", vid));
        if (!vid.empty() && v["product_id"] != p["id"])
            throw Error(403, "forbidden", "Biến thể không thuộc sản phẩm.");
        v["product_id"] = p["id"];
        v["shop_id"] = shopId;
        v["name"] = textField(input, "name", 100);
        v["price"] = numberField(input, "price", 1000, 100000000);
        v["stock"] = numberField(input, "stock", 0, 1000000);
        v["active"] = true;
        result.push_back(r.save("variants", v));
        kept.insert(v.at("id"));
    }
    for (auto v : r.list("variants", "product_id = ?", {p.at("id")}))
        if (!kept.contains(v.at("id"))) {
            v["active"] = false;
            r.save("variants", v);
        }
    p["variants"] = result;
    return p;
}
Json parseCsv(const std::string &source) {
    Json rows = Json::array();
    std::vector<std::string> row;
    std::string cell;
    bool quoted = false;
    for (std::size_t i = 0; i < source.size(); ++i) {
        char c = source[i];
        if (c == '"') {
            if (quoted && i + 1 < source.size() && source[i + 1] == '"') {
                cell += '"';
                ++i;
            } else
                quoted = !quoted;
        } else if (c == ',' && !quoted) {
            row.push_back(cell);
            cell.clear();
        } else if ((c == '\n' || c == '\r') && !quoted) {
            if (c == '\r' && i + 1 < source.size() && source[i + 1] == '\n')
                ++i;
            row.push_back(cell);
            if (row.size() > 1 || !cell.empty())
                rows.push_back(row);
            row.clear();
            cell.clear();
        } else
            cell += c;
    }
    if (quoted)
        throw Error(422, "invalid_csv", "CSV có dấu ngoặc kép chưa đóng.");
    if (!row.empty() || !cell.empty()) {
        row.push_back(cell);
        rows.push_back(row);
    }
    return rows;
}
} // namespace
Application::Application(Database &db, GoogleVerifier verifier, MailSender mailSender)
    : db_(db), production_(env("APP_ENV") == "production"),
      appUrl_(env("APP_URL", "http://localhost:5173")), googleVerifier_(std::move(verifier)),
      mailSender_(std::move(mailSender)), instanceId_(randomId(8)) {}
Application::~Application() {
    mailWorker_.request_stop();
    mailWake_.notify_all();
    if (mailWorker_.joinable())
        mailWorker_.join();
}
void Application::wakeMailWorker() {
    {
        std::lock_guard lock(mailMutex_);
        mailPending_ = true;
    }
    mailWake_.notify_one();
}
void Application::startMailWorker() {
    if ((!mailSender_ && (env("RESEND_API_KEY").empty() || env("EMAIL_FROM").empty())) ||
        mailWorker_.joinable())
        return;
    // The durable outbox owns delivery state. A restarted/scaled-in container can resume it;
    // the protected maintenance job remains a recovery path, not the user request.
    mailWorker_ = std::jthread([this](std::stop_token stop) {
        while (!stop.stop_requested()) {
            for (int n = 0; n < 4 && !stop.stop_requested(); ++n)
                if (!processMail())
                    break;
            std::unique_lock lock(mailMutex_);
            mailWake_.wait_for(lock, std::chrono::seconds(5),
                               [&] { return stop.stop_requested() || mailPending_; });
            mailPending_ = false;
        }
    });
}
void Application::expire(Repository &r) {
    r.query("DELETE FROM auth_challenges WHERE expires_at<?", {std::to_string(now())});
    for (auto group :
         r.list("checkouts", "status = ? AND expires_at < ?", {"pending", std::to_string(now())}))
        cancelGroup(r, group, "expired", "system");
}
void Application::handle(const httplib::Request &req, httplib::Response &res) {
    res.status = 200;
    struct Trace {
        const httplib::Request &req;
        httplib::Response &res;
        const std::string &instance;
        std::chrono::steady_clock::time_point born;
        std::uint64_t ordinal;
        std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
        std::string id = randomId(8);
        ~Trace() {
            try {
                const auto m = Database::metrics();
                const auto ms =
                    std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start)
                        .count();
                res.set_header("X-Request-Id", id);
                res.set_header("X-App-Instance", instance);
                const auto age = std::chrono::duration<double, std::milli>(start - born).count();
                res.set_header("X-App-Age-Ms", std::to_string(age));
                res.set_header("Server-Timing", "db_pool;dur=" + std::to_string(m.poolMs) +
                                                    ", db;dur=" + std::to_string(m.sqlMs) +
                                                    ", app;dur=" + std::to_string(ms));
                requestLog().submit(Json{{"event", "request"},   {"request_id", id},
                            {"method", req.method}, {"path", tracePath(req.path)},
                            {"status", res.status}, {"duration_ms", ms},
                            {"db_ms", m.sqlMs},     {"pool_ms", m.poolMs},
                            {"queries", m.queries}, {"response_bytes", res.body.size()},
                            {"instance_id", instance}, {"instance_age_ms", age},
                            {"instance_request", ordinal}});
            } catch (...) { /* Observability must never fail the response. */
            }
        }
    };
    Database::resetMetrics();
    Trace trace{req, res, instanceId_, instanceStarted_, requests_.fetch_add(1) + 1};
    res.set_header("Cache-Control", "private, no-store");
    try {
        validateMethod(req, res);
        if ((req.method == "GET" || req.method == "HEAD") && req.path == "/api/live") {
            // Bounded transport diagnostic only; never changes customer API socket policy.
            if (req.get_param_value("connection") == "close") res.set_header("Connection", "close");
            res.set_content(Json{{"ok", true}, {"engine", "C++20"}}.dump(), "application/json; charset=utf-8");
            return;
        }
        if ((req.method == "GET" || req.method == "HEAD") && req.path == "/api/auth/me" && sid(req).empty()) {
            Json guest{{"user", nullptr}, {"csrf", ""}, {"shop", nullptr}};
            const auto include = req.get_param_value("include");
            if (include == "cart" || include == "cart-view" || include == "checkout")
                guest["cart_summary"] = {{"quantity", 0}, {"revision", 0}};
            res.set_content(guest.dump(), "application/json; charset=utf-8");
            return;
        }
        Json body = Json::object();
        if (req.path == "/api/jobs/maintenance" && (req.method == "GET" || req.method == "HEAD")) {
            auto secret = env("CRON_SECRET");
            if (secret.size() < 32 ||
                !constantEqual(req.get_header_value("Authorization"), "Bearer " + secret))
                throw Error(403, "forbidden", "Không có quyền chạy tác vụ hệ thống.");
            {
                auto tx = db_.begin();
                Repository r(*tx);
                expire(r);
                tx->commit();
            }
            for (int i = 0; i < 4; ++i)
                processMail();
            res.set_content(Json{{"ok", true}}.dump(), "application/json; charset=utf-8");
            return;
        }
        if (!req.body.empty()) {
            try {
                body = Json::parse(req.body);
            } catch (...) {
                throw Error(400, "invalid_json", "Nội dung JSON không hợp lệ.");
            }
            if (!body.is_object())
                throw Error(400, "invalid_json", "Yêu cầu phải là JSON object.");
        }
        if (req.path == "/api/payments/webhook" && req.method == "POST") {
            if (!gatewayReady())
                throw Error(503, "payment_not_configured", "Thanh toán chưa được cấu hình.");
            if (!body.contains("data") || !body["data"].is_object() || !body.contains("signature") ||
                !body["signature"].is_string() ||
                !constantEqual(hmac(env("PAYOS_CHECKSUM_KEY"), signatureData(body["data"])),
                               body["signature"].get<std::string>()))
                throw Error(400, "invalid_signature", "Chữ ký thanh toán không hợp lệ.");
            auto tx = db_.begin();
            Repository r(*tx);
            auto data = body["data"];
            auto code = data.at("orderCode").get<std::int64_t>();
            auto g = r.one("checkouts", "order_code = ?", {std::to_string(code)});
            // payOS sends a signed sample during webhook registration; unknown orders are acknowledged
            // only, never recorded as paid.
            if (!g.is_null())
                recordPayment(r, g, data);
            tx->commit();
            res.set_content(Json{{"success", true}}.dump(), "application/json; charset=utf-8");
            return;
        }
        bool writing = req.method != "GET" && req.method != "HEAD";
        if (writing) {
            auto origin = req.get_header_value("Origin");
            if (origin != appUrl_)
                throw Error(403, "invalid_origin", "Nguồn yêu cầu không hợp lệ.");
        }
        Json passwordWork = Json::object();
        const bool login = req.path == "/api/auth/login" && writing;
        const bool registration = req.path == "/api/auth/register" && writing;
        const bool reset = req.path == "/api/auth/reset" && writing;
        if (login || registration || reset) {
            const auto password = textField(body, "password", 128);
            Json account;
            {
                auto prepare = db_.begin(reset);
                Repository repo(*prepare);
                if (login || registration) {
                    auto email = textField(body, "email", 254);
                    validateEmail(email);
                    rateLimit(repo,
                              login ? "login:" + email + ":" + req.remote_addr
                                    : "register:" + req.remote_addr,
                              login ? 10 : 8, login ? 900 : 3600);
                    account = repo.one("users", "email=?", {email});
                    if (registration && !account.is_null())
                        throw Error(409, "email_exists", "Email đã được sử dụng.");
                } else {
                    auto token =
                        required(repo.get("email_tokens", sha256(textField(body, "token", 100))));
                    if (token.value("purpose", "") != "reset" || token.value("expires_at", 0LL) < now())
                        throw Error(422, "expired_token", "Liên kết không hợp lệ hoặc đã hết hạn.");
                    account = required(repo.get("users", token.at("user_id")));
                }
                prepare->commit();
            }
            // PBKDF2 is intentionally expensive. It must not hold the global stock/write lock.
            if (login) {
                if (account.is_null() || !passwordVerify(password, account.value("password_hash", "")))
                    throw Error(401, "invalid_credentials", "Email hoặc mật khẩu không đúng.");
                passwordWork = {{"id", account.at("id")}, {"before", account.at("password_hash")}};
            } else {
                passwordWork["hash"] = passwordHash(password);
                if (reset)
                    passwordWork["before"] = account.value("password_hash", "");
            }
        }
        const bool readOnly = !writing || req.path == "/api/checkout/quote";
        auto tx = db_.begin(readOnly);
        const bool sessionOnly = req.path == "/api/auth/me" &&
            req.get_param_value("include") != "cart-view" && req.get_param_value("include") != "checkout";
        const bool needsExpiry = req.path != "/api/health" && req.path != "/api/meta" && !sessionOnly;
        if (readOnly && needsExpiry &&
            !tx->query("SELECT id FROM checkouts WHERE status = ? AND expires_at < ? LIMIT 1",
                       {"pending", std::to_string(now())})
                 .empty()) {
            // Keep expiry/restock visible on public catalog reads without locking every reader.
            // Drop the read snapshot before taking the write lock and re-check under that lock.
            tx->rollback();
            tx = db_.begin();
            Repository expired(*tx);
            expire(expired);
            tx->commit();
            tx = db_.begin(true);
        }
        Repository r(*tx);
        if (!readOnly)
            expire(r);
        Json session;
        Json user;
        const bool publicRequest =
            req.path == "/api/home" || req.path == "/api/meta" || req.path == "/api/products" ||
            (req.path.rfind("/api/products/", 0) == 0 && req.get_param_value("view") == "public");
        auto token = publicRequest ? std::string() : sid(req);
        if (!token.empty()) {
            session = r.get("sessions", sha256(token));
            if (!session.is_null() && session.value("expires_at", 0LL) > now()) {
                user = r.get("users", session.at("user_id"));
                activeUser(user);
            } else
                session = nullptr;
        }
        if (writing && !user.is_null() && req.path != "/api/auth/login" &&
            req.path != "/api/auth/register" &&
            !constantEqual(session.value("csrf", ""), req.get_header_value("X-CSRF-Token")))
            throw Error(403, "csrf", "Phiên thao tác đã hết hạn. Vui lòng tải lại trang.");
        Json result;
        const bool googleLogin = req.path == "/api/auth/google" && req.method == "POST";
        std::string nonce;
        if (googleLogin) {
            if (!googleReady())
                throw Error(503, "google_not_configured", "Chưa cấu hình đăng nhập Google.");
            textField(body, "credential", 16384);
            rateLimit(r, "google-login:" + req.remote_addr, 20, 900);
            nonce = googleNonce(req);
            auto challenge = nonce.empty() ? Json() : r.get("auth_challenges", sha256(nonce));
            if (challenge.is_null() || challenge.value("expires_at", 0LL) <= now() ||
                challenge.value("client_id", "") != env("GOOGLE_CLIENT_ID") ||
                challenge.value("user_id", "") !=
                    (user.is_null() ? "" : user.at("id").get<std::string>()) ||
                challenge.value("session_id", "") !=
                    (session.is_null() ? "" : session.at("id").get<std::string>()))
                throw Error(401, "google_challenge_expired",
                            "Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.");
            // Consume once and release the database before fetching Google's verification keys.
            if (tx->query("DELETE FROM auth_challenges WHERE id = ? RETURNING id",
                          {challenge.at("id").get<std::string>()})
                    .empty())
                throw Error(401, "google_challenge_expired",
                            "Phiên đăng nhập Google đã được sử dụng. Vui lòng thử lại.");
            res.set_header("Set-Cookie",
                           "shoppe_google_login=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" +
                               (production_ ? std::string("; Secure") : ""));
        } else if (req.path == "/api/admin/catalog/preview" && req.method == "POST") {
            adminRequired(user);
            numberField(body, "limit", 1, demoCatalogLimit);
            rateLimit(r, "catalog-preview:" + user.at("id").get<std::string>(), 3, 60);
            result = Json::object();
        } else if (req.path == "/api/storage/images" && req.method == "POST") {
            loginRequired(user);
            if (!admin(user)) {
                auto shop = required(userShop(r, user));
                if (shop.value("status", "") != "approved")
                    throw Error(403, "shop_not_approved", "Shop chưa được duyệt.");
            }
            result = Json::object();
        } else
            result = route(r, req, res, body, user, session, passwordWork);
        if (req.path == "/api/checkout/quote")
            tx->rollback();
        else
            tx->commit();
        if (!writing && req.path.rfind("/api/conversations/", 0) == 0 &&
            req.path.ends_with("/messages") && result.contains("conversation")) {
            auto conversation = result.at("conversation");
            const char *field =
                conversation.at("buyer_id") == user.at("id") ? "buyer_read_at" : "seller_read_at";
            if (conversation.value(field, 0LL) < conversation.value("updated_at", 0LL)) {
                auto marker = db_.begin();
                Repository repo(*marker);
                auto current = required(repo.get("conversations", conversation.at("id")));
                // Mark only the snapshot actually returned, never messages sent after that snapshot.
                current[field] =
                    std::max(current.value(field, 0LL), conversation.value("updated_at", 0LL));
                repo.save("conversations", current);
                marker->commit();
            }
        }
        if (googleLogin) {
            auto identity = googleVerifier_(body.at("credential").get<std::string>(), nonce);
            auto write = db_.begin();
            Repository repo(*write);
            if (!user.is_null()) {
                auto currentSession = repo.get("sessions", session.at("id"));
                if (currentSession.is_null() || currentSession.value("expires_at", 0LL) <= now())
                    throw Error(401, "unauthenticated",
                                "Vui lòng đăng nhập lại trước khi liên kết Google.");
                user = required(repo.get("users", user.at("id")));
                activeUser(user);
            }
            auto identityId = sha256("google:" + identity.subject);
            auto linked = repo.get("auth_identities", identityId);
            Json account;
            if (!linked.is_null()) {
                account = required(repo.get("users", linked.at("user_id")));
                if (!user.is_null() && account.at("id") != user.at("id"))
                    throw Error(409, "google_already_linked",
                                "Google này đã liên kết với tài khoản khác.");
            } else {
                auto existing = repo.one("users", "email = ?", {identity.email});
                if (user.is_null() && !existing.is_null())
                    throw Error(409, "google_link_required",
                                "Email đã có tài khoản. Hãy đăng nhập bằng mật khẩu, rồi liên kết "
                                "Google trong Tài khoản của tôi.");
                if (!user.is_null()) {
                    if (user.value("email", "") != identity.email ||
                        !repo.one("auth_identities", "user_id = ? AND provider = ?",
                                  {user.at("id"), "google"})
                             .is_null())
                        throw Error(
                            409, "google_link_conflict",
                            "Hãy chọn Google cùng email với tài khoản đang đăng nhập và chưa liên kết.");
                    account = user;
                } else {
                    account = {{"id", randomId()},   {"email", identity.email}, {"name", identity.name},
                               {"role", "buyer"},    {"active", true},          {"verified", true},
                               {"created_at", now()}};
                }
                account["verified"] = true;
                repo.save("users", account);
                repo.save("auth_identities", {{"id", identityId},
                                              {"user_id", account.at("id")},
                                              {"provider", "google"},
                                              {"subject", identity.subject},
                                              {"created_at", now()}});
            }
            activeUser(account);
            if (!session.is_null())
                repo.erase("sessions", session.at("id"));
            auto sessionToken = randomId(32);
            auto csrf = randomId(24);
            repo.save("sessions", {{"id", sha256(sessionToken)},
                                   {"user_id", account.at("id")},
                                   {"csrf", csrf},
                                   {"expires_at", now() + 7 * 86400}});
            res.set_header("Set-Cookie", "shoppe_session=" + sessionToken +
                                             "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800" +
                                             (production_ ? std::string("; Secure") : ""));
            result = {{"user", safeUser(account)}, {"csrf", csrf}, {"shop", userShop(repo, account)}};
            write->commit();
        }
        if (req.path == "/api/admin/catalog/preview" && req.method == "POST") {
            auto document =
                fetchDemoCatalog(static_cast<int>(numberField(body, "limit", 1, demoCatalogLimit)));
            auto write = db_.begin();
            Repository repo(*write);
            // Recheck privileges after network I/O, before storing a server-owned snapshot.
            auto current = required(repo.get("users", user.at("id")));
            activeUser(current);
            adminRequired(current);
            result = stageDemoCatalog(repo, current, document);
            write->commit();
        }
        if (req.path == "/api/storage/images" && req.method == "POST")
            result = uploadImage(body);
        if (req.path == "/api/checkout" && result.contains("checkout") &&
            result["checkout"].value("method", "") == "payos" &&
            result["checkout"].value("status", "") == "pending") {
            auto id = result["checkout"]["id"].get<std::string>();
            try {
                ensurePayment(id);
            } catch (const Error &e) {
                result["payment_error"] = {{"code", e.code}, {"message", e.what()}};
            }
            auto read = db_.begin();
            Repository repo(*read);
            result["checkout"] = required(repo.get("checkouts", id));
            read->commit();
        }
        if (req.path.rfind("/api/payments/", 0) == 0 && req.path.ends_with("/sync") &&
            result.contains("checkout")) {
            auto id = result["checkout"]["id"].get<std::string>();
            auto group = result["checkout"];
            if (group.value("method", "") == "payos") {
                if (!gatewayReady())
                    throw Error(503, "payment_not_configured", "Chưa thiết lập payOS.");
                ensurePayment(id);
                auto payment = gatewayCall("GET", "/v2/payment-requests/" +
                                                      std::to_string(group.value("order_code", 0LL)));
                auto write = db_.begin();
                Repository repo(*write);
                group = required(repo.get("checkouts", id));
                recordPaymentSnapshot(repo, group, payment);
                group = required(repo.get("checkouts", id));
                if (group["status"] == "pending" && (payment.value("status", "") == "CANCELLED" ||
                                                     payment.value("status", "") == "EXPIRED"))
                    cancelGroup(repo, group,
                                payment.value("status", "") == "EXPIRED" ? "expired" : "cancelled",
                                "payos");
                result["checkout"] = repo.get("checkouts", id);
                write->commit();
            }
        }
        if (res.get_header_value("Content-Type").find("text/csv") == std::string::npos)
            res.set_content(result.dump(), "application/json; charset=utf-8");
        if (!writing && res.status == 200 &&
            (req.path == "/api/meta" || req.path == "/api/home" || req.path == "/api/products" ||
             (req.path.rfind("/api/products/", 0) == 0 && (sid(req).empty() || publicRequest)))) {
            res.headers.erase("Cache-Control");
            res.set_header("Cache-Control",
                           req.path == "/api/meta"
                               ? "public, max-age=0, s-maxage=30, stale-while-revalidate=30"
                               : "public, max-age=0, s-maxage=15, stale-while-revalidate=15");
            res.set_header("X-Data-Generated-At", std::to_string(now()));
            res.set_header("X-Data-Ttl", req.path == "/api/meta" ? "30" : "15");
        }
        if (writing && req.path != "/api/checkout/quote")
            wakeMailWorker();
    } catch (const Error &e) {
        res.status = e.status;
        res.set_content(Json{{"error", {{"code", e.code}, {"message", e.what()}}}}.dump(),
                        "application/json; charset=utf-8");
    } catch (const nlohmann::json::exception &) {
        res.status = 422;
        res.set_content(
            Json{{"error", {{"code", "invalid_payload"}, {"message", "Dữ liệu gửi lên không hợp lệ."}}}}
                .dump(),
            "application/json; charset=utf-8");
    } catch (const std::exception &e) {
        std::cerr << "Request failed: " << req.method << " " << req.path << " (" << typeid(e).name()
                  << ")\n";
        res.status = 500;
        res.set_content(
            Json{
                {"error", {{"code", "internal_error"}, {"message", "Có lỗi xảy ra. Vui lòng thử lại."}}}}
                .dump(),
            "application/json; charset=utf-8");
    }
}
Json Application::route(Repository &r, const httplib::Request &req, httplib::Response &res,
                        const Json &b, const Json &u, const Json &session, const Json &passwordWork) {
    auto p = segments(req.path);
    auto method = req.method == "HEAD" ? "GET" : req.method;
    auto path = req.path;
    if (path == "/api/health")
        return {
            {"ok", true}, {"engine", "C++20"}, {"database", db_.postgres() ? "postgresql" : "sqlite"}};
    if (path == "/api/meta")
        return publicMeta(r);
    if (path == "/api/home") {
        auto meta = publicMeta(r);
        auto page = publicCatalog(r, Json::object());
        page["meta"] = meta;
        page["category_previews"] = catalogHighlights(r, meta["categories"]);
        return page;
    }
    if (path == "/api/auth/me") {
        Json result{{"user", safeUser(u)},
                {"csrf", session.is_null() ? "" : session.value("csrf", "")},
                {"shop", u.is_null() ? Json() : userShop(r, u)}};
        const auto include = req.get_param_value("include");
        const bool withView = include == "cart-view" || include == "checkout";
        if (include == "cart" || withView) {
            const auto view = withView && !u.is_null() ? privateCartView(r, u, include == "checkout") : Json();
            const auto cart = !view.is_null() ? view.at("cart") :
                u.is_null() ? Json() : r.one("carts", "user_id = ?", {u.at("id")});
            long long quantity = 0;
            if (!cart.is_null()) for (const auto &item : cart.value("items", Json::array())) quantity += item.value("quantity", 0LL);
            result["cart_summary"] = {{"quantity", quantity}, {"revision", cart.is_null() ? 0LL : cart.value("revision", 0LL)}};
            if (!view.is_null()) result["bootstrap"] = view;
        }
        return result;
    }
    if (path == "/api/auth/google/challenge" && method == "POST") {
        if (!googleReady())
            throw Error(503, "google_not_configured", "Chưa cấu hình đăng nhập Google.");
        rateLimit(r, "google-challenge:" + req.remote_addr, 30, 900);
        auto previous = googleNonce(req);
        if (!previous.empty())
            r.erase("auth_challenges", sha256(previous));
        auto nonce = randomId(32);
        r.save("auth_challenges",
               {{"id", sha256(nonce)},
                {"expires_at", now() + 600},
                {"user_id", u.is_null() ? "" : u.at("id").get<std::string>()},
                {"session_id", session.is_null() ? "" : session.at("id").get<std::string>()},
                {"client_id", env("GOOGLE_CLIENT_ID")}});
        res.set_header("Set-Cookie", "shoppe_google_login=" + nonce +
                                         "; Path=/; HttpOnly; SameSite=Lax; Max-Age=600" +
                                         (production_ ? std::string("; Secure") : ""));
        return {{"nonce", nonce}, {"client_id", env("GOOGLE_CLIENT_ID")}};
    }
    if (path == "/api/auth/register" && method == "POST") {
        auto email = textField(b, "email", 254);
        validateEmail(email);
        if (!r.one("users", "email = ?", {email}).is_null())
            throw Error(409, "email_exists", "Email đã được sử dụng.");
        auto user = Json{{"id", randomId()},
                         {"email", email},
                         {"name", textField(b, "name", 100)},
                         {"password_hash", passwordWork.at("hash")},
                         {"role", "buyer"},
                         {"active", true},
                         {"verified", false},
                         {"created_at", now()}};
        r.save("users", user);
        auto t = randomId(32);
        r.save("email_tokens", {{"id", sha256(t)},
                                {"user_id", user["id"]},
                                {"purpose", "verify"},
                                {"expires_at", now() + 86400}});
        queueMail(r, user["id"], "Xác minh email Shoppe",
                  "Xác minh email tại: " + appUrl_ + "/verify?token=" + t);
        res.status = 201;
        return {{"message", "Tạo tài khoản thành công. Vui lòng đăng nhập và kiểm tra email xác minh."},
                {"email_pending", env("RESEND_API_KEY").empty()}};
    }
    if (path == "/api/auth/login" && method == "POST") {
        auto email = textField(b, "email", 254);
        validateEmail(email);
        auto user = r.one("users", "email = ?", {email});
        if (user.is_null() || user.at("id") != passwordWork.at("id") ||
            user.value("password_hash", "") != passwordWork.at("before").get<std::string>()) {
            // Commit failed-attempt accounting by returning an error response rather than
            // throwing/rolling it back.
            res.status = 401;
            return {{"error",
                     {{"code", "invalid_credentials"}, {"message", "Email hoặc mật khẩu không đúng."}}}};
        }
        activeUser(user);
        auto token = randomId(32);
        auto csrf = randomId(24);
        r.save("sessions", {{"id", sha256(token)},
                            {"user_id", user["id"]},
                            {"csrf", csrf},
                            {"expires_at", now() + 7 * 86400}});
        res.set_header("Set-Cookie", "shoppe_session=" + token +
                                         "; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800" +
                                         (production_ ? std::string("; Secure") : ""));
        return {{"user", safeUser(user)}, {"csrf", csrf}, {"shop", userShop(r, user)}};
    }
    if (path == "/api/auth/logout" && method == "POST") {
        if (!session.is_null())
            r.erase("sessions", session.at("id"));
        res.set_header("Set-Cookie", "shoppe_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" +
                                         (production_ ? std::string("; Secure") : ""));
        return {{"ok", true}};
    }
    if ((path == "/api/auth/forgot" || path == "/api/auth/resend") && method == "POST") {
        auto email = textField(b, "email", 254);
        validateEmail(email);
        rateLimit(r, "email:" + email, 3, 3600);
        auto user = r.one("users", "email = ?", {email});
        if (!user.is_null()) {
            auto purpose = path.ends_with("forgot") ? "reset" : "verify";
            for (auto token :
                 r.list("email_tokens", "user_id = ? AND purpose = ?", {user.at("id"), purpose}))
                r.erase("email_tokens", token.at("id"));
            auto t = randomId(32);
            r.save("email_tokens", {{"id", sha256(t)},
                                    {"user_id", user["id"]},
                                    {"purpose", purpose},
                                    {"expires_at", now() + 3600}});
            queueMail(r, user["id"], "Yêu cầu tài khoản Shoppe",
                      appUrl_ + (std::string(purpose) == "reset" ? "/reset?token=" : "/verify?token=") +
                          t);
        }
        return {{"message", "Nếu email hợp lệ, hướng dẫn sẽ được gửi qua email."}};
    }
    if ((path == "/api/auth/reset" || path == "/api/auth/verify") && method == "POST") {
        auto token = required(r.get("email_tokens", sha256(textField(b, "token", 100))));
        auto purpose = path.ends_with("reset") ? "reset" : "verify";
        if (token["purpose"] != purpose || token.value("expires_at", 0LL) < now())
            throw Error(422, "expired_token", "Liên kết không hợp lệ hoặc đã hết hạn.");
        auto user = required(r.get("users", token.at("user_id")));
        if (std::string(purpose) == "reset") {
            if (user.value("password_hash", "") != passwordWork.at("before").get<std::string>())
                throw Error(409, "password_changed",
                            "Mật khẩu đã thay đổi. Vui lòng yêu cầu liên kết mới.");
            user["password_hash"] = passwordWork.at("hash");
            for (auto s : r.list("sessions", "user_id = ?", {user.at("id")}))
                r.erase("sessions", s.at("id"));
        } else
            user["verified"] = true;
        r.save("users", user);
        r.erase("email_tokens", token.at("id"));
        return {{"ok", true}};
    }
    if (path == "/api/products" && method == "GET") {
        Json options = Json::object();
        for (const char *key :
             {"q", "category", "shop", "sort", "min", "max", "page", "page_size", "limit"})
            if (req.has_param(key))
                options[key] = req.get_param_value(key);
        auto page = publicCatalog(r, options);
        if (req.get_param_value("include") == "meta") {
            page["meta"] = publicMeta(r);
            const auto shopId = req.get_param_value("shop");
            if (!shopId.empty()) {
                const auto shop = required(r.get("shops", shopId));
                if (shop.value("status", "") != "approved")
                    throw Error(404, "not_found", "Shop chưa hoạt động.");
                page["shop"] = {{"id", shop.at("id")}, {"name", shop.at("name")},
                                {"description", shop.value("description", "")},
                                {"region", shop.value("region", "")}};
                for (const auto key : {"location", "service_hours", "shipping_note", "returns_note"})
                    page["shop"][key] = shop.value(key, "");
            }
        }
        return page;
    }
    if (p.size() == 3 && p[1] == "products" && method == "GET") {
        auto product = required(r.get("products", p[2]));
        auto shop = required(r.get("shops", product.at("shop_id")));
        if ((!product.value("active", false) || shop.value("status", "") != "approved") && !admin(u) &&
            (u.is_null() || shop["owner_id"] != u["id"]))
            throw Error(404, "not_found", "Sản phẩm không khả dụng.");
        auto page = pageList(r, "reviews", req,
            "t.product_id=? AND COALESCE(CAST(" + jsonField(r, "t", "hidden") +
            " AS TEXT),'false') NOT IN ('true','1')", {p[2]}, 20);
        auto reviews = page.at("items");
        page.erase("items");
        return {{"product", productView(r, product)}, {"reviews", reviews}, {"review_page", page}};
    }
    if (p.size() == 3 && p[1] == "shops" && method == "GET") {
        auto shop = required(r.get("shops", p[2]));
        if (shop.value("status", "") != "approved" && !admin(u) &&
            (u.is_null() || shop["owner_id"] != u["id"]))
            throw Error(404, "not_found", "Shop chưa hoạt động.");
        return {{"shop", shop}};
    }
    if (path == "/api/vouchers" && method == "GET") {
        std::string filter = "t.active=1 AND CAST(" + jsonField(r, "t", "starts_at") +
            " AS BIGINT)<=? AND CAST(" + jsonField(r, "t", "ends_at") + " AS BIGINT)>=?";
        Params params{std::to_string(now()), std::to_string(now())};
        if (req.has_param("scope")) {
            loginRequired(u);
            if (req.get_param_value("scope") == "admin") {
                adminRequired(u);
                filter += " AND (t.shop_id IS NULL OR t.shop_id='')";
            } else if (req.get_param_value("scope") == "seller") {
                auto shop = required(userShop(r, u));
                filter += " AND t.shop_id=?";
                params.push_back(shop.at("id"));
            } else throw Error(422, "invalid_scope", "Phạm vi không hợp lệ.");
        }
        auto page = pageList(r, "vouchers", req, filter, params, 20, "", {"code"});
        page["vouchers"] = page.at("items"); page.erase("items");
        return page;
    }
    loginRequired(u);
    if (path == "/api/account" && method == "PATCH") {
        auto user = u;
        user["name"] = textField(b, "name", 100);
        r.save("users", user);
        return {{"user", safeUser(user)}};
    }
    if (path == "/api/checkout/context") {
        return privateCartView(r, u, true);
    }
    if (path == "/api/addresses") {
        if (method == "GET")
            return {{"addresses", r.list("addresses", "user_id = ?", {u.at("id")})}};
        if (method == "POST") {
            auto id = textField(b, "id", 64, false);
            auto a = id.empty() ? Json{{"id", randomId()}, {"user_id", u["id"]}}
                                : required(r.get("addresses", id));
            if (a["user_id"] != u["id"])
                throw Error(403, "forbidden", "Địa chỉ không thuộc bạn.");
            for (auto key : {"name", "phone", "street", "city", "region"})
                a[key] = textField(b, key, 300);
            if (!std::regex_match(a["phone"].get<std::string>(), std::regex(R"(^[+0-9 ()-]{9,20}$)")))
                throw Error(422, "invalid_phone", "Số điện thoại không hợp lệ.");
            a["is_default"] = b.value("is_default", false);
            if (a["is_default"] == true)
                for (auto other : r.list("addresses", "user_id = ?", {u.at("id")})) {
                    other["is_default"] = false;
                    r.save("addresses", other);
                }
            return {{"address", r.save("addresses", a)}};
        }
    }
    if (p.size() == 3 && p[1] == "addresses" && method == "DELETE") {
        auto a = required(r.get("addresses", p[2]));
        if (a["user_id"] != u["id"])
            throw Error(403, "forbidden", "Không có quyền.");
        r.erase("addresses", p[2]);
        return {{"ok", true}};
    }
    if (path == "/api/cart") {
        if (method == "GET" || method == "HEAD") return privateCartView(r, u);
        auto cart = r.one("carts", "user_id = ?", {u.at("id")});
        if (cart.is_null())
            cart = {{"id", randomId()}, {"user_id", u["id"]}, {"items", Json::array()}};
        cart["revision"] = cart.value("revision", 0LL);
        if (method == "PUT") {
            if (!b.contains("expected_revision") ||
                numberField(b, "expected_revision", 0, 9007199254740991LL) != cart["revision"])
                throw Error(409, "cart_conflict", "Giỏ hàng đã thay đổi ở nơi khác. Vui lòng tải lại.");
            if (!b.contains("items") || !b["items"].is_array() || b["items"].size() > 50)
                throw Error(422, "invalid_cart", "Giỏ hàng không hợp lệ (tối đa 50 mặt hàng).");
            std::set<std::string> seen;
            Json items = Json::array();
            for (auto input : b["items"]) {
                auto id = textField(input, "variant_id", 64);
                if (!seen.insert(id).second)
                    throw Error(422, "duplicate_variant", "Biến thể bị trùng.");
                items.push_back({{"variant_id", id},
                                 {"quantity", numberField(input, "quantity", 1, 99, 1)},
                                 {"selected", input.value("selected", true)}});
            }
            cart["items"] = items;
            cart["revision"] = cart.value("revision", 0LL) + 1;
            r.save("carts", cart);
        }
        auto lines = cartLines(r, cart["items"], method == "PUT");
        return {{"cart", cart}, {"lines", lines}};
    }
    if (path == "/api/wishlist" && method == "GET") {
        Json products = Json::array();
        auto page = pageList(r, "wishlists", req,
            "t.user_id=? AND EXISTS (SELECT 1 FROM products p JOIN shops s ON s.id=p.shop_id "
            "WHERE p.id=t.product_id AND p.active=1 AND s.status='approved')", {u.at("id")});
        auto saved = page.at("items");
        for (auto product : relatedRows(r, "products", "id", saved, "product_id"))
            if (product.value("active", false))
                products.push_back(std::move(product));
        page["products"] = productViews(r, products); page.erase("items");
        return page;
    }
    if (p.size() == 3 && p[1] == "wishlist" && (method == "POST" || method == "DELETE")) {
        required(r.get("products", p[2]));
        auto existing = r.one("wishlists", "user_id = ? AND product_id = ?", {u.at("id"), p[2]});
        if (method == "DELETE") {
            if (!existing.is_null())
                r.erase("wishlists", existing.at("id"));
        } else if (existing.is_null())
            r.save("wishlists", {{"id", randomId()}, {"user_id", u["id"]}, {"product_id", p[2]}});
        return {{"ok", true}};
    }
    if (path == "/api/shops/apply" && method == "POST") {
        if (!userShop(r, u).is_null())
            throw Error(409, "shop_exists", "Bạn đã đăng ký một shop.");
        auto shop = Json{{"id", randomId()},
                         {"owner_id", u["id"]},
                         {"name", textField(b, "name", 120)},
                         {"description", textField(b, "description", 2000)},
                         {"region", textField(b, "region", 100)},
                         {"status", "pending"},
                         {"created_at", now()}};
        return {{"shop", r.save("shops", shop)}};
    }
    if (path == "/api/shops/mine" && method == "PATCH") {
        auto shop = required(userShop(r, u));
        shop["name"] = textField(b, "name", 120);
        shop["description"] = textField(b, "description", 2000);
        shop["region"] = textField(b, "region", 100);
        for (const auto key : {"location", "service_hours", "shipping_note", "returns_note"})
            if (b.contains(key)) shop[key] = textField(b, key, 1000, false);
        return {{"shop", r.save("shops", shop)}};
    }
    if (path == "/api/seller/products" && method == "GET") {
        auto shop = required(userShop(r, u));
        auto page = pageList(r, "products", req, "t.shop_id=?", {shop.at("id")});
        page["products"] = productViews(r, page.at("items"));
        page.erase("items");
        page["shop"] = shop;
        return page;
    }
    if (path == "/api/seller/products" && method == "POST")
        return {{"product", saveProduct(r, u, b, "")}};
    if (p.size() == 4 && p[1] == "seller" && p[2] == "products" &&
        (method == "PUT" || method == "DELETE")) {
        if (method == "PUT")
            return {{"product", saveProduct(r, u, b, p[3])}};
        auto product = required(r.get("products", p[3]));
        manageShop(r, u, product.at("shop_id"));
        product["active"] = false;
        r.save("products", product);
        return {{"ok", true}};
    }
    if (path == "/api/seller/import" && method == "POST") {
        auto shop = required(userShop(r, u));
        auto rows = parseCsv(textField(b, "csv", 500000));
        if (rows.empty() || rows[0] != Json::array({"name", "category", "description", "variant",
                                                    "price", "stock", "weight"}))
            throw Error(422, "csv_header",
                        "Header CSV cần: name,category,description,variant,price,stock,weight");
        if (rows.size() > 201)
            throw Error(422, "csv_limit", "Mỗi lần nhập tối đa 200 dòng.");
        Json preview = Json::array(), errors = Json::array();
        for (std::size_t i = 1; i < rows.size(); ++i) {
            try {
                auto row = rows[i];
                if (row.size() != 7)
                    throw std::runtime_error("Sai số cột");
                auto integer = [](const std::string &s) {
                    std::size_t pos = 0;
                    auto n = std::stoll(s, &pos);
                    if (pos != s.size())
                        throw std::runtime_error("Sai định dạng số");
                    return n;
                };
                Json product{{"shop_id", shop["id"]},
                             {"name", row[0]},
                             {"category", row[1]},
                             {"description", row[2]},
                             {"image", "/assets/product-lifestyle.svg"},
                             {"weight", integer(row[6])},
                             {"variants", Json::array({Json{{"name", row[3]},
                                                            {"price", integer(row[4])},
                                                            {"stock", integer(row[5])}}})}};
                textField(product, "name", 200);
                textField(product, "description", 10000);
                textField(product, "category", 100);
                numberField(product, "weight", 1, 100000);
                numberField(product["variants"][0], "price", 1000, 100000000);
                numberField(product["variants"][0], "stock", 0, 1000000);
                preview.push_back(product);
            } catch (...) {
                errors.push_back(
                    {{"row", i + 1},
                     {"message",
                      "Dữ liệu dòng không hợp lệ. Kiểm tra số cột, nội dung và các số không âm."}});
            }
        }
        if (b.value("commit", false)) {
            if (!errors.empty())
                throw Error(422, "csv_errors", "CSV có lỗi. Chưa nhập dữ liệu.");
            for (auto product : preview)
                saveProduct(r, u, product, "");
        }
        return {{"preview", preview},
                {"errors", errors},
                {"imported", b.value("commit", false) ? preview.size() : 0}};
    }
    if (path == "/api/vouchers" && method == "POST") {
        auto shopId = textField(b, "shop_id", 64, false);
        if (shopId.empty())
            adminRequired(u);
        else {
            auto shop = manageShop(r, u, shopId);
            if (shop.value("status", "") != "approved")
                throw Error(403, "shop_not_approved", "Shop chưa hoạt động.");
        }
        auto code = upper(textField(b, "code", 30));
        if (!std::regex_match(code, std::regex("[A-Z0-9_-]{3,30}")))
            throw Error(422, "invalid_code", "Mã voucher chỉ gồm chữ, số, gạch ngang hoặc gạch dưới.");
        auto type = textField(b, "type", 20);
        if (type != "fixed" && type != "percent")
            throw Error(422, "invalid_type", "Loại voucher không hợp lệ.");
        auto v =
            Json{{"id", randomId()},
                 {"shop_id", shopId},
                 {"code", code},
                 {"type", type},
                 {"value", numberField(b, "value", 1, type == "percent" ? 100 : 10000000)},
                 {"minimum", numberField(b, "minimum", 0, 1000000000)},
                 {"max_discount", numberField(b, "max_discount", 1, 100000000, 1000000)},
                 {"limit", numberField(b, "limit", 1, 100000, 100)},
                 {"starts_at", numberField(b, "starts_at", 0, 4102444800LL, now())},
                 {"ends_at", numberField(b, "ends_at", now() + 60, 4102444800LL, now() + 30 * 86400)},
                 {"active", true}};
        return {{"voucher", r.save("vouchers", v)}};
    }
    if (p.size() == 3 && p[1] == "vouchers" && method == "DELETE") {
        auto v = required(r.get("vouchers", p[2]));
        if (v.value("shop_id", "").empty())
            adminRequired(u);
        else
            manageShop(r, u, v.at("shop_id"));
        v["active"] = false;
        r.save("vouchers", v);
        return {{"ok", true}};
    }
    if ((path == "/api/checkout" || path == "/api/checkout/quote") && method == "POST") {
        const bool quoteOnly = path == "/api/checkout/quote";
        auto key = textField(b, "idempotency_key", 100);
        if (key.size() < 16)
            throw Error(422, "invalid_key", "Thiếu mã chống đặt đơn lặp.");
        auto existing = r.one("checkouts", "buyer_id = ? AND idem_key = ?", {u.at("id"), key});
        if (!existing.is_null())
            return {{"checkout", existing},
                    {"orders", r.list("orders", "checkout_id = ?", {existing.at("id")})}};
        auto pay = textField(b, "method", 20);
        if (pay != "cod" && pay != "payos")
            throw Error(422, "invalid_method", "Phương thức thanh toán không hợp lệ.");
        std::unique_ptr<IPaymentMethod> payment;
        if (pay == "cod")
            payment = std::make_unique<CodPayment>();
        else
            payment = std::make_unique<OnlinePayment>();
        if (payment->requiresGateway() && !gatewayReady())
            throw Error(503, "payment_not_configured",
                        "Chưa thiết lập kênh payOS. Bạn có thể chọn COD.");
        const auto token = textField(b, "quote_token", 160, false);
        std::int64_t quoteExpires = now() + 300;
        if (!quoteOnly) {
            const auto dot = token.find('.');
            if (dot == std::string::npos || dot > 12 || dot == 0 || token.size() - dot != 65 ||
                !std::all_of(token.begin(), token.begin() + dot,
                             [](unsigned char c) { return c >= '0' && c <= '9'; }))
                throw Error(409, "quote_required", "Vui lòng tính lại và xác nhận tổng tiền.");
            quoteExpires = std::stoll(token.substr(0, dot));
            if (quoteExpires <= now() || quoteExpires > now() + 300)
                throw Error(409, "quote_expired", "Báo giá đã hết hạn. Vui lòng tính lại.");
        }
        auto address = required(r.get("addresses", textField(b, "address_id", 64)));
        if (address["user_id"] != u["id"])
            throw Error(403, "forbidden", "Địa chỉ không thuộc bạn.");
        auto cart = required(r.one("carts", "user_id = ?", {u.at("id")}));
        std::map<std::string, Json> grouped;
        Json reservedVariants = Json::array(), reservedVouchers = Json::array();
        std::vector<Json> remaining;
        for (auto item : cartLines(r, cart["items"], true)) {
            if (!item.value("selected", true)) {
                remaining.push_back({{"variant_id", item.at("variant_id")},
                                     {"quantity", item.at("quantity")},
                                     {"selected", false}});
                continue;
            }
            auto v = item.at("variant");
            auto product = item.at("product");
            auto shop = item.at("shop");
            auto quantity = item.value("quantity", 0);
            if (!product.value("active", false) || !v.value("active", false) ||
                shop.value("status", "") != "approved")
                throw Error(409, "unavailable_product", "Có sản phẩm ngừng bán trong giỏ hàng.");
            if (quantity <= 0 || quantity > 99 || v.value("stock", 0) < quantity)
                throw Error(409, "out_of_stock", "Không đủ hàng: " + product.value("name", ""));
            auto id = v["shop_id"].get<std::string>();
            if (!grouped.contains(id))
                grouped[id] = Json::array();
            grouped[id].push_back({{"id", randomId()},
                                   {"variant_id", v["id"]},
                                   {"product_id", product["id"]},
                                   {"name", product["name"]},
                                   {"image", product["image"]},
                                   {"variant_name", v["name"]},
                                   {"quantity", quantity},
                                   {"unit_price", v["price"]},
                                   {"weight", product["weight"]}});
            v["stock"] = v.value("stock", 0) - quantity;
            reservedVariants.push_back(v);
        }
        if (grouped.empty())
            throw Error(422, "empty_cart", "Chưa chọn sản phẩm để đặt hàng.");
        auto gid = randomId();
        auto code =
            now() * 100000 + static_cast<std::int64_t>(std::stoul(randomId(3), nullptr, 16) % 100000);
        auto expires = now() + 900;
        Json group{{"id", gid},
                   {"buyer_id", u["id"]},
                   {"idem_key", key},
                   {"order_code", code},
                   {"method", pay},
                   {"status", payment->requiresGateway() ? payment->initialStatus() : "cod"},
                   {"expires_at", expires},
                   {"total", 0},
                   {"created_at", now()}};
        Json orders = Json::array();
        std::vector<std::int64_t> bases;
        auto settings = siteSettings(r);
        RegionalShipping shipping(settings.value("shipping_local", 20000),
                                  settings.value("shipping_remote", 35000),
                                  settings.value("shipping_step", 5000));
        for (auto &[shopId, items] : grouped) {
            std::vector<Line> snapshotLines;
            int weight = 0;
            for (auto &line : items) {
                snapshotLines.push_back(
                    {line.at("variant_id"), line.value("quantity", 0), Money(line["unit_price"])});
                weight += line.value("weight", 0) * line.value("quantity", 0);
            }
            OrderSnapshot snapshot(std::move(snapshotLines));
            auto subtotal = snapshot.total();
            auto shop = required(r.get("shops", shopId));
            auto coupons = b.value("shop_vouchers", Json::object());
            auto discount =
                discountFor(r, coupons.value(shopId, ""), shopId, subtotal.value(), gid, reservedVouchers);
            auto ship = shipping.calculate(weight, address["region"] == shop["region"]).value();
            auto allocation = allocateDiscount(
                [&] {
                    std::vector<std::int64_t> a;
                    for (auto &l : items)
                        a.push_back(l.value("unit_price", 0LL) * l.value("quantity", 0));
                    return a;
                }(),
                discount);
            for (std::size_t i = 0; i < items.size(); ++i)
                items[i]["discount"] = allocation[i];
            Json order{{"id", randomId()},
                       {"buyer_id", u["id"]},
                       {"shop_id", shopId},
                       {"shop_name", shop["name"]},
                       {"checkout_id", gid},
                       {"status", "new"},
                       {"subtotal", subtotal.value()},
                       {"discount", discount},
                       {"shipping", ship},
                       {"total", subtotal.value() - discount + ship},
                       {"address", address},
                       {"items", items},
                       {"cod_status", "unpaid"},
                       {"created_at", now()},
                       {"stock_released", false}};
            history(order, "new", u.at("id"));
            orders.push_back(order);
            bases.push_back(subtotal.value() - discount);
        }
        auto allBase = std::accumulate(bases.begin(), bases.end(), 0LL);
        auto global = discountFor(r, textField(b, "voucher", 30, false), "", allBase, gid, reservedVouchers);
        auto allocated = allocateDiscount(bases, global);
        Money total;
        for (std::size_t i = 0; i < orders.size(); ++i) {
            auto &order = orders[i];
            order["discount"] = order.value("discount", 0LL) + allocated[i];
            order["total"] = order.value("total", 0LL) - allocated[i];
            std::vector<std::int64_t> amounts;
            for (auto &line : order["items"])
                amounts.push_back(line.value("unit_price", 0LL) * line.value("quantity", 0) -
                                  line.value("discount", 0LL));
            auto perLine = allocateDiscount(amounts, allocated[i]);
            auto items = order["items"];
            order.erase("items");
            for (std::size_t n = 0; n < items.size(); ++n) {
                items[n]["discount"] = items[n].value("discount", 0LL) + perLine[n];
                items[n]["order_id"] = order["id"];
            }
            total = total + Money(order["total"]);
            order["items"] = items;
        }
        group["total"] = total.value();
        // Bind confirmation to stable, server-calculated values, never client-supplied totals.
        // Session IDs are hashed HttpOnly credentials, shared through the database across instances.
        Json snapshot{{"buyer_id", u.at("id")}, {"method", pay},
                      {"cart_revision", cart.value("revision", 0LL)},
                      {"voucher", upper(textField(b, "voucher", 30, false))},
                      {"shop_vouchers", b.value("shop_vouchers", Json::object())},
                      {"total", total.value()}, {"orders", Json::array()}};
        for (auto order : orders) {
            for (const char *field : {"id", "checkout_id", "created_at", "updated_at", "history"})
                order.erase(field);
            for (auto &item : order["items"])
                for (const char *field : {"id", "order_id"})
                    item.erase(field);
            snapshot["orders"].push_back(order);
        }
        const auto expiryText = std::to_string(quoteExpires);
        const auto expected = expiryText + "." +
            hmac(session.at("id"), "checkout-v1|" + expiryText + "|" + snapshot.dump());
        if (!quoteOnly && !constantEqual(token, expected))
            throw Error(409, "quote_changed", "Giỏ hàng hoặc tổng tiền đã đổi. Vui lòng xác nhận lại.");
        if (!quoteOnly) {
            r.saveMany("variants", reservedVariants);
            r.save("checkouts", group);
            r.saveMany("redemptions", reservedVouchers);
            for (auto order : orders) {
                auto items = order.at("items");
                order.erase("items");
                r.save("orders", order);
                r.saveMany("order_items", items);
                notify(r, u.at("id"), "Đặt hàng thành công",
                       "Đơn " + order["id"].get<std::string>().substr(0, 8) + " đã được tạo.");
                auto shop = required(r.get("shops", order.at("shop_id")));
                notify(r, shop.at("owner_id"), "Có đơn hàng mới", "Shop vừa nhận đơn hàng mới.",
                       "/seller/orders");
            }
            cart["items"] = remaining;
            cart["revision"] = cart.value("revision", 0LL) + 1;
            r.save("carts", cart);
        }
        Json result{{"checkout", group}, {"orders", orders}};
        if (quoteOnly)
            result["quote_token"] = expected;
        return result;
    }
    if (p.size() >= 3 && p[1] == "payments") {
        auto g = required(r.get("checkouts", p[2]));
        if (!admin(u) && g["buyer_id"] != u["id"])
            throw Error(403, "forbidden", "Không có quyền xem giao dịch.");
        if (method == "GET" || (p.size() == 4 && p[3] == "sync" && method == "POST")) {
            auto orders = orderViews(r, r.list("orders", "checkout_id = ?", {g.at("id")}));
            return {{"checkout", g}, {"orders", orders}};
        }
        if (p.size() == 4 && p[3] == "cancel" && method == "POST") {
            if (g["status"] != "pending")
                throw Error(409, "cannot_cancel", "Giao dịch không còn ở trạng thái chờ.");
            cancelGroup(r, g, "cancelled", u.at("id"));
            return {{"checkout", g}};
        }
    }
    if ((path == "/api/orders" || path == "/api/seller/orders" || path == "/api/admin/orders") &&
        method == "GET") {
        std::string where;
        Params params;
        if (path == "/api/admin/orders")
            adminRequired(u);
        else if (path == "/api/seller/orders") {
            auto shop = required(userShop(r, u));
            where = "t.shop_id=?";
            params.push_back(shop.at("id"));
        } else {
            where = "t.buyer_id=?";
            params.push_back(u.at("id"));
        }
        auto status = req.get_param_value("status");
        if (status.size() > 40)
            throw Error(422, "invalid_status", "Trạng thái không hợp lệ.");
        if (!status.empty()) {
            where += where.empty() ? "t.status=?" : " AND t.status=?";
            params.push_back(status);
        }
        auto page = pageList(r, "orders", req, where, params, 20);
        page["orders"] = orderViews(r, page.at("items"));
        page.erase("items");
        return page;
    }
    if (p.size() >= 3 && p[1] == "orders") {
        auto o = required(r.get("orders", p[2]));
        if (!accessOrder(r, u, o))
            throw Error(403, "forbidden", "Bạn không có quyền truy cập đơn này.");
        if (p.size() == 3 && method == "GET")
            return {{"order", orderView(r, o)}};
        if (p.size() == 4 && p[3] == "status" && method == "POST") {
            auto next = textField(b, "status", 30);
            auto current = o.value("status", "");
            bool buyer = o["buyer_id"] == u["id"];
            auto shop = required(r.get("shops", o.at("shop_id")));
            bool seller = shop["owner_id"] == u["id"];
            if (!admin(u) &&
                !((buyer && next == "cancelled" &&
                   (current == "new" || current == "confirmed" || current == "preparing")) ||
                  (buyer && next == "completed" && current == "delivered") ||
                  (seller && ((current == "new" && next == "confirmed") ||
                              (current == "confirmed" && next == "preparing")))))
                throw Error(403, "forbidden", "Bạn không được thực hiện chuyển trạng thái này.");
            requireTransition(current, next);
            auto g = required(r.get("checkouts", o.at("checkout_id")));
            if (next != "cancelled" && g["method"] == "payos" && g["status"] != "paid")
                throw Error(409, "payment_pending",
                            "Chỉ xử lý đơn online sau khi thanh toán được xác minh.");
            if (next == "cancelled") {
                if (g["status"] == "pending") {
                    cancelGroup(r, g, "cancelled", u.at("id"));
                    return {{"order", orderView(r, required(r.get("orders", o.at("id"))))}};
                }
                releaseOrder(r, o);
                if (g["status"] == "paid" || o.value("cod_status", "") == "paid")
                    o["refund_due"] = o["total"];
            }
            history(o, next, u.at("id"));
            if (next == "delivered")
                o["delivered_at"] = now();
            r.save("orders", o);
            audit(r, u, "order_" + next, o.at("id"));
            notify(r, o.at("buyer_id"), "Đơn hàng có cập nhật", "Trạng thái mới: " + next);
            return {{"order", orderView(r, o)}};
        }
        if (p.size() == 4 && p[3] == "collect" && method == "POST") {
            adminRequired(u);
            auto g = required(r.get("checkouts", o.at("checkout_id")));
            if (g["method"] != "cod" || (o["status"] != "delivered" && o["status"] != "completed"))
                throw Error(409, "invalid_collect", "Chỉ ghi thu COD cho đơn đã giao.");
            o["cod_status"] = "paid";
            auto returned = r.one("returns", "order_id = ?", {o.at("id")});
            if (!returned.is_null() && returned["status"] == "received")
                o["refund_due"] = returned["amount"];
            r.save("orders", o);
            audit(r, u, "collect_cod", o.at("id"));
            return {{"order", orderView(r, o)}};
        }
        if (p.size() == 4 && p[3] == "return" && method == "POST") {
            if (o["buyer_id"] != u["id"] || (o["status"] != "delivered" && o["status"] != "completed") ||
                o.value("delivered_at", 0LL) + 7 * 86400 < now())
                throw Error(409, "return_not_allowed",
                            "Đơn không còn đủ điều kiện trả hàng (7 ngày sau khi giao).");
            auto lines = r.list("order_items", "order_id = ?", {o.at("id")});
            auto requested = b.value("items", Json::array());
            if (!requested.is_array() || requested.empty())
                throw Error(422, "return_items", "Chọn ít nhất một mặt hàng để trả.");
            std::set<std::string> seen;
            Json items = Json::array();
            std::int64_t amount = 0;
            int selected = 0, original = 0;
            for (auto l : lines)
                original += l.value("quantity", 0);
            for (auto input : requested) {
                auto id = textField(input, "item_id", 64);
                auto it = std::find_if(lines.begin(), lines.end(),
                                       [&](const Json &l) { return l["id"] == id; });
                if (it == lines.end() || !seen.insert(id).second)
                    throw Error(422, "return_items", "Mặt hàng trả không hợp lệ.");
                auto qty = numberField(input, "quantity", 1, it->value("quantity", 0));
                auto net =
                    it->value("unit_price", 0LL) * it->value("quantity", 0) - it->value("discount", 0LL);
                auto value = net / it->value("quantity", 1) * qty;
                amount += value;
                selected += static_cast<int>(qty);
                items.push_back({{"item_id", id}, {"quantity", qty}, {"amount", value}});
            }
            if (selected == original)
                amount = o.value("total", 0LL);
            auto ret = Json{{"id", randomId()},    {"order_id", o["id"]},
                            {"buyer_id", u["id"]}, {"status", "requested"},
                            {"items", items},      {"reason", textField(b, "reason", 2000)},
                            {"amount", amount},    {"created_at", now()}};
            r.save("returns", ret);
            notify(r, required(r.get("shops", o.at("shop_id"))).at("owner_id"), "Có yêu cầu trả hàng",
                   "Người mua yêu cầu trả hàng.", "/seller/orders");
            return {{"return_request", ret}};
        }
    }
    if (p.size() == 3 && p[1] == "returns" && method == "POST") {
        auto ret = required(r.get("returns", p[2]));
        auto o = required(r.get("orders", ret.at("order_id")));
        manageShop(r, u, o.at("shop_id"));
        auto next = textField(b, "status", 20);
        auto current = ret.value("status", "");
        if (!((current == "requested" && (next == "approved" || next == "rejected")) ||
              (current == "approved" && next == "received")))
            throw Error(409, "invalid_transition", "Trạng thái trả hàng không hợp lệ.");
        if (next == "received")
            adminRequired(u);
        ret["status"] = next;
        ret["updated_at"] = now();
        if (next == "received") {
            auto g = required(r.get("checkouts", o.at("checkout_id")));
            if (g["status"] == "paid" || o.value("cod_status", "") == "paid")
                o["refund_due"] = ret["amount"];
            for (auto line : ret["items"]) {
                auto snapshot = required(r.get("order_items", line.at("item_id")));
                auto v = required(r.get("variants", snapshot.at("variant_id")));
                v["stock"] = v.value("stock", 0LL) + line.value("quantity", 0LL);
                r.save("variants", v);
            }
            r.save("orders", o);
        }
        r.save("returns", ret);
        audit(r, u, "return_" + next, p[2]);
        notify(r, o.at("buyer_id"), "Cập nhật trả hàng", "Yêu cầu trả hàng: " + next);
        return {{"return_request", ret}};
    }
    if (path == "/api/admin/refunds" && method == "POST") {
        adminRequired(u);
        auto o = required(r.get("orders", textField(b, "order_id", 64)));
        auto ref = textField(b, "reference", 150);
        for (auto old : r.list("refunds", "order_id = ?", {o.at("id")}))
            if (old.value("reference", "") == ref)
                return {{"refund", old}};
        auto due = o.value("refund_due", 0LL);
        std::int64_t already = 0;
        for (auto old : r.list("refunds", "order_id = ?", {o.at("id")}))
            already += old.value("amount", 0LL);
        auto amount = numberField(b, "amount", 1, 1000000000000LL);
        if (amount > due - already)
            throw Error(409, "refund_exceeded", "Số tiền vượt mức còn được hoàn.");
        auto refund = Json{
            {"id", randomId()},       {"order_id", o["id"]}, {"checkout_id", o["checkout_id"]},
            {"amount", amount},       {"reference", ref},    {"note", textField(b, "note", 1000, false)},
            {"recorded_by", u["id"]}, {"created_at", now()}, {"status", "completed"}};
        r.save("refunds", refund);
        audit(r, u, "refund_recorded", refund.at("id"));
        notify(r, o.at("buyer_id"), "Đã ghi nhận hoàn tiền",
               "Admin ghi nhận hoàn " + std::to_string(amount) + " VNĐ. Tham chiếu: " + ref);
        return {{"refund", refund}};
    }
    if (path == "/api/reviews" && method == "POST") {
        auto item = required(r.get("order_items", textField(b, "order_item_id", 64)));
        auto order = required(r.get("orders", item.at("order_id")));
        if (order["buyer_id"] != u["id"] ||
            (order["status"] != "delivered" && order["status"] != "completed"))
            throw Error(403, "review_not_allowed", "Chỉ đánh giá mặt hàng bạn đã nhận.");
        auto review = r.one("reviews", "order_item_id = ?", {item.at("id")});
        if (review.is_null())
            review = {{"id", randomId()},
                      {"buyer_id", u["id"]},
                      {"product_id", item["product_id"]},
                      {"order_item_id", item["id"]},
                      {"created_at", now()}};
        review["name"] = u["name"];
        review["rating"] = numberField(b, "rating", 1, 5);
        review["comment"] = textField(b, "comment", 3000);
        review["hidden"] = review.value("hidden", false);
        r.save("reviews", review);
        return {{"review", review}};
    }
    if (path == "/api/conversations") {
        if (method == "POST") {
            auto shop = required(r.get("shops", textField(b, "shop_id", 64)));
            if (shop["owner_id"] == u["id"])
                throw Error(422, "own_shop_chat", "Bạn không thể chat với chính shop của mình.");
            auto c = r.one("conversations", "buyer_id = ? AND shop_id = ?", {u.at("id"), shop.at("id")});
            if (c.is_null())
                c = r.save("conversations", {{"id", randomId()},
                                             {"buyer_id", u["id"]},
                                             {"shop_id", shop["id"]},
                                             {"shop_name", shop["name"]},
                                             {"buyer_name", u["name"]},
                                             {"updated_at", now()}});
            return {{"conversation", c}};
        }
        if (method == "GET") {
            Json list = Json::array();
            auto shop = userShop(r, u);
            const auto where = shop.is_null() ? "buyer_id=?" : "buyer_id=? OR shop_id=?";
            Params params{u.at("id")};
            if (!shop.is_null())
                params.push_back(shop.at("id"));
            auto page = pageList(r, "conversations", req, "(" + std::string(where) + ")", params,
                50, "CAST(" + jsonField(r, "t", "updated_at") + " AS BIGINT) DESC,t.id ASC",
                {"shop_name", "buyer_name"});
            page["conversations"] = page.at("items"); page.erase("items");
            return page;
        }
    }
    if (p.size() == 4 && p[1] == "conversations" && p[3] == "messages") {
        auto c = required(r.get("conversations", p[2]));
        auto shop = required(r.get("shops", c.at("shop_id")));
        if (c["buyer_id"] != u["id"] && shop["owner_id"] != u["id"])
            throw Error(403, "forbidden", "Bạn không thuộc cuộc hội thoại này.");
        if (method == "POST") {
            rateLimit(r, "chat:" + u.at("id").get<std::string>(), 30, 60);
            const auto sequence = c.value("message_sequence", 0LL) + 1;
            auto m = r.save("messages", {{"id", randomId()},
                                         {"conversation_id", c["id"]},
                                         {"sender_id", u["id"]},
                                         {"sender_name", u["name"]},
                                         {"text", textField(b, "text", 2000)},
                                         {"sequence", sequence},
                                         {"created_at", now()}});
            c["message_sequence"] = sequence;
            c["updated_at"] = now();
            c["last_message"] = m["text"];
            r.save("conversations", c);
            return {{"message", m}};
        }
        if (method == "GET") {
            const bool after = req.has_param("after_sequence"), before = req.has_param("before_time");
            if (after && before)
                throw Error(422, "invalid_cursor", "Con trỏ tin nhắn không hợp lệ.");
            const std::string direction = after ? "after" : "before";
            Params params{c.at("id")};
            std::string where = "m.conversation_id=?";
            auto created = "COALESCE(CAST(" + jsonField(r, "m", "created_at") + " AS BIGINT),0)";
            auto sequence = "COALESCE(CAST(" + jsonField(r, "m", "sequence") + " AS BIGINT),0)";
            auto cursorNumber = [&](const std::string &key) {
                auto value = req.get_param_value(key);
                if (value.empty() || value.size() > 18 ||
                    !std::all_of(value.begin(), value.end(),
                                 [](unsigned char x) { return x >= '0' && x <= '9'; }))
                    throw Error(422, "invalid_cursor", "Con trỏ tin nhắn không hợp lệ.");
                return value;
            };
            if (after) {
                where += " AND " + sequence + ">CAST(? AS BIGINT)";
                params.push_back(cursorNumber("after_sequence"));
            }
            if (before) {
                auto time = req.get_param_value(direction + "_time");
                auto id = req.get_param_value(direction + "_id");
                if (time.empty() || time.size() > 12 || id.empty() || id.size() > 64 ||
                    !std::all_of(time.begin(), time.end(),
                                 [](unsigned char x) { return x >= '0' && x <= '9'; }))
                    throw Error(422, "invalid_cursor", "Con trỏ tin nhắn không hợp lệ.");
                auto seq = cursorNumber("before_sequence");
                where += " AND (" + sequence + "<CAST(? AS BIGINT) OR (" + sequence +
                         "=CAST(? AS BIGINT) AND (" + created + "<CAST(? AS BIGINT) OR (" + created +
                         "=CAST(? AS BIGINT) AND m.id<?))))";
                params.insert(params.end(), {seq, seq, time, time, id});
            }
            const auto limit = after ? 100 : 50;
            Json messages = Json::array();
            for (const auto &row : r.query("SELECT m.payload FROM messages m WHERE " + where +
                                               " ORDER BY " + sequence + (after ? " ASC," : " DESC,") +
                                               created + (after ? " ASC,m.id ASC" : " DESC,m.id DESC") +
                                               " LIMIT " + std::to_string(limit + 1),
                                           params))
                messages.push_back(Json::parse(row.at("payload")));
            bool more = messages.size() > static_cast<std::size_t>(limit);
            if (more)
                messages.erase(messages.end() - 1);
            if (!after)
                std::reverse(messages.begin(), messages.end());
            return {{"messages", messages}, {"conversation", c}, {"has_more", more}};
        }
    }
    if (path == "/api/notifications") {
        if (method == "GET") {
            auto page = pageList(r, "notifications", req, "t.user_id=?", {u.at("id")});
            page["notifications"] = page.at("items");
            page.erase("items");
            return page;
        }
        if (method == "POST") {
            for (auto n : r.list("notifications", "user_id = ?", {u.at("id")})) {
                n["read"] = true;
                r.save("notifications", n);
            }
            return {{"ok", true}};
        }
    }
    if (path == "/api/dashboard" && method == "GET") {
        auto scope = req.get_param_value("scope");
        auto shop = userShop(r, u);
        if (scope == "admin")
            adminRequired(u);
        else if (shop.is_null())
            throw Error(403, "no_shop", "Bạn chưa có shop.");
        auto result = dashboardData(r, scope == "admin" ? "" : shop.at("id").get<std::string>());
        result["orders"] = orderViews(r, result.at("orders"));
        return result;
    }

    if ((path == "/api/seller/export" || path == "/api/admin/export") && method == "GET") {
        const bool all = path == "/api/admin/export";
        if (all) adminRequired(u);
        const auto shopId = all ? std::string() : required(userShop(r, u)).at("id").get<std::string>();
        const bool products = req.get_param_value("kind") == "products";
        const auto table = products ? std::string("products") : std::string("orders");
        const auto ceiling = r.query("SELECT COALESCE(MAX(id),'') AS id FROM " + table +
            (all ? "" : " WHERE shop_id=?"), all ? Params{} : Params{shopId}).front().at("id");
        auto cursor = std::make_shared<std::string>();
        auto started = std::make_shared<bool>(false);
        res.set_header("Content-Disposition", "attachment; filename=shoppe-" + table + ".csv");
        res.set_chunked_content_provider("text/csv; charset=utf-8",
            [this, shopId, all, products, table, ceiling, cursor, started](size_t, httplib::DataSink &sink) {
                // No full export in memory and no database connection held while writing the socket.
                std::string csv;
                if (!*started) {
                    csv = "\xEF\xBB\xBF";
                    csv += products ? "name,category,description,variant,price,stock,weight\r\n"
                                    : "order_id,shop,status,total,created_at\r\n";
                    *started = true;
                }
                auto tx = db_.begin(true);
                Repository repo(*tx);
                Params params{*cursor, ceiling};
                if (!all) params.push_back(shopId);
                Json records = Json::array();
                for (const auto &row : repo.query("SELECT payload FROM " + table +
                    " WHERE id>? AND id<=?" + (all ? "" : " AND shop_id=?") + " ORDER BY id LIMIT 200", params))
                    records.push_back(Json::parse(row.at("payload")));
                if (products) {
                    std::map<std::string, Json> byId;
                    for (const auto &product : records) byId[product.at("id")] = product;
                    for (auto variant : relatedRows(repo, "variants", "product_id", records)) {
                        const auto &product = byId.at(variant.at("product_id"));
                        csv += csvCell(product.value("name", "")) + "," + csvCell(product.value("category", "")) +
                            "," + csvCell(product.value("description", "")) + "," + csvCell(variant.value("name", "")) +
                            "," + std::to_string(variant.value("price", 0LL)) + "," +
                            std::to_string(variant.value("stock", 0LL)) + "," + std::to_string(product.value("weight", 0)) + "\r\n";
                    }
                } else for (const auto &order : records)
                    csv += csvCell(order.at("id")) + "," + csvCell(order.value("shop_name", "")) + "," +
                        csvCell(order.value("status", "")) + "," + std::to_string(order.value("total", 0LL)) + "," +
                        std::to_string(order.value("created_at", 0LL)) + "\r\n";
                if (!records.empty()) *cursor = records.back().at("id");
                tx->commit();
                if (!csv.empty() && !sink.write(csv.data(), csv.size())) return false;
                if (records.size() < 200) sink.done();
                return true;
            });
        return Json::object();
    }
    if (path.rfind("/api/admin/", 0) == 0) {
        adminRequired(u);
        if (path == "/api/admin/catalog/status" && method == "GET")
            return demoCatalogStatus(r, u);
        if (path == "/api/admin/catalog/commit" && method == "POST") {
            auto result = commitDemoCatalog(r, u, textField(b, "preview_token", 100));
            audit(r, u, "catalog_api_import", result.at("shop_id"));
            return result;
        }
        if (path == "/api/admin/products" && method == "POST")
            return {{"product", saveProduct(r, u, b, "")}};
        if (p.size() == 4 && p[2] == "products" && method == "PUT")
            return {{"product", saveProduct(r, u, b, p[3])}};
        if (path == "/api/admin/shops" && method == "GET") {
            std::string where;
            Params params;
            const auto status = req.get_param_value("status");
            if (!status.empty()) {
                if (status != "approved" && status != "pending" && status != "rejected" && status != "suspended")
                    throw Error(422, "invalid_status", "Trạng thái không hợp lệ.");
                where = "t.status=?"; params.push_back(status);
            }
            auto page = pageList(r, "shops", req, where, params, 50, "", {"name", "description"});
            page["shops"] = page.at("items"); page.erase("items");
            if (req.get_param_value("view") == "selector")
                for (auto &shop : page["shops"]) shop = {{"id", shop.at("id")}, {"name", shop.at("name")}};
            return page;
        }
        if (p.size() == 4 && p[2] == "shops" && method == "POST") {
            auto shop = required(r.get("shops", p[3]));
            auto state = textField(b, "status", 20);
            if (state != "approved" && state != "rejected" && state != "suspended")
                throw Error(422, "invalid_status", "Trạng thái shop không hợp lệ.");
            shop["status"] = state;
            r.save("shops", shop);
            audit(r, u, "shop_" + state, p[3]);
            notify(r, shop.at("owner_id"), "Cập nhật shop", "Trạng thái shop: " + state, "/seller");
            return {{"shop", shop}};
        }
        if (path == "/api/admin/users" && method == "GET") {
            Json users = Json::array();
            std::string where;
            Params params;
            const auto role = req.get_param_value("role"), active = req.get_param_value("active");
            if (!role.empty()) {
                if (role != "buyer" && role != "admin") throw Error(422, "invalid_role", "Vai trò không hợp lệ.");
                where = "t.role=?"; params.push_back(role);
            }
            if (!active.empty()) {
                if (active != "true" && active != "false") throw Error(422, "invalid_status", "Trạng thái không hợp lệ.");
                where += (where.empty() ? "" : " AND ") +
                    std::string("COALESCE(CAST(") + jsonField(r, "t", "active") + " AS TEXT),'true') IN (?,?)";
                params.push_back(active); params.push_back(active == "true" ? "1" : "0");
            }
            auto page = pageList(r, "users", req, where, params, 50, "", {"name", "email"});
            for (auto user : page.at("items"))
                users.push_back(safeUser(user));
            page["users"] = users; page.erase("items"); return page;
        }
        if (p.size() == 4 && p[2] == "users" && method == "POST") {
            auto user = required(r.get("users", p[3]));
            if (user["id"] == u["id"])
                throw Error(409, "self_update", "Không thay đổi quyền/khóa chính mình tại đây.");
            if (b.contains("active"))
                user["active"] = b.at("active").get<bool>();
            if (b.contains("role")) {
                auto role = textField(b, "role", 20);
                if (role != "buyer" && role != "admin")
                    throw Error(422, "invalid_role", "Vai trò không hợp lệ.");
                user["role"] = role;
            }
            r.save("users", user);
            if (!user.value("active", true))
                for (auto s : r.list("sessions", "user_id = ?", {user.at("id")}))
                    r.erase("sessions", s.at("id"));
            audit(r, u, "user_updated", p[3]);
            return {{"user", safeUser(user)}};
        }
        if (path == "/api/admin/catalog/import" && method == "POST") {
            auto file = (std::filesystem::path(env("SCHEMA_PATH", "database/schema.sql")).parent_path() /
                         "demo-catalog.json")
                            .string();
            auto result = importDemoCatalog(r, u, file);
            audit(r, u, "demo_catalog_imported", result.at("shop_id"));
            return result;
        }
        if (path == "/api/admin/payments" && method == "GET") {
            auto page = pageList(r, "checkouts", req);
            page["checkouts"] = page.at("items");
            page.erase("items");
            page["events"] = relatedRows(r, "payment_events", "checkout_id", page.at("checkouts"));
            return page;
        }
        if (p.size() == 5 && p[2] == "payments" && p[4] == "refund" && method == "POST") {
            auto group = required(r.get("checkouts", p[3]));
            bool excess = group["status"] == "paid" && group.value("excess_amount", 0LL) > 0;
            if (group["status"] != "review" && group["status"] != "refunded" && !excess)
                throw Error(409, "not_in_review", "Giao dịch không thuộc diện đối soát hoàn tiền.");
            auto ref = textField(b, "reference", 150);
            std::int64_t refunded = 0;
            for (auto old : r.list("refunds", "checkout_id = ?", {group.at("id")})) {
                if (old.value("reference", "") == ref)
                    return {{"refund", old}};
                if (!excess || old["order_id"].is_null())
                    refunded += old.value("amount", 0LL);
            }
            auto amount = numberField(b, "amount", 1, 1000000000000LL);
            auto limit =
                excess ? group.value("excess_amount", 0LL) : group.value("received_amount", 0LL);
            if (amount > limit - refunded)
                throw Error(409, "refund_exceeded", "Số tiền vượt mức giao dịch còn được hoàn.");
            auto refund = r.save("refunds", {{"id", randomId()},
                                             {"order_id", nullptr},
                                             {"checkout_id", group["id"]},
                                             {"amount", amount},
                                             {"reference", ref},
                                             {"recorded_by", u["id"]},
                                             {"status", "completed"},
                                             {"created_at", now()}});
            if (excess) {
                group["excess_refunded_amount"] = refunded + amount;
                group["needs_reconciliation"] = refunded + amount < limit;
            } else if (refunded + amount == limit)
                group["status"] = "refunded";
            r.save("checkouts", group);
            audit(r, u, "review_refund", refund.at("id"));
            notify(r, group.at("buyer_id"), "Đã ghi nhận hoàn tiền đối soát",
                   "Số tiền: " + std::to_string(amount) + " VNĐ. Tham chiếu: " + ref);
            return {{"refund", refund}};
        }
        if (path == "/api/admin/reviews" && method == "GET") {
            auto page = pageList(r, "reviews", req);
            page["reviews"] = page.at("items");
            page.erase("items");
            return page;
        }
        if (path == "/api/admin/outbox" && method == "GET") {
            Json list = Json::array();
            auto page = pageList(r, "outbox", req);
            for (auto item : page.at("items")) {
                item.erase("text");
                list.push_back(item);
            }
            page["outbox"] = list;
            page.erase("items");
            return page;
        }
        if (path == "/api/admin/outbox/retry" && method == "POST") {
            const auto requeue = [&](Json item) {
                item["status"] = "queued"; item["attempts"] = 0; item["next_attempt_at"] = 0;
                item["delivery_uncertain"] = false;
                r.save("outbox", item);
            };
            if (b.contains("id")) {
                auto item = required(r.get("outbox", textField(b, "id", 64)));
                if (item.value("status", "") != "failed")
                    throw Error(409, "mail_not_failed", "Thư đang xử lý hoặc đã gửi.");
                if (item.value("delivery_uncertain", false) && !b.value("confirm_uncertain", false))
                    throw Error(422, "confirm_delivery", "Cần kiểm tra lần gửi cuối trước khi thử lại.");
                requeue(item);
                return {{"ok", true}, {"retried", 1}};
            }
            httplib::Request batch;
            batch.params.emplace("page_size", "100");
            auto page = pageList(r, "outbox", batch, "t.status='failed' AND COALESCE(CAST(" +
                jsonField(r, "t", "delivery_uncertain") + " AS TEXT),'false') NOT IN ('true','1')");
            for (auto item : page.at("items")) requeue(item);
            return {{"ok", true}, {"retried", page.at("items").size()}};
        }
        if (path == "/api/admin/audit" && method == "GET") {
            auto page = pageList(r, "audit", req);
            page["audit"] = page.at("items");
            page.erase("items");
            return page;
        }
        if (p.size() == 4 && p[2] == "reviews" && method == "POST") {
            auto review = required(r.get("reviews", p[3]));
            review["hidden"] = b.value("hidden", true);
            r.save("reviews", review);
            audit(r, u, "review_moderated", p[3]);
            return {{"ok", true}};
        }
        if (path == "/api/admin/settings") {
            if (method == "GET")
                return {{"settings", siteSettings(r)}};
            if (method == "POST") {
                auto s = siteSettings(r);
                s["banner_title"] = textField(b, "banner_title", 150);
                s["banner_subtitle"] = textField(b, "banner_subtitle", 300);
                if (!b.contains("categories") || !b["categories"].is_array() ||
                    b["categories"].empty() || b["categories"].size() > 30)
                    throw Error(422, "invalid_categories", "Cần từ 1 đến 30 danh mục.");
                std::set<std::string> seen;
                for (auto c : b["categories"]) {
                    auto category = textField(Json{{"category", c}}, "category", 100);
                    if (!seen.insert(category).second)
                        throw Error(422, "duplicate_category", "Danh mục bị trùng.");
                }
                s["categories"] = b["categories"];
                s["shipping_local"] = numberField(b, "shipping_local", 0, 500000, 20000);
                s["shipping_remote"] = numberField(b, "shipping_remote", 0, 500000, 35000);
                s["shipping_step"] = numberField(b, "shipping_step", 0, 100000, 5000);
                audit(r, u, "settings_updated", "site");
                return {{"settings", r.save("settings", s)}};
            }
        }
        if (path == "/api/admin/products" && method == "GET") {
            auto page = pageList(r, "products", req);
            page["products"] = productViews(r, page.at("items"));
            page.erase("items");
            if (req.get_param_value("include") == "editor") {
                // One round trip/snapshot for the product screen, rather than waking three instances.
                page["catalog"] = demoCatalogStatus(r, u);
                page["shops"] = Json::array();
                httplib::Request selector;
                auto shops = pageList(r, "shops", selector, "t.status=?", {"approved"});
                for (const auto &shop : shops.at("items"))
                    page["shops"].push_back({{"id", shop.at("id")}, {"name", shop.at("name")}});
            }
            return page;
        }
        if (p.size() == 4 && p[2] == "products" && method == "POST") {
            auto product = required(r.get("products", p[3]));
            product["active"] = b.value("active", false);
            r.save("products", product);
            audit(r, u, "product_moderated", p[3]);
            return {{"product", product}};
        }
    }
    throw Error(404, "not_found", "Không tìm thấy chức năng này.");
}

void Application::ensurePayment(const std::string &id) {
    if (!gatewayReady())
        throw Error(503, "payment_not_configured", "Chưa thiết lập payOS.");
    Json group;
    {
        auto tx = db_.begin();
        Repository r(*tx);
        group = required(r.get("checkouts", id));
        tx->commit();
    }
    if (group.value("status", "") != "pending" || group.contains("checkout_url"))
        return;
    // A stable orderCode makes recovery possible after a network timeout.
    Json data;
    try {
        data =
            gatewayCall("GET", "/v2/payment-requests/" + std::to_string(group.value("order_code", 0LL)));
    } catch (const Error &e) {
        if (e.code == "gateway_unavailable")
            throw;
    }
    if (data.is_null()) {
        auto code = group.value("order_code", 0LL);
        Json payload{
            {"orderCode", code},
            {"amount", group["total"]},
            {"description", "SP" + std::to_string(code).substr(std::to_string(code).size() - 7)},
            {"returnUrl", appUrl_ + "/payment/" + id},
            {"cancelUrl", appUrl_ + "/payment/" + id + "?cancelled=1"},
            {"expiredAt", group["expires_at"]}};
        Json signedFields{{"amount", payload["amount"]},
                          {"cancelUrl", payload["cancelUrl"]},
                          {"description", payload["description"]},
                          {"orderCode", payload["orderCode"]},
                          {"returnUrl", payload["returnUrl"]}};
        payload["signature"] = hmac(env("PAYOS_CHECKSUM_KEY"), signatureData(signedFields));
        data = gatewayCall("POST", "/v2/payment-requests", payload);
    }
    auto tx = db_.begin();
    Repository r(*tx);
    group = required(r.get("checkouts", id));
    if (data.contains("checkoutUrl")) {
        auto url = data["checkoutUrl"].get<std::string>();
        if (url.rfind("https://pay.payos.vn/", 0) != 0)
            throw Error(502, "invalid_checkout_url", "Đường dẫn thanh toán không hợp lệ.");
        group["checkout_url"] = url;
    }
    if (data.contains("qrCode"))
        group["qr_code"] = data["qrCode"];
    group["payment_link_id"] = data.value("id", data.value("paymentLinkId", ""));
    r.save("checkouts", group);
    // Creation responses have no transaction list. A query/recovery response does.
    if (data.contains("amountPaid"))
        recordPaymentSnapshot(r, group, data);
    tx->commit();
}
bool Application::processMail() {
    if (!mailSender_ && (env("RESEND_API_KEY").empty() || env("EMAIL_FROM").empty()))
        return false;
    try {
        Json mail;
        Json user;
        {
            auto tx = db_.begin();
            Repository r(*tx);
            const auto number = [&](const char *name) {
                return "COALESCE(CAST(" + jsonField(r, "o", name) + " AS BIGINT),0)";
            };
            auto rows = r.query("SELECT o.payload FROM outbox o WHERE "
                                "((o.status IN ('queued','failed') AND " + number("attempts") +
                                    "<3) OR (o.status='sending' AND " + number("claimed_at") + "<?)) AND " +
                                    number("next_attempt_at") + "<=? ORDER BY " + number("created_at") +
                                    ",o.id LIMIT 1",
                                {std::to_string(now() - 120), std::to_string(now())});
            if (!rows.empty())
                mail = Json::parse(rows.front().at("payload"));
            if (mail.is_null()) {
                tx->commit();
                return false;
            }
            if (mail.value("attempts", 0) >= 3) {
                // A crash after the final send must not leave an eternal 'sending' lease.
                // Delivery may have happened; expose it for explicit review rather than resend automatically.
                mail["status"] = "failed";
                mail["delivery_uncertain"] = true;
                mail["updated_at"] = now();
                r.save("outbox", mail);
                tx->commit();
                return true;
            }
            mail["status"] = "sending";
            mail["claimed_at"] = now();
            mail["attempts"] = mail.value("attempts", 0) + 1;
            r.save("outbox", mail);
            user = required(r.get("users", mail.at("user_id")));
            tx->commit();
        }
        bool sent;
        if (mailSender_)
            sent = mailSender_(mail, user);
        else {
            httplib::SSLClient client("api.resend.com");
            client.set_connection_timeout(3);
            client.set_read_timeout(5);
            Json payload{{"from", env("EMAIL_FROM")},
                         {"to", Json::array({user["email"]})},
                         {"subject", mail["subject"]},
                         {"text", mail["text"]}};
            auto response = client.Post("/emails",
                                        {{"Authorization", "Bearer " + env("RESEND_API_KEY")},
                                         {"Idempotency-Key", mail.at("id")}},
                                        payload.dump(), "application/json");
            sent = response && response->status >= 200 && response->status < 300;
        }
        auto tx = db_.begin();
        Repository r(*tx);
        mail = required(r.get("outbox", mail.at("id")));
        mail["status"] = sent ? "sent" : "failed";
        mail["updated_at"] = now();
        mail["next_attempt_at"] = now() + (mail.value("attempts", 1) == 1 ? 15 : 60);
        r.save("outbox", mail);
        tx->commit();
        return true;
    } catch (...) {
        std::cerr << "Email processing deferred; order data is committed.\n";
        return false;
    }
}
void Application::seed() {
    auto tx = db_.begin();
    Repository r(*tx);
    auto email = env("BOOTSTRAP_ADMIN_EMAIL"), password = env("BOOTSTRAP_ADMIN_PASSWORD");
    if (!email.empty() && !password.empty()) {
        validateEmail(email);
        if (r.one("users", "email = ?", {email}).is_null())
            r.save("users", {{"id", randomId()},
                             {"email", email},
                             {"name", "Quản trị viên"},
                             {"role", "admin"},
                             {"password_hash", passwordHash(password)},
                             {"verified", true},
                             {"active", true},
                             {"created_at", now()}});
    }
    if (!production_ && env("SEED_DEMO") == "true" &&
        r.one("users", "email = ?", {"admin@shoppe.local"}).is_null()) {
        auto pass = env("DEMO_PASSWORD");
        if (pass.size() < 12)
            throw std::runtime_error(
                "Set DEMO_PASSWORD (at least 12 characters) for explicit development seed.");
        auto hash = passwordHash(pass);
        for (auto role : {"admin", "seller", "buyer"})
            r.save("users", {{"id", role},
                             {"email", std::string(role) + "@shoppe.local"},
                             {"name", std::string(role) == "admin"    ? "Quản trị viên"
                                      : std::string(role) == "seller" ? "An Nhiên Store"
                                                                      : "Minh Anh"},
                             {"role", std::string(role) == "admin" ? "admin" : "buyer"},
                             {"password_hash", hash},
                             {"verified", true},
                             {"active", true},
                             {"created_at", now()}});
        r.save("users", {{"id", "seller2"},
                         {"email", "seller2@shoppe.local"},
                         {"name", "Mono Studio"},
                         {"role", "buyer"},
                         {"password_hash", hash},
                         {"verified", true},
                         {"active", true},
                         {"created_at", now()}});
        r.save("shops", {{"id", "shop-an-nhien"},
                         {"owner_id", "seller"},
                         {"name", "An Nhiên Store"},
                         {"description", "Những điều nhỏ xinh cho mỗi ngày thêm cảm hứng."},
                         {"region", "Miền Nam"},
                         {"status", "approved"},
                         {"created_at", now()}});
        r.save("shops", {{"id", "shop-mono"},
                         {"owner_id", "seller2"},
                         {"name", "Mono Studio"},
                         {"description", "Thiết kế tối giản. Trải nghiệm trọn vẹn."},
                         {"region", "Miền Bắc"},
                         {"status", "approved"},
                         {"created_at", now()}});
        struct Sample {
            const char *name;
            const char *category;
            const char *image;
            int price;
        };
        std::vector<Sample> samples = {
            {"Tai nghe không dây Studio Pro", "Điện tử", "headphones", 890000},
            {"Túi tote Everyday Canvas", "Phụ kiện", "bag", 159000},
            {"Bình giữ nhiệt Daily 500ml", "Nhà cửa & Đời sống", "bottle", 249000},
            {"Áo thun cotton Essential", "Thời trang", "shirt", 189000},
            {"Loa Bluetooth Mini Sound", "Điện tử", "speaker", 459000},
            {"Đèn bàn Nordic Light", "Nhà cửa & Đời sống", "lamp", 329000},
            {"Giày thể thao Urban Walk", "Thể thao", "shoes", 599000},
            {"Bộ chăm sóc da Gentle Care", "Sức khỏe & Làm đẹp", "skincare", 289000},
            {"Đồng hồ Minimal Classic", "Phụ kiện", "watch", 749000},
            {"Bàn phím cơ Cloud 75", "Điện tử", "keyboard", 1190000},
            {"Sổ tay Soft Notes A5", "Nhà cửa & Đời sống", "notebook", 79000},
            {"Balo City Daypack", "Phụ kiện", "backpack", 399000}};
        for (std::size_t i = 0; i < samples.size(); ++i) {
            auto s = samples[i];
            auto id = "product-" + std::to_string(i + 1);
            std::string shop = i % 2 ? "shop-an-nhien" : "shop-mono";
            r.save("products", {{"id", id},
                                {"shop_id", shop},
                                {"name", s.name},
                                {"description",
                                 "Thiết kế tinh tế, dễ sử dụng mỗi ngày. Sản phẩm được chọn lọc kỹ "
                                 "lưỡng, đóng gói cẩn thận.\n\nThông tin trong danh mục này là dữ liệu "
                                 "minh họa cho bài tập lớn; hãy dùng COD để trải nghiệm quy trình."},
                                {"category", s.category},
                                {"image", std::string("/assets/product-") + s.image + ".svg"},
                                {"active", true},
                                {"weight", 300},
                                {"sold", 0},
                                {"created_at", now() - static_cast<long long>(i) * 100}});
            for (int n = 0; n < 2; ++n)
                r.save("variants", {{"id", id + "-" + std::to_string(n)},
                                    {"product_id", id},
                                    {"shop_id", shop},
                                    {"name", n ? "Xanh mint" : "Nguyên bản"},
                                    {"price", s.price + n * 20000},
                                    {"stock", 20 + n * 10},
                                    {"active", true}});
        }
        r.save("addresses", {{"id", "demo-address"},
                             {"user_id", "buyer"},
                             {"name", "Minh Anh (minh họa)"},
                             {"phone", "0900000000"},
                             {"street", "Địa chỉ minh họa cho bài tập lớn"},
                             {"city", "TP. Hồ Chí Minh"},
                             {"region", "Miền Nam"},
                             {"is_default", true}});
        r.save("vouchers", {{"id", "welcome"},
                            {"shop_id", ""},
                            {"code", "CHAO10"},
                            {"type", "percent"},
                            {"value", 10},
                            {"minimum", 100000},
                            {"max_discount", 50000},
                            {"limit", 100},
                            {"starts_at", now() - 60},
                            {"ends_at", now() + 90 * 86400},
                            {"active", true}});
        r.save("settings",
               {{"id", "site"},
                {"banner_title", "Một chút mới. Thêm nhiều vui."},
                {"banner_subtitle", "Khám phá những món đồ bạn yêu, từ những shop bạn tin."}});
    }
    if (env("DEMO_CATALOG_AUTO_IMPORT") == "true" &&
        r.get("settings", "demo_catalog_bootstrap").is_null()) {
        auto user = r.one("users", "role = ?", {"admin"});
        if (!user.is_null()) {
            auto file = (std::filesystem::path(env("SCHEMA_PATH", "database/schema.sql")).parent_path() /
                         "demo-catalog.json")
                            .string();
            auto result = importDemoCatalog(r, user, file);
            r.save("settings",
                   {{"id", "demo_catalog_bootstrap"}, {"result", result}, {"created_at", now()}});
        }
    }
    upgradeStorefrontContent(r);
    tx->commit();
}
} // namespace shoppe
