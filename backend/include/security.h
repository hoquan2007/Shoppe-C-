#pragma once
#include "database.h"
#include <cstdint>
namespace shoppe {
std::string searchKey(const std::string &text);
std::int64_t now();
std::string env(const char *key, const std::string &fallback = "");
std::string randomId(std::size_t bytes = 16);
std::string sha256(const std::string &text);
std::string hmac(const std::string &key, const std::string &text);
bool constantEqual(const std::string &a, const std::string &b);
std::string passwordHash(const std::string &password);
bool passwordVerify(const std::string &password, const std::string &encoded);
std::string textField(const Json &doc, const char *name, std::size_t max = 200, bool required = true);
std::int64_t numberField(const Json &doc, const char *name, std::int64_t low, std::int64_t high,
                         std::int64_t fallback = 0);
void validateEmail(std::string &email);
std::string signatureData(const Json &data);
std::string csvCell(const std::string &value);
} // namespace shoppe
