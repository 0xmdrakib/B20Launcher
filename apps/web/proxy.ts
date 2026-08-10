import { NextResponse, type NextRequest } from "next/server";

function contentSecurityPolicy() {
  const nonce = btoa(crypto.randomUUID());
  const isDevelopment = process.env.NODE_ENV !== "production";
  const scriptSource = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`, ...(isDevelopment ? [`'unsafe-eval'`] : [])].join(" ");
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://gateway.lighthouse.storage",
    "font-src 'self'",
    "connect-src 'self' https://api.cdp.coinbase.com https://mainnet.base.org https://rpc.walletconnect.com https://rpc.walletconnect.org https://relay.walletconnect.com https://relay.walletconnect.org wss://relay.walletconnect.com wss://relay.walletconnect.org https://pulse.walletconnect.com https://pulse.walletconnect.org https://keys.walletconnect.com https://keys.walletconnect.org https://notify.walletconnect.com https://notify.walletconnect.org https://cca-lite.coinbase.com",
    "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ];
  return { nonce, value: directives.join("; ") };
}

export function proxy(request: NextRequest) {
  const { nonce, value } = contentSecurityPolicy();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", value);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
