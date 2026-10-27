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
        <div class="contact">
            <input
                id="contact-name"
                class="contact-name"
                type="text"
                placeholder="name"
            >
            <input
                id="contact-email"
                class="contact-email"
                type="email"
                placeholder="email"
            >
            <textarea
                id="contact-text"
                class="contact-text"
                rows="6"
                placeholder="textbox"
            ></textarea>
            <button class="contact-submit" type="button">submit</button>
        </div>
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
            <p class="page-updated">Last updated: October 27, 2026</p>

            <h2>Shipping is free</h2>
            <p>Every order ships free. There's no minimum and no extra charge at checkout. New York State sales tax (4%) is added to your total when you pay.</p>

            <h2>How long delivery takes</h2>
            <p>Our products are shipped by our supplier partner from one of two places:</p>
            <ul>
                <li><strong>US warehouse:</strong> usually arrives in 3 to 7 business days.</li>
                <li><strong>Overseas warehouse:</strong> usually arrives in 7 to 15 business days.</li>
            </ul>
            <p>Business days are Monday to Friday, not counting holidays. These are estimates, not guarantees. Carriers can be slower around holidays or in bad weather.</p>

            <h2>Tracking your order</h2>
            <p>When your order ships, its tracking number appears in your order history. To see it, open <a href="#account">Account</a> and sign in with the email you used at checkout.</p>
            <p>Tracking can take a day or two to start showing updates after the number first appears.</p>

            <h2>If your package is late or missing</h2>
            <p>If your order hasn't arrived by the end of its delivery estimate, email us at <a href="mailto:support@shopunco.com">support@shopunco.com</a> with your order number. We'll check with the carrier and, if the package is lost, send a replacement or give you a full refund.</p>
            <p>Please double-check your shipping address on the checkout page. If you notice a mistake after ordering, email us right away and we'll do our best to fix it before it ships.</p>

            <h2>Who ships your order</h2>
            <p>unco works with a supplier partner, CJdropshipping, who packs and ships orders for us. That's why items in one order may arrive in separate packages, on different days.</p>
        </div>
    `,

    returns: `
        <h1 class="page-header">Returns &amp; Refunds</h1>
        <div class="page-text">
            <p class="page-updated">Last updated: October 27, 2026</p>

            <h2>The short version</h2>
            <ul>
                <li>Changed your mind? You can return unused items within <strong>30 days</strong> of delivery.</li>
                <li>Arrived damaged, broken or wrong? Send us a photo within <strong>14 days</strong> and we'll send a free replacement or give you a full refund. You won't need to send it back.</li>
            </ul>

            <h2>Returning an item you don't want</h2>
            <p>If you're not happy with something, you can return it within 30 days of the day it was delivered. The item should be unused and in its original packaging.</p>
            <p>Here's how:</p>
            <ol>
                <li>Email <a href="mailto:support@shopunco.com">support@shopunco.com</a> with your order number and the item you'd like to return.</li>
                <li>We'll reply with the return address and any instructions. Please don't send items back before you hear from us, because returns sent to the wrong address can get lost.</li>
                <li>Pack the item and mail it back. For these returns, you pay the return postage. We suggest a trackable service.</li>
            </ol>
            <p>Once the item reaches us, we'll refund the full price of the item, including the sales tax you paid on it.</p>

            <h2>Damaged, broken or wrong items</h2>
            <p>If something arrives damaged, doesn't work, or isn't what you ordered, that's our mistake to fix, not yours.</p>
            <ol>
                <li>Within 14 days of delivery, email <a href="mailto:support@shopunco.com">support@shopunco.com</a> with your order number and a photo of the problem.</li>
                <li>Tell us whether you'd like a free replacement or a full refund.</li>
            </ol>
            <p>In most cases you won't need to send the item back. If we do need it back, we'll pay the return postage.</p>

            <h2>When you'll get your money</h2>
            <p>Refunds go back to the card or payment method you used at checkout. We'll email you when we send the refund. After that, your bank may take up to 10 business days to show it on your statement.</p>

            <h2>Questions</h2>
            <p>If anything here is unclear, or your situation doesn't fit, just email us at <a href="mailto:support@shopunco.com">support@shopunco.com</a>. A real person will read it and write back.</p>
        </div>
    `,

    privacy: `
        <h1 class="page-header">Privacy Policy</h1>
        <div class="page-text">
            <p class="page-updated">Last updated: October 27, 2026</p>
            <p>This page explains what information unco collects when you use shopunco.com, why we need it, and who else handles it. We only collect what we need to sell you products and get them to you. We don't sell your information.</p>

            <h2>What we collect</h2>
            <ul>
                <li><strong>Your email address,</strong> so you can sign in to your account and we can reach you about your order.</li>
                <li><strong>Your name, shipping address and phone number</strong> (if you give one), so your order can be delivered.</li>
                <li><strong>Your order details,</strong> such as what you bought, what you paid, and your tracking number.</li>
                <li><strong>Messages you send us,</strong> so we can answer them.</li>
                <li><strong>A password,</strong> only if you choose to set one. We store it in a scrambled (hashed) form, never as plain text.</li>
            </ul>

            <h2>What we don't collect</h2>
            <p>We never see or store your card number. When you pay, you're taken to Square's secure checkout page, and Square handles your payment details directly.</p>

            <h2>Who else handles your information</h2>
            <p>We use a few trusted services to run the shop. Each one only gets what it needs to do its job:</p>
            <ul>
                <li><strong>Square</strong> processes your payment and collects your shipping address at checkout.</li>
                <li><strong>CJdropshipping,</strong> our supplier partner, receives your name, shipping address and phone number so they can pack and ship your order.</li>
                <li><strong>Shipping carriers</strong> (such as USPS or UPS) receive your name and address to deliver your package.</li>
                <li><strong>Cloudflare</strong> runs our website's behind-the-scenes systems, which store your account, order details and shipping address.</li>
                <li><strong>Resend</strong> sends our emails, such as your sign-in codes.</li>
            </ul>
            <p>We may also share information if the law requires it, or to prevent fraud.</p>

            <h2>Cookies and your browser</h2>
            <p>We don't use tracking cookies. Our site saves a few small things in your own web browser (called "local storage"), such as what's in your cart and whether you're signed in. This stays on your device, and you can clear it at any time in your browser's settings.</p>
            <p>We don't currently use advertising or tracking tools on this site. If we add one in the future, such as the Facebook (Meta) Pixel to measure how our ads perform, we'll update this page to explain it before we turn it on.</p>

            <h2>How long we keep it</h2>
            <p>We keep your account and order information for as long as your account is open, and as long as we need it for returns, customer service, and tax and accounting records.</p>

            <h2>Your choices</h2>
            <p>You can ask us to show you, correct, or delete the information we have about you. Just email <a href="mailto:support@shopunco.com">support@shopunco.com</a> from the email address on your account. We may need to keep some order records for tax or legal reasons, and we'll tell you if that's the case.</p>

            <h2>Children</h2>
            <p>Our shop is meant for adults. We don't knowingly collect information from children under 13.</p>

            <h2>Changes to this policy</h2>
            <p>If we change this policy, we'll update this page and the "Last updated" date at the top.</p>

            <h2>Contact us</h2>
            <p>Questions about your privacy? Email <a href="mailto:support@shopunco.com">support@shopunco.com</a>.</p>
        </div>
    `,

    "thank-you": `
        <div class="cart" id="thank-you"></div>
    `,

    terms: `
        <h1 class="page-header">Terms of Service</h1>
        <div class="page-text">
            <p class="page-updated">Last updated: October 27, 2026</p>
            <p>These terms are the rules for using shopunco.com and buying from unco. We've tried to keep them short and clear. By using the site or placing an order, you agree to them.</p>

            <h2>Who we are</h2>
            <p>shopunco.com is run by unco, a small business based in New York. You can reach us at <a href="mailto:support@shopunco.com">support@shopunco.com</a>.</p>

            <h2>Prices and payment</h2>
            <ul>
                <li>All prices are in US dollars.</li>
                <li>Shipping is free on every order.</li>
                <li>New York State sales tax (4%) is added at checkout. You'll see the full total before you pay.</li>
                <li>Payments are handled by Square on Square's own secure checkout page. We never see or store your card number.</li>
            </ul>
            <p>We work hard to keep prices and product details correct. If we make a mistake, such as listing the wrong price, we'll contact you before shipping and you can choose to cancel for a full refund.</p>

            <h2>Your order</h2>
            <p>Your order is confirmed once your payment goes through. Orders are packed and shipped by our supplier partner, CJdropshipping. Delivery times are explained on our <a href="#shipping">Shipping Policy</a> page.</p>
            <p>If an item turns out to be unavailable after you order, we'll let you know and give you a full refund for it.</p>

            <h2>Returns and refunds</h2>
            <p>You can return unused items within 30 days, and we'll replace or refund anything that arrives damaged or wrong. The details are on our <a href="#returns">Returns &amp; Refunds</a> page.</p>

            <h2>Your account</h2>
            <p>You can sign in with a code we email to you, or with a password if you choose to set one. Please keep access to your email account safe, since anyone who can read your email could sign in. Let us know right away if you think someone else has used your account.</p>

            <h2>Using the site</h2>
            <p>Please use the site only for shopping and normal personal use. Don't try to break, overload or misuse it, or place orders with someone else's payment details. We may cancel orders or close accounts that are used for fraud or abuse.</p>
            <p>The text, photos and design on this site belong to unco or to the people who license them to us. Please don't copy them for commercial use without asking.</p>

            <h2>Our responsibility to you</h2>
            <p>We stand behind what we sell, as described on our Shipping and Returns pages. Please use each product as its instructions describe.</p>
            <p>As far as the law allows, our total responsibility for any problem with an order is limited to the amount you paid for that order. Nothing in these terms takes away any rights you have under consumer protection laws.</p>

            <h2>The law that applies</h2>
            <p>These terms are governed by the laws of the State of New York.</p>

            <h2>Changes to these terms</h2>
            <p>We may update these terms from time to time. When we do, we'll change the "Last updated" date at the top. The terms in place when you placed your order apply to that order.</p>

            <h2>Questions</h2>
            <p>Email us at <a href="mailto:support@shopunco.com">support@shopunco.com</a> and a real person will write back.</p>
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
});

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
