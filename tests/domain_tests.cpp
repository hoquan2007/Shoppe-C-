#include "domain.h"
#include "security.h"
#include <iostream>
#include <stdexcept>

using namespace shoppe;
void check(bool ok, const char *message) {
    if (!ok)
        throw std::runtime_error(message);
}
int main() {
    check((Money(15000) + Money(20000)).value() == 35000, "money sum");
    bool rejected = false;
    try {
        Money(1000000000000LL) * 2;
    } catch (const Error &) {
        rejected = true;
    }
    check(rejected, "overflow rejected");
    RegionalShipping shipping;
    check(shipping.calculate(1000, true).value() == 20000, "local shipping");
    check(shipping.calculate(1501, false).value() == 45000, "weight boundary");
    auto allocation = allocateDiscount({33333, 33333, 33334}, 10001);
    check(allocation[0] + allocation[1] + allocation[2] == 10001, "discount reconciles");
    check(allocateDiscount({0, 10}, 10) == std::vector<std::int64_t>({0, 10}), "zero line");
    requireTransition("new", "confirmed");
    rejected = false;
    try {
        requireTransition("new", "delivered");
    } catch (const Error &) {
        rejected = true;
    }
    check(rejected, "state rejects bypass");
    OrderSnapshot original({{"a", 2, Money(12345)}});
    auto copy = original;
    OrderSnapshot moved(std::move(copy));
    copy = original;
    copy = copy;
    check(moved.total().value() == 24690 && copy.total().value() == 24690, "deep copy and move");
    check(hmac("key", "The quick brown fox jumps over the lazy dog") ==
              "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
          "HMAC reference");
    auto hash = passwordHash("ExamplePass123!");
    check(passwordVerify("ExamplePass123!", hash) && !passwordVerify("wrong", hash),
          "password verification");
    check(signatureData(Json{{"z", nullptr}, {"a", 1}, {"b", "text"}}) == "a=1&b=text&z=",
          "payOS canonical data");
    check(csvCell("=CMD()") == "\"'=CMD()\"", "CSV formula protection");
    std::cout << "All domain/security checks passed.\n";
}
