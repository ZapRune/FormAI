export interface SetSummary {
  reps: number;
  avgFormScore: number;
  deepReps: number;
  totalReps: number;
  backRoundedCount: number;
  kneeCaveCount: number;
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
  if (!apiKey) {
    return generateFallbackFeedback(summary);
  }

  const prompt = `You are an encouraging and expert personal trainer specializing in squat form. 
A user just completed a set of squats. Here are their stats:
- Total reps completed: ${summary.totalReps}
- Reps with full depth (hip below knee): ${summary.deepReps} out of ${summary.totalReps}
- Average form score: ${summary.avgFormScore}/100
- Reps where back rounded: ${summary.backRoundedCount}
- Reps where knees caved in: ${summary.kneeCaveCount}

Write a short, friendly, encouraging 2-3 sentence summary of their performance. 
Be specific about what they did well and give one concrete actionable tip for improvement.
Keep it upbeat, like a supportive coach. Do not use bullet points or lists.`;

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
  const { totalReps, deepReps, avgFormScore, backRoundedCount, kneeCaveCount } = summary;
  if (totalReps === 0) return "No reps recorded this set. Get into frame, stand tall, and start squatting!";

  const deepPct = Math.round((deepReps / totalReps) * 100);

  if (avgFormScore >= 85 && deepPct >= 80) {
    return `Excellent set! You hit ${totalReps} solid reps with great depth on ${deepPct}% of them. Your form score of ${avgFormScore}/100 shows real consistency — keep it up!`;
  }
  if (backRoundedCount > totalReps * 0.5) {
    return `Good effort on ${totalReps} reps! Your back is rounding a bit — try bracing your core tighter before descending and keep your chest up. You've got this!`;
  }
  if (kneeCaveCount > totalReps * 0.5) {
    return `Solid ${totalReps} reps! Focus on pushing your knees out in line with your toes — think about "spreading the floor" with your feet. That'll clean up your form quickly!`;
  }
  if (deepPct < 50) {
    return `Nice work on ${totalReps} reps! Try to drop a little deeper — aim to get your hip crease below your knee for full range of motion. It's harder but so worth it!`;
  }
  return `Good set with ${totalReps} reps and a form score of ${avgFormScore}/100! Keep focusing on depth and bracing, and you'll be hitting perfect squats in no time!`;
}
