/* ------------------------- */
/*          site API         */
/* ------------------------- */

// Everything the site asks of a server goes through `api`. With WORKER_URL
// set, that's the Worker in worker/: real accounts with emailed codes,
// Square checkout and order history. With it empty, a demo stands in that
// keeps accounts and orders in this browser and shows codes on screen. The
// demo is NOT secure and is only for trying the site.

// The Worker's address (see worker/README.md). Local testing: "http://localhost:8787"
const WORKER_URL = "";
const DEMO_MODE = !WORKER_URL;

const MIN_PASSWORD_LENGTH = 8;
const SESSION_TOKEN_KEY = "unco-session-token";

// Labels for order statuses
const ORDER_STATUS_LABELS = {
    awaiting_payment: "Awaiting payment",
    payment_failed: "Payment failed",
    paid: "Paid",
    shipped: "Shipped",
    refunded: "Refunded"
};

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ------------------------- */
/*          Worker           */
/* ------------------------- */

// Sends body as a POST, or makes a GET when there's none. token goes in the
// Authorization header: a session token, or the order desk's admin key.
async function workerRequest(path, { body, token } = {}) {
    const headers = {};
    if (body) {
        headers["Content-Type"] = "application/json";
    }
    if (token) {
        headers["Authorization"] = "Bearer " + token;
    }

    try {
        const response = await fetch(WORKER_URL + path, body
            ? { method: "POST", headers: headers, body: JSON.stringify(body) }
            : { headers: headers });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return { ok: false, status: response.status, error: data.error || "Something went wrong. Please try again." };
        }
        return { ok: true, ...data };
    } catch (error) {
        return { ok: false, error: "We couldn't reach unco. Please check your connection and try again." };
    }
}

function getSessionToken() {
    try {
        return localStorage.getItem(SESSION_TOKEN_KEY);
    } catch (error) {
        return null;
    }
}

function setSessionToken(token) {
    try {
        if (token) {
            localStorage.setItem(SESSION_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(SESSION_TOKEN_KEY);
        }
    } catch (error) {
        // Storage unavailable; the shopper stays signed in for this page only
    }
}

// A shipped order shows as "Shipped" rather than "Paid"
function withStatusLabel(order) {
    const shown = order.status === "paid" && order.fulfillment === "shipped" ? "shipped" : order.status;
    return { ...order, shownStatus: shown, statusLabel: ORDER_STATUS_LABELS[shown] || shown };
}

// Asked for on almost every page, so one answer is kept until sign-in changes
let sessionRequest = null;

const workerApi = {
    async startSignIn(rawEmail) {
        const email = normalizeEmail(rawEmail);
        if (!isValidEmail(email)) {
            return { ok: false, error: "Please enter a valid email address." };
        }

        const result = await workerRequest("/auth/start", { body: { email: email } });
        return result.ok ? { ok: true, email: email, next: result.next, isNew: result.isNew } : result;
    },

    async sendCode(rawEmail) {
        const email = normalizeEmail(rawEmail);
        const result = await workerRequest("/auth/send-code", { body: { email: email } });
        return result.ok ? { ok: true, email: email, isNew: result.isNew } : result;
    },

    async verifyCode(rawEmail, rawCode) {
        const result = await workerRequest("/auth/verify", {
            body: { email: normalizeEmail(rawEmail), code: String(rawCode || "").trim() }
        });
        if (!result.ok) {
            return result;
        }

        setSessionToken(result.token);
        sessionRequest = null;
        return { ok: true, created: result.created };
    },

    async signInWithPassword(rawEmail, password) {
        const result = await workerRequest("/auth/password", {
            body: { email: normalizeEmail(rawEmail), password: password }
        });
        if (!result.ok) {
            return result;
        }

        setSessionToken(result.token);
        sessionRequest = null;
        return { ok: true };
    },

    async getSession() {
        const token = getSessionToken();
        if (!token) {
            return null;
        }

        if (!sessionRequest) {
            sessionRequest = workerRequest("/auth/session", { token: token }).then(result => {
                if (result.status === 401) {
                    setSessionToken(null);
                }
                if (!result.ok) {
                    sessionRequest = null;
                    return null;
                }
                return { email: result.email, loginMethod: result.loginMethod, createdAt: result.createdAt };
            });
        }
        return sessionRequest;
    },

    async signOut() {
        const token = getSessionToken();
        setSessionToken(null);
        sessionRequest = null;
        if (token) {
            await workerRequest("/auth/sign-out", { body: {}, token: token });
        }
        return { ok: true };
    },

    async setLoginMethod(method, password) {
        const result = await workerRequest("/auth/login-method", {
            body: { method: method, password: password },
            token: getSessionToken()
        });
        sessionRequest = null;
        return result.ok ? { ok: true } : result;
    },

    // Orders are matched by email, so guest orders appear once that email signs up
    async getOrders() {
        const result = await workerRequest("/account/orders", { token: getSessionToken() });
        if (!result.ok) {
            return [];
        }
        return result.orders.map(order => withStatusLabel({ ...order, total: order.total / 100 }));
    }
};

/* ------------------------- */
/*           demo            */
/* ------------------------- */

const DEMO_DB_KEY = "unco-demo-db";
const DEMO_SESSION_KEY = "unco-session";
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function loadDb() {
    try {
        const saved = JSON.parse(localStorage.getItem(DEMO_DB_KEY));
        if (saved && saved.accounts && saved.orders && saved.codes) {
            return saved;
        }
    } catch (error) {
        // Storage unavailable or corrupted; start empty
    }
    return { accounts: {}, orders: [], codes: {} };
}

function saveDb(db) {
    try {
        localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
    } catch (error) {
        // Storage unavailable; changes last only for this visit
    }
}

async function hashPassword(email, password) {
    const bytes = new TextEncoder().encode(email + ":" + password);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

// The demo shows the code on screen instead of emailing it
function issueCode(db, email) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");

    db.codes[email] = {
        code: code,
        expires: Date.now() + CODE_LIFETIME_MS,
        attempts: 0
    };

    return code;
}

function startDemoSession(email) {
    try {
        localStorage.setItem(DEMO_SESSION_KEY, email);
    } catch (error) {
        // Storage unavailable; the user stays signed out
    }
}

function randomOrderId() {
    const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return "UNCO-" + Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

const demoApi = {
    // Step 1 of signing in or signing up: tells the page what to ask for next
    async startSignIn(rawEmail) {
        const email = normalizeEmail(rawEmail);
        if (!isValidEmail(email)) {
            return { ok: false, error: "Please enter a valid email address." };
        }

        const db = loadDb();
        const account = db.accounts[email];

        if (account && account.loginMethod === "password") {
            return { ok: true, email: email, next: "password" };
        }

        const demoCode = issueCode(db, email);
        saveDb(db);

        return { ok: true, email: email, next: "code", isNew: !account, demoCode: demoCode };
    },

    async sendCode(rawEmail) {
        const email = normalizeEmail(rawEmail);
        const db = loadDb();
        const demoCode = issueCode(db, email);
        saveDb(db);

        return { ok: true, email: email, isNew: !db.accounts[email], demoCode: demoCode };
    },

    // Checks a 6-digit code; creates the account if this email is new
    async verifyCode(rawEmail, rawCode) {
        const email = normalizeEmail(rawEmail);
        const code = String(rawCode || "").trim();
        const db = loadDb();
        const pending = db.codes[email];

        if (!pending || Date.now() > pending.expires) {
            delete db.codes[email];
            saveDb(db);
            return { ok: false, error: "That code has expired. Please request a new one." };
        }

        if (pending.attempts >= MAX_CODE_ATTEMPTS) {
            return { ok: false, error: "Too many attempts. Please request a new code." };
        }

        if (code !== pending.code) {
            pending.attempts++;
            saveDb(db);
            return { ok: false, error: "That code isn't right. Please check it and try again." };
        }

        delete db.codes[email];

        const created = !db.accounts[email];
        if (created) {
            db.accounts[email] = {
                email: email,
                loginMethod: "email-code",
                passwordHash: null,
                createdAt: new Date().toISOString()
            };
        }

        saveDb(db);
        startDemoSession(email);

        return { ok: true, created: created };
    },

    async signInWithPassword(rawEmail, password) {
        const email = normalizeEmail(rawEmail);
        const db = loadDb();
        const account = db.accounts[email];

        if (!account || account.loginMethod !== "password" ||
            account.passwordHash !== await hashPassword(email, password)) {
            return { ok: false, error: "That email and password don't match." };
        }

        startDemoSession(email);
        return { ok: true };
    },

    async getSession() {
        let email = null;
        try {
            email = localStorage.getItem(DEMO_SESSION_KEY);
        } catch (error) {
            return null;
        }

        const account = email ? loadDb().accounts[email] : null;
        return account ? { email: account.email, loginMethod: account.loginMethod, createdAt: account.createdAt } : null;
    },

    async signOut() {
        try {
            localStorage.removeItem(DEMO_SESSION_KEY);
        } catch (error) {
            // Storage unavailable; nothing to clear
        }
        return { ok: true };
    },

    async setLoginMethod(method, password) {
        const session = await this.getSession();
        if (!session) {
            return { ok: false, error: "Please sign in again." };
        }

        const db = loadDb();
        const account = db.accounts[session.email];

        if (method === "password") {
            if (!password && account.loginMethod === "password") {
                return { ok: true };
            }
            if (!password || password.length < MIN_PASSWORD_LENGTH) {
                return { ok: false, error: `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.` };
            }
            account.loginMethod = "password";
            account.passwordHash = await hashPassword(session.email, password);
        } else {
            account.loginMethod = "email-code";
            account.passwordHash = null;
        }

        saveDb(db);
        return { ok: true };
    },

    // Records an order under an email, whether or not that email has an account
    async placeOrder(rawEmail, items) {
        const email = normalizeEmail(rawEmail);
        if (!isValidEmail(email)) {
            return { ok: false, error: "Please enter a valid email address." };
        }

        const lines = items.map(item => {
            const product = products.find(p => p.id === item.id);
            return { id: product.id, name: product.name, price: product.price, quantity: item.quantity };
        });

        const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
        const order = {
            id: randomOrderId(),
            email: email,
            date: new Date().toISOString(),
            items: lines,
            subtotal: subtotal,
            total: subtotal + calculateTax(subtotal),
            status: "awaiting_payment"
        };

        const db = loadDb();
        db.orders.push(order);
        saveDb(db);

        return { ok: true, order: order };
    },

    async getOrders() {
        const session = await this.getSession();
        if (!session) {
            return [];
        }

        return loadDb().orders
            .filter(order => order.email === session.email)
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(withStatusLabel);
    }
};

/* ------------------------- */
/*     checkout and admin    */
/* ------------------------- */

const api = {
    ...(DEMO_MODE ? demoApi : workerApi),

    isValidEmail(rawEmail) {
        return isValidEmail(normalizeEmail(rawEmail));
    },

    // Asks the Worker for a Square checkout page. Only ids and quantities are
    // sent; the Worker looks up the prices and gives the order its number.
    async createCheckout(email, items) {
        const result = await workerRequest("/checkout", {
            body: {
                email: email,
                items: items.map(item => ({ id: item.id, quantity: item.quantity }))
            }
        });

        if (!result.ok || !result.checkoutUrl || !result.orderId) {
            return { ok: false, error: result.error || "We couldn't start checkout. Please try again." };
        }
        return { ok: true, url: result.checkoutUrl, orderId: result.orderId };
    },

    // The contact form. website is the hidden field only bots fill in.
    async sendContactMessage({ name, email, message, website }) {
        name = String(name || "").trim();
        email = normalizeEmail(email);
        message = String(message || "").trim();

        if (!name) {
            return { ok: false, error: "Please enter your name." };
        }
        if (!isValidEmail(email)) {
            return { ok: false, error: "Please enter a valid email address so we can write back." };
        }
        if (!message) {
            return { ok: false, error: "Please write your message." };
        }
        if (DEMO_MODE) {
            return { ok: true, demo: true };
        }

        const result = await workerRequest("/contact", {
            body: { name: name, email: email, message: message, website: website || "" }
        });
        return result.ok ? { ok: true } : result;
    },

    // Asks the Worker which orders Square has confirmed as paid.
    // Returns { orderId: status }; orders it can't check are left out.
    async getOrderStatuses(orderIds) {
        if (DEMO_MODE || orderIds.length === 0) {
            return {};
        }

        const result = await workerRequest("/orders/status?ids=" + orderIds.map(encodeURIComponent).join(","));
        return result.ok && result.statuses ? result.statuses : {};
    },

    // The order desk's list of paid orders, with shipping addresses.
    // The Worker only answers when given the ADMIN_KEY secret.
    async adminListOrders(adminKey) {
        return adminRequest(adminKey, "/admin/orders");
    },

    async adminUpdateOrder(adminKey, orderId, fields) {
        return adminRequest(adminKey, "/admin/orders/" + encodeURIComponent(orderId), fields);
    }
};

async function adminRequest(adminKey, path, fields) {
    if (DEMO_MODE) {
        return { ok: false, error: "The order desk needs the Worker. Set WORKER_URL in js/api.js." };
    }

    const result = await workerRequest(path, { body: fields, token: adminKey });
    return result.ok ? result : { ...result, unauthorized: result.status === 401 };
}
