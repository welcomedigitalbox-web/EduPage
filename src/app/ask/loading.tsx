export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-40 animate-pulse rounded bg-edge" />
      <div className="card h-[70vh] animate-pulse lg:h-[calc(100vh-9rem)]" />
    </div>
  );
}
