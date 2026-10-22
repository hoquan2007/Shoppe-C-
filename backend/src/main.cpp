#include "application.h"
#include "security.h"
#include <filesystem>
#include <fstream>
#include <iostream>

namespace {
void loadEnv() {
    std::ifstream file(".env");
    std::string line;
    while (std::getline(file, line)) {
        if (!line.empty() && line.back() == '\r')
            line.pop_back();
        if (line.empty() || line[0] == '#')
            continue;
        auto pos = line.find('=');
        if (pos == std::string::npos)
            continue;
        auto key = line.substr(0, pos), value = line.substr(pos + 1);
        if (std::getenv(key.c_str()))
            continue;
        if (value.size() >= 2 && value.front() == '"' && value.back() == '"')
            value = value.substr(1, value.size() - 2);
#ifdef _WIN32
        _putenv_s(key.c_str(), value.c_str());
#else
        setenv(key.c_str(), value.c_str(), 0);
#endif
    }
}
} // namespace
int main() {
    using namespace shoppe;
    try {
        loadEnv();
        bool production = env("APP_ENV") == "production";
        if (production && (env("DATABASE_URL").empty() || env("APP_URL").rfind("https://", 0) != 0 ||
                           env("SEED_DEMO") == "true"))
            throw std::runtime_error(
                "Production requires DATABASE_URL, HTTPS APP_URL, and SEED_DEMO=false.");
        if (production && env("DATABASE_URL").find("sslmode=") == std::string::npos)
            throw std::runtime_error("Production DATABASE_URL must explicitly enable TLS with "
                                     "sslmode=require or verify-full.");
        if (production && (env("DATABASE_URL").find("sslmode=disable") != std::string::npos ||
                           env("DATABASE_URL").find("sslmode=allow") != std::string::npos ||
                           env("DATABASE_URL").find("sslmode=prefer") != std::string::npos))
            throw std::runtime_error("Insecure PostgreSQL TLS mode.");
        Database db(env("DATABASE_URL"), env("SQLITE_PATH", ".cache/shoppe.db"),
                    env("SCHEMA_PATH", "database/schema.sql"));
        Application app(db);
        app.seed();
        httplib::Server server;
        server.set_payload_max_length(5 * 1024 * 1024);
        server.set_read_timeout(15);
        server.set_write_timeout(15);
        server.new_task_queue = [] { return new httplib::ThreadPool(4); };
        server.set_pre_routing_handler([](const httplib::Request &, httplib::Response &res) {
            res.set_header("X-Content-Type-Options", "nosniff");
            res.set_header("X-Frame-Options", "DENY");
            res.set_header("Referrer-Policy", "strict-origin-when-cross-origin");
            res.set_header("Content-Security-Policy",
                           "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                           "img-src 'self' https: data:; connect-src 'self'; font-src 'self'; "
                           "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
            return httplib::Server::HandlerResponse::Unhandled;
        });
        auto handler = [&](const httplib::Request &req, httplib::Response &res) {
            app.handle(req, res);
        };
        server.Get(R"(/api/.*)", handler);
        server.Post(R"(/api/.*)", handler);
        server.Put(R"(/api/.*)", handler);
        server.Patch(R"(/api/.*)", handler);
        server.Delete(R"(/api/.*)", handler);
        auto root = env("STATIC_DIR", "dist");
        if (std::filesystem::exists(root))
            server.set_mount_point("/", root);
        server.Get(R"(/.*)", [&](const httplib::Request &req, httplib::Response &res) {
            if (req.path.rfind("/api/", 0) == 0 || req.path.rfind("/assets/", 0) == 0) {
                res.status = 404;
                return;
            }
            std::ifstream file(root + "/index.html");
            if (!file) {
                res.status = 503;
                res.set_content("Frontend not built. Run npm install and npm run build.", "text/plain");
                return;
            }
            std::string html((std::istreambuf_iterator<char>(file)), {});
            res.set_content(html, "text/html; charset=utf-8");
        });
        auto port = std::stoi(env("PORT", "8080"));
        std::cout << "Shoppe C++ listening on port " << port << " ("
                  << (db.postgres() ? "PostgreSQL" : "SQLite development") << ")" << std::endl;
        if (!server.listen("0.0.0.0", port))
            throw std::runtime_error("Cannot bind HTTP port.");
    } catch (const std::exception &e) {
        std::cerr << "Startup failed: " << e.what() << std::endl;
        return 1;
    }
}
