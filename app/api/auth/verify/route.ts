import { apiError } from "@/lib/api-response";
import { supabaseRest } from "@/lib/supabase-server";
import { verifyWalletChallenge } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { wallet, signature } = await request.json() as { wallet?: string; signature?: string };
    if (!wallet || !signature) return Response.json({ error: "Wallet and signature are required." }, { status: 400 });
    const verified = await verifyWalletChallenge(wallet, signature);
    await supabaseRest("users?on_conflict=wallet_address", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ wallet_address: verified.toLowerCase() }),
    });
    return Response.json({ wallet: verified });
  } catch (error) { return apiError(error); }
}
