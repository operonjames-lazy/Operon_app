export default function NodesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-40 bg-card rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-card rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-36 bg-card rounded-lg" />
        ))}
      </div>
    </div>
  );
}
