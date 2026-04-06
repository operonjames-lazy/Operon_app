export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 bg-card rounded-lg" />
        ))}
      </div>
      {/* Main content skeleton */}
      <div className="h-48 bg-card rounded-lg" />
      <div className="h-32 bg-card rounded-lg" />
    </div>
  );
}
