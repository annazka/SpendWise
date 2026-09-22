"use client";

import Navbar from "./Navbar";
import HeroReceiptJourney from "./HeroReceiptJourney";
import DashboardStory from "./DashboardStory";
import CurrencyWalletProof from "./CurrencyWalletProof";
import ReportFinal from "./ReportFinal";
import styles from "./landing.module.css";

export default function SpendWiseLanding() {
  return (
    <div className={styles.page}>
      <Navbar />
      <main>
        <HeroReceiptJourney />
        <DashboardStory />
        <CurrencyWalletProof />
        <ReportFinal />
      </main>
    </div>
  );
}
