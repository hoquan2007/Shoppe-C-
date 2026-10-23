#include "application.h"
#include "domain.h"
#include "google_auth.h"
#include "security.h"
#include "jwt-cpp/traits/nlohmann-json/defaults.h"
#include <cstdlib>
#include <iostream>
#include <openssl/pem.h>
#include <stdexcept>

using namespace shoppe;
void check(bool ok, const char *message) {
    if (!ok) throw std::runtime_error(message);
}
void environment(const char *key, const char *value) {
#ifdef _WIN32
    _putenv_s(key, value);
#else
    setenv(key, value, 1);
#endif
}
template<class F> void rejects(F fn, const char *message) {
    bool failed = false;
    try { fn(); } catch (const Error &e) { failed = e.status == 401; }
    check(failed, message);
}
std::string pem(BIO *bio) {
    char *bytes = nullptr;
    auto size = BIO_get_mem_data(bio, &bytes);
    return std::string(bytes, static_cast<std::size_t>(size));
}
void cryptography() {
    // Ephemeral fixture key: never written to disk or used by the application.
    EVP_PKEY *raw = EVP_RSA_gen(2048);
    check(raw != nullptr, "generate fixture RSA key");
    std::unique_ptr<EVP_PKEY, decltype(&EVP_PKEY_free)> key(raw, EVP_PKEY_free);
    BIO *memory = BIO_new(BIO_s_mem());
    check(PEM_write_bio_PrivateKey(memory, key.get(), nullptr, nullptr, 0, nullptr, nullptr) == 1, "fixture private key");
    auto privatePem = pem(memory); BIO_free(memory);
    X509 *certificate = X509_new();
    X509_set_version(certificate, 2);
    ASN1_INTEGER_set(X509_get_serialNumber(certificate), 1);
    X509_gmtime_adj(X509_getm_notBefore(certificate), -60);
    X509_gmtime_adj(X509_getm_notAfter(certificate), 3600);
    X509_set_pubkey(certificate, key.get());
    X509_sign(certificate, key.get(), EVP_sha256());
    memory = BIO_new(BIO_s_mem());
    PEM_write_bio_X509(memory, certificate);
    auto publicPem = pem(memory); BIO_free(memory); X509_free(certificate);
    const std::string client = "fixture.apps.googleusercontent.com", nonce(64, 'a');
    Json claims{{"iss", "https://accounts.google.com"}, {"aud", client}, {"sub", "123456789"},
                {"iat", now()}, {"exp", now() + 3600}, {"nonce", nonce}, {"email_verified", true},
                {"email", "Fixture@Example.test"}, {"name", "Fixture Buyer"}};
    Json keys{{"fixture", publicPem}};
    auto sign = [&](const Json &payload, bool symmetric = false) {
        auto builder = jwt::create().set_key_id("fixture");
        for (const auto &entry : payload.items()) builder.set_payload_claim(entry.key(), jwt::claim(entry.value()));
        if (symmetric) return builder.sign(jwt::algorithm::hs256("fixture-only-signing-key"));
        return builder.sign(jwt::algorithm::rs256("", privatePem));
    };
    auto token = sign(claims);
    auto identity = verifyGoogleTokenWithCertificates(token, client, nonce, keys);
    check(identity.subject == "123456789" && identity.email == "fixture@example.test", "valid signed identity and normalized email");
    rejects([&] { verifyGoogleTokenWithCertificates(token, "other.apps.googleusercontent.com", nonce, keys); }, "wrong audience");
    rejects([&] { verifyGoogleTokenWithCertificates(token, client, std::string(64, 'b'), keys); }, "wrong nonce");
    rejects([&] { verifyGoogleTokenWithCertificates(token, client, nonce, Json::object()); }, "unknown kid");
    auto changed = claims; changed["exp"] = now() - 1;
    rejects([&] { verifyGoogleTokenWithCertificates(sign(changed), client, nonce, keys); }, "expired token");
    changed = claims; changed["iat"] = now() + 300;
    rejects([&] { verifyGoogleTokenWithCertificates(sign(changed), client, nonce, keys); }, "future issued at");
    changed = claims; changed["iss"] = "https://example.test";
    rejects([&] { verifyGoogleTokenWithCertificates(sign(changed), client, nonce, keys); }, "wrong issuer");
    changed = claims; changed["email_verified"] = false;
    rejects([&] { verifyGoogleTokenWithCertificates(sign(changed), client, nonce, keys); }, "unverified email");
    changed["email_verified"] = "true";
    rejects([&] { verifyGoogleTokenWithCertificates(sign(changed), client, nonce, keys); }, "email bool required");
    rejects([&] { verifyGoogleTokenWithCertificates(sign(claims, true), client, nonce, keys); }, "algorithm confusion");
    // Change a signature byte without changing valid JSON claims.
    auto dot = token.rfind('.') + 1; token[dot] = token[dot] == 'a' ? 'b' : 'a';
    rejects([&] { verifyGoogleTokenWithCertificates(token, client, nonce, keys); }, "bad signature");
    rejects([&] { verifyGoogleTokenWithCertificates("not-a-jwt", client, nonce, keys); }, "malformed JWT");
    changed = claims; changed["aud"] = Json::array({client, "other"});
    rejects([&] { verifyGoogleTokenWithCertificates(sign(changed), client, nonce, keys); }, "multi-audience needs authorized party");
    changed["azp"] = client;
    check(verifyGoogleTokenWithCertificates(sign(changed), client, nonce, keys).subject == identity.subject, "authorized party");
}
std::string cookie(const httplib::Response &res, const std::string &name) {
    for (const auto &[key, value] : res.headers)
        if (key == "Set-Cookie" && value.starts_with(name + "=")) return value.substr(0, value.find(';'));
    return "";
}
void applicationFlow() {
    environment("APP_ENV", "test"); environment("APP_URL", "http://localhost:18232");
    environment("GOOGLE_CLIENT_ID", "fixture.apps.googleusercontent.com");
    environment("RESEND_API_KEY", ""); environment("EMAIL_FROM", "");
    Database db("", ":memory:", "database/schema.sql");
    GoogleIdentity identity{"123", "buyer@example.test", "Google Buyer"};
    int verifications = 0;
    Application app(db, [&](const std::string &credential, const std::string &nonce) {
        check(nonce.size() == 64, "server nonce passed to verifier"); ++verifications;
        if (credential != "fixture-token") throw Error(401, "invalid_google_token", "Invalid fixture");
        return identity;
    });
    auto request = [&](const std::string &method, const std::string &path, Json body = Json::object(),
                       const std::string &cookies = "", const std::string &csrf = "", bool origin = true) {
        httplib::Request req; req.method = method; req.path = path; req.remote_addr = "127.0.0.1";
        if (method != "GET") req.body = (body.is_null() ? Json::object() : body).dump();
        if (origin) req.headers.emplace("Origin", "http://localhost:18232");
        if (!cookies.empty()) req.headers.emplace("Cookie", cookies);
        if (!csrf.empty()) req.headers.emplace("X-CSRF-Token", csrf);
        httplib::Response res; res.status = 200; app.handle(req, res); return res;
    };
    auto challenge = [&](const std::string &cookies = "", const std::string &csrf = "") {
        auto res = request("POST", "/api/auth/google/challenge", {}, cookies, csrf);
        check(res.status == 200, "challenge issued");
        check(res.get_header_value("Set-Cookie").find("HttpOnly") != std::string::npos, "challenge HttpOnly");
        return cookie(res, "shoppe_google_login");
    };
    auto login = [&](const std::string &cookies, const std::string &csrf = "", const std::string &credential = "fixture-token") {
        return request("POST", "/api/auth/google", {{"credential", credential}}, cookies, csrf);
    };
    check(request("GET", "/api/auth/google").status == 405, "method guard");
    check(request("POST", "/api/auth/google/challenge", {}, "", "", false).status == 403, "origin guard");
    check(login("").status == 401 && verifications == 0, "cookie binding before JWT verification");
    auto nonceCookie = challenge();
    auto response = login(nonceCookie); check(response.status == 200, "Google account created");
    auto body = Json::parse(response.body);
    check(body["user"]["role"] == "buyer" && body["user"]["verified"] == true && !body["user"].contains("password_hash"), "safe buyer identity");
    auto sessionCookie = cookie(response, "shoppe_session"), csrf = body["csrf"].get<std::string>();
    check(!sessionCookie.empty(), "local session issued");
    check(Json::parse(request("GET", "/api/auth/me", {}, sessionCookie).body)["user"]["id"] == body["user"]["id"], "session usable");
    check(login(nonceCookie).status == 401 && verifications == 1, "nonce replay rejected");
    check(request("POST", "/api/auth/google/challenge", {}, sessionCookie).status == 403, "authenticated CSRF required");
    nonceCookie = challenge();
    check(login(nonceCookie, "", "bad").status == 401, "bad token rejected");
    check(login(nonceCookie).status == 401, "failed token consumes challenge");
    nonceCookie = challenge();
    check(login(nonceCookie + "; " + sessionCookie, csrf).status == 401, "challenge bound to login state");
    nonceCookie = challenge(sessionCookie, csrf);
    auto rotation = login(sessionCookie + "; " + nonceCookie, csrf);
    check(rotation.status == 200 && cookie(rotation, "shoppe_session") != sessionCookie, "existing identity rotates session");
    check(Json::parse(request("GET", "/api/auth/me", {}, sessionCookie).body)["user"].is_null(), "old session revoked");
    {
        auto tx = db.begin(); Repository r(*tx);
        r.save("users", {{"id", "admin-fixture"}, {"email", "admin@example.test"}, {"name", "Admin"},
                         {"role", "admin"}, {"active", true}, {"verified", true}});
        r.save("sessions", {{"id", sha256(std::string(64, 'd'))}, {"user_id", "admin-fixture"},
                            {"csrf", "fixture-csrf"}, {"expires_at", now() + 600}});
        tx->commit();
    }
    identity = {"456", "admin@example.test", "Google Admin"};
    check(login(challenge()).status == 409, "email alone must not capture existing admin");
    auto adminCookie = "shoppe_session=" + std::string(64, 'd');
    nonceCookie = challenge(adminCookie, "fixture-csrf");
    identity.email = "other@example.test";
    check(login(adminCookie + "; " + nonceCookie, "fixture-csrf").status == 409, "link must use same email");
    identity.email = "admin@example.test";
    nonceCookie = challenge(adminCookie, "fixture-csrf");
    auto linked = login(adminCookie + "; " + nonceCookie, "fixture-csrf");
    check(linked.status == 200 && Json::parse(linked.body)["user"]["role"] == "admin", "explicit linking preserves role");
    {
        auto tx = db.begin(); Repository r(*tx); auto u = r.get("users", "admin-fixture");
        u["active"] = false; r.save("users", u); tx->commit();
    }
    check(login(challenge()).status == 403, "disabled Google account rejected");
    nonceCookie = challenge();
    {
        auto tx = db.begin(); Repository r(*tx);
        auto c = r.get("auth_challenges", sha256(nonceCookie.substr(nonceCookie.find('=') + 1)));
        c["expires_at"] = now() - 1; r.save("auth_challenges", c); tx->commit();
    }
    check(login(nonceCookie).status == 401, "expired challenge rejected");
    environment("GOOGLE_CLIENT_ID", "");
    check(request("POST", "/api/auth/google/challenge").status == 503, "missing config rejected");
}
int main() {
    cryptography(); applicationFlow();
    std::cout << "Google signature, claims, nonce, session, linking and privilege tests passed\n";
}
