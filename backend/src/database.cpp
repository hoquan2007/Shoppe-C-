#include "database.h"
#include "domain.h"
#include "security.h"
#include <sqlite3.h>
#ifdef SHOPPE_POSTGRES
#include <libpq-fe.h>
#endif
#include <algorithm>
#include <cctype>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>

namespace shoppe {
namespace {
thread_local Database::Metrics requestMetrics;
struct SqlTimer {
    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    ~SqlTimer() {
        requestMetrics.sqlMs +=
            std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
        ++requestMetrics.queries;
    }
};
const std::map<std::string, std::vector<std::string>> columns = {
    {"users", {"email", "role"}},
    {"shops", {"owner_id", "status"}},
    {"products", {"shop_id", "category", "active"}},
    {"variants", {"product_id", "shop_id", "stock", "price"}},
    {"sessions", {"user_id", "expires_at"}},
    {"email_tokens", {"user_id", "purpose", "expires_at"}},
    {"auth_identities", {"user_id", "provider", "subject"}},
    {"auth_challenges", {"expires_at"}},
    {"addresses", {"user_id"}},
    {"carts", {"user_id"}},
    {"wishlists", {"user_id", "product_id"}},
    {"vouchers", {"shop_id", "code", "active"}},
    {"checkouts", {"buyer_id", "idem_key", "order_code", "status", "expires_at"}},
    {"orders", {"buyer_id", "shop_id", "checkout_id", "status"}},
    {"order_items", {"order_id", "variant_id"}},
    {"redemptions", {"voucher_id", "checkout_id"}},
    {"payment_events", {"checkout_id", "provider_ref"}},
    {"returns", {"order_id", "buyer_id", "status"}},
    {"refunds", {"order_id", "checkout_id"}},
    {"reviews", {"buyer_id", "product_id", "order_item_id"}},
    {"conversations", {"buyer_id", "shop_id"}},
    {"messages", {"conversation_id", "sender_id"}},
    {"notifications", {"user_id"}},
    {"outbox", {"user_id", "status"}},
    {"audit", {"actor_id"}},
    {"settings", {}},
    {"rate_limits", {}}};
void checkTable(const std::string &name) {
    if (!columns.contains(name))
        throw std::logic_error("Unknown repository");
}
std::string value(const Json &j, const std::string &key) {
    if (!j.contains(key) || j[key].is_null())
        return "";
    if (j[key].is_boolean())
        return j[key].get<bool>() ? "1" : "0";
    if (j[key].is_string())
        return j[key].get<std::string>();
    return j[key].dump();
}
#ifdef SHOPPE_POSTGRES
std::string pgSql(const std::string &sql) {
    std::string result;
    int index = 0;
    bool quoted = false;
    for (auto c : sql) {
        if (c == '\'')
            quoted = !quoted;
        if (c == '?' && !quoted)
            result += "$" + std::to_string(++index);
        else
            result += c;
    }
    return result;
}
#endif
} // namespace
void Database::resetMetrics() {
    requestMetrics = {};
}
Database::Metrics Database::metrics() {
    return requestMetrics;
}
Database::Database(std::string url, std::string path, const std::string &schemaPath, bool initialize)
    : url_(std::move(url)), path_(std::move(path)) {
    std::ifstream file(schemaPath);
    if (!file)
        throw std::runtime_error("Cannot read database schema: " + schemaPath);
    std::stringstream schema;
    schema << file.rdbuf();
    if (url_.empty()) {
        auto parent = std::filesystem::path(path_).parent_path();
        if (!parent.empty())
            std::filesystem::create_directories(parent);
        if (sqlite3_open_v2(path_.c_str(), &sqlite_,
                            SQLITE_OPEN_READWRITE | (initialize ? SQLITE_OPEN_CREATE : 0),
                            nullptr) != SQLITE_OK)
            throw std::runtime_error("Cannot open SQLite");
        sqlite3_busy_timeout(sqlite_, 10000);
        sqlite3_create_function_v2(
            sqlite_, "shoppe_search", 1, SQLITE_UTF8 | SQLITE_DETERMINISTIC, nullptr,
            [](sqlite3_context *ctx, int, sqlite3_value **args) {
                const auto *raw = sqlite3_value_text(args[0]);
                auto key = searchKey(raw ? reinterpret_cast<const char *>(raw) : "");
                sqlite3_result_text(ctx, key.c_str(), -1, SQLITE_TRANSIENT);
            },
            nullptr, nullptr, nullptr);
        char *error = nullptr;
        if (sqlite3_exec(sqlite_, "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;", nullptr, nullptr,
                         &error) != SQLITE_OK) {
            std::string message = error ? error : "schema error";
            sqlite3_free(error);
            throw std::runtime_error(message);
        }
    } else {
#ifdef SHOPPE_POSTGRES
        if (initialize) {
            auto conn = PQconnectdb(url_.c_str());
            if (PQstatus(conn) != CONNECTION_OK) {
                PQfinish(conn);
                throw std::runtime_error("Cannot connect to PostgreSQL; check DATABASE_URL/TLS.");
            }
            // Keep business data outside Supabase's exposed public schema. Serialize first-run DDL.
            auto migration = "BEGIN; SELECT pg_advisory_xact_lock(72134001); "
                             "CREATE SCHEMA IF NOT EXISTS shoppe; "
                             "REVOKE ALL ON SCHEMA shoppe FROM PUBLIC; "
                             "COMMIT;";
            auto result = PQexec(conn, migration);
            auto ok = PQresultStatus(result) == PGRES_COMMAND_OK;
            PQclear(result);
            PQfinish(conn);
            if (!ok)
                throw std::runtime_error("PostgreSQL schema initialization failed.");
        }
#else
        throw std::runtime_error("Rebuild with SHOPPE_POSTGRES=ON to use DATABASE_URL.");
#endif
    }
    try {
        auto tx = begin(!initialize);
        if (initialize)
            tx->execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, "
                        "name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at BIGINT NOT NULL)");
        std::vector<std::pair<int, std::filesystem::path>> files{{1, schemaPath}};
        auto directory = std::filesystem::path(schemaPath).parent_path() / "migrations";
        if (std::filesystem::exists(directory))
            for (const auto &entry : std::filesystem::directory_iterator(directory)) {
                auto name = entry.path().filename().string();
                if (entry.path().extension() != ".sql")
                    continue;
                if (name.size() < 6 || name[4] != '_' ||
                    !std::all_of(name.begin(), name.begin() + 4,
                                 [](unsigned char c) { return std::isdigit(c); }))
                    throw std::runtime_error("Invalid migration filename");
                auto version = std::stoi(name.substr(0, 4));
                if (version <= 1)
                    throw std::runtime_error("Migration versions must start at 0002");
                files.push_back({version, entry.path()});
            }
        std::sort(files.begin(), files.end());
        std::map<int, std::string> applied;
        for (const auto &row : tx->query("SELECT version,checksum FROM schema_migrations"))
            applied.emplace(std::stoi(row.at("version")), row.at("checksum"));
        int previous = 0;
        for (const auto &[version, path] : files) {
            if (version != previous + 1)
                throw std::runtime_error("Migration versions must be consecutive and unique");
            previous = version;
            std::ifstream source(path, std::ios::binary);
            if (!source)
                throw std::runtime_error("Cannot read migration");
            std::string sql((std::istreambuf_iterator<char>(source)), {});
            // Keep checksums stable across Windows/Linux Git line endings.
            sql.erase(std::remove(sql.begin(), sql.end(), '\r'), sql.end());
            auto checksum = sha256(sql);
            auto existing = applied.find(version);
            if (existing != applied.end()) {
                if (existing->second != checksum)
                    throw std::runtime_error("Applied migration checksum mismatch: " +
                                             path.filename().string());
                continue;
            }
            if (!initialize)
                throw std::runtime_error("Run shoppe --initialize before starting this schema version.");
            tx->executeScript(sql);
            tx->execute(
                "INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES(?,?,?,?)",
                {std::to_string(version), path.filename().string(), checksum, std::to_string(now())});
        }
        if (!applied.empty() && applied.rbegin()->first > previous)
            throw std::runtime_error("Database schema is newer than this application");
        tx->commit();
    } catch (...) {
        if (sqlite_) {
            sqlite3_close(sqlite_);
            sqlite_ = nullptr;
        }
        throw;
    }
}
Database::~Database() {
    if (sqlite_)
        sqlite3_close(sqlite_);
#ifdef SHOPPE_POSTGRES
    for (auto connection : idleConnections_)
        PQfinish(static_cast<PGconn *>(connection));
#endif
}
void *Database::acquireConnection() {
#ifdef SHOPPE_POSTGRES
    std::unique_lock lock(poolMutex_);
    if (!poolAvailable_.wait_for(lock, std::chrono::seconds(10),
                                 [&] { return !idleConnections_.empty() || connectionCount_ < 4; }))
        throw Error(503, "database_busy", "Dữ liệu đang bận. Vui lòng thử lại.");
    if (!idleConnections_.empty()) {
        auto connection = idleConnections_.back();
        idleConnections_.pop_back();
        lock.unlock();
        auto pg = static_cast<PGconn *>(connection);
        if (PQstatus(pg) != CONNECTION_OK)
            PQreset(pg);
        if (PQstatus(pg) == CONNECTION_OK)
            return pg;
        releaseConnection(pg);
        throw Error(503, "database_unavailable", "Không kết nối được dữ liệu.");
    }
    ++connectionCount_;
    lock.unlock();
    auto connection = PQconnectdb(url_.c_str());
    if (PQstatus(connection) == CONNECTION_OK)
        return connection;
    releaseConnection(connection);
#endif
    throw Error(503, "database_unavailable", "Không kết nối được dữ liệu.");
}
void Database::releaseConnection(void *connection) {
#ifdef SHOPPE_POSTGRES
    auto pg = static_cast<PGconn *>(connection);
    bool reusable = PQstatus(pg) == CONNECTION_OK && PQtransactionStatus(pg) == PQTRANS_IDLE;
    {
        std::lock_guard lock(poolMutex_);
        if (reusable)
            idleConnections_.push_back(connection);
        else {
            PQfinish(pg);
            --connectionCount_;
        }
    }
    poolAvailable_.notify_one();
#endif
}
std::unique_ptr<Database::Transaction> Database::begin(bool readOnly) {
    return std::make_unique<Transaction>(*this, readOnly);
}
Database::Transaction::Transaction(Database &db, bool readOnly)
    : db_(db), lock_(db.mutex_, std::defer_lock) {
    if (db.postgres()) {
#ifdef SHOPPE_POSTGRES
        for (int attempt = 0; attempt < 2; ++attempt) {
            auto acquireStarted = std::chrono::steady_clock::now();
            pg_ = db.acquireConnection();
            requestMetrics.poolMs += std::chrono::duration<double, std::milli>(
                                         std::chrono::steady_clock::now() - acquireStarted)
                                         .count();
            try {
                // One network round trip. Readers use a consistent snapshot without the write lock.
                // Mutations retain the cross-instance lock protecting stock and voucher reservations.
                executeScript(std::string(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;"
                                                   : "BEGIN;") +
                              "SET LOCAL search_path TO shoppe;"
                              "SET LOCAL statement_timeout = '10000';" +
                              (readOnly ? "" : "SELECT pg_advisory_xact_lock(72134001);"));
                break;
            } catch (...) {
                db.releaseConnection(pg_);
                pg_ = nullptr;
                // A pooler may close an idle socket. Retry only transaction setup, before business SQL.
                if (attempt == 1)
                    throw Error(503, "database_unavailable", "Không kết nối được dữ liệu.");
            }
        }
#endif
    } else {
        lock_.lock();
        execute("BEGIN IMMEDIATE");
    }
}
Database::Transaction::~Transaction() {
    if (!done_)
        try {
            execute("ROLLBACK");
        } catch (...) {
        }
#ifdef SHOPPE_POSTGRES
    if (pg_)
        db_.releaseConnection(pg_);
#endif
}
Rows Database::Transaction::query(const std::string &sql, const Params &params) {
    if (done_)
        throw std::logic_error("Transaction already closed");
    SqlTimer timer;
    Rows rows;
#ifdef SHOPPE_POSTGRES
    if (pg_) {
        std::vector<const char *> values;
        for (const auto &p : params)
            values.push_back(p.c_str());
        auto result =
            PQexecParams(static_cast<PGconn *>(pg_), pgSql(sql).c_str(), static_cast<int>(values.size()),
                         nullptr, values.data(), nullptr, nullptr, 0);
        auto state = PQresultStatus(result);
        if (state != PGRES_TUPLES_OK && state != PGRES_COMMAND_OK) {
            std::string code = PQresultErrorField(result, PG_DIAG_SQLSTATE)
                                   ? PQresultErrorField(result, PG_DIAG_SQLSTATE)
                                   : "";
            PQclear(result);
            if (code == "23505")
                throw Error(409, "duplicate", "Dữ liệu đã tồn tại.");
            throw Error(500, "database_error", "Không thể cập nhật dữ liệu.");
        }
        for (int r = 0; r < PQntuples(result); ++r) {
            std::map<std::string, std::string> row;
            for (int c = 0; c < PQnfields(result); ++c)
                row[PQfname(result, c)] = PQgetvalue(result, r, c);
            rows.push_back(std::move(row));
        }
        PQclear(result);
        return rows;
    }
#endif
    sqlite3_stmt *raw = nullptr;
    if (sqlite3_prepare_v2(db_.sqlite_, sql.c_str(), -1, &raw, nullptr) != SQLITE_OK)
        throw Error(500, "database_error", "Lỗi truy vấn dữ liệu.");
    std::unique_ptr<sqlite3_stmt, decltype(&sqlite3_finalize)> statement(raw, sqlite3_finalize);
    for (std::size_t i = 0; i < params.size(); ++i)
        sqlite3_bind_text(raw, static_cast<int>(i + 1), params[i].c_str(), -1, SQLITE_TRANSIENT);
    int state;
    while ((state = sqlite3_step(raw)) == SQLITE_ROW) {
        std::map<std::string, std::string> row;
        for (int c = 0; c < sqlite3_column_count(raw); ++c) {
            auto text = sqlite3_column_text(raw, c);
            row[sqlite3_column_name(raw, c)] = text ? reinterpret_cast<const char *>(text) : "";
        }
        rows.push_back(std::move(row));
    }
    if (state != SQLITE_DONE) {
        if (state == SQLITE_CONSTRAINT)
            throw Error(409, "duplicate", "Dữ liệu trùng hoặc vi phạm ràng buộc.");
        throw Error(500, "database_error", "Không thể cập nhật dữ liệu.");
    }
    return rows;
}
void Database::Transaction::execute(const std::string &sql, const Params &params) {
    query(sql, params);
}
void Database::Transaction::executeScript(const std::string &sql) {
    SqlTimer timer;
#ifdef SHOPPE_POSTGRES
    if (pg_) {
        auto result = PQexec(static_cast<PGconn *>(pg_), sql.c_str());
        bool ok =
            PQresultStatus(result) == PGRES_COMMAND_OK || PQresultStatus(result) == PGRES_TUPLES_OK;
        PQclear(result);
        if (!ok)
            throw std::runtime_error("Database migration failed");
        return;
    }
#endif
    char *error = nullptr;
    auto status = sqlite3_exec(db_.sqlite_, sql.c_str(), nullptr, nullptr, &error);
    sqlite3_free(error);
    if (status != SQLITE_OK)
        throw std::runtime_error("Database migration failed");
}
void Database::Transaction::commit() {
    execute("COMMIT");
    done_ = true;
#ifdef SHOPPE_POSTGRES
    if (pg_) {
        db_.releaseConnection(pg_);
        pg_ = nullptr;
    }
#endif
    if (lock_.owns_lock())
        lock_.unlock();
}
void Database::Transaction::rollback() {
    execute("ROLLBACK");
    done_ = true;
#ifdef SHOPPE_POSTGRES
    if (pg_) {
        db_.releaseConnection(pg_);
        pg_ = nullptr;
    }
#endif
    if (lock_.owns_lock())
        lock_.unlock();
}
Json Repository::list(const std::string &table, const std::string &where, const Params &params) {
    checkTable(table);
    Json out = Json::array();
    for (const auto &row :
         tx_.query("SELECT payload FROM " + table + (where.empty() ? "" : " WHERE " + where), params))
        out.push_back(Json::parse(row.at("payload")));
    return out;
}
Json Repository::one(const std::string &table, const std::string &where, const Params &params) {
    auto rows = list(table, where, params);
    return rows.empty() ? Json() : rows.front();
}
Json Repository::get(const std::string &table, const std::string &id) {
    return one(table, "id = ?", {id});
}
Json Repository::save(const std::string &table, Json doc) {
    checkTable(table);
    std::string fields = "id,payload", binds = "?,?", updates = "payload=excluded.payload";
    Params params{doc.at("id").get<std::string>(), doc.dump()};
    for (const auto &col : columns.at(table)) {
        fields += "," + col;
        updates += "," + col + "=excluded." + col;
        if (!doc.contains(col) || doc[col].is_null() || (col == "shop_id" && value(doc, col).empty()))
            binds += ",NULL";
        else {
            binds += ",?";
            params.push_back(value(doc, col));
        }
    }
    tx_.execute("INSERT INTO " + table + " (" + fields + ") VALUES (" + binds +
                    ") ON CONFLICT (id) DO UPDATE SET " + updates,
                params);
    return doc;
}
void Repository::erase(const std::string &table, const std::string &id) {
    checkTable(table);
    tx_.execute("DELETE FROM " + table + " WHERE id = ?", {id});
}
} // namespace shoppe
