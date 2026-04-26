export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
        ))}
      </div>
      {/* Main content skeleton */}
      <div className="h-48 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
      <div className="h-32 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
    </div>
  );
}
