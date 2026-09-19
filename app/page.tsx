"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Bus,
  CalendarDays,
  CheckCircle2,
  Coffee,
  LogOut,
  Plus,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";
import { authenticateWallet, recordExpense } from "@/lib/chain";

const CURRENCIES = {
  IDR: { name: "Indonesian Rupiah", symbol: "Rp", locale: "id-ID", decimals: 0, accent: "emerald" },
  USD: { name: "US Dollar", symbol: "$", locale: "en-US", decimals: 2, accent: "blue" },
  MYR: { name: "Malaysian Ringgit", symbol: "RM", locale: "ms-MY", decimals: 2, accent: "amber" },
  SGD: { name: "Singapore Dollar", symbol: "S$", locale: "en-SG", decimals: 2, accent: "violet" },
} as const;

type Currency = keyof typeof CURRENCIES;
type Account = { currency: Currency; budget_amount: number | null; budget_start: string | null; budget_end: string | null };
type Expense = {
  id: string;
  store: string;
  date: string;
  amount: number;
  category: string;
  currency: Currency;
  tx_hash: string | null;
  onchain_id: string | null;
};
type Config = { aiEnabled: boolean; contractAddress: string; chainId: number; rpc: string; explorer: string };

const categories = ["Food & drinks", "Groceries", "Transport", "Shopping", "Other"];
const today = () => new Date().toLocaleDateString("en-CA");

function toMinor(value: string, currency: Currency) {
  const number = Number(value);
  const factor = 10 ** CURRENCIES[currency].decimals;
  return Number.isFinite(number) ? Math.round(number * factor) : 0;
}

function fromMinor(value: number, currency: Currency) {
  return new Intl.NumberFormat(CURRENCIES[currency].locale, {
    style: "currency",
    currency,
    minimumFractionDigits: CURRENCIES[currency].decimals,
    maximumFractionDigits: CURRENCIES[currency].decimals,
  }).format(value / 10 ** CURRENCIES[currency].decimals);
}

export default function Home() {
  const [auth, setAuth] = useState<"checking" | "guest" | "connected">("checking");
  const [wallet, setWallet] = useState("");
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [config, setConfig] = useState<Config>({ aiEnabled: false, contractAddress: "", chainId: 968, rpc: "", explorer: "" });
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [form, setForm] = useState({ store: "", date: today(), amount: "", category: "Other" });

  useEffect(() => {
    fetch("/api/auth")
      .then(async (response) => ({ response, data: await response.json() as { authenticated?: boolean; wallet?: string } }))
      .then(({ data }) => {
        if (data.authenticated && data.wallet) {
          setWallet(data.wallet);
          setAuth("connected");
        } else setAuth("guest");
      })
      .catch(() => setAuth("guest"));
  }, []);

  async function loadAccount(selected: Currency) {
    setLoaded(false);
    const response = await fetch(`/api/data?currency=${selected}`);
    const data = await response.json() as {
      account?: Account;
      transactions?: Expense[];
      config?: Config;
      wallet?: string;
      error?: string;
    };
    if (response.status === 401) {
      setAuth("guest");
      setCurrency(null);
      throw new Error("Your wallet session ended. Please connect again.");
    }
    if (!response.ok || !data.account || !data.config) throw new Error(data.error || "Could not load this currency account.");
    setAccount(data.account);
    setExpenses(data.transactions || []);
    setConfig(data.config);
    if (data.wallet) setWallet(data.wallet);
    setCurrency(selected);
    setLoaded(true);
  }

  async function connect() {
    setBusy(true);
    try {
      const address = await authenticateWallet();
      setWallet(address);
      setAuth("connected");
      setCurrency(null);
      toast.success("Wallet connected securely");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect" }) });
    setAuth("guest");
    setWallet("");
    setCurrency(null);
    setExpenses([]);
    setAccount(null);
  }

  async function save(action: string, data: Record<string, unknown>) {
    const response = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Could not save your changes.");
  }

  async function scan(file: File) {
    if (!currency) return;
    if (file.size > 8 * 1024 * 1024) return toast.error("Choose an image smaller than 8 MB.");
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const body = new FormData();
      body.append("receipt", file);
      body.append("currency", currency);
      const response = await fetch("/api/scan", { method: "POST", body });
      const data = await response.json() as { store?: string; date?: string; amount?: number; category?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not read this receipt.");
      setForm({
        store: data.store || "",
        date: data.date || today(),
        amount: data.amount == null ? "" : String(data.amount),
        category: categories.includes(data.category || "") ? data.category! : "Other",
      });
      toast("Receipt read. Check every field before recording it.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read this receipt.");
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!currency) return;
    const amountMinor = toMinor(form.amount, currency);
    if (amountMinor < 1) return toast.error("Enter a valid amount.");
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const chain = await recordExpense({ id, ...form, amountMinor, currency }, config);
      await save("transaction", {
        id,
        store: form.store,
        date: form.date,
        amount: amountMinor,
        category: form.category,
        currency,
        txHash: chain.txHash,
        onchainId: chain.onchainId,
      });
      setForm({ store: "", date: today(), amount: "", category: "Other" });
      setPreview("");
      await loadAccount(currency);
      setTab("overview");
      toast.success(chain.txHash ? "Expense recorded on BOT Chain" : "Expense saved locally");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not record this expense.";
      toast.error(message.includes("user rejected") ? "Transaction cancelled. Your form is still here." : message);
    } finally {
      setBusy(false);
    }
  }

  const budget = account?.budget_amount ?? null;
  const periodExpenses = useMemo(() => {
    if (!account?.budget_start || !account.budget_end) return expenses;
    return expenses.filter((expense) => expense.date >= account.budget_start! && expense.date <= account.budget_end!);
  }, [account, expenses]);
  const spent = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remaining = budget == null ? null : budget - spent;
  const days = account?.budget_end && today() <= account.budget_end
    ? Math.max(0, Math.round((Date.parse(account.budget_end) - Date.parse(today() < (account.budget_start || "") ? account.budget_start! : today())) / 86_400_000) + 1)
    : 0;

  if (auth === "checking") return <LoadingScreen />;
  if (auth === "guest") return <WalletGate busy={busy} onConnect={connect} />;
  if (!currency) return <CurrencyPicker wallet={wallet} onChoose={(selected) => loadAccount(selected).catch((error) => toast.error(error.message))} onDisconnect={disconnect} />;

  return <>
    <Toaster richColors />
    <header className="topbar">
      <a className="brand" href="/" aria-label="SpendWise home"><span className="brandmark">S</span>SpendWise<span className="beta">BETA</span></a>
      <div className="header-actions">
        <button className="account-switch" onClick={() => setCurrency(null)}><ArrowLeftRight size={15} />{currency} Account</button>
        <button className="wallet-btn" onClick={disconnect}><Wallet size={17} />{wallet.slice(0, 6)}…{wallet.slice(-4)}<LogOut size={14} /></button>
      </div>
    </header>

    <main className="workspace">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="navrow">
          <TabsList className="navtabs" variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="add">Add Expense</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>
          <span className="currency">{CURRENCIES[currency].name}</span>
        </div>

        <div className="pagehead">
          <div>
            <p className="eyebrow">{currency} CURRENCY ACCOUNT</p>
            <h1>{tab === "overview" ? "Make room for what matters." : tab === "add" ? "Record what you spent." : "Every expense, in one place."}</h1>
            <p className="muted">{tab === "overview" ? "Track freely, or add an optional budget when you want a limit." : tab === "add" ? "Scan a receipt or enter the details yourself." : "Only transactions from this currency account appear here."}</p>
          </div>
          {tab === "overview" && <button className="primary" onClick={() => setTab("add")}><Plus size={18} />Add expense</button>}
        </div>

        {!loaded && <p role="status">Loading your {currency} account…</p>}

        <TabsContent value="overview">
          <div className="overview-grid">
            <section className="budget-card">
              <div className="card-top">
                <span>{budget == null ? "OPTIONAL SPENDING LIMIT" : "REMAINING BUDGET"}</span>
                <button onClick={() => setBudgetOpen(true)}>{budget == null ? "Set a budget" : "Edit budget"}<ArrowUpRight size={15} /></button>
              </div>
              <div className="big-amount">{remaining == null ? "No limit" : fromMinor(Math.max(0, remaining), currency)}</div>
              <p className="budget-sub">{budget == null ? `You can keep recording ${currency} expenses without a budget.` : `of ${fromMinor(budget, currency)} planned`}</p>
              {budget != null && <>
                <Progress className="budget-progress" value={Math.min(100, spent / budget * 100)} />
                <div className="budget-foot"><span>{Math.round(spent / budget * 100)}% spent</span><span>{account?.budget_start} — {account?.budget_end}</span></div>
              </>}
              <div className="budget-status">{remaining != null && remaining < 0 ? `You are over budget by ${fromMinor(-remaining, currency)}.` : budget == null ? "Budgeting is optional. Your expense history still works normally." : "A clear limit for this currency account only."}</div>
            </section>
            <section className="daily-card">
              <div className="icon-square"><TrendingDown size={22} /></div>
              <p className="muted">Daily spending allowance</p>
              <h2>{remaining == null || !days ? "Not set" : fromMinor(Math.max(0, remaining) / days, currency)}</h2>
              <p className="muted">{remaining == null ? "Add a budget to calculate a daily allowance." : days ? `Spread your remaining budget across ${days} days.` : "This budget period has ended."}</p>
              <span className="small-note">A spending guide, not a guarantee.</span>
            </section>
          </div>

          <div className="metrics">
            <div><ReceiptText /><span>Total recorded<strong>{fromMinor(spent, currency)}</strong></span></div>
            <div><CalendarDays /><span>Budget status<strong>{budget == null ? "Optional" : `${days} days`}</strong></span></div>
            <div><ShoppingBag /><span>Transactions<strong>{expenses.length}<small> recorded</small></strong></span></div>
          </div>

          <div className="lower-grid">
            <section className="panel">
              <div className="sectionhead"><h2>Recent transactions</h2><button className="text-btn" onClick={() => setTab("transactions")}>View all <ArrowUpRight size={16} /></button></div>
              {expenses.length ? expenses.slice(0, 4).map((expense) => <Transaction key={expense.id} expense={expense} config={config} />) : <EmptyTransactions onAdd={() => setTab("add")} />}
            </section>
            <section className="scan-card">
              <span className="icon-square"><ShieldCheck size={25} /></span>
              <p className="eyebrow">ONE WALLET. FOUR CURRENCIES.</p>
              <h2>Separate money.<br />Clearer decisions.</h2>
              <p>Your {currency} budget and expenses never mix with IDR, USD, MYR, or SGD records.</p>
              <button className="secondary" onClick={() => setCurrency(null)}>Switch currency account <ArrowUpRight size={17} /></button>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="add">
          <div className="scan-grid">
            <section className="panel">
              <h2>Scan a {currency} receipt</h2>
              <p className="muted">JPG, PNG, or WebP, up to 8 MB. The receipt currency must match this account.</p>
              <label className="dropzone">
                <ScanLine size={44} /><strong>{busy ? "Reading your receipt…" : "Choose a receipt photo"}</strong><span>Use a clear image with the total visible</span>
                <input aria-label="Upload receipt" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => event.target.files?.[0] && scan(event.target.files[0])} />
              </label>
              {preview && <img className="receipt-preview" src={preview} alt="Receipt to review" />}
              <p className="small-note">Receipt images are processed for extraction and are not stored by SpendWise.</p>
              {!config.aiEnabled && <p className="notice">AI scanning is awaiting API setup. Manual expense entry is available now.</p>}
            </section>
            <form className="panel form" onSubmit={submitExpense}>
              <div><h2>Review your expense</h2><p className="muted">You will confirm a wallet transaction when BOT Chain recording is active.</p></div>
              <label>Merchant<input required maxLength={100} value={form.store} onChange={(event) => setForm({ ...form, store: event.target.value })} placeholder="e.g. Indomaret" /></label>
              <label>Date<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
              <label>Amount, {currency}<input type="number" min={CURRENCIES[currency].decimals ? "0.01" : "1"} max="1000000000" step={CURRENCIES[currency].decimals ? "0.01" : "1"} required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder={CURRENCIES[currency].decimals ? "32.00" : "65000"} /></label>
              <label>Category<Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></label>
              {!config.contractAddress && <p className="notice">The contract is not configured yet. This expense will be saved locally and marked “Local only”.</p>}
              <button className="primary" disabled={busy || !loaded}>{busy ? "Please wait…" : config.contractAddress ? "Record Expense on BOT Chain" : "Save Expense Locally"}</button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <section className="panel">
            <div className="sectionhead"><h2>{currency} transactions <span className="count">{expenses.length}</span></h2><button className="secondary" onClick={() => setTab("add")}><Plus size={16} />Add expense</button></div>
            {expenses.length ? expenses.map((expense) => <Transaction key={expense.id} expense={expense} config={config} />) : <EmptyTransactions onAdd={() => setTab("add")} />}
          </section>
        </TabsContent>
      </Tabs>

      <footer><span>SpendWise <span className="muted">· One wallet, four currency accounts.</span></span><div><a href="https://botchain.ai" target="_blank" rel="noreferrer">Built for BOT Chain</a><a href="https://scan.botchain.ai" target="_blank" rel="noreferrer">Explorer ↗</a></div></footer>
    </main>

    <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
      <DialogContent>
        <DialogTitle>{budget == null ? `Set an optional ${currency} budget` : `Edit your ${currency} budget`}</DialogTitle>
        <DialogDescription>Your budget affects guidance only. You can remove it and keep tracking expenses.</DialogDescription>
        <form className="form" onSubmit={async (event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          setBusy(true);
          try {
            await save("budget", { currency, amount: toMinor(String(fields.get("amount")), currency), start: fields.get("start"), end: fields.get("end") });
            await loadAccount(currency);
            setBudgetOpen(false);
            toast.success("Optional budget saved");
          } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save budget."); }
          finally { setBusy(false); }
        }}>
          <label>Budget amount, {currency}<input name="amount" type="number" min={CURRENCIES[currency].decimals ? "0.01" : "1"} step={CURRENCIES[currency].decimals ? "0.01" : "1"} defaultValue={budget == null ? "" : budget / 10 ** CURRENCIES[currency].decimals} required /></label>
          <label>Start date<input name="start" type="date" defaultValue={account?.budget_start || today()} required /></label>
          <label>End date<input name="end" type="date" defaultValue={account?.budget_end || today()} required /></label>
          <button className="primary" disabled={busy}>Save Budget</button>
          {budget != null && <button type="button" className="secondary" onClick={async () => {
            setBusy(true);
            try { await save("budget", { currency, amount: null }); await loadAccount(currency); setBudgetOpen(false); toast.success("Budget removed. Expense tracking stays active."); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove budget."); }
            finally { setBusy(false); }
          }}>Remove Budget</button>}
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

function LoadingScreen() {
  return <main className="gate"><div className="gate-card"><span className="brandmark large">S</span><h1>Opening SpendWise…</h1><p>Checking your wallet session.</p></div></main>;
}

function WalletGate({ busy, onConnect }: { busy: boolean; onConnect(): void }) {
  return <main className="gate">
    <Toaster richColors />
    <section className="gate-card">
      <span className="brandmark large">S</span>
      <p className="eyebrow">WELCOME TO SPENDWISE</p>
      <h1>One wallet.<br />Four clearer money spaces.</h1>
      <p>Connect your EVM wallet to access SpendWise. A free signature proves the wallet is yours. It does not cost gas.</p>
      <div className="currency-preview">{(Object.keys(CURRENCIES) as Currency[]).map((code) => <span key={code}>{CURRENCIES[code].symbol}<small>{code}</small></span>)}</div>
      <button className="primary gate-button" onClick={onConnect} disabled={busy}><Wallet size={19} />{busy ? "Check your wallet…" : "Connect Wallet"}</button>
      <p className="small-note">SpendWise never asks for your seed phrase or private key.</p>
    </section>
  </main>;
}

function CurrencyPicker({ wallet, onChoose, onDisconnect }: { wallet: string; onChoose(currency: Currency): void; onDisconnect(): void }) {
  return <main className="currency-gate">
    <Toaster richColors />
    <header className="picker-head"><a className="brand" href="/"><span className="brandmark">S</span>SpendWise</a><button className="wallet-btn" onClick={onDisconnect}>{wallet.slice(0, 6)}…{wallet.slice(-4)}<LogOut size={14} /></button></header>
    <section className="picker-content">
      <p className="eyebrow">CHOOSE YOUR MONEY SPACE</p>
      <h1>Select a currency account.</h1>
      <p>Each account keeps its own expenses and optional budget. Nothing is converted or mixed.</p>
      <div className="currency-grid">{(Object.keys(CURRENCIES) as Currency[]).map((code) => {
        const item = CURRENCIES[code];
        return <button key={code} className={`currency-card ${item.accent}`} onClick={() => onChoose(code)}>
          <span className="currency-symbol">{item.symbol}</span><span><strong>{code} Account</strong><small>{item.name}</small></span><ArrowUpRight size={20} />
        </button>;
      })}</div>
      <div className="picker-note"><ShieldCheck size={20} /><span><strong>One connected wallet</strong><small>Your wallet is your SpendWise identity across all four currency accounts.</small></span></div>
    </section>
  </main>;
}

function EmptyTransactions({ onAdd }: { onAdd(): void }) {
  return <div className="empty-state"><ReceiptText size={32} /><h3>No expenses in this account yet.</h3><p>Scan a receipt or add your first expense manually.</p><button className="text-btn" onClick={onAdd}>Add expense <ArrowUpRight size={16} /></button></div>;
}

function Transaction({ expense, config }: { expense: Expense; config: Config }) {
  const Icon = expense.category === "Food & drinks" ? Coffee : expense.category === "Transport" ? Bus : ShoppingBag;
  return <div className="transaction">
    <span className={`tx-icon ${expense.category === "Food & drinks" ? "orange" : expense.category === "Transport" ? "blue" : "green"}`}><Icon size={20} /></span>
    <div className="tx-description"><strong>{expense.store}</strong><span>{expense.category} · {expense.date}</span></div>
    <div className="tx-proof">{expense.tx_hash ? <a href={`${config.explorer}/tx/${expense.tx_hash}`} target="_blank" rel="noreferrer"><CheckCircle2 size={13} />On-chain</a> : <span>Local only</span>}<strong>−{fromMinor(expense.amount, expense.currency)}</strong></div>
  </div>;
}
