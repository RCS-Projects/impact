
export const dynamic = 'force-static';

export default function LandingPage() {
  return (
    <main className="shell">
      <p className="eyebrow">Community incident maps</p>
      <h1 className="page-title">See what&apos;s happening. Share what you know.</h1>
      <p>
        Impact Maps are focused, crowdsourced maps for storms, outages, road conditions, and other
        local incidents. Open a map from its direct link, drop a pin, and share what you are
        experiencing.
      </p>
      <p className="disclaimer">
        Reports are crowdsourced and may not be independently verified. Impact Maps are not an
        official emergency alerting system. For emergencies, call 911.
      </p>
      <section className="card" style={{ marginTop: '1.5rem' }}>
        <h2>Privacy first</h2>
        <p>
          You can publish an exact location or use an approximate pin. Approximate reports hide the
          submitted location inside a randomized 500-foot circle, while the exact location stays
          private to the report owner and authorized administrators.
        </p>
      </section>
      <div className="buttons">
        <a className="button" href="https://renfrewcountyscanner.com" target="_blank" rel="noreferrer">
          Renfrew County Scanner
        </a>
      </div>
    </main>
  );
}
