#include "application.h"
#include "http_runtime.h"
#include "request_log.h"
#include "security.h"
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
#include <syncstream>

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
int main(int argc, char **argv) {
    using namespace shoppe;
    try {
        auto startupStarted = std::chrono::steady_clock::now();
        loadEnv();
        const bool initialize = argc == 2 && std::string(argv[1]) == "--initialize";
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
                    env("SCHEMA_PATH", "database/schema.sql"), !production || initialize);
        Application app(db);
        if (!production || initialize)
            app.seed();
        if (initialize) {
            std::cout << "Database initialized; no HTTP server or payment request started." << std::endl;
            return 0;
        }
        httplib::Server server;
        server.set_payload_max_length(5 * 1024 * 1024);
        server.set_read_timeout(15);
        server.set_write_timeout(15);
        // API responses often split headers/body into small writes; avoid Nagle delaying the body.
        server.set_tcp_nodelay(true);
        server.new_task_queue = [] { return new HttpTaskQueue(); };
        // cpp-httplib dedicates a worker to each accepted connection, including idle
        // keep-alive waits. The platform handles public HTTP/2 connection reuse;
        // allow bounded reuse with spare workers for new requests. Two seconds also
        // leave room for Node agents' default one-second keep-alive safety buffer.
        server.set_keep_alive_max_count(64);
        server.set_keep_alive_timeout(2);
        server.set_post_routing_handler([](const httplib::Request &, httplib::Response &res) {
            const auto routed = HttpTiming::Clock::now();
            httpTiming.routed = routed;
            if (httpTiming.worker == HttpTiming::Clock::time_point{}) return;
            auto timing = res.get_header_value("Server-Timing");
            res.headers.erase("Server-Timing");
            res.set_header("Server-Timing", timing + (timing.empty() ? "" : ", ") +
                "socket_queue;dur=" + std::to_string(HttpTiming::ms(httpTiming.worker, httpTiming.accepted)) +
                ", socket_to_request;dur=" + std::to_string(HttpTiming::ms(httpTiming.ready, httpTiming.worker)) +
                ", socket_to_headers;dur=" + std::to_string(HttpTiming::ms(routed, httpTiming.worker)) +
                ", request_to_headers;dur=" + std::to_string(HttpTiming::ms(routed, httpTiming.ready)));
        });
        server.set_logger([](const httplib::Request &req, const httplib::Response &res) {
            if (req.path.rfind("/api/", 0) != 0) return;
            const auto done = HttpTiming::Clock::now();
            requestLog().submit(Json{{"event", "http_headers_ready"},
                {"request_id", res.get_header_value("X-Request-Id")},
                {"status", res.status}, {"path", req.path},
                {"socket_queue_ms", HttpTiming::ms(httpTiming.worker, httpTiming.accepted)},
                {"socket_to_headers_ms", HttpTiming::ms(done, httpTiming.worker)},
                // Socket age includes idle time on a reused connection. This phase
                // starts after request parsing and excludes that idle wait.
                {"request_to_headers_ms", HttpTiming::ms(done, httpTiming.ready)},
                {"header_serialization_ms", HttpTiming::ms(done, httpTiming.routed)}});
            // A reused connection starts a new request after this response; do not count its age as queueing.
            httpTiming.accepted = httpTiming.worker = done;
        });
        server.set_pre_routing_handler([](const httplib::Request &req, httplib::Response &res) {
            httpTiming.ready = HttpTiming::Clock::now();
            if (std::regex_match(req.path, std::regex(R"(/assets/[^/]+-[A-Za-z0-9_-]{8}\.(js|css))")))
                res.set_header("Cache-Control", "public, max-age=31536000, immutable");
            res.set_header("X-Content-Type-Options", "nosniff");
            res.set_header("X-Frame-Options", "DENY");
            res.set_header("Referrer-Policy", googleReady() && env("APP_ENV") != "production"
                                                  ? "no-referrer-when-downgrade"
                                                  : "strict-origin-when-cross-origin");
            if (googleReady()) {
                res.set_header("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
                res.set_header(
                    "Content-Security-Policy",
                    "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; "
                    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; "
                    "img-src 'self' https: data:; connect-src 'self' https://accounts.google.com/gsi/; "
                    "frame-src https://accounts.google.com/gsi/; font-src 'self'; "
                    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
            } else
                res.set_header(
                    "Content-Security-Policy",
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
        std::cout << Json{{"event", "startup"}, {"instance_id", app.instanceId()},
                          {"duration_ms", std::chrono::duration<double, std::milli>(
                                              std::chrono::steady_clock::now() - startupStarted)
                                              .count()},
                          {"schema_mode", production ? "verify" : "initialize"}}
                         .dump()
                  << std::endl;
        auto port = std::stoi(env("PORT", "8080"));
        app.startMailWorker();
        std::cout << "Shoppe C++ listening on port " << port << " ("
                  << (db.postgres() ? "PostgreSQL" : "SQLite development") << ")" << std::endl;
        if (!server.listen("0.0.0.0", port))
            throw std::runtime_error("Cannot bind HTTP port.");
    } catch (const std::exception &e) {
        std::cerr << "Startup failed: " << e.what() << std::endl;
        return 1;
    }
}
