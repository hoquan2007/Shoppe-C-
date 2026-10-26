#pragma once
#include "httplib.h"
#include <chrono>

namespace shoppe {
struct HttpTiming {
    using Clock = std::chrono::steady_clock;
    Clock::time_point accepted{}, worker{}, ready{}, routed{};
    static double ms(Clock::time_point end, Clock::time_point start) {
        return std::chrono::duration<double, std::milli>(end - start).count();
    }
};
inline thread_local HttpTiming httpTiming;

// Idle upstream sockets must not occupy all API workers. DB connections stay bounded separately.
class HttpTaskQueue final : public httplib::TaskQueue {
    httplib::ThreadPool pool_{4, 32, 256, 1};
  public:
    bool enqueue(std::function<void()> task) override {
        const auto accepted = HttpTiming::Clock::now();
        return pool_.enqueue([accepted, task = std::move(task)] {
            httpTiming = {accepted, HttpTiming::Clock::now(), {}, {}};
            task();
        });
    }
    void shutdown() override { pool_.shutdown(); }
};
} // namespace shoppe
