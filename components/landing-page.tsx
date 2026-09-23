"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Database,
  FileCheck2,
  FileText,
  Globe2,
  Leaf,
  Link2,
  ScanLine,
  ShieldCheck,
  UploadCloud,
  Wallet,
  Zap,
} from "lucide-react";

function XIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.24 2H21l-6.03 6.89L22.06 22h-5.55l-4.35-5.69L7.18 22H4.41l6.45-7.37L4.06 2h5.69l3.93 5.2L18.24 2Zm-.97 17.7h1.53L8.91 4.18H7.27L17.27 19.7Z"/></svg>;
}

function GitHubIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.29-5.27-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.98 10.98 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.26c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>;
}

const features = [
  { icon: UploadCloud, title: "AI Receipt Scanning", copy: "Upload or drag your receipt. AI automatically extracts key details." },
  { icon: FileCheck2, title: "AI Expense Verification", copy: "AI checks if your receipt is valid and eligible for reimbursement." },
  { icon: Database, title: "Multi-Currency Profiles", copy: "Manage IDR, USD, MYR, and SGD in one wallet." },
  { icon: Wallet, title: "Expense Tracking", copy: "Keep every verified receipt in your transaction history." },
  { icon: BarChart3, title: "Spending Overview", copy: "Visualize your expenses with clear and simple insights." },
  { icon: Wallet, title: "Wallet Identity", copy: "Use MetaMask as your identity. No email or password needed." },
  { icon: Link2, title: "On-Chain Proof", copy: "Each transaction can be recorded on BOT Chain for immutable proof." },
  { icon: FileText, title: "Reimbursement Report", copy: "Choose currency and date range, then export a clean report ready to use." },
];

const steps = [
  { icon: ScanLine, title: "Scan Receipt", copy: "Upload or drag your receipt." },
  { icon: FileText, title: "AI Extract", copy: "Key details are extracted automatically." },
  { icon: CheckCircle2, title: "AI Verify", copy: "Receipt validity is checked." },
  { icon: FileCheck2, title: "Review Expense", copy: "Confirm the details before recording." },
  { icon: Database, title: "Record Expense", copy: "Save it to your transaction history." },
  { icon: Link2, title: "On-Chain Proof", copy: "Hash recorded on BOT Chain." },
  { icon: FileText, title: "Generate Report", copy: "Export your reimbursement report." },
];

export function LandingPage({ onLaunch }: { onLaunch(): void }) {
  const heroRef = useRef<HTMLElement>(null);

  function scrollToSection(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    const start = window.scrollY;
    const destination = target.getBoundingClientRect().top + start - 76;
    const distance = destination - start;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, destination);
      return;
    }
    const duration = Math.min(1100, Math.max(700, Math.abs(distance) * 0.45));
    const startedAt = performance.now();
    const animate = (time: number) => {
      const progress = Math.min((time - startedAt) / duration, 1);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      window.scrollTo(0, start + distance * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  function moveHero(event: React.PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    heroRef.current?.style.setProperty("--pointer-x", String(x));
    heroRef.current?.style.setProperty("--pointer-y", String(y));
  }

  return <main className="landing-page">
    <header className="landing-nav">
      <a className="landing-logo" href="#top" aria-label="SpendWise home"><Image src="/spendwise-logo.png" alt="" width={34} height={34}/><strong>SpendWise</strong></a>
      <nav aria-label="Landing navigation">
        <a href="#features" onClick={(event) => scrollToSection(event, "features")}>Features</a><a href="#how-it-works" onClick={(event) => scrollToSection(event, "how-it-works")}>How It Works</a><a href="#faqs" onClick={(event) => scrollToSection(event, "faqs")}>FAQs</a>
      </nav>
      <button className="landing-button compact" onClick={onLaunch}>Launch App <ArrowRight/></button>
    </header>

    <section id="top" ref={heroRef} onPointerMove={moveHero} className="landing-hero">
      <div className="landing-hero-copy" data-reveal>
        <span className="landing-pill"><i/> AI Powered <b>•</b> Blockchain Secured</span>
        <h1>Receipts to<br/>Reimburse.<br/><em>Verified in Seconds.</em></h1>
        <p>Scan receipts, validate expenses with AI, and turn them into verifiable reimbursement records.</p>
        <div className="landing-hero-actions"><button className="landing-button" onClick={onLaunch}>Launch App <ArrowRight/></button><a className="landing-button ghost" href="#features" onClick={(event) => scrollToSection(event, "features")}>Explore SpendWise</a></div>
      </div>

      <div className="landing-visual" aria-label="Interactive receipt verification preview">
        <div className="landing-orbit orbit-one"/><div className="landing-orbit orbit-two"/>
        <div className="floating-card chart-card"><BarChart3/></div>
        <div className="floating-card scan-card-mini"><ScanLine/></div>
        <div className="floating-card shield-card"><ShieldCheck/></div>
        <div className="demo-receipt">
          <div className="receipt-brand"><Image src="/spendwise-logo.png" alt="" width={25} height={25}/><b>SpendWise</b></div>
          <p>Good Coffee<br/>Jakarta</p><div><span>Americano</span><span>1</span><b>28,000</b></div><div><span>Croissant</span><span>1</span><b>32,000</b></div><hr/><div className="receipt-total"><strong>Total</strong><strong>60,000</strong></div><small>16 Sep 2026 <b>10:24</b></small><div className="receipt-barcode"/>
        </div>
        <div className="extract-card"><div><strong>AI Extracted</strong><CheckCircle2/></div><p><Check/> <span>Merchant<small>Good Coffee</small></span></p><p><Check/> <span>Date<small>16 Sep 2026</small></span></p><p><Check/> <span>Amount<small>Rp 60,000</small></span></p><p><ShieldCheck/> <span>Category<small>Food & Beverage</small></span></p><b className="verified"><CheckCircle2/> Verified</b></div>
      </div>

      <div className="hero-points" data-reveal><span><Wallet/><b>No Email Required<small>Login with your wallet</small></b></span><span><Zap/><b>AI Verification<small>Fast and accurate</small></b></span><span><Link2/><b>On-Chain Proof<small>Built on BOT Chain</small></b></span></div>
    </section>

    <section id="benefits" className="impact-strip" data-reveal>
      <p>BUILT FOR A MORE TRANSPARENT TOMORROW</p>
      <div><article><Leaf/><span><b>More Awareness</b><small>Turn everyday spending into meaningful impact.</small></span></article><article><ShieldCheck/><span><b>Greater Transparency</b><small>AI data is securely stored and verifiable.</small></span></article><article><Zap/><span><b>Real Impact</b><small>Support accountable and sustainable spending.</small></span></article><article><Globe2/><span><b>Simple and Seamless</b><small>From receipts to reports in seconds.</small></span></article></div>
    </section>

    <section id="features" className="landing-section" data-reveal>
      <div className="section-kicker">FEATURES</div><div className="section-heading"><h2>Everything You Need<br/>for <em>Smarter Reimbursements</em></h2><p>SpendWise helps you manage expenses with AI, blockchain, and a seamless experience designed for individuals, organizations, and companies.</p></div>
      <div className="feature-grid">{features.map(({icon: Icon,title,copy})=><article key={title}><span><Icon/></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section id="how-it-works" className="landing-section process-section" data-reveal>
      <div className="section-kicker">HOW IT WORKS</div><div className="section-heading"><h2>From Receipt to <em>Real Impact</em><br/>in a Few Steps</h2><p>A simple process, powerful results. Turn your receipts into verified records that you can trust.</p></div>
      <div className="process-list">{steps.map(({icon: Icon,title,copy},index)=><article key={title}><div><span><Icon/></span>{index < steps.length-1 && <ArrowRight/>}</div><h3><i>{index+1}</i>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="landing-cta" data-reveal>
      <div><h2>Start Your Smarter<br/><em>Journey Today</em></h2><p>Turn everyday spending into meaningful impact.<br/>It only takes a moment to begin.</p><button className="landing-button" onClick={onLaunch}>Launch App <ArrowRight/></button></div>
      <div className="dashboard-mock"><div className="mock-sidebar"><Image src="/spendwise-logo.png" alt="" width={24} height={24}/><i/><i/><i/><i/></div><div className="mock-main"><small>Total Spending</small><strong>Rp 4,230,500</strong><div className="mock-bars">{[30,48,40,70,58,86,76].map((height,index)=><i key={index} style={{height:`${height}%`}}/>)}</div><p>Spending by Category</p><div className="mock-donut"/></div><div className="mock-report"><b>Report Ready <CheckCircle2/></b>{["IDR","USD","MYR","SGD"].map(code=><span key={code}>{code}<Check/></span>)}</div></div>
    </section>

    <section id="faqs" className="landing-faq landing-section" data-reveal><div className="section-kicker">FAQs</div><div className="section-heading"><h2>Questions, <em>answered.</em></h2><p>Everything you need to know before using SpendWise.</p></div><div>{[
      ["Does connecting a wallet cost gas?","No. The login signature is free. Gas is only required when you choose to record proof on BOT Chain."],
      ["Does SpendWise store my money?","No. Your wallet is used as your identity. SpendWise only tracks expense records and proof."],
      ["Can I use multiple currencies?","Yes. IDR, USD, MYR, and SGD each have a separate expense profile under one wallet."],
    ].map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>

    <footer className="landing-footer"><a className="landing-logo" href="#top" onClick={(event) => scrollToSection(event, "top")}><Image src="/spendwise-logo.png" alt="" width={30} height={30}/><span><strong>SpendWise</strong><small>Smarter spending. Clearer tomorrow.</small></span></a><nav><a href="#features" onClick={(event) => scrollToSection(event, "features")}>Features</a><a href="#how-it-works" onClick={(event) => scrollToSection(event, "how-it-works")}>How It Works</a><a href="#faqs" onClick={(event) => scrollToSection(event, "faqs")}>FAQs</a></nav><div><a href="https://x.com/SpendWise67" target="_blank" rel="noreferrer" aria-label="SpendWise on X" title="X"><XIcon/></a><a href="https://github.com/annazka/SpendWise" target="_blank" rel="noreferrer" aria-label="SpendWise on GitHub" title="GitHub"><GitHubIcon/></a><a href="https://botchain.ai/" target="_blank" rel="noreferrer" aria-label="BOT Chain" title="BOT Chain"><Image src="/BOT CHAIN.png" alt="BOT Chain" width={22} height={22}/></a><a href="https://scan.botchain.ai/" target="_blank" rel="noreferrer" aria-label="BOT Chain Explorer" title="BOT Chain Explorer"><Image src="/BOT SCAN.png" alt="BOT Chain Explorer" width={22} height={22}/></a></div></footer>
  </main>;
}
