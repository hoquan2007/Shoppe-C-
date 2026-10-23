#include "google_auth.h"
#include "domain.h"
#include "httplib.h"
#include "security.h"
#include "jwt-cpp/traits/nlohmann-json/defaults.h"
#include <algorithm>
#include <mutex>
#include <regex>

namespace shoppe {
namespace {
void invalidToken() {
    throw Error(401, "invalid_google_token", "Không xác minh được đăng nhập Google. Vui lòng thử lại.");
}
Json tokenPayload(const std::string &credential, const std::string &clientId,
                  const std::string &nonce) {
    try {
        if (credential.empty() || credential.size() > 16384 || nonce.size() != 64 || clientId.empty())
            invalidToken();
        const auto decoded = jwt::decode(credential);
        const auto header = Json::parse(decoded.get_header());
        auto payload = Json::parse(decoded.get_payload());
        if (header.value("alg", "") != "RS256" || !header.contains("kid") ||
            !header["kid"].is_string() ||
            !std::regex_match(header["kid"].get<std::string>(), std::regex("[A-Za-z0-9_-]{1,256}")))
            invalidToken();
        const auto issuer = payload.value("iss", "");
        if (issuer != "https://accounts.google.com" && issuer != "accounts.google.com")
            invalidToken();
        if (!payload.contains("aud") || !payload.contains("iat") || !payload["iat"].is_number_integer() ||
            !payload.contains("exp") || !payload["exp"].is_number_integer() ||
            payload["exp"].get<std::int64_t>() <= now() || payload["iat"].get<std::int64_t>() > now() + 30 ||
            payload["exp"].get<std::int64_t>() <= payload["iat"].get<std::int64_t>())
            invalidToken();
        const auto &aud = payload["aud"];
        if (aud.is_string()) {
            if (aud != clientId) invalidToken();
        } else if (!aud.is_array() || aud.empty() ||
                   std::find(aud.begin(), aud.end(), Json(clientId)) == aud.end() ||
                   payload.value("azp", "") != clientId)
            invalidToken();
        if (payload.contains("azp") && payload.value("azp", "") != clientId)
            invalidToken();
        if (!constantEqual(payload.value("nonce", ""), nonce) ||
            !payload.contains("email_verified") || !payload["email_verified"].is_boolean() ||
            !payload["email_verified"].get<bool>())
            invalidToken();
        auto sub = textField(payload, "sub", 255);
        if (!std::regex_match(sub, std::regex("[A-Za-z0-9._-]{1,255}"))) invalidToken();
        return payload;
    } catch (const Error &) { invalidToken(); }
    catch (...) { invalidToken(); }
    return Json();
}
Json certificatesFor(const std::string &kid) {
    struct Cache {
        std::mutex mutex;
        Json certificates = Json::object();
        std::int64_t expires = 0, lastFetch = 0;
    };
    static Cache cache;
    std::lock_guard lock(cache.mutex);
    if (cache.expires > now() && cache.certificates.contains(kid)) return cache.certificates;
    // Unknown key IDs cannot force an unbounded sequence of outgoing requests.
    if (cache.lastFetch + 30 > now())
        throw Error(503, "google_keys_unavailable", "Google đang cập nhật khóa xác minh. Vui lòng thử lại sau.");
    cache.lastFetch = now();
    httplib::SSLClient client("www.googleapis.com");
    client.set_connection_timeout(5);
    client.set_read_timeout(8);
    client.set_follow_location(false);
    std::string body;
    auto res = client.Get("/oauth2/v1/certs", [&](const char *bytes, std::size_t size) {
        if (body.size() + size > 256 * 1024) return false;
        body.append(bytes, size); return true;
    });
    if (!res || res->status != 200)
        throw Error(503, "google_keys_unavailable", "Chưa kết nối được dịch vụ xác minh Google.");
    try {
        auto keys = Json::parse(body);
        if (!keys.is_object() || keys.empty() || keys.size() > 20) throw std::runtime_error("invalid keys");
        for (const auto &key : keys.items())
            if (!key.value().is_string() || key.value().get<std::string>().size() > 16384)
                throw std::runtime_error("invalid certificate");
        std::int64_t age = 3600;
        std::smatch match;
        auto control = res->get_header_value("Cache-Control");
        if (std::regex_search(control, match, std::regex(R"(max-age=(\d{1,9}))")))
            age = std::clamp<std::int64_t>(std::stoll(match[1].str()), 30, 86400);
        cache.certificates = std::move(keys);
        cache.expires = now() + age;
    } catch (...) {
        throw Error(503, "google_keys_unavailable", "Dịch vụ xác minh Google chưa sẵn sàng.");
    }
    return cache.certificates;
}
} // namespace
bool googleReady() {
    return std::regex_match(env("GOOGLE_CLIENT_ID"),
                            std::regex(R"([A-Za-z0-9_.-]{1,200}\.apps\.googleusercontent\.com)"));
}
GoogleIdentity verifyGoogleTokenWithCertificates(const std::string &credential,
                                                const std::string &clientId,
                                                const std::string &nonce,
                                                const Json &certificates) {
    auto payload = tokenPayload(credential, clientId, nonce);
    try {
        const auto decoded = jwt::decode(credential);
        const auto kid = decoded.get_key_id();
        if (!certificates.is_object() || !certificates.contains(kid) || !certificates[kid].is_string())
            invalidToken();
        auto verifier = jwt::verify().allow_algorithm(jwt::algorithm::rs256(certificates[kid].get<std::string>()))
                            .with_issuer(payload.at("iss").get<std::string>())
                            .with_audience(clientId)
                            .with_claim("nonce", jwt::claim(nonce)).leeway(30);
        verifier.verify(decoded);
        auto email = textField(payload, "email", 254);
        validateEmail(email);
        auto name = textField(payload, "name", 100, false);
        if (name.empty()) name = email.substr(0, email.find('@'));
        return {payload.at("sub").get<std::string>(), email, name};
    } catch (const Error &) { invalidToken(); }
    catch (...) { invalidToken(); }
    return {};
}
GoogleIdentity verifyGoogleToken(const std::string &credential, const std::string &nonce) {
    if (!googleReady()) throw Error(503, "google_not_configured", "Chưa cấu hình đăng nhập Google.");
    tokenPayload(credential, env("GOOGLE_CLIENT_ID"), nonce);
    auto decoded = jwt::decode(credential);
    return verifyGoogleTokenWithCertificates(credential, env("GOOGLE_CLIENT_ID"), nonce,
                                             certificatesFor(decoded.get_key_id()));
}
} // namespace shoppe
