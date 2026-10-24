#pragma once
#include "database.h"

namespace shoppe {
Json loadCatalogCopy(const std::string &file);
Json catalogCopyText(const Json &entry);
Json prepareCatalogCopy(const Json &products, const Json &editorial);
Json catalogCopyRows(Repository &repository, const Json &plan);
Json applyCatalogCopy(Repository &repository, const Json &plan);
} // namespace shoppe
