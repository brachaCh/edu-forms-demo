"use client";

import { HourglassWidget } from "@/components/hours/HourglassWidget";

const SHOW_HOURGLASS: boolean = false;

export function HourglassWidgetShell() {
  if (!SHOW_HOURGLASS) return null;
  return <HourglassWidget />;
}
