import { apiError } from "@/lib/api-response";
import { deletePrivateObject, supabaseRest, uploadPrivateObject } from "@/lib/supabase-server";
import { requireWalletSession } from "@/lib/wallet-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let storagePath = "";
  try {
    const wallet = (await requireWalletSession()).toLowerCase();
    const form = await request.formData();
    const file = form.get("report");
    const id = String(form.get("id") || "");
    const fileName = String(form.get("fileName") || "");
    const range = String(form.get("range") || "");
    const transactionCount = Number(form.get("transactionCount"));
    if (!(file instanceof File) || file.type !== "application/pdf" || !id || !fileName || !range || !Number.isSafeInteger(transactionCount)) return Response.json({ error: "Invalid report." }, { status: 400 });
    storagePath = `${wallet}/${id}.pdf`;
    await uploadPrivateObject("reports", storagePath, await file.arrayBuffer(), "application/pdf");
    const rows = await supabaseRest<Array<{ created_at: string }>>("report_exports", {
      method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        id, wallet_address: wallet, file_name: fileName, range_label: range, storage_path: storagePath,
        file_size: file.size, transaction_count: transactionCount,
      }),
    });
    return Response.json({ item: { id, fileName, range, generatedAt: rows[0]?.created_at || new Date().toISOString(), size: file.size, transactionCount, fileKey: storagePath } }, { status: 201 });
  } catch (error) {
    if (storagePath) await deletePrivateObject("reports", [storagePath]).catch(() => undefined);
    return apiError(error);
  }
}
