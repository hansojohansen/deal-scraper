interface BargainGaugeProps {
  score: number; // negative outlier score, e.g. -0.17 = 17% below market
  size?: "sm" | "lg";
}

export default function BargainGauge({ score, size = "sm" }: BargainGaugeProps) {
  const discount = Math.abs(score); // 0.17
  const progress = Math.min(1, discount / 0.4); // 0–1 mapped over 0–40% discount

  // SVG geometry: semicircle from (6,55) counterclockwise through top to (94,55)
  const cx = 50, cy = 55, r = 44;
  const angle = Math.PI * (1 - progress);
  const endX = cx + r * Math.cos(angle);
  const endY = cy - r * Math.sin(angle);
  const largeArc = progress > 0.5 ? 1 : 0;

  const color =
    discount < 0.08 ? "#94a3b8" :
    discount < 0.20 ? "#f59e0b" :
    "#22c55e";

  const label = `${Math.round(discount * 100)}%`;
  const svgW = size === "lg" ? 96 : 56;
  const svgH = Math.ceil(svgW * 0.62);

  return (
    <div className="flex flex-col items-center gap-0" title={`${Math.round(discount * 100)}% under markedspris`}>
      <svg width={svgW} height={svgH} viewBox="0 0 100 62">
        {/* Track */}
        <path
          d="M 6,55 A 44,44 0 0,0 94,55"
          fill="none"
          stroke="#334155"
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Fill */}
        {progress > 0.01 && (
          <path
            d={`M 6,55 A 44,44 0 ${largeArc},0 ${endX.toFixed(1)},${endY.toFixed(1)}`}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="text-xs font-bold leading-none -mt-1" style={{ color }}>{label}</span>
    </div>
  );
}
