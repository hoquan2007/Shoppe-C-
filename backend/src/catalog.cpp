#include "catalog.h"
#include "domain.h"
#include "security.h"
#include <cmath>
#include <fstream>
#include <map>
#include <set>

namespace shoppe {
Json importDemoCatalog(Repository &r, const Json &user, const std::string &file) {
    if (user.is_null() || user.value("role", "") != "admin")
        throw Error(403, "forbidden", "Chỉ admin được nạp danh mục demo.");
    std::ifstream source(file);
    if (!source)
        throw Error(503, "demo_catalog_unavailable", "Chưa có dữ liệu demo trong bản triển khai.");
    Json document;
    try {
        source >> document;
    } catch (...) {
        throw Error(503, "invalid_demo_catalog", "File demo không hợp lệ.");
    }
    if (document.value("source", "") != "DummyJSON" || !document.contains("products") ||
        !document["products"].is_array() || document["products"].empty() ||
        document["products"].size() > 100)
        throw Error(503, "invalid_demo_catalog", "Danh mục demo không hợp lệ.");
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
    auto settings = r.get("settings", "site");
    if (settings.is_null())
        settings = {{"id", "site"}};
    std::set<std::string> names;
    for (const auto &name :
         settings.value("categories", Json::array({"Thời trang", "Điện tử", "Nhà cửa & Đời sống",
                                                   "Sức khỏe & Làm đẹp", "Phụ kiện", "Thể thao"})))
        names.insert(name.get<std::string>());
    int imported = 0, skipped = 0;
    std::set<std::int64_t> ids;
    for (const auto &item : document["products"]) {
        auto externalId = numberField(item, "id", 1, 1000000);
        if (!ids.insert(externalId).second)
            throw Error(422, "duplicate_demo_id", "Mã demo bị trùng.");
        auto id = "demo-dummyjson-" + std::to_string(externalId);
        if (!r.get("products", id).is_null()) {
            ++skipped;
            continue;
        }
        auto image = textField(item, "thumbnail", 2048);
        if (image.rfind("https://cdn.dummyjson.com/", 0) != 0)
            throw Error(422, "invalid_demo_image", "Ảnh demo không thuộc nguồn được hỗ trợ.");
        auto originalPrice = item.at("price").get<double>();
        if (!std::isfinite(originalPrice) || originalPrice <= 0 || originalPrice > 4000)
            throw Error(422, "invalid_demo_price", "Giá demo ngoài giới hạn.");
        // Fixed illustrative pricing policy, never a live currency quotation.
        auto price = Money(std::max<std::int64_t>(
                               1000, static_cast<std::int64_t>(std::round(originalPrice * 25.0)) * 1000))
                         .value();
        auto categoryKey = textField(item, "category", 100);
        auto category = categories.contains(categoryKey) ? categories.at(categoryKey) : "Phụ kiện";
        names.insert(category);
        auto description = "Sản phẩm mô phỏng cho bài tập; không cung cấp hàng thật. Nếu chọn payOS, "
                           "giao dịch sử dụng tiền thật.\n\n" +
                           textField(item, "description", 8000);
        r.save("products", {{"id", id},
                            {"shop_id", shop.at("id")},
                            {"name", textField(item, "title", 200)},
                            {"description", description},
                            {"category", category},
                            {"image", image},
                            {"weight", 300},
                            {"active", true},
                            {"sold", 0},
                            {"is_demo", true},
                            {"source", "DummyJSON"},
                            {"source_id", externalId},
                            {"created_at", now() - imported}});
        r.save("variants", {{"id", id + "-default"},
                            {"product_id", id},
                            {"shop_id", shop.at("id")},
                            {"name", "Mặc định"},
                            {"price", price},
                            {"stock", 20},
                            {"active", true}});
        ++imported;
    }
    settings["categories"] = Json::array();
    for (const auto &name : names)
        settings["categories"].push_back(name);
    r.save("settings", settings);
    return {{"imported", imported},
            {"skipped", skipped},
            {"shop_id", shop.at("id")},
            {"source", "DummyJSON"}};
}
} // namespace shoppe
