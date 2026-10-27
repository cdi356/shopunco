/* ------------------------- */
/*        order desk         */
/* ------------------------- */

// The private #admin page: every paid order with its shipping address.
// Paid orders go to CJdropshipping automatically; the desk shows the CJ
// order and any problem, can send an order to CJ again, and has AliExpress
// links for ordering by hand when CJ can't take it.
// It isn't linked anywhere. The orders come from the checkout Worker, which
// only hands them over with the ADMIN_KEY secret; the key is kept for this
// browser tab only.

const ADMIN_KEY_STORAGE = "unco-admin-key";

const FULFILLMENT_LABELS = {
    to_order: "To order",
    ordered: "Ordered",
    shipped: "Shipped"
};

const deskFilters = [
    { id: "to_order", label: "To order", matches: order => order.status === "paid" && order.fulfillment === "to_order" },
    { id: "ordered", label: "Ordered", matches: order => order.status === "paid" && order.fulfillment === "ordered" },
    { id: "shipped", label: "Shipped", matches: order => order.status === "paid" && order.fulfillment === "shipped" },
    { id: "refunded", label: "Refunded", matches: order => order.status === "refunded" },
    { id: "all", label: "All", matches: () => true }
];

// CJ's order statuses (see cj.js) that still need you to pay in My CJ
const CJ_UNPAID = ["CREATED", "IN_CART", "UNPAID"];

const CJ_STATUS_LABELS = {
    CREATED: "Created, not paid",
    IN_CART: "In cart, not paid",
    UNPAID: "Not paid",
    UNSHIPPED: "Paid, being prepared",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
};

const desk = {
    orders: [],
    filter: "to_order"
};

function getAdminKey() {
    try {
        return sessionStorage.getItem(ADMIN_KEY_STORAGE);
    } catch (error) {
        return null;
    }
}

function setAdminKey(key) {
    try {
        if (key) {
            sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
        } else {
            sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        }
    } catch (error) {
        // Storage unavailable; the key is asked for again next time
    }
}

async function renderAdmin() {
    const container = document.getElementById("admin");
    const adminKey = getAdminKey();

    if (!adminKey) {
        renderAdminSignIn(container, "");
        return;
    }

    container.innerHTML = `<p class="form-hint">Loading orders...</p>`;
    const result = await api.adminListOrders(adminKey);

    if (!result.ok) {
        if (result.unauthorized) {
            setAdminKey(null);
        }
        renderAdminSignIn(container, result.error);
        return;
    }

    desk.orders = result.orders;
    renderDesk(container);
}

function renderAdminSignIn(container, error) {
    container.innerHTML = `
        <section class="account-card sign-in">
            <h2>Order desk</h2>
            <form class="form" id="admin-key-form" novalidate>
                <label for="admin-key">Admin key</label>
                <input id="admin-key" type="password" autocomplete="current-password" required>
                <small class="form-hint">The ADMIN_KEY you stored in the checkout Worker.</small>
                <p class="form-error" role="alert">${escapeHtml(error)}</p>
                <button class="button-primary" type="submit">Open order desk</button>
            </form>
        </section>
    `;
    document.getElementById("admin-key").focus();
}

function renderDesk(container) {
    const filter = deskFilters.find(f => f.id === desk.filter);
    const shown = desk.orders.filter(filter.matches);

    const filterButtons = deskFilters.map(f => `
        <button class="desk-filter ${f.id === desk.filter ? "active" : ""}" type="button" data-desk-filter="${f.id}">
            ${f.label} <span>${desk.orders.filter(f.matches).length}</span>
        </button>
    `).join("");

    container.innerHTML = `
        <div class="desk-toolbar">
            <div class="desk-filters">${filterButtons}</div>
            <div class="desk-actions">
                <button class="button-secondary" type="button" data-action="desk-refresh">Refresh</button>
                <button class="button-secondary" type="button" data-action="desk-lock">Lock</button>
            </div>
        </div>
        ${shown.length === 0
            ? `<p class="form-hint desk-empty">No orders here.</p>`
            : `<ul class="desk-orders">${shown.map(renderDeskOrder).join("")}</ul>`}
    `;
}

function renderDeskOrder(order) {
    const shipping = order.shipping;
    const address = shipping?.address;
    const items = order.items || [];

    const addressBlock = address
        ? `
            <p>
                ${escapeHtml(shipping.name || "")}<br>
                ${escapeHtml(address.line1)}<br>
                ${address.line2 ? escapeHtml(address.line2) + "<br>" : ""}
                ${escapeHtml(address.city)}, ${escapeHtml(address.state)} ${escapeHtml(address.postalCode)}<br>
                ${escapeHtml(address.country)}
            </p>
            <button class="link-button" type="button" data-action="copy-address" data-id="${order.id}">Copy address</button>
        `
        : `<p class="form-hint">Square didn't send a shipping address for this order. Find it in your Square Dashboard under Orders.</p>`;

    const itemRows = items.length === 0
        ? `<li class="form-hint">Item list missing. Check the order in your Square Dashboard.</li>`
        : items.map(item => {
            const link = aliexpressFor(item.id);
            const cjVid = cjVidFor(item.id);
            return `
                <li class="desk-item">
                    <span><strong>${item.quantity} &times;</strong> ${escapeHtml(item.name)}</span>
                    ${cjVid ? `<span class="form-hint">CJ variant ${escapeHtml(cjVid)}</span>` : ""}
                    ${link?.option ? `<span class="form-hint">Pick: ${escapeHtml(link.option)}</span>` : ""}
                    ${link?.url
                        ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">Open on AliExpress</a>`
                        : cjVid ? "" : `<span class="form-hint">Not on CJ and no AliExpress link yet. Add one in js/products.js.</span>`}
                </li>
            `;
        }).join("");

    const steps = Object.entries(FULFILLMENT_LABELS).map(([value, label]) => `
        <option value="${value}" ${order.fulfillment === value ? "selected" : ""}>${label}</option>
    `).join("");

    return `
        <li class="account-card desk-order">
            <div class="order-header">
                <strong>${order.id}</strong>
                <span>${formatDate(order.createdAt)}</span>
                <span class="order-status ${order.status === "paid" ? "order-status-paid" : ""}">${order.status === "paid" ? "Paid" : "Refunded"}</span>
                <strong>${order.total != null ? formatPrice(order.total / 100) : ""}</strong>
            </div>
            ${order.status === "refunded"
                ? `<p class="demo-note">This order was refunded. Don't order it, and cancel it on CJ or AliExpress if you already did.</p>`
                : ""}
            ${renderSupplier(order)}
            <div class="desk-columns">
                <div>
                    <h3>Ship to</h3>
                    ${addressBlock}
                    ${shipping?.phone ? `<p>${escapeHtml(shipping.phone)}</p>` : ""}
                    ${shipping?.email || order.email ? `<p>${escapeHtml(shipping?.email || order.email)}</p>` : ""}
                </div>
                <div>
                    <h3>Items</h3>
                    <ul class="desk-items">${itemRows}</ul>
                </div>
            </div>
            <form class="form desk-form" data-desk-order="${order.id}" novalidate>
                <div class="desk-fields">
                    <label>Step
                        <select name="fulfillment">${steps}</select>
                    </label>
                    <label>CJ or AliExpress order number
                        <input type="text" name="supplierOrderNumber" maxlength="200" value="${escapeHtml(order.supplierOrderNumber || "")}">
                    </label>
                    <label>Carrier
                        <input type="text" name="carrier" maxlength="200" value="${escapeHtml(order.carrier || "")}">
                    </label>
                    <label>Tracking number
                        <input type="text" name="trackingNumber" maxlength="200" value="${escapeHtml(order.trackingNumber || "")}">
                    </label>
                </div>
                <label>Note
                    <input type="text" name="note" maxlength="200" value="${escapeHtml(order.note || "")}">
                </label>
                <p class="form-error" role="alert"></p>
                <p class="form-success"></p>
                <button class="button-primary" type="submit">Save</button>
            </form>
        </li>
    `;
}

// The CJ part of an order: its CJ order, or why it isn't on CJ, and the
// button that sends it there again
function renderSupplier(order) {
    const parts = [];

    if (order.supplierError) {
        parts.push(`<p class="desk-alert" role="alert">${escapeHtml(order.supplierError)}</p>`);
    }

    if (order.supplier === "cj" && order.supplierOrderNumber) {
        const status = CJ_STATUS_LABELS[order.cjStatus] || order.cjStatus || "";
        parts.push(`
            <p class="desk-supplier">
                Sent to CJ${order.cjSandbox ? " (sandbox test, never shipped)" : ""}:
                order <strong>${escapeHtml(order.supplierOrderNumber)}</strong>
                ${status ? ` &middot; ${escapeHtml(status)}` : ""}
                <br><span class="form-hint">Find it in My CJ under Orders by this number or ${escapeHtml(order.id)}.</span>
            </p>
        `);
        if (CJ_UNPAID.includes(order.cjStatus) && !order.cjSandbox) {
            parts.push(`<p class="demo-note">CJ won't ship this until you pay for it in My CJ.</p>`);
        }
    }

    if (order.cjDryRun) {
        parts.push(`
            <details class="desk-dry-run">
                <summary>Order that would go to CJ (dry run)</summary>
                <pre>${escapeHtml(JSON.stringify(order.cjDryRun.request, null, 2))}</pre>
            </details>
        `);
    }

    const canSend = order.status === "paid" && order.fulfillment === "to_order"
        && !(order.supplier === "cj" && order.supplierOrderNumber);
    if (canSend) {
        parts.push(`
            <div class="desk-send">
                <button class="button-secondary" type="button" data-action="send-to-cj" data-id="${order.id}">Send to CJ</button>
                <span class="form-error" role="alert"></span>
            </div>
        `);
    }

    return parts.join("");
}

function cjVidFor(productId) {
    return products.find(p => p.id === productId)?.cj?.vid || "";
}

// Only https links from js/products.js are shown
function aliexpressFor(productId) {
    const link = products.find(p => p.id === productId)?.aliexpress;
    if (!link) {
        return null;
    }
    return {
        url: /^https:\/\//.test(link.url || "") ? link.url : null,
        option: link.option || ""
    };
}

function formatAddress(order) {
    const shipping = order.shipping;
    const address = shipping.address;
    return [
        shipping.name,
        address.line1,
        address.line2,
        `${address.city}, ${address.state} ${address.postalCode}`,
        address.country,
        shipping.phone
    ].filter(Boolean).join("\n");
}

document.addEventListener("submit", async (event) => {
    const form = event.target;

    if (form.id === "admin-key-form") {
        event.preventDefault();
        const key = document.getElementById("admin-key").value.trim();
        if (key) {
            setAdminKey(key);
            renderAdmin();
        }
        return;
    }

    if (form.dataset.deskOrder) {
        event.preventDefault();
        const errorBox = form.querySelector(".form-error");
        const successBox = form.querySelector(".form-success");
        const button = form.querySelector("button[type=submit]");
        const fields = Object.fromEntries(new FormData(form));

        errorBox.textContent = "";
        successBox.textContent = "";
        button.disabled = true;

        const result = await api.adminUpdateOrder(getAdminKey(), form.dataset.deskOrder, fields);
        button.disabled = false;

        if (!result.ok) {
            errorBox.textContent = result.error;
            return;
        }

        // Keep the order where it is until Refresh, so it doesn't jump away
        const index = desk.orders.findIndex(order => order.id === result.order.id);
        desk.orders[index] = result.order;
        successBox.textContent = "Saved.";
    }
});

document.addEventListener("click", async (event) => {
    const filterButton = event.target.closest("[data-desk-filter]");
    if (filterButton) {
        desk.filter = filterButton.dataset.deskFilter;
        renderDesk(document.getElementById("admin"));
        return;
    }

    const action = event.target.closest("[data-action]")?.dataset.action;

    if (action === "desk-refresh") {
        renderAdmin();
    } else if (action === "desk-lock") {
        setAdminKey(null);
        desk.orders = [];
        renderAdmin();
    } else if (action === "send-to-cj") {
        const button = event.target.closest("[data-action]");
        const errorBox = button.parentElement.querySelector(".form-error");
        button.disabled = true;
        button.textContent = "Sending...";
        errorBox.textContent = "";

        const result = await api.adminSendToCj(getAdminKey(), button.dataset.id);
        if (!result.ok) {
            button.disabled = false;
            button.textContent = "Send to CJ";
            errorBox.textContent = result.error;
            return;
        }

        // Redraw just this order, so it stays in view until Refresh
        const index = desk.orders.findIndex(order => order.id === result.order.id);
        desk.orders[index] = result.order;
        button.closest(".desk-order").outerHTML = renderDeskOrder(result.order);
    } else if (action === "copy-address") {
        const button = event.target.closest("[data-action]");
        const order = desk.orders.find(o => o.id === button.dataset.id);
        try {
            await navigator.clipboard.writeText(formatAddress(order));
            button.textContent = "Copied!";
        } catch (error) {
            button.textContent = "Couldn't copy. Select the address instead.";
        }
    }
});
