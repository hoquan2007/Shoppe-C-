#include "application.h"
#include "account_mail.h"
#include "security.h"
#include <iostream>
#include <mutex>
#include <set>
#include <stdexcept>

using namespace shoppe;
int main() {
    try {
        const auto preview = passwordResetMail("https://example.test/reset?token=fixture&source=\"test\"");
        if (preview.at("subject") != "Shoppe | Hướng dẫn đặt lại mật khẩu" ||
            preview.at("text").get<std::string>().find("1 giờ") == std::string::npos ||
            preview.at("html").get<std::string>().find("&amp;source=&quot;test&quot;") == std::string::npos ||
            preview.at("html").get<std::string>().find("Đặt lại mật khẩu</a>") == std::string::npos)
            throw std::runtime_error("reset email must include accessible text, expiry, CTA and escaped HTML");
        Database db("", ":memory:", "database/schema.sql");
        const auto origin = env("APP_URL", "http://localhost:5173");
        {
            auto tx = db.begin();
            Repository r(*tx);
            r.save("users", {{"id", "owner"}, {"email", "owner@example.test"}, {"role", "buyer"}});
            r.save("users", {{"id", "other"}, {"email", "other@example.test"}, {"role", "buyer"}});
            for (const auto &id : {"expired", "replaced", "consumed", "wrong-purpose", "wrong-user",
                                   "valid-reset", "valid-verify", "notification", "cancelled", "retry-expired"}) {
                const std::string name(id);
                const auto purpose = name == "valid-verify" ? "verify" : "reset";
                if (name != "replaced" && name != "consumed")
                    r.save("email_tokens", {{"id", sha256(name)},
                        {"user_id", name == "wrong-user" ? "other" : "owner"},
                        {"purpose", name == "wrong-purpose" ? "verify" : purpose},
                        {"expires_at", now() + ((name == "expired" || name == "retry-expired") ? -10 : 600)}});
                r.save("outbox", {{"id", name}, {"user_id", "owner"},
                    {"status", name == "cancelled" ? "cancelled" : name == "retry-expired" ? "failed" : "queued"},
                    {"attempts", name == "retry-expired" ? 1 : 0}, {"created_at", 1},
                    {"subject", "Fixture"},
                    {"text", name == "notification" ? "Order notification" : origin + "/" + purpose + "?token=" + name}});
                if (name == "valid-reset") {
                    auto mail = r.get("outbox", name);
                    mail.update(passwordResetMail(origin + "/reset?token=" + name));
                    r.save("outbox", mail);
                }
            }
            tx->commit();
        }
        std::mutex mutex;
        std::set<std::string> delivered;
        {
            Application app(db, verifyGoogleToken, [&](const Json &mail, const Json &) {
                std::lock_guard lock(mutex);
                delivered.insert(mail.at("id").get<std::string>());
                return true;
            });
            app.startMailWorker();
            bool complete = false;
            for (int n = 0; n < 1600 && !complete; ++n) {
                auto tx = db.begin(true);
                Repository r(*tx);
                complete = r.list("outbox", "status = ?", {"queued"}).empty() &&
                           r.list("outbox", "status = ?", {"failed"}).empty();
                tx->commit();
                if (!complete) std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
            if (!complete) throw std::runtime_error("mail worker did not finish");
        }
        if (delivered != std::set<std::string>{"notification", "valid-reset", "valid-verify"})
            throw std::runtime_error("invalid links reached sender or valid mail was lost");
        auto tx = db.begin(true);
        Repository r(*tx);
        for (const auto &id : {"expired", "replaced", "consumed", "wrong-purpose", "wrong-user", "retry-expired"}) {
            const auto mail = r.get("outbox", id);
            if (mail.at("status") != "cancelled" ||
                mail.at("cancelled_reason") != "account_link_expired_or_invalidated" ||
                mail.at("attempts") != (std::string(id) == "retry-expired" ? 1 : 0) ||
                !mail.contains("text"))
                throw std::runtime_error("cancellation must preserve history without a send attempt");
        }
        tx->commit();
        {
            Application app(db);
            httplib::Request request;
            request.method = "POST";
            request.path = "/api/auth/forgot";
            request.set_header("Origin", origin);
            request.body = Json{{"email", "owner@example.test"}}.dump();
            httplib::Response response;
            app.handle(request, response);
            if (response.status != 200) throw std::runtime_error(response.body);
            auto checkTx = db.begin(true);
            Repository checkRepo(*checkTx);
            bool found = false;
            for (const auto &mail : checkRepo.list("outbox", "status = ?", {"queued"})) {
                if (mail.value("subject", "") == "Shoppe | Hướng dẫn đặt lại mật khẩu") {
                    found = mail.value("html", "").find("Đặt lại mật khẩu</a>") != std::string::npos &&
                            mail.value("text", "").find("Kính gửi Quý khách") != std::string::npos;
                }
            }
            checkTx->commit();
            if (!found) throw std::runtime_error("forgot endpoint did not queue the professional multipart email");
        }
        std::cout << "Mail link expiry, replacement, consumption, ownership, retry and cancellation passed\n";
    } catch (const std::exception &e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
