#include "application.h"
#include "security.h"
#include <future>
#include <iostream>
#include <stdexcept>

using namespace shoppe;
void check(bool value, const char *message) {
    if (!value)
        throw std::runtime_error(message);
}
Json call(Application &app, const std::string &path, const std::string &method = "GET",
          const Json &body = Json(), int expectedStatus = 200, const httplib::Params &params = {}) {
    httplib::Request req;
    req.method = method;
    req.path = path;
    req.params = params;
    req.set_header("Cookie", "shoppe_session=" + std::string(64, 'a'));
    req.set_header("Origin", env("APP_URL", "http://localhost:5173"));
    req.set_header("X-CSRF-Token", "fixture-csrf");
    if (!body.is_null())
        req.body = body.dump();
    httplib::Response response;
    app.handle(req, response);
    check(response.status == expectedStatus, response.body.c_str());
    return Json::parse(response.body);
}
int main() {
    try {
        const auto url = env("SHOPPE_PERFORMANCE_DATABASE_URL");
        if (!url.empty() && url.find("@127.0.0.1:") == std::string::npos)
            throw std::runtime_error("Performance tests require a disposable localhost database");
        Database db(url, ":memory:", "database/schema.sql");
        {
            auto tx = db.begin();
            Repository r(*tx);
            r.save("users", {{"id", "owner"},
                             {"email", "owner@example.test"},
                             {"name", "Fixture owner"},
                             {"role", "admin"},
                             {"active", true}});
            r.save("shops", {{"id", "shop"},
                             {"owner_id", "owner"},
                             {"status", "approved"},
                             {"name", "Fixture"},
                             {"region", "Miền Nam"}});
            r.save("sessions", {{"id", sha256(std::string(64, 'a'))},
                                {"user_id", "owner"},
                                {"csrf", "fixture-csrf"},
                                {"expires_at", now() + 3600}});
            Json items = Json::array();
            for (int n = 0; n < 120; n++) {
                auto id = "perf-" + std::to_string(n);
                r.save("products", {{"id", id},
                                    {"shop_id", "shop"},
                                    {"category", "A"},
                                    {"active", n != 0},
                                    {"created_at", 1000 + n},
                                    {"name", id},
                                    {"description", std::string(2000, 'x')},
                                    {"image", "/assets/product-bag.svg"},
                                    {"weight", 100}});
                r.save("variants", {{"id", id + "-v"},
                                    {"product_id", id},
                                    {"shop_id", "shop"},
                                    {"active", true},
                                    {"price", 1000},
                                    {"stock", 100}});
                if (n > 0 && n <= 50) {
                    items.push_back({{"variant_id", id + "-v"}, {"quantity", 1}, {"selected", true}});
                    r.save("wishlists", {{"id", id + "-w"}, {"user_id", "owner"}, {"product_id", id}});
                }
            }
            r.save("carts", {{"id", "cart"}, {"user_id", "owner"}, {"items", items}});
            r.save("checkouts", {{"id", "cod"},
                                 {"buyer_id", "owner"},
                                 {"idem_key", "cod"},
                                 {"order_code", 1},
                                 {"status", "cod"},
                                 {"expires_at", now() + 3600},
                                 {"method", "cod"}});
            r.save("checkouts", {{"id", "review"},
                                 {"buyer_id", "owner"},
                                 {"idem_key", "review"},
                                 {"order_code", 2},
                                 {"status", "review"},
                                 {"expires_at", now() + 3600},
                                 {"method", "payos"},
                                 {"received_amount", 2000}});
            r.save("orders", {{"id", "order"},
                              {"buyer_id", "owner"},
                              {"shop_id", "shop"},
                              {"checkout_id", "cod"},
                              {"status", "completed"},
                              {"cod_status", "paid"},
                              {"total", 5000},
                              {"created_at", 1000}});
            r.save("order_items", {{"id", "line"},
                                   {"order_id", "order"},
                                   {"variant_id", "perf-1-v"},
                                   {"product_id", "perf-1"},
                                   {"name", "Fixture"},
                                   {"quantity", 3}});
            r.save("returns", {{"id", "return"},
                               {"order_id", "order"},
                               {"buyer_id", "owner"},
                               {"status", "received"},
                               {"items", Json::array({Json{{"item_id", "line"}, {"quantity", 1}}})}});
            r.save("refunds",
                   {{"id", "refund"}, {"order_id", "order"}, {"checkout_id", "cod"}, {"amount", 1000}});
            r.save(
                "refunds",
                {{"id", "excess"}, {"order_id", nullptr}, {"checkout_id", "review"}, {"amount", 500}});
            tx->commit();
        }
        Application app(db);
        auto cart = call(app, "/api/cart");
        check(cart.at("lines").size() == 50, "full cart survives batching");
        check(Database::metrics().queries <= 12, "cart query count is bounded for 50 lines");
        auto wishlist = call(app, "/api/wishlist");
        check(wishlist.at("products").size() == 50, "wishlist survives batching");
        check(Database::metrics().queries <= 12, "wishlist does not use per-product queries");
        auto first = call(app, "/api/admin/products");
        check(first["products"].size() == 50 && first["total"] == 120 && first["pages"] == 3,
              "management defaults to bounded pagination");
        auto second = call(app, "/api/admin/products", "GET", Json(), 200, {{"page", "2"}});
        check(first["products"][0]["id"] != second["products"][0]["id"], "management next page differs");
        call(app, "/api/admin/products", "GET", Json(), 422, {{"page_size", "101"}});
        auto editorPage = call(app, "/api/admin/products", "GET", Json(), 200, {{"include", "editor"}});
        check(editorPage["products"].size() == 50 && editorPage.contains("catalog") &&
                  editorPage["shops"].size() > 0 && !editorPage["shops"][0].contains("owner_id"),
              "management combines editor context without full shop records");
        auto publicPage = call(app, "/api/products");
        check(publicPage["total"] == 119 && !publicPage["products"][0].contains("description"),
              "public cards are summaries and exclude hidden products");
        auto combined = call(app, "/api/products", "GET", Json(), 200, {{"include", "meta"}});
        check(combined.contains("meta") && combined["meta"].contains("categories"),
              "catalog delivers public metadata in the same snapshot");
        call(app, "/api/products/perf-0", "GET", Json(), 404, {{"view", "public"}});
        check(call(app, "/api/products/perf-0")["product"]["id"] == "perf-0",
              "authorized preview remains available");
        auto dashboard = call(app, "/api/dashboard", "GET", Json(), 200, {{"scope", "admin"}});
        check(dashboard["stats"]["revenue"] == 7000 && dashboard["stats"]["refunds"] == 1500 &&
                  dashboard["stats"]["net_revenue"] == 5500,
              "dashboard preserves COD, reconciliation and refund accounting");
        check(dashboard["top_products"][0]["quantity"] == 2, "top products subtract partial returns");
        check(dashboard["low_stock"].size() <= 5 && dashboard["orders"].size() <= 6,
              "dashboard response is bounded");
        {
            auto tx = db.begin();
            Repository r(*tx);
            r.save("users", {{"id", "buyer"}, {"email", "buyer@example.test"}, {"role", "buyer"}});
            r.save("conversations",
                   {{"id", "chat"}, {"buyer_id", "buyer"}, {"shop_id", "shop"}, {"updated_at", 1000}});
            Json messages = Json::array(), notifications = Json::array();
            for (int n = 0; n < 75; n++) {
                messages.push_back({{"id", "legacy-" + std::to_string(n)},
                                    {"conversation_id", "chat"},
                                    {"sender_id", "buyer"},
                                    {"created_at", 1000},
                                    {"text", "Legacy message"}});
                notifications.push_back({{"id", "notification-" + std::to_string(n)},
                                         {"user_id", "owner"},
                                         {"created_at", 1000 + n}});
            }
            r.saveMany("messages", messages);
            r.saveMany("notifications", notifications);
            tx->commit();
        }
        auto room = call(app, "/api/conversations/chat/messages");
        check(room["messages"].size() == 50 && room["has_more"] == true,
              "chat initially fetches only the latest 50 messages");
        const auto oldest = room.at("messages").front();
        auto history = call(app, "/api/conversations/chat/messages", "GET", Json(), 200,
                            {{"before_time", "1000"},
                             {"before_id", oldest.at("id").get<std::string>()},
                             {"before_sequence", "0"}});
        check(history["messages"].size() == 25 && history["has_more"] == false,
              "older legacy history remains reachable");
        call(app, "/api/conversations/chat/messages", "POST", {{"text", "First sequenced message"}});
        auto delta =
            call(app, "/api/conversations/chat/messages", "GET", Json(), 200, {{"after_sequence", "0"}});
        check(delta["messages"].size() == 1 && delta["messages"][0]["sequence"] == 1,
              "poll returns only new messages");
        {
            auto tx = db.begin();
            Repository r(*tx);
            r.save("messages", {{"id", "000000-low-random-id"},
                                {"conversation_id", "chat"},
                                {"sender_id", "buyer"},
                                {"created_at", delta["messages"][0]["created_at"]},
                                {"sequence", 2},
                                {"text", "Later within the same second"}});
            auto conversation = r.get("conversations", "chat");
            conversation["message_sequence"] = 2;
            r.save("conversations", conversation);
            tx->commit();
        }
        check(call(app, "/api/conversations/chat/messages", "GET", Json(), 200,
                   {{"after_sequence", "1"}})["messages"]
                      .size() == 1,
              "same-second messages are not lost when their random ID sorts before the previous ID");
        check(call(app, "/api/notifications")["notifications"].size() == 50,
              "notification list is bounded");
        check(call(app, "/api/notifications", "GET", Json(), 200, {{"page", "2"}})["notifications"]
                      .size() == 25,
              "notification history has a next page");
        // Lists must stay bounded even when the database grows far past one page.
        {
            auto tx = db.begin(); Repository r(*tx);
            Json users = Json::array(), shops = Json::array(), reviews = Json::array(), lines = Json::array();
            for (int n = 0; n < 1000; n++) {
                auto id = "scale-" + std::to_string(n);
                users.push_back({{"id", id}, {"email", id + "@example.test"}, {"name", id},
                    {"role", "buyer"}, {"active", false}, {"created_at", n}});
                shops.push_back({{"id", id}, {"owner_id", id}, {"status", "approved"},
                    {"name", id}, {"created_at", n}});
                lines.push_back({{"id", id}, {"order_id", "order"}, {"variant_id", "perf-1-v"},
                    {"product_id", "perf-1"}, {"quantity", 1}});
                reviews.push_back({{"id", id}, {"buyer_id", id}, {"product_id", "perf-1"},
                    {"order_item_id", id}, {"rating", 5}, {"hidden", n % 2 == 0}, {"created_at", n}});
            }
            r.saveMany("users", users); r.saveMany("shops", shops);
            r.saveMany("order_items", lines); r.saveMany("reviews", reviews); tx->commit();
        }
        auto usersPage = call(app, "/api/admin/users");
        check(usersPage["users"].size() == 50 && usersPage["total"].get<int>() >= 1000, "users page is bounded");
        auto filtered = call(app, "/api/admin/users", "GET", Json(), 200, {{"q", "scale-999"}, {"active", "false"}});
        check(filtered["total"] == 1, "user search and boolean filter work in both databases");
        check(call(app, "/api/admin/users", "GET", Json(), 200, {{"q", "%"}})["total"] == 0,
              "search wildcards are literal input");
        check(call(app, "/api/admin/shops")["shops"].size() == 50, "shops page is bounded");
        auto selector = call(app, "/api/admin/shops", "GET", Json(), 200,
            {{"q", "scale-999"}, {"view", "selector"}, {"status", "approved"}});
        check(selector["shops"].size() == 1 && !selector["shops"][0].contains("owner_id"), "shop selector searches beyond page one");
        auto details = call(app, "/api/products/perf-1", "GET", Json(), 200, {{"view", "public"}});
        check(details["reviews"].size() == 20 && details["review_page"]["total"] == 500 &&
            details["product"]["review_count"] == 500 && details["product"]["rating"] == 5,
            "review pagination and aggregate exclude hidden reviews without loading them all");
        // An in-flight provider cannot own the database lock or a customer HTTP worker.
        {
        std::promise<void> entered, release;
        auto enteredFuture = entered.get_future();
        auto released = release.get_future().share();
        Application mailApp(db, verifyGoogleToken, [&](const Json &, const Json &) {
            entered.set_value();
            released.wait();
            return true;
        });
        {
            auto tx = db.begin();
            Repository r(*tx);
            r.save("outbox", {{"id", "mail"},
                              {"user_id", "owner"},
                              {"status", "queued"},
                              {"attempts", 0},
                              {"subject", "Test"},
                              {"text", "Test"},
                              {"created_at", now()}});
            tx->commit();
        }
        mailApp.startMailWorker();
        if (enteredFuture.wait_for(std::chrono::seconds(2)) != std::future_status::ready) {
            release.set_value();
            throw std::runtime_error("worker did not claim queued mail");
        }
        auto request = std::async(std::launch::async, [&] { return call(mailApp, "/api/cart"); });
        bool responsive = request.wait_for(std::chrono::seconds(2)) == std::future_status::ready;
        release.set_value();
        request.get();
        check(responsive, "email network call must not block the cart/database");
        }
        {
            auto tx = db.begin(); Repository r(*tx);
            for (int attempt : {1,3}) r.save("outbox", {
                {"id", "stale-mail-" + std::to_string(attempt)}, {"user_id", "owner"},
                {"status", "sending"}, {"claimed_at", now()-121}, {"attempts", attempt},
                {"created_at", 1}, {"subject", "Lease fixture"}, {"text", "Only a mock"}});
            tx->commit();
        }
        {
            std::atomic<int> deliveries{0};
            Application recovered(db, verifyGoogleToken, [&](const Json &, const Json &) { ++deliveries; return true; });
            recovered.startMailWorker();
            bool ready = false;
            for (int n=0; n<200 && !ready; n++) {
                auto tx = db.begin(true); Repository r(*tx);
                ready = r.get("outbox", "stale-mail-1").value("status", "") == "sent" &&
                    r.get("outbox", "stale-mail-3").value("status", "") == "failed";
                tx->commit();
                if (!ready) std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
            check(ready && deliveries == 1, "expired leases recover and exhausted uncertain sends are not resent");
        }
        call(app, "/api/admin/outbox/retry", "POST", Json::object());
        {
            auto tx = db.begin(true); Repository r(*tx);
            check(r.get("outbox", "stale-mail-3").value("status", "") == "failed", "batch retry skips uncertain delivery");
            tx->commit();
        }
        call(app, "/api/admin/outbox/retry", "POST", {{"id", "stale-mail-3"}}, 422);
        call(app, "/api/admin/outbox/retry", "POST", {{"id", "stale-mail-3"}, {"confirm_uncertain", true}});
        // Google-only accounts have no password_hash until the first successful reset.
        {
            auto tx = db.begin();
            Repository r(*tx);
            r.save("email_tokens", {{"id", sha256("fixture-reset-token")},
                                    {"user_id", "owner"},
                                    {"purpose", "reset"},
                                    {"expires_at", now() + 600}});
            tx->commit();
        }
        call(app, "/api/auth/reset", "POST",
             {{"token", "fixture-reset-token"}, {"password", "NewDemoPassword123!"}});
        {
            auto tx = db.begin(true);
            Repository r(*tx);
            check(passwordVerify("NewDemoPassword123!", r.get("users", "owner").at("password_hash")),
                  "an account without a password can set one through a valid reset token");
            check(r.get("sessions", sha256(std::string(64, 'a'))).is_null(),
                  "password reset revokes previous sessions");
            tx->commit();
        }
        std::cout << "Bounded cart/wishlist/management, dashboard accounting, public preview isolation "
                     "and asynchronous mail passed\n";
    } catch (const std::exception &error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
