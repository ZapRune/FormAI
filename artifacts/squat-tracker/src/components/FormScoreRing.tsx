interface FormScoreRingProps {
  score: number;
}

export function FormScoreRing({ score }: FormScoreRingProps) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  const color =
    score >= 80 ? "#4ade80" :
    score >= 60 ? "#facc15" :
    "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-32 h-32 flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
          />
          <circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.4s ease, stroke 0.4s ease",
              filter: `drop-shadow(0 0 6px ${color})`,
            }}
          />
        </svg>
        <div className="flex flex-col items-center z-10">
          <span
            className="text-3xl font-black font-mono tabular-nums"
            style={{ color, textShadow: `0 0 10px ${color}` }}
          >
            {score}
          </span>
          <span className="text-xs text-muted-foreground font-medium tracking-widest uppercase">
            / 100
          </span>
        </div>
      </div>
      <span className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
        Form Score
      </span>
    </div>
  );
}
