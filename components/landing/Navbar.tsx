"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./landing.module.css";

const links = [
  ["Product", "#product"],
  ["How It Works", "#scan"],
  ["AI Receipt", "#scan"],
  ["Proof", "#proof"],
  ["Reports", "#reports"],
] as const;

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`${styles.navbar} ${scrolled ? styles.navbarScrolled : ""}`}>
      <a className={styles.brand} href="#top" aria-label="SpendWise home">
        <span className={styles.brandMark}>S</span>
        <span>SpendWise</span>
      </a>

      <nav className={styles.navLinks}>
        {links.map(([label, href]) => (
          <a key={label} href={href}>{label}</a>
        ))}
      </nav>

      <Link className={styles.navLaunch} href="/app">
        Launch App <span>↗</span>
      </Link>
    </header>
  );
}
