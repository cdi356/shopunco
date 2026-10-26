import products from "../../js/products.js";

// Turns a cart from the site into a Square-hosted checkout page.
// Prices always come from js/products.js here on the server, never from
// the browser, so a shopper can't change what they pay.

const MAX_LINES = 50;
const MAX_QUANTITY = 99;

export default {
    async fetch(request, env) {
        const cors = corsHeaders(request, env);

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: cors });
        }

        const url = new URL(request.url);
        if (request.method !== "POST" || url.pathname !== "/checkout") {
            return json({ error: "Not found." }, 404, cors);
        }

        if (!cors["Access-Control-Allow-Origin"]) {
            return json({ error: "This site isn't allowed to start checkouts." }, 403, cors);
        }

        let body;
        try {
            body = await request.json();
        } catch (error) {
            return json({ error: "The request wasn't valid JSON." }, 400, cors);
        }

        const cart = validateCart(body.items);
        if (cart.error) {
            return json({ error: cart.error }, 400, cors);
        }

        const email = typeof body.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
            ? body.email.trim().toLowerCase()
            : null;
        const orderId = typeof body.orderId === "string" && /^[A-Z0-9-]{1,40}$/.test(body.orderId)
            ? body.orderId
            : null;

        if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
            return json({ error: "Checkout isn't set up yet." }, 503, cors);
        }

        const result = await createPaymentLink(env, cart.lines, email, orderId);
        if (result.error) {
            return json({ error: "We couldn't start checkout. Please try again." }, 502, cors);
        }

        return json({ checkoutUrl: result.url }, 200, cors);
    }
};

function validateCart(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return { error: "Your cart is empty." };
    }
    if (items.length > MAX_LINES) {
        return { error: "Your cart has too many items." };
    }

    const lines = [];
    for (const item of items) {
        const product = products.find(p => p.id === item?.id);
        const quantity = item?.quantity;

        if (!product) {
            return { error: "Your cart has an item we no longer sell." };
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
            return { error: "Your cart has an invalid quantity." };
        }

        lines.push({ product: product, quantity: quantity });
    }

    return { lines: lines };
}

async function createPaymentLink(env, lines, email, orderId) {
    const order = {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lines.map(({ product, quantity }) => product.squareVariationId
            // Products set up in the Square catalog use Square's price and tax settings
            ? { catalog_object_id: product.squareVariationId, quantity: String(quantity) }
            : {
                name: product.name,
                quantity: String(quantity),
                base_price_money: { amount: Math.round(product.price * 100), currency: "USD" }
            })
    };

    if (orderId) {
        order.reference_id = orderId;
    }

    if (env.TAX_PERCENTAGE) {
        order.taxes = [{ uid: "sales-tax", name: "Sales tax", percentage: env.TAX_PERCENTAGE, scope: "ORDER" }];
    }

    const checkoutOptions = {
        ask_for_shipping_address: true
    };

    if (env.SITE_URL) {
        checkoutOptions.redirect_url = env.SITE_URL + "/?order=" + encodeURIComponent(orderId || "") + "#thank-you";
    }

    if (env.SHIPPING_FEE_CENTS) {
        checkoutOptions.shipping_fee = {
            name: "Shipping",
            charge: { amount: Number(env.SHIPPING_FEE_CENTS), currency: "USD" }
        };
    }

    const payload = {
        idempotency_key: crypto.randomUUID(),
        order: order,
        checkout_options: checkoutOptions
    };

    if (email) {
        payload.pre_populated_data = { buyer_email: email };
    }

    const host = env.SQUARE_ENVIRONMENT === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com";

    const headers = {
        "Authorization": "Bearer " + env.SQUARE_ACCESS_TOKEN,
        "Content-Type": "application/json"
    };
    if (env.SQUARE_VERSION) {
        headers["Square-Version"] = env.SQUARE_VERSION;
    }

    const response = await fetch(host + "/v2/online-checkout/payment-links", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.payment_link?.url) {
        // Shows up in the Worker's logs, never sent to the shopper
        console.error("Square payment link failed", response.status, JSON.stringify(data.errors || data));
        return { error: true };
    }

    return { url: data.payment_link.url };
}

function corsHeaders(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
    const headers = {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin"
    };

    if (allowed.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
    }
    return headers;
}

function json(data, status, headers) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: { ...headers, "Content-Type": "application/json" }
    });
}
