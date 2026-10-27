import products from "../../js/products.js";

// Places paid orders with CJdropshipping (CJ) and checks them for tracking.
// API docs: https://developers.cjdropshipping.com (API 2.0)
//
// CJ_ORDER_MODE decides what happens when an order is sent:
// - "dry-run" (the default): the exact request is built, logged and stored
//   on the order, and nothing is sent to CJ
// - "sandbox": sent as a CJ sandbox order, which CJ never charges or ships
// - "live": a real CJ order, which costs real money
// CJ_AUTO_PAY = "true" pays live orders from the CJ wallet balance right
// away; otherwise they wait in My CJ for you to pay.

const DEFAULT_API_URL = "https://developers.cjdropshipping.com/api2.0/v1/";
const TOKEN_KEY = "cj:token";
const LOCK_PREFIX = "cj-lock:";

// Orders sent to CJ and not yet shipped, for the tracking check. Kept as
// their own keys so the hourly check doesn't read every order there is.
export const OPEN_PREFIX = "cj-open:";

// Refresh the access token this long before CJ says it expires
const TOKEN_MARGIN_MS = 24 * 60 * 60 * 1000;

// CJ allows about one request per second per account. Its answer to more
// is HTTP 429 or code 1600200; waiting a moment and trying again fixes it.
const RATE_LIMIT_CODE = 1600200;
const AUTH_FAILED_CODE = 1600001;
const RETRY_DELAY_MS = 1200;

// CJ's limits on the address fields, from the createOrderV2 docs
const FIELD_LIMITS = {
    shippingCustomerName: 50,
    shippingCountry: 50,
    shippingProvince: 50,
    shippingCity: 50,
    shippingZip: 20,
    shippingPhone: 20,
    shippingAddress: 500,
    shippingAddress2: 500,
    email: 50
};

const TRACKING_BATCH_SIZE = 50;

export function cjMode(env) {
    return ["live", "sandbox"].includes(env.CJ_ORDER_MODE) ? env.CJ_ORDER_MODE : "dry-run";
}

function autoPay(env) {
    return env.CJ_AUTO_PAY === "true";
}

export function hasCjOrder(order) {
    return order.supplier === "cj" && Boolean(order.supplierOrderNumber);
}

// Keeps the cj-open: list in step with the order: listed while CJ has it
// and it hasn't shipped, gone otherwise
export async function syncOpenCjOrder(env, order) {
    if (hasCjOrder(order) && order.fulfillment === "ordered" && order.status === "paid") {
        await env.ORDERS.put(OPEN_PREFIX + order.id, order.supplierOrderNumber);
    } else {
        await env.ORDERS.delete(OPEN_PREFIX + order.id);
    }
}

/* ------------------------- */
/*       placing orders      */
/* ------------------------- */

// Sends one paid order to CJ, changing `order` in place. The caller saves
// it. On success the order is "ordered" with the CJ order id; on any
// problem it stays "to_order" with a readable supplierError for the desk.
// Safe to call again: an order CJ already has is never sent twice.
export async function sendOrderToCj(env, order) {
    if (hasCjOrder(order)) {
        return order;
    }
    if (order.status !== "paid") {
        return failed(order, "Only paid orders can be sent to CJ.");
    }

    const built = buildCjRequest(env, order);
    if (built.error) {
        return failed(order, built.error);
    }

    const mode = cjMode(env);
    order.cjMode = mode;

    if (mode === "dry-run") {
        // Shows up in the Worker's logs, never sent anywhere
        console.log("CJ dry run for " + order.id + ": would POST shopping/order/createOrderV2", JSON.stringify(built.request));
        order.cjDryRun = { request: built.request, at: new Date().toISOString() };
        return failed(order, "Dry run: nothing was sent to CJ (CJ_ORDER_MODE is \"dry-run\"). Order it by hand, or switch to live.");
    }

    if (!env.CJ_API_KEY) {
        return failed(order, "CJ isn't set up yet: CJ_API_KEY is missing.");
    }

    // Two of Square's webhooks for the same payment can arrive together.
    // This catches most of those; asking CJ for the order number below
    // catches the rest, since CJ refuses a second order with the same number.
    // The order is left as it is, so the other send's result isn't overwritten.
    const lockKey = LOCK_PREFIX + order.id;
    if (await env.ORDERS.get(lockKey)) {
        return order;
    }
    await env.ORDERS.put(lockKey, "1", { expirationTtl: 120 });

    try {
        // A previous try may have reached CJ even though we never heard back
        const existing = await findCjOrder(env, order.id);
        if (existing.error) {
            return failed(order, existing.error);
        }
        if (existing.cancelled) {
            return failed(order, "CJ already has a cancelled order " + existing.cancelled + " with this order number and won't take it again. Order it in My CJ or by hand.");
        }
        if (existing.order) {
            return recordCjOrder(order, existing.order, mode);
        }

        const result = await cjRequest(env, "POST", "shopping/order/createOrderV2", built.request);
        if (result.ok && result.data?.orderId) {
            return recordCjOrder(order, result.data, mode);
        }

        // Covers "this order number already exists" and lost answers
        const retry = await findCjOrder(env, order.id);
        if (retry.order) {
            return recordCjOrder(order, retry.order, mode);
        }

        console.error("CJ order failed for " + order.id, result.status, result.code, result.message);
        return failed(order, "CJ didn't take the order: " + (result.message || "no answer") + ". Fix it and click Send to CJ again, or order it by hand.");
    } finally {
        await env.ORDERS.delete(lockKey);
    }
}

function failed(order, message) {
    order.supplierError = message;
    order.fulfillment = order.fulfillment || "to_order";
    order.updatedAt = new Date().toISOString();
    return order;
}

// `cjOrder` is CJ's answer from createOrderV2 or getOrderDetail; both carry
// orderId and orderStatus
function recordCjOrder(order, cjOrder, mode) {
    order.supplier = "cj";
    order.supplierOrderNumber = String(cjOrder.orderId);
    order.fulfillment = "ordered";
    order.cjStatus = cjOrder.orderStatus || "";
    order.cjSandbox = mode === "sandbox";
    order.cjOrderedAt = new Date().toISOString();
    order.updatedAt = order.cjOrderedAt;
    delete order.cjDryRun;

    // CJ can take an order but hold it, e.g. when the wallet balance is short
    const holds = (cjOrder.interceptOrderReasons || []).map(reason => reason.message).filter(Boolean);
    if (holds.length > 0) {
        order.supplierError = "CJ is holding this order: " + holds.join("; ") + ". Check it in My CJ.";
    } else {
        delete order.supplierError;
    }
    return order;
}

// Returns { order } if CJ has an order with our order number, {} if not,
// or { cancelled } with its id if CJ has one that was cancelled
async function findCjOrder(env, orderId) {
    const result = await cjRequest(env, "GET", "shopping/order/getOrderDetail?orderId=" + encodeURIComponent(orderId));
    if (result.ok && result.data?.orderId) {
        return result.data.orderStatus === "CANCELLED"
            ? { cancelled: String(result.data.orderId) }
            : { order: result.data };
    }
    // CJ answers 1600300 "order not found" for a number it doesn't know
    if (result.code === 1600300 || /not found/i.test(result.message || "")) {
        return {};
    }
    console.error("CJ order lookup failed for " + orderId, result.status, result.code, result.message);
    return { error: "We couldn't check CJ for this order (" + (result.message || "no answer") + "). Try Send to CJ again in a minute." };
}

// Builds createOrderV2's body from the order, or returns { error }
export function buildCjRequest(env, order) {
    const shipping = order.shipping;
    const address = shipping?.address;
    if (!address || !address.line1 || !address.city || !address.country) {
        return { error: "No shipping address yet, so it can't go to CJ. Check the order in your Square Dashboard." };
    }
    if (!shipping.name) {
        return { error: "The shipping address has no name, so it can't go to CJ." };
    }

    const items = order.items || [];
    if (items.length === 0) {
        return { error: "The order's item list is missing, so it can't go to CJ." };
    }

    const lines = [];
    const unmapped = [];
    for (const item of items) {
        const vid = products.find(p => p.id === item.id)?.cj?.vid;
        if (vid) {
            lines.push({ vid: String(vid), quantity: item.quantity, storeLineItemId: order.id + "-" + item.id });
        } else {
            unmapped.push(item.name);
        }
    }
    if (unmapped.length > 0) {
        return { error: "No CJ variant (cj.vid in js/products.js) for: " + unmapped.join(", ") + ". Order it by hand." };
    }

    const request = {
        orderNumber: order.id,
        shippingCustomerName: shipping.name,
        shippingAddress: address.line1,
        shippingAddress2: address.line2 || "",
        shippingCity: address.city,
        shippingProvince: address.state || address.city,
        shippingZip: address.postalCode || "",
        shippingCountryCode: address.country,
        shippingCountry: countryName(address.country),
        shippingPhone: (shipping.phone || "").replace(/[^\d+]/g, ""),
        email: shipping.email || order.email || "",
        logisticName: env.CJ_LOGISTIC_NAME || "CJPacket Ordinary",
        fromCountryCode: env.CJ_FROM_COUNTRY || "CN",
        // 2 = pay from the CJ wallet while creating; 3 = create only, and
        // you pay in My CJ. (1, CJ's payment page, is deprecated.)
        payType: cjMode(env) === "live" && autoPay(env) ? 2 : 3,
        products: lines
    };
    if (cjMode(env) === "sandbox") {
        request.isSandbox = 1;
    }

    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
        if (request[field].length > limit) {
            // An email that doesn't fit is left out rather than cut short
            request[field] = field === "email" ? "" : request[field].slice(0, limit);
        }
    }

    return { request: request };
}

function countryName(code) {
    try {
        return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
    } catch (error) {
        return code;
    }
}

/* ------------------------- */
/*         tracking          */
/* ------------------------- */

// Asks CJ about every order it has that hasn't shipped. `loadOrder` and
// `saveOrder` come from index.js. Returns how many orders changed. Only
// reads from CJ, so it runs in every CJ_ORDER_MODE.
export async function checkCjTracking(env, loadOrder, saveOrder) {
    if (!env.CJ_API_KEY) {
        return 0;
    }

    const open = [];
    let cursor;
    do {
        const page = await env.ORDERS.list({ prefix: OPEN_PREFIX, cursor: cursor });
        open.push(...page.keys.map(key => key.name.slice(OPEN_PREFIX.length)));
        cursor = page.list_complete ? null : page.cursor;
    } while (cursor);

    let changed = 0;
    for (let start = 0; start < open.length; start += TRACKING_BATCH_SIZE) {
        const orders = (await Promise.all(open.slice(start, start + TRACKING_BATCH_SIZE).map(loadOrder)))
            .filter(Boolean);
        const stillOpen = [];
        for (const order of orders) {
            if (hasCjOrder(order) && order.fulfillment === "ordered" && order.status === "paid") {
                stillOpen.push(order);
            } else {
                await syncOpenCjOrder(env, order);
            }
        }
        if (stillOpen.length === 0) {
            continue;
        }

        const result = await cjRequest(env, "POST", "shopping/order/getOrderDetailBatch", {
            orderIds: stillOpen.map(order => order.supplierOrderNumber)
        });
        if (!result.ok || !Array.isArray(result.data)) {
            console.error("CJ tracking check failed", result.status, result.code, result.message);
            continue;
        }

        for (const order of stillOpen) {
            const cjOrder = result.data.find(o => String(o.orderId) === order.supplierOrderNumber
                || o.cjOrderCode === order.supplierOrderNumber
                || o.orderNum === order.id);
            if (cjOrder && applyCjUpdate(order, cjOrder)) {
                await saveOrder(env, order);
                await syncOpenCjOrder(env, order);
                changed++;
            }
        }
    }
    return changed;
}

// Returns true if the order changed
export function applyCjUpdate(order, cjOrder) {
    const before = JSON.stringify(order);
    order.cjStatus = cjOrder.orderStatus || order.cjStatus || "";

    if (cjOrder.trackNumber) {
        order.trackingNumber = String(cjOrder.trackNumber);
        order.carrier = cjOrder.logisticName || cjOrder.trackingProvider || order.carrier || "";
        if (cjOrder.trackingUrl) {
            order.trackingUrl = cjOrder.trackingUrl;
        }
        order.fulfillment = "shipped";
        delete order.supplierError;
    } else if (cjOrder.orderStatus === "CANCELLED") {
        // Back on the desk's "To order" list, to be sent again or done by hand
        order.fulfillment = "to_order";
        order.supplierError = "CJ cancelled order " + order.supplierOrderNumber + ". Check My CJ, then send it again or order it by hand.";
        delete order.supplier;
    }

    if (JSON.stringify(order) === before) {
        return false;
    }
    order.updatedAt = new Date().toISOString();
    return true;
}

/* ------------------------- */
/*        API requests       */
/* ------------------------- */

// Every CJ answer looks like { code, result, message, data }. Returns
// { ok, status, code, message, data } and never throws.
async function cjRequest(env, method, path, body, attempt = 0) {
    const token = await getAccessToken(env, attempt > 0);
    if (token.error) {
        return { ok: false, message: token.error };
    }

    const result = await cjFetch(env, method, path, body, { "CJ-Access-Token": token.accessToken });

    if (attempt < 2 && (result.status === 429 || result.code === RATE_LIMIT_CODE)) {
        await sleep(RETRY_DELAY_MS);
        return cjRequest(env, method, path, body, attempt + 1);
    }
    // A token CJ no longer accepts (e.g. after logging out of the API) is
    // dropped and a new one asked for, once
    if (attempt === 0 && (result.status === 401 || result.code === AUTH_FAILED_CODE)) {
        await env.ORDERS.delete(TOKEN_KEY);
        return cjRequest(env, method, path, body, attempt + 1);
    }
    return result;
}

async function cjFetch(env, method, path, body, headers) {
    const init = { method: method, headers: { ...headers } };
    if (body) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
    }

    try {
        const response = await fetch((env.CJ_API_URL || DEFAULT_API_URL) + path, init);
        const data = await response.json().catch(() => ({}));
        return {
            ok: response.ok && data.result === true && data.code === 200,
            status: response.status,
            code: data.code,
            message: data.message || "",
            data: data.data
        };
    } catch (error) {
        return { ok: false, status: 0, message: "couldn't reach CJ" };
    }
}

// CJ access tokens last about 180 days, and refresh tokens as long. The
// token is kept in KV so every request doesn't ask for a new one: CJ
// rate-limits that too. The API key itself is never stored or logged.
async function getAccessToken(env, waitFirst) {
    const now = Date.now();
    const saved = await env.ORDERS.get(TOKEN_KEY, "json");

    if (saved && Date.parse(saved.accessTokenExpiryDate) - TOKEN_MARGIN_MS > now) {
        return saved;
    }

    if (waitFirst) {
        await sleep(RETRY_DELAY_MS);
    }

    let result;
    if (saved?.refreshToken && Date.parse(saved.refreshTokenExpiryDate) - TOKEN_MARGIN_MS > now) {
        result = await cjFetch(env, "POST", "authentication/refreshAccessToken", { refreshToken: saved.refreshToken }, {});
    }
    if (!result?.ok) {
        result = await cjFetch(env, "POST", "authentication/getAccessToken", { apiKey: env.CJ_API_KEY }, {});
    }
    if (!result.ok || !result.data?.accessToken) {
        console.error("CJ sign-in failed", result.status, result.code, result.message);
        return { error: "CJ sign-in failed (" + (result.message || "no answer") + "). Check CJ_API_KEY." };
    }

    const token = {
        accessToken: result.data.accessToken,
        accessTokenExpiryDate: result.data.accessTokenExpiryDate,
        refreshToken: result.data.refreshToken,
        refreshTokenExpiryDate: result.data.refreshTokenExpiryDate
    };
    await env.ORDERS.put(TOKEN_KEY, JSON.stringify(token));
    return token;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

