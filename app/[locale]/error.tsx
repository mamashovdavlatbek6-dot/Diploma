"use client";

export default function LocaleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mx-auto grid min-h-[60dvh] max-w-md place-content-center gap-4 px-5 text-center">
      <h1 className="font-display text-2xl">500</h1>
      <button type="button" onClick={reset} className="glass min-h-11 rounded-full px-5 text-sm hover:text-primary">
        ↻
      </button>
    </section>
  );
}
