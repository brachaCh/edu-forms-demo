const TRANSACTION_PARAM_KEYS = [
  "OG-PaymentID",
  "OG-PaymentId",
  "ID",
  "PaymentID",
  "PaymentId",
  "TransactionID",
  "TransactionId",
  "transaction_id",
  "transactionId",
  "payment_id",
  "paymentId",
];

export function extractSumitTransactionId(
  params: Record<string, string | undefined>
): string | null {
  for (const key of TRANSACTION_PARAM_KEYS) {
    const value = params[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function extractSumitTransactionIdFromSearch(
  searchParams: URLSearchParams
): string | null {
  const record: Record<string, string | undefined> = {};
  searchParams.forEach((value, key) => {
    record[key] = value;
  });
  return extractSumitTransactionId(record);
}
