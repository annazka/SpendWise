import { apiError } from "@/lib/api-response";
import { downloadPrivateObject, supabaseRest } from "@/lib/supabase-server";
import { requireWalletSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const wallet = (await requireWalletSession()).toLowerCase();
    const { id } = await context.params;
    const rows = await supabaseRest<Array<{ storage_path: string; file_name: string }>>(
      `report_exports?id=eq.${encodeURIComponent(id)}&wallet_address=eq.${encodeURIComponent(wallet)}&select=storage_path,file_name&limit=1`,
    );
    if (!rows[0]) return Response.json({ error: "Report not found." }, { status: 404 });
    const file = await downloadPrivateObject("reports", rows[0].storage_path);
    if (!file.ok || !file.body) return Response.json({ error: "Report file is unavailable." }, { status: 404 });
    return new Response(file.body, { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${rows[0].file_name.replace(/["\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) { return apiError(error); }
}
