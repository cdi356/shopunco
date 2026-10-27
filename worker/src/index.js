import products from "../../js/products.js";
import { handleAccounts, addOrderToAccount } from "./accounts.js";
import { corsHeaders, json, safeEqual } from "./http.js";
import { sendOrderToCj, checkCjTracking, syncOpenCjOrder, hasCjOrder } from "./cj.js";

// The site's backend. It turns a cart into a Square-hosted checkout page,
// keeps track of whether each order was actually paid, runs customer
// accounts (accounts.js), sends paid orders to CJdropshipping (cj.js), and
// runs the private order desk (#admin on the site) for anything CJ can't
// take, which is ordered by hand on AliExpress.
// Prices always come from js/products.js here on the server, never from
// the browser, so a shopper can't change what they pay.

const MAX_LINES = 50;
const MAX_QUANTITY = 99;
const MAX_STATUS_IDS = 50;
const MAX_FIELD_LENGTH = 200;

// Where a paid order is in being sent to the customer
const FULFILLMENT_STEPS = ["to_order", "ordered", "shipped"];

// What sending an order to CJ may change. Only these are copied onto the
// latest saved order, so a refund that arrives meanwhile isn't undone.
const CJ_FIELDS = ["supplier", "supplierOrderNumber", "fulfillment", "supplierError", "cjMode",
    "cjStatus", "cjSandbox", "cjOrderedAt", "cjDryRun", "updatedAt"];

// Order statuses, in the order they can happen. A later status never goes
// back to an earlier one, so a late or repeated webhook can't undo a refund.
const STATUS_RANK = { awaiting_payment: 0, payment_failed: 1, paid: 2, refunded: 3 };

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Square calls this directly, so it's checked by signature, not CORS
        if (url.pathname === "/square/webhook") {
            return request.method === "POST"
                ? handleWebhook(request, env, ctx)
                : json({ error: "Not found." }, 404, {});
        }

        const cors = corsHeaders(request, env);

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: cors });
        }

        if (url.pathname.startsWith("/admin/")) {
            return handleAdmin(request, url, env, cors);
        }

        if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/account/")) {
            if (!cors["Access-Control-Allow-Origin"]) {
                return json({ error: "This site isn't allowed to use accounts." }, 403, cors);
            }
            return handleAccounts(request, url, env, cors);
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
    },

    // The cron in wrangler.toml: picks up tracking numbers from CJ
    async scheduled(event, env, ctx) {
        if (env.ORDERS) {
            ctx.waitUntil(checkCjTracking(env, id => loadOrder(env, id), saveOrder)
                .then(changed => console.log("CJ tracking check: " + changed + " order(s) updated")));
        }
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
        email: email,
        items: cart.lines.map(({ product, quantity }) => ({
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: quantity
        })),
        createdAt: new Date().toISOString()
    });
    if (result.squareOrderId) {
        await env.ORDERS.put("square-order:" + result.squareOrderId, orderId);
    }
    if (email) {
        await addOrderToAccount(env, email, orderId);
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

// Sends payload as a POST, or makes a GET when there's no payload
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

    return fetch(host + path, payload
        ? { method: "POST", headers: headers, body: JSON.stringify(payload) }
        : { headers: headers });
}

/* ------------------------- */
/*      payment status       */
/* ------------------------- */

// Square tells us here when a payment goes through, fails or is refunded.
// Only this endpoint marks orders as paid; the shopper landing on the
// thank-you page proves nothing on its own.
async function handleWebhook(request, env, ctx) {
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
        const order = orderId ? await updateOrderStatus(env, orderId, update.status) : null;

        // A newly paid order goes on the order desk with its shipping
        // details, and to CJ once the address is in. Square's answer doesn't
        // wait for CJ.
        if (order && order.status === "paid" && !order.shipping) {
            order.shipping = await fetchShipping(env, order.squareOrderId, update.payment);
            order.fulfillment = order.fulfillment || "to_order";
            await saveOrder(env, order);

            if (order.shipping && order.fulfillment === "to_order" && !hasCjOrder(order)) {
                ctx.waitUntil(placeCjOrder(env, order.id));
            }
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
        return status && payment.order_id
            ? { squareOrderId: payment.order_id, status: status, payment: payment }
            : null;
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
    return safeEqual(btoa(String.fromCharCode(...new Uint8Array(digest))), signature);
}

// Returns the order, changed or not, or null if we don't know it
async function updateOrderStatus(env, orderId, status) {
    const order = await loadOrder(env, orderId);
    if (!order || STATUS_RANK[status] <= STATUS_RANK[order.status]) {
        return order;
    }

    order.status = status;
    order.updatedAt = new Date().toISOString();
    await saveOrder(env, order);
    return order;
}

// The shopper types their shipping address on Square's page, so it comes
// from Square's copy of the order. Returns null if Square can't be reached;
// the order desk tries again when it's opened.
async function fetchShipping(env, squareOrderId, payment) {
    const response = await squareFetch(env, "/v2/orders/" + encodeURIComponent(squareOrderId));
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.order) {
        console.error("Square order lookup failed", response.status, JSON.stringify(data.errors || data));
        return null;
    }

    const recipient = data.order.fulfillments
        ?.find(fulfillment => fulfillment.type === "SHIPMENT")
        ?.shipment_details?.recipient || {};
    const address = recipient.address || payment?.shipping_address || null;
    const nameFromAddress = [address?.first_name, address?.last_name].filter(Boolean).join(" ");

    return {
        name: recipient.display_name?.trim() || nameFromAddress || null,
        email: recipient.email_address || payment?.buyer_email_address || null,
        phone: recipient.phone_number || null,
        address: address ? {
            line1: address.address_line_1 || "",
            line2: address.address_line_2 || "",
            city: address.locality || "",
            state: address.administrative_district_level_1 || "",
            postalCode: address.postal_code || "",
            country: address.country || ""
        } : null
    };
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

// Sends a saved order to CJ and saves what happened. Returns the order.
async function placeCjOrder(env, orderId) {
    const order = await loadOrder(env, orderId);
    if (!order) {
        return null;
    }

    const before = JSON.stringify(order);
    await sendOrderToCj(env, order);
    if (JSON.stringify(order) === before) {
        return order;
    }

    // CJ can take several seconds, so copy the result onto a fresh copy,
    // unless another send got the order onto CJ in the meantime
    const latest = await loadOrder(env, orderId);
    if (hasCjOrder(latest) && !hasCjOrder(order)) {
        return latest;
    }
    for (const field of CJ_FIELDS) {
        if (order[field] === undefined) {
            delete latest[field];
        } else {
            latest[field] = order[field];
        }
    }
    await saveOrder(env, latest);
    await syncOpenCjOrder(env, latest);
    return latest;
}

async function loadOrder(env, orderId) {
    return env.ORDERS.get("order:" + orderId, "json");
}

function saveOrder(env, order) {
    return env.ORDERS.put("order:" + order.id, JSON.stringify(order));
}

/* ------------------------- */
/*        order desk         */
/* ------------------------- */

// Private endpoints for the #admin page. They return customers' names and
// addresses, so every request must carry the ADMIN_KEY secret.
async function handleAdmin(request, url, env, cors) {
    if (!env.ADMIN_KEY || !env.ORDERS) {
        return json({ error: "The order desk isn't set up yet." }, 503, cors);
    }
    if (!cors["Access-Control-Allow-Origin"] || !isAdmin(request, env)) {
        return json({ error: "That admin key isn't right." }, 401, cors);
    }

    if (request.method === "GET" && url.pathname === "/admin/orders") {
        return json({ orders: await listPaidOrders(env) }, 200, cors);
    }

    const match = url.pathname.match(/^\/admin\/orders\/(UNCO-[A-Z0-9]{1,20})$/);
    if (request.method === "POST" && match) {
        return updateFulfillment(request, env, cors, match[1]);
    }

    const sendMatch = url.pathname.match(/^\/admin\/orders\/(UNCO-[A-Z0-9]{1,20})\/send-to-cj$/);
    if (request.method === "POST" && sendMatch) {
        return resendToCj(env, cors, sendMatch[1]);
    }

    return json({ error: "Not found." }, 404, cors);
}

function isAdmin(request, env) {
    return safeEqual(request.headers.get("Authorization") || "", "Bearer " + env.ADMIN_KEY);
}

// Unpaid orders are abandoned checkouts, so only paid and refunded ones are
// listed, newest first. Fine for hundreds of orders; past that, this should
// move to a database (Cloudflare D1) that can sort and page.
async function listPaidOrders(env) {
    const keys = [];
    let cursor;
    do {
        const page = await env.ORDERS.list({ prefix: "order:", cursor: cursor });
        keys.push(...page.keys.map(key => key.name));
        cursor = page.list_complete ? null : page.cursor;
    } while (cursor);

    const orders = (await Promise.all(keys.map(key => env.ORDERS.get(key, "json"))))
        .filter(order => order && (order.status === "paid" || order.status === "refunded"));
    orders.forEach(order => {
        order.fulfillment = order.fulfillment || "to_order";
    });

    // Retry Square for any paid order whose address didn't arrive
    await Promise.all(orders
        .filter(order => order.status === "paid" && !order.shipping)
        .map(async order => {
            order.shipping = await fetchShipping(env, order.squareOrderId, null);
            order.fulfillment = order.fulfillment || "to_order";
            if (order.shipping) {
                await saveOrder(env, order);
            }
        }));

    return orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function updateFulfillment(request, env, cors, orderId) {
    let body;
    try {
        body = await request.json();
    } catch (error) {
        return json({ error: "The request wasn't valid JSON." }, 400, cors);
    }

    const order = await loadOrder(env, orderId);
    if (!order || order.status === "awaiting_payment") {
        return json({ error: "There's no paid order with that number." }, 404, cors);
    }

    if (!FULFILLMENT_STEPS.includes(body.fulfillment)) {
        return json({ error: "Unknown order step." }, 400, cors);
    }

    const previousNumber = order.supplierOrderNumber;
    const previousTracking = order.trackingNumber;
    const fields = ["supplierOrderNumber", "carrier", "trackingNumber", "note"];
    for (const field of fields) {
        const value = body[field] ?? "";
        if (typeof value !== "string" || value.length > MAX_FIELD_LENGTH) {
            return json({ error: "One of the fields is too long." }, 400, cors);
        }
        order[field] = value.trim();
    }

    // CJ's tracking link is for CJ's tracking number only
    if (order.trackingNumber !== previousTracking) {
        delete order.trackingUrl;
    }
    // A different order number means it was placed somewhere else by hand
    if (order.supplier === "cj" && order.supplierOrderNumber !== previousNumber) {
        delete order.supplier;
    }
    // Ordered or shipped by hand, so CJ's earlier problem no longer matters
    if (body.fulfillment !== "to_order" && !hasCjOrder(order)) {
        delete order.supplierError;
    }

    order.fulfillment = body.fulfillment;
    order.updatedAt = new Date().toISOString();
    await saveOrder(env, order);
    await syncOpenCjOrder(env, order);

    return json({ order: order }, 200, cors);
}

// The desk's "Send to CJ" button: tries the automatic order again
async function resendToCj(env, cors, orderId) {
    const order = await loadOrder(env, orderId);
    if (!order || order.status !== "paid") {
        return json({ error: "There's no paid order with that number." }, 404, cors);
    }
    if (hasCjOrder(order)) {
        return json({ order: order }, 200, cors);
    }
    if (order.fulfillment && order.fulfillment !== "to_order") {
        return json({ error: "This order is already marked as ordered. Set its step back to \"To order\" first." }, 409, cors);
    }

    // The address may not have arrived from Square yet
    if (!order.shipping) {
        order.shipping = await fetchShipping(env, order.squareOrderId, null);
        if (order.shipping) {
            await saveOrder(env, order);
        }
    }

    return json({ order: await placeCjOrder(env, orderId) }, 200, cors);
}
