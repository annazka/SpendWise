import { createHash, randomUUID } from "node:crypto";
import { apiError } from "@/lib/api-response";
import { supabaseRest } from "@/lib/supabase-server";
import { requireWalletSession } from "@/lib/wallet-session";

const currencies = ["IDR", "USD", "MYR", "SGD"] as const;

type VeryfiField<T> = T | { value?: T | null; score?: number | null } | null;
type VeryfiDocument = {
  id?: number;
  vendor?: { name?: VeryfiField<string> };
  date?: VeryfiField<string>;
  total?: VeryfiField<number>;
  currency_code?: VeryfiField<string>;
  category?: VeryfiField<string>;
  notes?: VeryfiField<string>;
  document_type?: VeryfiField<string>;
  duplicate_of?: number | null;
  warnings?: string[];
  meta?: {
    duplicates?: Array<{ id?: number; score?: number }>;
    pages?: Array<{ is_blurry?: VeryfiField<boolean>; ai_generated?: VeryfiField<boolean> }>;
    fraud?: { color?: string; decision?: string; score?: number };
  };
};

function valueOf<T>(field: VeryfiField<T>): T | null {
  if (field == null) return null;
  if (typeof field === "object" && "value" in field) return field.value ?? null;
  return field as T;
}

function normalizeDate(value: string | null) {
  if (!value) return "";
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match && !Number.isNaN(Date.parse(`${match[0]}T00:00:00Z`)) ? match[0] : "";
}

function mapCategory(value: string | null) {
  const text = (value || "").toLowerCase();
  if (/restaurant|food|meal|cafe|coffee|dining/.test(text)) return "Food & drinks";
  if (/grocery|supermarket|market/.test(text)) return "Groceries";
  if (/transport|taxi|parking|fuel|gas|travel/.test(text)) return "Transport";
  if (/shopping|retail|clothing|electronics/.test(text)) return "Shopping";
  return "Other";
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const clientId = process.env.VERYFI_CLIENT_ID;
  const username = process.env.VERYFI_USERNAME;
  const apiKey = process.env.VERYFI_API_KEY;
  if (!clientId || !username || !apiKey) {
    return Response.json({ error: "Receipt scanning is not configured yet. Manual entry is disabled." }, { status: 503 });
  }

  try {
    const wallet = (await requireWalletSession()).toLowerCase();
    const form = await request.formData();
    const file = form.get("receipt");
    const currency = form.get("currency");
    if (typeof currency !== "string" || !currencies.includes(currency as typeof currencies[number])) {
      return Response.json({ error: "Choose a supported currency account." }, { status: 400 });
    }
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      return Response.json({ error: "Use a JPG, PNG, WebP, or PDF file smaller than 20 MB." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const receiptHash = createHash("sha256").update(bytes).digest("hex");
    const savedDuplicate = await supabaseRest<Array<{ id: string }>>(
      `expenses?wallet_address=eq.${encodeURIComponent(wallet)}&receipt_hash=eq.${receiptHash}&select=id&limit=1`,
    );
    if (savedDuplicate.length) return Response.json({ status: "REJECTED", reasons: ["This receipt was already saved. Renaming the file does not create a new receipt."], receiptHash }, { status: 409 });
    const upload = new FormData();
    upload.append("file", new Blob([bytes], { type: file.type }), file.name);
    upload.append("file_name", file.name);
    upload.append("document_type", "receipt");
    upload.append("confidence_details", "true");
    upload.append("auto_delete", "true");
    upload.append("country", currency === "IDR" ? "ID" : currency === "MYR" ? "MY" : currency === "SGD" ? "SG" : "US");

    const upstream = await fetch("https://api.veryfi.com/api/v8/partner/documents", {
      method: "POST",
      headers: {
        "CLIENT-ID": clientId,
        AUTHORIZATION: `apikey ${username}:${apiKey}`,
        "Idempotency-Key": randomUUID(),
      },
      body: upload,
      signal: AbortSignal.timeout(55_000),
    });
    const data = await upstream.json().catch(() => ({})) as VeryfiDocument & { error?: string; message?: string };
    if (!upstream.ok) {
      console.error("Veryfi error", upstream.status, data);
      return Response.json({ error: data.error || data.message || "The receipt service is unavailable. Try again later." }, { status: 502 });
    }

    const store = valueOf(data.vendor?.name ?? null)?.trim() || "";
    const date = normalizeDate(valueOf(data.date ?? null));
    const amount = valueOf(data.total ?? null);
    const detectedCurrency = valueOf(data.currency_code ?? null)?.toUpperCase() || "";
    const documentType = valueOf(data.document_type ?? null)?.toLowerCase() || "";
    const providerDuplicateIds = [
      data.duplicate_of,
      ...(data.meta?.duplicates || []).filter((item) => (item.score || 0) >= 0.9).map((item) => item.id),
    ].filter((id): id is number => typeof id === "number");
    const savedProviderDuplicate = providerDuplicateIds.length
      ? await supabaseRest<Array<{ id: string }>>(
        `expenses?wallet_address=eq.${encodeURIComponent(wallet)}&provider_document_id=in.(${providerDuplicateIds.join(",")})&select=id&limit=1`,
      )
      : [];
    const duplicate = savedProviderDuplicate.length > 0;
    const blurry = Boolean(data.meta?.pages?.some((page) => valueOf(page.is_blurry ?? null) === true));
    const aiGenerated = Boolean(data.meta?.pages?.some((page) => valueOf(page.ai_generated ?? null) === true));
    const fraudColor = data.meta?.fraud?.color?.toLowerCase();

    const reasons: string[] = [];
    if (documentType && !documentType.includes("receipt") && documentType !== "invoice") reasons.push("The uploaded file is not recognized as a receipt.");
    if (!store) reasons.push("Merchant name could not be verified.");
    if (!date) reasons.push("Transaction date could not be verified.");
    if (typeof amount !== "number" || amount <= 0) reasons.push("A valid paid total could not be verified.");
    if (detectedCurrency && detectedCurrency !== currency) reasons.push(`This receipt uses ${detectedCurrency}, not ${currency}.`);
    if (duplicate) reasons.push("This receipt appears to be a duplicate.");
    if (blurry) reasons.push("The receipt image is too blurry.");
    if (aiGenerated || fraudColor === "red") reasons.push("The receipt failed the authenticity check.");

    if (reasons.length) return Response.json({ status: "REJECTED", reasons, receiptHash }, { status: 422 });

    return Response.json({
      status: "APPROVED",
      validationLabel: "APPROVED RECEIPT",
      store: store.slice(0, 100),
      date,
      amount,
      currency,
      category: mapCategory(valueOf(data.category ?? null)),
      notes: valueOf(data.notes ?? null)?.trim().slice(0, 240) || "",
      receiptHash,
      providerDocumentId: data.id ? String(data.id) : null,
      warnings: data.warnings || [],
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHORIZED" || error.message.includes("Supabase is not configured") || error.message.includes("SPENDWISE_SESSION_SECRET"))) return apiError(error);
    console.error("Receipt scan failed", error);
    return Response.json({ error: "Could not validate this receipt. Try a clearer photo." }, { status: 502 });
  }
}
