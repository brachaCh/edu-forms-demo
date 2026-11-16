"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, FileVideo } from "lucide-react";
import { CategoryDetailShell } from "@/components/dashboard/CategoryDetailShell";
import { Card, CardContent } from "@/components/ui/card";
import { EditableText } from "@/components/editable/EditableText";
import { parseSafeFromParam, sanitizeBackHrefForSession } from "@/lib/navigation-back";
import { useSessionHome } from "@/components/layout/useSessionHome";
import { toEmbeddableVideoUrl } from "@/lib/tutorials-store";
import type { TutorialRecord } from "@/lib/tutorials";

function TutorialMedia({ tutorial }: { tutorial: TutorialRecord }) {
  if (!tutorial.url) {
    return (
      <div className="mb-3 flex aspect-video items-center justify-center rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 text-brand-500">
        <FileVideo className="h-12 w-12" strokeWidth={1.5} />
      </div>
    );
  }

  const embed = toEmbeddableVideoUrl(tutorial.url);

  if (embed.kind === "youtube" || embed.kind === "vimeo") {
    return (
      <div className="mb-3 overflow-hidden rounded-xl">
        <iframe
          src={embed.src}
          title={tutorial.title}
          className="aspect-video w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (embed.kind === "drive") {
    return (
      <div className="mb-3">
        <div className="overflow-hidden rounded-xl">
          <iframe
            src={embed.src}
            title={tutorial.title}
            className="aspect-video w-full border-0"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
        {embed.original && (
          <a
            href={embed.original}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            פתיחה בחלון חדש
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-xl bg-black">
      <video
        src={embed.src}
        controls
        className="aspect-video w-full"
        preload="metadata"
      >
        <track kind="captions" />
      </video>
    </div>
  );
}

export function TutorialsPageClient() {
  const [items, setItems] = useState<TutorialRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/tutorials")
      .then(async (response) => {
        if (!response.ok) throw new Error("LOAD_FAILED");
        return (await response.json()) as { tutorials?: TutorialRecord[] };
      })
      .then((data) => {
        if (!cancelled) setItems(data.tutorials ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("LOAD_FAILED");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const searchParams = useSearchParams();
  const { guestDemo, loggedIn, homeHref } = useSessionHome();
  const treatAsLoggedIn = guestDemo || loggedIn;
  const backHref = sanitizeBackHrefForSession(
    parseSafeFromParam(searchParams.get("from")) ?? "/",
    treatAsLoggedIn,
    loggedIn ? homeHref : undefined
  );

  return (
    <CategoryDetailShell
      titlePath="categories.tutorials"
      subtitlePath="categories.tutorialsSubtitle"
      backHref={backHref}
      backTextPath="common.back"
    >
      {!ready ? (
        <div className="menu-box p-8 text-center text-pink">
          <EditableText path="common.loading" />
        </div>
      ) : error ? (
        <div className="menu-box p-8 text-center text-pink">
          לא ניתן לטעון את סרטוני ההדרכה
        </div>
      ) : items.length === 0 ? (
        <div className="menu-box p-8 text-center text-pink">
          <EditableText path="tutorials.emptyList" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((tutorial) => (
            <Card key={tutorial.id}>
              <CardContent className="p-6">
                <TutorialMedia tutorial={tutorial} />
                <h3 className="mb-1 font-bold text-brand-900">{tutorial.title}</h3>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </CategoryDetailShell>
  );
}
