'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="shell">
          <p className="eyebrow">Impact Maps</p>
          <h1 className="page-title">The application needs to reload</h1>
          <button className="button" type="button" onClick={() => reset()}>
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
