#include "read_models.h"
#include "domain.h"
#include <algorithm>
#include <set>

namespace shoppe {
std::string jsonField(Repository &r, const std::string &alias, const std::string &name) {
    return r.postgres() ? "(CAST(" + alias + ".payload AS jsonb)->>'" + name + "')"
                        : "json_extract(" + alias + ".payload,'$." + name + "')";
}
namespace {
long long number(const httplib::Request &req, const char *key, long long fallback, long long maximum) {
    if (!req.has_param(key))
        return fallback;
    auto value = req.get_param_value(key);
    if (value.empty() || value.size() > 9 ||
        !std::all_of(value.begin(), value.end(), [](unsigned char c) { return c >= '0' && c <= '9'; }))
        throw Error(422, "invalid_page", "Tham số phân trang không hợp lệ.");
    auto n = std::stoll(value);
    if (n < 1 || n > maximum)
        throw Error(422, "invalid_page", "Tham số phân trang vượt giới hạn.");
    return n;
}
std::string integerField(Repository &r, const std::string &alias, const std::string &key) {
    return "COALESCE(CAST(" + jsonField(r, alias, key) + " AS BIGINT),0)";
}
long long value(const std::map<std::string, std::string> &row, const char *key) {
    return std::stoll(row.at(key));
}
} // namespace
Json pageList(Repository &r, const std::string &table, const httplib::Request &req,
              const std::string &where, const Params &params, int defaultSize,
              const std::string &order, const std::vector<std::string> &searchFields) {
    // Table/order/where are application-owned SQL, never request text.
    static const std::set<std::string> allowed{"products", "orders", "notifications", "audit",
                                               "reviews",  "outbox", "checkouts", "users", "shops",
                                               "wishlists", "conversations", "vouchers"};
    if (!allowed.contains(table))
        throw std::logic_error("Unsupported paginated table");
    const auto size = number(req, "page_size", defaultSize, 100);
    const auto requested = number(req, "page", 1, 1000000);
    auto filter = where;
    Params bound = params;
    const auto query = req.get_param_value("q");
    if (!searchFields.empty() && !query.empty()) {
        if (query.size() > 200)
            throw Error(422, "invalid_search", "Từ khóa tìm kiếm quá dài.");
        std::string pattern = "%", terms;
        for (char c : query) {
            if (c == '!' || c == '%' || c == '_') pattern += '!';
            pattern += c;
        }
        pattern += '%';
        for (const auto &field : searchFields) {
            if (!terms.empty()) terms += " OR ";
            terms += "LOWER(COALESCE(" + jsonField(r, "t", field) + ",'')) LIKE LOWER(?) ESCAPE '!'";
            bound.push_back(pattern);
        }
        filter = (filter.empty() ? "" : "(" + filter + ") AND ") + "(" + terms + ")";
    }
    const auto from = " FROM " + table + " t" + (filter.empty() ? "" : " WHERE " + filter);
    auto total = value(r.query("SELECT COUNT(*) AS total" + from, bound).front(), "total");
    auto pages = (total + size - 1) / size;
    auto page = std::min(requested, std::max(1LL, pages));
    bound.push_back(std::to_string(size));
    bound.push_back(std::to_string((page - 1) * size));
    auto sorting = order.empty() ? integerField(r, "t", "created_at") + " DESC,t.id ASC" : order;
    Json items = Json::array();
    for (const auto &row :
         r.query("SELECT t.payload" + from + " ORDER BY " + sorting + " LIMIT ? OFFSET ?", bound))
        items.push_back(Json::parse(row.at("payload")));
    return {{"items", items}, {"total", total}, {"page", page}, {"page_size", size}, {"pages", pages}};
}
Json dashboardData(Repository &r, const std::string &shopId) {
    const bool admin = shopId.empty();
    Params params = admin ? Params{} : Params{shopId};
    const std::string scope = admin ? "" : " WHERE o.shop_id=?";
    const std::string delivered = "o.status IN ('delivered','completed')";
    const auto paid = "CASE WHEN " + jsonField(r, "g", "method") + "='cod' THEN " +
                      jsonField(r, "o", "cod_status") + " ELSE g.status END";
    const auto counts =
        r.query("SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN " + paid + "='paid' THEN " +
                    integerField(r, "o", "total") +
                    " ELSE 0 END),0) AS revenue,"
                    "COALESCE(SUM(CASE WHEN " +
                    delivered +
                    " THEN 1 ELSE 0 END),0) AS delivered,"
                    "COALESCE(SUM(CASE WHEN ret.status='received' THEN 1 ELSE 0 END),0) AS returned"
                    " FROM orders o JOIN checkouts g ON g.id=o.checkout_id"
                    " LEFT JOIN returns ret ON ret.order_id=o.id" +
                    scope,
                params)
            .front();
    auto orders = value(counts, "orders"), revenue = value(counts, "revenue");
    auto deliveredCount = value(counts, "delivered"), returned = value(counts, "returned");
    const auto refundQuery =
        admin ? " FROM refunds f" : " FROM refunds f JOIN orders o ON o.id=f.order_id WHERE o.shop_id=?";
    auto refunds = value(
        r.query("SELECT COALESCE(SUM(" + integerField(r, "f", "amount") + "),0) AS amount" + refundQuery,
                params)
            .front(),
        "amount");
    if (admin) {
        revenue += value(
            r.query("SELECT COALESCE(SUM(CASE WHEN g.status IN ('review','refunded') THEN " +
                    integerField(r, "g", "received_amount") + " WHEN g.status='paid' THEN " +
                    integerField(r, "g", "excess_amount") + " ELSE 0 END),0) AS amount FROM checkouts g")
                .front(),
            "amount");
    }
    const std::string productScope = admin ? "" : " WHERE p.shop_id=?";
    auto productCount = value(
        r.query("SELECT COUNT(*) AS total FROM products p" + productScope, params).front(), "total");
    Json recent = Json::array(), low = Json::array(), top = Json::array();
    for (const auto &row : r.query("SELECT o.payload FROM orders o" + scope + " ORDER BY " +
                                       integerField(r, "o", "created_at") + " DESC,o.id ASC LIMIT 6",
                                   params))
        recent.push_back(Json::parse(row.at("payload")));
    for (const auto &row :
         r.query("SELECT v.payload," + jsonField(r, "p", "name") +
                     " AS product_name"
                     " FROM variants v JOIN products p ON p.id=v.product_id WHERE v.stock<10" +
                     (admin ? "" : std::string(" AND p.shop_id=?")) +
                     " ORDER BY v.stock ASC,v.id ASC LIMIT 5",
                 params)) {
        auto variant = Json::parse(row.at("payload"));
        variant["product_name"] = row.at("product_name");
        low.push_back(std::move(variant));
    }
    // Aggregate quantities after partial returns without hydrating every historical order.
    const auto returnItems =
        r.postgres()
            ? "jsonb_array_elements(COALESCE(CAST(ret.payload AS jsonb)->'items','[]'::jsonb)) ri"
            : "json_each(ret.payload,'$.items') ri";
    const auto returnedId = r.postgres() ? "ri->>'item_id'" : "json_extract(ri.value,'$.item_id')";
    const auto returnedQty = r.postgres() ? "CAST(ri->>'quantity' AS BIGINT)"
                                          : "CAST(json_extract(ri.value,'$.quantity') AS BIGINT)";
    const auto netQuantity = integerField(r, "i", "quantity") +
                             "-CASE WHEN ret.status='received' THEN COALESCE((SELECT SUM(" +
                             returnedQty + ") FROM " + returnItems + " WHERE " + returnedId +
                             "=i.id),0) ELSE 0 END";
    for (const auto &row : r.query("SELECT " + jsonField(r, "i", "product_id") + " AS product_id,MAX(" +
                                       jsonField(r, "i", "name") + ") AS name,SUM(" + netQuantity +
                                       ") AS quantity"
                                       " FROM order_items i JOIN orders o ON o.id=i.order_id"
                                       " LEFT JOIN returns ret ON ret.order_id=o.id WHERE " +
                                       delivered + (admin ? "" : std::string(" AND o.shop_id=?")) +
                                       " GROUP BY " + jsonField(r, "i", "product_id") + " HAVING SUM(" +
                                       netQuantity + ")>0 ORDER BY quantity DESC,product_id ASC LIMIT 5",
                                   params))
        top.push_back({{"id", row.at("product_id")},
                       {"name", row.at("name")},
                       {"quantity", value(row, "quantity")}});
    return {{"stats",
             {{"orders", orders},
              {"revenue", revenue},
              {"refunds", refunds},
              {"net_revenue", revenue - refunds},
              {"products", productCount},
              {"delivered", deliveredCount},
              {"returned", returned},
              {"delivery_rate", orders ? 100.0 * deliveredCount / orders : 0},
              {"return_rate", deliveredCount ? 100.0 * returned / deliveredCount : 0}}},
            {"orders", recent},
            {"low_stock", low},
            {"top_products", top}};
}
} // namespace shoppe
