import type { BillingPlan } from "@/lib/sumit/plan-catalog";
import type { UserProfile } from "@/lib/supabase/types";
import { sumitPost } from "@/lib/sumit/client";

export interface BeginRedirectInput {
  profile: Pick<UserProfile, "full_name" | "email" | "phone" | "institution_id">;
  plan: BillingPlan;
  returnUrl: string;
  cancelUrl: string;
  ipnUrl: string;
}

function chargeItemName(plan: BeginRedirectInput["plan"]): string {
  if (!plan.isCustom) return plan.title;
  const details = plan.features.filter(Boolean).join(", ");
  return details ? `${plan.title} — ${details}` : plan.title;
}

export async function startSumitBeginRedirect(
  input: BeginRedirectInput
): Promise<string> {
  const itemPayload: Record<string, unknown> = {
    SearchMode: "Automatic",
    Name: chargeItemName(input.plan),
  };

  if (input.plan.sumitItemId) {
    itemPayload.ID = Number(input.plan.sumitItemId);
  }
  if (input.plan.sumitSku) {
    itemPayload.SKU = input.plan.sumitSku;
  }

  const request: Record<string, unknown> = {
    Customer: {
      Name: input.profile.full_name,
      EmailAddress: input.profile.email,
      Phone: input.profile.phone,
      ExternalIdentifier: input.profile.institution_id,
      SearchMode: "Automatic",
    },
    Items: [
      {
        Item: itemPayload,
        Quantity: 1,
        UnitPrice: input.plan.priceAg / 100,
        Currency: "ILS",
      },
    ],
    RedirectURL: input.returnUrl,
    CancelRedirectURL: input.cancelUrl,
    IPNURL: input.ipnUrl,
    PaymentsCount: 1,
  };

  const response = await sumitPost("/billing/payments/beginredirect/", request);

  if (response.Status !== 0) {
    throw new Error(response.UserErrorMessage ?? "SUMIT_BEGINREDIRECT_FAILED");
  }

  const redirectUrl = response.Data?.RedirectURL;
  if (typeof redirectUrl !== "string" || !redirectUrl.startsWith("https://")) {
    throw new Error("SUMIT_BEGINREDIRECT_NO_URL");
  }

  return redirectUrl;
}
