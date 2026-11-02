#pragma once
#include "database.h"

namespace shoppe {
inline std::string emailHtmlEscape(const std::string &value) {
    std::string result;
    for (const auto c : value) {
        switch (c) {
        case '&': result += "&amp;"; break;
        case '<': result += "&lt;"; break;
        case '>': result += "&gt;"; break;
        case '"': result += "&quot;"; break;
        case '\'': result += "&#39;"; break;
        default: result += c;
        }
    }
    return result;
}
inline Json passwordResetMail(const std::string &url) {
    const auto safeUrl = emailHtmlEscape(url);
    const std::string text =
        "Kính gửi Quý khách,\n\n"
        "Shoppe đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản sử dụng địa chỉ email này. "
        "Để tạo mật khẩu mới, Quý khách vui lòng truy cập liên kết sau:\n\n" + url +
        "\n\nLiên kết có hiệu lực trong 1 giờ kể từ khi yêu cầu được tạo và chỉ sử dụng một lần. "
        "Nếu Quý khách yêu cầu gửi lại, vui lòng sử dụng liên kết trong email mới nhất.\n\n"
        "Nếu không thực hiện yêu cầu này, Quý khách có thể bỏ qua email. "
        "Mật khẩu hiện tại sẽ không thay đổi cho đến khi Quý khách hoàn tất việc đặt lại. "
        "Vui lòng không chia sẻ liên kết này với bất kỳ ai.\n\n"
        "Trân trọng,\nĐội ngũ Shoppe\n\n"
        "Đây là email tự động. Vui lòng không trả lời email này.";
    const std::string html = R"HTML(<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Đặt lại mật khẩu Shoppe</title></head>
<body style="margin:0;padding:0;background:#f7f5f1;color:#29251f;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Hướng dẫn đặt lại mật khẩu Shoppe. Liên kết có hiệu lực trong 1 giờ.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f5f1;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e8e1d8;">
<tr><td style="padding:28px 32px;background:#f1dfd0;font-size:28px;font-weight:bold;letter-spacing:-1px;">shoppe<span style="display:block;margin-top:6px;font-size:13px;font-weight:normal;letter-spacing:0;">Niềm vui mỗi ngày</span></td></tr>
<tr><td style="padding:32px;font-size:16px;line-height:1.7;">
<h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;letter-spacing:-0.5px;">Đặt lại mật khẩu của Quý khách</h1>
<p style="margin:0 0 16px;">Kính gửi Quý khách,</p>
<p style="margin:0 0 24px;">Shoppe đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản sử dụng địa chỉ email này. Quý khách vui lòng nhấn nút bên dưới để tạo mật khẩu mới.</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#b7431c" style="border-radius:8px;"><a href=")HTML" + safeUrl + R"HTML(" style="display:inline-block;padding:15px 28px;border:1px solid #b7431c;border-radius:8px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">Đặt lại mật khẩu</a></td></tr></table>
<p style="margin:24px 0;padding:16px;background:#f7f5f1;font-size:14px;line-height:1.7;"><strong>Liên kết có hiệu lực trong 1 giờ</strong> kể từ khi yêu cầu được tạo và chỉ sử dụng một lần. Nếu yêu cầu gửi lại, Quý khách vui lòng sử dụng email mới nhất.</p>
<p style="margin:0 0 16px;">Nếu không thực hiện yêu cầu này, Quý khách có thể bỏ qua email. Mật khẩu hiện tại sẽ không thay đổi cho đến khi Quý khách hoàn tất việc đặt lại.</p>
<p style="margin:0 0 24px;font-size:14px;">Để bảo vệ tài khoản, vui lòng không chia sẻ liên kết này với bất kỳ ai.</p>
<p style="margin:0;">Trân trọng,<br><strong>Đội ngũ Shoppe</strong></p>
<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e8e1d8;font-size:13px;line-height:1.7;">Nếu nút trên không hoạt động, Quý khách có thể sao chép và dán liên kết sau vào trình duyệt:<br><a href=")HTML" + safeUrl + R"HTML(" style="color:#b7431c;word-break:break-all;overflow-wrap:anywhere;">)HTML" + safeUrl + R"HTML(</a></div>
</td></tr></table><p style="max-width:520px;margin:20px 0 0;color:#746b62;font-size:12px;line-height:1.6;">Đây là email tự động từ Shoppe. Vui lòng không trả lời email này.</p>
</td></tr></table></body></html>)HTML";
    return {{"subject", "Shoppe | Hướng dẫn đặt lại mật khẩu"}, {"text", text}, {"html", html}};
}
} // namespace shoppe
