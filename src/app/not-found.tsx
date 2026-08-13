import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="shell">
      <p className="eyebrow">Not found</p>
      <h1 className="page-title">This page does not exist</h1>
      <p>The incident map you are looking for may have been removed, or the link is incorrect.</p>
      <div className="buttons">
        <Link className="button" href="/">
          Back to live maps
        </Link>
      </div>
    </main>
  );
}
