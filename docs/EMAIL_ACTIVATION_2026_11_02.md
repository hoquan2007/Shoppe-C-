# Production email activation — 2026-11-02

## Backlog

The owner authorized cancellation of the 22 legacy queued emails before activating
the verified Resend sender `Shoppe <no-reply@mail.hnquan.io.vn>`.
Production database: QuanShop (`igjwnwzhyxbpntthkapk`), schema `shoppe`.

A count-guarded update changed exactly 22 queued, never-attempted emails created
before 2026-10-30 UTC to `cancelled`. Both the indexed status and JSON payload
status were updated. Existing content was retained, with cancellation timestamps
and reason `legacy_backlog_before_email_activation`.

The backlog comprised 3 reset links, 4 verification links, 6 buyer order notices,
6 seller order notices and 3 payment notices. All 7 account links were invalid or
expired. Verification after the update found 22 retained cancelled messages and
zero queued/failed/sending messages. No legacy message was sent.

## Worker protection

Before each delivery attempt, including retries and recovered leases, the worker
checks account links against the stored token hash, recipient account, purpose
and expiration. Missing, consumed, superseded, expired or mismatched tokens cause
the message to become `cancelled` with reason
`account_link_expired_or_invalidated`. The attempt count is not incremented and
the original message remains available for history. Cancellation is excluded
from automatic delivery and the existing failed-message retry endpoint.

Validation happens before the network request; it cannot retract a message
already in flight if its token is subsequently invalidated.

## Validation

- Backend build succeeded.
- All 10 CTest suites passed, including new mail worker regression tests for
  expired, replaced, consumed, wrong-purpose and wrong-user tokens, valid reset
  and verification links, ordinary notifications, cancellation and retry.
- `npm run check` and `git diff --check` passed.

## Production verification

- Deployment `dpl_7RHq8K7Xgg5ErB25FQC7QnPfd1sJ` reached READY and was
  assigned to `https://shoppec.vercel.app`.
- This was a CLI source deployment of the local changes based on commit
  `b7e82b4`; the changes were not pushed to GitHub by this task.
- Live health returned C++20/PostgreSQL; metadata returned
  `email_configured=true`, `development=false`.
- Exactly one new forgot-password request was submitted to the owner's existing
  account at 2026-11-02 04:08:12 UTC (11:08:12 Asia/Bangkok).
- Its outbox entry became `sent` at 04:08:13 UTC after one attempt, meaning
  Resend returned a successful HTTP response. The stored token was still valid
  and its link origin was `https://shoppec.vercel.app`.
- Provider acceptance is not proof of inbox delivery. The owner should check
  Inbox/Spam. No password change was performed on the real account.
