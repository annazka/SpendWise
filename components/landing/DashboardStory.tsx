"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";

function clamp(v:number){return Math.min(1,Math.max(0,v));}

export default function DashboardStory(){
  const ref=useRef<HTMLElement>(null);
  useEffect(()=>{
    const update=()=>{const s=ref.current;if(!s)return;const r=s.getBoundingClientRect();const m=Math.max(1,s.offsetHeight-window.innerHeight);s.style.setProperty("--dash",String(clamp(-r.top/m)));};
    update();window.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);
    return()=>{window.removeEventListener("scroll",update);window.removeEventListener("resize",update)};
  },[]);
  return <section id="product" ref={ref} className={styles.dashboardStory}>
    <div className={styles.dashboardSticky}>
      <div className={styles.storyCopy}>
        <p className={styles.kicker}>AUTOMATIC EXPENSE TRACKING</p>
        <h2>Verified expense,<span>straight into SpendWise.</span></h2>
        <p>The approved receipt becomes an expense card and flows into your current dashboard experience.</p>
      </div>
      <div className={styles.expenseCard}><span className={styles.expenseIcon}>S</span><div><strong>Coffee Lab</strong><small>Sep 22 · Meals · AI Verified</small></div><b>$42.80</b></div>
      <div className={styles.dashboardMock}>
        <div className={styles.dashboardBar}><strong>Overview</strong><span>0x71A...93F</span></div>
        <div className={styles.statsGrid}><Stat t="Total Spent" v="$162.80"/><Stat t="Remaining" v="$337.20"/><Stat t="Approved" v="4 receipts"/></div>
        <div className={styles.chartCard}><div className={styles.chartHeader}><span>Expense activity</span><small>September</small></div><div className={styles.chartBars}>{[34,56,41,72,52,81,63,92,70,86].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></div>
        <div className={styles.recentCard}><div className={styles.recentHeader}><span>Recent Transactions</span><small>AI verified</small></div><div className={styles.recentRow}><span>Coffee Lab</span><small>Sep 22 · Meals</small><strong>$42.80</strong></div><div className={styles.recentRow}><span>Metro Mart</span><small>Sep 20 · Supplies</small><strong>$76.40</strong></div></div>
      </div>
    </div>
  </section>
}
function Stat({t,v}:{t:string;v:string}){return <div className={styles.statCard}><span>{t}</span><strong>{v}</strong></div>}
