"use client";

import Link from "next/link";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import styles from "./landing.module.css";

function clamp(v:number,min=0,max=1){return Math.min(max,Math.max(min,v));}
function range(p:number,a:number,b:number){return clamp((p-a)/(b-a));}

export default function HeroReceiptJourney(){
  const sectionRef=useRef<HTMLElement>(null);
  const receiptRef=useRef<HTMLDivElement>(null);
  const target=useRef({rx:0,ry:0});
  const current=useRef({rx:0,ry:0});

  useEffect(()=>{
    let raf=0;
    const onScroll=()=>{
      const s=sectionRef.current;if(!s)return;
      const r=s.getBoundingClientRect();
      const max=Math.max(1,s.offsetHeight-window.innerHeight);
      const p=clamp(-r.top/max);
      s.style.setProperty("--hero-out",String(range(p,.05,.35)));
      s.style.setProperty("--receipt-center",String(range(p,.12,.46)));
      const scan=range(p,.43,.82);
      const validation=range(p,.62,.97);
      s.style.setProperty("--scan",String(scan));
      s.style.setProperty("--validate",String(validation));
      const scanning=1-range(validation,0,.22);
      const extracting=1-Math.min(1,Math.abs(validation-.34)/.18);
      const validating=1-Math.min(1,Math.abs(validation-.62)/.18);
      const approved=range(validation,.76,1);
      s.style.setProperty("--scanning",String(scanning));
      s.style.setProperty("--extracting",String(extracting));
      s.style.setProperty("--validating",String(validating));
      s.style.setProperty("--approved",String(approved));
    };
    const animate=()=>{
      current.current.rx+=(target.current.rx-current.current.rx)*.08;
      current.current.ry+=(target.current.ry-current.current.ry)*.08;
      receiptRef.current?.style.setProperty("--rx",`${current.current.rx.toFixed(2)}deg`);
      receiptRef.current?.style.setProperty("--ry",`${current.current.ry.toFixed(2)}deg`);
      raf=requestAnimationFrame(animate);
    };
    onScroll();animate();
    window.addEventListener("scroll",onScroll,{passive:true});
    window.addEventListener("resize",onScroll);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("scroll",onScroll);window.removeEventListener("resize",onScroll);};
  },[]);

  function pointerMove(e:React.PointerEvent<HTMLElement>){
    if(window.matchMedia("(pointer: coarse)").matches)return;
    const r=e.currentTarget.getBoundingClientRect();
    const nx=(e.clientX-r.left)/r.width-.5;
    const ny=(e.clientY-r.top)/r.height-.5;
    target.current={ry:nx*12,rx:ny*-8};
  }

  return(
    <section id="top" ref={sectionRef} className={styles.heroJourney} onPointerMove={pointerMove} onPointerLeave={()=>target.current={rx:0,ry:0}}>
      <div className={styles.heroSticky}>
        <div className={styles.heroEditorial}>
          <p className={styles.kicker}>AI RECEIPTS · REIMBURSEMENT · PROOF</p>
          <h1>Receipts to<span>Reimbursements.</span>Verified<span>in Seconds.</span></h1>
          <p className={styles.heroCopy}>Scan receipts, validate expenses with AI, and turn them into verifiable reimbursement records.</p>
          <div className={styles.heroActions}>
            <Link href="/app" className={styles.primaryButton}>Launch App <span>↗</span></Link>
            <a href="#scan" className={styles.secondaryButton}>Explore SpendWise</a>
          </div>
        </div>

        <div className={styles.receiptStage}>
          <div ref={receiptRef} className={styles.receipt3d}>
            <div className={styles.receiptPaper}>
              <div className={styles.receiptTop}><span className={styles.receiptLogo}>S</span><strong>SPENDWISE</strong><small>Expense receipt</small></div>
              <div className={styles.receiptRows}>
                <Row label="Merchant" value="Coffee Lab"/><Row label="Date" value="22 Sep 2026"/><Row label="Currency" value="USD"/><Row label="Category" value="Meals"/>
              </div>
              <div className={styles.receiptAmount}><span>AMOUNT</span><strong>$42.80</strong></div>
              <div className={styles.receiptBadges}><span>AI APPROVED</span><span>VERIFIED</span></div>
              <div className={styles.receiptHash}><span>Proof</span><code>0x8F21...93A7</code></div>
              <div className={styles.scanLine}/>
            </div>
            <span className={`${styles.floatingData} ${styles.floatAmount}`}>$42.80</span>
            <span className={`${styles.floatingData} ${styles.floatCurrency}`}>USD</span>
            <span className={`${styles.floatingData} ${styles.floatVerified}`}>AI VERIFIED</span>
            <span className={`${styles.floatingData} ${styles.floatHash}`}>0x8F21...93A7</span>
          </div>
        </div>

        <div id="scan" className={styles.scanNarrative}>
          <p className={styles.kicker}>AI RECEIPT SCANNING</p>
          <h2>From Receipt<span>to Structured Data.</span></h2>
          <p>Scroll to move the same receipt into scanning, extraction, and validation.</p>
        </div>

        <div className={styles.extractedData}>
          <Pill c={styles.dataMerchant} l="Merchant" v="Coffee Lab"/>
          <Pill c={styles.dataDate} l="Date" v="Sep 22, 2026"/>
          <Pill c={styles.dataAmount} l="Amount" v="$42.80"/>
          <Pill c={styles.dataCurrency} l="Currency" v="USD"/>
          <Pill c={styles.dataCategory} l="Category" v="Meals"/>
        </div>

        <div className={styles.validationWords}>
          <span className={styles.wordScanning}>SCANNING</span>
          <span className={styles.wordExtracting}>EXTRACTING</span>
          <span className={styles.wordValidating}>VALIDATING</span>
          <span className={styles.wordApproved}>APPROVED</span>
        </div>
      </div>
    </section>
  );
}

function Row({label,value}:{label:string;value:string}){return <div className={styles.receiptRow}><span>{label}</span><strong>{value}</strong></div>}
function Pill({c,l,v}:{c:string;l:string;v:string}){return <div className={`${styles.dataPill} ${c}`}><span>{l}</span><strong>{v}</strong></div>}
