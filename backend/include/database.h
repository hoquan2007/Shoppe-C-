#pragma once
#include "json.hpp"
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

  public:
    class Transaction {
        Database &db_;
        std::unique_lock<std::mutex> lock_;
        void *pg_ = nullptr;
        bool done_ = false;

      public:
        explicit Transaction(Database &db);
        ~Transaction();
        Transaction(const Transaction &) = delete;
        Transaction &operator=(const Transaction &) = delete;
        Rows query(const std::string &sql, const Params &params = {});
        void execute(const std::string &sql, const Params &params = {});
        void executeScript(const std::string &sql);
        void commit();
        void rollback();
    };
    Database(std::string url, std::string path, const std::string &schemaPath);
    ~Database();
    Database(const Database &) = delete;
    Database &operator=(const Database &) = delete;
    std::unique_ptr<Transaction> begin();
    bool postgres() const {
        return !url_.empty();
    }
};
class Repository {
    Database::Transaction &tx_;

  public:
    explicit Repository(Database::Transaction &tx) : tx_(tx) {}
    Json list(const std::string &table, const std::string &where = "", const Params &params = {});
    Json get(const std::string &table, const std::string &id);
    Json one(const std::string &table, const std::string &where, const Params &params);
    Json save(const std::string &table, Json doc);
    void erase(const std::string &table, const std::string &id);
};
} // namespace shoppe
