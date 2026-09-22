"use client";

import Link from "next/link";
import styles from "./landing.module.css";

export default function ReportFinal(){return <>
  <section id="reports" className={styles.reportSection}>
    <div className={styles.reportIntro}><p className={styles.kicker}>REIMBURSEMENT REPORT</p><h2>Ready for<span>reimbursement.</span></h2><p>Verified expense data becomes a clean report that can be filtered, reviewed, and exported.</p></div>
    <div className={styles.reportCard}>
      <div className={styles.reportHeader}><div><span className={styles.receiptLogo}>S</span><div><strong>SpendWise Reimbursement Report</strong><small>Sep 01 — Sep 30, 2026</small></div></div><button type="button">Export PDF</button></div>
      <div className={styles.reportFilters}><span>USD ✓</span><span>IDR</span><span>MYR</span><span>SGD</span><span>Custom date range</span></div>
      <div className={styles.reportTable}><div className={styles.reportTableHead}><span>Merchant</span><span>Date</span><span>Amount</span><span>Status</span><span>Proof</span></div><R m="Coffee Lab" d="Sep 22" a="$42.80"/><R m="Metro Mart" d="Sep 20" a="$76.40"/><R m="Cloud Taxi" d="Sep 18" a="$43.60"/></div>
      <div className={styles.reportTotal}><span>Total Reimbursement</span><strong>$162.80</strong></div>
    </div>
  </section>
  <section className={styles.finalCta}><div><p className={styles.kicker}>SPENDWISE</p><h2>Receipts in.<span>Reimbursements ready.</span></h2><p>Scan. Verify. Record. Reimburse.</p></div><Link href="/app" className={styles.finalButton}>Launch SpendWise <span>↗</span></Link></section>
</>}
function R({m,d,a}:{m:string;d:string;a:string}){return <div className={styles.reportRow}><span>{m}</span><span>{d}</span><span>{a}</span><span className={styles.status}>AI APPROVED</span><code>0x8F21...93A7</code></div>}
