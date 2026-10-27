/* ------------------------- */
/*        order desk         */
/* ------------------------- */

// The private #admin page: every paid order with its shipping address and
// AliExpress links, so you can place it on AliExpress and record tracking.
// It isn't linked anywhere. The orders come from the checkout Worker, which
// only hands them over with the ADMIN_KEY secret; the key is kept for this
// browser tab only.

const ADMIN_KEY_STORAGE = "unco-admin-key";

const FULFILLMENT_LABELS = {
    to_order: "To order",
    ordered: "Ordered on AliExpress",
    shipped: "Shipped"
};

const deskFilters = [
    { id: "to_order", label: "To order", matches: order => order.status === "paid" && order.fulfillment === "to_order" },
    { id: "ordered", label: "Ordered", matches: order => order.status === "paid" && order.fulfillment === "ordered" },
    { id: "shipped", label: "Shipped", matches: order => order.status === "paid" && order.fulfillment === "shipped" },
    { id: "refunded", label: "Refunded", matches: order => order.status === "refunded" },
    { id: "all", label: "All", matches: () => true }
];

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
            return `
                <li class="desk-item">
                    <span><strong>${item.quantity} &times;</strong> ${escapeHtml(item.name)}</span>
                    ${link?.option ? `<span class="form-hint">Pick: ${escapeHtml(link.option)}</span>` : ""}
                    ${link?.url
                        ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">Open on AliExpress</a>`
                        : `<span class="form-hint">No AliExpress link yet. Add one in js/products.js.</span>`}
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
                ? `<p class="demo-note">This order was refunded. Don't order it, and cancel it on AliExpress if you already did.</p>`
                : ""}
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
                    <label>AliExpress order number
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
