/* ------------------------- */
/*         text size         */
/* ------------------------- */

// The Text size setting on the Account page. It runs in <head>, so the page
// is drawn at the chosen size from the start instead of jumping after it
// loads. The choice is kept in this browser, signed in or not.

const TEXT_SIZE_KEY = "unco-text-size";
const TEXT_SIZES = {
    standard: "Standard",
    larger: "Larger",
    largest: "Largest"
};

function getTextSize() {
    try {
        const saved = localStorage.getItem(TEXT_SIZE_KEY);
        return TEXT_SIZES[saved] ? saved : "standard";
    } catch (error) {
        return "standard";
    }
}

function setTextSize(size) {
    if (!TEXT_SIZES[size]) {
        return;
    }

    try {
        if (size === "standard") {
            localStorage.removeItem(TEXT_SIZE_KEY);
        } else {
            localStorage.setItem(TEXT_SIZE_KEY, size);
        }
    } catch (error) {
        // Storage unavailable; the size lasts for this visit only
    }
    document.documentElement.dataset.textSize = size;
}

document.documentElement.dataset.textSize = getTextSize();
