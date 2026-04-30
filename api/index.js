import { Readable, Transform } from "node:stream";

export const config = {
  runtime: "edge", // استفاده از محیط Edge برای سرعت بالا و کاهش شناسایی
};

const TARGET_BASE = (process.env.DATA_PIPELINE_TARGET || "").replace(/\/$/, "");

// ۱. فیلتر بی‌رحمانه هدرها (Hop-by-Hop و پلتفرم)
const STRIP_HEADERS = new Set([
  "host", "connection", "proxy-connection", "keep-alive", "via",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "forwarded", "x-forwarded-host",
  "x-forwarded-proto", "x-forwarded-port", "x-forwarded-for", "x-real-ip",
  "cf-ray", "cf-connecting-ip"
]);

// ۲. هدرهای مجاز (فقط موارد کاملاً استاندارد وب)
const ALLOWED_FORWARD_HEADERS = new Set([
  "accept", "accept-encoding", "accept-language", "cache-control",
  "content-type", "user-agent", "range", "referer"
]);

export default async function handler(req) {
  if (!TARGET_BASE) return new Response("System Offline", { status: 503 });

  const url = new URL(req.url);

  // ۳. استراتژی فریب: پاسخ به صفحه اصلی برای عادی جلوه دادن پروژه
  if (url.pathname === "/" || url.pathname === "/favicon.ico") {
    return new Response("<html><body><h1>API Service Active</h1></body></html>", {
      headers: { "content-type": "text/html" },
    });
  }

  try {
    const targetUrl = TARGET_BASE + url.pathname + url.search;
    const headers = new Headers();

    // ۵. تمیزکاری هدرهای ورودی
    for (const [key, value] of req.headers) {
      const lowKey = key.toLowerCase();
      if (ALLOWED_FORWARD_HEADERS.has(lowKey) || lowKey.startsWith("sec-")) {
        headers.set(key, value);
      }
    }

    // ۶. تغییر هویت اجباری (Masking)
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");

    const method = req.method;
    const fetchOpts = {
      method,
      headers,
      redirect: "manual",
      keepalive: true,
    };

    if (method !== "GET" && method !== "HEAD") {
      fetchOpts.body = req.body;
      fetchOpts.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    // ۷. تمیزکاری هدرهای خروجی (پاکسازی ردپای سرور اصلی)
    const respHeaders = new Headers();
    for (const [k, v] of upstream.headers) {
      const lowK = k.toLowerCase();
      if (STRIP_HEADERS.has(lowK) || lowK.startsWith("x-vercel-") || lowK === "server") {
        continue;
      }
      respHeaders.set(k, v);
    }

    // ۸. هدرهای فریب برای سیستم مانیتورینگ ورسل
    respHeaders.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    respHeaders.set("X-Accel-Buffering", "no"); // جلوگیری از بافرینگ سنگین

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });

  } catch (err) {
    return new Response("Gateway Error", { status: 502 });
  }
}
