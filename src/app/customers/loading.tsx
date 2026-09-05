/** Shown immediately on navigation so a tab change never looks frozen while
 *  the server fetches. */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-48 animate-pulse rounded bg-edge" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-24 animate-pulse p-4" />
        ))}
      </div>
      <div className="card h-64 animate-pulse" />
    </div>
  );
}
