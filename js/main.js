const tabs = document.querySelectorAll(".tab");
const content = document.getElementById("content");
const placeholderNote = `
    <p class="placeholder-note">This page is a placeholder. The final version will be published before launch.</p>
`;
const pages = {
    home: `
        <section class="hero">
            <h1>Everyday life, uncomplicated.</h1>
            <p>Practical, well-made things for the home, kitchen, and garden, chosen because they make daily life a little easier.</p>
            <button class="hero-button" type="button" data-action="shop">Shop all products</button>
        </section>
        <section class="perks">
            <div class="perk">
                <span class="material-symbols-rounded" aria-hidden="true">verified</span>
                <h3>Picked with care</h3>
                <p>We try every product ourselves before we list it.</p>
            </div>
            <div class="perk">
                <span class="material-symbols-rounded" aria-hidden="true">local_shipping</span>
                <h3>Free shipping</h3>
                <p>Every order ships free, and you'll know when it will arrive before you buy.</p>
            </div>
            <div class="perk">
                <span class="material-symbols-rounded" aria-hidden="true">support_agent</span>
                <h3>Real people, real help</h3>
                <p>Questions? Send us a message and a person will write back.</p>
            </div>
        </section>
        <h2 class="section-title">Popular right now</h2>
        <div class="product-grid" id="product-grid"></div>
        <button class="view-all" type="button" data-action="shop">View all products</button>
    `,

    top: `
        <h1 class="page-header">Top Selling</h1>
        <div class="product-grid" id="product-grid"></div>
    `,

    editors: `
        <h1 class="page-header">Editor's Picks</h1>
        <p>
            W.I.P.
        </p>
    `,

    underrated: `
        <h1 class="page-header">Underrated Items</h1>
        <p>
            W.I.P.
        </p>
    `,

    wip: `
        <h1 class="page-header">W.I.P.</h1>
        <p>
            W.I.P.
        </p>
    `,

    account: `
        <h1 class="page-header">Account</h1>
        <div class="account" id="account"></div>
    `,

    // Private, not linked anywhere; see js/admin.js
    admin: `
        <h1 class="page-header">Order desk</h1>
        <div class="account" id="admin"></div>
    `,

    contact: `
        <h1 class="page-header">Contact Us</h1>
        <form class="contact" id="contact-form" novalidate>
            <p class="form-hint">Questions about an order, or anything else? Send us a message and we'll write back by email, usually within one business day.</p>
            <label for="contact-name">Your name</label>
            <input
                id="contact-name"
                class="contact-name"
                type="text"
                autocomplete="name"
                maxlength="100"
                required
            >
            <label for="contact-email">Your email</label>
            <input
                id="contact-email"
                class="contact-email"
                type="email"
                autocomplete="email"
                maxlength="254"
                required
            >
            <label for="contact-text">Your message</label>
            <textarea
                id="contact-text"
                class="contact-text"
                rows="6"
                maxlength="5000"
                placeholder="If it's about an order, the order number helps (it starts with UNCO-)."
                required
            ></textarea>
            <!-- Hidden from people; bots that fill it in are ignored -->
            <div class="contact-website" aria-hidden="true">
                <label for="contact-website">Website</label>
                <input id="contact-website" name="website" type="text" tabindex="-1" autocomplete="off">
            </div>
            <p class="form-error" id="contact-error" role="alert"></p>
            <p class="form-success" id="contact-success" role="status"></p>
            <button class="contact-submit" type="submit">Send message</button>
        </form>
    `,

    cart: `
        <h1 class="page-header">Your Cart</h1>
        <div class="cart" id="cart"></div>
    `,

    about: `
        <h1 class="page-header">About unco</h1>
        <div class="page-text">
            ${placeholderNote}
            <p>unco is a small online shop for practical, everyday products. Our idea is simple: life is busy enough, so the things you use every day should just work.</p>
            <p>We look for products that solve a real problem, are easy to use, and hold up over time. If it doesn't make life a little less complicated, we don't sell it.</p>
        </div>
    `,

    shipping: `
        <h1 class="page-header">Shipping Policy</h1>
        <div class="page-text">
            ${placeholderNote}
            <p>Shipping is free on every order.</p>
            <p>This page will also explain:</p>
            <ul>
                <li>How long orders take to arrive, by region</li>
                <li>How and when you'll receive tracking information</li>
                <li>What to do if a package is late or lost</li>
            </ul>
        </div>
    `,

    returns: `
        <h1 class="page-header">Returns &amp; Refunds</h1>
        <div class="page-text">
            ${placeholderNote}
            <p>This page will explain:</p>
            <ul>
                <li>How many days you have to request a return or refund</li>
                <li>Which items can be returned, and in what condition</li>
                <li>What happens if an item arrives damaged or not as described</li>
                <li>How to start a return and how long refunds take</li>
            </ul>
        </div>
    `,

    privacy: `
        <h1 class="page-header">Privacy Policy</h1>
        <div class="page-text">
            ${placeholderNote}
            <p>This page will explain:</p>
            <ul>
                <li>What information we collect, such as your email and shipping address</li>
                <li>How we use it, and which services we share it with to fulfill orders</li>
                <li>How long we keep it and how to ask us to delete it</li>
                <li>How we use cookies and advertising tools</li>
            </ul>
        </div>
    `,

    "thank-you": `
        <div class="cart" id="thank-you"></div>
    `,

    terms: `
        <h1 class="page-header">Terms of Service</h1>
        <div class="page-text">
            ${placeholderNote}
            <p>This page will explain the rules for using this site and buying from unco, including pricing, payments, and our responsibilities to you.</p>
        </div>
    `,
}

// Runs after a page's HTML is on screen
const pageSetup = {
    home: () => renderProducts(products.slice(0, 8)),
    top: () => renderProducts(products.filter(p => p.name.toLowerCase().includes(searchQuery))),
    cart: () => renderCart(),
    account: () => renderAccount(),
    admin: () => renderAdmin(),
    "thank-you": () => renderThankYou(),
};

const CART_KEY = "unco-cart";
const PENDING_ORDER_KEY = "unco-pending-order";

// New York State sales tax, shown in the cart. Square charges it at checkout
// from TAX_PERCENTAGE in worker/wrangler.toml; keep the two in sync.
const TAX_PERCENT = 4;

// How long the thank-you page waits for Square to confirm a payment
const STATUS_CHECKS = 10;
const STATUS_CHECK_DELAY_MS = 3000;

const cart = loadCart();
let searchQuery = "";

tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        searchQuery = "";
        showPage(tab.dataset.page);
    });
});

window.addEventListener("hashchange", renderCurrentPage);

renderCurrentPage();
updateCartCount();

// Pages live in the URL (#cart, #account...) so links and the Back button work
function showPage(page) {
    if (location.hash === "#" + page) {
        renderCurrentPage();
    } else {
        location.hash = page;
    }
}

function renderCurrentPage() {
    let page = location.hash.slice(1);
    if (!pages[page]) {
        page = "home";
    }

    tabs.forEach(t => {
        t.classList.toggle("active", t.dataset.page === page);
    });

    content.innerHTML = pages[page];
    if (pageSetup[page]) {
        pageSetup[page]();
    }
    window.scrollTo(0, 0);
}

document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
        return;
    }

    if (button.classList.contains("addtocart")) {
        addToCart(Number(button.dataset.id));

        button.textContent = "Added!";
        setTimeout(() => {
            button.textContent = "Add to Cart";
        }, 1000);
    }

    if (button.dataset.action === "increase") {
        changeQuantity(Number(button.dataset.id), 1);
    }
    if (button.dataset.action === "decrease") {
        changeQuantity(Number(button.dataset.id), -1);
    }
    if (button.dataset.action === "remove") {
        changeQuantity(Number(button.dataset.id), -Infinity);
    }
    if (button.dataset.action === "shop") {
        searchQuery = "";
        showPage("top");
    }
    if (button.dataset.action === "checkout") {
        startCheckout();
    }
});

document.addEventListener("submit", (event) => {
    if (event.target.id === "checkout-email-form") {
        event.preventDefault();
        finishCheckout(document.getElementById("checkout-email").value);
    }
    if (event.target.id === "contact-form") {
        event.preventDefault();
        sendContactMessage();
    }
});

async function sendContactMessage() {
    const form = document.getElementById("contact-form");
    const errorBox = document.getElementById("contact-error");
    const successBox = document.getElementById("contact-success");
    const button = form.querySelector(".contact-submit");

    errorBox.textContent = "";
    successBox.textContent = "";
    button.disabled = true;
    button.textContent = "Sending...";

    const result = await api.sendContactMessage({
        name: document.getElementById("contact-name").value,
        email: document.getElementById("contact-email").value,
        message: document.getElementById("contact-text").value,
        website: document.getElementById("contact-website").value
    });

    button.disabled = false;
    button.textContent = "Send message";

    if (!result.ok) {
        errorBox.textContent = result.error;
        return;
    }

    form.reset();
    successBox.textContent = result.demo
        ? "Demo mode: messages aren't sent anywhere yet. Once the site is connected, this will reach us by email."
        : "Thank you! Your message is on its way. We'll write back to you by email, usually within one business day.";
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

function formatPrice(amount) {
    return "$" + amount.toFixed(2);
}

// Rounded to the cent the same way Square rounds it
function calculateTax(subtotal) {
    const cents = Math.round(subtotal * 100);
    return Math.round(cents * TAX_PERCENT / 100) / 100;
}

function formatDate(iso) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ------------------------- */
/*           cart            */
/* ------------------------- */

function loadCart() {
    try {
        const saved = JSON.parse(localStorage.getItem(CART_KEY));
        if (Array.isArray(saved)) {
            return saved.filter(item => products.some(p => p.id === item.id));
        }
    } catch (error) {
        // Storage unavailable or corrupted; start with an empty cart
    }
    return [];
}

function saveCart() {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (error) {
        // Storage unavailable; the cart still works for this visit
    }
}

function addToCart(id) {
    const item = cart.find(i => i.id === id);

    if (item) {
        item.quantity++;
    } else {
        cart.push({ id: id, quantity: 1 });
    }

    saveCart();
    updateCartCount();
}

function changeQuantity(id, amount) {
    const index = cart.findIndex(i => i.id === id);
    if (index === -1) {
        return;
    }

    cart[index].quantity += amount;
    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    }

    saveCart();
    updateCartCount();
    renderCart();
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const cartTab = document.querySelector('.tab[data-page="cart"]');

    cartTab.textContent = count > 0 ? `Cart (${count})` : "Cart";
}

function renderCart() {
    const container = document.getElementById("cart");
    if (!container) {
        return;
    }

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                <p>Your cart is empty.</p>
                <button class="cart-shop" type="button" data-action="shop">Keep shopping</button>
            </div>
        `;
        return;
    }

    const subtotal = cart.reduce((sum, item) => {
        const product = products.find(p => p.id === item.id);
        return sum + product.price * item.quantity;
    }, 0);
    const tax = calculateTax(subtotal);

    const rows = cart.map(item => {
        const product = products.find(p => p.id === item.id);

        return `
            <li class="cart-item">
                <div class="product-image cart-item-image">
                    <img src="${product.image}" alt="${product.name}" onerror="this.remove()">
                </div>
                <div class="cart-item-info">
                    <h3>${product.name}</h3>
                    <p>${formatPrice(product.price)} each</p>
                    <button class="cart-remove" type="button" data-action="remove" data-id="${product.id}">Remove</button>
                </div>
                <div class="cart-quantity">
                    <button type="button" data-action="decrease" data-id="${product.id}" aria-label="Decrease quantity">&minus;</button>
                    <span>${item.quantity}</span>
                    <button type="button" data-action="increase" data-id="${product.id}" aria-label="Increase quantity">+</button>
                </div>
                <p class="cart-item-total">${formatPrice(product.price * item.quantity)}</p>
            </li>
        `;
    }).join("");

    container.innerHTML = `
        <ul class="cart-items">${rows}</ul>
        <aside class="cart-summary">
            <h2>Order Summary</h2>
            <div class="summary-row">
                <span>Subtotal</span>
                <span>${formatPrice(subtotal)}</span>
            </div>
            <div class="summary-row">
                <span>Shipping</span>
                <span class="summary-free">Free</span>
            </div>
            <div class="summary-row">
                <span>NY State sales tax (${TAX_PERCENT}%)</span>
                <span>${formatPrice(tax)}</span>
            </div>
            <div class="summary-row summary-total">
                <span>Total</span>
                <span>${formatPrice(subtotal + tax)}</span>
            </div>
            <div class="checkout-box" id="checkout-box">
                <button class="checkout" type="button" data-action="checkout">Proceed to Checkout</button>
                <p class="form-error" id="checkout-error" role="alert"></p>
            </div>
            <p class="summary-note">Free shipping on every order. You'll pay on Square's secure checkout page.</p>
        </aside>
    `;
}

/* ------------------------- */
/*         checkout          */
/* ------------------------- */

// Every order is tied to an email: signed-in shoppers use their account's,
// guests are asked for one so the order can be found again later
async function startCheckout() {
    const session = await api.getSession();
    if (session) {
        finishCheckout(session.email);
        return;
    }

    document.getElementById("checkout-box").innerHTML = `
        <form class="checkout-email" id="checkout-email-form" novalidate>
            <label for="checkout-email">Email for your receipt and order updates</label>
            <input id="checkout-email" type="email" autocomplete="email" placeholder="you@example.com" required>
            <p class="form-error" id="checkout-error" role="alert"></p>
            <button class="checkout" type="submit">Continue to Payment</button>
            <p class="summary-note">
                Have an account? <a href="#account">Sign in</a>.
                If you create one later with this email, this order will appear in it.
            </p>
        </form>
    `;
    document.getElementById("checkout-email").focus();
}

async function finishCheckout(email) {
    const errorBox = document.getElementById("checkout-error");
    const button = document.querySelector("#checkout-box .checkout");

    errorBox.textContent = "";
    if (!api.isValidEmail(email)) {
        errorBox.textContent = "Please enter a valid email address.";
        return;
    }

    if (!DEMO_MODE) {
        button.disabled = true;
        button.textContent = "Opening secure checkout...";

        // The Worker gives the order its number and links it to this email
        const checkout = await api.createCheckout(email, cart);
        if (!checkout.ok) {
            errorBox.textContent = checkout.error;
            button.disabled = false;
            button.textContent = "Try Again";
            return;
        }

        // The cart is emptied when Square sends the shopper back to #thank-you
        try {
            localStorage.setItem(PENDING_ORDER_KEY, checkout.orderId);
        } catch (error) {
            // Storage unavailable; the cart just won't empty itself afterwards
        }
        location.href = checkout.url;
        return;
    }

    const result = await api.placeOrder(email, cart);
    if (!result.ok) {
        errorBox.textContent = result.error;
        return;
    }

    const order = result.order;

    const session = await api.getSession();

    cart.length = 0;
    saveCart();
    updateCartCount();

    document.getElementById("cart").innerHTML = `
        <div class="order-confirmation">
            <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
            <h2>Order ${order.id} saved</h2>
            <p>We'll send updates about this order to <strong>${escapeHtml(order.email)}</strong>.</p>
            ${DEMO_MODE ? `<p class="demo-note">Demo mode: Square checkout will open here once it's connected. No payment was taken.</p>` : ""}
            ${session
                ? `<a class="button-link" href="#account">View your order history</a>`
                : `<p>Create an account with this email to see this order anytime.</p>
                   <a class="button-link" href="#account">Create an account</a>`}
        </div>
    `;
}

// Square sends shoppers here after paying, with ?order=<our order id>
function renderThankYou() {
    const orderId = new URLSearchParams(location.search).get("order") || "";
    let pending = null;

    try {
        pending = localStorage.getItem(PENDING_ORDER_KEY);
    } catch (error) {
        // Storage unavailable; leave the cart as it is
    }

    if (orderId && orderId === pending) {
        cart.length = 0;
        saveCart();
        updateCartCount();
        try {
            localStorage.removeItem(PENDING_ORDER_KEY);
        } catch (error) {
            // Storage unavailable; nothing to clear
        }
    }

    document.getElementById("thank-you").innerHTML = `
        <div class="order-confirmation">
            <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
            <h2>Thank you for your order!</h2>
            ${orderId ? `<p>Your order number is <strong>${escapeHtml(orderId)}</strong>.</p>` : ""}
            <p class="payment-status" id="payment-status" role="status"></p>
            <p>Square will email your receipt. We'll email you again when your order ships.</p>
            <a class="button-link" href="#home">Back to the shop</a>
        </div>
    `;

    if (orderId && !DEMO_MODE) {
        showPaymentStatus(orderId);
    }
}

// Square confirms the payment to our Worker a few seconds after the shopper
// pays, so the page checks a few times before giving up
async function showPaymentStatus(orderId) {
    const box = document.getElementById("payment-status");
    box.className = "payment-status payment-status-waiting";
    box.textContent = "Confirming your payment with Square...";

    for (let check = 0; check < STATUS_CHECKS; check++) {
        const statuses = await api.getOrderStatuses([orderId]);
        const status = statuses[orderId];

        // The shopper left the page while we were checking
        if (!document.body.contains(box)) {
            return;
        }

        if (status === "paid") {
            box.className = "payment-status payment-status-paid";
            box.textContent = "Payment confirmed.";
            return;
        }
        if (status === "payment_failed") {
            box.className = "payment-status payment-status-problem";
            box.textContent = "Your payment didn't go through. You haven't been charged. Please place your order again.";
            return;
        }

        await new Promise(resolve => setTimeout(resolve, STATUS_CHECK_DELAY_MS));
    }

    box.className = "payment-status";
    box.textContent = "Your payment is still being confirmed. Square will email your receipt once it goes through.";
}

/* ------------------------- */
/*         products          */
/* ------------------------- */

function search() {
    searchQuery = document.getElementById("search").value.trim().toLowerCase();
    showPage("top");
}

document.getElementById("search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        search();
    }
});

function renderProducts(list = products) {
    const grid = document.getElementById("product-grid");

    if (list.length === 0) {
        grid.innerHTML = `<p class="no-results">No products match your search.</p>`;
        return;
    }

    list.forEach(product => {
        grid.innerHTML += `
            <div class="product-card">
                <div class="product-image">
                    <img src="${product.image}" alt="${product.name}" onerror="this.remove()">
                </div>
                <h3>${product.name}</h3>
                <p>${formatPrice(product.price)}</p>
                <button class="addtocart" type="button" data-id="${product.id}">Add to Cart</button>
            </div>
        `;
    });
}
