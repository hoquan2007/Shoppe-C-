#include "catalog_query.h"
#include "domain.h"
#include <iostream>
#include <set>
#include <stdexcept>
using namespace shoppe;
void check(bool ok, const char *message) {
    if (!ok)
        throw std::runtime_error(message);
}
int main() {
    try {
        Database db("", ":memory:", "database/schema.sql");
        auto tx = db.begin();
        Repository r(*tx);
        r.save("users", {{"id", "owner"}, {"email", "catalog@example.test"}, {"role", "seller"}});
        r.save(
            "shops",
            {{"id", "shop"}, {"owner_id", "owner"}, {"status", "approved"}, {"name", "Fixture shop"}});
        for (int i = 0; i < 30; i++) {
            auto id = "fixture-" + std::to_string(i);
            r.save("products", {{"id", id},
                                {"shop_id", "shop"},
                                {"name", i == 0 ? "Áo thun ĐẸP 100%" : "Fixture " + std::to_string(i)},
                                {"category", i % 2 ? "B" : "A"},
                                {"image", "/assets/product-lifestyle.svg"},
                                {"active", true},
                                {"created_at", 1000 - i}});
            r.save("variants", {{"id", id + "-v"},
                                {"product_id", id},
                                {"shop_id", "shop"},
                                {"price", 1000 + i * 1000},
                                {"stock", 1},
                                {"active", true}});
        }
        auto first = publicCatalog(r, Json::object());
        check(first["products"].size() == 12 && first["total"] == 30 && first["pages"] == 3,
              "bounded page and total");
        auto second = publicCatalog(r, {{"page", "2"}});
        std::set<std::string> ids;
        for (const auto &p : first["products"])
            ids.insert(p.at("id"));
        for (const auto &p : second["products"])
            check(!ids.contains(p.at("id")), "pages do not overlap");
        check(publicCatalog(r, {{"page", "999"}})["products"].size() == 6, "last page clamp");
        check(publicCatalog(r, {{"q", "ao thun dep"}})["total"] == 1, "Vietnamese search");
        check(publicCatalog(r, {{"q", "100%"}})["total"] == 1, "percent is literal");
        check(publicCatalog(r, {{"q", "_"}})["total"] == 0, "underscore is literal");
        check(publicCatalog(r, {{"category", "A"}, {"page_size", "24"}})["products"].size() == 15,
              "category before pagination");
        check(publicCatalog(r, {{"min", "5000"}, {"max", "6000"}})["total"] == 2, "price bounds");
        check(publicCatalog(r, {{"sort", "price-desc"}})["products"][0]["id"] == "fixture-29",
              "sort across full catalog");
        for (const auto &o : {Json{{"page", "0"}}, Json{{"page_size", "49"}}, Json{{"page", "-1"}},
                              Json{{"sort", "DROP TABLE products"}}, Json{{"min", "4"}, {"max", "2"}}}) {
            bool denied = false;
            try {
                publicCatalog(r, o);
            } catch (const Error &e) {
                denied = e.status == 422;
            }
            check(denied, "invalid query denied");
        }
        auto shop = r.get("shops", "shop");
        shop["status"] = "suspended";
        r.save("shops", shop);
        check(publicCatalog(r, Json::object())["total"] == 0, "unapproved shop hidden");
        tx->commit();
        std::cout << "Catalog pagination, Vietnamese search, price sort and public visibility passed\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
