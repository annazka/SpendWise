import { apiError } from "@/lib/api-response";
import { downloadPrivateObject, supabaseRest } from "@/lib/supabase-server";
import { requireWalletSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const wallet = (await requireWalletSession()).toLowerCase();
    const { id } = await context.params;
    const rows = await supabaseRest<Array<{ receipt_path: string; receipt_mime: string }>>(
      `expenses?id=eq.${encodeURIComponent(id)}&wallet_address=eq.${encodeURIComponent(wallet)}&select=receipt_path,receipt_mime&limit=1`,
    );
    if (!rows[0]) return Response.json({ error: "Receipt not found." }, { status: 404 });
    const file = await downloadPrivateObject("receipts", rows[0].receipt_path);
    if (!file.ok || !file.body) return Response.json({ error: "Receipt file is unavailable." }, { status: 404 });
    return new Response(file.body, { headers: { "Content-Type": rows[0].receipt_mime, "Cache-Control": "private, max-age=300" } });
  } catch (error) { return apiError(error); }
}
