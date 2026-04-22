'use client';

interface QuantitySelectorProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max,
}: QuantitySelectorProps) {
  const decrement = () => {
    const next = value - 1;
    if (next >= min) onChange(next);
  };

  const increment = () => {
    const next = value + 1;
    if (max == null || next <= max) onChange(next);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (isNaN(raw)) return;
    let clamped = Math.max(min, raw);
    if (max != null) clamped = Math.min(max, clamped);
    onChange(clamped);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-0">
        <button
          onClick={decrement}
          disabled={value <= min}
          className="flex h-11 w-11 items-center justify-center rounded-l-lg border border-border bg-card text-t2 transition-colors hover:bg-card-hover hover:text-t1 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <input
          type="number"
          value={value}
          onChange={handleInput}
          min={min}
          max={max}
          className="h-11 w-16 border-y border-border bg-bg text-center text-sm font-medium text-t1 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          onClick={increment}
          disabled={max != null && value >= max}
          className="flex h-11 w-11 items-center justify-center rounded-r-lg border border-border bg-card text-t2 transition-colors hover:bg-card-hover hover:text-t1 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {max != null && (
        <span className="text-xs text-t4">Max: {max}</span>
      )}
    </div>
  );
}
