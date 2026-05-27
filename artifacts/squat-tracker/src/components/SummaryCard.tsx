import { useState, useEffect } from "react";
import { generateAIFeedback, getLetterGrade, type SetSummary } from "@/lib/gemini";
import { Trophy, RefreshCw, Loader2 } from "lucide-react";

interface SummaryCardProps {
  summary: SetSummary;
  onReset: () => void;
}

export function SummaryCard({ summary, onReset }: SummaryCardProps) {
  const [feedback, setFeedback] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const { grade, color } = getLetterGrade(summary.avgFormScore);
  const isCurl = summary.exercise === "curl";

  useEffect(() => {
    setLoading(true);
    generateAIFeedback(summary).then((text) => {
      setFeedback(text);
      setLoading(false);
    });
  }, [summary]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-6 flex flex-col gap-5 shadow-2xl"
        style={{ borderColor: `${color}40`, boxShadow: `0 0 40px ${color}20` }}
        data-testid="summary-card"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6" style={{ color }} />
          <h2 className="text-xl font-bold text-foreground">Set Complete!</h2>
          <span className="ml-auto text-xs font-semibold tracking-widest uppercase text-muted-foreground border border-border rounded-lg px-2 py-1">
            {isCurl ? "Bicep Curl" : "Squat"}
          </span>
        </div>

        {/* Grade */}
        <div className="flex items-center justify-center">
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center border-4 font-black text-6xl"
            style={{
              borderColor: color,
              color,
              textShadow: `0 0 20px ${color}`,
              boxShadow: `0 0 30px ${color}40`,
            }}
            data-testid="grade-display"
          >
            {grade}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Total Reps" value={summary.totalReps} color="#4ade80" testId="stat-reps" />
          <StatBox label="Form Score" value={`${summary.avgFormScore}/100`} color={color} testId="stat-score" />
          {isCurl ? (
            <StatBox
              label="L / R"
              value={`${summary.leftReps ?? 0} / ${summary.rightReps ?? 0}`}
              color="#4ade80"
              testId="stat-arms"
            />
          ) : (
            <StatBox
              label="Full Depth"
              value={`${summary.totalReps > 0 ? Math.round(((summary.deepReps ?? 0) / summary.totalReps) * 100) : 0}%`}
              color="#4ade80"
              testId="stat-depth"
            />
          )}
        </div>

        {/* Exercise-specific issues */}
        {isCurl ? (
          <div className="grid grid-cols-2 gap-3">
            {(summary.elbowSwingCount ?? 0) > 0 && (
              <StatBox label="Elbow Swing" value={`${summary.elbowSwingCount}x`} color="#f97316" testId="stat-swing" />
            )}
            {(summary.shortRangeCount ?? 0) > 0 && (
              <StatBox label="Short Range" value={`${summary.shortRangeCount}x`} color="#f97316" testId="stat-range" />
            )}
          </div>
        ) : (
          <>
            {((summary.backRoundedCount ?? 0) > 0 || (summary.kneeCaveCount ?? 0) > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {(summary.backRoundedCount ?? 0) > 0 && (
                  <StatBox label="Back Rounded" value={`${summary.backRoundedCount}x`} color="#f97316" testId="stat-back" />
                )}
                {(summary.kneeCaveCount ?? 0) > 0 && (
                  <StatBox label="Knee Cave" value={`${summary.kneeCaveCount}x`} color="#f97316" testId="stat-knees" />
                )}
              </div>
            )}
          </>
        )}

        {/* AI Feedback */}
        <div className="rounded-xl bg-muted/60 border border-border p-4">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">
            AI Coach Feedback
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#4ade80" }} />
              <span className="text-sm">Analysing your set...</span>
            </div>
          ) : (
            <p className="text-sm text-foreground leading-relaxed" data-testid="ai-feedback">
              {feedback}
            </p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-95"
          style={{
            background: "linear-gradient(135deg, #4ade80, #22c55e)",
            color: "#0a0f0a",
            boxShadow: "0 0 20px rgba(74,222,128,0.3)",
          }}
          data-testid="button-new-set"
        >
          <RefreshCw className="w-4 h-4" />
          Start New Set
        </button>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
  testId,
}: {
  label: string;
  value: string | number;
  color: string;
  testId: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 border border-border p-3 flex flex-col items-center gap-1">
      <span
        className="text-xl font-black font-mono tabular-nums"
        style={{ color }}
        data-testid={testId}
      >
        {value}
      </span>
      <span className="text-xs text-muted-foreground font-medium text-center">{label}</span>
    </div>
  );
}
