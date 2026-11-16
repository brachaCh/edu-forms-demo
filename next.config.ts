import type { NextConfig } from "next";
import { allowedCorsOrigins } from "./src/lib/cors";

/**
 * כותרות אבטחה — צ'קליסט #05
 * CORS למקורות מפורשים ב-API — צ'קליסט #13
 * CSRF Origin על /api ב-middleware (webhooks/cron/problem-report פטורים); הכותרות כאן נשארות.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // pdf.js 4 may spawn a module worker or wrap it in a blob: URL.
      // Without worker-src, CSP falls back to script-src (no blob:) and
      // every uploaded PDF becomes the print placeholder.
      "worker-src 'self' blob:",
      "connect-src 'self' https: wss:",
      "media-src 'self' blob: data:",
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://drive.google.com",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_DEMO_MODE: "true",
  },
  async redirects() {
    return [
      {
        source: "/personal-area/subscriptions",
        destination: "/platform-admin/subscriptions",
        permanent: false,
      },
    ];
  },
  async headers() {
    const origins = allowedCorsOrigins();
    const primary = origins[0];
    const apiCors = primary
      ? [
          {
            source: "/api/:path*",
            headers: [
              { key: "Access-Control-Allow-Origin", value: primary },
              { key: "Access-Control-Allow-Credentials", value: "true" },
              {
                key: "Access-Control-Allow-Methods",
                value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
              },
              {
                key: "Access-Control-Allow-Headers",
                value: "Content-Type, Authorization",
              },
              { key: "Vary", value: "Origin" },
            ],
          },
        ]
      : [];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // nosniff on /:path* + a generic .mjs MIME (octet-stream / text/plain)
        // blocks `new Worker(..., { type: "module" })` and dynamic import()
        // of /pdf.worker.min.mjs — every PDF then fails in print.
        source: "/pdf.worker.min.mjs",
        headers: [
          {
            key: "Content-Type",
            value: "text/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=86400, must-revalidate",
          },
        ],
      },
      {
        // TZ-76: Hebrew download= filenames are ignored by some browsers, and
        // nosniff + a generic MIME can make a click appear to do nothing.
        source: "/portfolio-templates/machon-talmid.docx",
        headers: [
          {
            key: "Content-Type",
            value:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
          {
            key: "Content-Disposition",
            value:
              "attachment; filename=\"machon-talmid.docx\"; filename*=UTF-8''%D7%9E%D7%97%D7%95%D7%95%D7%9F%20%D7%AA%D7%9C%D7%9E%D7%99%D7%93.docx",
          },
        ],
      },
      ...apiCors,
    ];
  },
};

export default nextConfig;
