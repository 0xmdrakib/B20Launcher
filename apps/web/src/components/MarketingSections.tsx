import { Database, Globe2, ShieldCheck } from "lucide-react";

export function CapabilitiesBand() {
  return (
    <section className="infrastructure-band" aria-label="Platform capabilities">
      <div><span className="eyebrow">After launch</span><h2>Operate the asset from one trusted surface.</h2></div>
      <div className="infra-grid">
        <article><Database size={20} aria-hidden="true" /><strong>Decoded B20 events</strong><p>Launch receipts and token activity prepared for operational monitoring.</p></article>
        <article><ShieldCheck size={20} aria-hidden="true" /><strong>Policy operations</strong><p>Pause, permissions and compliance workflows remain issuer-controlled.</p></article>
        <article><Globe2 size={20} aria-hidden="true" /><strong>Agent-ready issuance</strong><p>x402 agents receive validated unsigned transaction packages without custody.</p></article>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return <footer className="site-footer">© 2026 Md. Rakib · made with love and passion.</footer>;
}
