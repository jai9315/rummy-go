import { Card as CardType } from "@/types";

export type TableDragItem =
  | { kind: "HAND_CARD"; cardId: string; card?: CardType }
  | { kind: "DRAW_CLOSED" }
  | { kind: "DRAW_OPEN"; card?: CardType };

export type TableDropZone =
  | { zone: "discard-pile" }
  | { zone: "declare-slot" }
  | { zone: "hand-tray" }
  | { zone: "meld-group"; groupIndex: number; cardIndex?: number }
  | { zone: "new-group"; groupIndex: number };

export const RUMMY_DRAG_MIME = "application/x-rummy-drag";

interface SerializedDragPayload {
  kind: TableDragItem["kind"];
  cardId?: string;
}

export function serializeDragItem(item: TableDragItem): string {
  const payload: SerializedDragPayload =
    item.kind === "HAND_CARD"
      ? { kind: "HAND_CARD", cardId: item.cardId }
      : { kind: item.kind };
  return JSON.stringify(payload);
}

export function parseDragDataTransfer(
  dt: DataTransfer | null,
  fallback: TableDragItem | null
): TableDragItem | null {
  if (dt) {
    const raw = dt.getData(RUMMY_DRAG_MIME);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<SerializedDragPayload>;
        if (parsed.kind === "DRAW_CLOSED") return { kind: "DRAW_CLOSED" };
        if (parsed.kind === "DRAW_OPEN") return { kind: "DRAW_OPEN" };
        if (parsed.kind === "HAND_CARD" && typeof parsed.cardId === "string") {
          return { kind: "HAND_CARD", cardId: parsed.cardId };
        }
      } catch {
        // Fall through to text/plain or React state fallback
      }
    }

    const plain = dt.getData("text/plain");
    if (plain === "DRAW_CLOSED") return { kind: "DRAW_CLOSED" };
    if (plain === "DRAW_OPEN") return { kind: "DRAW_OPEN" };
    if (plain) return { kind: "HAND_CARD", cardId: plain };
  }

  return fallback;
}

export function isSameDropZone(
  a: TableDropZone | null,
  b: TableDropZone | null
): boolean {
  if (a === b) return true;
  if (!a || !b || a.zone !== b.zone) return false;
  if (a.zone === "meld-group" && b.zone === "meld-group") {
    return a.groupIndex === b.groupIndex && a.cardIndex === b.cardIndex;
  }
  if (a.zone === "new-group" && b.zone === "new-group") {
    return a.groupIndex === b.groupIndex;
  }
  return true;
}
