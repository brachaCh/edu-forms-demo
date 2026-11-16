import { isSumitApiConfigured, sumitPost } from "@/lib/sumit/client";

export interface SumitIncomeItem {
  id: string;
  name: string;
  description: string;
  priceIls: number;
  sku: string;
  raw: Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeIncomeItem(raw: Record<string, unknown>): SumitIncomeItem | null {
  const id =
    readString(raw.ID) ||
    readString(raw.Id) ||
    (typeof raw.ID === "number" ? String(raw.ID) : "");
  const name = readString(raw.Name);
  const sku =
    readString(raw.SKU) ||
    readString(raw.Sku) ||
    readString(raw.CatalogNumber) ||
    readString(raw.CatalogID);
  const priceIls = readNumber(raw.Price) ?? readNumber(raw.UnitPrice);

  if (!id || !name || priceIls === null) return null;

  return {
    id,
    name,
    description: readString(raw.Description),
    priceIls,
    sku,
    raw,
  };
}

export async function listSumitIncomeItems(): Promise<SumitIncomeItem[]> {
  if (!isSumitApiConfigured()) return [];

  const items: SumitIncomeItem[] = [];
  let startIndex = 0;
  const pageSize = 100;
  let hasNext = true;

  while (hasNext) {
    const response = await sumitPost("/accounting/incomeitems/list/", {
      Paging: {
        StartIndex: startIndex,
        PageSize: pageSize,
      },
    });

    if (response.Status !== 0 || !response.Data) {
      throw new Error(
        response.UserErrorMessage ?? "SUMIT_INCOME_ITEMS_LIST_FAILED"
      );
    }

    const rawItems = response.Data.IncomeItems;
    if (Array.isArray(rawItems)) {
      for (const entry of rawItems) {
        if (entry && typeof entry === "object") {
          const normalized = normalizeIncomeItem(entry as Record<string, unknown>);
          if (normalized) items.push(normalized);
        }
      }
    }

    hasNext = Boolean(response.Data.HasNextPage);
    startIndex += pageSize;
    if (!hasNext) break;
    if (startIndex > 1000) break;
  }

  return items;
}
