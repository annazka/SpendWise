"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";

const currencies=[
  {code:"IDR",budget:"Rp8,000,000",spent:"Rp2,450,000",remaining:"Rp5,550,000"},
  {code:"USD",budget:"$500",spent:"$162.80",remaining:"$337.20"},
  {code:"MYR",budget:"RM1,800",spent:"RM530",remaining:"RM1,270"},
  {code:"SGD",budget:"S$650",spent:"S$214",remaining:"S$436"},
];

export default function CurrencyWalletProof(){
  const ref=useRef<HTMLElement>(null);
  useEffect(()=>{
    const update=()=>{const s=ref.current;if(!s)return;const r=s.getBoundingClientRect();const m=Math.max(1,s.offsetHeight-window.innerHeight);s.style.setProperty("--multi",String(Math.min(1,Math.max(0,-r.top/m))));};
    update();window.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);
    return()=>{window.removeEventListener("scroll",update);window.removeEventListener("resize",update)};
  },[]);
  return <section ref={ref} className={styles.multiStory}><div className={styles.multiSticky}>
    <div className={styles.multiCopy}><p className={styles.kicker}>MULTI-CURRENCY</p><h2>One wallet.<span>Multiple spending profiles.</span></h2></div>
    <div className={styles.currencyRail}>{currencies.map((c,i)=><article key={c.code} className={`${styles.currencyCard} ${styles[`currency${i}`]}`}><small>Currency profile</small><strong>{c.code}</strong><div><span>Budget</span><b>{c.budget}</b></div><div><span>Spent</span><b>{c.spent}</b></div><div><span>Remaining</span><b>{c.remaining}</b></div></article>)}</div>
    <div id="proof" className={styles.walletProof}>
      <div className={styles.walletPanel}><p className={styles.kicker}>WALLET IDENTITY</p><h3>Your wallet. Your expense identity.</h3><code>0x71A...93F</code><div className={styles.walletFlow}><span>Expense</span><i>→</i><span>Sign</span><i>→</i><span>Record</span></div></div>
      <div className={styles.proofPanel}><p className={styles.kicker}>BLOCKCHAIN PROOF</p><h3>Proof without exposing the receipt.</h3><div className={styles.hash}>0x8F21...93A7</div><div className={styles.nodes}><span>Expense</span><span>Hash</span><span>Wallet Signature</span><span>BOT Chain</span><span>Verified</span></div></div>
    </div>
  </div></section>
}
