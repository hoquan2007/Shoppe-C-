#pragma once
#include "database.h"

namespace shoppe {
Json importDemoCatalog(Repository &repository, const Json &adminUser, const std::string &file);
} // namespace shoppe
