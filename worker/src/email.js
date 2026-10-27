// Sends email through Resend (resend.com). Without RESEND_API_KEY, emails
// are only printed to the Worker's log when EMAIL_DEV_LOG is "true", which
// is for local testing and must never be set on Cloudflare.
// Returns true if the email was handed off. replyTo is optional.
export async function sendEmail(env, { to, subject, text, html, replyTo }) {
    if (!env.RESEND_API_KEY) {
        if (env.EMAIL_DEV_LOG === "true") {
            const replyLine = replyTo ? `\nReply-To: ${replyTo}` : "";
            console.log(`[dev email] To: ${to}${replyLine}\nSubject: ${subject}\n\n${text}`);
            return true;
        }
        console.error("Email isn't set up: RESEND_API_KEY is missing");
        return false;
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + env.RESEND_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: env.EMAIL_FROM,
            to: [to],
            subject: subject,
            text: text,
            html: html,
            ...(replyTo ? { reply_to: replyTo } : {})
        })
    });

    if (!response.ok) {
        // Shows up in the Worker's logs, never sent to the shopper
        console.error("Resend failed", response.status, await response.text().catch(() => ""));
        return false;
    }
    return true;
}

// A plain, readable layout that works in every email app
export function emailLayout(heading, bodyHtml) {
    return `
        <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
            <p style="margin: 0 0 24px; color: #453F78; font-size: 28px; font-weight: bold;">unco</p>
            <h1 style="margin: 0 0 16px; font-size: 22px;">${heading}</h1>
            ${bodyHtml}
            <p style="margin: 32px 0 0; color: #777; font-size: 13px;">unco &middot; shopunco.com</p>
        </div>
    `;
}

// Anything a shopper typed must go through this before it goes in an email's HTML
export function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

// Same as sendEmail, but never throws: a failed email is logged and must
// never stop a webhook, an order desk save or a sign-in
export async function trySendEmail(env, message) {
    try {
        return await sendEmail(env, message);
    } catch (error) {
        console.error("Email failed", message.subject, error?.message || error);
        return false;
    }
}

// A paragraph and a button-style link, matching emailLayout
export function emailParagraph(html) {
    return `<p style="margin: 0 0 16px; font-size: 16px; line-height: 1.5;">${html}</p>`;
}

export function emailButton(href, label) {
    return `<p style="margin: 8px 0 24px;"><a href="${escapeHtml(href)}" style="display: inline-block; padding: 12px 24px; color: #fff; background: #453F78; border-radius: 999px; text-decoration: none; font-weight: bold;">${escapeHtml(label)}</a></p>`;
}
