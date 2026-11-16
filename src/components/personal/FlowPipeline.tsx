"use client";

import Link from "next/link";
import {
  IdCard,
  LayoutGrid,
  ArrowLeft,
  Plus,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

interface Stage {
  step: number;
  href: string;
  title: string;
  icon: LucideIcon;
  items: string[];
  cta: { label: string; icon: LucideIcon };
}

const STAGES: Stage[] = [
  {
    step: 1,
    href: "/personal-area",
    title: "כרטיס התלמיד",
    icon: IdCard,
    items: ["בחירת קטגוריה", "הוספת תלמיד מהרשימה המסוננת"],
    cta: { label: "מעבר לאזור האישי", icon: Plus },
  },
  {
    step: 2,
    href: "/personal-area/summary",
    title: "טבלה / רשימה",
    icon: LayoutGrid,
    items: [
      "צוות החינוך המיוחד",
      "תלמידי שילוב",
      "תלמידי סל אישי",
      "כיתות חינוך מיוחד",
    ],
    cta: { label: "פתיחת טבלת הסיכום", icon: BarChart3 },
  },
];

export function FlowPipeline() {
  return (
    <section className="menu-box">
      <h2 className="mb-4 text-center text-xl font-bold text-pink">
        זרימת העבודה
      </h2>
      <div className="flex flex-col gap-4">
        {STAGES.map((stage, index) => (
          <div key={stage.step}>
            <Link href={stage.href} className="menu-item">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-dark/40">
                <stage.icon className="h-5 w-5 text-pink" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-pink">שלב {stage.step}</div>
                <div className="text-lg font-bold text-pink">{stage.title}</div>
                <ul className="mt-1 text-sm text-pink">
                  {stage.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
              <ArrowLeft className="h-5 w-5 shrink-0 text-pink" />
            </Link>
            {index < STAGES.length - 1 && (
              <div className="my-2 text-center text-pink">↓</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
