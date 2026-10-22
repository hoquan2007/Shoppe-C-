#pragma once
#include <compare>
#include <cstdint>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace shoppe {
struct Error : std::runtime_error {
    int status;
    std::string code;
    Error(int status, std::string code, std::string message);
};
class Money {
    std::int64_t value_;

  public:
    explicit Money(std::int64_t value = 0);
    std::int64_t value() const {
        return value_;
    }
    Money operator+(Money other) const;
    Money operator*(std::int64_t quantity) const;
    auto operator<=>(const Money &) const = default;
};
struct Line {
    std::string variantId;
    int quantity;
    Money price;
};
// An owning snapshot demonstrates deep copy, move and assignment (Rule of Five).
class OrderSnapshot {
    std::unique_ptr<std::vector<Line>> lines_;

  public:
    explicit OrderSnapshot(std::vector<Line> lines);
    ~OrderSnapshot();
    OrderSnapshot(const OrderSnapshot &other);
    OrderSnapshot &operator=(const OrderSnapshot &other);
    OrderSnapshot(OrderSnapshot &&other) noexcept;
    OrderSnapshot &operator=(OrderSnapshot &&other) noexcept;
    Money total() const;
};
class IShippingFeePolicy {
  public:
    virtual ~IShippingFeePolicy() = default;
    virtual Money calculate(int weightGrams, bool sameRegion) const = 0;
};
class RegionalShipping final : public IShippingFeePolicy {
    int local_, remote_, step_;

  public:
    explicit RegionalShipping(int local = 20000, int remote = 35000, int step = 5000)
        : local_(local), remote_(remote), step_(step) {}
    Money calculate(int weightGrams, bool sameRegion) const override;
};
class IPaymentMethod {
  public:
    virtual ~IPaymentMethod() = default;
    virtual std::string initialStatus() const = 0;
    virtual bool requiresGateway() const = 0;
};
class CodPayment final : public IPaymentMethod {
  public:
    std::string initialStatus() const override {
        return "unpaid";
    }
    bool requiresGateway() const override {
        return false;
    }
};
class OnlinePayment final : public IPaymentMethod {
  public:
    std::string initialStatus() const override {
        return "pending";
    }
    bool requiresGateway() const override {
        return true;
    }
};
class IOrderState {
  public:
    virtual ~IOrderState() = default;
    virtual bool allows(const std::string &next) const = 0;
};
std::unique_ptr<IOrderState> orderState(const std::string &state);
void requireTransition(const std::string &from, const std::string &to);
std::vector<std::int64_t> allocateDiscount(const std::vector<std::int64_t> &amounts,
                                           std::int64_t discount);
} // namespace shoppe
