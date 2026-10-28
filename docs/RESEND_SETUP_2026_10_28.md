# Resend setup — 2026-10-28

## Verified

- The owner-supplied credential authenticated successfully with `GET https://api.resend.com/domains` (HTTP 200). No verified or pending domain exists in this Resend account.
- Saved `RESEND_API_KEY` as a sensitive/Secret variable for Production only in the existing Vercel project `shoppe-c`. No key was committed, exposed in frontend variables or added to Preview. Temporary credential input was removed after each connection check.
- Existing C++ integration already posts to Resend, uses an outbox, claims delivery outside the database transaction, supplies an idempotency key and retries with backoff. No extra email library is needed.
- The owner authorized one test to their Resend account email. Resend accepted that message (HTTP 200), sent from `Shoppe <onboarding@resend.dev>`. A subsequent read-only status check reported `delivered`. Receipt ID: `01a18243-0a34-7c90-afd7-d3c757857210`. This was a provider connectivity check, not an application registration/order/reset flow. It created no customer account, order or password mutation. The provider's delivered event does not establish inbox placement or that the recipient opened the message.

## Still required for customer email

`EMAIL_FROM` remains unconfigured and Production was not redeployed solely for the key. Email delivery is therefore not enabled in the live application. The new Secret becomes available to a later deployment, but a sender is still required.

The website may continue using `shoppec.vercel.app`. Sending email requires a domain or subdomain whose DNS the owner controls. The Vercel-owned shared `vercel.app` domain cannot be verified by this project's owner. This is a DNS ownership requirement, rather than a general ban on free domains.

The default `onboarding@resend.dev` sender only supports sending to the email address associated with the Resend account; it is not a sender for all Shoppe customers. Do not set it as a general Production sender or drain the application's existing outbox using it.

## Next steps when a DNS-controlled domain is available

1. In Resend → Domains → Add Domain, enter the owned domain or a dedicated sending subdomain.
2. Add the exact DNS verification records displayed by Resend at that domain's DNS provider; preserve existing mail records. Wait for Resend to show the domain as verified.
3. Choose a sender such as `Shoppe <no-reply@your-owned-domain>` and configure `EMAIL_FROM` for Production. The website's `APP_URL` may remain `https://shoppec.vercel.app`.
4. Before enabling delivery, review the existing outbox and expired verification/reset links, then redeploy with Production configuration and test the application flow with an owner-controlled recipient. Provider acceptance alone does not verify application delivery or inbox placement.

No domain purchase, paid plan, DNS modification, general customer email send or outbox drain was performed during this setup.

Sources: [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction), [default resend.dev recipient restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain), [Send Email](https://resend.com/docs/api-reference/emails/send-email).
