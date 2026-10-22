#include "database.h"
#include "security.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sqlite3.h>
#include <stdexcept>

using namespace shoppe;
namespace fs = std::filesystem;
void check(bool value, const char *message) {
    if (!value)
        throw std::runtime_error(message);
}
int main() {
    auto directory = fs::absolute(".cache") / ("migration-test-" + randomId());
    fs::create_directories(directory / "migrations");
    auto schema = directory / "schema.sql", file = directory / "database.db";
    fs::copy_file("database/schema.sql", schema);
    std::ofstream(directory / "migrations/0002_fixture.sql")
        << "CREATE TABLE fixture (id INTEGER PRIMARY KEY);";
    {
        Database db("", file.string(), schema.string());
        auto tx = db.begin();
        tx->execute("INSERT INTO fixture(id) VALUES(42)");
        check(tx->query("SELECT version FROM schema_migrations").size() == 2, "migration ledger");
        tx->commit();
    }
    {
        Database db("", file.string(), schema.string());
        auto tx = db.begin();
        check(tx->query("SELECT id FROM fixture").front().at("id") == "42", "restart preserves data");
        check(tx->query("SELECT version FROM schema_migrations").size() == 2,
              "restart does not reapply");
        tx->commit();
    }
    std::ofstream(directory / "migrations/0003_failure.sql")
        << "CREATE TABLE must_rollback(id INTEGER); INSERT INTO nonexistent_table VALUES(1);";
    bool rejected = false;
    try {
        Database db("", file.string(), schema.string());
    } catch (...) {
        rejected = true;
    }
    check(rejected, "invalid migration fails startup");
    fs::remove(directory / "migrations/0003_failure.sql");
    {
        Database db("", file.string(), schema.string());
        auto tx = db.begin();
        check(tx->query("SELECT name FROM sqlite_master WHERE name='must_rollback'").empty(),
              "failed DDL rolled back");
        check(tx->query("SELECT version FROM schema_migrations").size() == 2,
              "failed migration not recorded");
        tx->commit();
    }
    std::ofstream(directory / "migrations/0002_fixture.sql", std::ios::app) << "\n-- edited after apply";
    rejected = false;
    try {
        Database db("", file.string(), schema.string());
    } catch (...) {
        rejected = true;
    }
    check(rejected, "applied migration edits rejected");
    // Cleanup stays inside this test's verified workspace cache directory.
    auto cache = fs::weakly_canonical(".cache");
    check(fs::weakly_canonical(directory).parent_path() == cache, "cleanup path stays in cache");
    fs::remove_all(directory);
    std::cout << "Migration replay, data preservation, rollback and checksum checks passed.\n";
}
