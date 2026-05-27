export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

export function getVisibility(lm: Landmark): number {
  return lm.visibility ?? 1;
}

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso sides
  [23, 24], // hips
  [23, 25], [25, 27], [27, 29], [29, 31], // left leg
  [24, 26], [26, 28], [28, 30], [30, 32], // right leg
  [27, 31], [28, 32], // feet
];

export interface SquatMetrics {
  leftKneeAngle: number;
  rightKneeAngle: number;
  leftHipAngle: number;
  rightHipAngle: number;
  hipBelowKnee: boolean;
  backRounded: boolean;
  kneesCaringIn: boolean;
  formScore: number;
  phase: "standing" | "descending" | "bottom" | "ascending";
}

export function computeSquatMetrics(
  landmarks: Landmark[],
  prevPhase: SquatMetrics["phase"]
): SquatMetrics {
  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lHip = landmarks[23];
  const rHip = landmarks[24];
  const lKnee = landmarks[25];
  const rKnee = landmarks[26];
  const lAnkle = landmarks[27];
  const rAnkle = landmarks[28];
  const lFoot = landmarks[31];
  const rFoot = landmarks[32];

  const leftKneeAngle = calculateAngle(lHip, lKnee, lAnkle);
  const rightKneeAngle = calculateAngle(rHip, rKnee, rAnkle);
  const leftHipAngle = calculateAngle(lShoulder, lHip, lKnee);
  const rightHipAngle = calculateAngle(rShoulder, rHip, rKnee);

  const midHipY = (lHip.y + rHip.y) / 2;
  const midKneeY = (lKnee.y + rKnee.y) / 2;
  const hipBelowKnee = midHipY > midKneeY;

  // Back rounding: torso angle from vertical
  const midShoulder = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
  const midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
  const torsoAngle = Math.abs(Math.atan2(midShoulder.x - midHip.x, midHip.y - midShoulder.y) * 180 / Math.PI);
  const backRounded = torsoAngle > 30;

  // Knee cave: knees should be over feet
  const kneeWidth = Math.abs(lKnee.x - rKnee.x);
  const footWidth = Math.abs((lFoot?.x ?? lAnkle.x) - (rFoot?.x ?? rAnkle.x));
  const kneesCaringIn = kneeWidth < footWidth * 0.7;

  // Form score: start at 100, deduct for issues
  let formScore = 100;
  if (backRounded) formScore -= 25;
  if (kneesCaringIn) formScore -= 25;

  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  // Partial squat deduction (in descent or bottom)
  if (avgKneeAngle > 110 && avgKneeAngle < 160) {
    formScore -= Math.round((avgKneeAngle - 110) / 50 * 10);
  }
  formScore = Math.max(0, Math.min(100, formScore));

  // Phase detection
  let phase: SquatMetrics["phase"] = prevPhase;
  if (avgKneeAngle > 160) {
    phase = "standing";
  } else if (avgKneeAngle <= 160 && avgKneeAngle > 100) {
    if (prevPhase === "standing") phase = "descending";
    else if (prevPhase === "bottom") phase = "ascending";
  } else {
    phase = "bottom";
  }

  return {
    leftKneeAngle,
    rightKneeAngle,
    leftHipAngle,
    rightHipAngle,
    hipBelowKnee,
    backRounded,
    kneesCaringIn,
    formScore,
    phase,
  };
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  metrics: SquatMetrics | null
) {
  const NEON_GREEN = "#4ade80";
  const WARNING_RED = "#ef4444";
  const JOINT_WHITE = "#ffffff";

  ctx.clearRect(0, 0, width, height);

  // Draw connections
  for (const [i, j] of POSE_CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < 0.3 || (b.visibility ?? 1) < 0.3) continue;

    // Highlight knee/hip connections if issues
    let strokeColor = NEON_GREEN;
    const isKneePair = (i === 25 && j === 27) || (i === 26 && j === 28) ||
                       (i === 23 && j === 25) || (i === 24 && j === 26);
    if (isKneePair && metrics?.kneesCaringIn) strokeColor = WARNING_RED;

    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 8;
    ctx.shadowColor = strokeColor;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Draw joints
  for (const lm of landmarks) {
    if (!lm || (lm.visibility ?? 1) < 0.3) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 5, 0, 2 * Math.PI);
    ctx.fillStyle = JOINT_WHITE;
    ctx.shadowBlur = 6;
    ctx.shadowColor = NEON_GREEN;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Draw angle labels for knees
  if (metrics && landmarks[25] && landmarks[26]) {
    const drawAngleLabel = (lm: Landmark, angle: number, label: string) => {
      const x = lm.x * width;
      const y = lm.y * height;
      ctx.font = "bold 13px 'JetBrains Mono', monospace";
      ctx.fillStyle = NEON_GREEN;
      ctx.shadowBlur = 6;
      ctx.shadowColor = NEON_GREEN;
      ctx.fillText(`${label} ${Math.round(angle)}°`, x + 8, y - 8);
      ctx.shadowBlur = 0;
    };
    drawAngleLabel(landmarks[25], metrics.leftKneeAngle, "L");
    drawAngleLabel(landmarks[26], metrics.rightKneeAngle, "R");
  }
}
