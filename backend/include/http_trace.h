#pragma once
#include "http_runtime.h"
#include "trace_path.h"
#include <atomic>
#include <functional>
#include <string>

namespace shoppe {
struct HttpWriteTrace {
    std::string requestId, route, instance;
    int status = 0;
    std::uint64_t connection = 0, ordinal = 0;
    std::size_t bytes = 0, writes = 0;
    HttpTiming::Clock::time_point headers{}, firstWrite{}, lastWrite{};
    bool writeFailed = false;
};
inline thread_local HttpWriteTrace httpWriteTrace;

// Decorates the existing stream without changing framing, buffering or socket policy.
class TracedStream final : public httplib::Stream {
    httplib::Stream &stream_;
  public:
    explicit TracedStream(httplib::Stream &stream) : stream_(stream) {}
    bool is_readable() const override { return stream_.is_readable(); }
    bool wait_readable() const override { return stream_.wait_readable(); }
    bool wait_writable() const override { return stream_.wait_writable(); }
    bool is_peer_alive() const override { return stream_.is_peer_alive(); }
    ssize_t read(char *ptr, size_t size) override {
        auto n = stream_.read(ptr, size); error_ = stream_.get_error(); return n;
    }
    ssize_t write(const char *ptr, size_t size) override {
        auto &t = httpWriteTrace;
        // Interim 100 Continue is not the final response measured by this trace.
        if (t.headers == HttpTiming::Clock::time_point{}) {
            auto n = stream_.write(ptr, size); error_ = stream_.get_error(); return n;
        }
        if (t.firstWrite == HttpTiming::Clock::time_point{}) t.firstWrite = HttpTiming::Clock::now();
        ++t.writes;
        auto n = stream_.write(ptr, size);
        t.lastWrite = HttpTiming::Clock::now();
        if (n > 0) t.bytes += static_cast<std::size_t>(n);
        else t.writeFailed = true;
        error_ = stream_.get_error();
        return n;
    }
    void get_remote_ip_and_port(std::string &ip, int &port) const override { stream_.get_remote_ip_and_port(ip, port); }
    void get_local_ip_and_port(std::string &ip, int &port) const override { stream_.get_local_ip_and_port(ip, port); }
    socket_t socket() const override { return stream_.socket(); }
    time_t duration() const override { return stream_.duration(); }
    void set_read_timeout(time_t sec, time_t usec = 0) override { stream_.set_read_timeout(sec, usec); }
    const char *buffered_data(size_t &size) const override { return stream_.buffered_data(size); }
    void consume_buffered(size_t size) override { stream_.consume_buffered(size); }
};

// Mirrors the pinned v0.61.0 plain HTTP serving loop. TLS still terminates at Vercel.
// process_request, SocketStream, readable hints, buffered pipelining, guarded callbacks
// and graceful bounded drain all remain owned by cpp-httplib. No vendor edits.
class TracedServer final : public httplib::Server {
    std::atomic<std::uint64_t> connections_{0};
  public:
    using Observer = std::function<void(const HttpWriteTrace &, bool)>;
    Observer writeObserver;
  protected:
    bool process_and_close_socket(socket_t sock) override {
        std::string remote, local;
        int remotePort = 0, localPort = 0;
        httplib::detail::get_remote_ip_and_port(sock, remote, remotePort);
        httplib::detail::get_local_ip_and_port(sock, local, localPort);
        const auto connection = ++connections_;
        std::uint64_t ordinal = 0;
        bool upgraded = false;
        auto ret = serve_guarded([&] {
            return httplib::detail::process_server_socket(
                svr_sock_, sock, keep_alive_max_count_, keep_alive_timeout_sec_,
                read_timeout_sec_, read_timeout_usec_, write_timeout_sec_, write_timeout_usec_,
                [&](httplib::Stream &stream, bool close, bool &closed) {
                    httpWriteTrace = {};
                    httpWriteTrace.connection = connection;
                    httpWriteTrace.ordinal = ++ordinal;
                    TracedStream traced(stream);
                    bool success = false;
                    // Also observes a callback exception or interrupted streaming write.
                    struct Completion {
                        TracedServer &server;
                        bool &success;
                        ~Completion() noexcept {
                            try {
                                if (server.writeObserver && !httpWriteTrace.requestId.empty())
                                    server.writeObserver(httpWriteTrace, success && !httpWriteTrace.writeFailed);
                            } catch (...) { /* Trace must never fail an HTTP request. */ }
                        }
                    } completion{*this, success};
                    success = process_request(traced, remote, remotePort, local, localPort,
                                              close, closed, nullptr, &upgraded);
                    return success;
                });
        });
        httplib::detail::drain_and_close_socket(sock);
        return ret;
    }
};
} // namespace shoppe
