import products from "../../js/products.js";

// Turns a cart from the site into a Square-hosted checkout page, and keeps
// track of whether each order was actually paid.
// Prices always come from js/products.js here on the server, never from
// the browser, so a shopper can't change what they pay.

const MAX_LINES = 50;
const MAX_QUANTITY = 99;
const MAX_STATUS_IDS = 50;

// Order statuses, in the order they can happen. A later status never goes
// back to an earlier one, so a late or repeated webhook can't undo a refund.
const STATUS_RANK = { awaiting_payment: 0, payment_failed: 1, paid: 2, refunded: 3 };

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Square calls this directly, so it's checked by signature, not CORS
        if (url.pathname === "/square/webhook") {
            return request.method === "POST"
                ? handleWebhook(request, env)
                : json({ error: "Not found." }, 404, {});
        }

        const cors = corsHeaders(request, env);

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: cors });
        }

        const isCheckout = request.method === "POST" && url.pathname === "/checkout";
        const isStatus = request.method === "GET" && url.pathname === "/orders/status";
        if (!isCheckout && !isStatus) {
            return json({ error: "Not found." }, 404, cors);
        }

        if (!cors["Access-Control-Allow-Origin"]) {
            return json({ error: "This site isn't allowed to use checkout." }, 403, cors);
        }

        return isCheckout
            ? handleCheckout(request, env, cors)
            : handleStatus(url, env, cors);
    }
};

/* ------------------------- */
/*         checkout          */
/* ------------------------- */

async function handleCheckout(request, env, cors) {
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

    if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID || !env.ORDERS) {
        return json({ error: "Checkout isn't set up yet." }, 503, cors);
    }

    // The order number is made here, not in the browser, so nobody can
    // reuse someone else's number to overwrite that order's status
    const orderId = newOrderId();

    const result = await createPaymentLink(env, cart.lines, email, orderId);
    if (result.error) {
        return json({ error: "We couldn't start checkout. Please try again." }, 502, cors);
    }

    await saveOrder(env, {
        id: orderId,
        status: "awaiting_payment",
        squareOrderId: result.squareOrderId,
        total: result.total,
        createdAt: new Date().toISOString()
    });
    if (result.squareOrderId) {
        await env.ORDERS.put("square-order:" + result.squareOrderId, orderId);
    }

    return json({ checkoutUrl: result.url, orderId: orderId, total: result.total }, 200, cors);
}

function newOrderId() {
    // No 0/O or 1/I, so the number is easy to read out over the phone
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return "UNCO-" + Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

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
        reference_id: orderId,
        line_items: lines.map(({ product, quantity }) => product.squareVariationId
            // Products set up in the Square catalog use Square's price and tax settings
            ? { catalog_object_id: product.squareVariationId, quantity: String(quantity) }
            : {
                name: product.name,
                quantity: String(quantity),
                base_price_money: { amount: Math.round(product.price * 100), currency: "USD" }
            })
    };

    if (env.TAX_PERCENTAGE) {
        order.taxes = [{ uid: "sales-tax", name: env.TAX_NAME || "Sales tax", percentage: env.TAX_PERCENTAGE, scope: "ORDER" }];
    }

    const checkoutOptions = {
        ask_for_shipping_address: true
    };

    if (env.SITE_URL) {
        checkoutOptions.redirect_url = env.SITE_URL + "/?order=" + encodeURIComponent(orderId) + "#thank-you";
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

    const response = await squareFetch(env, "/v2/online-checkout/payment-links", payload);
    const data = await response.json().catch(() => ({}));

    // A mistyped email shouldn't block payment: Square's page asks for it anyway
    if (email && data.errors?.some(e => e.field === "pre_populated_data.buyer_email")) {
        return createPaymentLink(env, lines, null, orderId);
    }

    if (!response.ok || !data.payment_link?.url) {
        // Shows up in the Worker's logs, never sent to the shopper
        console.error("Square payment link failed", response.status, JSON.stringify(data.errors || data));
        return { error: true };
    }

    const squareOrder = data.related_resources?.orders?.[0];
    return {
        url: data.payment_link.url,
        squareOrderId: data.payment_link.order_id,
        total: squareOrder?.total_money?.amount ?? null
    };
}

function squareFetch(env, path, payload) {
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

    return fetch(host + path, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
    });
}

/* ------------------------- */
/*      payment status       */
/* ------------------------- */

// Square tells us here when a payment goes through, fails or is refunded.
// Only this endpoint marks orders as paid; the shopper landing on the
// thank-you page proves nothing on its own.
async function handleWebhook(request, env) {
    if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY || !env.SQUARE_WEBHOOK_URL || !env.ORDERS) {
        return json({ error: "Webhooks aren't set up yet." }, 503, {});
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-square-hmacsha256-signature") || "";

    if (!await isValidSignature(env, rawBody, signature)) {
        return json({ error: "Invalid signature." }, 401, {});
    }

    let event;
    try {
        event = JSON.parse(rawBody);
    } catch (error) {
        return json({ error: "The request wasn't valid JSON." }, 400, {});
    }

    const update = statusFromEvent(event);
    if (update) {
        const orderId = await env.ORDERS.get("square-order:" + update.squareOrderId);
        if (orderId) {
            await updateOrderStatus(env, orderId, update.status);
        }
    }

    // Anything else (other events, orders we didn't create) is acknowledged
    // so Square doesn't keep retrying it
    return json({ ok: true }, 200, {});
}

function statusFromEvent(event) {
    const object = event?.data?.object;

    if (event?.type === "payment.created" || event?.type === "payment.updated") {
        const payment = object?.payment;
        const status = { COMPLETED: "paid", FAILED: "payment_failed", CANCELED: "payment_failed" }[payment?.status];
        return status && payment.order_id ? { squareOrderId: payment.order_id, status: status } : null;
    }

    if (event?.type === "refund.created" || event?.type === "refund.updated") {
        const refund = object?.refund;
        return refund?.status === "COMPLETED" && refund.order_id
            ? { squareOrderId: refund.order_id, status: "refunded" }
            : null;
    }

    return null;
}

// Square signs each webhook with HMAC-SHA256 over the subscription's URL
// followed by the raw request body, using the subscription's signature key
async function isValidSignature(env, rawBody, signature) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.SQUARE_WEBHOOK_SIGNATURE_KEY),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(env.SQUARE_WEBHOOK_URL + rawBody));
    const expected = encoder.encode(btoa(String.fromCharCode(...new Uint8Array(digest))));
    const received = encoder.encode(signature);

    return expected.byteLength === received.byteLength &&
        crypto.subtle.timingSafeEqual(expected, received);
}

async function updateOrderStatus(env, orderId, status) {
    const order = await loadOrder(env, orderId);
    if (!order || STATUS_RANK[status] <= STATUS_RANK[order.status]) {
        return;
    }

    order.status = status;
    order.updatedAt = new Date().toISOString();
    await saveOrder(env, order);
}

// Only the status is shared: an order number alone doesn't reveal what was
// bought or who bought it
async function handleStatus(url, env, cors) {
    if (!env.ORDERS) {
        return json({ error: "Checkout isn't set up yet." }, 503, cors);
    }

    const ids = (url.searchParams.get("ids") || "")
        .split(",")
        .filter(id => /^UNCO-[A-Z0-9]{1,20}$/.test(id))
        .slice(0, MAX_STATUS_IDS);

    const statuses = {};
    await Promise.all(ids.map(async id => {
        const order = await loadOrder(env, id);
        if (order) {
            statuses[id] = order.status;
        }
    }));

    return json({ statuses: statuses }, 200, cors);
}

async function loadOrder(env, orderId) {
    return env.ORDERS.get("order:" + orderId, "json");
}

function saveOrder(env, order) {
    return env.ORDERS.put("order:" + order.id, JSON.stringify(order));
}

/* ------------------------- */
/*          helpers          */
/* ------------------------- */

function corsHeaders(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
    const headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
