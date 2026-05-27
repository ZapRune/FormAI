import type { ExerciseMode } from "./poseUtils";

export interface SetSummary {
  exercise: ExerciseMode;
  reps: number;
  totalReps: number;
  avgFormScore: number;
  // Squat-specific
  deepReps?: number;
  backRoundedCount?: number;
  kneeCaveCount?: number;
  // Curl-specific
  elbowSwingCount?: number;
  shortRangeCount?: number;
  leftReps?: number;
  rightReps?: number;
}

export function getLetterGrade(avgScore: number): { grade: string; color: string } {
  if (avgScore >= 90) return { grade: "A", color: "#4ade80" };
  if (avgScore >= 80) return { grade: "B", color: "#a3e635" };
  if (avgScore >= 70) return { grade: "C", color: "#facc15" };
  if (avgScore >= 60) return { grade: "D", color: "#f97316" };
  return { grade: "F", color: "#ef4444" };
}

export async function generateAIFeedback(summary: SetSummary): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return generateFallbackFeedback(summary);

  const isSquat = summary.exercise === "squat";

  const prompt = isSquat
    ? `You are an encouraging expert personal trainer specialising in squat form.
A user just completed a set of squats. Stats:
- Total reps: ${summary.totalReps}
- Reps with full depth (hip below knee): ${summary.deepReps ?? 0} / ${summary.totalReps}
- Average form score: ${summary.avgFormScore}/100
- Reps with back rounding: ${summary.backRoundedCount ?? 0}
- Reps with knees caving in: ${summary.kneeCaveCount ?? 0}
Write a short, friendly, encouraging 2-3 sentence summary. Be specific about what they did well and give one concrete actionable tip. No bullet points.`

    : `You are an encouraging expert personal trainer specialising in bicep curl form.
A user just completed a set of bicep curls. Stats:
- Total reps: ${summary.totalReps} (Left: ${summary.leftReps ?? 0}, Right: ${summary.rightReps ?? 0})
- Average form score: ${summary.avgFormScore}/100
- Reps with elbow swinging forward: ${summary.elbowSwingCount ?? 0}
- Reps without full range of motion (didn't reach peak contraction): ${summary.shortRangeCount ?? 0}
Write a short, friendly, encouraging 2-3 sentence summary. Be specific about what they did well and give one concrete actionable tip. No bullet points.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.8 },
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
  if (totalReps === 0) return "No reps recorded this set. Get into position and let's go!";

  if (exercise === "curl") {
    const swingPct = Math.round(((summary.elbowSwingCount ?? 0) / totalReps) * 100);
    if (avgFormScore >= 85) {
      return `Great set! ${totalReps} solid reps with a ${avgFormScore}/100 form score. Your elbows stayed locked in — that's exactly the technique that builds real bicep strength!`;
    }
    if (swingPct > 40) {
      return `Nice effort on ${totalReps} reps! Your elbows are swinging a bit — try pinning them to your sides throughout the whole movement. You'll feel the biceps working much harder!`;
    }
    if ((summary.shortRangeCount ?? 0) > totalReps * 0.4) {
      return `Solid ${totalReps} reps! Try squeezing all the way to the top so the angle drops under 70° — a full contraction makes every rep count more. You're close!`;
    }
    return `Good work — ${totalReps} reps with a ${avgFormScore}/100 score! Keep focusing on controlled movement and you'll build impressive arms in no time!`;
  }

  // squat
  const deepPct = Math.round(((summary.deepReps ?? 0) / totalReps) * 100);
  if (avgFormScore >= 85 && deepPct >= 80) {
    return `Excellent set! ${totalReps} solid reps with great depth on ${deepPct}% of them. Your ${avgFormScore}/100 form score shows real consistency — keep it up!`;
  }
  if ((summary.backRoundedCount ?? 0) > totalReps * 0.5) {
    return `Good effort on ${totalReps} reps! Your back is rounding a bit — try bracing your core before descending and keep your chest up. You've got this!`;
  }
  if ((summary.kneeCaveCount ?? 0) > totalReps * 0.5) {
    return `Solid ${totalReps} reps! Focus on pushing your knees out in line with your toes — "spread the floor" with your feet. That'll clean up your form fast!`;
  }
  if (deepPct < 50) {
    return `Nice work on ${totalReps} reps! Try to drop a little deeper — aim to get your hip crease below your knee for full range of motion. It's harder but so worth it!`;
  }
  return `Good set — ${totalReps} reps with a ${avgFormScore}/100 score! Keep focusing on depth and bracing and you'll be hitting perfect squats in no time!`;
}
