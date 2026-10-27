import { json, sha256Hex } from "./http.js";
import { trySendEmail, emailLayout, emailParagraph, escapeHtml } from "./email.js";

// The contact form. Each message is emailed to CONTACT_TO with the
// customer's address as Reply-To, so answering is just hitting Reply.
// Bots are kept out with a hidden "website" field people never fill in, and
// a limit on how many messages one email address or one connection can send.

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_PER_EMAIL_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 5;

export async function handleContact(request, env, cors) {
    if (!env.CONTACT_TO || !env.ACCOUNTS) {
        return json({ error: "The contact form isn't set up yet. Please try again later." }, 503, cors);
    }

    let body;
    try {
        body = await request.json();
    } catch (error) {
        return json({ error: "The request wasn't valid JSON." }, 400, cors);
    }

    // A filled-in hidden field means a bot. It's told the message went
    // through so it doesn't try again another way.
    if (body.website) {
        return json({ ok: true }, 200, cors);
    }

    // Line breaks are taken out of the name because it goes in the subject
    const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const message = String(body.message ?? "").trim();

    if (!name) {
        return json({ error: "Please enter your name." }, 400, cors);
    }
    if (name.length > MAX_NAME_LENGTH) {
        return json({ error: `Please keep your name under ${MAX_NAME_LENGTH} characters.` }, 400, cors);
    }
    if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "Please enter a valid email address so we can write back." }, 400, cors);
    }
    if (!message) {
        return json({ error: "Please write your message." }, 400, cors);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
        return json({ error: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.` }, 400, cors);
    }

    // Only a hash of the connection's address is kept, and only for an hour
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const limits = [
        { key: "contact-email:" + email, max: MAX_PER_EMAIL_PER_HOUR },
        { key: "contact-ip:" + await sha256Hex(ip), max: MAX_PER_IP_PER_HOUR }
    ];
    const counts = await Promise.all(limits.map(async limit => Number(await env.ACCOUNTS.get(limit.key)) || 0));
    if (limits.some((limit, i) => counts[i] >= limit.max)) {
        return json({ error: "We've had several messages from you in the last hour. Please wait a little and try again." }, 429, cors);
    }
    await Promise.all(limits.map((limit, i) =>
        env.ACCOUNTS.put(limit.key, String(counts[i] + 1), { expirationTtl: 60 * 60 })));

    const sent = await trySendEmail(env, {
        to: env.CONTACT_TO,
        replyTo: email,
        subject: `Contact form: ${name}`,
        text: `From: ${name} <${email}>\n\n${message}\n\n(Hit Reply to answer ${name}.)`,
        html: emailLayout(
            "New message from the contact form",
            emailParagraph(`From: <strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;`) +
            `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(message)}</p>` +
            emailParagraph(`<span style="color: #555;">Hit Reply to answer ${escapeHtml(name)}.</span>`)
        )
    });

    if (!sent) {
        return json({ error: `We couldn't send your message just now. Please try again in a minute, or email us at ${env.CONTACT_TO}.` }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
}
