import {
  authenticatedWallet,
  bindings,
  categories,
  response,
  sameOrigin,
  session,
  validCurrency,
  validDate,
} from "@/lib/server";

function chainConfig(environment: ReturnType<typeof bindings>) {
  const mainnet = environment.BOT_CHAIN_ID === "677";
  return {
    aiEnabled: Boolean(environment.OPENAI_API_KEY),
    contractAddress: environment.BOT_CONTRACT_ADDRESS || "",
    chainId: mainnet ? 677 : 968,
    rpc: mainnet ? "https://rpc.botchain.ai" : "https://rpc.bohr.life",
    explorer: mainnet ? "https://scan.botchain.ai" : "https://scan.bohr.life",
  };
}

export async function GET(request: Request) {
  const current = session(request);
  const environment = bindings();
  const wallet = await authenticatedWallet(environment.DB, current.id);
  if (!wallet) return response({ authenticated: false }, current, 401);
  const currency = new URL(request.url).searchParams.get("currency");
  if (!validCurrency(currency)) return response({ error: "Choose a supported currency account." }, current, 400);
  try {
    const [account, transactions] = await Promise.all([
      environment.DB.prepare(
        "SELECT currency,budget_amount,budget_start,budget_end FROM currency_accounts WHERE owner=? AND currency=?",
      ).bind(wallet, currency).first(),
      environment.DB.prepare(
        "SELECT id,store,date,amount,category,currency,tx_hash,onchain_id FROM transactions WHERE owner=? AND currency=? ORDER BY date DESC,id DESC",
      ).bind(wallet, currency).all(),
    ]);
    return response({
      authenticated: true,
      wallet,
      account: account || { currency, budget_amount: null, budget_start: null, budget_end: null },
      transactions: transactions.results,
      config: chainConfig(environment),
    }, current);
  } catch (error) {
    console.error("Data read failed", error);
    return response({ error: "Your account could not be loaded. Please try again." }, current, 503);
  }
}

export async function POST(request: Request) {
  const current = session(request);
  if (!sameOrigin(request)) return response({ error: "Invalid request origin." }, current, 403);
  const environment = bindings();
  const wallet = await authenticatedWallet(environment.DB, current.id);
  if (!wallet) return response({ error: "Connect and sign in with your wallet first." }, current, 401);
  try {
    const raw = await request.text();
    if (raw.length > 8192) return response({ error: "Request is too large." }, current, 413);
    const { action, data } = JSON.parse(raw) as { action?: string; data?: Record<string, unknown> };
    if (!data || !validCurrency(data.currency)) return response({ error: "Choose a supported currency account." }, current, 400);
    const db = environment.DB;
    if (action === "budget") {
      if (data.amount === null) {
        await db.prepare(
          "INSERT INTO currency_accounts(owner,currency,budget_amount,budget_start,budget_end) VALUES(?,?,NULL,NULL,NULL) ON CONFLICT(owner,currency) DO UPDATE SET budget_amount=NULL,budget_start=NULL,budget_end=NULL",
        ).bind(wallet, data.currency).run();
        return response({ ok: true }, current);
      }
      if (!Number.isSafeInteger(data.amount) || Number(data.amount) < 1 || Number(data.amount) > 100_000_000_000) {
        return response({ error: "Enter a valid budget amount." }, current, 400);
      }
      if (!validDate(data.start) || !validDate(data.end) || String(data.start) > String(data.end)) {
        return response({ error: "Enter valid dates with the end on or after the start." }, current, 400);
      }
      await db.prepare(
        "INSERT INTO currency_accounts(owner,currency,budget_amount,budget_start,budget_end) VALUES(?,?,?,?,?) ON CONFLICT(owner,currency) DO UPDATE SET budget_amount=excluded.budget_amount,budget_start=excluded.budget_start,budget_end=excluded.budget_end",
      ).bind(wallet, data.currency, data.amount, data.start, data.end).run();
      return response({ ok: true }, current);
    }
    if (action === "transaction") {
      if (
        typeof data.id !== "string" || !/^[a-f0-9-]{36}$/.test(data.id) ||
        typeof data.store !== "string" || !data.store.trim() || data.store.length > 100 ||
        !validDate(data.date) || !categories.includes(String(data.category)) ||
        !Number.isSafeInteger(data.amount) || Number(data.amount) < 1 || Number(data.amount) > 100_000_000_000
      ) {
        return response({ error: "Check the merchant, date, amount, and category." }, current, 400);
      }
      const contractEnabled = Boolean(environment.BOT_CONTRACT_ADDRESS);
      if (contractEnabled && (typeof data.txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(data.txHash))) {
        return response({ error: "A confirmed BOT Chain transaction is required." }, current, 400);
      }
      await db.prepare(
        "INSERT INTO transactions(id,owner,store,date,amount,category,currency,tx_hash,onchain_id) VALUES(?,?,?,?,?,?,?,?,?)",
      ).bind(
        data.id,
        wallet,
        data.store.trim(),
        data.date,
        data.amount,
        data.category,
        data.currency,
        typeof data.txHash === "string" ? data.txHash : null,
        typeof data.onchainId === "string" ? data.onchainId : null,
      ).run();
      return response({ ok: true }, current);
    }
    return response({ error: "Unknown action." }, current, 400);
  } catch (error) {
    console.error("Save failed", error);
    return response({ error: "Could not save. Your input has been kept; please try again." }, current, 503);
  }
}
