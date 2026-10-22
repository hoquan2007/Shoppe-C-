import { writeFile } from "node:fs/promises";

// Public demonstration products only. No application credentials are read here.
const url =
  "https://dummyjson.com/products?limit=0&select=id,title,description,category,price,thumbnail";
const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
if (!response.ok)
  throw new Error(`Demo provider returned HTTP ${response.status}`);
const data = await response.json();
if (!Array.isArray(data.products) || data.products.length < 12)
  throw new Error("Demo provider returned incomplete products");
const groups = new Map();
const allowed = new Set([
  "beauty",
  "fragrances",
  "furniture",
  "home-decoration",
  "kitchen-accessories",
  "smartphones",
  "laptops",
  "mobile-accessories",
  "tablets",
  "mens-shirts",
  "mens-shoes",
  "womens-dresses",
  "womens-shoes",
  "tops",
  "womens-bags",
  "mens-watches",
  "womens-watches",
  "sports-accessories",
  "skin-care",
  "sunglasses",
]);
for (const p of data.products) {
  if (
    !Number.isSafeInteger(p.id) ||
    typeof p.title !== "string" ||
    typeof p.description !== "string" ||
    !allowed.has(p.category) ||
    !Number.isFinite(p.price) ||
    p.price <= 0 ||
    p.price > 4000 ||
    !/^https:\/\/cdn\.dummyjson\.com\//.test(p.thumbnail || "")
  )
    continue;
  if (!groups.has(p.category)) groups.set(p.category, []);
  groups
    .get(p.category)
    .push({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      price: p.price,
      thumbnail: p.thumbnail,
    });
}
// Interleave categories so the homepage is varied rather than one category first.
const products = [];
for (let i = 0; products.length < 30; i++) {
  const next = [...groups.values()].map((items) => items[i]).filter(Boolean);
  if (!next.length) break;
  products.push(...next.slice(0, 30 - products.length));
}
await writeFile(
  "database/demo-catalog.json",
  JSON.stringify(
    {
      source: "DummyJSON",
      source_url: "https://dummyjson.com/docs/products",
      fetched_at: new Date().toISOString(),
      products,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Saved ${products.length} public demo products; no credentials were used.`,
);
