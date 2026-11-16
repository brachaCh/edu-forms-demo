"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { StudentStatus } from "@/lib/supabase/types";
import {
  getCardFieldOrder,
  moveCardFieldBefore,
  resolveCardFieldOrder,
  setCardFieldOrder,
} from "@/lib/student-card";

interface CardFieldOrderContextValue {
  orderIndex: (fieldId: string) => number;
  draggingId: string | null;
  setDraggingId: (id: string | null) => void;
  moveFieldBefore: (dragId: string, targetId: string) => void;
  registerIds: (source: string, ids: string[]) => void;
}

const CardFieldOrderContext =
  createContext<CardFieldOrderContextValue | null>(null);

interface CardFieldOrderProviderProps {
  studentId: string;
  status: StudentStatus | null | undefined;
  category?: string | null;
  children: ReactNode;
}

export function CardFieldOrderProvider({
  studentId,
  status,
  category,
  children,
}: CardFieldOrderProviderProps) {
  const [bySource, setBySource] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(() =>
    getCardFieldOrder(studentId, status, category)
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    setSaved(getCardFieldOrder(studentId, status, category));
    setDraggingId(null);
    // לא מאפסים bySource — הילדים ירשמו מחדש וידרסו לפי מקור
  }, [studentId, status, category]);

  const registerIds = useCallback((source: string, ids: string[]) => {
    setBySource((prev) => {
      const previous = prev[source] ?? [];
      if (
        previous.length === ids.length &&
        previous.every((id, index) => id === ids[index])
      ) {
        return prev;
      }
      return { ...prev, [source]: ids };
    });
  }, []);

  const available = useMemo(() => {
    const core = bySource.core ?? [];
    const frequency = bySource.frequency ?? [];
    const custom = bySource.custom ?? [];
    return [...core, ...frequency, ...custom];
  }, [bySource]);

  const resolved = useMemo(
    () => resolveCardFieldOrder(saved, available),
    [saved, available]
  );

  const moveFieldBeforeTarget = useCallback(
    (dragId: string, targetId: string) => {
      setSaved((prev) => {
        const base = resolveCardFieldOrder(prev, available);
        const next = moveCardFieldBefore(base, dragId, targetId);
        setCardFieldOrder(studentId, next, status, category);
        return next;
      });
    },
    [available, studentId, status, category]
  );

  const value = useMemo<CardFieldOrderContextValue>(
    () => ({
      orderIndex: (fieldId: string) => {
        const inResolved = resolved.indexOf(fieldId);
        if (inResolved >= 0) return inResolved;
        // בזמן טעינה — נשענים על הסדר השמור כדי לא לאפס הכל ל־0
        const inSaved = saved.indexOf(fieldId);
        return inSaved >= 0 ? inSaved : 0;
      },
      draggingId,
      setDraggingId,
      moveFieldBefore: moveFieldBeforeTarget,
      registerIds,
    }),
    [resolved, saved, draggingId, moveFieldBeforeTarget, registerIds]
  );

  return (
    <CardFieldOrderContext.Provider value={value}>
      {children}
    </CardFieldOrderContext.Provider>
  );
}

export function useCardFieldOrder(): CardFieldOrderContextValue {
  const ctx = useContext(CardFieldOrderContext);
  if (!ctx) {
    return {
      orderIndex: () => 0,
      draggingId: null,
      setDraggingId: () => undefined,
      moveFieldBefore: () => undefined,
      registerIds: () => undefined,
    };
  }
  return ctx;
}
