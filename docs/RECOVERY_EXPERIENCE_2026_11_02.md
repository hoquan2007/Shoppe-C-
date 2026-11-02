# Password recovery email and confirmation experience

## Email

Forgot-password requests now enqueue an HTML email and plain-text alternative
with subject `Shoppe | Hướng dẫn đặt lại mật khẩu`. The Vietnamese copy includes
a formal greeting, a clear reset button, one-hour expiry from request creation,
single-use and newest-link instructions, an unsolicited-request explanation,
security advice, a fallback URL, and an automated-message footer.

The template uses inline styles and presentation tables, requires no remote
images or fonts, and escapes the URL in HTML. Resend receives both `html` and
`text`; existing notifications remain compatible. The admin outbox endpoint
omits both bodies so reset tokens are not exposed through the new HTML field.
Existing token validation before delivery still applies to the new multiline text.

## Website

Successful requests navigate to `/forgot/sent`, showing the submitted address,
Inbox/Spam/Promotions guidance, sender, subject and expiry. The copy does not
reveal whether an account exists and does not assert delivery. A resend action
has a 60-second client cooldown; backend rate limiting remains authoritative.
Users can choose another address or return to login. Failed requests stay on
the form with an inline error. Confirmation state survives a reload within the
same browser tab for up to one hour using sessionStorage; no email is placed
in the URL. A direct visit without request state offers a new request.

## Verification

- Reviewed email screenshots at 390 and 800 px.
- Reviewed confirmation screenshots at 390, 768 and 1440 px; no horizontal overflow.
- All 10 CTest suites passed, including template escaping, content, actual forgot
  endpoint enqueueing and delivery validity checks.
- Browser coverage includes submission, duplicate prevention, configuration
  retry, refresh persistence, resend cooldown, changing address and network errors.
- `npm run check`, frontend build and `git diff --check` passed.

Preview artifacts are stored under ignored `artifacts/` and contain a fake token.
