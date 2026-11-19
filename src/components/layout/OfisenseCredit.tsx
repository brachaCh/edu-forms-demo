"use client";

import { usePathname } from "next/navigation";

const OFISENSE_HREF = "https://ofisense.ai";
const BUSINESSROOM_HREF = "https://businessroom.co.il";

/** Public signature / fill / view / detached-print views — keep developer chrome off documents. */
function isDocumentChromeHidden(pathname: string): boolean {
  return (
    pathname === "/sign" ||
    pathname.startsWith("/sign/") ||
    pathname === "/sign-document" ||
    pathname.startsWith("/sign-document/") ||
    pathname === "/fill" ||
    pathname.startsWith("/fill/") ||
    pathname === "/view" ||
    pathname.startsWith("/view/") ||
    pathname === "/print" ||
    pathname.startsWith("/print/")
  );
}

/** Shared height so both wordmarks sit on one line with the copyright text. */
const LOGO_BOX_CLASS = "inline-flex h-7 shrink-0 items-center justify-center";
const LOGO_IMG_CLASS = "h-7 w-auto max-w-[9.5rem] object-contain object-center";

function CreditLogoLink({
  href,
  src,
  alt,
  width,
  height,
}: {
  href: string;
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${LOGO_BOX_CLASS} transition-opacity duration-150 hover:opacity-80`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={LOGO_IMG_CLASS}
        draggable={false}
      />
    </a>
  );
}

/**
 * Copyright line for Ofisense and Business Room, with both wordmarks.
 * Composed into SiteFooter. Hidden in print via the root layout
 * `print:hidden` wrapper, plus `print:hidden` here. On public signature /
 * fill / print routes the logos are omitted and the names stay as text.
 */
export function OfisenseCredit() {
  const pathname = usePathname();
  const year = new Date().getFullYear();
  const showLogos = !isDocumentChromeHidden(pathname);

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-border/70 bg-white/45 px-3 py-1.5 text-xs leading-none text-muted-foreground backdrop-blur print:hidden"
      aria-label="כל הזכויות שמורות ל-Ofisense ול-Business Room"
    >
      <span className="shrink-0 font-medium text-ink/70">
        © {year} כל הזכויות שמורות ל
      </span>
      {showLogos ? (
        <CreditLogoLink
          href={OFISENSE_HREF}
          src="/ofisense-logo.png"
          alt="Ofisense"
          width={945}
          height={145}
        />
      ) : (
        <span className="shrink-0 font-medium text-ink/70">Ofisense</span>
      )}
      <span className="shrink-0">ול</span>
      {showLogos ? (
        <CreditLogoLink
          href={BUSINESSROOM_HREF}
          src="/businessroom-logo.png"
          alt="Business Room"
          width={965}
          height={250}
        />
      ) : (
        <span className="shrink-0 font-medium text-ink/70">Business Room</span>
      )}
    </div>
  );
}
