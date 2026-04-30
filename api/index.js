export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.DATA_PIPELINE_TARGET || "").replace(/\/$/, "");

// ۱. لیست سیاه هدرها - پاکسازی ردپای سیستم‌های پروکسی
const STRIP_HEADERS = new Set([
  "host", "connection", "proxy-connection", "keep-alive", "via",
  "proxy-authenticate", "proxy-authorization", "te", "trailer",
  "transfer-encoding", "upgrade", "forwarded", "x-forwarded-host",
  "x-forwarded-proto", "x-forwarded-port", "x-forwarded-for", "x-real-ip",
  "cf-ray", "cf-connecting-ip", "x-vercel-id", "x-vercel-forwarded-for"
]);

// ۲. لیست سفید هدرها - فقط موارد ضروری برای وب
const ALLOWED_HEADERS = new Set([
  "accept", "accept-encoding", "accept-language", "cache-control",
  "content-type", "user-agent", "range", "referer", "authorization", "origin"
]);

export default async function handler(req) {
  // اگر آدرس مقصد ست نشده باشد
  if (!TARGET_BASE) return new Response("Powering Edge Network...", { status: 200 });

  const url = new URL(req.url);

  // ۳. تکنیک "استتار" (Camouflage)
  // اگر کسی (یا بات ورسل) آدرس رو مستقیماً باز کنه، یه سایت فیک میبینه
  if (url.pathname === "/" || url.pathname === "/favicon.ico") {
    return new Response(
      "<html><head><title>Cloud Data Processor</title></head><body><h1>System Status: Operational</h1><p>Edge pipeline is running smoothly.</p></body></html>", 
      { headers: { "content-type": "text/html" } }
    );
  }

  try {
    const targetUrl = TARGET_BASE + url.pathname + url.search;
    const newHeaders = new Headers();

    // ۴. فیلتر کردن هوشمند هدرها برای کاهش شناسایی
    for (const [key, value] of req.headers) {
      const lowKey = key.toLowerCase();
      // فقط هدرهای استاندارد و هدرهای xhttp رو عبور میدیم
      if (ALLOWED_HEADERS.has(lowKey) || lowKey.startsWith("sec-") || lowKey.startsWith("x-xhttp-")) {
        newHeaders.set(key, value);
      }
    }

    // ۵. جعل User-Agent ثابت و مدرن
    newHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");

    const fetchOpts = {
      method: req.method,
      headers: newHeaders,
      redirect: "manual",
      // بهینه‌سازی برای استفاده کمتر از CPU
      keepalive: true,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOpts.body = req.body;
      fetchOpts.duplex = "half";
    }

    // ۶. شروع عملیات انتقال داده
    const upstream = await fetch(targetUrl, fetchOpts);

    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers) {
      const lowKey = key.toLowerCase();
      // حذف هدرهایی که ورسل رو حساس میکنه یا نشون میده سرور اصلی چیه
      if (!STRIP_HEADERS.has(lowKey) && !lowKey.startsWith("x-vercel-") && lowKey !== "server") {
        responseHeaders.set(key, value);
      }
    }

    // ۷. هدرهای طلایی برای کاهش مصرف و بن نشدن
    // این هدر به ورسل میگه دیتا رو بافر نکن، مستقیم رد کن (مصرف CPU کمتر)
    responseHeaders.set("X-Accel-Buffering", "no");
    // فریب سیستم کشینگ
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    responseHeaders.set("Pragma", "no-cache");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });

  } catch (err) {
    // پیام خطای کاملاً عادی و غیرمشکوک
    return new Response("Service Temporarily Unavailable", { status: 503 });
  }
}
