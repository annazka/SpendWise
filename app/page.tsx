"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Bus,
  CalendarDays,
  CheckCircle2,
  Coffee,
  Download,
  LogOut,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
  Wallet,
  XCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
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
  validation_status: "APPROVED";
  receipt_hash: string;
  provider_document_id: string | null;
};
type Config = { aiEnabled: boolean; contractAddress: string; chainId: number; rpc: string; explorer: string };

const categories = ["Food & drinks", "Groceries", "Transport", "Shopping", "Other"];
const today = () => new Date().toLocaleDateString("en-CA");

type StoredAccount = { account: Account; expenses: Expense[] };

function emptyAccount(currency: Currency): StoredAccount {
  return {
    account: { currency, budget_amount: null, budget_start: null, budget_end: null },
    expenses: [],
  };
}

function storageKey(wallet: string, currency: Currency) {
  return `spendwise:${wallet.toLowerCase()}:${currency}`;
}

function readStoredAccount(wallet: string, currency: Currency): StoredAccount {
  try {
    const saved = localStorage.getItem(storageKey(wallet, currency));
    if (!saved) return emptyAccount(currency);
    const parsed = JSON.parse(saved) as StoredAccount;
    return {
      account: { ...emptyAccount(currency).account, ...parsed.account, currency },
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    };
  } catch {
    return emptyAccount(currency);
  }
}

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
  const [scanStatus, setScanStatus] = useState<"IDLE" | "VALIDATING" | "APPROVED" | "REJECTED">("IDLE");
  const [scanMessage, setScanMessage] = useState("");
  const [receiptHash, setReceiptHash] = useState("");
  const [providerDocumentId, setProviderDocumentId] = useState<string | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const savedWallet = localStorage.getItem("spendwise:connected-wallet");
      if (savedWallet) {
        setWallet(savedWallet);
        setAuth("connected");
      } else setAuth("guest");
    });
  }, []);

  async function loadAccount(selected: Currency) {
    setLoaded(false);
    const data = readStoredAccount(wallet, selected);
    setAccount(data.account);
    setExpenses(data.expenses);
    const chainId = Number(process.env.NEXT_PUBLIC_BOT_CHAIN_ID || 968);
    setConfig({
      aiEnabled: process.env.NEXT_PUBLIC_AI_ENABLED !== "false",
      contractAddress: process.env.NEXT_PUBLIC_BOT_CONTRACT_ADDRESS || "",
      chainId,
      rpc: process.env.NEXT_PUBLIC_BOT_RPC || (chainId === 677 ? "https://rpc.botchain.ai" : "https://rpc.bohr.life"),
      explorer: process.env.NEXT_PUBLIC_BOT_EXPLORER || (chainId === 677 ? "https://scan.botchain.ai" : "https://scan.bohr.life"),
    });
    setCurrency(selected);
    setLoaded(true);
  }

  async function connect() {
    setBusy(true);
    try {
      const address = await authenticateWallet();
      localStorage.setItem("spendwise:connected-wallet", address);
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
    localStorage.removeItem("spendwise:connected-wallet");
    setAuth("guest");
    setWallet("");
    setCurrency(null);
    setExpenses([]);
    setAccount(null);
  }

  async function save(action: string, data: Record<string, unknown>) {
    if (!currency || !wallet) throw new Error("Choose a currency account first.");
    const stored = readStoredAccount(wallet, currency);
    if (action === "budget") {
      const amount = typeof data.amount === "number" ? data.amount : null;
      stored.account = {
        ...stored.account,
        budget_amount: amount,
        budget_start: amount == null ? null : String(data.start || ""),
        budget_end: amount == null ? null : String(data.end || ""),
      };
    } else if (action === "transaction") {
      stored.expenses.unshift({
        id: String(data.id),
        store: String(data.store),
        date: String(data.date),
        amount: Number(data.amount),
        category: String(data.category),
        currency,
        tx_hash: typeof data.txHash === "string" ? data.txHash : null,
        onchain_id: typeof data.onchainId === "string" ? data.onchainId : null,
        validation_status: "APPROVED",
        receipt_hash: String(data.receiptHash),
        provider_document_id: typeof data.providerDocumentId === "string" ? data.providerDocumentId : null,
      });
    } else throw new Error("Unsupported save action.");
    localStorage.setItem(storageKey(wallet, currency), JSON.stringify(stored));
  }

  async function scan(file: File) {
    if (!currency) return;
    if (file.size > 20 * 1024 * 1024) return toast.error("Choose a receipt smaller than 20 MB.");
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(file.type === "application/pdf" ? "" : URL.createObjectURL(file));
    setScanStatus("VALIDATING");
    setScanMessage("AI is checking the receipt authenticity and reading its details.");
    setReceiptHash("");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("receipt", file);
      body.append("currency", currency);
      const response = await fetch("/api/scan", { method: "POST", body });
      const data = await response.json() as { status?: "APPROVED" | "REJECTED"; store?: string; date?: string; amount?: number; category?: string; receiptHash?: string; providerDocumentId?: string | null; reasons?: string[]; error?: string };
      if (!response.ok || data.status !== "APPROVED") {
        setScanStatus("REJECTED");
        setScanMessage(data.reasons?.join(" ") || data.error || "This receipt could not be verified.");
        setForm({ store: "", date: today(), amount: "", category: "Other" });
        throw new Error(data.reasons?.[0] || data.error || "This receipt could not be verified.");
      }
      if (expenses.some((expense) => expense.receipt_hash && expense.receipt_hash === data.receiptHash)) {
        setScanStatus("REJECTED");
        setScanMessage("This exact receipt has already been recorded in this currency account.");
        throw new Error("Duplicate receipt detected.");
      }
      setForm({
        store: data.store || "",
        date: data.date || today(),
        amount: data.amount == null ? "" : String(data.amount),
        category: categories.includes(data.category || "") ? data.category! : "Other",
      });
      setReceiptHash(data.receiptHash || "");
      setProviderDocumentId(data.providerDocumentId || null);
      setScanStatus("APPROVED");
      setScanMessage("Receipt verified. It is eligible for reimbursement submission.");
      toast.success("Approved receipt. Ready to record.");
    } catch (error) {
      setScanStatus((current) => current === "APPROVED" ? current : "REJECTED");
      toast.error(error instanceof Error ? error.message : "Could not read this receipt.");
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!currency) return;
    if (scanStatus !== "APPROVED" || !receiptHash) return toast.error("Scan and verify a receipt first.");
    const amountMinor = toMinor(form.amount, currency);
    if (amountMinor < 1) return toast.error("Enter a valid amount.");
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const chain = await recordExpense({ id, ...form, amountMinor, currency, receiptHash }, config);
      await save("transaction", {
        id,
        store: form.store,
        date: form.date,
        amount: amountMinor,
        category: form.category,
        currency,
        txHash: chain.txHash,
        onchainId: chain.onchainId,
        receiptHash,
        providerDocumentId,
      });
      setForm({ store: "", date: today(), amount: "", category: "Other" });
      setPreview("");
      setScanStatus("IDLE");
      setScanMessage("");
      setReceiptHash("");
      setProviderDocumentId(null);
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

  async function downloadReimbursementReport() {
    const approvedByCurrency = (Object.keys(CURRENCIES) as Currency[])
      .map((code) => ({
        currency: code,
        expenses: readStoredAccount(wallet, code).expenses.filter((expense) => expense.validation_status === "APPROVED"),
      }))
      .filter((group) => group.expenses.length > 0);

    if (!approvedByCurrency.length) return toast.error("No approved transactions are available to export.");

    setBusy(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const generatedAt = new Date();
      const reportId = `SW-${generatedAt.toISOString().replace(/\D/g, "").slice(0, 14)}`;

      pdf.setFillColor(18, 99, 77);
      pdf.rect(0, 0, 210, 38, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.text("SpendWise", 15, 17);
      pdf.setFontSize(13);
      pdf.text("AI-VERIFIED REIMBURSEMENT REPORT", 15, 27);

      pdf.setTextColor(35, 55, 49);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Report ID: ${reportId}`, 15, 47);
      pdf.text(`Generated: ${generatedAt.toLocaleString("en-GB")}`, 15, 53);
      pdf.text(`Wallet: ${wallet}`, 15, 59);
      pdf.setFont("helvetica", "bold");
      pdf.text("Status: ELIGIBLE FOR SUBMISSION", 15, 67);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(90, 105, 100);
      pdf.text("This report contains only receipts approved by SpendWise AI validation.", 15, 73);

      let y = 82;
      for (const group of approvedByCurrency) {
        const total = group.expenses.reduce((sum, expense) => sum + expense.amount, 0);
        if (y > 235) {
          pdf.addPage();
          y = 20;
        }
        pdf.setTextColor(35, 55, 49);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.text(`${group.currency} ACCOUNT`, 15, y);
        pdf.setFontSize(10);
        pdf.text(`Total: ${fromMinor(total, group.currency)}`, 195, y, { align: "right" });

        autoTable(pdf, {
          startY: y + 5,
          head: [["Date", "Merchant", "Category", "Amount", "Proof"]],
          body: group.expenses.map((expense) => [
            expense.date,
            expense.store,
            expense.category,
            fromMinor(expense.amount, expense.currency),
            expense.tx_hash ? `On-chain\n${expense.tx_hash}` : `AI verified\n${expense.receipt_hash}`,
          ]),
          styles: { fontSize: 7.5, cellPadding: 2.5, overflow: "linebreak" },
          headStyles: { fillColor: [18, 99, 77], textColor: 255 },
          columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 38 }, 2: { cellWidth: 28 }, 3: { cellWidth: 27 }, 4: { cellWidth: 70 } },
          margin: { left: 15, right: 15 },
        });
        y = (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
        y += 12;
      }

      const pages = pdf.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        pdf.setPage(page);
        pdf.setDrawColor(220, 228, 224);
        pdf.line(15, 283, 195, 283);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7.5);
        pdf.setTextColor(110, 120, 116);
        pdf.text("AI validates receipt completeness and authenticity. Final reimbursement remains subject to organization policy.", 15, 288);
        pdf.text(`Page ${page} of ${pages}`, 195, 288, { align: "right" });
      }

      pdf.save(`SpendWise-Reimbursement-${reportId}.pdf`);
      toast.success("Reimbursement PDF downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate the reimbursement PDF.");
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
      <Link className="brand" href="/" aria-label="SpendWise home"><span className="brandmark">S</span>SpendWise<span className="beta">BETA</span></Link>
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
            <TabsTrigger value="add">Scan Receipt</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>
          <span className="currency">{CURRENCIES[currency].name}</span>
        </div>

        <div className="pagehead">
          <div>
            <p className="eyebrow">{currency} CURRENCY ACCOUNT</p>
            <h1>{tab === "overview" ? "Make room for what matters." : tab === "add" ? "Record what you spent." : "Every expense, in one place."}</h1>
            <p className="muted">{tab === "overview" ? "Track freely, or add an optional budget when you want a limit." : tab === "add" ? "Every expense must come from an AI-verified receipt." : "Only transactions from this currency account appear here."}</p>
          </div>
          {tab === "overview" && <button className="primary" onClick={() => setTab("add")}><ScanLine size={18} />Scan receipt</button>}
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
              <p className="muted">JPG, PNG, WebP, or PDF, up to 20 MB. The receipt currency must match this account.</p>
              <label className="dropzone">
                <ScanLine size={44} /><strong>{busy ? "Reading your receipt…" : "Choose a receipt photo"}</strong><span>Use a clear image with the total visible</span>
                <input aria-label="Upload receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={(event) => event.target.files?.[0] && scan(event.target.files[0])} />
              </label>
              {preview && <img className="receipt-preview" src={preview} alt="Receipt being validated" />}
              {scanStatus !== "IDLE" && <div className={`validation-card ${scanStatus.toLowerCase()}`}>
                {scanStatus === "APPROVED" ? <CheckCircle2 size={20} /> : scanStatus === "REJECTED" ? <XCircle size={20} /> : <ScanLine size={20} />}
                <span><strong>{scanStatus === "APPROVED" ? "APPROVED RECEIPT" : scanStatus}</strong><small>{scanMessage}</small></span>
              </div>}
              <p className="small-note">Receipt images are processed for extraction and are not stored by SpendWise.</p>
              {!config.aiEnabled && <p className="notice">AI scanning is awaiting Veryfi setup. Manual expense entry is disabled.</p>}
            </section>
            <form className="panel form" onSubmit={submitExpense}>
              <div><h2>Verified receipt details</h2><p className="muted">Fields are filled by AI and cannot be entered or edited manually.</p></div>
              <label>Merchant<input readOnly value={form.store} placeholder="Scan a receipt first" /></label>
              <label>Date<input type="date" readOnly value={form.date} /></label>
              <label>Amount, {currency}<input readOnly value={form.amount} placeholder="Scan a receipt first" /></label>
              <label>Category<input readOnly value={form.category} /></label>
              {receiptHash && <p className="hash-line"><strong>Receipt SHA-256</strong><span>{receiptHash}</span></p>}
              {!config.contractAddress && <p className="notice">The contract is not configured yet. This expense will be saved locally and marked “Local only”.</p>}
              <button className="primary" disabled={busy || !loaded || scanStatus !== "APPROVED"}>{busy ? "Please wait…" : config.contractAddress ? "Record Verified Receipt on BOT Chain" : "Save Verified Receipt"}</button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <section className="panel">
            <div className="sectionhead"><h2>{currency} transactions <span className="count">{expenses.length}</span></h2><div className="section-actions"><button className="secondary" disabled={busy} onClick={downloadReimbursementReport}><Download size={16} />Download reimbursement PDF</button><button className="secondary" onClick={() => setTab("add")}><ScanLine size={16} />Scan receipt</button></div></div>
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
    <header className="picker-head"><Link className="brand" href="/"><span className="brandmark">S</span>SpendWise</Link><button className="wallet-btn" onClick={onDisconnect}>{wallet.slice(0, 6)}…{wallet.slice(-4)}<LogOut size={14} /></button></header>
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
  return <div className="empty-state"><ReceiptText size={32} /><h3>No verified receipts in this account yet.</h3><p>Scan your first receipt. Manual expense entry is not available.</p><button className="text-btn" onClick={onAdd}>Scan receipt <ArrowUpRight size={16} /></button></div>;
}

function Transaction({ expense, config }: { expense: Expense; config: Config }) {
  const Icon = expense.category === "Food & drinks" ? Coffee : expense.category === "Transport" ? Bus : ShoppingBag;
  return <div className="transaction">
    <span className={`tx-icon ${expense.category === "Food & drinks" ? "orange" : expense.category === "Transport" ? "blue" : "green"}`}><Icon size={20} /></span>
    <div className="tx-description"><strong>{expense.store}</strong><span>{expense.category} · {expense.date}</span></div>
    <div className="tx-proof">{expense.tx_hash ? <a href={`${config.explorer}/tx/${expense.tx_hash}`} target="_blank" rel="noreferrer"><CheckCircle2 size={13} />On-chain</a> : <span><CheckCircle2 size={13} />AI verified</span>}<strong>−{fromMinor(expense.amount, expense.currency)}</strong></div>
  </div>;
}
