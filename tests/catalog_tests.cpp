#include "catalog.h"
#include "catalog_copy.h"
#include "domain.h"
#include "security.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <set>

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
        auto doc = fetchDemoCatalog(demoCatalogLimit);
        check(normalizeDemoCatalog(doc).size() == demoCatalogLimit, "live catalog reaches configured limit");
        std::cout << "Live C++ catalog fetch/validation passed: " << demoCatalogLimit << " demo products, "
                  << doc.at("generated_products") << " explicitly generated samples, no keys.\n";
        return 0;
    }
    std::ifstream file("database/demo-catalog.json");
    Json doc;
    file >> doc;
    auto normalized = normalizeDemoCatalog(doc);
    check(normalized.size() == 30 && normalized[0]["is_demo"] == true, "normalize fixture");
    check(normalized[0]["name"] == "Mascara Essence Lash Princess", "reviewed Vietnamese import name");
    auto editorial = loadCatalogCopy("database/catalog-copy.vi.json");
    check(editorial.at("products").size() == 177, "complete reviewed original catalog");
    auto changedSource = doc;
    changedSource["products"][0]["title"] = "A different product from provider";
    check(normalizeDemoCatalog(changedSource)[0]["name"] == "A different product from provider",
          "changed provider title never receives mismatched copy");
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
    rejects([&] { selectDemoCatalog(categories, {{"products", doc["products"]}}, 601); },
            "invalid_catalog_limit");
    auto expanded = selectDemoCatalog(categories, {{"products", doc["products"]}}, 300);
    auto expandedProducts = normalizeDemoCatalog(expanded);
    check(expandedProducts.size() == 300 && expanded["generated_products"] == 270, "expand bounded catalog");
    check(expandedProducts == normalizeDemoCatalog(selectDemoCatalog(categories, {{"products", doc["products"]}}, 300)),
          "generated identities are deterministic");
    std::set<std::string> expandedIds;
    int generated = 0;
    for (const auto &p : expandedProducts) {
        check(expandedIds.insert(p.at("id")).second, "unique generated product identities");
        if (p["source"] == "ShoppeDemo") {
            ++generated;
            check(p.value("is_demo", false) &&
                      p.at("description").get<std::string>().find("mô phỏng") != std::string::npos,
                  "generated provenance remains explicit without a title suffix");
        }
    }
    check(generated == 270, "retain truthful source attribution");
    auto expanded600 = selectDemoCatalog(categories, {{"products", doc["products"]}}, 600);
    auto oversized = expanded600;
    oversized["products"].push_back(oversized["products"][0]);
    rejects([&] { normalizeDemoCatalog(oversized); }, "invalid_demo_catalog");
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
    auto largePreview = stageDemoCatalog(r, user, expanded);
    check(largePreview["existing"] == 30 && largePreview["new_products"] == 270, "large preview preserves original IDs");
    auto largeImport = commitDemoCatalog(r, user, largePreview.at("preview_token"));
    check(largeImport["imported"] == 270 && r.list("products").size() == 300, "import 300 products");
    auto largeAgain = stageDemoCatalog(r, user, expanded);
    auto largeReplay = commitDemoCatalog(r, user, largeAgain.at("preview_token"));
    check(largeReplay["imported"] == 0 && largeReplay["skipped"] == 300, "repeat 300 never duplicates");
    check(r.get("variants", variant.at("id"))["stock"] == 7 &&
          r.get("products", product.at("id"))["name"] == product["name"], "300 product import preserves edits and stock");
    // Incremental expansion must retain every existing original/generated identity and edit.
    auto editedGenerated = r.get("products", expandedProducts[299].at("id"));
    editedGenerated["name"] = "Edited generated sample";
    r.save("products", editedGenerated);
    auto editedVariant = r.get("variants", editedGenerated.at("id").get<std::string>() + "-default");
    editedVariant["stock"] = 3;
    r.save("variants", editedVariant);
    auto priorProducts = r.list("products"), priorVariants = r.list("variants");
    auto preview600 = stageDemoCatalog(r, user, expanded600);
    check(preview600["existing"] == 300 && preview600["new_products"] == 300,
          "600 preview adds exactly 300 while retaining previous samples");
    auto imported600 = commitDemoCatalog(r, user, preview600.at("preview_token"));
    check(imported600["imported"] == 300 && imported600["skipped"] == 300 &&
          r.list("products").size() == 600, "incremental import reaches 600");
    for (const auto &p : priorProducts)
        check(r.get("products", p.at("id")) == p, "preserve every previous product");
    for (const auto &v : priorVariants)
        check(r.get("variants", v.at("id")) == v, "preserve every previous variant and stock");
    auto repeat600 = stageDemoCatalog(r, user, expanded600);
    auto skipped600 = commitDemoCatalog(r, user, repeat600.at("preview_token"));
    check(skipped600["imported"] == 0 && skipped600["skipped"] == 600, "repeat 600 never duplicates or restocks");
    auto beforeCopy = r.list("products");
    auto beforeCopyVariants = r.list("variants");
    auto copyPlan = prepareCatalogCopy(beforeCopy, editorial);
    check(copyPlan.at("count") == 600, "copy covers all 600 listings");
    auto conflict = beforeCopy[1];
    conflict["description"] = "Concurrent seller edit";
    r.save("products", conflict);
    rejects([&] { applyCatalogCopy(r, copyPlan); }, "catalog_copy_conflict");
    check(r.get("products", beforeCopy[0].at("id")) == beforeCopy[0],
          "copy preflight fails before any earlier row is written");
    r.save("products", beforeCopy[1]);
    auto copied = applyCatalogCopy(r, copyPlan);
    check(copied.at("updated").get<int>() > 0 && copied.at("total") == 600, "copy updates existing edits explicitly");
    auto replay = applyCatalogCopy(r, copyPlan);
    check(replay.at("updated") == 0 && replay.at("skipped") == 600, "copy apply is idempotent");
    for (const auto &p : beforeCopy) {
        auto after = r.get("products", p.at("id"));
        check(after.at("description").get<std::string>().find("không cung cấp hàng thật") != std::string::npos,
              "copy preserves visible demonstration disclosure");
        after["name"] = p.at("name");
        after["description"] = p.at("description");
        check(after == p, "copy changes only name and description");
    }
    check(r.list("variants") == beforeCopyVariants, "copy never changes variant price or stock");
    auto duplicateCopy = copyPlan;
    duplicateCopy["changes"].push_back(duplicateCopy["changes"][0]);
    rejects([&] { applyCatalogCopy(r, duplicateCopy); }, "invalid_catalog_copy");
    auto missingCopy = editorial;
    missingCopy["products"].erase(missingCopy["products"].begin());
    rejects([&] { prepareCatalogCopy(beforeCopy, missingCopy); }, "catalog_copy_conflict");
    tx->rollback();
    std::cout
        << "Catalog validation, scoped preview, expiry, replay, price and stock preservation passed.\n";
}
