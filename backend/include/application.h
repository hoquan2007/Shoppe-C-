#pragma once
#include "database.h"
#include "google_auth.h"
#include "httplib.h"
#include <atomic>
#include <chrono>
#include <thread>

namespace shoppe {
using MailSender = std::function<bool(const Json &, const Json &)>;
class Application {
    Database &db_;
    bool production_;
    std::string appUrl_;
    GoogleVerifier googleVerifier_;
    MailSender mailSender_;
    const std::string instanceId_;
    const std::chrono::steady_clock::time_point instanceStarted_ = std::chrono::steady_clock::now();
    std::atomic<std::uint64_t> requests_{0};
    std::mutex mailMutex_;
    std::condition_variable mailWake_;
    bool mailPending_ = false;
    std::jthread mailWorker_;
    Json route(Repository &r, const httplib::Request &req, httplib::Response &res, const Json &body,
               const Json &user, const Json &session, const Json &passwordWork);
    void expire(Repository &r);
    void ensurePayment(const std::string &checkoutId);
    bool processMail();
    void wakeMailWorker();

  public:
    explicit Application(Database &db, GoogleVerifier verifier = verifyGoogleToken,
                         MailSender mailSender = {});
    ~Application();
    void startMailWorker();
    const std::string &instanceId() const { return instanceId_; }
    void handle(const httplib::Request &req, httplib::Response &res);
    void seed();
};
} // namespace shoppe
