import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <Compass className="w-16 h-16 text-primary" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
      >
        Go home
      </Link>
    </div>
  );
}
