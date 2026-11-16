/** הדגמה ציבורית — אין חיבור לספק תשלום. */

export function isSumitApiConfigured(): boolean {
  return false;
}

export interface SumitApiResponse {
  Status: number;
  UserErrorMessage?: string;
  Data?: Record<string, unknown>;
}

export async function sumitPost(
  _path: string,
  _body: Record<string, unknown>
): Promise<SumitApiResponse> {
  return { Status: 1, UserErrorMessage: "DEMO_PAYMENT_DISABLED" };
}

export interface SumitPaymentRecord {
  transactionId: string;
  validPayment: boolean;
  amountIls: number | null;
  customerId: string | null;
  statusDescription: string | null;
  raw: Record<string, unknown>;
}

export async function fetchSumitPayment(
  _paymentId: string
): Promise<SumitPaymentRecord | null> {
  return null;
}
