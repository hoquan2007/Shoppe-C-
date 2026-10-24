import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd(),
  password = "DemoShoppe123!",
  testPort = Number(process.env.SHOPPE_TEST_PORT || 18081),
  base = `http://127.0.0.1:${testPort}`;
let child,
  temp,
  output = "",
  checkout,
  buyer,
  seller,
  seller2,
  admin,
  other,
  otherAddress;
const binary =
  process.env.SHOPPE_TEST_BINARY ||
  path.join(
    root,
    "build",
    process.platform === "win32" ? "shoppe.exe" : "shoppe",
  );
function startServer(port, db, payment = false) {
  const env = {
    ...process.env,
    APP_ENV: "test",
    PORT: String(port),
    APP_URL: `http://127.0.0.1:${port}`,
    DATABASE_URL: payment ? "" : process.env.SHOPPE_TEST_DATABASE_URL || "",
    SQLITE_PATH: db,
    SCHEMA_PATH: path.join(root, "database/schema.sql"),
    STATIC_DIR: path.join(root, "dist"),
    SEED_DEMO: "true",
    DEMO_CATALOG_AUTO_IMPORT: "false",
    DEMO_PASSWORD: password,
    BOOTSTRAP_ADMIN_EMAIL: "",
    BOOTSTRAP_ADMIN_PASSWORD: "",
    PAYOS_CLIENT_ID: payment ? "test-only-client" : "",
    PAYOS_API_KEY: payment ? "test-only-api" : "",
    PAYOS_CHECKSUM_KEY: payment ? "test-only-checksum" : "",
    RESEND_API_KEY: "",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_KEY: "",
  };
  if (process.platform === "win32")
    env.PATH = `C:\\msys64\\ucrt64\\bin;${env.PATH || env.Path || ""}`;
  const proc = spawn(binary, [], { cwd: root, env, windowsHide: true });
  proc.stdout.on("data", (b) => (output += b.toString()));
  proc.stderr.on("data", (b) => (output += b.toString()));
  return proc;
}
async function ready(url) {
  for (let i = 0; i < 100; ++i) {
    try {
      const r = await fetch(url + "/api/health");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Server did not start: " + output);
}
function client(url = base) {
  let cookie = "",
    csrf = "";
  return {
    async request(route, method = "GET", body, headers = {}) {
      const res = await fetch(url + "/api" + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: url,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) cookie = cookies[0].split(";")[0];
      const type = res.headers.get("content-type") || "";
      const data = type.includes("json") ? await res.json() : await res.text();
      if (data.csrf) csrf = data.csrf;
      return { status: res.status, data, headers: res.headers };
    },
    async login(email) {
      const result = await this.request("/auth/login", "POST", {
        email,
        password,
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      return result;
    },
  };
}
async function ok(c, route, method = "GET", body) {
  const r = await c.request(route, method, body);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const cartBody = (items) => ({
  items: items.map(([variant_id, quantity]) => ({
    variant_id,
    quantity,
    selected: true,
  })),
});

before(async () => {
  assert.ok(existsSync(binary), "Build backend before running npm test.");
  await mkdir(".cache", { recursive: true });
  temp = await mkdtemp(path.join(root, ".cache", "api-test-"));
  child = startServer(testPort, path.join(temp, "main.db"));
  await ready(base);
  buyer = client();
  seller = client();
  seller2 = client();
  admin = client();
  await buyer.login("buyer@shoppe.local");
  await seller.login("seller@shoppe.local");
  await seller2.login("seller2@shoppe.local");
  await admin.login("admin@shoppe.local");
});
after(() => {
  child?.kill();
});

test("C++ server serves catalog, frontend and explicit integration readiness", async () => {
  const publicClient = client();
  assert.equal(
    (await ok(publicClient, "/health")).database,
    process.env.SHOPPE_TEST_DATABASE_URL ? "postgresql" : "sqlite",
  );
  const { products } = await ok(publicClient, "/products");
  assert.equal(products.length, 12);
  assert.ok(products[0].variants.length);
  const detail = (await ok(publicClient, "/products/" + products[0].id))
    .product;
  assert.deepEqual(products[0].variants, detail.variants);
  assert.deepEqual(products[0].shop, detail.shop);
  assert.equal(products[0].rating, detail.rating);
  assert.equal(products[0].review_count, detail.review_count);
  const meta = await ok(publicClient, "/meta");
  assert.equal(meta.payment_configured, false);
  assert.equal(meta.storage_configured, false);
  const page = await fetch(base + "/product/product-1");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /lang="vi"/);
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
});
test("sessions, origin and CSRF protect mutations", async () => {
  assert.equal((await client().request("/orders")).status, 401);
  assert.equal(
    (
      await buyer.request(
        "/account",
        "PATCH",
        { name: "X" },
        { Origin: "https://other.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await buyer.request(
        "/account",
        "PATCH",
        { name: "X" },
        { "X-CSRF-Token": "" },
      )
    ).status,
    403,
  );
  const result = await ok(buyer, "/auth/me");
  assert.equal(result.user.email, "buyer@shoppe.local");
  assert.equal(result.user.password_hash, undefined);
  assert.equal((await buyer.request("/admin/users")).status, 403);
});
test("product ownership, wishlist and CSV preview validation", async () => {
  const p = (await ok(seller, "/seller/products")).products[0];
  const edit = { ...p, variants: p.variants };
  assert.equal(
    (await seller2.request("/seller/products/" + p.id, "PUT", edit)).status,
    403,
  );
  await ok(buyer, "/wishlist/product-1", "POST");
  assert.equal((await ok(buyer, "/wishlist")).products.length, 1);
  await ok(buyer, "/wishlist/product-1", "DELETE");
  const csv =
    'name,category,description,variant,price,stock,weight\n"Sản phẩm, CSV",Phụ kiện,"Mô tả\nnhiều dòng",Mặc định,10000,3,200\n';
  const preview = await ok(seller, "/seller/import", "POST", {
    csv,
    commit: false,
  });
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.preview.length, 1);
  const bad = csv.replace("10000,3,200", "-1,3,200");
  const checked = await ok(seller, "/seller/import", "POST", { csv: bad });
  assert.equal(checked.errors.length, 1);
  assert.equal(
    (await seller.request("/seller/import", "POST", { csv: bad, commit: true }))
      .status,
    422,
  );
  const imported = await ok(seller, "/seller/import", "POST", {
    csv,
    commit: true,
  });
  assert.equal(imported.imported, 1);
  const exported = await seller.request("/seller/export?kind=products");
  assert.equal(exported.status, 200);
  assert.match(exported.data, /"Sản phẩm, CSV"/);
});
test("multi-shop quote rolls back reservations and checkout ignores client prices", async () => {
  await ok(
    buyer,
    "/cart",
    "PUT",
    cartBody([
      ["product-1-0", 1],
      ["product-2-0", 1],
    ]),
  );
  const payload = {
    address_id: "demo-address",
    method: "cod",
    voucher: "CHAO10",
    shop_vouchers: {},
    idempotency_key: randomUUID(),
    total: 0,
  };
  const before = (await ok(buyer, "/products/product-1")).product.variants[0]
    .stock;
  const quote = await ok(buyer, "/checkout/quote", "POST", payload);
  assert.equal(quote.orders.length, 2);
  assert.equal(quote.checkout.total, 1054000);
  assert.equal(
    (await ok(buyer, "/products/product-1")).product.variants[0].stock,
    before,
  );
  assert.equal((await ok(buyer, "/orders")).orders.length, 0);
  checkout = await ok(buyer, "/checkout", "POST", payload);
  const again = await ok(buyer, "/checkout", "POST", payload);
  assert.equal(again.checkout.id, checkout.checkout.id);
  assert.equal(checkout.checkout.total, quote.checkout.total);
  assert.equal(
    (await ok(buyer, "/products/product-1")).product.variants[0].stock,
    before - 1,
  );
  assert.equal((await ok(buyer, "/orders")).orders.length, 2);
  const shopOrders = (await ok(seller, "/seller/orders")).orders;
  assert.equal(shopOrders.length, 1);
  assert.equal(shopOrders[0].shop_id, "shop-an-nhien");
  assert.equal(
    (
      await seller.request(
        "/orders/" + checkout.orders.find((o) => o.shop_id === "shop-mono").id,
      )
    ).status,
    403,
  );
});
test("order state machine, COD collection, review, partial refund limits", async () => {
  const o = checkout.orders.find((o) => o.shop_id === "shop-mono");
  assert.equal(
    (
      await admin.request("/orders/" + o.id + "/status", "POST", {
        status: "delivered",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await buyer.request("/orders/" + o.id + "/status", "POST", {
        status: "confirmed",
      })
    ).status,
    403,
  );
  for (const status of ["confirmed", "preparing"])
    await ok(seller2, "/orders/" + o.id + "/status", "POST", { status });
  assert.equal(
    (
      await seller2.request("/orders/" + o.id + "/status", "POST", {
        status: "shipping",
      })
    ).status,
    403,
  );
  for (const status of ["shipping", "delivered"])
    await ok(admin, "/orders/" + o.id + "/status", "POST", { status });
  assert.equal(
    (await ok(buyer, "/orders/" + o.id)).order.payment_status,
    "unpaid",
  );
  await ok(admin, "/orders/" + o.id + "/collect", "POST");
  await ok(buyer, "/orders/" + o.id + "/status", "POST", {
    status: "completed",
  });
  const review = await ok(buyer, "/reviews", "POST", {
    order_item_id: o.items[0].id,
    rating: 5,
    comment: "Đánh giá sau khi nhận hàng.",
  });
  assert.equal(review.review.rating, 5);
  const returned = await ok(buyer, "/orders/" + o.id + "/return", "POST", {
    reason: "Trả hàng để kiểm thử quy trình.",
    items: [{ item_id: o.items[0].id, quantity: 1 }],
  });
  await ok(seller2, "/returns/" + returned.return_request.id, "POST", {
    status: "approved",
  });
  assert.equal(
    (
      await seller2.request("/returns/" + returned.return_request.id, "POST", {
        status: "received",
      })
    ).status,
    403,
  );
  await ok(admin, "/returns/" + returned.return_request.id, "POST", {
    status: "received",
  });
  assert.equal(
    (
      await admin.request("/returns/" + returned.return_request.id, "POST", {
        status: "received",
      })
    ).status,
    409,
  );
  const due = (await ok(buyer, "/orders/" + o.id)).order.refund_due;
  assert.equal(due, o.total);
  await ok(admin, "/admin/refunds", "POST", {
    order_id: o.id,
    amount: due - 1,
    reference: "TEST-REFUND-1",
    note: "Simulated record only",
  });
  await ok(admin, "/admin/refunds", "POST", {
    order_id: o.id,
    amount: due - 1,
    reference: "TEST-REFUND-1",
  });
  assert.equal(
    (
      await admin.request("/admin/refunds", "POST", {
        order_id: o.id,
        amount: 2,
        reference: "TEST-REFUND-2",
      })
    ).status,
    409,
  );
  await ok(admin, "/admin/refunds", "POST", {
    order_id: o.id,
    amount: 1,
    reference: "TEST-REFUND-2",
  });
  assert.equal((await ok(buyer, "/orders/" + o.id)).order.refunds.length, 2);
});
test("cancelling a COD order restores stock once", async () => {
  const o = checkout.orders.find((o) => o.shop_id === "shop-an-nhien");
  const before = (await ok(buyer, "/products/product-2")).product.variants[0]
    .stock;
  await ok(buyer, "/orders/" + o.id + "/status", "POST", {
    status: "cancelled",
  });
  assert.equal(
    (await ok(buyer, "/products/product-2")).product.variants[0].stock,
    before + 1,
  );
  assert.equal(
    (
      await buyer.request("/orders/" + o.id + "/status", "POST", {
        status: "cancelled",
      })
    ).status,
    403,
  );
});
test("shop onboarding, no public admin assignment, address isolation", async () => {
  other = client();
  const result = await other.request("/auth/register", "POST", {
    email: "new-user@example.test",
    password,
    name: "Người mua mới",
    role: "admin",
  });
  assert.equal(result.status, 201);
  await other.login("new-user@example.test");
  assert.equal((await ok(other, "/auth/me")).user.role, "buyer");
  assert.equal(
    (await ok(other, "/notifications")).notifications.length,
    0,
    "verification token must not leak into website notifications",
  );
  otherAddress = (
    await ok(other, "/addresses", "POST", {
      name: "Người thử",
      phone: "0900000000",
      street: "Địa chỉ kiểm thử",
      city: "Hà Nội",
      region: "Miền Bắc",
    })
  ).address.id;
  assert.equal(
    (await other.request("/addresses/demo-address", "DELETE")).status,
    403,
  );
  const { shop } = await ok(other, "/shops/apply", "POST", {
    name: "Shop mới",
    description: "Shop kiểm thử",
    region: "Miền Bắc",
  });
  assert.equal(shop.status, "pending");
  await ok(admin, "/admin/shops/" + shop.id, "POST", { status: "approved" });
  assert.equal((await ok(other, "/auth/me")).shop.status, "approved");
});
test("two buyers cannot purchase the last item simultaneously", async () => {
  const { product } = await ok(seller, "/seller/products", "POST", {
    shop_id: "shop-an-nhien",
    name: "Hàng cuối",
    description: "Kiểm thử tranh chấp",
    category: "Phụ kiện",
    image: "/assets/product-bag.svg",
    weight: 300,
    variants: [{ name: "Duy nhất", price: 10000, stock: 1 }],
  });
  const variant = product.variants[0].id;
  await ok(buyer, "/cart", "PUT", cartBody([[variant, 1]]));
  await ok(other, "/cart", "PUT", cartBody([[variant, 1]]));
  const results = await Promise.all([
    buyer.request("/checkout", "POST", {
      address_id: "demo-address",
      method: "cod",
      idempotency_key: randomUUID(),
    }),
    other.request("/checkout", "POST", {
      address_id: otherAddress,
      method: "cod",
      idempotency_key: randomUUID(),
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await ok(buyer, "/products/" + product.id)).product.variants[0].stock,
    0,
  );
});
test("missing payOS configuration never creates a fake payment or consumes stock", async () => {
  await ok(buyer, "/cart", "PUT", cartBody([["product-1-1", 1]]));
  const before = (await ok(buyer, "/orders")).orders.length;
  assert.equal(
    (
      await buyer.request("/checkout", "POST", {
        address_id: "demo-address",
        method: "payos",
        idempotency_key: randomUUID(),
      })
    ).status,
    503,
  );
  assert.equal((await ok(buyer, "/orders")).orders.length, before);
  assert.equal(
    (
      await client().request("/payments/webhook", "POST", {
        data: {},
        signature: "fake",
      })
    ).status,
    503,
  );
  const { outbox } = await ok(admin, "/admin/outbox");
  assert.ok(outbox.length > 0);
  assert.equal(outbox[0].text, undefined);
});
test("signed webhook: bad signatures, duplicate events, expiry and late-payment refunds", async () => {
  const file = path.join(temp, "payment.db"),
    url = `http://127.0.0.1:${testPort + 1}`;
  const proc = startServer(testPort + 1, file, true);
  await ready(url);
  try {
    const db = new DatabaseSync(file),
      timestamp = Math.floor(Date.now() / 1000);
    const put = db.prepare(
      "INSERT INTO checkouts(id,buyer_id,idem_key,order_code,status,expires_at,payload) VALUES(?,?,?,?,?,?,?)",
    );
    for (const [id, code, expiry] of [
      ["fixture-paid", 100001, timestamp + 900],
      ["fixture-expired", 100002, timestamp - 1],
    ]) {
      const g = {
        id,
        buyer_id: "buyer",
        idem_key: id,
        order_code: code,
        method: "payos",
        status: "pending",
        expires_at: expiry,
        total: 2000,
        created_at: timestamp,
      };
      put.run(id, "buyer", id, code, "pending", expiry, JSON.stringify(g));
    }
    const publicClient = client(url),
      signed = (code, amount = 2000, reference = "REF-" + code) => {
        const data = {
          amount,
          code: "00",
          orderCode: code,
          reference,
        };
        const raw = Object.keys(data)
          .sort()
          .map((k) => k + "=" + data[k])
          .join("&");
        return {
          data,
          signature: createHmac("sha256", "test-only-checksum")
            .update(raw)
            .digest("hex"),
        };
      };
    assert.equal(
      (
        await publicClient.request("/payments/webhook", "POST", {
          ...signed(100001),
          signature: "bad",
        })
      ).status,
      400,
    );
    await ok(publicClient, "/products");
    assert.equal(
      JSON.parse(
        db
          .prepare("SELECT payload FROM checkouts WHERE id=?")
          .get("fixture-expired").payload,
      ).status,
      "expired",
      "public catalog reads still expire pending reservations",
    );
    await ok(publicClient, "/payments/webhook", "POST", signed(100001));
    await ok(publicClient, "/payments/webhook", "POST", signed(100001));
    const reader = client(url);
    await reader.login("buyer@shoppe.local");
    assert.equal(
      (await ok(reader, "/payments/fixture-paid")).checkout.status,
      "paid",
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM payment_events WHERE checkout_id=?",
        )
        .get("fixture-paid").count,
      1,
    );
    await ok(publicClient, "/payments/webhook", "POST", signed(100002));
    assert.equal(
      (await ok(reader, "/payments/fixture-expired")).checkout.status,
      "review",
    );
    const manager = client(url);
    await manager.login("admin@shoppe.local");
    await ok(
      publicClient,
      "/payments/webhook",
      "POST",
      signed(100001, 500, "EXTRA-1"),
    );
    await ok(
      publicClient,
      "/payments/webhook",
      "POST",
      signed(100001, 500, "EXTRA-1"),
    );
    let paid = (await ok(reader, "/payments/fixture-paid")).checkout;
    assert.equal(paid.status, "paid");
    assert.equal(paid.received_amount, 2500);
    assert.equal(paid.excess_amount, 500);
    assert.equal(paid.needs_reconciliation, true);
    assert.equal(
      (
        await publicClient.request(
          "/payments/webhook",
          "POST",
          signed(100001, 600, "EXTRA-1"),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await manager.request("/admin/payments/fixture-paid/refund", "POST", {
          amount: 501,
          reference: "TOO-MUCH",
        })
      ).status,
      409,
    );
    await ok(manager, "/admin/payments/fixture-paid/refund", "POST", {
      amount: 200,
      reference: "EXCESS-PARTIAL",
    });
    await ok(manager, "/admin/payments/fixture-paid/refund", "POST", {
      amount: 200,
      reference: "EXCESS-PARTIAL",
    });
    await ok(manager, "/admin/payments/fixture-paid/refund", "POST", {
      amount: 300,
      reference: "EXCESS-REST",
    });
    paid = (await ok(reader, "/payments/fixture-paid")).checkout;
    assert.equal(paid.status, "paid");
    assert.equal(paid.needs_reconciliation, false);
    assert.equal(paid.excess_refunded_amount, 500);
    await ok(
      publicClient,
      "/payments/webhook",
      "POST",
      signed(100001, 100, "EXTRA-2"),
    );
    paid = (await ok(reader, "/payments/fixture-paid")).checkout;
    assert.equal(paid.received_amount, 2600);
    assert.equal(paid.needs_reconciliation, true);
    assert.equal(
      (
        await manager.request("/admin/payments/fixture-paid/refund", "POST", {
          amount: 101,
          reference: "EXCESS-OVER",
        })
      ).status,
      409,
    );
    await ok(manager, "/admin/payments/fixture-paid/refund", "POST", {
      amount: 100,
      reference: "EXCESS-LAST",
    });
    await ok(manager, "/admin/payments/fixture-expired/refund", "POST", {
      amount: 2000,
      reference: "MANUAL-RETURN",
    });
    assert.equal(
      (await ok(reader, "/payments/fixture-expired")).checkout.status,
      "refunded",
    );
    db.close();
  } finally {
    proc.kill();
  }
});
test("dashboard, audit, configurable shipping and persistent data", async () => {
  const dashboard = await ok(admin, "/dashboard?scope=admin");
  assert.ok(dashboard.stats.orders >= 3);
  assert.ok(dashboard.stats.refunds > 0);
  assert.ok((await ok(admin, "/admin/audit")).audit.length > 0);
  const { settings } = await ok(admin, "/admin/settings");
  await ok(admin, "/admin/settings", "POST", {
    ...settings,
    shipping_local: 22000,
  });
  assert.equal((await ok(buyer, "/meta")).settings.shipping_local, 22000);
  if (!process.env.SHOPPE_TEST_DATABASE_URL) {
    const db = new DatabaseSync(path.join(temp, "main.db"));
    assert.ok(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n >= 3);
    db.close();
  }
});
test("API method contract rejects unsupported methods and non-existent payment subpaths", async () => {
  for (const [path, method] of [
    ["/cart", "POST"],
    ["/products", "PUT"],
    ["/payments/webhook", "GET"],
    ["/shops/apply", "GET"],
    ["/auth/me", "DELETE"],
  ]) {
    assert.equal(
      (await buyer.request(path, method)).status,
      405,
      `${method} ${path}`,
    );
  }
  assert.equal(
    (await buyer.request("/payments/does-not-exist/unknown")).status,
    404,
  );
  assert.equal((await buyer.request("/unknown-api")).status, 404);
  const response = await fetch(base + "/api/products", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("Vietnamese search, admin product editing, review moderation and chat isolation", async () => {
  const found = await ok(client(), "/products?q=ao%20thun");
  assert.ok(found.products.some((p) => p.id === "product-4"));
  const p = (
    await ok(admin, "/admin/products", "POST", {
      shop_id: "shop-mono",
      name: "Hàng do admin thêm",
      category: "Phụ kiện",
      description: "Dữ liệu kiểm thử",
      image: "/assets/product-bag.svg",
      weight: 200,
      variants: [{ name: "Mặc định", price: 20000, stock: 5 }],
    })
  ).product;
  await ok(admin, "/admin/products/" + p.id, "PUT", {
    ...p,
    name: "Hàng admin đã sửa",
  });
  assert.equal(
    (await ok(client(), "/products/" + p.id)).product.name,
    "Hàng admin đã sửa",
  );
  const { reviews } = await ok(admin, "/admin/reviews");
  assert.ok(reviews.length > 0);
  await ok(admin, "/admin/reviews/" + reviews[0].id, "POST", { hidden: true });
  assert.equal(
    (await ok(client(), "/products/" + reviews[0].product_id)).reviews.length,
    0,
  );
  await ok(buyer, "/reviews", "POST", {
    order_item_id: reviews[0].order_item_id,
    rating: 4,
    comment: "Nội dung đã chỉnh sửa vẫn cần được quản trị viên cho hiện.",
  });
  assert.equal(
    (await ok(client(), "/products/" + reviews[0].product_id)).reviews.length,
    0,
  );
  assert.equal(
    (await ok(admin, "/admin/reviews")).reviews.find(
      (r) => r.id === reviews[0].id,
    ).hidden,
    true,
  );
  const { conversation } = await ok(buyer, "/conversations", "POST", {
    shop_id: "shop-mono",
  });
  await ok(buyer, "/conversations/" + conversation.id + "/messages", "POST", {
    text: "Xin chào shop.",
  });
  assert.equal(
    (await ok(seller2, "/conversations/" + conversation.id + "/messages"))
      .messages.length,
    1,
  );
  assert.equal(
    (await seller.request("/conversations/" + conversation.id + "/messages"))
      .status,
    403,
  );
  assert.equal((await client().request("/jobs/maintenance")).status, 403);
});
test("failed logins remain rate-limited and data/sessions survive backend restart", async () => {
  const unknown = client();
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await unknown.request("/auth/login", "POST", {
          email: "unknown@example.test",
          password: "wrong",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await unknown.request("/auth/login", "POST", {
        email: "unknown@example.test",
        password: "wrong",
      })
    ).status,
    429,
  );
  const count = (await ok(buyer, "/orders")).orders.length;
  await new Promise((resolve) => {
    child.once("exit", resolve);
    child.kill();
  });
  child = startServer(testPort, path.join(temp, "main.db"));
  await ready(base);
  assert.equal((await ok(buyer, "/auth/me")).user.email, "buyer@shoppe.local");
  assert.equal((await ok(buyer, "/orders")).orders.length, count);
});

test("live demo catalog requires admin, CSRF and bounded input before network access", async () => {
  for (const user of [client(), buyer, seller]) {
    const expected = user === buyer || user === seller ? 403 : 401;
    assert.equal(
      (await user.request("/admin/catalog/status")).status,
      expected,
    );
    assert.equal(
      (await user.request("/admin/catalog/preview", "POST", { limit: 60 }))
        .status,
      expected,
    );
    assert.equal(
      (
        await user.request("/admin/catalog/commit", "POST", {
          preview_token: "invalid",
        })
      ).status,
      expected,
    );
  }
  const status = await ok(admin, "/admin/catalog/status");
  assert.equal(status.provider, "DummyJSON");
  assert.equal(status.max_products, 1000);
  assert.equal(status.requires_key, false);
  assert.equal(status.payment_provider, "payos");
  assert.equal(status.shopee.enabled, false);
  assert.equal(
    (
      await admin.request(
        "/admin/catalog/preview",
        "POST",
        { limit: 60 },
        { "X-CSRF-Token": "" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.request(
        "/admin/catalog/preview",
        "POST",
        { limit: 60 },
        { Origin: "https://other.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await admin.request("/admin/catalog/preview", "POST", { limit: 1001 }))
      .status,
    422,
  );
  assert.equal(
    (await admin.request("/admin/catalog/preview", "POST", { limit: "60" }))
      .status,
    422,
  );
  assert.equal(
    (
      await admin.request("/admin/catalog/commit", "POST", {
        preview_token: "not-a-preview",
      })
    ).status,
    409,
  );
  assert.equal((await admin.request("/admin/catalog/preview")).status, 405);
});

test("admin imports public demo catalog without duplicate stock or overwriting edits", async () => {
  assert.equal(
    (await buyer.request("/admin/catalog/import", "POST", {})).status,
    403,
  );
  assert.equal(
    (await seller.request("/admin/catalog/import", "POST", {})).status,
    403,
  );
  const first = await ok(admin, "/admin/catalog/import", "POST", {});
  assert.equal(first.imported, 30);
  assert.equal(first.source, "DummyJSON");
  const products = (await ok(admin, "/admin/products")).products.filter(
    (p) => p.source === "DummyJSON",
  );
  assert.equal(products.length, 30);
  const product = products[0];
  assert.equal(product.shop_id, first.shop_id);
  assert.ok(product.is_demo);
  assert.match(product.image, /^https:\/\/cdn\.dummyjson\.com\//);
  product.name = "Tên demo đã được admin sửa";
  product.variants[0].stock = 7;
  await ok(admin, "/admin/products/" + product.id, "PUT", product);
  const again = await ok(admin, "/admin/catalog/import", "POST", {});
  assert.equal(again.imported, 0);
  assert.equal(again.skipped, 30);
  const saved = (await ok(admin, "/admin/products")).products.find(
    (p) => p.id === product.id,
  );
  assert.equal(saved.name, product.name);
  assert.equal(saved.variants[0].stock, 7);
});

test("public catalog uses server pagination, bounded input and private preview isolation", async () => {
  const publicClient = client();
  const first = await ok(publicClient, "/products?page=1&page_size=12");
  const second = await ok(publicClient, "/products?page=2&page_size=12");
  assert.ok(first.total > 24);
  assert.equal(first.products.length, 12);
  assert.equal(second.products.length, 12);
  assert.equal(second.page, 2);
  assert.equal(second.total, first.total);
  assert.equal(
    new Set([...first.products, ...second.products].map((p) => p.id)).size,
    24,
  );
  const response = await publicClient.request("/products?limit=12");
  assert.match(response.headers.get("cache-control"), /s-maxage=15/);
  assert.doesNotMatch(
    response.headers.get("cache-control"),
    /private|no-store/,
  );
  assert.match(
    response.headers.get("server-timing"),
    /db_pool;dur=.*db;dur=.*app;dur=/,
  );
  assert.ok(response.headers.get("x-request-id"));
  for (const query of [
    "page=0",
    "page=-1",
    "page_size=49",
    "min=20&max=10",
    "sort=invalid",
  ]) {
    assert.equal(
      (await publicClient.request("/products?" + query)).status,
      422,
    );
  }
  const home = await ok(publicClient, "/home");
  assert.equal(home.products.length, 12);
  assert.equal(home.total, first.total);
  assert.ok(home.meta.categories.length);
  assert.ok(Object.keys(home.category_previews).length);
  assert.ok(Buffer.byteLength(JSON.stringify(home)) < 30000);
  const owned = (await ok(admin, "/admin/products")).products[0];
  const input = {
    ...owned,
    name: "Private catalog draft fixture",
    active: false,
    variants: [{ name: "Private fixture", price: 30000, stock: 1 }],
  };
  delete input.id;
  const { product } = await ok(admin, "/admin/products", "POST", input);
  const preview = await admin.request("/products/" + product.id);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get("cache-control"), /private.*no-store/);
  const hidden = await publicClient.request("/products/" + product.id);
  assert.equal(hidden.status, 404);
  assert.match(hidden.headers.get("cache-control"), /private.*no-store/);
  assert.equal(
    (await ok(publicClient, "/products?q=Private%20catalog%20draft%20fixture"))
      .total,
    0,
  );
  const me = await buyer.request("/auth/me");
  assert.match(me.headers.get("cache-control"), /private.*no-store/);
});

test("idle HTTP keep-alive does not exhaust the bounded C++ worker pool", async () => {
  const started = performance.now();
  const responses = await Promise.all(
    Array.from({ length: 20 }, async (_, i) => {
      const response = await fetch(
        base + "/api/products?page=" + ((i % 2) + 1),
        {
          signal: AbortSignal.timeout(3000),
        },
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).products.length, 12);
      assert.equal(response.headers.get("connection"), "close");
    }),
  );
  assert.equal(responses.length, 20);
  assert.ok(
    performance.now() - started < 2500,
    "readers must not queue behind idle sockets",
  );
});
