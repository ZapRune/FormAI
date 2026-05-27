export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type ExerciseMode = "squat" | "curl";

export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) angle = 360 - angle;
  return angle;
}

// ─── Squat connections ───────────────────────────────────────────────────────
export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [11, 23], [12, 24],
  [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31],
  [24, 26], [26, 28], [28, 30], [30, 32],
  [27, 31], [28, 32],
];

// ─── Curl: only upper-body connections ───────────────────────────────────────
export const CURL_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
  [11, 23], [12, 24],
  [23, 24],
];

// ═════════════════════════════════════════════════════════════════════════════
// SQUAT
// ═════════════════════════════════════════════════════════════════════════════

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

  const midShoulderX = (lShoulder.x + rShoulder.x) / 2;
  const midShoulderY = (lShoulder.y + rShoulder.y) / 2;
  const midHipX = (lHip.x + rHip.x) / 2;
  const midHipY2 = (lHip.y + rHip.y) / 2;
  const torsoAngle = Math.abs(
    Math.atan2(midShoulderX - midHipX, midHipY2 - midShoulderY) * 180 / Math.PI
  );
  const backRounded = torsoAngle > 30;

  const kneeWidth = Math.abs(lKnee.x - rKnee.x);
  const footWidth = Math.abs((lFoot?.x ?? lAnkle.x) - (rFoot?.x ?? rAnkle.x));
  const kneesCaringIn = kneeWidth < footWidth * 0.7;

  let formScore = 100;
  if (backRounded) formScore -= 25;
  if (kneesCaringIn) formScore -= 25;
  const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
  if (avgKneeAngle > 110 && avgKneeAngle < 160) {
    formScore -= Math.round(((avgKneeAngle - 110) / 50) * 10);
  }
  formScore = Math.max(0, Math.min(100, formScore));

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

// ═════════════════════════════════════════════════════════════════════════════
// BICEP CURL
// ═════════════════════════════════════════════════════════════════════════════

export type CurlArmPhase = "rest" | "curling" | "peak" | "returning";

export interface CurlArmState {
  phase: CurlArmPhase;
  peakReached: boolean;
  repComplete: boolean;
}

export interface CurlMetrics {
  leftElbowAngle: number;
  rightElbowAngle: number;
  leftShoulderAngle: number;   // how far the upper arm has swung forward
  rightShoulderAngle: number;
  leftElbowSwing: boolean;     // elbow moving too far forward
  rightElbowSwing: boolean;
  leftFullRange: boolean;      // reached peak contraction (<70°)
  rightFullRange: boolean;
  formScore: number;
  leftPhase: CurlArmPhase;
  rightPhase: CurlArmPhase;
}

/**
 * Computes the upper-arm forward tilt from vertical.
 * Uses shoulder and elbow — a large angle means elbow is swinging forward.
 */
function upperArmForwardTilt(
  shoulder: Landmark,
  elbow: Landmark
): number {
  // Vector from shoulder to elbow; angle from pointing straight down (0,1)
  const dx = elbow.x - shoulder.x;
  const dy = elbow.y - shoulder.y; // positive = downward in image coords
  const angle = Math.atan2(Math.abs(dx), Math.max(dy, 0.001)) * 180 / Math.PI;
  return angle;
}

function nextCurlPhase(
  prev: CurlArmPhase,
  angle: number,
  peakReached: { value: boolean }
): { phase: CurlArmPhase; peakReached: boolean; repComplete: boolean } {
  // Thresholds (degrees)
  const REST_THRESH = 145;   // arm extended → rest
  const CURL_THRESH = 130;   // starts bending → curling
  const PEAK_THRESH = 70;    // sufficiently contracted → peak

  let phase = prev;
  let repComplete = false;

  switch (prev) {
    case "rest":
      if (angle < CURL_THRESH) phase = "curling";
      break;
    case "curling":
      if (angle < PEAK_THRESH) {
        phase = "peak";
        peakReached.value = true;
      } else if (angle > REST_THRESH) {
        // they started lowering without fully curling
        phase = "rest";
        peakReached.value = false;
      }
      break;
    case "peak":
      if (angle > CURL_THRESH) phase = "returning";
      break;
    case "returning":
      if (angle > REST_THRESH) {
        if (peakReached.value) {
          repComplete = true;
        }
        phase = "rest";
        peakReached.value = false;
      }
      break;
  }

  return { phase, peakReached: peakReached.value, repComplete };
}

export function computeCurlMetrics(
  landmarks: Landmark[],
  prevLeft: CurlArmPhase,
  prevRight: CurlArmPhase,
  leftPeakRef: { value: boolean },
  rightPeakRef: { value: boolean }
): CurlMetrics & { leftRepComplete: boolean; rightRepComplete: boolean } {
  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lElbow = landmarks[13];
  const rElbow = landmarks[14];
  const lWrist = landmarks[15];
  const rWrist = landmarks[16];
  const lHip = landmarks[23];
  const rHip = landmarks[24];

  // Elbow angles: shoulder → elbow → wrist
  const leftElbowAngle = lShoulder && lElbow && lWrist
    ? calculateAngle(lShoulder, lElbow, lWrist)
    : 180;
  const rightElbowAngle = rShoulder && rElbow && rWrist
    ? calculateAngle(rShoulder, rElbow, rWrist)
    : 180;

  // Upper-arm forward tilt (elbow swing detection)
  const leftTilt = lShoulder && lElbow ? upperArmForwardTilt(lShoulder, lElbow) : 0;
  const rightTilt = rShoulder && rElbow ? upperArmForwardTilt(rShoulder, rElbow) : 0;
  const leftElbowSwing = leftTilt > 35;
  const rightElbowSwing = rightTilt > 35;

  // Shoulder angle: hip → shoulder → elbow (torso lean / body swing)
  const leftShoulderAngle = lHip && lShoulder && lElbow
    ? calculateAngle(lHip, lShoulder, lElbow)
    : 90;
  const rightShoulderAngle = rHip && rShoulder && rElbow
    ? calculateAngle(rHip, rShoulder, rElbow)
    : 90;

  // Phase transitions
  const leftResult = nextCurlPhase(prevLeft, leftElbowAngle, leftPeakRef);
  const rightResult = nextCurlPhase(prevRight, rightElbowAngle, rightPeakRef);

  const leftFullRange = leftResult.peakReached || leftElbowAngle < 70;
  const rightFullRange = rightResult.peakReached || rightElbowAngle < 70;

  // Form score
  let formScore = 100;
  if (leftElbowSwing)  formScore -= 20;
  if (rightElbowSwing) formScore -= 20;
  // Penalise excessive body lean
  const bodyLean = Math.abs(
    ((lShoulder?.x ?? 0) - (lHip?.x ?? 0)) + ((rShoulder?.x ?? 0) - (rHip?.x ?? 0))
  );
  if (bodyLean > 0.12) formScore -= 15;
  formScore = Math.max(0, Math.min(100, formScore));

  return {
    leftElbowAngle,
    rightElbowAngle,
    leftShoulderAngle,
    rightShoulderAngle,
    leftElbowSwing,
    rightElbowSwing,
    leftFullRange,
    rightFullRange,
    formScore,
    leftPhase: leftResult.phase,
    rightPhase: rightResult.phase,
    leftRepComplete: leftResult.repComplete,
    rightRepComplete: rightResult.repComplete,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DRAWING
// ═════════════════════════════════════════════════════════════════════════════

const NEON_GREEN = "#4ade80";
const WARNING_RED = "#ef4444";
const WARNING_ORANGE = "#f97316";
const JOINT_WHITE = "#ffffff";
const DIM_COLOR = "rgba(255,255,255,0.15)";

function drawBone(
  ctx: CanvasRenderingContext2D,
  a: Landmark,
  b: Landmark,
  w: number,
  h: number,
  color: string,
  lineWidth = 3
) {
  ctx.beginPath();
  ctx.moveTo(a.x * w, a.y * h);
  ctx.lineTo(b.x * w, b.y * h);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.shadowBlur = 10;
  ctx.shadowColor = color;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawJoint(
  ctx: CanvasRenderingContext2D,
  lm: Landmark,
  w: number,
  h: number,
  color = JOINT_WHITE,
  radius = 5
) {
  ctx.beginPath();
  ctx.arc(lm.x * w, lm.y * h, radius, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.shadowBlur = 8;
  ctx.shadowColor = color === JOINT_WHITE ? NEON_GREEN : color;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawAngleArc(
  ctx: CanvasRenderingContext2D,
  joint: Landmark,
  angle: number,
  w: number,
  h: number,
  color: string
) {
  const x = joint.x * w;
  const y = joint.y * h;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, (angle / 180) * Math.PI);
  ctx.strokeStyle = color + "80";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function angleLabel(
  ctx: CanvasRenderingContext2D,
  lm: Landmark,
  angle: number,
  label: string,
  w: number,
  h: number,
  color = NEON_GREEN,
  offsetX = 10,
  offsetY = -10
) {
  ctx.font = "bold 13px 'JetBrains Mono', monospace";
  ctx.fillStyle = color;
  ctx.shadowBlur = 6;
  ctx.shadowColor = color;
  ctx.fillText(`${label} ${Math.round(angle)}°`, lm.x * w + offsetX, lm.y * h + offsetY);
  ctx.shadowBlur = 0;
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  mode: ExerciseMode,
  squatMetrics: SquatMetrics | null,
  curlMetrics: (CurlMetrics & { leftRepComplete: boolean; rightRepComplete: boolean }) | null
) {
  ctx.clearRect(0, 0, width, height);

  const connections = mode === "curl" ? CURL_CONNECTIONS : POSE_CONNECTIONS;

  for (const [i, j] of connections) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b) continue;
    if ((a.visibility ?? 1) < 0.25 || (b.visibility ?? 1) < 0.25) continue;

    let color = NEON_GREEN;

    if (mode === "squat" && squatMetrics) {
      const isLegPair = [
        [23, 25], [25, 27], [24, 26], [26, 28],
      ].some(([x, y]) => x === i && y === j);
      if (isLegPair && squatMetrics.kneesCaringIn) color = WARNING_RED;
    }

    if (mode === "curl" && curlMetrics) {
      const isLeftArm = [
        [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
      ].some(([x, y]) => x === i && y === j);
      const isRightArm = [
        [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
      ].some(([x, y]) => x === i && y === j);

      if (isLeftArm && curlMetrics.leftElbowSwing) color = WARNING_ORANGE;
      if (isRightArm && curlMetrics.rightElbowSwing) color = WARNING_ORANGE;

      // Dim the legs/lower body in curl mode
      const isLower = [[11, 23], [12, 24], [23, 24]].some(([x, y]) => x === i && y === j);
      if (isLower) color = DIM_COLOR;
    }

    drawBone(ctx, a, b, width, height, color);
  }

  // Joints
  for (let idx = 0; idx < landmarks.length; idx++) {
    const lm = landmarks[idx];
    if (!lm || (lm.visibility ?? 1) < 0.25) continue;

    // In curl mode, skip lower-body joints
    if (mode === "curl" && idx >= 25) continue;

    let jointColor = JOINT_WHITE;
    if (mode === "curl" && curlMetrics) {
      if ([13, 15].includes(idx) && curlMetrics.leftElbowSwing) jointColor = WARNING_ORANGE;
      if ([14, 16].includes(idx) && curlMetrics.rightElbowSwing) jointColor = WARNING_ORANGE;
    }

    drawJoint(ctx, lm, width, height, jointColor);
  }

  // ── Squat angle labels ────────────────────────────────────────────────────
  if (mode === "squat" && squatMetrics) {
    if (landmarks[25]) angleLabel(ctx, landmarks[25], squatMetrics.leftKneeAngle, "L", width, height);
    if (landmarks[26]) angleLabel(ctx, landmarks[26], squatMetrics.rightKneeAngle, "R", width, height);
  }

  // ── Curl angle labels + arc ───────────────────────────────────────────────
  if (mode === "curl" && curlMetrics) {
    const lElbow = landmarks[13];
    const rElbow = landmarks[14];

    const leftColor = curlMetrics.leftElbowSwing ? WARNING_ORANGE : NEON_GREEN;
    const rightColor = curlMetrics.rightElbowSwing ? WARNING_ORANGE : NEON_GREEN;

    if (lElbow && (lElbow.visibility ?? 1) > 0.3) {
      drawAngleArc(ctx, lElbow, curlMetrics.leftElbowAngle, width, height, leftColor);
      angleLabel(ctx, lElbow, curlMetrics.leftElbowAngle, "L", width, height, leftColor, -60, -14);
    }
    if (rElbow && (rElbow.visibility ?? 1) > 0.3) {
      drawAngleArc(ctx, rElbow, curlMetrics.rightElbowAngle, width, height, rightColor);
      angleLabel(ctx, rElbow, curlMetrics.rightElbowAngle, "R", width, height, rightColor, 14, -14);
    }

    // Phase badges near each elbow
    const phaseLabel = (phase: CurlArmPhase) =>
      phase === "rest" ? "" :
      phase === "curling" ? "↑" :
      phase === "peak" ? "●" :
      "↓";

    if (lElbow && (lElbow.visibility ?? 1) > 0.3) {
      const lbl = phaseLabel(curlMetrics.leftPhase);
      if (lbl) {
        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = leftColor;
        ctx.shadowBlur = 8; ctx.shadowColor = leftColor;
        ctx.fillText(lbl, lElbow.x * width - 60, lElbow.y * height + 20);
        ctx.shadowBlur = 0;
      }
    }
    if (rElbow && (rElbow.visibility ?? 1) > 0.3) {
      const lbl = phaseLabel(curlMetrics.rightPhase);
      if (lbl) {
        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = rightColor;
        ctx.shadowBlur = 8; ctx.shadowColor = rightColor;
        ctx.fillText(lbl, rElbow.x * width + 14, rElbow.y * height + 20);
        ctx.shadowBlur = 0;
      }
    }
  }
}
