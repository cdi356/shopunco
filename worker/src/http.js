// Small helpers shared by every endpoint

export function corsHeaders(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
    const headers = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Vary": "Origin"
    };

    if (allowed.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
    }
    return headers;
}

export function json(data, status, headers) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: { ...headers, "Content-Type": "application/json" }
    });
}

export async function sha256Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return toHex(digest);
}

export function toHex(buffer) {
    return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, "0")).join("");
}

// Compares two strings without leaking, through timing, how much matched
export function safeEqual(a, b) {
    const encoder = new TextEncoder();
    const left = encoder.encode(a);
    const right = encoder.encode(b);
    return left.byteLength === right.byteLength && crypto.subtle.timingSafeEqual(left, right);
}
