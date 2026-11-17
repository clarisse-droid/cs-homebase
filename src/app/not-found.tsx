import Link from "next/link";
export default function NotFound() {
  return <div className="card mx-auto mt-10 max-w-md p-6 text-center"><h1 className="font-semibold">Not found</h1><p className="mt-1 text-sm muted">That client or page doesn&apos;t exist in the synced data.</p><Link href="/" className="btn mt-4">Back to dashboard</Link></div>;
}
