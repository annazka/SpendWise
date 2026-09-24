import { apiError } from "@/lib/api-response";
import { supabaseRest } from "@/lib/supabase-server";
import { requireWalletSession } from "@/lib/wallet-session";

const currencies = ["IDR", "USD", "MYR", "SGD"];

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const wallet = (await requireWalletSession()).toLowerCase();
    const { currency, amount, start, end } = await request.json() as { currency?: string; amount?: number | null; start?: string | null; end?: string | null };
    if (!currency || !currencies.includes(currency)) return Response.json({ error: "Unsupported currency." }, { status: 400 });
    if (amount != null && (!Number.isSafeInteger(amount) || amount < 0 || !start || !end || start > end)) {
      return Response.json({ error: "Enter a valid budget and date range." }, { status: 400 });
    }
    const payload = {
      wallet_address: wallet, currency,
      budget_amount: amount == null ? null : amount,
      budget_start: amount == null ? null : start,
      budget_end: amount == null ? null : end,
      updated_at: new Date().toISOString(),
    };
    const rows = await supabaseRest<Array<Record<string, unknown>>>("currency_accounts?on_conflict=wallet_address,currency", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(payload),
    });
    return Response.json({ account: rows[0] });
  } catch (error) { return apiError(error); }
}
