# Go Winks

Go Winks is a mobile-first couples’ wellness boutique. The storefront includes category collections, product details, search, price and stock filters, sorting, a wishlist, a shopping bag, gift notes, offer codes, customer profiles, checkout and order history.

## Run on your own server

### Deploy from GitHub on Render

[Deploy Go Winks on Render](https://render.com/deploy?repo=https://github.com/neerajiitb/gowinks). Connect the GitHub account that owns the repository and review the recurring compute and disk charges before applying the Blueprint. It creates one Node.js 24 web service in Singapore with 512 MB of memory and a 1 GB persistent disk. Each push to `main` runs the store tests before Render starts the new version. SQLite lives at `/var/data/store.sqlite` across deploys.

Open the Render service URL and verify the catalogue and customer sign-in. A new service starts with its own database. Before switching the live domains, migrate any existing store records, verify customer and staff access, and configure the merchant credentials described below in Render's Environment settings. Add `gowinks.com` and `www.gowinks.com` under the service's Custom Domains and use the DNS records Render provides for that service.

### Run locally or with Docker

Use Node.js 24 or later. The self-hosted application uses the Node standard library, SQLite and browser-native JavaScript. It requires no npm dependencies.

```sh
cp .env.example .env
npm start
```

Open http://localhost:3000. For a container deployment, copy the environment file and run `docker compose up --build -d`. The compose configuration binds to loopback. Put an HTTPS reverse proxy in front, set `COOKIE_SECURE=1` and keep the database volume backed up. The service reads environment changes on startup. Run `npm test` to exercise authorization, catalogue changes, inventory, checkout, payment verification and fulfillment with simulated providers.

## Run the boutique

Register the intended owner's local customer account. On the server, grant that specific account the administrator role after verifying its owner.

```sh
node --env-file-if-exists=.env scripts/staff.mjs owner@example.com admin
```

With Compose, use `docker compose exec store node scripts/staff.mjs owner@example.com admin`. Open **Store management** in the footer. Administrators can grant or revoke staff access using the ID in a customer's saved profile. Managers can maintain products, inventory, collection images, prices, campaigns, announcements, discounts, shipping thresholds, parcel dimensions, policies, messages and fulfillment. Storefront settings persist in SQLite. Stock is the total inventory allocated to a product, including units already reserved or sold.

The private Sites edition uses the platform's authenticated identity and D1. Its owner account has administration access through a server-side setting. `npm run build` emits a self-contained Worker in `dist/server/index.js` and the database migration in `dist/drizzle/`.

## Merchant setup

The catalogue, prices, quantities, food details, product specifications, policies and parcel dimensions are sample merchandising content. Confirm these details against actual stock before accepting payments.

**Razorpay.** Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` on the server. Configure automatic payment capture and a `payment.captured` webhook at `/api/webhook` on the externally reachable store origin. A private Sites audience can block provider callbacks. Use a publicly reachable production deployment for live merchant webhooks. The checkout signs and verifies provider callbacks, confirms captured amount and currency against the stored order, and handles repeated capture events. Start with Razorpay test keys to validate the merchant configuration.

**Shiprocket.** Set `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` and `SHIPROCKET_PICKUP` to a Shiprocket API user's credentials and the exact registered pickup location. Staff can book a paid order in **Store management → Orders** and retrieve the carrier status. Configure parcel sizes in **Storefront**. Complete carrier allocation, AWB and pickup scheduling in the Shiprocket merchant dashboard. Tracking appears in customer order history after staff refresh it.

Set Sites runtime values in the hosted environment and redeploy to apply changes. On self-hosting, keep them in an untracked environment file. The client receives only the publishable Razorpay key when checkout is available.

## Order lifecycle

The server calculates totals and reserves stock atomically before opening a provider order. Reusing the same checkout request returns the original order. Customers can resume an awaiting payment from order history. Confirm unresolved abandoned payments against the Razorpay dashboard before making stock adjustments. Paid orders can progress to shipment booked and delivered. Refunds, return labels, accounting and carrier pickup are handled in the respective merchant dashboards.

[Payment integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) · [Webhook validation](https://razorpay.com/docs/webhooks/validate-test/) · [Shiprocket API](https://apidocs.shiprocket.in/)

The locally bundled DM Sans, Cormorant Garamond and Kalnia fonts are distributed with their SIL Open Font License files in public/fonts.
