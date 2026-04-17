'use client';

interface ProgressBarProps {
  value: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'green' | 'gold' | 'blue' | 'amber';
}

const colorMap: Record<string, string> = {
  green: 'bg-green',
  gold: 'bg-gold',
  blue: 'bg-blue',
  amber: 'bg-amber',
};

export function ProgressBar({
  value,
  label,
  showPercentage = false,
  color = 'green',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="mb-1.5 flex items-center justify-between">
          {label && <span className="text-sm text-t2">{label}</span>}
          {showPercentage && (
            <span className="text-sm font-medium text-t1">{Math.round(clamped)}%</span>
          )}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={label}
      >
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${colorMap[color]}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
