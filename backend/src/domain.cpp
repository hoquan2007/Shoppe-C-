#include "domain.h"
#include <algorithm>
#include <limits>
#include <numeric>
#include <set>

namespace shoppe {
Error::Error(int s, std::string c, std::string m)
    : std::runtime_error(std::move(m)), status(s), code(std::move(c)) {}
Money::Money(std::int64_t v) : value_(v) {
    if (v < 0 || v > 1000000000000LL)
        throw Error(422, "invalid_money", "Số tiền không hợp lệ.");
}
Money Money::operator+(Money o) const {
    return Money(value_ + o.value_);
}
Money Money::operator*(std::int64_t q) const {
    if (q < 0 || (q && value_ > 1000000000000LL / q))
        throw Error(422, "invalid_quantity", "Số lượng hoặc tổng tiền quá lớn.");
    return Money(value_ * q);
}
OrderSnapshot::OrderSnapshot(std::vector<Line> l)
    : lines_(std::make_unique<std::vector<Line>>(std::move(l))) {}
OrderSnapshot::~OrderSnapshot() = default;
OrderSnapshot::OrderSnapshot(const OrderSnapshot &o)
    : lines_(o.lines_ ? std::make_unique<std::vector<Line>>(*o.lines_) : nullptr) {}
OrderSnapshot &OrderSnapshot::operator=(const OrderSnapshot &o) {
    if (this != &o) {
        auto copy = o.lines_ ? std::make_unique<std::vector<Line>>(*o.lines_) : nullptr;
        lines_.swap(copy);
    }
    return *this;
}
OrderSnapshot::OrderSnapshot(OrderSnapshot &&) noexcept = default;
OrderSnapshot &OrderSnapshot::operator=(OrderSnapshot &&) noexcept = default;
Money OrderSnapshot::total() const {
    Money sum;
    if (lines_)
        for (const auto &l : *lines_)
            sum = sum + l.price * l.quantity;
    return sum;
}
Money RegionalShipping::calculate(int w, bool same) const {
    if (w < 0 || w > 100000)
        throw Error(422, "invalid_weight", "Khối lượng không hợp lệ.");
    return Money((same ? local_ : remote_) + std::max(0, (w - 1000 + 499) / 500) * step_);
}
class State final : public IOrderState {
    std::set<std::string> next_;

  public:
    explicit State(std::set<std::string> next) : next_(std::move(next)) {}
    bool allows(const std::string &next) const override {
        return next_.contains(next);
    }
};
std::unique_ptr<IOrderState> orderState(const std::string &s) {
    if (s == "new")
        return std::make_unique<State>(std::set<std::string>{"confirmed", "cancelled"});
    if (s == "confirmed")
        return std::make_unique<State>(std::set<std::string>{"preparing", "cancelled"});
    if (s == "preparing")
        return std::make_unique<State>(std::set<std::string>{"shipping", "cancelled"});
    if (s == "shipping")
        return std::make_unique<State>(std::set<std::string>{"delivered", "delivery_failed"});
    if (s == "delivery_failed")
        return std::make_unique<State>(std::set<std::string>{"shipping", "cancelled"});
    if (s == "delivered")
        return std::make_unique<State>(std::set<std::string>{"completed"});
    return std::make_unique<State>(std::set<std::string>{});
}
void requireTransition(const std::string &from, const std::string &to) {
    if (!orderState(from)->allows(to))
        throw Error(409, "invalid_transition", "Không thể chuyển trạng thái đơn hàng.");
}
std::vector<std::int64_t> allocateDiscount(const std::vector<std::int64_t> &a, std::int64_t d) {
    std::int64_t total = 0;
    for (auto v : a)
        total = (Money(total) + Money(v)).value();
    if (d < 0 || d > total)
        throw Error(422, "invalid_discount", "Giảm giá vượt giá trị hàng.");
    std::vector<std::int64_t> out(a.size(), 0);
    if (total == 0 || d == 0)
        return out;
    // Quotient/remainder avoids overflowing amount * discount.
    std::int64_t cumulative = 0, allocated = 0;
    for (std::size_t i = 0; i < a.size(); ++i) {
        cumulative += a[i];
        std::uint64_t quotient = 0, remainder = 0;
        for (int bit = 63; bit >= 0; --bit) {
            auto numerator = remainder * 2 + ((static_cast<std::uint64_t>(cumulative) >> bit) & 1U) *
                                                 static_cast<std::uint64_t>(d);
            quotient = quotient * 2 + numerator / static_cast<std::uint64_t>(total);
            remainder = numerator % static_cast<std::uint64_t>(total);
        }
        const auto target = static_cast<std::int64_t>(quotient);
        out[i] = target - allocated;
        allocated = target;
    }
    if (!out.empty())
        out.back() += d - allocated;
    return out;
}
} // namespace shoppe
