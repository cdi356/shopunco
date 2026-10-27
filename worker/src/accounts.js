import { json, sha256Hex, toHex, safeEqual } from "./http.js";
import { sendEmail, trySendEmail, emailLayout, emailParagraph, emailButton } from "./email.js";

// Customer accounts. Shoppers sign in with a 6-digit code sent by email, or
// with a password if they chose one. Accounts, codes and sessions live in
// the ACCOUNTS storage, keyed by lowercase email. Orders are linked to the
// email they were placed with, so guest orders appear once that email signs
// up.

const CODE_LIFETIME_SECONDS = 10 * 60;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const MAX_PASSWORD_FAILURES = 10;
const PASSWORD_LOCKOUT_SECONDS = 15 * 60;
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
// Cloudflare Workers allow at most 100,000 PBKDF2 iterations
const PASSWORD_ITERATIONS = 100000;
// KV entries can't expire sooner than this
const MIN_TTL_SECONDS = 60;

export async function handleAccounts(request, url, env, cors) {
    if (!env.ACCOUNTS || !env.ORDERS) {
        return json({ error: "Accounts aren't set up yet." }, 503, cors);
    }

    const route = request.method + " " + url.pathname;
    const routes = {
        "POST /auth/start": startSignIn,
        "POST /auth/send-code": sendCode,
        "POST /auth/verify": verifyCode,
        "POST /auth/password": signInWithPassword,
        "GET /auth/session": getSession,
        "POST /auth/sign-out": signOut,
        "POST /auth/login-method": setLoginMethod,
        "GET /account/orders": getOrders
    };

    if (!routes[route]) {
        return json({ error: "Not found." }, 404, cors);
    }

    let body = {};
    if (request.method === "POST") {
        try {
            body = await request.json();
        } catch (error) {
            return json({ error: "The request wasn't valid JSON." }, 400, cors);
        }
    }

    const result = await routes[route](env, body, request);
    return json(result.data, result.status || 200, cors);
}

// Called by checkout so the order shows up in that email's account
export async function addOrderToAccount(env, email, orderId) {
    const key = "email-orders:" + normalizeEmail(email);
    const orderIds = await env.ACCOUNTS.get(key, "json") || [];
    orderIds.push(orderId);
    await env.ACCOUNTS.put(key, JSON.stringify(orderIds));
}

/* ------------------------- */
/*          sign in          */
/* ------------------------- */

// Step 1: tells the page whether to ask for a password or a code
async function startSignIn(env, body) {
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
        return fail(400, "Please enter a valid email address.");
    }

    const account = await loadAccount(env, email);
    if (account?.loginMethod === "password") {
        return ok({ next: "password" });
    }

    const sent = await issueCode(env, email, !account);
    return sent.error ? sent : ok({ next: "code", isNew: !account });
}

async function sendCode(env, body) {
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
        return fail(400, "Please enter a valid email address.");
    }

    const account = await loadAccount(env, email);
    const sent = await issueCode(env, email, !account);
    return sent.error ? sent : ok({ isNew: !account });
}

// Only a hash of the code is stored, so reading the storage doesn't reveal it
async function issueCode(env, email, isNew) {
    const sendsKey = "code-sends:" + email;
    const sends = Number(await env.ACCOUNTS.get(sendsKey)) || 0;
    if (sends >= MAX_CODES_PER_HOUR) {
        return fail(429, "We've sent a lot of codes to this email. Please wait an hour and try again.");
    }
    await env.ACCOUNTS.put(sendsKey, String(sends + 1), { expirationTtl: 60 * 60 });

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    await env.ACCOUNTS.put("code:" + email, JSON.stringify({
        codeHash: await sha256Hex(email + ":" + code),
        attempts: 0,
        expiresAt: Date.now() + CODE_LIFETIME_SECONDS * 1000
    }), { expirationTtl: CODE_LIFETIME_SECONDS });

    const sent = await sendEmail(env, {
        to: email,
        subject: `Your unco code is ${code}`,
        text: `Your unco ${isNew ? "sign-up" : "sign-in"} code is ${code}.\n\n` +
            "It expires in 10 minutes. If you didn't ask for this, you can ignore this email.",
        html: emailLayout(
            isNew ? "Welcome to unco" : "Your sign-in code",
            `<p style="margin: 0 0 16px;">Enter this code on the unco website:</p>
             <p style="margin: 0 0 16px; font-size: 32px; font-weight: bold; letter-spacing: 6px;">${code}</p>
             <p style="margin: 0; color: #555;">It expires in 10 minutes. If you didn't ask for this, you can ignore this email.</p>`
        )
    });

    return sent ? ok({}) : fail(502, "We couldn't send the email. Please try again in a minute.");
}

// Checks a code; creates the account if this email is new
async function verifyCode(env, body) {
    const email = normalizeEmail(body.email);
    const code = String(body.code || "").trim();
    const key = "code:" + email;
    const pending = await env.ACCOUNTS.get(key, "json");

    if (!pending || Date.now() > pending.expiresAt) {
        return fail(400, "That code has expired. Please request a new one.");
    }
    if (pending.attempts >= MAX_CODE_ATTEMPTS) {
        return fail(429, "Too many attempts. Please request a new code.");
    }

    if (!safeEqual(await sha256Hex(email + ":" + code), pending.codeHash)) {
        pending.attempts++;
        const ttl = Math.max(MIN_TTL_SECONDS, Math.ceil((pending.expiresAt - Date.now()) / 1000));
        await env.ACCOUNTS.put(key, JSON.stringify(pending), { expirationTtl: ttl });
        return fail(400, "That code isn't right. Please check it and try again.");
    }

    await env.ACCOUNTS.delete(key);

    let account = await loadAccount(env, email);
    const created = !account;
    if (created) {
        account = {
            email: email,
            loginMethod: "email-code",
            passwordHash: null,
            passwordSalt: null,
            createdAt: new Date().toISOString()
        };
        await saveAccount(env, account);
        await trySendEmail(env, welcomeEmail(env, email));
    }

    return ok({ token: await startSession(env, email), created: created });
}

async function signInWithPassword(env, body) {
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const failuresKey = "password-failures:" + email;
    const failures = Number(await env.ACCOUNTS.get(failuresKey)) || 0;

    if (failures >= MAX_PASSWORD_FAILURES) {
        return fail(429, "Too many tries. Please wait 15 minutes, or sign in with an email code instead.");
    }

    const account = await loadAccount(env, email);
    const matches = account?.loginMethod === "password" &&
        password.length <= MAX_PASSWORD_LENGTH &&
        safeEqual(await hashPassword(password, account.passwordSalt), account.passwordHash);

    if (!matches) {
        await env.ACCOUNTS.put(failuresKey, String(failures + 1), { expirationTtl: PASSWORD_LOCKOUT_SECONDS });
        return fail(400, "That email and password don't match.");
    }

    await env.ACCOUNTS.delete(failuresKey);
    return ok({ token: await startSession(env, email) });
}

/* ------------------------- */
/*         sessions          */
/* ------------------------- */

// The browser keeps the token; only its hash is stored here
async function startSession(env, email) {
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    await env.ACCOUNTS.put("session:" + await sha256Hex(token), JSON.stringify({
        email: email,
        createdAt: new Date().toISOString()
    }), { expirationTtl: SESSION_LIFETIME_SECONDS });
    return token;
}

// Returns the signed-in account, or null
async function accountFromRequest(env, request) {
    const header = request.headers.get("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!/^[0-9a-f]{64}$/.test(token)) {
        return null;
    }

    const session = await env.ACCOUNTS.get("session:" + await sha256Hex(token), "json");
    return session ? loadAccount(env, session.email) : null;
}

async function getSession(env, body, request) {
    const account = await accountFromRequest(env, request);
    if (!account) {
        return fail(401, "Please sign in again.");
    }
    return ok({ email: account.email, loginMethod: account.loginMethod, createdAt: account.createdAt });
}

async function signOut(env, body, request) {
    const header = request.headers.get("Authorization") || "";
    if (header.startsWith("Bearer ")) {
        await env.ACCOUNTS.delete("session:" + await sha256Hex(header.slice(7)));
    }
    return ok({});
}

/* ------------------------- */
/*          account          */
/* ------------------------- */

async function setLoginMethod(env, body, request) {
    const account = await accountFromRequest(env, request);
    if (!account) {
        return fail(401, "Please sign in again.");
    }

    // What changed, for the security email; null when nothing did
    let change = null;
    if (body.method === "password") {
        const password = String(body.password || "");
        // Already on password with no new one typed: keep the current one
        if (!password && account.loginMethod === "password") {
            return ok({});
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
            return fail(400, `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
        }
        if (password.length > MAX_PASSWORD_LENGTH) {
            return fail(400, "That password is too long.");
        }
        change = account.loginMethod === "password" ? "password-changed" : "password-set";
        account.loginMethod = "password";
        account.passwordSalt = toHex(crypto.getRandomValues(new Uint8Array(16)));
        account.passwordHash = await hashPassword(password, account.passwordSalt);
    } else if (body.method === "email-code") {
        change = account.loginMethod === "email-code" ? null : "email-code";
        account.loginMethod = "email-code";
        account.passwordHash = null;
        account.passwordSalt = null;
    } else {
        return fail(400, "Unknown sign-in method.");
    }

    await saveAccount(env, account);
    if (change) {
        await trySendEmail(env, securityEmail(env, account.email, change));
    }
    return ok({});
}

// Orders still waiting for payment are abandoned checkouts, so they're left out
async function getOrders(env, body, request) {
    const account = await accountFromRequest(env, request);
    if (!account) {
        return fail(401, "Please sign in again.");
    }

    const orderIds = await env.ACCOUNTS.get("email-orders:" + account.email, "json") || [];
    const orders = (await Promise.all(orderIds.map(id => env.ORDERS.get("order:" + id, "json"))))
        .filter(order => order && order.status !== "awaiting_payment")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(order => ({
            id: order.id,
            date: order.createdAt,
            items: (order.items || []).map(item => ({ name: item.name, quantity: item.quantity })),
            total: order.total,
            status: order.status,
            fulfillment: order.fulfillment || null,
            carrier: order.carrier || "",
            trackingNumber: order.trackingNumber || ""
        }));

    return ok({ orders: orders });
}

/* ------------------------- */
/*          emails           */
/* ------------------------- */

function welcomeEmail(env, email) {
    const site = env.SITE_URL || "https://shopunco.com";
    return {
        to: email,
        replyTo: env.CONTACT_TO || undefined,
        subject: "Welcome to unco",
        text: [
            "Thank you for creating an unco account.",
            "Whenever you order with this email address, your orders, their status and tracking numbers show up in your account, even orders you placed as a guest.",
            "To sign in, enter your email on the website and we'll send you a 6-digit code. If you'd rather use a password, you can set one in your account.",
            `Your account: ${site}/#account`,
            "Questions? Just reply to this email.\n\nThank you,\nunco"
        ].join("\n\n"),
        html: emailLayout(
            "Welcome to unco",
            emailParagraph("Thank you for creating an unco account.") +
            emailParagraph("Whenever you order with this email address, your orders, their status and tracking numbers show up in your account, even orders you placed as a guest.") +
            emailParagraph("To sign in, enter your email on the website and we'll send you a 6-digit code. If you'd rather use a password, you can set one in your account.") +
            emailButton(site + "/#account", "Go to your account") +
            emailParagraph("Questions? Just reply to this email.") +
            emailParagraph("Thank you,<br>unco")
        )
    };
}

const SECURITY_CHANGES = {
    "password-set": "A password was added to your unco account. From now on you sign in with your email and that password.",
    "password-changed": "The password for your unco account was changed.",
    "email-code": "Your unco account was switched back to signing in with a code sent by email. Your password was removed."
};

function securityEmail(env, email, change) {
    const contact = env.CONTACT_TO
        ? `contact us right away at ${env.CONTACT_TO}`
        : "contact us right away using the contact page at shopunco.com";
    return {
        to: email,
        replyTo: env.CONTACT_TO || undefined,
        subject: "Your unco sign-in was changed",
        text: [
            SECURITY_CHANGES[change],
            "If you made this change, you don't need to do anything.",
            `If this wasn't you, ${contact}, or simply reply to this email.`,
            "unco"
        ].join("\n\n"),
        html: emailLayout(
            "Your sign-in was changed",
            emailParagraph(SECURITY_CHANGES[change]) +
            emailParagraph("If you made this change, you don't need to do anything.") +
            emailParagraph(`<strong>If this wasn't you, ${contact}</strong>, or simply reply to this email.`)
        )
    };
}

/* ------------------------- */
/*          helpers          */
/* ------------------------- */

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function loadAccount(env, email) {
    return env.ACCOUNTS.get("account:" + email, "json");
}

function saveAccount(env, account) {
    return env.ACCOUNTS.put("account:" + account.email, JSON.stringify(account));
}

async function hashPassword(password, saltHex) {
    if (!saltHex) {
        return "";
    }
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const salt = new Uint8Array(saltHex.match(/../g).map(byte => parseInt(byte, 16)));
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: PASSWORD_ITERATIONS },
        key,
        256
    );
    return toHex(bits);
}

function ok(data) {
    return { status: 200, data: data };
}

function fail(status, error) {
    return { status: status, data: { error: error }, error: true };
}
