#include "request_log.h"
#include <future>
#include <stdexcept>
using namespace shoppe;
int main() {
    std::promise<void> entered, release;
    auto enteredFuture = entered.get_future(), gate = release.get_future();
    std::atomic<int> calls{0}, overflow{0};
    bool responsive;
    {
        RequestLog log([&](const std::string &line) {
            if (calls.fetch_add(1) == 0) { entered.set_value(); gate.wait(); }
            if (line.find("trace_overflow") != std::string::npos) ++overflow;
        });
        log.submit({{"event", "first"}});
        if (enteredFuture.wait_for(std::chrono::seconds(2)) != std::future_status::ready) {
            release.set_value(); throw std::runtime_error("log worker did not start");
        }
        const auto start = std::chrono::steady_clock::now();
        for (int n=0; n<1000; ++n) log.submit({{"event", "request"}, {"n", n}});
        responsive = std::chrono::steady_clock::now() - start < std::chrono::milliseconds(200);
        release.set_value();
    }
    if (!responsive || calls > 514 || overflow != 1)
        throw std::runtime_error("slow stdout must not block HTTP workers or grow an unbounded trace queue");
}
