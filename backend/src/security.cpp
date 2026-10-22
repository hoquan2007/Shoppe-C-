#include "security.h"
#include "domain.h"
#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <iomanip>
#include <openssl/crypto.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>
#include <regex>
#include <sstream>

namespace shoppe {
namespace {
std::string hex(const unsigned char *bytes, std::size_t n) {
    std::ostringstream out;
    for (std::size_t i = 0; i < n; ++i)
        out << std::hex << std::setw(2) << std::setfill('0') << static_cast<unsigned>(bytes[i]);
    return out.str();
}
std::string derive(const std::string &pass, const std::string &salt, int iterations) {
    unsigned char out[32];
    if (PKCS5_PBKDF2_HMAC(pass.c_str(), static_cast<int>(pass.size()),
                          reinterpret_cast<const unsigned char *>(salt.data()),
                          static_cast<int>(salt.size()), iterations, EVP_sha256(), 32, out) != 1)
        throw std::runtime_error("Password derivation failed");
    return hex(out, 32);
}
} // namespace
std::int64_t now() {
    return std::chrono::duration_cast<std::chrono::seconds>(
               std::chrono::system_clock::now().time_since_epoch())
        .count();
}
std::string env(const char *key, const std::string &fallback) {
    auto v = std::getenv(key);
    return v ? std::string(v) : fallback;
}
std::string randomId(std::size_t n) {
    std::vector<unsigned char> bytes(n);
    if (RAND_bytes(bytes.data(), static_cast<int>(n)) != 1)
        throw std::runtime_error("Secure RNG unavailable");
    return hex(bytes.data(), n);
}
std::string sha256(const std::string &text) {
    unsigned char out[32];
    unsigned int size = 0;
    if (EVP_Digest(text.data(), text.size(), out, &size, EVP_sha256(), nullptr) != 1)
        throw std::runtime_error("Digest failed");
    return hex(out, size);
}
std::string hmac(const std::string &key, const std::string &text) {
    unsigned char out[EVP_MAX_MD_SIZE];
    unsigned int size = 0;
    if (!HMAC(EVP_sha256(), key.data(), static_cast<int>(key.size()),
              reinterpret_cast<const unsigned char *>(text.data()), text.size(), out, &size))
        throw std::runtime_error("HMAC failed");
    return hex(out, size);
}
bool constantEqual(const std::string &a, const std::string &b) {
    return a.size() == b.size() && CRYPTO_memcmp(a.data(), b.data(), a.size()) == 0;
}
std::string passwordHash(const std::string &p) {
    if (p.size() < 12 || p.size() > 128)
        throw Error(422, "weak_password", "Mật khẩu cần từ 12 đến 128 ký tự.");
    auto salt = randomId();
    return "pbkdf2-sha256$600000$" + salt + "$" + derive(p, salt, 600000);
}
bool passwordVerify(const std::string &p, const std::string &encoded) {
    if (p.size() > 128)
        return false;
    auto a = encoded.find('$'), b = encoded.find('$', a + 1), c = encoded.find('$', b + 1);
    if (a == std::string::npos || b == std::string::npos || c == std::string::npos ||
        encoded.substr(0, a) != "pbkdf2-sha256")
        return false;
    int iterations = std::stoi(encoded.substr(a + 1, b - a - 1));
    if (iterations < 600000 || iterations > 2000000)
        return false;
    return constantEqual(derive(p, encoded.substr(b + 1, c - b - 1), iterations), encoded.substr(c + 1));
}
std::string textField(const Json &d, const char *name, std::size_t max, bool required) {
    if (!d.contains(name) || d[name].is_null()) {
        if (!required)
            return "";
        throw Error(422, "required", std::string("Thiếu trường: ") + name);
    }
    if (!d[name].is_string())
        throw Error(422, "invalid_field", std::string("Trường không hợp lệ: ") + name);
    auto v = d[name].get<std::string>();
    if (v.size() > max || (required && v.find_first_not_of(" \r\n\t") == std::string::npos) ||
        v.find('\0') != std::string::npos)
        throw Error(422, "invalid_field", std::string("Trường không hợp lệ: ") + name);
    return v;
}
std::int64_t numberField(const Json &d, const char *name, std::int64_t lo, std::int64_t hi,
                         std::int64_t fallback) {
    auto n = fallback;
    if (d.contains(name)) {
        if (!d[name].is_number_integer())
            throw Error(422, "invalid_number", std::string("Giá trị không hợp lệ: ") + name);
        n = d[name].get<std::int64_t>();
    }
    if (n < lo || n > hi)
        throw Error(422, "invalid_number", std::string("Giá trị ngoài phạm vi: ") + name);
    return n;
}
void validateEmail(std::string &email) {
    std::transform(email.begin(), email.end(), email.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    if (email.size() > 254 || !std::regex_match(email, std::regex(R"(^[^\s@]+@[^\s@]+\.[^\s@]+$)")))
        throw Error(422, "invalid_email", "Email không hợp lệ.");
}
std::string signatureData(const Json &data) {
    std::string result;
    for (auto it = data.begin(); it != data.end(); ++it) {
        if (!result.empty())
            result += '&';
        result += it.key() + "=";
        if (it->is_null())
            continue;
        if (it->is_string()) {
            auto s = it->get<std::string>();
            if (s != "null" && s != "undefined")
                result += s;
        } else
            result += it->dump();
    }
    return result;
}
std::string csvCell(const std::string &v) {
    std::string s = v;
    auto p = s.find_first_not_of(" \t\r\n");
    if (p != std::string::npos && std::string("=+-@\t\r").find(s[p]) != std::string::npos)
        s = "'" + s;
    std::string out = "\"";
    for (char c : s) {
        if (c == '\"')
            out += '\"';
        out += c;
    }
    return out + '\"';
}
} // namespace shoppe
