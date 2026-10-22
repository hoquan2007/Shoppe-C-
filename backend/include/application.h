#pragma once
#include "database.h"
#include "httplib.h"

namespace shoppe {
class Application {
    Database &db_;
    bool production_;
    std::string appUrl_;
    Json route(Repository &r, const httplib::Request &req, httplib::Response &res, const Json &body,
               const Json &user, const Json &session);
    void expire(Repository &r);
    void ensurePayment(const std::string &checkoutId);
    void processMail();

  public:
    explicit Application(Database &db);
    void handle(const httplib::Request &req, httplib::Response &res);
    void seed();
};
} // namespace shoppe
