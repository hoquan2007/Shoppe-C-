#pragma once
#include "database.h"
#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <iostream>
#include <mutex>
#include <syncstream>
#include <thread>

namespace shoppe {
// stdout can be a slow platform pipe. Never wait for it on a customer HTTP worker.
class RequestLog {
  public:
    using Sink = std::function<void(const std::string &)>;
  private:
    std::mutex mutex_;
    std::condition_variable wake_;
    std::deque<std::string> pending_;
    std::atomic<std::uint64_t> dropped_{0};
    Sink sink_;
    std::jthread worker_{[this](std::stop_token stop) {
        while (true) {
            std::string line;
            {
                std::unique_lock lock(mutex_);
                wake_.wait_for(lock, std::chrono::milliseconds(250),
                               [&] { return stop.stop_requested() || !pending_.empty(); });
                if (pending_.empty()) {
                    if (stop.stop_requested()) return;
                    continue;
                }
                line = std::move(pending_.front()); pending_.pop_front();
            }
            try {
                if (const auto count = dropped_.exchange(0))
                    sink_(Json{{"event", "trace_overflow"}, {"dropped", count}}.dump());
                sink_(line);
            } catch (...) { ++dropped_; }
        }
    }};
  public:
    explicit RequestLog(Sink sink = [](const std::string &line) {
        std::osyncstream(std::cout) << line << std::endl;
    }) : sink_(std::move(sink)) {}
    ~RequestLog() { worker_.request_stop(); wake_.notify_all(); }
    void submit(Json record) {
        auto line = record.dump();
        {
            std::lock_guard lock(mutex_);
            if (pending_.size() >= 512) { ++dropped_; return; }
            pending_.push_back(std::move(line));
        }
        wake_.notify_one();
    }
};
inline RequestLog &requestLog() { static RequestLog instance; return instance; }
} // namespace shoppe
