#include "database.h"
#include "security.h"
#include <future>
#include <iostream>
#include <stdexcept>
#include <vector>

using namespace shoppe;
void check(bool value, const char *message) {
    if (!value)
        throw std::runtime_error(message);
}
int main() {
    auto url = env("SHOPPE_TEST_DATABASE_URL");
    // Run explicitly against a disposable local database, never the deployed shop.
    if (url.find("@127.0.0.1:") == std::string::npos)
        throw std::runtime_error("Use a disposable local SHOPPE_TEST_DATABASE_URL");
    Database db(url, "", "database/schema.sql");
    std::string pid;
    for (int i = 0; i < 20; ++i) {
        auto tx = db.begin(true);
        auto current = tx->query("SELECT pg_backend_pid() AS pid").front().at("pid");
        if (i == 0)
            pid = current;
        check(current == pid, "sequential requests reuse connection");
        tx->commit();
    }
    {
        Database killer(url, "", "database/schema.sql");
        auto tx = killer.begin(true);
        tx->query("SELECT pg_terminate_backend(?)", {pid});
        tx->commit();
        auto recovered = db.begin(true);
        check(recovered->query("SELECT 1 AS value").front().at("value") == "1",
              "closed idle connection is replaced before business queries");
        recovered->commit();
    }
    {
        auto tx = db.begin(true);
        bool rejected = false;
        try {
            tx->execute("CREATE TABLE must_not_write(id INTEGER)");
        } catch (...) {
            rejected = true;
        }
        check(rejected, "read-only transaction rejects writes");
        tx->rollback();
    }
    {
        auto writer = db.begin();
        auto reader = std::async(std::launch::async, [&] {
            auto tx = db.begin(true);
            tx->query("SELECT 1");
            tx->commit();
        });
        auto status = reader.wait_for(std::chrono::seconds(2));
        writer->rollback();
        reader.get();
        check(status == std::future_status::ready, "reader must not wait for global write lock");
    }
    std::vector<std::future<void>> workers;
    for (int i = 0; i < 12; ++i)
        workers.push_back(std::async(std::launch::async, [&] {
            for (int j = 0; j < 5; ++j) {
                auto tx = db.begin(true);
                tx->query("SELECT pg_sleep(0.01)");
                tx->commit();
            }
        }));
    for (auto &worker : workers)
        worker.get();
    auto tx = db.begin(true);
    check(tx->query("SELECT current_setting('transaction_read_only') AS value").front().at("value") ==
              "on",
          "transaction settings do not leak through pool");
    tx->commit();
    std::cout << "PostgreSQL reuse, read-only isolation and bounded concurrent pool checks passed.\n";
}
