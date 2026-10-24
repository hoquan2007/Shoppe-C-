#include "catalog_copy.h"
#include "security.h"
#include <fstream>
#include <iostream>
#include <map>

using namespace shoppe;
int main(int argc, char **argv) {
    try {
        if (argc != 4 || (std::string(argv[1]) != "--preview" && std::string(argv[1]) != "--apply"))
            throw std::runtime_error("Usage: catalog_copy --preview snapshot.json plan.json | --apply plan.json backup.json");
        std::ifstream file(argv[2]);
        if (!file)
            throw std::runtime_error("Input file unavailable.");
        const auto input = Json::parse(file);
        if (std::string(argv[1]) == "--preview") {
            auto plan = prepareCatalogCopy(input.at("products"), loadCatalogCopy("database/catalog-copy.vi.json"));
            std::ofstream output(argv[3]);
            output << plan.dump(2) << '\n';
            if (!output)
                throw std::runtime_error("Cannot save preview.");
            std::cout << Json{{"prepared", plan.at("count")}, {"writes", 0}}.dump() << '\n';
            return 0;
        }
        if (std::ifstream(argv[3]).good())
            throw std::runtime_error("Backup exists; choose a new path.");
        Database db(env("DATABASE_URL"), env("SQLITE_PATH", ".cache/shoppe.db"), "database/schema.sql", false);
        auto tx = db.begin();
        Repository r(*tx);
        auto backup = catalogCopyRows(r, input);
        // Save exact rows before any mutation. No credentials or unrelated tables are exported.
        std::ofstream output(argv[3]);
        output << Json{{"products", backup}}.dump(2) << '\n';
        output.close();
        if (!output)
            throw std::runtime_error("Cannot save backup; no changes committed.");
        auto result = applyCatalogCopy(r, input);
        // Confirm that no other product fields changed in the same transaction.
        std::map<std::string, Json> afterRows;
        for (const auto &p : catalogCopyRows(r, input))
            afterRows.emplace(p.at("id").get<std::string>(), p);
        for (const auto &before : backup) {
            auto after = afterRows.at(before.at("id").get<std::string>());
            after["name"] = before.at("name");
            after["description"] = before.at("description");
            if (after != before)
                throw std::runtime_error("Unexpected field change; transaction rolled back.");
        }
        tx->commit();
        std::cout << result.dump() << '\n';
    } catch (...) {
        // Database exceptions may include connection details: never echo them from this maintenance tool.
        std::cerr << "Catalog copy failed; no partial transaction committed. Check input, schema and connection privately.\n";
        return 1;
    }
}
