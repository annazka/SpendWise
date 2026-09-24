import { apiError } from "@/lib/api-response";
import { supabaseRest } from "@/lib/supabase-server";
import { requireWalletSession } from "@/lib/wallet-session";

const currencies = ["IDR", "USD", "MYR", "SGD"] as const;

type DbExpense = {
  id: string; merchant: string; expense_date: string; amount: number | string; category: string; currency: string;
  tx_hash: string | null; onchain_id: string | null; status: "APPROVED"; receipt_hash: string;
  provider_document_id: string | null; receipt_path: string; receipt_mime: string; notes: string | null;
};

function expense(row: DbExpense) {
  return {
    id: row.id, store: row.merchant, date: row.expense_date, amount: Number(row.amount), category: row.category,
    currency: row.currency, tx_hash: row.tx_hash, onchain_id: row.onchain_id, validation_status: row.status,
    receipt_hash: row.receipt_hash, provider_document_id: row.provider_document_id,
    receipt_file_key: row.receipt_path, receipt_mime: row.receipt_mime, notes: row.notes,
  };
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const wallet = (await requireWalletSession()).toLowerCase();
    const currency = new URL(request.url).searchParams.get("currency") || "IDR";
    if (!currencies.includes(currency as typeof currencies[number])) return Response.json({ error: "Unsupported currency." }, { status: 400 });

    await supabaseRest("currency_accounts?on_conflict=wallet_address,currency", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ wallet_address: wallet, currency }),
    });

    const [accounts, rows, reports] = await Promise.all([
      supabaseRest<Array<{ currency: string; budget_amount: number | string | null; budget_start: string | null; budget_end: string | null }>>(
        `currency_accounts?wallet_address=eq.${encodeURIComponent(wallet)}&currency=eq.${currency}&select=currency,budget_amount,budget_start,budget_end&limit=1`,
      ),
      supabaseRest<DbExpense[]>(
        `expenses?wallet_address=eq.${encodeURIComponent(wallet)}&select=id,merchant,expense_date,amount,category,currency,tx_hash,onchain_id,status,receipt_hash,provider_document_id,receipt_path,receipt_mime,notes&order=expense_date.desc,created_at.desc`,
      ),
      supabaseRest<Array<{ id: string; file_name: string; range_label: string; created_at: string; file_size: number | string; transaction_count: number; storage_path: string }>>(
        `report_exports?wallet_address=eq.${encodeURIComponent(wallet)}&select=id,file_name,range_label,created_at,file_size,transaction_count,storage_path&order=created_at.desc&limit=20`,
      ),
    ]);
    const account = accounts[0] || { currency, budget_amount: null, budget_start: null, budget_end: null };
    const allExpenses = rows.map(expense);
    return Response.json({
      account: { ...account, budget_amount: account.budget_amount == null ? null : Number(account.budget_amount) },
      expenses: allExpenses.filter((item) => item.currency === currency),
      allExpenses,
      reports: reports.map((item) => ({
        id: item.id, fileName: item.file_name, range: item.range_label, generatedAt: item.created_at,
        size: Number(item.file_size), transactionCount: item.transaction_count, fileKey: item.storage_path,
      })),
    });
  } catch (error) { return apiError(error); }
}
