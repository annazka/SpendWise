import { apiError } from "@/lib/api-response";
import { createWalletChallenge } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { wallet } = await request.json() as { wallet?: string };
    if (!wallet) return Response.json({ error: "Wallet address is required." }, { status: 400 });
    return Response.json(await createWalletChallenge(wallet));
  } catch (error) { return apiError(error); }
}
