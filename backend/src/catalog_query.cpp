#include "catalog_query.h"
#include "domain.h"
#include "security.h"
#include <algorithm>
#include <map>
#include <regex>
#include <set>

namespace shoppe {
namespace {
std::string field(Repository &r, const std::string &alias, const std::string &name) {
    return r.postgres() ? "(CAST(" + alias + ".payload AS jsonb)->>'" + name + "')"
                        : "json_extract(" + alias + ".payload,'$." + name + "')";
}
std::string activeVariant(Repository &r) {
    return "COALESCE(CAST(" + field(r, "v", "active") + " AS TEXT),'" + (r.postgres() ? "true" : "1") +
           "') = '" + (r.postgres() ? "true" : "1") + "'";
}
std::string normalizedName(Repository &r) {
    auto name = field(r, "p", "name");
    if (!r.postgres())
        return "shoppe_search(" + name + ")";
    // Same Vietnamese normalization as the C++ SQLite function; no extension/DDL required.
    const std::string accents = "áàảãạăắằẳẵặâấầẩẫậÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬéèẻẽẹêếềểễệÉÈẺẼẸÊẾỀỂỄỆíìỉĩịÍÌỈĨỊóòỏõọ"
                                "ôốồổỗộơớờởỡợÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢúùủũụưứừửữựÚÙỦŨỤƯỨỪỬỮỰýỳỷỹỵÝỲỶỸỴđĐ";
    return "translate(lower(" + name + "),'" + accents + "','" + searchKey(accents) + "')";
}
long long integer(const Json &o, const char *key, long long fallback, long long max) {
    if (!o.contains(key) || o.at(key).get<std::string>().empty())
        return fallback;
    auto s = o.at(key).get<std::string>();
    if (!std::regex_match(s, std::regex("[0-9]{1,9}")))
        throw Error(422, "invalid_catalog_query", "Tham số danh sách không hợp lệ.");
    auto n = std::stoll(s);
    if (n > max || ((std::string(key) == "page" || std::string(key) == "page_size" ||
                     std::string(key) == "limit") &&
                    n == 0))
        throw Error(422, "invalid_catalog_query", "Tham số danh sách vượt giới hạn.");
    return n;
}
Json views(Repository &r, const Rows &rows) {
    Json result = Json::array();
    Params ids, shopIds;
    std::string binds;
    for (const auto &row : rows) {
        auto p = Json::parse(row.at("payload"));
        ids.push_back(p.at("id"));
        shopIds.push_back(p.at("shop_id"));
        binds += binds.empty() ? "?" : ",?";
        result.push_back(std::move(p));
    }
    if (ids.empty())
        return result;
    std::map<std::string, Json> variants, shops;
    std::map<std::string, std::pair<double, int>> ratings;
    for (auto v : r.list("variants", "product_id IN (" + binds + ")", ids)) {
        auto id = v.at("product_id").get<std::string>();
        if (!variants.contains(id))
            variants[id] = Json::array();
        variants[id].push_back(std::move(v));
    }
    for (auto s : r.list("shops", "id IN (" + binds + ")", shopIds)) {
        const auto id = s.at("id").get<std::string>();
        shops[id] = std::move(s);
    }
    for (const auto &review : r.list("reviews", "product_id IN (" + binds + ")", ids))
        if (!review.value("hidden", false)) {
            auto &rating = ratings[review.at("product_id").get<std::string>()];
            rating.first += review.value("rating", 0);
            ++rating.second;
        }
    for (auto &p : result) {
        auto id = p.at("id").get<std::string>();
        p["variants"] = variants.contains(id) ? variants.at(id) : Json::array();
        p["shop"] = shops.at(p.at("shop_id").get<std::string>());
        auto [sum, count] = ratings[id];
        p["rating"] = count ? sum / count : 0;
        p["review_count"] = count;
    }
    return result;
}
} // namespace
Json publicCatalog(Repository &r, const Json &o) {
    const auto size = integer(o, o.contains("page_size") ? "page_size" : "limit", 12, 48);
    const auto requested = integer(o, "page", 1, 1000000);
    auto q = o.value("q", std::string()), category = o.value("category", std::string()),
         shop = o.value("shop", std::string());
    if (q.size() > 200 || category.size() > 100 || shop.size() > 64)
        throw Error(422, "invalid_catalog_query", "Bộ lọc quá dài.");
    auto sort = o.value("sort", std::string("new"));
    if (sort.empty())
        sort = "new";
    if (sort != "new" && sort != "price" && sort != "price-desc")
        throw Error(422, "invalid_catalog_query", "Kiểu sắp xếp không hợp lệ.");
    const auto min = integer(o, "min", 0, 100000000), max = integer(o, "max", 100000000, 100000000);
    if (max < min)
        throw Error(422, "invalid_catalog_query", "Khoảng giá không hợp lệ.");
    const auto price =
        "(SELECT MIN(v.price) FROM variants v WHERE v.product_id=p.id AND " + activeVariant(r) + ")";
    std::string where =
        " FROM products p JOIN shops s ON s.id=p.shop_id WHERE p.active=1 AND s.status='approved'";
    Params params;
    if (!q.empty()) {
        std::string escaped;
        for (char c : searchKey(q)) {
            if (c == '!' || c == '%' || c == '_')
                escaped += '!';
            escaped += c;
        }
        where += " AND " + normalizedName(r) + " LIKE ? ESCAPE '!'";
        params.push_back("%" + escaped + "%");
    }
    if (!category.empty()) {
        where += " AND p.category=?";
        params.push_back(category);
    }
    if (!shop.empty()) {
        where += " AND p.shop_id=?";
        params.push_back(shop);
    }
    if (o.contains("min") && !o.at("min").get<std::string>().empty()) {
        where += " AND " + price + ">=CAST(? AS BIGINT)";
        params.push_back(std::to_string(min));
    }
    if (o.contains("max") && !o.at("max").get<std::string>().empty()) {
        where += " AND " + price + "<=CAST(? AS BIGINT)";
        params.push_back(std::to_string(max));
    }
    const auto total =
        std::stoll(r.query("SELECT COUNT(*) AS total" + where, params).front().at("total"));
    const auto pages = (total + size - 1) / size, page = std::min(requested, std::max(1LL, pages));
    auto order = sort == "new" ? "COALESCE(CAST(" + field(r, "p", "created_at") + " AS BIGINT),0) DESC"
                               : price + (sort == "price" ? " ASC" : " DESC");
    params.push_back(std::to_string(size));
    params.push_back(std::to_string((page - 1) * size));
    auto rows = r.query("SELECT p.payload" + where + " ORDER BY " + order + ",p.id ASC LIMIT ? OFFSET ?",
                        params);
    return {{"products", views(r, rows)},
            {"total", total},
            {"page", page},
            {"page_size", size},
            {"pages", pages}};
}
Json catalogHighlights(Repository &r, const Json &categories) {
    // One representative per category without loading the entire catalog or its relations.
    auto rows = r.query("SELECT payload FROM (SELECT p.payload,ROW_NUMBER() OVER (PARTITION BY "
                        "p.category ORDER BY COALESCE(CAST(" +
                        field(r, "p", "demo_series") + " AS BIGINT),0), COALESCE(CAST(" +
                        field(r, "p", "created_at") +
                        " AS BIGINT),0) DESC,p.id) AS rank FROM products p JOIN shops s ON "
                        "s.id=p.shop_id WHERE p.active=1 AND s.status='approved') ranked WHERE rank=1");
    Json result = Json::object();
    for (const auto &row : rows) {
        auto p = Json::parse(row.at("payload"));
        if (std::find(categories.begin(), categories.end(), p.at("category")) != categories.end())
            result[p.at("category").get<std::string>()] = {{"id", p.at("id")},
                                                           {"name", p.at("name")},
                                                           {"image", p.value("image", "")},
                                                           {"category", p.at("category")}};
    }
    return result;
}
} // namespace shoppe
