#include "catalog_copy.h"
#include "catalog.h"
#include "domain.h"
#include <algorithm>
#include <fstream>
#include <map>
#include <set>

namespace shoppe {
namespace {
void validateEditorial(const Json &document) {
    if (!document.is_object() || document.value("version", 0) != 1 ||
        document.value("source", "") != "DummyJSON" || document.value("language", "") != "vi" ||
        !document.contains("products") || !document.at("products").is_array() ||
        document.at("products").empty() || document.at("products").size() > 1000)
        throw Error(422, "invalid_catalog_copy", "Tài liệu biên tập không hợp lệ.");
    std::set<int> ids;
    for (const auto &entry : document.at("products")) {
        if (!entry.is_object() || !entry.contains("source_id") ||
            !entry.at("source_id").is_number_integer() || entry.at("source_id").get<int>() < 1 ||
            !ids.insert(entry.at("source_id").get<int>()).second)
            throw Error(422, "invalid_catalog_copy", "Mã nguồn biên tập không hợp lệ hoặc bị trùng.");
        for (const auto key : {"source_title", "source_image", "name", "introduction", "usage"})
            if (!entry.contains(key) || !entry.at(key).is_string() ||
                entry.at(key).get<std::string>().empty() || entry.at(key).get<std::string>().size() >
                    (std::string(key) == "name" ? 200U : 3000U))
                throw Error(422, "invalid_catalog_copy", "Nội dung biên tập thiếu hoặc quá dài.");
        if (entry.at("source_image").get<std::string>().rfind("https://cdn.dummyjson.com/", 0) != 0)
            throw Error(422, "invalid_catalog_copy", "Ảnh nguồn biên tập không hợp lệ.");
    }
}
bool sourceMatches(const Json &product, const Json &change) {
    return product.value("is_demo", false) &&
           (product.value("source", "") == "DummyJSON" || product.value("source", "") == "ShoppeDemo") &&
           product.at("source_id") == change.at("source_id") &&
           product.value("image", "") == change.at("image").get<std::string>();
}
} // namespace
Json loadCatalogCopy(const std::string &file) {
    std::ifstream input(file);
    if (!input)
        throw Error(503, "catalog_copy_unavailable", "Không tìm thấy tài liệu biên tập.");
    auto result = Json::parse(input);
    validateEditorial(result);
    return result;
}
Json catalogCopyText(const Json &entry) {
    return {{"name", entry.at("name")},
            {"description", "GIỚI THIỆU\n" + entry.at("introduction").get<std::string>() +
                                "\n\nSỬ DỤNG VÀ BẢO QUẢN\n" + entry.at("usage").get<std::string>() +
                                "\n\nLƯU Ý VỀ CATALOG\nSản phẩm mô phỏng phục vụ bài tập, ảnh minh họa "
                                "từ DummyJSON; không cung cấp hàng thật. Nếu chọn payOS, giao dịch "
                                "sử dụng tiền thật."}};
}
Json prepareCatalogCopy(const Json &products, const Json &editorial) {
    validateEditorial(editorial);
    if (!products.is_array() || products.empty() || products.size() > demoCatalogLimit)
        throw Error(422, "invalid_catalog_copy", "Danh sách sản phẩm không hợp lệ.");
    std::map<int, Json> entries;
    for (const auto &entry : editorial.at("products"))
        entries.emplace(entry.at("source_id").get<int>(), entry);
    Json changes = Json::array();
    std::set<std::string> ids;
    for (const auto &p : products) {
        const auto id = p.at("id").get<std::string>();
        const auto sourceId = p.at("source_id").get<int>();
        const int series = p.value("demo_series", 0);
        const auto expectedId = series ? "demo-shoppe-" + std::to_string(sourceId) + "-" + std::to_string(series)
                                       : "demo-dummyjson-" + std::to_string(sourceId);
        if (id != expectedId || !ids.insert(id).second || !entries.contains(sourceId))
            throw Error(409, "catalog_copy_conflict", "Thiếu nội dung hoặc mã sản phẩm không khớp.");
        const auto &entry = entries.at(sourceId);
        Json change{{"id", id}, {"source_id", sourceId}, {"image", entry.at("source_image")},
                    {"before", {{"name", p.at("name")}, {"description", p.at("description")}}},
                    {"after", catalogCopyText(entry)}};
        if (!sourceMatches(p, change))
            throw Error(409, "catalog_copy_conflict", "Ảnh hoặc nguồn đã thay đổi, cần duyệt lại.");
        changes.push_back(std::move(change));
    }
    return {{"version", 1}, {"count", changes.size()}, {"changes", changes}};
}
Json catalogCopyRows(Repository &r, const Json &plan) {
    if (!plan.is_object() || plan.value("version", 0) != 1 || !plan.contains("changes") ||
        !plan.at("changes").is_array() || plan.at("changes").empty() || plan.at("changes").size() > demoCatalogLimit)
        throw Error(422, "invalid_catalog_copy", "Kế hoạch cập nhật không hợp lệ.");
    Params params;
    std::string binds;
    std::set<std::string> ids;
    for (const auto &change : plan.at("changes")) {
        auto id = change.at("id").get<std::string>();
        if (!ids.insert(id).second)
            throw Error(422, "invalid_catalog_copy", "Kế hoạch có mã trùng.");
        if (!binds.empty())
            binds += ",";
        binds += "?";
        params.push_back(id);
    }
    auto rows = r.list("products", "id IN (" + binds + ")", params);
    if (rows.size() != params.size())
        throw Error(409, "catalog_copy_conflict", "Thiếu bản ghi sản phẩm trong kế hoạch.");
    return rows;
}
Json applyCatalogCopy(Repository &r, const Json &plan) {
    // Caller owns one write transaction. Preflight the whole plan before writing anything.
    std::map<std::string, Json> currentRows;
    for (const auto &p : catalogCopyRows(r, plan))
        currentRows.emplace(p.at("id").get<std::string>(), p);
    Json ready = Json::array();
    std::set<std::string> ids;
    int skipped = 0;
    for (const auto &change : plan.at("changes")) {
        auto id = change.at("id").get<std::string>();
        if (!ids.insert(id).second)
            throw Error(422, "invalid_catalog_copy", "Kế hoạch có mã trùng.");
        for (const auto key : {"name", "description"})
            if (!change.at("after").at(key).is_string() ||
                change.at("after").at(key).get<std::string>().empty() ||
                change.at("after").at(key).get<std::string>().size() >
                    (std::string(key) == "name" ? 200U : 8000U))
                throw Error(422, "invalid_catalog_copy", "Nội dung cập nhật không hợp lệ.");
        auto current = currentRows.at(id);
        if (current.is_null() || !sourceMatches(current, change))
            throw Error(409, "catalog_copy_conflict", "Mã, ảnh hoặc nguồn không còn khớp.");
        Json text{{"name", current.at("name")}, {"description", current.at("description")}};
        if (text == change.at("after")) {
            ++skipped;
            continue;
        }
        if (text != change.at("before"))
            throw Error(409, "catalog_copy_conflict", "Nội dung đã được sửa sau khi tạo kế hoạch.");
        current["name"] = change.at("after").at("name");
        current["description"] = change.at("after").at("description");
        ready.push_back(std::move(current));
    }
    // Bind all values and update only payload in bounded batches, avoiding hundreds of
    // network round trips while holding the application write lock. Indexed fields stay intact.
    for (std::size_t offset = 0; offset < ready.size(); offset += 200) {
        std::string sql = "UPDATE products SET payload=CASE id", binds;
        Params params, ids;
        for (std::size_t i = offset; i < std::min(ready.size(), offset + 200); ++i) {
            sql += " WHEN ? THEN ?";
            const auto id = ready[i].at("id").get<std::string>();
            params.push_back(id);
            params.push_back(ready[i].dump());
            ids.push_back(id);
            if (!binds.empty())
                binds += ",";
            binds += "?";
        }
        params.insert(params.end(), ids.begin(), ids.end());
        r.query(sql + " ELSE payload END WHERE id IN (" + binds + ")", params);
    }
    return {{"updated", ready.size()}, {"skipped", skipped}, {"total", plan.at("changes").size()}};
}
} // namespace shoppe
