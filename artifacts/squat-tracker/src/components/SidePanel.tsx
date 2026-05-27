import { FormScoreRing } from "@/components/FormScoreRing";
import { Activity, AlertTriangle, CheckCircle2, Dumbbell } from "lucide-react";

interface SidePanelProps {
  repCount: number;
  formScore: number;
  phase: string;
  backRounded: boolean;
  kneesCaringIn: boolean;
  leftKneeAngle: number;
  rightKneeAngle: number;
  isTracking: boolean;
  onEndSet: () => void;
  onStart: () => void;
}

export function SidePanel({
  repCount,
  formScore,
  phase,
  backRounded,
  kneesCaringIn,
  leftKneeAngle,
  rightKneeAngle,
  isTracking,
  onEndSet,
  onStart,
}: SidePanelProps) {
  const phaseLabel: Record<string, string> = {
    standing: "Standing",
    descending: "Going Down",
    bottom: "Bottom",
    ascending: "Coming Up",
  };

  const phaseColor: Record<string, string> = {
    standing: "#94a3b8",
    descending: "#4ade80",
    bottom: "#22c55e",
    ascending: "#4ade80",
  };

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col gap-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <Dumbbell className="w-5 h-5 text-green-400" />
        <h1 className="text-lg font-black tracking-tight text-foreground">
          Squat<span className="text-green-400">AI</span>
        </h1>
      </div>

      {/* Form Score */}
      <div className="rounded-2xl bg-card border border-border p-4 flex flex-col items-center gap-3 neon-border">
        <FormScoreRing score={formScore} />
      </div>

      {/* Rep Counter */}
      <div className="rounded-2xl bg-card border border-border p-4 flex flex-col items-center gap-2">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          Reps
        </span>
        <span
          className="text-6xl font-black font-mono tabular-nums text-green-400 neon-text"
          data-testid="rep-counter"
        >
          {repCount}
        </span>
        {isTracking && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="w-2 h-2 rounded-full bg-green-400 animate-pulse"
              style={{ boxShadow: "0 0 6px #4ade80" }}
            />
            <span
              className="text-xs font-semibold"
              style={{ color: phaseColor[phase] ?? "#94a3b8" }}
              data-testid="phase-label"
            >
              {phaseLabel[phase] ?? phase}
            </span>
          </div>
        )}
      </div>

      {/* Knee Angles */}
      <div className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            Knee Angles
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <AngleBar label="Left" angle={leftKneeAngle} />
          <AngleBar label="Right" angle={rightKneeAngle} />
        </div>
      </div>

      {/* Form Checks */}
      <div className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          Form Checks
        </span>
        <FormCheck
          label="Back Straight"
          ok={!backRounded}
          okText="Looking good"
          failText="Rounding detected"
        />
        <FormCheck
          label="Knees Out"
          ok={!kneesCaringIn}
          okText="Aligned"
          failText="Caving inward"
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 mt-auto">
        {!isTracking ? (
          <button
            onClick={onStart}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #4ade80, #22c55e)",
              color: "#0a0f0a",
              boxShadow: "0 0 20px rgba(74,222,128,0.3)",
            }}
            data-testid="button-start"
          >
            Start Tracking
          </button>
        ) : (
          <button
            onClick={onEndSet}
            className="w-full py-3 rounded-xl font-bold text-sm border border-green-400/50 text-green-400 transition-all hover:bg-green-400/10 active:scale-95"
            data-testid="button-end-set"
          >
            End Set & Review
          </button>
        )}
      </div>
    </aside>
  );
}

function AngleBar({ label, angle }: { label: string; angle: number }) {
  const clamped = Math.max(0, Math.min(180, angle));
  const pct = (clamped / 180) * 100;
  const color = angle < 100 ? "#4ade80" : angle < 140 ? "#facc15" : "#94a3b8";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono font-bold" style={{ color }}>
          {Math.round(angle)}°
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}` }}
        />
      </div>
    </div>
  );
}

function FormCheck({
  label,
  ok,
  okText,
  failText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
        )}
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <span className={`text-xs font-semibold ${ok ? "text-green-400" : "text-red-400"}`}>
        {ok ? okText : failText}
      </span>
    </div>
  );
}
