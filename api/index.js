export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.DATA_PIPELINE_TARGET || "").replace(/\/$/, "");
const MAX_CONCURRENT = 20;
let activeRequests = 0;

const STRIP_HEADERS = new Set([
  "host", "connection", "proxy-connection", "keep-alive", "via", "forwarded",
  "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "x-forwarded-port",
  "x-real-ip", "cf-ray", "cf-connecting-ip", "true-client-ip", "x-vercel-id", 
  "x-vercel-proxy-signature", "x-vercel-forwarded-for"
]);

export default async function handler(req) {
  if (activeRequests >= MAX_CONCURRENT) {
    return new Response("Service Unavailable", { status: 503 });
  }

  const url = new URL(req.url);

  if (url.pathname === "/" || url.pathname === "/favicon.ico" || url.pathname === "/robots.txt") {
    return new Response(
      "<html><head><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1></body></html>",
      { status: 403, headers: { "content-type": "text/html" } }
    );
  }

  activeRequests++;

  try {
    const targetUrl = TARGET_BASE + url.pathname + url.search;
    const cleanHeaders = new Headers();

    for (const [key, value] of req.headers) {
      const lowerKey = key.toLowerCase();
      if (!STRIP_HEADERS.has(lowerKey) && !lowerKey.startsWith("x-vercel-")) {
        cleanHeaders.set(key, value);
      }
    }

    cleanHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");

    const fetchOpts = {
      method: req.method,
      headers: cleanHeaders,
      redirect: "manual",
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOpts.body = req.body; 
      fetchOpts.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers) {
      const lowerKey = key.toLowerCase();
      if (!STRIP_HEADERS.has(lowerKey) && !lowerKey.startsWith("x-vercel-") && lowerKey !== "server") {
        responseHeaders.set(key, value);
      }
    }

    responseHeaders.set("X-Accel-Buffering", "no");
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });

  } catch (err) {
    return new Response(null, { status: 502 });
  } finally {
    activeRequests--;
  }
}
