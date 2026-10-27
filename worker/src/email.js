// Sends email through Resend (resend.com). Without RESEND_API_KEY, emails
// are only printed to the Worker's log when EMAIL_DEV_LOG is "true", which
// is for local testing and must never be set on Cloudflare.
// Returns true if the email was handed off.
export async function sendEmail(env, { to, subject, text, html }) {
    if (!env.RESEND_API_KEY) {
        if (env.EMAIL_DEV_LOG === "true") {
            console.log(`[dev email] To: ${to}\nSubject: ${subject}\n\n${text}`);
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
            html: html
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
