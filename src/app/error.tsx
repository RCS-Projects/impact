'use client';
import Link from 'next/link';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="shell">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="page-title">This page could not load</h1>
      <p>Try again. If the problem continues, return to the Impact Maps home page.</p>
      <div className="buttons">
        <button className="button" type="button" onClick={() => reset()}>
          Try again
        </button>
        <Link className="button button-secondary" href="/">
          Home
        </Link>
      </div>
    </main>
  );
}
