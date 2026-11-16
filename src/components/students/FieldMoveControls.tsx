"use client";

import type { DragEvent } from "react";
import { GripVertical } from "lucide-react";
import { useCardFieldOrder } from "@/components/students/CardFieldOrderContext";
import { cn } from "@/lib/utils";

interface FieldDragHandleProps {
  fieldId: string;
}

/** ידית גרירה — סמן יד במנוחה, יד תופסת בזמן גרירה */
export function FieldDragHandle({ fieldId }: FieldDragHandleProps) {
  const { setDraggingId } = useCardFieldOrder();

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", fieldId);
        event.dataTransfer.effectAllowed = "move";
        setDraggingId(fieldId);
        document.body.classList.add("cursor-grabbing");
      }}
      onDragEnd={() => {
        setDraggingId(null);
        document.body.classList.remove("cursor-grabbing");
      }}
      className={cn(
        "flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md border border-border bg-white text-pink/70",
        "hover:bg-brand-50 hover:text-pink",
        "active:cursor-grabbing"
      )}
      aria-label="גרור לשינוי מיקום"
      title="גרור לשינוי מיקום"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

export function useFieldDropHandlers(fieldId: string) {
  const { moveFieldBefore, draggingId, setDraggingId } = useCardFieldOrder();

  return {
    isDragging: draggingId === fieldId,
    dropProps: {
      onDragOver: (event: DragEvent) => {
        if (!draggingId || draggingId === fieldId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const dragId =
          event.dataTransfer.getData("text/plain") || draggingId || "";
        if (!dragId || dragId === fieldId) return;
        moveFieldBefore(dragId, fieldId);
        setDraggingId(null);
      },
    },
  };
}
