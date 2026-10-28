#include "http_trace.h"
#include <future>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <vector>

using namespace shoppe;
void check(bool value, const char *message) { if (!value) throw std::runtime_error(message); }
int main() {
    check(tracePath("/api/orders/private-order?token=secret") == "/api/orders/:id", "trace must redact IDs/query");
    check(tracePath("/api/auth/me") == "/api/auth/me", "static route must remain identifiable");
    // A stream that fails deterministically verifies error accounting without
    // relying on OS-specific timing of a TCP reset.
    class FailingStream : public httplib::Stream {
      public:
        bool is_readable() const override { return false; }
        bool wait_readable() const override { return false; }
        bool wait_writable() const override { return false; }
        ssize_t read(char *, size_t) override { error_ = httplib::Error::Read; return -1; }
        ssize_t write(const char *, size_t) override { error_ = httplib::Error::Write; return -1; }
        void get_remote_ip_and_port(std::string &, int &) const override {}
        void get_local_ip_and_port(std::string &, int &) const override {}
        socket_t socket() const override { return INVALID_SOCKET; }
        time_t duration() const override { return 0; }
    } failed;
    httpWriteTrace = {};
    httpWriteTrace.headers = HttpTiming::Clock::now();
    TracedStream stream(failed);
    check(stream.write("a", 1) == -1 && stream.get_error() == httplib::Error::Write, "stream must preserve failure");
    check(httpWriteTrace.writeFailed && httpWriteTrace.bytes == 0 && httpWriteTrace.writes == 1, "failed write metrics");

    TracedServer server;
    server.set_keep_alive_timeout(1);
    std::mutex mutex;
    std::condition_variable changed;
    std::vector<HttpWriteTrace> traces;
    std::atomic<bool> throwNext{false};
    server.set_logger([](const httplib::Request &req, const httplib::Response &res) {
        httpWriteTrace.headers = HttpTiming::Clock::now();
        httpWriteTrace.requestId = req.path;
        httpWriteTrace.status = res.status;
    });
    server.writeObserver = [&](const HttpWriteTrace &trace, bool success) {
        if (throwNext.exchange(false)) throw std::runtime_error("observer fixture failure");
        std::lock_guard lock(mutex);
        check(success, "successful response should finish writing");
        traces.push_back(trace);
        changed.notify_one();
    };
    const std::string large(131072, 'x');
    server.Get("/small", [](const auto &, auto &res) { res.set_content("small", "text/plain"); });
    server.Get("/large", [&](const auto &, auto &res) { res.set_content(large, "text/plain"); });
    server.Get("/stream", [](const auto &, auto &res) {
        res.set_chunked_content_provider("text/plain", [](size_t, httplib::DataSink &sink) {
            sink.write("hello", 5); sink.done(); return true;
        });
    });
    const auto port = server.bind_to_any_port("127.0.0.1");
    check(port > 0, "test bind failed");
    std::jthread worker([&] { server.listen_after_bind(); });
    struct Stop { TracedServer &server; ~Stop() { server.stop(); } } stop{server};
    server.wait_until_ready();
    httplib::Client client("127.0.0.1", port);
    client.set_keep_alive(true);
    auto small = client.Get("/small");
    check(small && small->body == "small", "small body changed");
    auto big = client.Get("/large");
    check(big && big->body == large, "large body changed");
    auto head = client.Head("/large");
    check(head && head->body.empty() && head->get_header_value("Content-Length") == std::to_string(large.size()), "HEAD framing changed");
    auto chunked = client.Get("/stream");
    check(chunked && chunked->body == "hello", "chunked framing changed");
    {
        std::unique_lock lock(mutex);
        check(changed.wait_for(lock, std::chrono::seconds(3), [&] { return traces.size() == 4; }), "missing completion trace");
        for (size_t i = 0; i < traces.size(); ++i) {
            const auto &t = traces[i];
            check(t.connection == traces[0].connection && t.ordinal == i + 1, "keep-alive trace attribution changed");
            check(t.bytes > 0 && t.writes > 0 && !t.writeFailed, "socket write accounting missing");
            check(t.lastWrite >= t.firstWrite && t.firstWrite >= t.headers, "invalid write phase order");
        }
        check(traces[1].bytes > large.size() && traces[2].bytes < 2048, "HEAD/large byte accounting");
    }
    // Observer exceptions must not kill a connection or worker.
    throwNext = true;
    auto afterException = client.Get("/small");
    auto next = client.Get("/small");
    check(afterException && next && next->body == "small", "observer exceptions affected serving");
    server.stop();
}
