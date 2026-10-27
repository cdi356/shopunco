/* ------------------------- */
/*        coming soon        */
/* ------------------------- */

// Until launch, visitors see the coming-soon page instead of the shop.
// Testers press ~ five times there and enter the password to see the real
// site; the browser remembers it after that. Set COMING_SOON to false at
// launch, which also turns the shortcut off.
// This only hides the shop from casual visitors. The site's files are
// public, so it isn't real security: keep anything secret out of them.

const COMING_SOON = true;
const UNLOCK_KEY = "unco-unlocked";
const UNLOCK_PASSWORD_SHA256 = "e30fcc586373f44ca746bbf877703c0203834e9e0778d3393fc804a8e43fc17b";
const TILDE_PRESSES = 5;
const TILDE_WINDOW_MS = 3000;

// Visiting any page with ?lock (e.g. shopunco.com/?lock) forgets the unlock
// and reloads the home page, so the coming-soon page shows again
if (new URLSearchParams(location.search).has("lock")) {
    try {
        localStorage.removeItem(UNLOCK_KEY);
    } catch (error) {
        // Storage unavailable; the unlock was never remembered anyway
    }
    location.replace(location.origin + "/");
}

function isUnlocked() {
    try {
        return localStorage.getItem(UNLOCK_KEY) === "yes";
    } catch (error) {
        return false;
    }
}

// Runs in <head>, before the shop is drawn, so it never flashes on screen
if (COMING_SOON && !isUnlocked()) {
    document.documentElement.classList.add("coming-soon-active");
    document.addEventListener("DOMContentLoaded", setUpComingSoon);
}

function setUpComingSoon() {
    const root = document.documentElement;
    const form = document.getElementById("unlock-form");
    const input = document.getElementById("unlock-password");
    const errorBox = document.getElementById("unlock-error");
    const shopTitle = document.title;
    let presses = [];

    document.title = "unco® | Coming Soon";

    function openUnlock() {
        root.classList.add("unlock-open");
        form.hidden = false;
        input.value = "";
        errorBox.textContent = "";
        input.focus();
    }

    function closeUnlock() {
        root.classList.remove("unlock-open");
        form.hidden = true;
        presses = [];
    }

    // ~ is Shift + the ` key; either counts, so testers needn't hold Shift.
    // The key is matched by position and by character, for other layouts.
    function isTildeKey(event) {
        return event.code === "Backquote" || event.key === "~" || event.key === "`";
    }

    function onKeydown(event) {
        if (root.classList.contains("unlock-open")) {
            if (event.key === "Escape") {
                closeUnlock();
            }
            return;
        }

        if (!isTildeKey(event) || event.repeat) {
            presses = [];
            return;
        }

        const now = Date.now();
        presses = presses.filter(time => now - time < TILDE_WINDOW_MS);
        presses.push(now);

        if (presses.length >= TILDE_PRESSES) {
            event.preventDefault();
            openUnlock();
        }
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (await sha256(input.value) !== UNLOCK_PASSWORD_SHA256) {
            errorBox.textContent = "That's not the password.";
            input.value = "";
            form.classList.remove("unlock-shake");
            void form.offsetWidth;
            form.classList.add("unlock-shake");
            input.focus();
            return;
        }

        try {
            localStorage.setItem(UNLOCK_KEY, "yes");
        } catch (error) {
            // Storage unavailable; the site stays unlocked for this visit only
        }

        document.removeEventListener("keydown", onKeydown);
        root.classList.remove("coming-soon-active", "unlock-open");
        document.title = shopTitle;
    });

    // Clicking the blurred page behind the box closes it
    document.getElementById("coming-soon").addEventListener("click", (event) => {
        if (event.target.id === "coming-soon") {
            closeUnlock();
        }
    });

    document.addEventListener("keydown", onKeydown);
}

async function sha256(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
