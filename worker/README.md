# unco checkout Worker

A small Cloudflare Worker that turns the site's cart into a Square checkout
page. The site sends only product ids and quantities; the Worker looks up
prices in `js/products.js`, asks Square for a payment link, and the shopper
pays on Square's own page. Square then sends them back to `#thank-you`.

Your Square access token is a password for your Square account. Never put it
in the website files, in `wrangler.toml`, in a commit, or in a chat.

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
   Checkout**. Pay with one of Square's sandbox test cards (see "Sandbox test
   values" in Square's developer docs).

## 2. Put it online

1. Create a free account at [cloudflare.com](https://cloudflare.com).
2. From this folder, sign in and store the secrets on Cloudflare:

   ```bash
   npx wrangler login
   npx wrangler secret put SQUARE_ACCESS_TOKEN
   npx wrangler secret put SQUARE_LOCATION_ID
   ```

   Each command asks you to paste the value; it isn't saved anywhere locally.
3. Deploy:

   ```bash
   npm run deploy
   ```

   Wrangler prints the Worker's address, like
   `https://unco-checkout.<your-subdomain>.workers.dev`.
4. Set `CHECKOUT_API_URL` in `js/api.js` to that address.

Taking real payments: switch `SQUARE_ENVIRONMENT` in `wrangler.toml` to
`"production"`, and run the two `secret put` commands again with your
**production** access token and location ID.

## Settings

| Setting | Where | What it does |
| --- | --- | --- |
| `SQUARE_ACCESS_TOKEN` | secret | Lets the Worker create checkouts |
| `SQUARE_LOCATION_ID` | secret | Which Square location the sales belong to |
| `SQUARE_ENVIRONMENT` | `wrangler.toml` | `sandbox` (test) or `production` (real money) |
| `ALLOWED_ORIGINS` | `wrangler.toml` | Websites allowed to start checkouts |
| `SITE_URL` | `wrangler.toml` | Where Square sends shoppers after paying |
| `SHIPPING_FEE_CENTS` | optional var | Flat shipping fee, e.g. `599` for $5.99 |
| `TAX_PERCENTAGE` | optional var | Fixed tax rate for items not in your Square catalog |

Tax: Square applies your tax settings automatically to items in your Square
catalog. To use them, add `squareVariationId` to a product in
`js/products.js` and checkout will use Square's price and tax for it.
