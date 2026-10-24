#pragma once
#include "database.h"
namespace shoppe {
Json publicCatalog(Repository &r, const Json &options);
Json catalogHighlights(Repository &r, const Json &categories);
} // namespace shoppe
