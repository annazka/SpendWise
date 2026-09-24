"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { PeriodPicker, SpendingChart } from "@/components/overview-controls";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CloudSun,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  LogOut,
  Maximize2,
  Moon,
  Eye,
  FileText,
  History,
  LockKeyhole,
  ReceiptText,
  RotateCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingDown,
  UploadCloud,
  Wallet,
  XCircle,
  X,
  ZoomIn,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster, toast } from "sonner";
import { authenticateWallet, ensureBotChainNetwork, recordExpense } from "@/lib/chain";
import { LandingPage } from "@/components/landing-page";

const CURRENCIES = {
  IDR: { name: "Indonesian Rupiah", symbol: "Rp", locale: "id-ID", decimals: 0, accent: "emerald" },
  USD: { name: "US Dollar", symbol: "$", locale: "en-US", decimals: 2, accent: "blue" },
  MYR: { name: "Malaysian Ringgit", symbol: "RM", locale: "ms-MY", decimals: 2, accent: "amber" },
  SGD: { name: "Singapore Dollar", symbol: "S$", locale: "en-SG", decimals: 2, accent: "violet" },
} as const;

type Currency = keyof typeof CURRENCIES;
type DateRange = "1" | "7" | "30" | "all";
type ReportRange = DateRange | "custom";
type TransactionSort = "date-desc" | "date-asc" | "amount-desc";
type ChartRange = "1" | "7" | "30" | "90" | "all";
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
  receipt_mime?: string | null;
  notes?: string | null;
};
type Config = { aiEnabled: boolean; contractAddress: string; chainId: number; rpc: string; explorer: string };
type ReportHistoryItem = { id: string; fileName: string; range: string; generatedAt: string; size: number; transactionCount: number; fileKey: string };
type ReportPreview = ReportHistoryItem & { blob: Blob; url: string };

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

function isWithinDateRange(date: string, range: DateRange) {
  if (range === "all") return true;
  const days = Number(range);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const transactionDate = new Date(`${date}T00:00:00`);
  return !Number.isNaN(transactionDate.getTime()) && transactionDate >= start;
}

function isWithinReportRange(date: string, range: ReportRange, start: string, end: string) {
  if (range === "custom") return Boolean(start && end && start <= end && date >= start && date <= end);
  return isWithinDateRange(date, range);
}

async function hashReceipt(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const [auth, setAuth] = useState<"checking" | "guest" | "connected">("checking");
  const [wallet, setWallet] = useState("");
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allWalletExpenses, setAllWalletExpenses] = useState<Expense[]>([]);
  const [config, setConfig] = useState<Config>({ aiEnabled: false, contractAddress: "0x1f04BA244bfDAc7db33061eA88DEE66eD7AFB2Da", chainId: 677, rpc: "https://rpc.botchain.ai", explorer: "https://scan.botchain.ai" });
  const [tab, setTab] = useState("overview");
  const [transactionRange, setTransactionRange] = useState<DateRange>("all");
  const [transactionSort, setTransactionSort] = useState<TransactionSort>("date-desc");
  const [reportRange, setReportRange] = useState<ReportRange>("all");
  const [reportCurrencies, setReportCurrencies] = useState<Currency[]>([]);
  const [reportStart, setReportStart] = useState(today);
  const [reportEnd, setReportEnd] = useState(today);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [form, setForm] = useState({ store: "", date: today(), amount: "", category: "Other", notes: "" });
  const [scanStatus, setScanStatus] = useState<"IDLE" | "VALIDATING" | "APPROVED" | "REJECTED">("IDLE");
  const [scanMessage, setScanMessage] = useState("");
  const [receiptHash, setReceiptHash] = useState("");
  const [providerDocumentId, setProviderDocumentId] = useState<string | null>(null);
  const [scannedReceipt, setScannedReceipt] = useState<File | null>(null);
  const [scanPreviewType, setScanPreviewType] = useState("");
  const [recentScan, setRecentScan] = useState<Expense | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [scanRotation, setScanRotation] = useState(0);
  const [scanZoom, setScanZoom] = useState(false);
  const [scanFullscreen, setScanFullscreen] = useState(false);
  const [scanElapsed, setScanElapsed] = useState<number | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [receiptViewer, setReceiptViewer] = useState<{ url: string; type: string } | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [detailReceipt, setDetailReceipt] = useState<{ url: string; type: string } | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);
  const [overviewRange, setOverviewRange] = useState<ChartRange>("30");
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationReadIds, setNotificationReadIds] = useState<string[]>([]);
  const recentThumbs = useMemo(() => Object.fromEntries(expenses
    .filter((expense) => expense.receipt_mime?.startsWith("image/"))
    .slice(0, 4)
    .map((expense) => [expense.id, `/api/receipts/${expense.id}`])), [expenses]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { wallet?: string | null }) => {
        if (cancelled) return;
        if (data.wallet) { setWallet(data.wallet); setAuth("connected"); }
        else setAuth("guest");
      })
      .catch(() => { if (!cancelled) setAuth("guest"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const updateClock = () => setCurrentTime(new Date());
    queueMicrotask(updateClock);
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    queueMicrotask(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(`spendwise:notification-read:${wallet.toLowerCase()}`) || "[]");
        setNotificationReadIds(Array.isArray(saved) ? saved.filter((id: unknown): id is string => typeof id === "string") : []);
      } catch {
        setNotificationReadIds([]);
      }
    });
  }, [wallet]);

  useEffect(() => () => {
    if (reportPreview?.url) URL.revokeObjectURL(reportPreview.url);
  }, [reportPreview]);

  async function loadAccount(selected: Currency) {
    setLoaded(false);
    const response = await fetch(`/api/data?currency=${selected}`, { cache: "no-store" });
    const data = await response.json() as { account?: Account; expenses?: Expense[]; allExpenses?: Expense[]; reports?: ReportHistoryItem[]; error?: string };
    if (!response.ok || !data.account || !data.expenses || !data.allExpenses) throw new Error(data.error || "Could not load your wallet data.");
    setAccount(data.account);
    setExpenses(data.expenses);
    setAllWalletExpenses(data.allExpenses);
    setReportHistory(data.reports || []);
    const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.NEXT_PUBLIC_BOT_CHAIN_ID || 677);
    setConfig({
      aiEnabled: process.env.NEXT_PUBLIC_AI_ENABLED !== "false",
      contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_BOT_CONTRACT_ADDRESS || "0x1f04BA244bfDAc7db33061eA88DEE66eD7AFB2Da",
      chainId,
      rpc: process.env.NEXT_PUBLIC_BOT_CHAIN_RPC || process.env.NEXT_PUBLIC_BOT_RPC || (chainId === 677 ? "https://rpc.botchain.ai" : "https://rpc.bohr.life"),
      explorer: process.env.NEXT_PUBLIC_BOT_EXPLORER || (chainId === 677 ? "https://scan.botchain.ai" : "https://scan.bohr.life"),
    });
    setCurrency(selected);
    localStorage.setItem(`spendwise:last-currency:${wallet.toLowerCase()}`, selected);
    setReportCurrencies([selected]);
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
      try { await ensureBotChainNetwork(config); }
      catch (networkError) { toast.warning(networkError instanceof Error ? networkError.message : "Switch to BOT Chain Mainnet before recording an expense."); }
      router.push("/currency");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setWalletOpen(false);
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
    setAuth("guest");
    setWallet("");
    setCurrency(null);
    setExpenses([]);
    setAllWalletExpenses([]);
    setAccount(null);
    router.push("/wallet");
  }

  async function save(action: string, data: Record<string, unknown>) {
    if (!currency || !wallet) throw new Error("Choose a currency account first.");
    if (action === "budget") {
      const amount = typeof data.amount === "number" ? data.amount : null;
      const response = await fetch("/api/account", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          currency, amount, start: amount == null ? null : String(data.start || ""), end: amount == null ? null : String(data.end || ""),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save the budget.");
    } else throw new Error("Unsupported save action.");
  }

  async function scan(file: File) {
    if (!currency || busy) return;
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) return toast.error("Use a JPG, PNG, WebP, or PDF receipt.");
    if (file.size > 20 * 1024 * 1024) return toast.error("Choose a receipt smaller than 20 MB.");
    setBusy(true);
    try {
      const fileHash = await hashReceipt(file);
      const alreadySaved = allWalletExpenses.some((expense) => expense.receipt_hash?.toLowerCase() === fileHash);
      if (alreadySaved) {
        toast.error("This receipt was already saved. Renaming the file does not create a new receipt.");
        return;
      }
    } catch {
      toast.error("Could not check this receipt for duplicates.");
      return;
    } finally {
      setBusy(false);
    }
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setScanPreviewType(file.type);
    setRecentScan(null);
    setScanRotation(0);
    setScanZoom(false);
    setScanElapsed(null);
    setScanStatus("VALIDATING");
    setScanMessage("AI is checking the receipt authenticity and reading its details.");
    setReceiptHash("");
    setScannedReceipt(file);
    setBusy(true);
    const scanStarted = performance.now();
    try {
      const body = new FormData();
      body.append("receipt", file);
      body.append("currency", currency);
      const response = await fetch("/api/scan", { method: "POST", body });
      const data = await response.json() as { status?: "APPROVED" | "REJECTED"; store?: string; date?: string; amount?: number; category?: string; notes?: string; receiptHash?: string; providerDocumentId?: string | null; reasons?: string[]; error?: string };
      if (!response.ok || data.status !== "APPROVED") {
        setScanStatus("REJECTED");
        setScanMessage(data.reasons?.join(" ") || data.error || "This receipt could not be verified.");
        setForm({ store: "", date: today(), amount: "", category: "Other", notes: "" });
        setScannedReceipt(null);
        throw new Error(data.reasons?.[0] || data.error || "This receipt could not be verified.");
      }
      if (allWalletExpenses.some((expense) =>
        expense.receipt_hash?.toLowerCase() === data.receiptHash?.toLowerCase() ||
        (data.providerDocumentId && expense.provider_document_id === data.providerDocumentId))) {
        setScanStatus("REJECTED");
        setScanMessage("This receipt was already saved to this wallet.");
        setScannedReceipt(null);
        throw new Error("Duplicate receipt detected.");
      }
      setForm({
        store: data.store || "",
        date: data.date || today(),
        amount: data.amount == null ? "" : String(data.amount),
        category: categories.includes(data.category || "") ? data.category! : "Other",
        notes: data.notes?.trim() || "",
      });
      setReceiptHash(data.receiptHash || "");
      setProviderDocumentId(data.providerDocumentId || null);
      setScanStatus("APPROVED");
      setScanElapsed(Math.max(0.1, (performance.now() - scanStarted) / 1000));
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
    if (recentScan || scanStatus !== "APPROVED" || !receiptHash || !scannedReceipt) return toast.error("Scan and verify a new receipt first.");
    if (allWalletExpenses.some((expense) =>
      expense.receipt_hash?.toLowerCase() === receiptHash.toLowerCase() ||
      (providerDocumentId && expense.provider_document_id === providerDocumentId))) return toast.error("This receipt was already saved.");
    const amountMinor = toMinor(form.amount, currency);
    if (amountMinor < 1) return toast.error("Enter a valid amount.");
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const chain = await recordExpense({ id, ...form, amountMinor, currency, receiptHash }, config);
      if (!chain.txHash || !chain.onchainId) throw new Error("The BOT Chain contract is not configured.");
      const payload = new FormData();
      payload.append("id", id); payload.append("merchant", form.store); payload.append("date", form.date);
      payload.append("amount", String(amountMinor)); payload.append("category", form.category); payload.append("currency", currency);
      payload.append("notes", form.notes); payload.append("receiptHash", receiptHash); payload.append("providerDocumentId", providerDocumentId || "");
      payload.append("txHash", chain.txHash); payload.append("onchainId", chain.onchainId);
      payload.append("receipt", scannedReceipt);
      const saveResponse = await fetch("/api/expenses", { method: "POST", body: payload });
      const saveResult = await saveResponse.json() as { expense?: Record<string, unknown>; error?: string };
      if (!saveResponse.ok) throw new Error(saveResult.error || "Could not save this expense.");
      const savedExpense: Expense = {
        id, store: form.store, date: form.date, amount: amountMinor, category: form.category, currency,
        tx_hash: chain.txHash, onchain_id: chain.onchainId, validation_status: "APPROVED", receipt_hash: receiptHash,
        provider_document_id: providerDocumentId, receipt_file_key: String(saveResult.expense?.receipt_path || ""),
        receipt_mime: scannedReceipt.type, notes: form.notes,
      };
      setForm({ store: "", date: today(), amount: "", category: "Other", notes: "" });
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
      setPreview("");
      setScanPreviewType("");
      setScanStatus("IDLE");
      setScanMessage("");
      setReceiptHash("");
      setProviderDocumentId(null);
      setScannedReceipt(null);
      await loadAccount(currency);
      setSelectedExpense(savedExpense);
      setDetailReceipt({ url: `/api/receipts/${savedExpense.id}`, type: savedExpense.receipt_mime || "image/jpeg" });
      setTab("transactions");
      toast.success("Expense recorded on BOT Chain and saved securely");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not record this expense.";
      toast.error(message.toLowerCase().includes("reject") ? "Transaction cancelled. The receipt was not saved." : message);
    } finally {
      setBusy(false);
    }
  }

  async function showRecentScan(expense: Expense) {
    setRecentScan(expense);
    setScannedReceipt(null);
    setScanStatus("IDLE");
    setScanRotation(0);
    setScanZoom(false);
    if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview("");
    setScanPreviewType("");
    if (!expense.receipt_file_key) return;
    setPreview(`/api/receipts/${expense.id}`);
    setScanPreviewType(expense.receipt_mime || "image/jpeg");
  }

  async function viewReceipt(expense: Expense) {
    if (!expense.receipt_file_key) return toast.error("The original file is unavailable because this receipt was saved before file storage was enabled.");
    setReceiptViewer({ url: `/api/receipts/${expense.id}`, type: expense.receipt_mime || "image/jpeg" });
  }

  async function openTransactionDetails(expense: Expense) {
    setSelectedExpense(expense);
    if (detailReceipt?.url) URL.revokeObjectURL(detailReceipt.url);
    setDetailReceipt(null);
    if (!expense.receipt_file_key) return;
    setDetailReceipt({ url: `/api/receipts/${expense.id}`, type: expense.receipt_mime || "image/jpeg" });
  }

  function getApprovedReportGroups() {
    const approvedByCurrency = reportCurrencies
      .map((code) => ({
        currency: code,
        expenses: allWalletExpenses.filter((expense) => expense.currency === code &&
          (expense.validation_status === "APPROVED" || Boolean(expense.receipt_hash)) && isWithinReportRange(expense.date, reportRange, reportStart, reportEnd))
          .sort((a, b) => b.date.localeCompare(a.date)),
      }))
      .filter((group) => group.expenses.length > 0);

    return approvedByCurrency;
  }

  async function buildReimbursementReport(): Promise<ReportPreview> {
    const approvedByCurrency = getApprovedReportGroups();

    if (!approvedByCurrency.length) throw new Error("No approved transactions are available in this period.");

    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const reportLogo = new window.Image();
    reportLogo.src = "/spendwise-logo.png";
    await reportLogo.decode();
    const generatedAt = new Date();
    const reportId = `SW-${generatedAt.toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 4)}`;
    const rangeLabel = reportRange === "custom" ? `${reportStart} to ${reportEnd}` : reportRange === "all" ? "All transactions" : `Last ${reportRange} day${reportRange === "1" ? "" : "s"}`;
    const transactionCount = approvedByCurrency.reduce((sum, group) => sum + group.expenses.length, 0);

    pdf.setFillColor(245, 249, 255);
    pdf.rect(0, 0, 210, 297, "F");
    pdf.setTextColor(20, 94, 210);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.addImage(reportLogo, "PNG", 15, 8, 11, 11);
    pdf.text("SpendWise", 29, 17);
    pdf.setTextColor(7, 35, 78);
    pdf.setFontSize(19);
    pdf.text("Expense Reimbursement Report", 15, 30);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(91, 115, 151);
    pdf.text("Your expenses. Clearer tomorrow.", 15, 36);
    pdf.text(`Generated ${generatedAt.toLocaleString("en-GB")}`, 195, 17, { align: "right" });
    pdf.text(`Report ID ${reportId}`, 195, 22, { align: "right" });

    const summaries = [
      { label: "APPROVED RECEIPTS", value: String(transactionCount) },
      { label: "CURRENCY ACCOUNTS", value: String(approvedByCurrency.length) },
      { label: "DATE RANGE", value: rangeLabel },
    ];
    summaries.forEach((item, index) => {
      const x = 15 + index * 61;
      pdf.setFillColor(231, 240, 253);
      pdf.roundedRect(x, 43, 57, 20, 2, 2, "F");
      pdf.setTextColor(7, 35, 78);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(index === 2 ? 9 : 14);
      pdf.text(item.value, x + 4, 52);
      pdf.setTextColor(91, 115, 151);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6.5);
      pdf.text(item.label, x + 4, 59);
    });

    pdf.setTextColor(7, 35, 78);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text(`Submitted by wallet: ${wallet}`, 15, 70);
    pdf.text("AI validation status: VERIFIED. Eligible for reimbursement submission.", 15, 75);

    let y = 85;
      for (const group of approvedByCurrency) {
        const total = group.expenses.reduce((sum, expense) => sum + expense.amount, 0);
        if (y > 235) {
          pdf.addPage();
          y = 20;
        }
        pdf.setTextColor(7, 35, 78);
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
          headStyles: { fillColor: [20, 94, 210], textColor: 255 },
          alternateRowStyles: { fillColor: [237, 244, 254] },
          columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 38 }, 2: { cellWidth: 28 }, 3: { cellWidth: 27 }, 4: { cellWidth: 70 } },
          margin: { left: 15, right: 15 },
        });
        y = (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
        y += 12;
      }

    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page);
      pdf.setDrawColor(203, 218, 239);
      pdf.line(15, 283, 195, 283);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(91, 115, 151);
      pdf.text("AI validates receipt authenticity. Final reimbursement remains subject to organization policy.", 15, 288);
      pdf.text(`Page ${page} of ${pages}`, 195, 288, { align: "right" });
    }

    const blob = pdf.output("blob");
    const fileName = `SpendWise-Reimbursement-${reportCurrencies.join("-")}-${reportRange === "all" ? "All" : reportRange === "custom" ? `${reportStart}-to-${reportEnd}` : `${reportRange}Days`}-${reportId}.pdf`;
    return { id: reportId, fileName, range: rangeLabel, generatedAt: generatedAt.toISOString(), size: blob.size, transactionCount, fileKey: `${wallet.toLowerCase()}:${reportId}`, blob, url: URL.createObjectURL(blob) };
  }

  function triggerReportDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPreviewReport() {
    if (!reportPreview) return toast.error("Generate a PDF preview first.");
    try {
      if (reportHistory.some((item) => item.id === reportPreview.id)) {
        triggerReportDownload(reportPreview.blob, reportPreview.fileName);
        return;
      }
      const payload = new FormData();
      payload.append("id", reportPreview.id); payload.append("fileName", reportPreview.fileName); payload.append("range", reportPreview.range);
      payload.append("transactionCount", String(reportPreview.transactionCount));
      payload.append("report", new File([reportPreview.blob], reportPreview.fileName, { type: "application/pdf" }));
      const response = await fetch("/api/reports", { method: "POST", body: payload });
      const result = await response.json() as { item?: ReportHistoryItem; error?: string };
      if (!response.ok || !result.item) throw new Error(result.error || "Could not save the report.");
      const historyItem = result.item;
      const next = [historyItem, ...reportHistory.filter((item) => item.id !== historyItem.id)].slice(0, 20);
      setReportHistory(next);
      triggerReportDownload(reportPreview.blob, reportPreview.fileName);
      toast.success("Reimbursement PDF downloaded and added to history");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the report.");
    }
  }

  async function downloadHistoryReport(item: ReportHistoryItem) {
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(item.id)}`);
      if (!response.ok) throw new Error("The report file is unavailable.");
      const blob = await response.blob();
      triggerReportDownload(blob, item.fileName);
    } catch {
      toast.error("Could not open this report file.");
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
  const reportTransactionCount = allWalletExpenses.filter((expense) => reportCurrencies.includes(expense.currency) && isWithinReportRange(expense.date, reportRange, reportStart, reportEnd)).length;
  const reportDataSignature = allWalletExpenses
    .map((expense) => `${expense.id}:${expense.date}:${expense.amount}:${expense.receipt_hash ?? ""}:${expense.tx_hash ?? ""}`)
    .join("|");
  const onChainProofCount = allWalletExpenses.filter((expense) => expense.tx_hash).length;
  const proofSuccessRate = allWalletExpenses.length ? Math.round(onChainProofCount / allWalletExpenses.length * 100) : 0;
  const notifications = [
    reportHistory[0] ? { id: `report-${reportHistory[0].id}`, title: "Report exported", text: reportHistory[0].fileName, tab: "proof" } : null,
    allWalletExpenses[0] ? { id: `receipt-${allWalletExpenses[0].id}`, title: "Receipt verified", text: `${allWalletExpenses[0].store} is ready for reimbursement.`, tab: "transactions" } : { id: "scan-first", title: "Start your first report", text: "Scan and verify a receipt to create reimbursement proof.", tab: "add" },
    !config.contractAddress ? { id: "chain-local", title: "Local proof mode", text: "Configure the BOT Chain contract to create on-chain proofs.", tab: "proof" } : null,
  ].filter(Boolean) as { id: string; title: string; text: string; tab: string }[];
  const hasUnreadNotifications = notifications.some((item) => !notificationReadIds.includes(item.id));

  function markNotificationsRead(ids: string[]) {
    const next = [...new Set([...notificationReadIds, ...ids])];
    setNotificationReadIds(next);
    localStorage.setItem(`spendwise:notification-read:${wallet.toLowerCase()}`, JSON.stringify(next));
  }
  const overviewExpenses = useMemo(() => [...expenses].filter((expense) => {
    if (overviewRange === "all") return true;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (Number(overviewRange) - 1));
    return new Date(`${expense.date}T00:00:00`) >= start;
  }), [expenses, overviewRange]);
  const overviewSpent = overviewExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const overviewActiveDays = new Set(overviewExpenses.map((expense) => expense.date)).size;
  const previousOverviewSpent = useMemo(() => {
    if (overviewRange === "all") return null;
    const days = Number(overviewRange);
    const currentStart = new Date();
    currentStart.setHours(0, 0, 0, 0);
    currentStart.setDate(currentStart.getDate() - (days - 1));
    const previousStart = new Date(currentStart);
    previousStart.setDate(previousStart.getDate() - days);
    return expenses.filter((expense) => {
      const date = new Date(`${expense.date}T00:00:00`);
      return date >= previousStart && date < currentStart;
    }).reduce((sum, expense) => sum + expense.amount, 0);
  }, [expenses, overviewRange]);
  const overviewChange = previousOverviewSpent == null || previousOverviewSpent === 0
    ? null
    : Math.round((overviewSpent - previousOverviewSpent) / previousOverviewSpent * 100);
  const overviewPeriodCopy = overviewRange === "1" ? "today" : overviewRange === "all" ? "across all approved receipts" : `in the last ${overviewRange} days`;
  const scanDetails = recentScan
    ? { store: recentScan.store, date: recentScan.date, amount: fromMinor(recentScan.amount, recentScan.currency), category: recentScan.category, currency: recentScan.currency, notes: recentScan.notes || "No notes detected" }
    : { store: form.store, date: form.date, amount: form.amount ? fromMinor(toMinor(form.amount, currency || "IDR"), currency || "IDR") : "", category: form.category, currency, notes: form.notes || "No notes detected" };
  const currentHour = currentTime?.getHours() ?? 12;
  const greetingText = currentHour < 12 ? "Good morning" : currentHour < 18 ? "Good afternoon" : "Good evening";
  const GreetingIcon = currentHour < 12 ? Sun : currentHour < 18 ? CloudSun : Moon;
  const currentDateTime = currentTime ? `${currentTime.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} · ${currentTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "Loading local time…";
  const categoryTotals = useMemo(() => categories.map((name) => ({ name, amount: overviewExpenses.filter((expense) => expense.category === name).reduce((sum, expense) => sum + expense.amount, 0) })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount), [overviewExpenses]);

  useEffect(() => {
    let cancelled = false;
    if (tab !== "proof" || !wallet || reportTransactionCount === 0) {
      queueMicrotask(() => {
        if (!cancelled) {
          setReportPreviewLoading(false);
          setReportPreview(null);
        }
      });
      return () => { cancelled = true; };
    }

    queueMicrotask(async () => {
      if (cancelled) return;
      setReportPreviewLoading(true);
      try {
        const report = await buildReimbursementReport();
        if (cancelled) return URL.revokeObjectURL(report.url);
        setReportPreview(report);
      } catch (error) {
        if (!cancelled) {
          setReportPreview(null);
          toast.error(error instanceof Error ? error.message : "Could not generate the reimbursement PDF preview.");
        }
      } finally {
        if (!cancelled) setReportPreviewLoading(false);
      }
    });
    return () => { cancelled = true; };
    // PDF generation intentionally follows the active proof tab, wallet data, and selected range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, reportRange, reportStart, reportEnd, reportCurrencies, reportTransactionCount, reportDataSignature, wallet]);

  useEffect(() => {
    if (auth === "checking" || pathname === "/" || pathname === "/wallet") return;
    if (auth === "guest") {
      router.replace("/wallet");
      return;
    }
    if (pathname === "/app" && !currency && wallet) {
      const savedCurrency = localStorage.getItem(`spendwise:last-currency:${wallet.toLowerCase()}`);
      if (savedCurrency && savedCurrency in CURRENCIES) {
        queueMicrotask(() => loadAccount(savedCurrency as Currency).catch(() => router.replace("/currency")));
      } else router.replace("/currency");
    }
    // Route guards intentionally follow wallet and currency session state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, pathname, wallet, currency, router]);

  if (pathname === "/") return <LandingPage onLaunch={() => router.push("/wallet")} />;
  if (auth === "checking") return <LoadingScreen />;
  if (pathname === "/wallet") return <WalletGate busy={busy} onConnect={() => auth === "connected" ? router.push("/currency") : connect()} />;
  if (auth === "guest") return <LoadingScreen />;
  if (pathname === "/currency") return <CurrencyPicker wallet={wallet} onChoose={(selected) => loadAccount(selected).then(() => router.push("/app")).catch((error) => toast.error(error.message))} onDisconnect={disconnect} />;
  if (!currency) return <LoadingScreen />;

  return <div className="app-shell" data-ui-version="overview-v3">
    <Toaster richColors />
    <aside className="app-sidebar">
      <button className="sidebar-brand" onClick={() => setTab("overview")}><Image className="neon-logo" src="/spendwise-logo.png" alt="" width={47} height={47}/><span><strong>SpendWise</strong><small>Spend smarter.<br />Build a brighter tomorrow.</small></span></button>
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
      <Link className="brand" href="/" aria-label="SpendWise home"><Image className="brandmark" src="/spendwise-logo.png" alt="" width={37} height={37}/>SpendWise<span className="beta">BETA</span></Link>
      <div className="header-actions">
        <button className="wallet-btn wallet-card" onClick={() => setWalletOpen(true)} aria-haspopup="dialog"><Wallet size={20} /><span><strong>Main Wallet</strong><small>{wallet.slice(0, 6)}…{wallet.slice(-4)}</small></span><i /></button>
        <button className="account-switch" onClick={() => router.push("/currency")}><span className="currency-orb">{CURRENCIES[currency].symbol}</span>{currency}<ArrowLeftRight size={14} /></button>
        <button className="notification-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((open) => !open)}><Bell size={21} />{hasUnreadNotifications && <i />}</button>
        {notificationsOpen && <aside className="notification-popover">
          <div className="notification-head"><span><strong>Notifications</strong><small>{hasUnreadNotifications ? "New activity available" : "You are all caught up"}</small></span><button onClick={() => markNotificationsRead(notifications.map((item) => item.id))}>Mark all as read</button></div>
          <div className="notification-list">{notifications.map((item) => <button key={item.id} className={notificationReadIds.includes(item.id) ? "" : "unread"} onClick={() => { markNotificationsRead([item.id]); setTab(item.tab); setNotificationsOpen(false); }}><span className="notification-icon"><Bell size={15}/></span><span><strong>{item.title}</strong><small>{item.text}</small></span><ArrowUpRight size={14}/></button>)}</div>
        </aside>}
      </div>
      <div className="greeting"><GreetingIcon /><span><small>{currentDateTime}</small><strong>{greetingText}</strong></span></div>
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
                <span><Wallet size={20} />Total Spend</span>
                <PeriodPicker value={overviewRange} onChange={setOverviewRange} />
              </div>
              <p className="budget-sub">Total amount spent {overviewPeriodCopy}</p>
              <div className="big-amount">{fromMinor(overviewSpent, currency)}</div>
              <div className={`spend-change ${overviewChange == null ? "neutral" : overviewChange >= 0 ? "up" : "down"}`}><TrendingDown />{overviewChange == null ? "No previous-period data" : `${overviewChange >= 0 ? "+" : ""}${overviewChange}% vs. previous period`}</div>
              <div className="spend-stats"><span><ReceiptText/><b>{overviewExpenses.length}</b><small>Approved Receipts</small></span><span><TrendingDown/><b>{overviewActiveDays ? fromMinor(overviewSpent / overviewActiveDays, currency) : fromMinor(0, currency)}</b><small>Avg. Daily Spend</small></span><button className={`budget-stat ${remaining == null ? "empty" : ""}`} onClick={() => setBudgetOpen(true)}><CalendarDays/><b>{remaining == null ? "Set your budget" : fromMinor(Math.max(0, remaining), currency)}</b><small>{remaining == null ? "Click here to budget your expenses" : "Remaining Budget"}</small>{remaining != null && budget ? <em>{Math.max(0, Math.min(100, Math.round(remaining / budget * 100)))}% left</em> : null}</button></div>
            </section>
            <section className="panel spend-trend hero-trend">
              <div className="sectionhead"><div><h2>Receipt Spend Trend</h2><p className="muted">Daily spending based on scanned receipts</p></div><div className="mini-ranges">{(["1","7","30","90","all"] as ChartRange[]).map(range => <button key={range} className={overviewRange === range ? "active" : ""} onClick={() => setOverviewRange(range)}>{range === "all" ? "All" : `${range}D`}</button>)}</div></div>
              {overviewExpenses.length ? <SpendingChart key={overviewRange + currency} expenses={overviewExpenses} format={value => fromMinor(value, currency)} /> : <EmptyTransactions onAdd={() => setTab("add")} />}
            </section>
          </div>
          <div className="overview-bottom-grid">
            <section className="panel recent-panel">
              <div className="sectionhead"><div><h2>Recent Receipts</h2><p className="muted">Latest receipts you’ve scanned</p></div><button className="text-btn" onClick={() => setTab("transactions")}>View All <ArrowUpRight size={16} /></button></div>
              {expenses.length ? expenses.slice(0, 5).map((expense) => <button className="recent-receipt-row" key={expense.id} onClick={() => viewReceipt(expense)}><span className="tx-icon"><ReceiptText/></span><span><strong>{expense.store}</strong><small>{expense.date}</small></span><b>{fromMinor(expense.amount,expense.currency)}</b><i><CheckCircle2/>Verified</i><ArrowUpRight/></button>) : <EmptyTransactions onAdd={() => setTab("add")} />}
            </section>
            <section className="panel category-panel">
              <div className="sectionhead"><div><h2>Category Breakdown</h2><p className="muted">Your spending by category</p></div></div>
              {categoryTotals.length ? <><div className="category-content"><div className="category-donut" style={{background:`conic-gradient(${categoryTotals.map((item,index) => {const before=categoryTotals.slice(0,index).reduce((sum,current)=>sum+current.amount,0)/Math.max(1,overviewSpent)*100;const after=before+item.amount/Math.max(1,overviewSpent)*100;return `${["#2794ff","#854cff","#00dfdf","#ffb321","#ff5790"][index%5]} ${before}% ${after}%`;}).join(",")})`}}><span><b>{fromMinor(overviewSpent,currency)}</b><small>Total Spend</small></span></div><div className="category-legend">{categoryTotals.map((item,index)=><button key={item.name} onClick={() => {setTransactionRange("all");setTransactionSort("amount-desc");setTab("transactions");}}><i style={{background:["#2794ff","#854cff","#00dfdf","#ffb321","#ff5790"][index%5]}}/><span>{item.name}</span><b>{Math.round(item.amount/Math.max(1,overviewSpent)*100)}%</b><small>{fromMinor(item.amount,currency)}</small></button>)}</div></div><button className="category-insight" onClick={() => setTab("transactions")}><Sun/><span><b>{categoryTotals[0].name} is your top category.</b><small>That’s {Math.round(categoryTotals[0].amount/Math.max(1,overviewSpent)*100)}% of your total spend.</small></span><ArrowUpRight/></button></> : <p className="muted">No approved receipts in this period.</p>}
            </section>
            <section className="panel chain-status-card">
              <div className="sectionhead"><div><h2>Blockchain Proof Status</h2><p className="muted">Your receipts secured on blockchain</p></div><button className="text-btn" onClick={() => setTab("proof")}>View All <ArrowUpRight/></button></div>
              <div className="proof-ring" style={{"--proof": `${expenses.length ? Math.round(expenses.filter(item => item.tx_hash).length / expenses.length * 100) : 0}%`} as React.CSSProperties}><span><b>{expenses.length ? Math.round(expenses.filter(item => item.tx_hash).length / expenses.length * 100) : 0}%</b><small>Verified & Stored<br/>On Blockchain</small></span></div>
              <div className="proof-summary"><span><b>{expenses.length}</b>Total Receipts</span><span><b>{expenses.filter(item => item.tx_hash).length}</b>Verified</span></div><button className="secure-banner" onClick={() => setTab("proof")}><ShieldCheck/><span><b>Your data is secure</b><small>Immutable proof. More peace of mind.</small></span><ArrowUpRight/></button>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="add">
          <div className="scan-workspace">
            <div className="scan-left-column">
              <section className="panel scan-upload-panel">
                <div className={`scan-upload-target ${dragOver ? "dragging" : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragOver(true); }}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; }}
                  onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
                  onDrop={(event) => { event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files[0]; if (file) void scan(file); }}>
                  <UploadCloud aria-hidden="true" className="scan-upload-icon" />
                  <strong>{busy && scanStatus === "VALIDATING" ? "AI is scanning your receipt…" : "Drag & drop your receipt here"}</strong>
                  <span>or choose a file to upload</span>
                  <input ref={receiptInputRef} className="scan-file-input" aria-label="Upload receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void scan(file); }} />
                  <button type="button" className="primary scan-choose-file" disabled={busy} onClick={() => receiptInputRef.current?.click()}>Choose File <ArrowUpRight size={19}/></button>
                  <small>Supports JPG, PNG, WebP, PDF (up to 20 MB)</small>
                </div>
              </section>
              <section className="panel scan-recent-panel">
                <div className="sectionhead"><div className="scan-section-title"><span className="scan-title-icon"><History /></span><span><h2>Recent Scans</h2><small>Your recently saved receipts</small></span></div><button type="button" className="text-btn" onClick={() => setTab("transactions")}>View All <ArrowUpRight size={16}/></button></div>
                {expenses.length ? <div className="scan-recent-list">{expenses.slice(0, 4).map((expense) => <button type="button" key={expense.id} className={`scan-recent-item ${recentScan?.id === expense.id ? "selected" : ""}`} onClick={() => void showRecentScan(expense)}>
                  <span className="scan-recent-thumb">{recentThumbs[expense.id] ? <img src={recentThumbs[expense.id]} alt="" /> : <FileText aria-hidden="true" />}</span>
                  <strong title={expense.store}>{expense.store}</strong><small>{new Date(`${expense.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small>
                </button>)}</div> : <div className="scan-recent-empty"><ReceiptText/><span>Saved receipts will appear here after your first scan.</span></div>}
              </section>
              <section className="panel scan-preview-panel">
                <div className="sectionhead"><div className="scan-section-title"><span className="scan-title-icon"><Eye /></span><span><h2>Receipt Preview</h2><small>{recentScan ? "Saved original receipt" : "Your receipt appears here automatically"}</small></span></div>
                  {preview && <div className="scan-preview-tools">{scanPreviewType !== "application/pdf" && <><button type="button" aria-label="Rotate receipt" title="Rotate receipt" onClick={() => setScanRotation((rotation) => (rotation + 90) % 360)}><RotateCw size={16}/> Rotate</button><button type="button" aria-label="Zoom receipt" title="Zoom receipt" onClick={() => setScanZoom((zoom) => !zoom)}><ZoomIn size={16}/> Zoom</button></>}<button type="button" aria-label="Expand receipt preview" title="Expand receipt preview" onClick={() => setScanFullscreen(true)}><Maximize2 size={16}/></button></div>}
                </div>
                <div className={`scan-preview-canvas ${scanZoom ? "zoomed" : ""}`}>
                  {preview ? scanPreviewType === "application/pdf" ? <iframe src={preview + "#toolbar=0&navpanes=0&view=FitH"} title="Receipt PDF preview" /> : <img src={preview} alt="Scanned receipt preview" style={{ transform: `rotate(${scanRotation}deg) scale(${scanZoom ? 1.6 : 1})` }} /> : <div className="scan-preview-placeholder"><ReceiptText/><strong>No receipt selected</strong><small>Upload a receipt or select a recent scan to see it here.</small></div>}
                </div>
              </section>
            </div>
            <form className="panel scan-extraction-panel" onSubmit={submitExpense}>
              <div className="sectionhead"><div className="scan-section-title"><span className="scan-title-icon"><Sparkles /></span><span><h2>AI Extraction</h2><small>{recentScan ? "Saved, AI verified receipt" : "Extracted details from your receipt"}</small></span></div>{(scanStatus === "APPROVED" || recentScan) && <span className="scan-ai-badge"><CheckCircle2 size={15}/> {recentScan ? "AI Verified" : `AI Processed${scanElapsed ? ` in ${scanElapsed.toFixed(1)}s` : ""}`}</span>}</div>
              {scanStatus === "VALIDATING" && !recentScan && <div className="scan-feedback validating" role="status"><span className="preview-spinner"/><span>AI is verifying your receipt and extracting its details…</span></div>}
              {scanStatus === "REJECTED" && !recentScan && <div className="scan-feedback rejected" role="alert"><XCircle size={18}/><span>{scanMessage || "This receipt could not be verified."}</span></div>}
              <div className="scan-detail-list">
                {([
                  ["Merchant", scanDetails.store],
                  ["Date", scanDetails.store || recentScan ? (scanDetails.date ? new Date(`${scanDetails.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "") : ""],
                  ["Amount", scanDetails.amount],
                  ["Category", scanDetails.store || recentScan ? scanDetails.category : ""],
                  ["Currency", `${scanDetails.currency} - ${CURRENCIES[scanDetails.currency || currency || "IDR"].name}`],
                  ["Notes", scanDetails.store || recentScan ? scanDetails.notes : ""],
                ] as [string, string][]).map(([label, value]) => <div className="scan-detail-row" key={label}><span>{label}</span><strong>{value || "Waiting for AI scan"}{(scanStatus === "APPROVED" || recentScan) && <CheckCircle2 size={17} aria-label="Verified by AI"/>}</strong></div>)}
              </div>
              <p className="scan-locked-note"><LockKeyhole size={15}/> AI approved details are read only.</p>
              <button type="submit" className="primary scan-save-button" disabled={busy || !loaded || scanStatus !== "APPROVED" || !!recentScan || !scannedReceipt}><CheckCircle2 size={19}/>{busy && scanStatus === "APPROVED" ? "Confirming on BOT Chain…" : recentScan ? "Transaction Already Saved" : "Save Transaction"}</button>
              {!config.aiEnabled && <p className="notice">AI scanning requires Veryfi configuration.</p>}
            </form>
          </div>
          <Dialog open={scanFullscreen} onOpenChange={setScanFullscreen}><DialogContent className="scan-fullscreen-dialog"><DialogTitle>Receipt Preview</DialogTitle><DialogDescription>Original receipt image or PDF.</DialogDescription><div className="scan-fullscreen-canvas">{preview && (scanPreviewType === "application/pdf" ? <iframe src={preview + "#toolbar=0"} title="Expanded receipt PDF"/> : <img src={preview} alt="Expanded scanned receipt" style={{ transform: `rotate(${scanRotation}deg)` }}/>)}</div></DialogContent></Dialog>
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
                <div className="transaction-table-head"><span>Merchant</span><span>Date</span><span>Amount</span><span>Category</span><span>Status</span><span>Blockchain Proof</span></div>
                {paginatedExpenses.length ? paginatedExpenses.map((expense) => <div className={`transaction-table-row ${selectedExpense?.id === expense.id ? "selected" : ""}`} key={expense.id} onClick={() => openTransactionDetails(expense)}>
                  <span className="merchant-cell"><span className="tx-icon"><ReceiptText size={18}/></span><b>{expense.store}</b></span>
                  <span>{expense.date}</span><strong>{fromMinor(expense.amount, expense.currency)}</strong><span>{expense.category}</span><span><i className="verified-dot"/>Verified</span>
                  <span>{expense.tx_hash ? <a href={`${config.explorer}/tx/${expense.tx_hash}`} onClick={event => event.stopPropagation()} target="_blank" rel="noreferrer">{expense.tx_hash.slice(0,7)}…{expense.tx_hash.slice(-4)} <ExternalLink size={13}/></a> : <small>Proof unavailable</small>}</span>
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
              <div className="detail-proof"><div><h3>Blockchain Proof</h3>{selectedExpense.tx_hash && <a href={`${config.explorer}/tx/${selectedExpense.tx_hash}`} target="_blank" rel="noreferrer">View on Explorer <ExternalLink size={14}/></a>}</div><p><ShieldCheck/><span><strong>{selectedExpense.tx_hash ? "Verified & Stored on Blockchain" : "Blockchain proof unavailable"}</strong><small>{selectedExpense.tx_hash ? "Immutable transaction proof" : "This legacy record has no transaction hash"}</small></span></p></div>
            </aside>}
          </div>
        </TabsContent>

        <TabsContent value="proof">
          <div className="proof-metrics">
            <div className="panel"><ReceiptText /><span><small>Generated reports</small><strong>{reportHistory.length}</strong></span></div>
            <div className="panel"><ShieldCheck /><span><small>Verified receipts</small><strong>{allWalletExpenses.length}</strong></span></div>
            <div className="panel"><TrendingDown /><span><small>Proof success rate</small><strong>{proofSuccessRate}%</strong></span></div>
          </div>
          <div className="proof-grid">
            <section className="panel report-builder">
              <div className="sectionhead"><div><h2>Generate reimbursement report</h2><p className="muted">Create a PDF from AI-verified expenses in your selected currency accounts.</p></div><Download /></div>
              <p className="field-title">Select currency accounts</p>
              <div className="report-currencies">{(Object.keys(CURRENCIES) as Currency[]).map((code) => <label key={code} className={reportCurrencies.includes(code) ? "selected" : ""}><input type="checkbox" checked={reportCurrencies.includes(code)} onChange={() => { setReportPreviewLoading(true); setReportPreview(null); setReportCurrencies((selected) => selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code].sort((a, b) => Object.keys(CURRENCIES).indexOf(a) - Object.keys(CURRENCIES).indexOf(b))); }} /><span>{code}</span></label>)}</div>
              <p className="field-title">Select date range</p>
              <div className="range-buttons report-ranges">{(["1", "7", "30", "all", "custom"] as ReportRange[]).map((range) => <button key={range} className={reportRange === range ? "active" : ""} aria-pressed={reportRange === range} onClick={() => { if (range !== reportRange) { setReportPreviewLoading(true); setReportRange(range); } }}>{range === "custom" ? "Custom Dates" : range === "all" ? "All Transactions" : `Last ${range} Day${range === "1" ? "" : "s"}`}</button>)}</div>
              {reportRange === "custom" && <div className="report-custom-dates"><label>Start date<input type="date" value={reportStart} onChange={(event) => { setReportPreviewLoading(true); setReportPreview(null); setReportStart(event.target.value); }} /></label><label>End date<input type="date" value={reportEnd} onChange={(event) => { setReportPreviewLoading(true); setReportPreview(null); setReportEnd(event.target.value); }} /></label></div>}
              {reportRange === "custom" && reportStart > reportEnd && <p className="report-date-error">End date must be on or after start date.</p>}
              <div className="report-count"><span>Approved transactions included</span><strong>{reportTransactionCount}</strong></div>
              <button className="primary generate-report" disabled={reportPreviewLoading || !reportPreview || reportTransactionCount === 0 || reportCurrencies.length === 0} onClick={downloadPreviewReport}><Download size={18} />{reportPreviewLoading ? "Preparing PDF…" : "Download PDF"}<ArrowUpRight size={18} /></button>
            </section>
            <section className="panel report-preview">
              <div className="sectionhead"><div><h2>Report preview</h2><p className="muted">View only. The downloaded PDF uses this exact file.</p></div><Eye /></div>
              {reportPreviewLoading ? <div className="report-preview-loading" role="status"><span className="preview-spinner"/><strong>Preparing PDF preview</strong><small>Building the report for your selected currency and date range…</small></div> : reportPreview ? <iframe className="pdf-preview-frame" src={`${reportPreview.url}#toolbar=0&navpanes=0&view=FitH`} title="SpendWise reimbursement PDF preview, view only" /> : <div className="report-preview-empty"><ReceiptText/><strong>No approved receipts in this selection</strong><small>Choose a currency and date range with approved receipts.</small></div>}
            </section>
          </div>
          <div className="proof-lower-grid">
            <section className="panel proof-center"><div className="sectionhead"><div><h2>Blockchain proof center</h2><p className="muted">Approved receipts secured on BOT Chain.</p></div></div>{expenses.length ? expenses.slice(0, 5).map((expense) => <div className="proof-row" key={expense.id}><span><ReceiptText size={17} /><b>{expense.store}</b></span><code>{expense.tx_hash ? `${expense.tx_hash.slice(0, 8)}…${expense.tx_hash.slice(-6)}` : "Proof unavailable"}</code><span className="status-chip"><CheckCircle2 size={13} />Verified</span>{expense.tx_hash ? <a href={`${config.explorer}/tx/${expense.tx_hash}`} target="_blank" rel="noreferrer">View proof <ArrowUpRight size={14} /></a> : <small>Legacy record</small>}</div>) : <EmptyTransactions onAdd={() => setTab("add")} />}</section>
            <section className="panel report-history"><div className="sectionhead"><div><h2>Generated reports history</h2><p className="muted">Reports securely stored for this wallet.</p></div><ReceiptText/></div>
              {reportHistory.length ? <div className="report-history-list">{reportHistory.map((item) => <div key={item.id} className="report-history-row"><span><ReceiptText/><span><strong>{item.fileName}</strong><small>{item.transactionCount} receipts · {item.range}</small></span></span><time>{new Date(item.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time><small>{item.size < 1024 * 1024 ? `${Math.ceil(item.size / 1024)} KB` : `${(item.size / 1024 / 1024).toFixed(1)} MB`}</small><button aria-label={`Download ${item.fileName}`} onClick={() => downloadHistoryReport(item)}><Download/></button></div>)}</div> : <div className="empty-report-history"><ReceiptText/><strong>No exported reports yet</strong><small>Downloaded PDFs will appear here.</small></div>}
            </section>
          </div>
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

    <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
      <DialogContent className="wallet-dialog">
        <div className="wallet-dialog-head">
          <div className="wallet-dialog-icon"><Wallet /></div>
          <div>
            <DialogTitle>Wallet information</DialogTitle>
            <DialogDescription>Manage your active SpendWise session.</DialogDescription>
          </div>
          <span className="wallet-connected"><i />Connected</span>
        </div>

        <div className="wallet-address-card">
          <span>Connected address</span>
          <code>{wallet}</code>
        </div>

        <div className="wallet-detail-grid">
          <div><span>Network</span><strong>BOT Chain</strong><small>Chain ID {config.chainId}</small></div>
          <div><span>Active account</span><strong>{currency}</strong><small>{CURRENCIES[currency].name}</small></div>
        </div>

        <div className="wallet-dialog-actions">
          <button type="button" className="secondary" onClick={async () => { await navigator.clipboard.writeText(wallet); toast.success("Wallet address copied"); }}><Copy size={16} />Copy address</button>
          <a className="secondary" href={`${config.explorer}/address/${wallet}`} target="_blank" rel="noreferrer">View explorer <ExternalLink size={16} /></a>
        </div>

        <p className="wallet-logout-note"><ShieldCheck size={16} />Logging out only removes this wallet session from SpendWise. Your blockchain records remain safe.</p>
        <div className="wallet-disconnect-actions">
          <button type="button" className="secondary" onClick={() => setWalletOpen(false)}>Stay connected</button>
          <button type="button" className="disconnect-button" onClick={disconnect}><LogOut size={16} />Log out wallet</button>
        </div>
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
        <DialogDescription>This is the original file securely stored after AI verification.</DialogDescription>
        {receiptViewer?.type === "application/pdf" ? <iframe className="receipt-document" src={receiptViewer.url} title="Original scanned receipt PDF" /> : receiptViewer && <img className="receipt-document" src={receiptViewer.url} alt="Original scanned receipt" />}
        {receiptViewer && <a className="secondary receipt-file-link" href={receiptViewer.url} target="_blank" rel="noreferrer">Open original file <ArrowUpRight size={16} /></a>}
      </DialogContent>
    </Dialog>
  </div>;
}

function LoadingScreen() {
  return <main className="gate"><div className="gate-card"><Image className="brandmark large" src="/spendwise-logo.png" alt="SpendWise logo" width={64} height={64}/><h1>Opening SpendWise…</h1><p>Checking your wallet session.</p></div></main>;
}

function AccessOverviewBackdrop() {
  return <div className="access-overview-backdrop" aria-hidden="true">
    <div className="access-preview-shell">
      <aside className="access-preview-sidebar">
        <div className="access-preview-brand"><Image src="/spendwise-logo.png" alt="" width={44} height={44}/><span><strong>SpendWise</strong><small>SMART EXPENSE TRACKING</small></span></div>
        <nav>
          <span className="active"><TrendingDown />Overview</span>
          <span><ScanLine />Scan Receipt</span>
          <span><ReceiptText />Transactions</span>
          <span><ShieldCheck />Proof &amp; Reports</span>
        </nav>
        <div className="access-preview-chain"><i />BOT CHAIN<br/><small>SECURE &amp; VERIFIED</small></div>
      </aside>
      <div className="access-preview-main">
        <header className="access-preview-header">
          <div><strong>Main Wallet</strong><small>0x71A…93F</small></div>
          <span>Rp&nbsp;&nbsp; IDR <ArrowLeftRight /></span>
        </header>
        <div className="access-preview-content">
          <div className="access-preview-title"><span><small>Good morning</small><strong>Manage your spending with confidence.</strong></span><Sun/></div>
          <section className="access-preview-grid">
            <article className="access-preview-total">
              <div className="access-preview-card-head"><span><TrendingDown/>Total Spend</span><b>Last 30 days⌄</b></div>
              <strong className="access-preview-amount">Rp2.450.000</strong>
              <div className="access-preview-stats"><span><ReceiptText/><b>18</b><small>Approved Receipts</small></span><span><CalendarDays/><b>Rp81.667</b><small>Avg. Daily Spend</small></span><span><Wallet/><b>Rp550.000</b><small>Remaining Budget</small></span></div>
            </article>
            <article className="access-preview-chart">
              <div className="access-preview-card-head"><span><TrendingDown/>Receipt Spend Trend</span><b>30D</b></div>
              <svg viewBox="0 0 560 210" role="presentation"><defs><linearGradient id="access-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2ddcff" stopOpacity=".38"/><stop offset="1" stopColor="#1473ff" stopOpacity="0"/></linearGradient></defs><path d="M0 168 C45 154 60 160 96 128 S150 105 186 128 S250 170 284 104 S340 42 382 79 S433 146 468 99 S520 34 560 57 L560 210 L0 210Z" fill="url(#access-chart-fill)"/><path d="M0 168 C45 154 60 160 96 128 S150 105 186 128 S250 170 284 104 S340 42 382 79 S433 146 468 99 S520 34 560 57" fill="none" stroke="#39dcff" strokeWidth="5" strokeLinecap="round"/><circle cx="382" cy="79" r="7" fill="#fff" stroke="#39dcff" strokeWidth="4"/></svg>
            </article>
          </section>
          <section className="access-preview-lower">
            <article><div className="access-preview-card-head"><span><ReceiptText/>Recent Receipts</span><b>View all</b></div>{["Grab","Starbucks","Grand Lucky"].map((name, index)=><div className="access-preview-row" key={name}><i><ReceiptText/></i><span><strong>{name}</strong><small>AI verified receipt</small></span><b>{["Rp85.000","Rp62.500","Rp348.000"][index]}</b></div>)}</article>
            <article><div className="access-preview-card-head"><span><Sparkles/>Spending by Category</span><b>This month</b></div><div className="access-preview-donut"><span><b>Rp2.45M</b><small>Total Spend</small></span></div><div className="access-preview-bars"><i/><i/><i/></div></article>
          </section>
        </div>
      </div>
    </div>
  </div>;
}

function WalletGate({ busy, onConnect }: { busy: boolean; onConnect(): void }) {
  return <main className="gate access-screen">
    <AccessOverviewBackdrop />
    <Toaster richColors />
    <section className="gate-card access-foreground">
      <Image className="brandmark large" src="/spendwise-logo.png" alt="SpendWise logo" width={64} height={64}/>
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
  return <main className="currency-gate access-screen">
    <AccessOverviewBackdrop />
    <Toaster richColors />
    <div className="currency-access-panel access-foreground">
    <header className="picker-head"><Link className="brand" href="/"><Image className="brandmark" src="/spendwise-logo.png" alt="" width={37} height={37}/>SpendWise</Link><button className="wallet-btn" onClick={onDisconnect}>{wallet.slice(0, 6)}…{wallet.slice(-4)}<LogOut size={14} /></button></header>
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
    </div>
  </main>;
}

function EmptyTransactions({ onAdd }: { onAdd(): void }) {
  return <div className="empty-state"><ReceiptText size={32} /><h3>No verified receipts in this account yet.</h3><p>Scan your first receipt. Manual expense entry is not available.</p><button className="text-btn" onClick={onAdd}>Scan receipt <ArrowUpRight size={16} /></button></div>;
}
