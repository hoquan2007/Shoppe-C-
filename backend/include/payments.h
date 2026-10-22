#pragma once
#include "database.h"

namespace shoppe {
// Webhooks and provider queries must use the same bank transaction identity.
// Returns false for an exact replay, throws for conflicting transaction data.
bool recordReceipt(Repository &r, Json &checkout, const Json &data);
// Validate the complete provider snapshot before applying any transactions.
Json paymentTransactions(const Json &checkout, const Json &snapshot);
} // namespace shoppe
