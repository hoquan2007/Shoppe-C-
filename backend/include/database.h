#pragma once
#include "json.hpp"
#include <condition_variable>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <vector>
struct sqlite3;
namespace shoppe {
using Json = nlohmann::json;
using Params = std::vector<std::string>;
using Rows = std::vector<std::map<std::string, std::string>>;
class Database {
    std::string url_, path_;
    sqlite3 *sqlite_ = nullptr;
    std::mutex mutex_;
    std::mutex poolMutex_;
    std::condition_variable poolAvailable_;
    std::vector<void *> idleConnections_;
    std::size_t connectionCount_ = 0;
    void *acquireConnection();
    void releaseConnection(void *connection);

  public:
    struct Metrics {
        double poolMs = 0, sqlMs = 0;
        int queries = 0;
    };
    static void resetMetrics();
    static Metrics metrics();
    class Transaction {
        Database &db_;
        std::unique_lock<std::mutex> lock_;
        void *pg_ = nullptr;
        bool done_ = false;

      public:
        explicit Transaction(Database &db, bool readOnly = false);
        ~Transaction();
        Transaction(const Transaction &) = delete;
        Transaction &operator=(const Transaction &) = delete;
        Rows query(const std::string &sql, const Params &params = {});
        void execute(const std::string &sql, const Params &params = {});
        void executeScript(const std::string &sql);
        void commit();
        void rollback();
        bool postgres() const {
            return db_.postgres();
        }
    };
    Database(std::string url, std::string path, const std::string &schemaPath, bool initialize = true);
    ~Database();
    Database(const Database &) = delete;
    Database &operator=(const Database &) = delete;
    std::unique_ptr<Transaction> begin(bool readOnly = false);
    bool postgres() const {
        return !url_.empty();
    }
};
class Repository {
    Database::Transaction &tx_;

  public:
    explicit Repository(Database::Transaction &tx) : tx_(tx) {}
    Rows query(const std::string &sql, const Params &params = {}) {
        return tx_.query(sql, params);
    }
    bool postgres() const {
        return tx_.postgres();
    }
    Json list(const std::string &table, const std::string &where = "", const Params &params = {});
    Json get(const std::string &table, const std::string &id);
    Json one(const std::string &table, const std::string &where, const Params &params);
    Json save(const std::string &table, Json doc);
    void erase(const std::string &table, const std::string &id);
};
} // namespace shoppe
