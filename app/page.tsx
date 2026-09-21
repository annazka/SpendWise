"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Bus,
  Bell,
  CalendarDays,
  CheckCircle2,
  Coffee,
  Download,
  ExternalLink,
  LogOut,
  MoreHorizontal,
  Eye,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sun,
  TrendingDown,
  Wallet,
  XCircle,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
type DateRange = "1" | "7" | "30" | "all";
type TransactionSort = "date-desc" | "date-asc" | "amount-desc";
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
  receipt_file_key?: string | null;
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

const RECEIPT_DB = "spendwise-receipts";
const RECEIPT_STORE = "receipts";

function openReceiptDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(RECEIPT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECEIPT_STORE)) request.result.createObjectStore(RECEIPT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeReceiptFile(key: string, file: File) {
  const database = await openReceiptDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RECEIPT_STORE, "readwrite");
    transaction.objectStore(RECEIPT_STORE).put(file, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getReceiptFile(key: string) {
  const database = await openReceiptDatabase();
  const file = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(RECEIPT_STORE, "readonly").objectStore(RECEIPT_STORE).get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return file;
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

function isWithinDateRange(date: string, range: DateRange) {
  if (range === "all") return true;
  const days = Number(range);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const transactionDate = new Date(`${date}T00:00:00`);
  return !Number.isNaN(transactionDate.getTime()) && transactionDate >= start;
}

export default function Home() {
  const [auth, setAuth] = useState<"checking" | "guest" | "connected">("checking");
  const [wallet, setWallet] = useState("");
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [config, setConfig] = useState<Config>({ aiEnabled: false, contractAddress: "", chainId: 968, rpc: "", explorer: "" });
  const [tab, setTab] = useState("overview");
  const [transactionRange, setTransactionRange] = useState<DateRange>("all");
  const [transactionSort, setTransactionSort] = useState<TransactionSort>("date-desc");
  const [reportRange, setReportRange] = useState<DateRange>("all");
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [form, setForm] = useState({ store: "", date: today(), amount: "", category: "Other" });
  const [scanStatus, setScanStatus] = useState<"IDLE" | "VALIDATING" | "APPROVED" | "REJECTED">("IDLE");
  const [scanMessage, setScanMessage] = useState("");
  const [receiptHash, setReceiptHash] = useState("");
  const [providerDocumentId, setProviderDocumentId] = useState<string | null>(null);
  const [scannedReceipt, setScannedReceipt] = useState<File | null>(null);
  const [receiptViewer, setReceiptViewer] = useState<{ url: string; type: string } | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [detailReceipt, setDetailReceipt] = useState<{ url: string; type: string } | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);

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
        receipt_file_key: typeof data.receiptFileKey === "string" ? data.receiptFileKey : null,
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
    setScannedReceipt(file);
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
        setScannedReceipt(null);
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
      let receiptFileKey: string | null = null;
      if (scannedReceipt) {
        receiptFileKey = `${wallet.toLowerCase()}:${id}`;
        await storeReceiptFile(receiptFileKey, scannedReceipt);
      }
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
        receiptFileKey,
      });
      setForm({ store: "", date: today(), amount: "", category: "Other" });
      setPreview("");
      setScanStatus("IDLE");
      setScanMessage("");
      setReceiptHash("");
      setProviderDocumentId(null);
      setScannedReceipt(null);
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

  async function viewReceipt(expense: Expense) {
    if (!expense.receipt_file_key) return toast.error("The original file is unavailable because this receipt was saved before file storage was enabled.");
    try {
      const file = await getReceiptFile(expense.receipt_file_key);
      if (!file) return toast.error("The original receipt file is no longer available on this device.");
      if (receiptViewer?.url) URL.revokeObjectURL(receiptViewer.url);
      setReceiptViewer({ url: URL.createObjectURL(file), type: file.type });
    } catch {
      toast.error("Could not open the original receipt file.");
    }
  }

  async function openTransactionDetails(expense: Expense) {
    setSelectedExpense(expense);
    if (detailReceipt?.url) URL.revokeObjectURL(detailReceipt.url);
    setDetailReceipt(null);
    if (!expense.receipt_file_key) return;
    try {
      const file = await getReceiptFile(expense.receipt_file_key);
      if (file) setDetailReceipt({ url: URL.createObjectURL(file), type: file.type });
    } catch {
      toast.error("Could not load the original receipt preview.");
    }
  }

  async function downloadReimbursementReport() {
    const approvedByCurrency = (Object.keys(CURRENCIES) as Currency[])
      .map((code) => ({
        currency: code,
        expenses: readStoredAccount(wallet, code).expenses.filter((expense) =>
          (expense.validation_status === "APPROVED" || Boolean(expense.receipt_hash)) && isWithinDateRange(expense.date, reportRange))
          .sort((a, b) => b.date.localeCompare(a.date)),
      }))
      .filter((group) => group.expenses.length > 0);

    if (!approvedByCurrency.length) return toast.error("No approved transactions are available in this period.");

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
      pdf.text(`Period: ${reportRange === "all" ? "All transactions" : `Last ${reportRange} day${reportRange === "1" ? "" : "s"}`}`, 15, 73);
      pdf.text("This report contains only receipts approved by SpendWise AI validation.", 15, 78);

      let y = 87;
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

      pdf.save(`SpendWise-Reimbursement-${reportRange === "all" ? "All" : `${reportRange}Days`}-${reportId}.pdf`);
      setReportOpen(false);
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
  const filteredExpenses = useMemo(() => expenses
    .filter((expense) => isWithinDateRange(expense.date, transactionRange))
    .sort((a, b) => {
      if (transactionSort === "amount-desc") return b.amount - a.amount;
      const dateOrder = a.date.localeCompare(b.date);
      return transactionSort === "date-asc" ? dateOrder : -dateOrder;
    }), [expenses, transactionRange, transactionSort]);
  const transactionPageSize = 10;
  const transactionPageCount = Math.max(1, Math.ceil(filteredExpenses.length / transactionPageSize));
  const paginatedExpenses = filteredExpenses.slice((transactionPage - 1) * transactionPageSize, transactionPage * transactionPageSize);
  const reportTransactionCount = typeof window === "undefined" || !wallet ? 0 : (Object.keys(CURRENCIES) as Currency[])
    .flatMap((code) => readStoredAccount(wallet, code).expenses)
    .filter((expense) => (expense.validation_status === "APPROVED" || Boolean(expense.receipt_hash)) && isWithinDateRange(expense.date, reportRange))
    .length;
  const categoryTotals = useMemo(() => categories.map((name) => ({ name, amount: expenses.filter((expense) => expense.category === name).reduce((sum, expense) => sum + expense.amount, 0) })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount), [expenses]);
  const chartExpenses = [...expenses].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
  const chartMaximum = Math.max(1, ...chartExpenses.map((expense) => expense.amount));
  const chartPoints = chartExpenses.map((expense, index) => `${index * (100 / Math.max(1, chartExpenses.length - 1))},${95 - (expense.amount / chartMaximum) * 78}`).join(" ");

  if (auth === "checking") return <LoadingScreen />;
  if (auth === "guest") return <WalletGate busy={busy} onConnect={connect} />;
  if (!currency) return <CurrencyPicker wallet={wallet} onChoose={(selected) => loadAccount(selected).catch((error) => toast.error(error.message))} onDisconnect={disconnect} />;

  return <div className="app-shell">
    <Toaster richColors />
    <aside className="app-sidebar">
      <button className="sidebar-brand" onClick={() => setTab("overview")}><span className="neon-logo">S</span><span><strong>SpendWise</strong><small>Spend smarter.<br />Build a brighter tomorrow.</small></span></button>
      <nav>
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><TrendingDown />Overview</button>
        <button className={tab === "add" ? "active" : ""} onClick={() => setTab("add")}><ScanLine />Scan Receipt</button>
        <button className={tab === "transactions" ? "active" : ""} onClick={() => { setTab("transactions"); if (expenses[0]) openTransactionDetails(expenses[0]); }}><ReceiptText />Transactions</button>
        <button className={tab === "proof" ? "active" : ""} onClick={() => setTab("proof")}><ShieldCheck />Proof & Reports</button>
      </nav>
      <div className="sidebar-foot"><span>v1.0.0</span><small>Built for BOT Chain</small></div>
    </aside>
    <div className="app-body">
    <header className="topbar">
      <Link className="brand" href="/" aria-label="SpendWise home"><span className="brandmark">S</span>SpendWise<span className="beta">BETA</span></Link>
      <div className="header-actions">
        <button className="wallet-btn wallet-card" onClick={disconnect}><Wallet size={20} /><span><strong>Main Wallet</strong><small>{wallet.slice(0, 6)}…{wallet.slice(-4)}</small></span><i /></button>
        <button className="account-switch" onClick={() => setCurrency(null)}><span className="currency-orb">{CURRENCIES[currency].symbol}</span>{currency}<ArrowLeftRight size={14} /></button>
        <button className="notification-button" aria-label="Notifications"><Bell size={21} /><i /></button>
      </div>
      <div className="greeting"><Sun /><span><small>{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</small><strong>Good morning</strong></span></div>
    </header>

    <main className="workspace">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="navrow">
          <TabsList className="navtabs" variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="add">Scan Receipt</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="proof">Proof & Reports</TabsTrigger>
          </TabsList>
          <span className="currency">{CURRENCIES[currency].name}</span>
        </div>

        <div className="pagehead">
          <div>
            <p className="eyebrow">{currency} CURRENCY ACCOUNT</p>
            <h1>{tab === "overview" ? "Overview" : tab === "add" ? "Scan Receipt" : tab === "transactions" ? "Transactions" : "Proof & Reports"}</h1>
            <p className="muted">{tab === "overview" ? "Your expenses. Clearer tomorrow." : tab === "add" ? "Upload a receipt and let AI extract the details for you." : tab === "transactions" ? "Review your approved receipt records." : "Generate reimbursement proof. Backed by blockchain. Built for trust."}</p>
          </div>
          {tab === "overview" && <button className="primary" onClick={() => setTab("add")}><ScanLine size={18} />Scan receipt</button>}
        </div>

        {!loaded && <p role="status">Loading your {currency} account…</p>}

        <TabsContent value="overview">
          <div className="overview-hero-grid">
            <section className="budget-card total-spend-card">
              <div className="card-top">
                <span><Wallet size={20} />TOTAL SPEND</span>
                <button onClick={() => setBudgetOpen(true)}><CalendarDays size={15} />This Month<ArrowUpRight size={15} /></button>
              </div>
              <p className="budget-sub">Total amount spent from approved receipts</p>
              <div className="big-amount">{fromMinor(spent, currency)}</div>
              <div className="spend-stats"><span><b>{expenses.length}</b><small>Approved Receipts</small></span><span><b>{expenses.length ? fromMinor(spent / expenses.length, currency) : fromMinor(0, currency)}</b><small>Avg. Daily Spend</small></span><span><b>{remaining == null ? "No limit" : fromMinor(Math.max(0, remaining), currency)}</b><small>Remaining Budget</small></span></div>
            </section>
            <section className="panel spend-trend hero-trend">
              <div className="sectionhead"><div><h2>Receipt Spend Trend</h2><p className="muted">Daily spending based on scanned receipts</p></div><div className="mini-ranges"><button>1D</button><button>7D</button><button className="active">30D</button><button>All</button></div></div>
              {chartExpenses.length ? <svg className="trend-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Receipt spending trend"><defs><linearGradient id="heroChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#30d9ff" stopOpacity=".55"/><stop offset="1" stopColor="#2c78ff" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${chartPoints} 100,100`} fill="url(#heroChartFill)"/><polyline points={chartPoints} fill="none" stroke="#42ddff" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg> : <EmptyTransactions onAdd={() => setTab("add")} />}
            </section>
          </div>
          <div className="overview-bottom-grid">
            <section className="panel recent-panel">
              <div className="sectionhead"><div><h2>Recent Receipts</h2><p className="muted">Latest receipts you’ve scanned</p></div><button className="text-btn" onClick={() => setTab("transactions")}>View All <ArrowUpRight size={16} /></button></div>
              {expenses.length ? expenses.slice(0, 5).map((expense) => <Transaction key={expense.id} expense={expense} config={config} onViewReceipt={viewReceipt} />) : <EmptyTransactions onAdd={() => setTab("add")} />}
            </section>
            <section className="panel category-panel">
              <div className="sectionhead"><h2>Category breakdown</h2></div>
              {categoryTotals.length ? categoryTotals.map((item, index) => <div className="category-row" key={item.name}><span><i style={{ background: ["#27d9ff", "#7c5cff", "#00efcf", "#ffb02e", "#ff5b98"][index % 5] }} />{item.name}</span><div><b style={{ width: `${Math.max(8, item.amount / Math.max(1, spent) * 100)}%` }} /><small>{fromMinor(item.amount, currency)}</small></div></div>) : <p className="muted">Scan receipts to see your category breakdown.</p>}
            </section>
            <section className="panel chain-status-card">
              <div className="sectionhead"><div><h2>Blockchain Proof Status</h2><p className="muted">Your receipts secured on blockchain</p></div><ShieldCheck /></div>
              <div className="proof-ring" style={{"--proof": `${expenses.length ? Math.round(expenses.filter(item => item.tx_hash).length / expenses.length * 100) : 0}%`} as React.CSSProperties}><span><b>{expenses.length ? Math.round(expenses.filter(item => item.tx_hash).length / expenses.length * 100) : 0}%</b><small>Verified & Stored<br/>On Blockchain</small></span></div>
              <div className="proof-summary"><span><b>{expenses.length}</b>Total Receipts</span><span><b>{expenses.filter(item => item.tx_hash).length}</b>Verified</span></div>
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
              <p className="small-note">After approval, the original receipt is stored locally on this device so you can view it again from Transactions.</p>
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
          <div className="transaction-metrics">
            <div className="panel"><Wallet /><span><small>Total Transactions</small><strong>{expenses.length}</strong></span></div>
            <div className="panel"><ReceiptText /><span><small>Total Approved Value</small><strong>{fromMinor(spent, currency)}</strong></span></div>
            <div className="panel"><TrendingDown /><span><small>Average Spend</small><strong>{expenses.length ? fromMinor(spent / expenses.length, currency) : fromMinor(0, currency)}</strong></span></div>
          </div>
          <div className={`transactions-layout ${selectedExpense ? "with-detail" : ""}`}>
            <section className="transaction-main">
              <div className="transaction-toolbar reference-toolbar">
                <div className="filter-group"><span>Sort by</span><label><select aria-label="Transaction order" value={transactionSort} onChange={(event) => { setTransactionSort(event.target.value as TransactionSort); setTransactionPage(1); }}><option value="date-desc">Date, Newest</option><option value="date-asc">Date, Oldest</option><option value="amount-desc">Amount, Largest</option></select></label></div>
                <div className="range-pills">{(["1","7","30","all"] as DateRange[]).map(range => <button key={range} className={transactionRange === range ? "active" : ""} onClick={() => { setTransactionRange(range); setTransactionPage(1); }}>{range === "all" ? "All Time" : `${range}D`}</button>)}</div>
                <span className="approved-filter"><ShieldCheck size={16}/>Approved</span>
              </div>
              <div className="transaction-table panel">
                <div className="transaction-table-head"><span>Merchant</span><span>Date</span><span>Amount</span><span>Category</span><span>Status</span><span>Blockchain Proof</span><span>Actions</span></div>
                {paginatedExpenses.length ? paginatedExpenses.map((expense) => <div className={`transaction-table-row ${selectedExpense?.id === expense.id ? "selected" : ""}`} key={expense.id} onClick={() => openTransactionDetails(expense)}>
                  <span className="merchant-cell"><span className="tx-icon"><ReceiptText size={18}/></span><b>{expense.store}</b></span>
                  <span>{expense.date}</span><strong>{fromMinor(expense.amount, expense.currency)}</strong><span>{expense.category}</span><span><i className="verified-dot"/>Verified</span>
                  <span>{expense.tx_hash ? <a href={`${config.explorer}/tx/${expense.tx_hash}`} onClick={event => event.stopPropagation()} target="_blank" rel="noreferrer">{expense.tx_hash.slice(0,7)}…{expense.tx_hash.slice(-4)} <ExternalLink size={13}/></a> : <small>Local proof</small>}</span>
                  <button aria-label={`View ${expense.store} details`} onClick={(event) => { event.stopPropagation(); openTransactionDetails(expense); }}><MoreHorizontal/></button>
                </div>) : expenses.length ? <div className="empty-state"><CalendarDays size={32}/><h3>No transactions in this period.</h3><p>Choose another date range to see more approved receipts.</p></div> : <EmptyTransactions onAdd={() => setTab("add")}/>}
                {filteredExpenses.length > 0 && <div className="table-pagination"><span>Showing {(transactionPage - 1) * transactionPageSize + 1}–{Math.min(transactionPage * transactionPageSize, filteredExpenses.length)} of {filteredExpenses.length} transactions</span><div><button disabled={transactionPage === 1} onClick={() => setTransactionPage(page => page - 1)}>‹</button>{Array.from({length: transactionPageCount}, (_, index) => <button key={index} className={transactionPage === index + 1 ? "active" : ""} onClick={() => setTransactionPage(index + 1)}>{index + 1}</button>)}<button disabled={transactionPage === transactionPageCount} onClick={() => setTransactionPage(page => page + 1)}>›</button></div></div>}
              </div>
            </section>
            {selectedExpense && <aside className="transaction-detail panel">
              <div className="detail-head"><h2><ExternalLink size={18}/>Transaction Details</h2><button onClick={() => { setSelectedExpense(null); if (detailReceipt?.url) URL.revokeObjectURL(detailReceipt.url); setDetailReceipt(null); }}><X/></button></div>
              <div className="detail-merchant"><span className="tx-icon"><ReceiptText/></span><div><strong>{selectedExpense.store}</strong><small>{selectedExpense.category}</small></div><span className="status-chip"><CheckCircle2 size={13}/>Verified</span></div>
              <h3>{fromMinor(selectedExpense.amount, selectedExpense.currency)}</h3><p className="muted">{selectedExpense.date}</p>
              <button className="detail-receipt" onClick={() => viewReceipt(selectedExpense)}>{detailReceipt?.type === "application/pdf" ? <iframe src={detailReceipt.url} title="Receipt preview"/> : detailReceipt ? <img src={detailReceipt.url} alt="Original receipt"/> : <span><ReceiptText size={40}/>Original receipt unavailable</span>}<Eye size={18}/></button>
              <h3 className="detail-section-title">Extracted Information</h3><dl><div><dt>Merchant</dt><dd>{selectedExpense.store}</dd></div><div><dt>Date</dt><dd>{selectedExpense.date}</dd></div><div><dt>Amount</dt><dd>{fromMinor(selectedExpense.amount, selectedExpense.currency)}</dd></div><div><dt>Category</dt><dd>{selectedExpense.category}</dd></div><div><dt>Receipt Hash</dt><dd>{selectedExpense.receipt_hash.slice(0,12)}…</dd></div></dl>
              <div className="detail-proof"><div><h3>Blockchain Proof</h3>{selectedExpense.tx_hash && <a href={`${config.explorer}/tx/${selectedExpense.tx_hash}`} target="_blank" rel="noreferrer">View on Explorer <ExternalLink size={14}/></a>}</div><p><ShieldCheck/><span><strong>{selectedExpense.tx_hash ? "Verified & Stored on Blockchain" : "AI Verified Receipt"}</strong><small>{selectedExpense.tx_hash ? "Immutable transaction proof" : "Stored locally on this device"}</small></span></p></div>
            </aside>}
          </div>
        </TabsContent>

        <TabsContent value="proof">
          <div className="proof-metrics">
            <div className="panel"><ShieldCheck /><span><small>Verified receipts</small><strong>{expenses.length}</strong></span></div>
            <div className="panel"><ReceiptText /><span><small>Total approved value</small><strong>{fromMinor(expenses.reduce((sum, item) => sum + item.amount, 0), currency)}</strong></span></div>
            <div className="panel"><TrendingDown /><span><small>On-chain proofs</small><strong>{expenses.filter((item) => item.tx_hash).length}</strong></span></div>
          </div>
          <div className="proof-grid">
            <section className="panel report-builder">
              <div className="sectionhead"><div><h2>Generate reimbursement report</h2><p className="muted">Create a PDF from AI-verified expenses across your currency accounts.</p></div><Download /></div>
              <p className="field-title">Select date range</p>
              <div className="range-buttons">{(["1", "7", "30", "all"] as DateRange[]).map((range) => <button key={range} className={reportRange === range ? "active" : ""} onClick={() => setReportRange(range)}>{range === "all" ? "All Transactions" : `Last ${range} Day${range === "1" ? "" : "s"}`}</button>)}</div>
              <div className="report-count"><span>Approved transactions included</span><strong>{reportTransactionCount}</strong></div>
              <button className="primary generate-report" disabled={busy || reportTransactionCount === 0} onClick={downloadReimbursementReport}><Download size={18} />{busy ? "Generating…" : "Generate Report"}<ArrowUpRight size={18} /></button>
            </section>
            <section className="panel report-preview">
              <div className="sectionhead"><div><h2>Report preview</h2><p className="muted">Your reimbursement proof, ready to download.</p></div><Eye /></div>
              <div className="paper-preview"><span className="paper-logo">S SpendWise</span><h3>Expense Reimbursement Report</h3><p>Your expenses. Clearer tomorrow.</p><div><b>{reportTransactionCount}</b><small>Approved receipts</small></div><div><b>{currency}</b><small>Current account</small></div><div><b>{reportRange === "all" ? "All" : `${reportRange} days`}</b><small>Date range</small></div></div>
            </section>
          </div>
          <section className="panel proof-center"><div className="sectionhead"><div><h2>Blockchain proof center</h2><p className="muted">Approved receipts secured on BOT Chain.</p></div></div>{expenses.length ? expenses.map((expense) => <div className="proof-row" key={expense.id}><span><ReceiptText size={17} /><b>{expense.store}</b></span><code>{expense.tx_hash ? `${expense.tx_hash.slice(0, 8)}…${expense.tx_hash.slice(-6)}` : "Local proof"}</code><span className="status-chip"><CheckCircle2 size={13} />Verified</span>{expense.tx_hash ? <a href={`${config.explorer}/tx/${expense.tx_hash}`} target="_blank" rel="noreferrer">View proof <ArrowUpRight size={14} /></a> : <small>Not on-chain</small>}</div>) : <EmptyTransactions onAdd={() => setTab("add")} />}</section>
        </TabsContent>
      </Tabs>

      <footer><span>SpendWise <span className="muted">· One wallet, four currency accounts.</span></span><div><a href="https://botchain.ai" target="_blank" rel="noreferrer">Built for BOT Chain</a><a href="https://scan.botchain.ai" target="_blank" rel="noreferrer">Explorer ↗</a></div></footer>
    </main>
    </div>

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

    <Dialog open={reportOpen} onOpenChange={setReportOpen}>
      <DialogContent>
        <DialogTitle>Download reimbursement report</DialogTitle>
        <DialogDescription>Choose which AI-approved transactions should be included. The report checks all four currency accounts connected to this wallet.</DialogDescription>
        <div className="report-range-list">
          {(["1", "7", "30", "all"] as DateRange[]).map((range) => {
            const label = range === "all" ? "All transactions" : `Last ${range} day${range === "1" ? "" : "s"}`;
            return <button type="button" key={range} className={`report-range-option ${reportRange === range ? "selected" : ""}`} onClick={() => setReportRange(range)}><span><strong>{label}</strong><small>{range === "all" ? "Every approved receipt from this wallet" : `Approved receipts dated within the ${label.toLowerCase()}`}</small></span>{reportRange === range && <CheckCircle2 size={19} />}</button>;
          })}
        </div>
        <div className="report-summary"><span>Transactions included</span><strong>{reportTransactionCount}</strong></div>
        <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setReportOpen(false)}>Cancel</button><button type="button" className="primary" disabled={busy || reportTransactionCount === 0} onClick={downloadReimbursementReport}><Download size={16} />{busy ? "Generating PDF…" : "Download PDF"}</button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(receiptViewer)} onOpenChange={(open) => {
      if (!open && receiptViewer?.url) {
        URL.revokeObjectURL(receiptViewer.url);
        setReceiptViewer(null);
      }
    }}>
      <DialogContent className="receipt-dialog">
        <DialogTitle>Original scanned receipt</DialogTitle>
        <DialogDescription>This is the original file stored on this device after AI verification.</DialogDescription>
        {receiptViewer?.type === "application/pdf" ? <iframe className="receipt-document" src={receiptViewer.url} title="Original scanned receipt PDF" /> : receiptViewer && <img className="receipt-document" src={receiptViewer.url} alt="Original scanned receipt" />}
        {receiptViewer && <a className="secondary receipt-file-link" href={receiptViewer.url} target="_blank" rel="noreferrer">Open original file <ArrowUpRight size={16} /></a>}
      </DialogContent>
    </Dialog>
  </div>;
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

function Transaction({ expense, config, onViewReceipt }: { expense: Expense; config: Config; onViewReceipt(expense: Expense): void }) {
  const Icon = expense.category === "Food & drinks" ? Coffee : expense.category === "Transport" ? Bus : ShoppingBag;
  return <div className="transaction">
    <span className={`tx-icon ${expense.category === "Food & drinks" ? "orange" : expense.category === "Transport" ? "blue" : "green"}`}><Icon size={20} /></span>
    <div className="tx-description"><strong>{expense.store}</strong><span>{expense.category} · {expense.date}</span></div>
    <button className="receipt-view-button" type="button" onClick={() => onViewReceipt(expense)}><Eye size={15} />View scanned receipt</button>
    <div className="tx-proof">{expense.tx_hash ? <a href={`${config.explorer}/tx/${expense.tx_hash}`} target="_blank" rel="noreferrer"><CheckCircle2 size={13} />On-chain</a> : <span><CheckCircle2 size={13} />AI verified</span>}<strong>−{fromMinor(expense.amount, expense.currency)}</strong></div>
  </div>;
}
