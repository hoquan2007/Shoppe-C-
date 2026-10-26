#include "catalog.h"
#include "catalog_copy.h"
#include "domain.h"
#include "security.h"
#include <cmath>
#include <fstream>
#include <map>
#include <set>

namespace shoppe {
namespace {
void catalogAdmin(const Json &user) {
    if (user.is_null() || user.value("role", "") != "admin")
        throw Error(403, "forbidden", "Chỉ admin được nạp danh mục demo.");
}
std::set<std::string> existingCatalogIds(Repository &r, const Json &products) {
    Params ids;
    std::string placeholders;
    for (const auto &product : products) {
        if (!ids.empty())
            placeholders += ",";
        ids.push_back(product.at("id"));
        placeholders += "?";
    }
    std::set<std::string> existing;
    for (const auto &product : r.list("products", "id IN (" + placeholders + ")", ids))
        existing.insert(product.at("id").get<std::string>());
    return existing;
}
} // namespace
Json normalizeDemoCatalog(const Json &document) {
    if (!document.is_object() ||
        (document.value("source", "") != "DummyJSON" &&
         document.value("source", "") != "DummyJSON+ShoppeDemo") ||
        !document.contains("products") || !document["products"].is_array() ||
        document["products"].empty() || document["products"].size() > demoCatalogLimit)
        throw Error(422, "invalid_demo_catalog", "Danh mục demo không hợp lệ.");
    const std::map<std::string, std::string> categories{{"beauty", "Sức khỏe & Làm đẹp"},
                                                        {"fragrances", "Sức khỏe & Làm đẹp"},
                                                        {"skin-care", "Sức khỏe & Làm đẹp"},
                                                        {"furniture", "Nhà cửa & Đời sống"},
                                                        {"home-decoration", "Nhà cửa & Đời sống"},
                                                        {"kitchen-accessories", "Nhà cửa & Đời sống"},
                                                        {"groceries", "Bách hóa"},
                                                        {"smartphones", "Điện tử"},
                                                        {"laptops", "Điện tử"},
                                                        {"mobile-accessories", "Điện tử"},
                                                        {"tablets", "Điện tử"},
                                                        {"sports-accessories", "Thể thao"},
                                                        {"mens-shirts", "Thời trang"},
                                                        {"mens-shoes", "Thời trang"},
                                                        {"womens-dresses", "Thời trang"},
                                                        {"womens-shoes", "Thời trang"},
                                                        {"tops", "Thời trang"}};

    static const auto editorial =
        loadCatalogCopy(env("CATALOG_COPY_PATH", "database/catalog-copy.vi.json"));
    std::map<int, Json> copyBySource;
    for (const auto &entry : editorial.at("products"))
        copyBySource.emplace(entry.at("source_id").get<int>(), entry);
    Json normalized = Json::array();
    std::set<std::string> ids;
    for (const auto &item : document["products"]) {
        auto externalId = numberField(item, "id", 1, 1000000);
        const auto series =
            item.contains("_demo_series") ? numberField(item, "_demo_series", 1, demoCatalogLimit) : 0;
        if (series && document.value("source", "") != "DummyJSON+ShoppeDemo")
            throw Error(422, "invalid_demo_catalog", "Nguồn mẫu mô phỏng không hợp lệ.");
        auto id = series ? "demo-shoppe-" + std::to_string(externalId) + "-" + std::to_string(series)
                         : "demo-dummyjson-" + std::to_string(externalId);
        if (!ids.insert(id).second)
            throw Error(422, "duplicate_demo_id", "Mã demo bị trùng.");
        auto image = textField(item, "thumbnail", 2048);
        if (image.rfind("https://cdn.dummyjson.com/", 0) != 0)
            throw Error(422, "invalid_demo_image", "Ảnh demo không thuộc nguồn được hỗ trợ.");
        if (!item.contains("price") || !item["price"].is_number())
            throw Error(422, "invalid_demo_price", "Giá demo không hợp lệ.");
        auto originalPrice = item["price"].get<double>();
        if (!std::isfinite(originalPrice) || originalPrice <= 0 || originalPrice > 4000)
            throw Error(422, "invalid_demo_price", "Giá demo ngoài giới hạn.");
        auto price = Money(std::max<std::int64_t>(
                               1000, static_cast<std::int64_t>(std::round(originalPrice * 25.0)) * 1000))
                         .value();
        auto categoryKey = textField(item, "category", 100);
        auto name = textField(item, "title", series ? 170 : 200) +
                    (series ? " · Mẫu demo " + std::to_string(series) : "");
        auto description =
            "Sản phẩm mô phỏng cho bài tập; không cung cấp hàng thật. Nếu chọn payOS, "
            "giao dịch sử dụng tiền thật.\n\n" +
            (series ? std::string("Mẫu mô phỏng mở rộng do Shoppe tạo. Ảnh DummyJSON chỉ để minh họa; "
                                  "không phải sản phẩm bổ sung từ API nguồn.")
                    : textField(item, "description", 8000));
        // Only use reviewed copy when both the original title and image still match.
        // Provider changes and unknown products retain the existing import behavior.
        if (copyBySource.contains(static_cast<int>(externalId))) {
            const auto &entry = copyBySource.at(static_cast<int>(externalId));
            if (entry.at("source_title") == item.at("title") && entry.at("source_image") == image) {
                auto copy = catalogCopyText(entry);
                name = copy.at("name");
                description = copy.at("description");
            }
        }
        normalized.push_back(
            {{"id", id},
             {"source_id", externalId},
             {"name", name},
             {"description", description},
             {"category", categories.contains(categoryKey) ? categories.at(categoryKey) : "Phụ kiện"},
             {"image", image},
             {"price", price},
             {"is_demo", true},
             {"source", series ? "ShoppeDemo" : "DummyJSON"},
             {"demo_series", series}});
    }
    return normalized;
}
Json importDemoCatalog(Repository &r, const Json &user, const std::string &file) {
    catalogAdmin(user);
    std::ifstream source(file);
    if (!source)
        throw Error(503, "demo_catalog_unavailable", "Chưa có dữ liệu demo trong bản triển khai.");
    Json document;
    try {
        source >> document;
    } catch (...) {
        throw Error(503, "invalid_demo_catalog", "File demo không hợp lệ.");
    }
    return importDemoCatalog(r, user, document);
}
Json importDemoCatalog(Repository &r, const Json &user, const Json &document) {
    catalogAdmin(user);
    auto products = normalizeDemoCatalog(document);
    auto shop = r.one("shops", "owner_id = ?", {user.at("id")});
    if (shop.is_null()) {
        shop = {
            {"id", randomId()},
            {"owner_id", user.at("id")},
            {"name", "Cửa hàng demo"},
            {"description", "Sản phẩm mô phỏng từ DummyJSON phục vụ bài tập; không cung cấp hàng thật."},
            {"region", "Miền Nam"},
            {"status", "approved"},
            {"created_at", now()}};
        r.save("shops", shop);
    }
    if (shop.value("status", "") != "approved")
        throw Error(409, "shop_not_approved", "Shop của admin phải được duyệt trước khi nạp demo.");
    auto settings = r.get("settings", "site");
    if (settings.is_null())
        settings = {{"id", "site"}};
    std::set<std::string> names;
    for (const auto &name :
         settings.value("categories", Json::array({"Thời trang", "Điện tử", "Nhà cửa & Đời sống",
                                                   "Sức khỏe & Làm đẹp", "Phụ kiện", "Thể thao"})))
        names.insert(name.get<std::string>());
    int imported = 0, skipped = 0;
    auto existing = existingCatalogIds(r, products);
    Json newProducts = Json::array(), newVariants = Json::array();
    for (auto product : products) {
        auto id = product.at("id").get<std::string>();
        if (existing.contains(id)) {
            ++skipped;
            continue;
        }
        auto price = product.at("price");
        product.erase("price");
        names.insert(product.at("category").get<std::string>());
        product["shop_id"] = shop.at("id");
        product["weight"] = 300;
        product["active"] = true;
        product["sold"] = 0;
        product["created_at"] = now() - imported;
        newProducts.push_back(product);
        newVariants.push_back({{"id", id + "-default"},
                               {"product_id", id},
                               {"shop_id", shop.at("id")},
                               {"name", "Mặc định"},
                               {"price", price},
                               {"stock", 20},
                               {"active", true}});
        ++imported;
    }
    r.saveMany("products", newProducts);
    r.saveMany("variants", newVariants);
    settings["categories"] = Json::array();
    for (const auto &name : names)
        settings["categories"].push_back(name);
    r.save("settings", settings);
    return {{"imported", imported},
            {"skipped", skipped},
            {"shop_id", shop.at("id")},
            {"source", document.at("source")},
            {"generated_products", document.value("generated_products", 0)}};
}
Json stageDemoCatalog(Repository &r, const Json &user, const Json &document) {
    catalogAdmin(user);
    auto products = normalizeDemoCatalog(document);
    auto token = randomId(32);
    r.save("settings", {{"id", "catalog-preview:" + user.at("id").get<std::string>()},
                        {"token_hash", sha256(token)},
                        {"expires_at", now() + 900},
                        {"document", document}});
    int existing = 0;
    auto existingIds = existingCatalogIds(r, products);
    for (auto &product : products) {
        product["exists"] = existingIds.contains(product.at("id").get<std::string>());
        if (product["exists"].get<bool>())
            ++existing;
    }
    return {{"source", document.at("source")},
            {"preview_token", token},
            {"generated_products", document.value("generated_products", 0)},
            {"expires_in", 900},
            {"products", products},
            {"existing", existing},
            {"new_products", products.size() - existing},
            {"currency", "VND"},
            {"payment_provider", "payos"},
            {"is_demo", true}};
}
Json commitDemoCatalog(Repository &r, const Json &user, const std::string &token) {
    catalogAdmin(user);
    auto id = "catalog-preview:" + user.at("id").get<std::string>();
    auto preview = r.get("settings", id);
    if (preview.is_null() || preview.value("expires_at", 0LL) <= now() ||
        !constantEqual(preview.value("token_hash", ""), sha256(token)))
        throw Error(409, "catalog_preview_expired",
                    "Bản xem trước đã hết hạn hoặc đã được dùng. Vui lòng tải lại.");
    auto result = importDemoCatalog(r, user, preview.at("document"));
    result["synced_at"] = now();
    result["payment_provider"] = "payos";
    result["is_demo"] = true;
    Json history = result;
    history["id"] = "catalog-api-sync";
    r.save("settings", history);
    r.erase("settings", id);
    return result;
}
Json demoCatalogStatus(Repository &r, const Json &user) {
    catalogAdmin(user);
    return {{"provider", "DummyJSON"},
            {"mode", "demo"},
            {"requires_key", false},
            {"max_products", demoCatalogLimit},
            {"supplement", "ShoppeDemo"},
            {"payment_provider", "payos"},
            {"last_sync", r.get("settings", "catalog-api-sync")},
            {"shopee", {{"enabled", false}, {"reason", "demo_source_selected"}}}};
}
} // namespace shoppe
