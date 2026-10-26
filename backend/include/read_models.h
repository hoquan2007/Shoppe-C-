#pragma once
#include "database.h"
#include "httplib.h"

namespace shoppe {
std::string jsonField(Repository &r, const std::string &alias, const std::string &name);
Json pageList(Repository &r, const std::string &table, const httplib::Request &req,
              const std::string &where = "", const Params &params = {}, int defaultSize = 50,
              const std::string &order = "", const std::vector<std::string> &searchFields = {});
Json dashboardData(Repository &r, const std::string &shopId = "");
} // namespace shoppe
