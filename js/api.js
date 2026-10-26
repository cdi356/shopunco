/* ------------------------- */
/*     DEMO account backend  */
/* ------------------------- */

// Everything in this file is a stand-in for a real server. It keeps
// accounts and orders in this browser's localStorage and shows sign-in
// codes on screen instead of emailing them. It is NOT secure and must be
// replaced by real server calls (for example a Cloudflare Worker) before
// launch. Every function returns a Promise so the rest of the site
// won't need to change when it talks to a real server instead.

const DEMO_MODE = true;

// The checkout Worker's address (see worker/README.md). Leave empty to
// keep the demo confirmation instead of opening Square checkout.
// Local testing: "http://localhost:8787"
const CHECKOUT_API_URL = "";

const DB_KEY = "unco-demo-db";
const SESSION_KEY = "unco-session";
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 8;

function loadDb() {
    try {
        const saved = JSON.parse(localStorage.getItem(DB_KEY));
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
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (error) {
        // Storage unavailable; changes last only for this visit
    }
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function hashPassword(email, password) {
    const bytes = new TextEncoder().encode(email + ":" + password);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

function issueCode(db, email) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");

    db.codes[email] = {
        code: code,
        expires: Date.now() + CODE_LIFETIME_MS,
        attempts: 0
    };

    // A real server would email the code here and never return it
    return DEMO_MODE ? code : null;
}

function startSession(email) {
    try {
        localStorage.setItem(SESSION_KEY, email);
    } catch (error) {
        // Storage unavailable; the user stays signed out
    }
}

const api = {
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
        startSession(email);

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

        startSession(email);
        return { ok: true };
    },

    async getSession() {
        let email = null;
        try {
            email = localStorage.getItem(SESSION_KEY);
        } catch (error) {
            return null;
        }

        const account = email ? loadDb().accounts[email] : null;
        return account ? { email: account.email, loginMethod: account.loginMethod, createdAt: account.createdAt } : null;
    },

    async signOut() {
        try {
            localStorage.removeItem(SESSION_KEY);
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

        const order = {
            id: "UNCO-" + Date.now().toString(36).toUpperCase(),
            email: email,
            date: new Date().toISOString(),
            items: lines,
            subtotal: lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
            status: "Awaiting payment"
        };

        const db = loadDb();
        db.orders.push(order);
        saveDb(db);

        return { ok: true, order: order };
    },

    // Real: asks the checkout Worker for a Square checkout page. Only ids and
    // quantities are sent; the Worker looks up the prices itself.
    async createCheckout(email, items, orderId) {
        try {
            const response = await fetch(CHECKOUT_API_URL + "/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: email,
                    orderId: orderId,
                    items: items.map(item => ({ id: item.id, quantity: item.quantity }))
                })
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.checkoutUrl) {
                return { ok: false, error: data.error || "We couldn't start checkout. Please try again." };
            }
            return { ok: true, url: data.checkoutUrl };
        } catch (error) {
            return { ok: false, error: "We couldn't reach checkout. Please check your connection and try again." };
        }
    },

    // Orders are matched by email, so guest orders appear once that email signs up
    async getOrders() {
        const session = await this.getSession();
        if (!session) {
            return [];
        }

        return loadDb().orders
            .filter(order => order.email === session.email)
            .sort((a, b) => b.date.localeCompare(a.date));
    }
};
