/* ------------------------- */
/*          account          */
/* ------------------------- */

// Where the signed-out visitor is in the sign-in flow
const signIn = {
    step: "email",
    email: "",
    isNew: false,
    demoCode: null,
    error: "",
    info: ""
};

async function renderAccount() {
    const container = document.getElementById("account");
    if (!container) {
        return;
    }

    const session = await api.getSession();
    if (session) {
        await renderDashboard(container, session);
    } else {
        renderSignIn(container);
    }
}

function resetSignIn() {
    Object.assign(signIn, { step: "email", email: "", isNew: false, demoCode: null, error: "", info: "" });
}

function renderSignIn(container) {
    const error = signIn.error ? `<p class="form-error" role="alert">${escapeHtml(signIn.error)}</p>` : "";
    const info = signIn.info ? `<p class="form-success">${escapeHtml(signIn.info)}</p>` : "";
    const demo = signIn.demoCode
        ? `<p class="demo-note">Demo mode: emails aren't sent yet. Your code is <strong>${signIn.demoCode}</strong>.</p>`
        : "";
    let form = "";

    if (signIn.step === "email") {
        form = `
            <h2>Sign in or create an account</h2>
            <p class="form-hint">Enter your email. We'll send you a 6-digit code, no password needed.</p>
            <form class="form" id="account-email-form" novalidate>
                <label for="account-email">Email</label>
                <input id="account-email" type="email" autocomplete="email" placeholder="you@example.com" value="${escapeHtml(signIn.email)}" required>
                ${error}
                <button class="button-primary" type="submit">Continue</button>
            </form>
            <p class="form-hint">Already ordered as a guest? Use the same email and your past orders will be waiting in your account.</p>
        `;
    }

    if (signIn.step === "code") {
        form = `
            <h2>${signIn.isNew ? "Create your account" : "Check your email"}</h2>
            <p class="form-hint">We sent a 6-digit code to <strong>${escapeHtml(signIn.email)}</strong>. It expires in 10 minutes.</p>
            ${demo}
            <form class="form" id="account-code-form" novalidate>
                <label for="account-code">6-digit code</label>
                <input id="account-code" class="code-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="000000" required>
                ${error}
                ${info}
                <button class="button-primary" type="submit">${signIn.isNew ? "Create account" : "Sign in"}</button>
            </form>
            <div class="form-links">
                <button class="link-button" type="button" data-action="resend-code">Send a new code</button>
                <button class="link-button" type="button" data-action="change-email">Use a different email</button>
            </div>
        `;
    }

    if (signIn.step === "password") {
        form = `
            <h2>Enter your password</h2>
            <p class="form-hint">Signing in as <strong>${escapeHtml(signIn.email)}</strong>.</p>
            <form class="form" id="account-password-form" novalidate>
                <label for="account-password">Password</label>
                <input id="account-password" type="password" autocomplete="current-password" required>
                ${error}
                <button class="button-primary" type="submit">Sign in</button>
            </form>
            <div class="form-links">
                <button class="link-button" type="button" data-action="use-code-instead">Forgot it? Email me a code instead</button>
                <button class="link-button" type="button" data-action="change-email">Use a different email</button>
            </div>
        `;
    }

    container.innerHTML = `<section class="account-card sign-in">${form}</section>`;

    const firstInput = container.querySelector("input");
    if (firstInput) {
        firstInput.focus();
    }
}

async function renderDashboard(container, session) {
    const orders = await api.getOrders();
    const usesPassword = session.loginMethod === "password";

    const orderList = orders.length === 0
        ? `<p class="form-hint">No orders yet. Orders placed with ${escapeHtml(session.email)}, even as a guest, will show up here.</p>`
        : orders.map(order => `
            <li class="order">
                <div class="order-header">
                    <strong>${order.id}</strong>
                    <span>${formatDate(order.date)}</span>
                    <span class="order-status">${escapeHtml(order.status)}</span>
                    <strong>${formatPrice(order.subtotal)}</strong>
                </div>
                <ul class="order-items">
                    ${order.items.map(line => `<li>${line.quantity} &times; ${line.name}</li>`).join("")}
                </ul>
            </li>
        `).join("");

    container.innerHTML = `
        <div class="account-grid">
            <section class="account-card">
                <h2>Your details</h2>
                <p>Signed in as <strong>${escapeHtml(session.email)}</strong></p>
                <p class="form-hint">Member since ${formatDate(session.createdAt)}</p>
                <button class="button-secondary" type="button" data-action="sign-out">Sign out</button>
            </section>

            <section class="account-card">
                <h2>Sign-in method</h2>
                <form class="form" id="login-method-form" novalidate>
                    <label class="choice">
                        <input type="radio" name="login-method" value="email-code" ${usesPassword ? "" : "checked"}>
                        <span>
                            <strong>Email code</strong> (recommended)
                            <small>We email you a 6-digit code each time you sign in. Nothing to remember.</small>
                        </span>
                    </label>
                    <label class="choice">
                        <input type="radio" name="login-method" value="password" ${usesPassword ? "checked" : ""}>
                        <span>
                            <strong>Password</strong>
                            <small>Sign in with a password you choose.</small>
                        </span>
                    </label>
                    <div class="password-fields" id="password-fields" ${usesPassword ? "" : "hidden"}>
                        <label for="new-password">${usesPassword ? "New password (optional)" : "Choose a password"}</label>
                        <input id="new-password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}">
                        <label for="confirm-password">Confirm password</label>
                        <input id="confirm-password" type="password" autocomplete="new-password">
                        <small class="form-hint">At least ${MIN_PASSWORD_LENGTH} characters.</small>
                    </div>
                    <p class="form-error" id="login-method-error" role="alert"></p>
                    <p class="form-success" id="login-method-success"></p>
                    <button class="button-primary" type="submit">Save</button>
                </form>
            </section>

            <section class="account-card account-orders">
                <h2>Order history</h2>
                <ul class="orders">${orderList}</ul>
            </section>
        </div>
    `;
}

document.addEventListener("submit", async (event) => {
    const form = event.target;

    if (form.id === "account-email-form") {
        event.preventDefault();
        const result = await api.startSignIn(document.getElementById("account-email").value);

        signIn.error = result.ok ? "" : result.error;
        signIn.info = "";
        if (result.ok) {
            Object.assign(signIn, { step: result.next, email: result.email, isNew: !!result.isNew, demoCode: result.demoCode || null });
        }
        renderAccount();
    }

    if (form.id === "account-code-form") {
        event.preventDefault();
        const result = await api.verifyCode(signIn.email, document.getElementById("account-code").value);

        if (result.ok) {
            resetSignIn();
        } else {
            signIn.error = result.error;
            signIn.info = "";
        }
        renderAccount();
    }

    if (form.id === "account-password-form") {
        event.preventDefault();
        const result = await api.signInWithPassword(signIn.email, document.getElementById("account-password").value);

        if (result.ok) {
            resetSignIn();
        } else {
            signIn.error = result.error;
        }
        renderAccount();
    }

    if (form.id === "login-method-form") {
        event.preventDefault();
        await saveLoginMethod(form);
    }
});

async function saveLoginMethod(form) {
    const method = form.querySelector('input[name="login-method"]:checked').value;
    const password = document.getElementById("new-password").value;
    const confirm = document.getElementById("confirm-password").value;
    const errorBox = document.getElementById("login-method-error");
    const successBox = document.getElementById("login-method-success");
    const session = await api.getSession();

    errorBox.textContent = "";
    successBox.textContent = "";

    // Already on password with the fields left blank: nothing to change
    if (method === "password" && session.loginMethod === "password" && !password && !confirm) {
        successBox.textContent = "No changes to save.";
        return;
    }

    if (method === "password" && password !== confirm) {
        errorBox.textContent = "The passwords don't match.";
        return;
    }

    const result = await api.setLoginMethod(method, password);
    if (!result.ok) {
        errorBox.textContent = result.error;
        return;
    }

    await renderAccount();
    document.getElementById("login-method-success").textContent = method === "password"
        ? "Saved. You'll sign in with your password from now on."
        : "Saved. We'll email you a code each time you sign in.";
}

document.addEventListener("change", (event) => {
    if (event.target.name === "login-method") {
        document.getElementById("password-fields").hidden = event.target.value !== "password";
    }
});

document.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) {
        return;
    }

    if (button.dataset.action === "resend-code" || button.dataset.action === "use-code-instead") {
        const result = await api.sendCode(signIn.email);
        Object.assign(signIn, {
            step: "code",
            isNew: result.isNew,
            demoCode: result.demoCode || null,
            error: "",
            info: "We sent a new code."
        });
        renderAccount();
    }

    if (button.dataset.action === "change-email") {
        resetSignIn();
        renderAccount();
    }

    if (button.dataset.action === "sign-out") {
        await api.signOut();
        resetSignIn();
        renderAccount();
    }
});
