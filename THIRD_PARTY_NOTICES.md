# Third-party software

The CMake build downloads cpp-httplib 0.61.0 and nlohmann/json 3.12.0 from their official repositories with pinned SHA-256 hashes. Both use the MIT license. Dependencies are cached, not committed as generated build artifacts.

- cpp-httplib: Copyright (c) 2026 Yuji Hirose. https://github.com/yhirose/cpp-httplib
- JSON for Modern C++: Copyright (c) 2013–2025 Niels Lohmann. https://github.com/nlohmann/json

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The application also links OpenSSL (Apache-2.0), SQLite (public domain), and optionally PostgreSQL libpq (PostgreSQL License). Node development/build dependencies and their licenses are recorded in package-lock.json and their installed packages. Runtime distributions should retain the applicable library licenses.

The product and hero SVG illustrations in frontend/public/assets were authored for this project and are illustrative catalog data.
# Dữ liệu danh mục demo

`database/demo-catalog.json` chứa bản chụp 30 sản phẩm minh họa từ [DummyJSON Products API](https://dummyjson.com/docs/products). Tên và mô tả có thể bằng tiếng Anh theo nguồn; danh mục giao diện, giá VNĐ minh họa và tồn mô phỏng do backend C++ tạo. Ảnh được tham chiếu qua CDN của nguồn. Dữ liệu không phải hàng tồn thực tế, không phải danh mục Shopee và không thể hiện quan hệ đối tác với các thương hiệu xuất hiện.
