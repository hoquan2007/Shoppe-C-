#include "catalog.h"
#include "domain.h"
#include "security.h"
#include <fstream>
#include <iostream>
#include <stdexcept>

using namespace shoppe;
void check(bool ok, const char *message) {
    if (!ok)
        throw std::runtime_error(message);
}
template <class F> void rejects(F run, const std::string &code) {
    try {
        run();
    } catch (const Error &error) {
        check(error.code == code, "wrong business error");
        return;
    }
    throw std::runtime_error("expected rejection");
}
int main(int argc, char **) {
    if (argc > 1) {
        auto doc = fetchDemoCatalog(60);
        check(normalizeDemoCatalog(doc).size() == 60, "live provider returned 60 products");
        std::cout << "Live C++ HTTPS catalog fetch/validation passed: 60 demo products, no keys.\n";
        return 0;
    }
    std::ifstream file("database/demo-catalog.json");
    Json doc;
    file >> doc;
    auto normalized = normalizeDemoCatalog(doc);
    check(normalized.size() == 30 && normalized[0]["is_demo"] == true, "normalize fixture");
    auto bad = doc;
    bad["source"] = "Shopee";
    rejects([&] { normalizeDemoCatalog(bad); }, "invalid_demo_catalog");
    bad = doc;
    bad["products"][0]["thumbnail"] = "https://cdn.dummyjson.com.evil.test/x.png";
    rejects([&] { normalizeDemoCatalog(bad); }, "invalid_demo_image");
    bad = doc;
    bad["products"].push_back(bad["products"][0]);
    rejects([&] { normalizeDemoCatalog(bad); }, "duplicate_demo_id");
    bad = doc;
    bad["products"][0]["price"] = -1;
    rejects([&] { normalizeDemoCatalog(bad); }, "invalid_demo_price");
    Json categories = Json::array();
    for (const auto &item : doc["products"])
        categories.push_back(item["category"]);
    auto chosen = selectDemoCatalog(categories, {{"products", doc["products"]}}, 12);
    check(chosen["products"].size() == 12, "bounded category selection");
    rejects([&] { selectDemoCatalog(categories, {{"products", doc["products"]}}, 101); },
            "invalid_catalog_limit");
    rejects(
        [&] { selectDemoCatalog(Json::array({"not-a-category"}), {{"products", doc["products"]}}, 12); },
        "catalog_provider_invalid");
    Database db("", ":memory:", "database/schema.sql");
    auto tx = db.begin();
    Repository r(*tx);
    Json user{{"id", "admin"}, {"email", "admin@fixture.test"}, {"role", "admin"}};
    r.save("users", user);
    rejects([&] { stageDemoCatalog(r, {{"role", "buyer"}}, doc); }, "forbidden");
    auto preview = stageDemoCatalog(r, user, doc);
    check(r.list("products").empty(), "preview never imports products");
    check(preview["currency"] == "VND" && preview["payment_provider"] == "payos", "own checkout");
    rejects([&] { commitDemoCatalog(r, user, "forged-token"); }, "catalog_preview_expired");
    auto imported = commitDemoCatalog(r, user, preview.at("preview_token"));
    check(imported["imported"] == 30, "commit server-owned preview");
    rejects([&] { commitDemoCatalog(r, user, preview.at("preview_token")); }, "catalog_preview_expired");
    auto product = r.get("products", normalized[0].at("id"));
    product["name"] = "Admin edited this product";
    r.save("products", product);
    auto variant = r.get("variants", product.at("id").get<std::string>() + "-default");
    variant["stock"] = 7;
    r.save("variants", variant);
    auto next = stageDemoCatalog(r, user, doc);
    auto again = commitDemoCatalog(r, user, next.at("preview_token"));
    check(again["imported"] == 0 && again["skipped"] == 30, "idempotent import");
    check(r.get("products", product.at("id"))["name"] == product["name"], "retain admin edits");
    check(r.get("variants", variant.at("id"))["stock"] == 7, "never restock existing products");
    auto expiring = stageDemoCatalog(r, user, doc);
    auto record = r.get("settings", "catalog-preview:admin");
    record["expires_at"] = now() - 1;
    r.save("settings", record);
    rejects([&] { commitDemoCatalog(r, user, expiring.at("preview_token")); },
            "catalog_preview_expired");
    auto status = demoCatalogStatus(r, user);
    check(status.dump().find("token_hash") == std::string::npos,
          "status does not expose preview secrets");
    tx->rollback();
    std::cout
        << "Catalog validation, scoped preview, expiry, replay, price and stock preservation passed.\n";
}
