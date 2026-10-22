#include "payments.h"
#include "domain.h"
#include "security.h"
#include <map>

namespace shoppe {
bool recordReceipt(Repository &r, Json &checkout, const Json &data) {
    if (checkout.value("method", "") != "payos")
        throw Error(409, "invalid_payment_method", "Giao dịch không phải thanh toán payOS.");
    if (data.value("code", "") != "00")
        return false;
    auto reference = textField(data, "reference", 150);
    auto amount = numberField(data, "amount", 1, 1000000000000LL);
    if (data.value("currency", "VND") != "VND")
        throw Error(422, "invalid_currency", "Chỉ ghi nhận giao dịch VNĐ.");
    auto code = checkout.at("order_code").get<std::int64_t>();
    if (data.value("orderCode", code) != code)
        throw Error(409, "payment_order_mismatch", "Mã giao dịch không khớp.");
    auto id = sha256("payos:" + std::to_string(code) + ":" + reference);
    auto old = r.get("payment_events", id);
    if (!old.is_null()) {
        if (old.value("amount", 0LL) != amount)
            throw Error(409, "payment_reference_conflict", "Mã ngân hàng có số tiền không khớp.");
        return false;
    }
    // Fail closed for pre-ledger fixtures: their hashed provider_ref cannot be
    // safely matched to a bank reference. Never guess or double-credit them.
    for (const auto &event : r.list("payment_events", "checkout_id = ?", {checkout.at("id")}))
        if (!event.contains("transaction_reference"))
            throw Error(409, "legacy_payment_review", "Giao dịch cũ cần đối soát trước khi cập nhật.");
    auto received = (Money(checkout.value("received_amount", 0LL)) + Money(amount)).value();
    r.save("payment_events", {{"id", id},
                              {"checkout_id", checkout.at("id")},
                              {"provider_ref", id},
                              {"transaction_reference", reference},
                              {"amount", amount},
                              {"created_at", now()},
                              {"valid", amount == checkout.value("total", 0LL)}});
    checkout["received_amount"] = received;
    return true;
}
Json paymentTransactions(const Json &checkout, const Json &snapshot) {
    if (snapshot.value("orderCode", 0LL) != checkout.value("order_code", 0LL) ||
        snapshot.value("amount", -1LL) != checkout.value("total", 0LL))
        throw Error(502, "payment_snapshot_mismatch", "Phản hồi cổng thanh toán không khớp đơn.");
    auto paid = numberField(snapshot, "amountPaid", 0, 1000000000000LL);
    if (!snapshot.contains("transactions") || !snapshot["transactions"].is_array()) {
        if (paid == 0)
            return Json::array();
        throw Error(502, "incomplete_payment_snapshot", "Thiếu chi tiết giao dịch để đối soát.");
    }
    std::map<std::string, std::int64_t> seen;
    Json result = Json::array();
    Money sum;
    for (const auto &transaction : snapshot["transactions"]) {
        auto reference = textField(transaction, "reference", 150);
        auto amount = numberField(transaction, "amount", 1, 1000000000000LL);
        if (seen.contains(reference)) {
            if (seen.at(reference) != amount)
                throw Error(502, "payment_reference_conflict", "Chi tiết giao dịch không nhất quán.");
            continue;
        }
        seen[reference] = amount;
        sum = sum + Money(amount);
        result.push_back({{"reference", reference},
                          {"amount", amount},
                          {"code", "00"},
                          {"orderCode", checkout.at("order_code")},
                          {"currency", "VND"}});
    }
    if (sum.value() != paid)
        throw Error(502, "incomplete_payment_snapshot", "Tổng giao dịch chưa khớp số tiền đã thu.");
    return result;
}
} // namespace shoppe
