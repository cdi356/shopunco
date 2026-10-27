import { trySendEmail, emailLayout, emailParagraph, emailButton, escapeHtml } from "./email.js";

// Emails about an order: a confirmation and an owner alert when it's paid,
// a note when it ships, and a note when it's refunded. Square webhooks repeat
// and the order desk can be saved twice, so each email is recorded on the
// order (order.emails.<name>) and only ever sent once.

// Keep in step with the Shipping page on the site
const DELIVERY_ESTIMATE = "Most orders arrive in 1 to 2 weeks.";

// Each sender returns the email, or null when there's nobody to send it to
const EMAILS = {
    confirmation: confirmationEmail,
    ownerAlert: ownerAlertEmail,
    shipped: shippedEmail,
    refund: refundEmail
};

// Sends the named email once per order. The flag is saved before sending so
// a webhook repeated while the email is going out doesn't send it again; if
// sending fails the flag is taken back off so the next webhook or desk save
// can try again. Never throws.
export async function sendOrderEmailOnce(env, order, name, saveOrder) {
    try {
        order.emails = order.emails || {};
        if (order.emails[name]) {
            return;
        }

        const message = EMAILS[name](env, order);
        if (!message) {
            return;
        }
        // Replies from customers reach the contact inbox, not EMAIL_FROM
        if (!message.replyTo && env.CONTACT_TO) {
            message.replyTo = env.CONTACT_TO;
        }

        order.emails[name] = new Date().toISOString();
        await saveOrder(env, order);

        if (!await trySendEmail(env, message)) {
            console.error(`The ${name} email for ${order.id} wasn't sent`);
            delete order.emails[name];
            await saveOrder(env, order);
        }
    } catch (error) {
        console.error(`The ${name} email for ${order.id} failed`, error?.message || error);
    }
}

function customerEmail(order) {
    return order.email || order.shipping?.email || null;
}

function siteUrl(env) {
    return env.SITE_URL || "https://shopunco.com";
}

function formatCents(cents) {
    return "$" + (cents / 100).toFixed(2);
}

function itemLines(order) {
    return (order.items || []).map(item => `${item.quantity} x ${item.name}`);
}

function itemListHtml(order) {
    const items = (order.items || [])
        .map(item => `<li style="margin: 0 0 4px;">${item.quantity} &times; ${escapeHtml(item.name)}</li>`)
        .join("");
    return `<ul style="margin: 0 0 16px; padding-left: 20px; font-size: 16px; line-height: 1.5;">${items}</ul>`;
}

// The total is what Square charged, including tax; older orders may not have it
function totalText(order) {
    return Number.isInteger(order.total) ? formatCents(order.total) : null;
}

function signOff() {
    return {
        text: "Questions? Just reply to this email, or use the contact page at shopunco.com.\n\nThank you,\nunco",
        html: emailParagraph("Questions? Just reply to this email, or use the contact page at shopunco.com.") +
            emailParagraph("Thank you,<br>unco")
    };
}

function confirmationEmail(env, order) {
    const to = customerEmail(order);
    if (!to) {
        return null;
    }

    const total = totalText(order);
    const accountUrl = siteUrl(env) + "/#account";
    const end = signOff();

    return {
        to: to,
        subject: `Thank you for your order (${order.id})`,
        text: [
            "Thank you for shopping with unco. Your payment went through and your order is confirmed.",
            `Order number: ${order.id}`,
            "What you ordered:\n" + itemLines(order).join("\n"),
            total ? `Total: ${total} (shipping is free)` : "Shipping is free.",
            `${DELIVERY_ESTIMATE} We'll email you a tracking number as soon as it ships.`,
            "Square, our payment company, sends your payment receipt in a separate email.",
            `See your order anytime at ${accountUrl} (sign in with this email address).`,
            end.text
        ].join("\n\n"),
        html: emailLayout(
            "Thank you for your order",
            emailParagraph("Your payment went through and your order is confirmed.") +
            emailParagraph(`Order number: <strong>${escapeHtml(order.id)}</strong>`) +
            itemListHtml(order) +
            emailParagraph(total ? `Total: <strong>${total}</strong> (shipping is free)` : "Shipping is free.") +
            emailParagraph(`${DELIVERY_ESTIMATE} We'll email you a tracking number as soon as it ships.`) +
            emailParagraph("Square, our payment company, sends your payment receipt in a separate email.") +
            emailButton(accountUrl, "See your order") +
            end.html
        )
    };
}

function ownerAlertEmail(env, order) {
    if (!env.OWNER_EMAIL) {
        console.error("OWNER_EMAIL isn't set, so no new-order alert was sent");
        return null;
    }

    const total = totalText(order) || "unknown";
    const name = order.shipping?.name || "No name yet";
    const deskUrl = siteUrl(env) + "/#admin";

    return {
        to: env.OWNER_EMAIL,
        // So replying writes to the customer
        replyTo: customerEmail(order) || undefined,
        subject: `New order to fulfil: ${order.id} (${total})`,
        text: [
            `A new order was paid and is waiting on the order desk.`,
            `Order: ${order.id}\nCustomer: ${name}\nEmail: ${customerEmail(order) || "none"}\nTotal: ${total}`,
            itemLines(order).join("\n"),
            `Open the order desk: ${deskUrl}`
        ].join("\n\n"),
        html: emailLayout(
            "New order to fulfil",
            emailParagraph("A new order was paid and is waiting on the order desk.") +
            emailParagraph(
                `Order: <strong>${escapeHtml(order.id)}</strong><br>` +
                `Customer: ${escapeHtml(name)}<br>` +
                `Email: ${escapeHtml(customerEmail(order) || "none")}<br>` +
                `Total: ${escapeHtml(total)}`
            ) +
            itemListHtml(order) +
            emailButton(deskUrl, "Open the order desk")
        )
    };
}

function shippedEmail(env, order) {
    const to = customerEmail(order);
    if (!to || !order.trackingNumber) {
        return null;
    }

    const carrier = order.carrier || "the carrier";
    const accountUrl = siteUrl(env) + "/#account";
    const end = signOff();

    return {
        to: to,
        subject: `Your unco order is on its way (${order.id})`,
        text: [
            "Good news: your order is on its way.",
            `Order number: ${order.id}`,
            itemLines(order).join("\n"),
            `Carrier: ${carrier}\nTracking number: ${order.trackingNumber}`,
            "You can look up the tracking number on the carrier's website. It can take a day or two before tracking shows any movement.",
            `Your order is also in your account at ${accountUrl}.`,
            end.text
        ].join("\n\n"),
        html: emailLayout(
            "Your order is on its way",
            emailParagraph("Good news: your order is on its way.") +
            emailParagraph(`Order number: <strong>${escapeHtml(order.id)}</strong>`) +
            itemListHtml(order) +
            emailParagraph(
                `Carrier: <strong>${escapeHtml(carrier)}</strong><br>` +
                `Tracking number: <strong>${escapeHtml(order.trackingNumber)}</strong>`
            ) +
            emailParagraph("You can look up the tracking number on the carrier's website. It can take a day or two before tracking shows any movement.") +
            emailButton(accountUrl, "See your order") +
            end.html
        )
    };
}

function refundEmail(env, order) {
    const to = customerEmail(order);
    if (!to) {
        return null;
    }

    const end = signOff();

    return {
        to: to,
        subject: `Your refund for order ${order.id}`,
        text: [
            `We've refunded your order ${order.id}.`,
            "The money goes back to the card you paid with. Depending on your bank, it can take 5 to 10 business days to show up.",
            end.text
        ].join("\n\n"),
        html: emailLayout(
            "Your refund is on its way",
            emailParagraph(`We've refunded your order <strong>${escapeHtml(order.id)}</strong>.`) +
            emailParagraph("The money goes back to the card you paid with. Depending on your bank, it can take 5 to 10 business days to show up.") +
            end.html
        )
    };
}
