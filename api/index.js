export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.DATA_PIPELINE_TARGET || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
  "x-forwarded-for",
  "cf-ray",
  "cf-connecting-ip",
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Service Unavailable", { status: 503 });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();
    
    for (const [key, value] of req.headers) {
      const k = key.toLowerCase();
      
      if (STRIP_HEADERS.has(k) || k.startsWith("x-vercel-") || k.startsWith("x-amz-")) {
        continue;
      }
      headers.set(k, value);
    }

    
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
    
    headers.set("Cache-Control", "no-cache");

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const fetchOpts = {
      method,
      headers,
      redirect: "manual",
    };

    if (hasBody) {
      fetchOpts.body = req.body;
      fetchOpts.duplex = "half";
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    const respHeaders = new Headers();
    for (const [k, v] of upstream.headers) {
      const lowK = k.toLowerCase();
      if (lowK === "transfer-encoding" || lowK === "content-encoding" || lowK === "connection") {
        continue;
      }
      respHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response("Gateway Error", { status: 502 });
  }
}
