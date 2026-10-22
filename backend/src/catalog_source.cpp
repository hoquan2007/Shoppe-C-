#include "catalog.h"
#include "domain.h"
#include "httplib.h"
#include "security.h"
#include <cmath>
#include <map>
#include <set>

namespace shoppe {
namespace {
Json providerGet(const std::string &path) {
    // Fixed HTTPS origin and no redirects; request bodies cannot select a host or URL.
    httplib::SSLClient client("dummyjson.com");
    client.set_connection_timeout(5);
    client.set_read_timeout(10);
    client.set_write_timeout(5);
    client.set_follow_location(false);
    std::string body;
    auto response = client.Get(path, [&](const char *bytes, std::size_t length) {
        if (body.size() + length > 2 * 1024 * 1024)
            return false;
        body.append(bytes, length);
        return true;
    });
    if (!response || response->status != 200)
        throw Error(502, "catalog_provider_unavailable",
                    "Nguồn demo chưa phản hồi. Hàng đã có vẫn được giữ; có thể dùng bản demo đóng gói.");
    try {
        return Json::parse(body);
    } catch (...) {
        throw Error(502, "catalog_provider_invalid", "Nguồn demo trả dữ liệu không hợp lệ.");
    }
}
} // namespace
Json selectDemoCatalog(const Json &categories, const Json &data, int limit) {
    if (limit < 1 || limit > 100)
        throw Error(422, "invalid_catalog_limit", "Chọn từ 1 đến 100 sản phẩm demo.");
    if (!categories.is_array() || categories.empty() || categories.size() > 200 || !data.is_object() ||
        !data.contains("products") || !data["products"].is_array() || data["products"].size() > 1000)
        throw Error(502, "catalog_provider_invalid", "Danh mục nguồn demo không hợp lệ.");
    std::set<std::string> categoryNames;
    for (const auto &category : categories) {
        if (!category.is_string() || category.get<std::string>().size() > 100)
            throw Error(502, "catalog_provider_invalid", "Danh mục nguồn demo không hợp lệ.");
        categoryNames.insert(category.get<std::string>());
    }
    const std::set<std::string> supported{"beauty",
                                          "fragrances",
                                          "skin-care",
                                          "furniture",
                                          "home-decoration",
                                          "kitchen-accessories",
                                          "smartphones",
                                          "laptops",
                                          "mobile-accessories",
                                          "tablets",
                                          "sports-accessories",
                                          "mens-shirts",
                                          "mens-shoes",
                                          "womens-dresses",
                                          "womens-shoes",
                                          "tops",
                                          "womens-bags",
                                          "mens-watches",
                                          "womens-watches",
                                          "sunglasses"};
    std::map<std::string, std::vector<Json>> groups;
    int excluded = 0;
    for (const auto &item : data["products"]) {
        if (!item.is_object() || !item.contains("category") || !item["category"].is_string() ||
            !item.contains("price") || !item["price"].is_number())
            throw Error(502, "catalog_provider_invalid", "Sản phẩm nguồn demo không hợp lệ.");
        auto category = item["category"].get<std::string>();
        auto price = item["price"].get<double>();
        if (!categoryNames.contains(category))
            throw Error(502, "catalog_provider_invalid", "Sản phẩm có danh mục không khớp nguồn.");
        if (!supported.contains(category) || !std::isfinite(price) || price <= 0 || price > 4000) {
            ++excluded;
            continue;
        }
        // Whitelist fields. Provider ratings/reviews/users/stock never become shop facts.
        Json product;
        for (auto key : {"id", "title", "description", "category", "price", "thumbnail"}) {
            if (!item.contains(key))
                throw Error(502, "catalog_provider_invalid", "Nguồn demo thiếu dữ liệu sản phẩm.");
            product[key] = item[key];
        }
        groups[category].push_back(std::move(product));
    }
    Json selected = Json::array();
    for (std::size_t index = 0; selected.size() < static_cast<std::size_t>(limit); ++index) {
        bool found = false;
        for (const auto &[category, items] : groups) {
            if (index < items.size() && selected.size() < static_cast<std::size_t>(limit)) {
                selected.push_back(items[index]);
                found = true;
            }
        }
        if (!found)
            break;
    }
    if (selected.empty())
        throw Error(502, "catalog_provider_empty", "Nguồn demo không có sản phẩm phù hợp.");
    Json document{{"source", "DummyJSON"},
                  {"source_url", "https://dummyjson.com/docs/products"},
                  {"fetched_at", now()},
                  {"excluded", excluded},
                  {"products", selected}};
    normalizeDemoCatalog(document);
    return document;
}
Json fetchDemoCatalog(int limit) {
    if (limit < 1 || limit > 100)
        throw Error(422, "invalid_catalog_limit", "Chọn từ 1 đến 100 sản phẩm demo.");
    auto categories = providerGet("/products/category-list");
    auto products =
        providerGet("/products?limit=0&select=id,title,description,category,price,thumbnail");
    try {
        return selectDemoCatalog(categories, products, limit);
    } catch (const Error &error) {
        if (error.status >= 500)
            throw;
        throw Error(502, "catalog_provider_invalid", "Nguồn demo trả sản phẩm không hợp lệ.");
    } catch (const nlohmann::json::exception &) {
        throw Error(502, "catalog_provider_invalid", "Nguồn demo trả sản phẩm không hợp lệ.");
    }
}
} // namespace shoppe
