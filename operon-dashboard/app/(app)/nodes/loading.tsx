export default function NodesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-40 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-36 rounded-2xl bg-[rgba(12,18,36,0.85)] border border-[rgba(147,197,253,0.08)]" />
        ))}
      </div>
    </div>
  );
}
