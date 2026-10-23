#pragma once
#include "database.h"
#include <functional>

namespace shoppe {
struct GoogleIdentity {
    std::string subject, email, name;
};
using GoogleVerifier = std::function<GoogleIdentity(const std::string &, const std::string &)>;
bool googleReady();
GoogleIdentity verifyGoogleToken(const std::string &credential, const std::string &nonce);
// Pure verifier shared by production and offline cryptographic tests.
GoogleIdentity verifyGoogleTokenWithCertificates(const std::string &credential,
                                                const std::string &clientId,
                                                const std::string &nonce,
                                                const Json &certificates);
} // namespace shoppe
