import { createHash } from "node:crypto";
import { apiError } from "@/lib/api-response";
import { deletePrivateObject, supabaseRest, uploadPrivateObject } from "@/lib/supabase-server";
import { requireWalletSession } from "@/lib/wallet-session";

const currencies = ["IDR", "USD", "MYR", "SGD"];
const mimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let uploadedPath = "";
  try {
    const wallet = (await requireWalletSession()).toLowerCase();
    const form = await request.formData();
    const receipt = form.get("receipt");
    const id = String(form.get("id") || "");
    const merchant = String(form.get("merchant") || "").trim();
    const amount = Number(form.get("amount"));
    const expenseDate = String(form.get("date") || "");
    const category = String(form.get("category") || "Other").trim();
    const currency = String(form.get("currency") || "");
    const notes = String(form.get("notes") || "").trim().slice(0, 240);
    const providerDocumentId = String(form.get("providerDocumentId") || "").trim() || null;
    const approvedHash = String(form.get("receiptHash") || "").toLowerCase();
    if (!(receipt instanceof File) || !mimeTypes.includes(receipt.type) || receipt.size > 20 * 1024 * 1024) return Response.json({ error: "Invalid receipt file." }, { status: 400 });
    if (!/^[0-9a-f-]{36}$/i.test(id) || !merchant || !Number.isSafeInteger(amount) || amount < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || !currencies.includes(currency)) {
      return Response.json({ error: "The verified expense details are incomplete." }, { status: 400 });
    }
    const bytes = await receipt.arrayBuffer();
    const receiptHash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    if (!approvedHash || approvedHash !== receiptHash) return Response.json({ error: "The receipt changed after AI validation. Scan it again." }, { status: 409 });

    const duplicateFilter = providerDocumentId
      ? `or=(receipt_hash.eq.${receiptHash},provider_document_id.eq.${encodeURIComponent(providerDocumentId)})`
      : `receipt_hash=eq.${receiptHash}`;
    const duplicates = await supabaseRest<Array<{ id: string }>>(`expenses?${duplicateFilter}&select=id&limit=1`);
    if (duplicates.length) return Response.json({ error: "This receipt was already saved. Renaming the file does not create a new receipt." }, { status: 409 });

    const extension = receipt.type === "application/pdf" ? "pdf" : receipt.type.split("/")[1].replace("jpeg", "jpg");
    uploadedPath = `${wallet}/${id}/original.${extension}`;
    await uploadPrivateObject("receipts", uploadedPath, bytes, receipt.type);
    const expenseHash = createHash("sha256").update(JSON.stringify({ wallet, id, merchant, amount, expenseDate, category, currency, receiptHash })).digest("hex");
    const rows = await supabaseRest<Array<Record<string, unknown>>>("expenses", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id, wallet_address: wallet, merchant, amount, expense_date: expenseDate, category, currency, notes,
        receipt_path: uploadedPath, receipt_mime: receipt.type, receipt_hash: receiptHash,
        provider_document_id: providerDocumentId, expense_hash: expenseHash, status: "APPROVED",
      }),
    });
    return Response.json({ expense: rows[0] }, { status: 201 });
  } catch (error) {
    if (uploadedPath) await deletePrivateObject("receipts", [uploadedPath]).catch(() => undefined);
    return apiError(error);
  }
}
