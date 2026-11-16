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

/** Identical box for both marks so they render at the same size. */
const LOGO_BOX_CLASS =
  "inline-flex h-2.5 w-[3.5rem] shrink-0 items-center justify-center";
const LOGO_IMG_CLASS = "h-full w-full object-contain object-center";

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
 * Thin developer-credit strip: פותח על ידי Ofisense בשיתוף Business Room.
 * Composed into SiteFooter (not a second footer). Hidden in print via the
 * root layout `print:hidden` wrapper, plus `print:hidden` here, and omitted
 * on public signature / fill / print routes.
 */
export function OfisenseCredit() {
  const pathname = usePathname();
  if (isDocumentChromeHidden(pathname)) {
    return null;
  }

  return (
    <div
      className="flex h-6 items-center justify-center gap-1 overflow-hidden border-t border-border/70 bg-white/45 px-1.5 text-[10.5px] leading-none text-muted-foreground backdrop-blur sm:gap-1.5 sm:px-2 print:hidden"
      aria-label="פותח על ידי Ofisense בשיתוף Business Room"
    >
      <span className="shrink-0">פותח על ידי</span>
      <CreditLogoLink
        href={OFISENSE_HREF}
        src="/ofisense-logo.png"
        alt="Ofisense"
        width={945}
        height={145}
      />
      <span className="shrink-0">בשיתוף</span>
      <CreditLogoLink
        href={BUSINESSROOM_HREF}
        src="/businessroom-logo.png"
        alt="Business Room"
        width={965}
        height={250}
      />
    </div>
  );
}
