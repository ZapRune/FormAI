import type { ExerciseMode } from "./poseUtils";

export interface SetSummary {
  exercise: ExerciseMode;
  reps: number;
  totalReps: number;
  avgFormScore: number;
  // Squat
  deepReps?: number;
  backRoundedCount?: number;
  kneeCaveCount?: number;
  forwardLeanCount?: number;
  // Curl
  elbowSwingCount?: number;
  shortRangeCount?: number;
  bodySwayCurlCount?: number;
  leftReps?: number;
  rightReps?: number;
}

export function getLetterGrade(avgScore: number): { grade: string; color: string } {
  if (avgScore >= 90) return { grade: "A", color: "#4ade80" };
  if (avgScore >= 75) return { grade: "B", color: "#a3e635" };
  if (avgScore >= 60) return { grade: "C", color: "#facc15" };
  if (avgScore >= 45) return { grade: "D", color: "#f97316" };
  return { grade: "F", color: "#ef4444" };
}

export async function generateAIFeedback(summary: SetSummary): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return generateFallbackFeedback(summary);

  const isSquat = summary.exercise === "squat";
  const deepPct = isSquat && summary.totalReps > 0
    ? Math.round(((summary.deepReps ?? 0) / summary.totalReps) * 100)
    : null;

  const prompt = isSquat
    ? `You are a brutally honest, no-nonsense strength coach. You do NOT sugarcoat. You tell people exactly what's wrong.
A user just completed ${summary.totalReps} squats. Their form score was ${summary.avgFormScore}/100.
Stats:
- Reps with full depth (hip below knee): ${summary.deepReps ?? 0}/${summary.totalReps} (${deepPct}%)
- Reps with back rounding: ${summary.backRoundedCount ?? 0}
- Reps with knees caving in: ${summary.kneeCaveCount ?? 0}
- Reps with excessive forward lean: ${summary.forwardLeanCount ?? 0}

Be direct, specific, and critical. If the form score is below 70, call it out harshly. Name every issue detected. Give one clear fix to prioritise. 2-3 sentences max. No bullet points. No fluff.`

    : `You are a brutally honest, no-nonsense strength coach. You do NOT sugarcoat. You tell people exactly what's wrong.
A user just completed ${summary.totalReps} bicep curl reps. Their form score was ${summary.avgFormScore}/100.
Stats:
- Left arm reps: ${summary.leftReps ?? 0}, Right arm reps: ${summary.rightReps ?? 0}
- Reps with elbow swinging: ${summary.elbowSwingCount ?? 0}
- Reps without reaching full contraction (<65°): ${summary.shortRangeCount ?? 0}
- Reps with body sway: ${summary.bodySwayCurlCount ?? 0}

Be direct, specific, and critical. If the form score is below 70, call it out harshly. Name every issue detected. Give one clear fix to prioritise. 2-3 sentences max. No bullet points. No fluff.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
        }),
      }
    );
    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? generateFallbackFeedback(summary);
  } catch {
    return generateFallbackFeedback(summary);
  }
}

function generateFallbackFeedback(summary: SetSummary): string {
  const { totalReps, avgFormScore, exercise } = summary;
  if (totalReps === 0) return "Zero reps recorded. Get in frame and actually do the exercise.";

  if (exercise === "curl") {
    const swingRatio  = (summary.elbowSwingCount ?? 0) / totalReps;
    const shortRatio  = (summary.shortRangeCount ?? 0) / totalReps;
    const swayRatio   = (summary.bodySwayCurlCount ?? 0) / totalReps;

    if (avgFormScore < 50) {
      return `${avgFormScore}/100 — that's bad. Your elbows are swinging like a pendulum and you're throwing your whole body into the lift. That's not a curl, that's momentum. Pin your elbows to your sides, go lighter, and actually use your biceps.`;
    }
    if (swingRatio > 0.5) {
      return `Your elbows swung forward on ${summary.elbowSwingCount} of ${totalReps} reps. You're using your front delts to cheat, not your biceps. Lighter weight, strict form — keep those elbows locked to your ribs.`;
    }
    if (shortRatio > 0.5) {
      return `You stopped short on ${summary.shortRangeCount} of ${totalReps} reps — you never hit full contraction. Half reps build half muscles. Squeeze all the way up until your forearm nearly touches your bicep.`;
    }
    if (swayRatio > 0.5) {
      return `You're swaying your torso on ${summary.bodySwayCurlCount} reps. Stand still — your legs and back aren't supposed to be helping. Brace your core and isolate the curl.`;
    }
    if (avgFormScore >= 85) {
      return `Solid set — ${totalReps} reps at ${avgFormScore}/100. Elbows stayed controlled. Keep that up and add weight when it feels this clean.`;
    }
    return `${totalReps} reps, ${avgFormScore}/100 — decent but not clean. Tighten up your elbow position and aim for a full squeeze at the top every single rep.`;
  }

  // Squats
  const deepPct = totalReps > 0 ? Math.round(((summary.deepReps ?? 0) / totalReps) * 100) : 0;
  const backRatio  = (summary.backRoundedCount ?? 0) / totalReps;
  const kneeRatio  = (summary.kneeCaveCount ?? 0) / totalReps;
  const leanRatio  = (summary.forwardLeanCount ?? 0) / totalReps;

  if (avgFormScore < 50) {
    return `${avgFormScore}/100 — that's a rough set. Multiple form issues detected across your reps. Fix the basics before adding weight: chest up, knees tracking over toes, and get your hips below parallel.`;
  }
  if (backRatio > 0.5) {
    return `Your back was rounding on ${summary.backRoundedCount} of ${totalReps} reps. That puts your spine under serious load. Brace your core before you descend and keep your chest up — don't let the weight fold you forward.`;
  }
  if (kneeRatio > 0.5) {
    return `Your knees caved inward on ${summary.kneeCaveCount} of ${totalReps} reps. This is a glute and mobility issue. Push your knees out actively throughout the whole movement.`;
  }
  if (deepPct < 40) {
    return `Only ${deepPct}% of your reps hit parallel. Squatting high is not squatting. Work on hip mobility and go lighter until you can consistently hit depth.`;
  }
  if (leanRatio > 0.5) {
    return `You're leaning too far forward on ${summary.forwardLeanCount} reps. Likely tight ankles or weak upper back. Work on ankle mobility and keep your torso as upright as possible.`;
  }
  if (avgFormScore >= 85 && deepPct >= 80) {
    return `Clean set — ${totalReps} reps at ${avgFormScore}/100 with ${deepPct}% hitting full depth. That's how it's done.`;
  }
  return `${totalReps} reps, ${avgFormScore}/100. There's still room to tighten this up — focus on the biggest issue flagged and don't rush adding weight.`;
}
