import { apiError } from "@/lib/api-response";
import { supabaseRest } from "@/lib/supabase-server";
import { requireWalletSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const wallet = (await requireWalletSession()).toLowerCase();
    const { id } = await context.params;
    const { txHash, onchainId } = await request.json() as { txHash?: string; onchainId?: string };
    if (!/^0x[0-9a-f]{64}$/i.test(txHash || "") || !/^0x[0-9a-f]{64}$/i.test(onchainId || "")) return Response.json({ error: "Invalid blockchain proof." }, { status: 400 });
    const rows = await supabaseRest<Array<Record<string, unknown>>>(
      `expenses?id=eq.${encodeURIComponent(id)}&wallet_address=eq.${encodeURIComponent(wallet)}&tx_hash=is.null`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ tx_hash: txHash, onchain_id: onchainId }) },
    );
    if (!rows.length) return Response.json({ error: "Expense was not found or is already recorded." }, { status: 404 });
    return Response.json({ expense: rows[0] });
  } catch (error) { return apiError(error); }
}
