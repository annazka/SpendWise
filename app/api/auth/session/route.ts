import { apiError } from "@/lib/api-response";
import { clearWalletSession, getWalletSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function GET() {
  try { return Response.json({ wallet: await getWalletSession() }); }
  catch (error) { return apiError(error); }
}

export async function DELETE() {
  try { await clearWalletSession(); return Response.json({ ok: true }); }
  catch (error) { return apiError(error); }
}
