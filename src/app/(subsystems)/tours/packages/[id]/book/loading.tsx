/**
 * Shown the moment a Book button is tapped, before the booking form's data has
 * loaded. It has the form's shape, so the page reads as arriving, not stalled.
 */
export default function BookingLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" aria-busy="true">
      <p role="status" className="sr-only">
        Opening the booking form
      </p>
      <div className="animate-pulse space-y-4" aria-hidden="true">
        <div className="h-4 w-32 rounded-full bg-daet-ink/10" />
        <div className="h-9 w-4/5 max-w-md rounded-2xl bg-daet-ink/10" />
        <div className="h-5 w-1/2 max-w-xs rounded-full bg-daet-ink/10" />
        <div className="h-16 rounded-xl bg-daet-ink/10" />
        <div className="h-16 rounded-xl bg-daet-ink/10" />
        <div className="h-16 rounded-xl bg-daet-ink/10" />
        <div className="h-12 rounded-full bg-blue-600/30" />
      </div>
    </main>
  );
}
