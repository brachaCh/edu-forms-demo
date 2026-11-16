"use client";

import { createContext, useContext } from "react";
import type { PersonalSector } from "@/lib/personal-sector";

const TextScopeContext = createContext<string | null>(null);

interface TextScopeProps {
  /** מגזר / קטגוריה — כל עריכת טקסט בדף תישמר רק תחת המפתח הזה */
  sector: PersonalSector;
  children: React.ReactNode;
}

export function TextScope({ sector, children }: TextScopeProps) {
  return (
    <TextScopeContext.Provider value={sector}>
      {children}
    </TextScopeContext.Provider>
  );
}

export function useTextScope(): string | null {
  return useContext(TextScopeContext);
}
