# unco Worker

A small Cloudflare Worker that is the site's backend: Square checkout,
payment confirmation, customer accounts with emailed sign-in codes, order
emails, the contact form, and the private order desk.

1. The site sends only product ids and quantities. The Worker looks up prices
   in `js/products.js`, gives the order its number, and asks Square for a
   payment link. Shipping is free and NY State sales tax (4%) is added.
2. The shopper pays on Square's own page, and Square sends them back to
   `#thank-you`.
3. Square tells the Worker when the payment goes through (or fails, or is
   refunded) with a webhook. Only that marks an order as paid. The thank-you
   page and order history ask the Worker for each order's status.
4. A paid order goes on the **order desk**, a private page at
   `shopunco.com/#admin`. It shows the shipping address and each item's
   AliExpress link, so you can place the order on AliExpress, then record the
   AliExpress order number and tracking number there.

Customer accounts (`src/accounts.js`): shoppers sign in with a 6-digit code
emailed through [Resend](https://resend.com), or with a password they choose.
Orders are linked to the email they were placed with, so guest orders appear
once that email signs up. Order history shows payment status and, once you
add it on the order desk, the tracking number.

Your Square access token, webhook signature key, admin key and Resend API key are passwords. Never put
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

5. In `js/api.js`, set `WORKER_URL` to `"http://localhost:8787"`. (Empty
   `WORKER_URL` switches the site to its in-browser demo instead.)
6. Start the site preview (port 8080), add items, and click **Proceed to
   Checkout**. In the sandbox, Square shows a testing panel instead of the
   card page; click **Test Payment** there.

Without a Resend key, `EMAIL_DEV_LOG=true` in `.dev.vars` prints each email,
including sign-in codes, to the terminal running `npm run dev`.

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
3. Set `WORKER_URL` in `js/api.js` to that address.
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

5. Set the key that opens the order desk. Use a long random value, for
   example one your password manager generates:

   ```bash
   npx wrangler secret put ADMIN_KEY
   ```

   Then open `#admin` on the site and enter it. The key is forgotten when
   you close the tab.

## Sending email (Resend)

Every email is sent from `hello@shopunco.com` through Resend's free plan
(3,000 emails a month, 100 a day). Each has a plain-text version.

| Email | Sent to | When |
| --- | --- | --- |
| Sign-in code | Customer | They sign in or sign up with an email code |
| Welcome | Customer | Their account is created |
| Sign-in changed | Customer | They set or change a password, or switch back to email codes. Says "if this wasn't you, contact us" |
| Order confirmation | Customer | Square's webhook says the order is paid (Square sends its own payment receipt too) |
| New order to fulfil | `OWNER_EMAIL` | Same moment, with a link to the order desk |
| Your order is on its way | Customer | The order desk saves the order as **Shipped** with a tracking number |
| Refund | Customer | Square's webhook says the order was refunded |
| Contact form message | `CONTACT_TO` | Someone sends the form on `#contact`. Reply-To is their email, so just hit Reply |

Each order email is sent at most once per order, however often Square
repeats a webhook or the desk is saved: the order records which ones went
out (`emails.confirmation`, `emails.ownerAlert`, `emails.shipped`,
`emails.refund`). If Resend fails, the error is logged, the webhook or save
still succeeds, and the email is tried again the next time that order is
updated. Fix a wrong tracking number by telling the customer yourself; the
shipped email isn't sent a second time.

Customers' replies to unco's emails go to `CONTACT_TO`. Resend only sends
email, so `CONTACT_TO` (and `OWNER_EMAIL`, if it's a shopunco.com address)
needs email forwarding at Squarespace to an inbox you read.

The contact form ignores submissions that fill in a hidden field (bots do,
people can't see it) and allows 3 messages an hour per email address and 5
per connection.

1. Create a free account at [resend.com](https://resend.com).
2. Go to **Domains**, click **Add Domain**, and enter `shopunco.com`.
3. Resend lists a few DNS records (a DKIM `TXT` record, plus an `MX` and a
   `TXT` record on the `send` subdomain). shopunco.com's DNS is at
   Squarespace: open **Squarespace > Domains > shopunco.com > DNS**, and under
   **Custom records** add each record exactly as Resend shows it. Leave the
   existing records alone, including the `v=spf1 -all` one.
4. Back in Resend, click **Verify DNS Records**. It can take from minutes to
   a few hours.
5. Go to **API Keys**, create a key with **Sending access**, and store it:

   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

   To try it locally, paste it into `.dev.vars` as `RESEND_API_KEY=...`
   instead.

`EMAIL_FROM` in `wrangler.toml` must use the verified domain.

## Order desk

For each paid order, the desk shows the shipping address (with a **Copy
address** button), the customer's email and phone, and each item with an
**Open on AliExpress** link. To get those links, add `aliexpress` to each
product in `js/products.js`:

```js
aliexpress: { url: "https://www.aliexpress.us/item/1234567890.html", option: "Color: Black, 16ft" }
```

To fulfil an order: open each item's link, pick the option shown, check out
on AliExpress with the customer's address, then set the step to **Ordered on
AliExpress** and paste the AliExpress order number. When AliExpress shows a
tracking number, add it and set the step to **Shipped**. Refunded orders are
flagged so you don't order them.

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
| `ALLOWED_ORIGINS` | `wrangler.toml` | Websites allowed to use checkout, accounts, order statuses and the contact form |
| `SITE_URL` | `wrangler.toml` | Where Square sends shoppers after paying |
| `TAX_PERCENTAGE` | `wrangler.toml` | Sales tax added to every item (4 = NY State). Keep in sync with `TAX_PERCENT` in `js/main.js` |
| `TAX_NAME` | `wrangler.toml` | How the tax is labeled on Square's page and receipt |
| `SHIPPING_FEE_CENTS` | optional var | Flat shipping fee, e.g. `599` for $5.99. Unset = free shipping |
| `ADMIN_KEY` | secret | Opens the order desk (`#admin`) |
| `RESEND_API_KEY` | secret | Sends every email (sign-in codes, order emails, contact messages) |
| `EMAIL_FROM` | `wrangler.toml` | Who emails come from; its domain must be verified in Resend |
| `CONTACT_TO` | `wrangler.toml` | Where contact form messages and customers' replies go |
| `OWNER_EMAIL` | `wrangler.toml` | Who gets the "new order to fulfil" alert |
| `EMAIL_DEV_LOG` | `.dev.vars` only | `true` prints emails to the log when there's no Resend key. Never set it on Cloudflare |
| `ACCOUNTS` | KV storage | Customer accounts, sign-in codes, sessions and contact form limits |
| `ORDERS` | KV storage | Each order's payment status, items, shipping address and order-desk progress |

Catalog items: add `squareVariationId` to a product in `js/products.js` and
checkout will use Square's price for it. `TAX_PERCENTAGE` still applies on top,
so don't also turn on tax for that item in Square.
