#pragma once
#include "database.h"

namespace shoppe {
inline constexpr int demoCatalogLimit = 1000;
Json importDemoCatalog(Repository &repository, const Json &adminUser, const std::string &file);
Json importDemoCatalog(Repository &repository, const Json &adminUser, const Json &document);
Json normalizeDemoCatalog(const Json &document);
Json fetchDemoCatalog(int limit);
Json selectDemoCatalog(const Json &categories, const Json &products, int limit);
Json stageDemoCatalog(Repository &repository, const Json &adminUser, const Json &document);
Json commitDemoCatalog(Repository &repository, const Json &adminUser, const std::string &token);
Json demoCatalogStatus(Repository &repository, const Json &adminUser);
} // namespace shoppe
