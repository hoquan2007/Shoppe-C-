#include "domain.h"
#include "payments.h"
#include <iostream>
#include <stdexcept>

using namespace shoppe;
void check(bool condition, const char *message) {
    if (!condition)
        throw std::runtime_error(message);
}
int main() {
    Database db("", ":memory:", "database/schema.sql");
    auto tx = db.begin();
    Repository r(*tx);
    r.save("users", {{"id", "buyer"}, {"email", "fixture@example.test"}, {"role", "buyer"}});
    Json group{{"id", "checkout"},           {"buyer_id", "buyer"}, {"idem_key", "fixture"},
               {"order_code", 100001},       {"method", "payos"},   {"status", "pending"},
               {"expires_at", 9999999999LL}, {"total", 2000}};
    r.save("checkouts", group);
    Json receipt{{"reference", "BANK-1"}, {"amount", 2000}, {"code", "00"}};
    Json snapshot{{"orderCode", 100001},
                  {"amount", 2000},
                  {"amountPaid", 2000},
                  {"transactions", Json::array({receipt})}};
    auto applySnapshot = [&] {
        for (const auto &entry : paymentTransactions(group, snapshot))
            recordReceipt(r, group, entry);
    };
    // Query first, webhook second: one receipt, one credit.
    applySnapshot();
    check(!recordReceipt(r, group, receipt), "webhook after sync must be replay");
    check(group["received_amount"] == 2000, "sync/webhook overlap");
    applySnapshot();
    check(group["received_amount"] == 2000, "repeated snapshot");
    receipt["reference"] = "BANK-2";
    receipt["amount"] = 500;
    check(recordReceipt(r, group, receipt), "new bank receipt");
    snapshot["transactions"].push_back(receipt);
    snapshot["amountPaid"] = 2500;
    applySnapshot();
    check(group["received_amount"] == 2500, "webhook before sync must not double credit");
    receipt["amount"] = 600;
    bool rejected = false;
    try {
        recordReceipt(r, group, receipt);
    } catch (const Error &) {
        rejected = true;
    }
    check(rejected && group["received_amount"] == 2500, "reference conflict fails closed");
    snapshot["amountPaid"] = 9999;
    rejected = false;
    try {
        paymentTransactions(group, snapshot);
    } catch (const Error &) {
        rejected = true;
    }
    check(rejected, "incomplete snapshot cannot credit aggregate amount");
    snapshot["orderCode"] = 2;
    rejected = false;
    try {
        paymentTransactions(group, snapshot);
    } catch (const Error &) {
        rejected = true;
    }
    check(rejected, "snapshot order binding");
    check(r.list("payment_events").size() == 2, "bank reference ledger size");
    tx->rollback();
    std::cout << "Payment ledger ordering, replay, conflict and snapshot checks passed.\n";
}
