import { FormScoreRing } from "@/components/FormScoreRing";
import { Activity, AlertTriangle, CheckCircle2, Dumbbell } from "lucide-react";
import type { ExerciseMode, CurlArmPhase } from "@/lib/poseUtils";

interface SidePanelProps {
  exercise: ExerciseMode;
  repCount: number;
  formScore: number;
  isTracking: boolean;
  onEndSet: () => void;
  onStart: () => void;
  onChangeExercise: () => void;
  // Squat props
  squatPhase?: string;
  backRounded?: boolean;
  kneesCaringIn?: boolean;
  leftKneeAngle?: number;
  rightKneeAngle?: number;
  // Curl props
  leftElbowAngle?: number;
  rightElbowAngle?: number;
  leftPhase?: CurlArmPhase;
  rightPhase?: CurlArmPhase;
  leftElbowSwing?: boolean;
  rightElbowSwing?: boolean;
  leftReps?: number;
  rightReps?: number;
}

const SQUAT_PHASE_LABEL: Record<string, string> = {
  standing: "Standing",
  descending: "Going Down",
  bottom: "Bottom",
  ascending: "Coming Up",
};

const CURL_PHASE_LABEL: Record<string, string> = {
  rest: "Rest",
  curling: "Curling Up",
  peak: "Peak",
  returning: "Lowering",
};

export function SidePanel({
  exercise,
  repCount,
  formScore,
  isTracking,
  onEndSet,
  onStart,
  onChangeExercise,
  squatPhase,
  backRounded,
  kneesCaringIn,
  leftKneeAngle = 180,
  rightKneeAngle = 180,
  leftElbowAngle = 180,
  rightElbowAngle = 180,
  leftPhase = "rest",
  rightPhase = "rest",
  leftElbowSwing = false,
  rightElbowSwing = false,
  leftReps = 0,
  rightReps = 0,
}: SidePanelProps) {
  const isCurl = exercise === "curl";

  const activePhase = isCurl
    ? (leftPhase !== "rest" ? leftPhase : rightPhase !== "rest" ? rightPhase : "rest")
    : squatPhase ?? "standing";

  const phaseLabel = isCurl
    ? CURL_PHASE_LABEL[activePhase] ?? activePhase
    : SQUAT_PHASE_LABEL[activePhase] ?? activePhase;

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col gap-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-5 h-5 text-green-400" />
          <h1 className="text-lg font-black tracking-tight text-foreground">
            {isCurl ? "Curl" : "Squat"}<span className="text-green-400">AI</span>
          </h1>
        </div>
        {!isTracking && (
          <button
            onClick={onChangeExercise}
            className="text-xs text-muted-foreground hover:text-green-400 transition-colors font-medium border border-border rounded-lg px-2 py-1"
            data-testid="button-change-exercise"
          >
            Switch
          </button>
        )}
      </div>

      {/* Exercise badge */}
      <div className="flex gap-2 px-1">
        <ExBadge label="Squat" active={!isCurl} />
        <ExBadge label="Bicep Curl" active={isCurl} />
      </div>

      {/* Form Score */}
      <div className="rounded-2xl bg-card border border-border p-4 flex flex-col items-center gap-3 neon-border">
        <FormScoreRing score={formScore} />
      </div>

      {/* Rep Counter */}
      <div className="rounded-2xl bg-card border border-border p-4 flex flex-col items-center gap-2">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          {isCurl ? "Total Reps" : "Reps"}
        </span>
        <span
          className="text-6xl font-black font-mono tabular-nums text-green-400 neon-text"
          data-testid="rep-counter"
        >
          {repCount}
        </span>

        {isCurl && isTracking && (
          <div className="grid grid-cols-2 gap-2 w-full mt-1">
            <ArmRepBox side="L" reps={leftReps} />
            <ArmRepBox side="R" reps={rightReps} />
          </div>
        )}

        {isTracking && (
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="w-2 h-2 rounded-full bg-green-400 animate-pulse"
              style={{ boxShadow: "0 0 6px #4ade80" }}
            />
            <span className="text-xs font-semibold text-green-400" data-testid="phase-label">
              {phaseLabel}
            </span>
          </div>
        )}
      </div>

      {/* Angles */}
      <div className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-400" />
          <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
            {isCurl ? "Elbow Angles" : "Knee Angles"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {isCurl ? (
            <>
              <AngleBar label="Left" angle={leftElbowAngle} min={30} max={180} warn={leftElbowSwing} />
              <AngleBar label="Right" angle={rightElbowAngle} min={30} max={180} warn={rightElbowSwing} />
            </>
          ) : (
            <>
              <AngleBar label="Left" angle={leftKneeAngle} min={0} max={180} />
              <AngleBar label="Right" angle={rightKneeAngle} min={0} max={180} />
            </>
          )}
        </div>
      </div>

      {/* Form Checks */}
      <div className="rounded-2xl bg-card border border-border p-4 flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
          Form Checks
        </span>

        {isCurl ? (
          <>
            <FormCheck
              label="Left Elbow"
              ok={!leftElbowSwing}
              okText="Locked in"
              failText="Swinging fwd"
            />
            <FormCheck
              label="Right Elbow"
              ok={!rightElbowSwing}
              okText="Locked in"
              failText="Swinging fwd"
            />
          </>
        ) : (
          <>
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
          </>
        )}
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

function ExBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`flex-1 text-center text-xs font-bold py-1 rounded-lg transition-all ${
        active
          ? "bg-green-400/15 text-green-400 border border-green-400/40"
          : "text-muted-foreground border border-transparent"
      }`}
    >
      {label}
    </span>
  );
}

function ArmRepBox({ side, reps }: { side: string; reps: number }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-muted/40 py-1.5 gap-0.5">
      <span className="text-lg font-black font-mono text-green-400">{reps}</span>
      <span className="text-xs text-muted-foreground">{side} arm</span>
    </div>
  );
}

function AngleBar({
  label,
  angle,
  min,
  max,
  warn = false,
}: {
  label: string;
  angle: number;
  min: number;
  max: number;
  warn?: boolean;
}) {
  const clamped = Math.max(min, Math.min(max, angle));
  const pct = ((clamped - min) / (max - min)) * 100;
  const color = warn ? "#f97316" : angle < 90 ? "#4ade80" : angle < 140 ? "#facc15" : "#94a3b8";

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
          className="h-full rounded-full transition-all duration-100"
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
