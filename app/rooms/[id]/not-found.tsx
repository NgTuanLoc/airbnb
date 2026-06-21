import Link from "next/link";
import { Button } from "@/components/design-system";

export default function ListingNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[680px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-display-lg text-ink">We can&apos;t find that place</h1>
      <p className="text-body-md text-muted">The listing you&apos;re looking for may have been removed.</p>
      <Link href="/">
        <Button>Back to home</Button>
      </Link>
    </main>
  );
}
