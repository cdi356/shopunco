# unco checkout Worker

A small Cloudflare Worker that turns the site's cart into a Square checkout
page and keeps track of whether each order was actually paid.

1. The site sends only product ids and quantities. The Worker looks up prices
   in `js/products.js`, gives the order its number, and asks Square for a
   payment link. Shipping is free and NY State sales tax (4%) is added.
2. The shopper pays on Square's own page, and Square sends them back to
   `#thank-you`.
3. Square tells the Worker when the payment goes through (or fails, or is
   refunded) with a webhook. Only that marks an order as paid. The thank-you
   page and order history ask the Worker for each order's status.

Your Square access token and webhook signature key are passwords. Never put
them in the website files, in `wrangler.toml`, in a commit, or in a chat.

## 1. Test locally with Square's sandbox

The sandbox is Square's test mode: fake cards, no real money.

1. Sign in at [developer.squareup.com](https://developer.squareup.com) with
   your Square account and create an application (any name, e.g. "unco").
2. In the application, switch to **Sandbox** and copy:
    - the **Sandbox Access Token** (Credentials page)
    - a **sandbox Location ID** (Locations page)
3. Copy `.dev.vars.example` to `.dev.vars` in this folder and paste those two
   values in. Git ignores `.dev.vars`, so it won't be committed.
4. Install and start the Worker:

   ```bash
   cd worker
   npm install
   npm run dev
   ```

5. In `js/api.js`, set `CHECKOUT_API_URL` to `"http://localhost:8787"`.
6. Start the site preview (port 8080), add items, and click **Proceed to
   Checkout**. In the sandbox, Square shows a testing panel instead of the
   card page; click **Test Payment** there.

Square can't send webhooks to your own computer, so locally the thank-you
page stays on "Confirming your payment". To test it, sign a fake webhook
with the local `SQUARE_WEBHOOK_SIGNATURE_KEY` from `.dev.vars` (Square signs
the webhook URL followed by the request body with HMAC-SHA256, base64) and
POST it to `http://localhost:8787/square/webhook`.

## 2. Put it online

1. Create a free account at [cloudflare.com](https://cloudflare.com).
2. From this folder, sign in, store the Square secrets, and deploy:

   ```bash
   npx wrangler login
   npx wrangler secret put SQUARE_ACCESS_TOKEN
   npx wrangler secret put SQUARE_LOCATION_ID
   npm run deploy
   ```

   Each `secret put` asks you to paste the value; it isn't saved anywhere
   locally. The first deploy also creates the `ORDERS` storage. Wrangler
   prints the Worker's address, like
   `https://unco-checkout.<your-subdomain>.workers.dev`.
3. Set `CHECKOUT_API_URL` in `js/api.js` to that address.
4. Connect Square's payment notifications:
    1. In your application on developer.squareup.com, open **Webhooks >
       Subscriptions** (Sandbox) and click **Add subscription**.
    2. URL: the Worker's address followed by `/square/webhook`.
    3. Events: `payment.created`, `payment.updated`, `refund.created`,
       `refund.updated`.
    4. Save it, open it, and copy its **Signature key**.
    5. In `wrangler.toml`, set `SQUARE_WEBHOOK_URL` to exactly the same URL.
    6. Store the key and deploy again:

       ```bash
       npx wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY
       npm run deploy
       ```

Taking real payments: switch `SQUARE_ENVIRONMENT` in `wrangler.toml` to
`"production"`, run the `secret put` commands again with your **production**
access token and location ID, and create the same webhook subscription under
**Production** (its signature key is different, so put that one too).

## Settings

| Setting | Where | What it does |
| --- | --- | --- |
| `SQUARE_ACCESS_TOKEN` | secret | Lets the Worker create checkouts |
| `SQUARE_LOCATION_ID` | secret | Which Square location the sales belong to |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | secret | Proves payment notifications really came from Square |
| `SQUARE_WEBHOOK_URL` | `wrangler.toml` | The webhook subscription's exact URL, used to check signatures |
| `SQUARE_ENVIRONMENT` | `wrangler.toml` | `sandbox` (test) or `production` (real money) |
| `ALLOWED_ORIGINS` | `wrangler.toml` | Websites allowed to start checkouts and read order statuses |
| `SITE_URL` | `wrangler.toml` | Where Square sends shoppers after paying |
| `TAX_PERCENTAGE` | `wrangler.toml` | Sales tax added to every item (4 = NY State). Keep in sync with `TAX_PERCENT` in `js/main.js` |
| `TAX_NAME` | `wrangler.toml` | How the tax is labeled on Square's page and receipt |
| `SHIPPING_FEE_CENTS` | optional var | Flat shipping fee, e.g. `599` for $5.99. Unset = free shipping |
| `ORDERS` | KV storage | Each order's payment status |

Catalog items: add `squareVariationId` to a product in `js/products.js` and
checkout will use Square's price for it. `TAX_PERCENTAGE` still applies on top,
so don't also turn on tax for that item in Square.
