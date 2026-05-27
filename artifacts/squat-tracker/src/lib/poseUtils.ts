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

// ─── Squat connections ────────────────────────────────────────────────────────
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

// ─── Curl: upper-body connections only ───────────────────────────────────────
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
  forwardLean: boolean;       // excessive torso lean
  torsoAngleDeg: number;      // raw degrees for display
  kneeCaveRatio: number;      // knee/foot width ratio for display
  formScore: number;          // real-time display score
  isActivePhase: boolean;     // true when moving — used to gate score recording
  phase: "standing" | "descending" | "bottom" | "ascending";
}

// Thresholds — deliberately strict
const SQUAT_BACK_ROUND_WARN  = 18;  // degrees from vertical before flagging
const SQUAT_BACK_ROUND_MAX   = 40;  // degrees at which full penalty applies
const SQUAT_KNEE_CAVE_RATIO  = 0.88; // knee width / foot width — below this = caving
const SQUAT_FORWARD_LEAN_DEG = 50;  // hip→shoulder angle below this = too far forward

export function computeSquatMetrics(
  landmarks: Landmark[],
  prevPhase: SquatMetrics["phase"]
): SquatMetrics {
  const lShoulder = landmarks[11];
  const rShoulder = landmarks[12];
  const lHip      = landmarks[23];
  const rHip      = landmarks[24];
  const lKnee     = landmarks[25];
  const rKnee     = landmarks[26];
  const lAnkle    = landmarks[27];
  const rAnkle    = landmarks[28];
  const lFoot     = landmarks[31];
  const rFoot     = landmarks[32];

  const leftKneeAngle  = calculateAngle(lHip, lKnee, lAnkle);
  const rightKneeAngle = calculateAngle(rHip, rKnee, rAnkle);
  const leftHipAngle   = calculateAngle(lShoulder, lHip, lKnee);
  const rightHipAngle  = calculateAngle(rShoulder, rHip, rKnee);
  const avgKneeAngle   = (leftKneeAngle + rightKneeAngle) / 2;

  // ── Phase ──────────────────────────────────────────────────────────────────
  let phase: SquatMetrics["phase"] = prevPhase;
  if (avgKneeAngle > 160) {
    phase = "standing";
  } else if (avgKneeAngle <= 160 && avgKneeAngle > 100) {
    if (prevPhase === "standing") phase = "descending";
    else if (prevPhase === "bottom") phase = "ascending";
  } else {
    phase = "bottom";
  }
  const isActivePhase = phase !== "standing";

  // ── Hip below knee ─────────────────────────────────────────────────────────
  const midHipY  = (lHip.y  + rHip.y)  / 2;
  const midKneeY = (lKnee.y + rKnee.y) / 2;
  const hipBelowKnee = midHipY > midKneeY;

  // ── Back rounding: torso tilt from vertical ────────────────────────────────
  const midShoulderX = (lShoulder.x + rShoulder.x) / 2;
  const midShoulderY = (lShoulder.y + rShoulder.y) / 2;
  const midHipX      = (lHip.x + rHip.x) / 2;
  const midHipY2     = (lHip.y + rHip.y) / 2;
  const torsoAngleDeg = Math.abs(
    Math.atan2(midShoulderX - midHipX, midHipY2 - midShoulderY) * 180 / Math.PI
  );
  const backRounded = torsoAngleDeg > SQUAT_BACK_ROUND_WARN;

  // ── Knee cave: knee width vs foot width ────────────────────────────────────
  const kneeWidth  = Math.abs(lKnee.x - rKnee.x);
  const footWidth  = Math.abs((lFoot?.x ?? lAnkle.x) - (rFoot?.x ?? rAnkle.x));
  const kneeCaveRatio  = footWidth > 0.001 ? kneeWidth / footWidth : 1;
  const kneesCaringIn  = kneeCaveRatio < SQUAT_KNEE_CAVE_RATIO;

  // ── Forward lean: torso too horizontal ────────────────────────────────────
  // Use hip-to-shoulder vector angle from vertical
  const dx = midShoulderX - midHipX;
  const dy = midHipY2 - midShoulderY; // positive = shoulders above hips (normal)
  const torsoFromVertical = Math.atan2(Math.abs(dx), Math.max(dy, 0.001)) * 180 / Math.PI;
  const forwardLean = torsoFromVertical > SQUAT_FORWARD_LEAN_DEG;

  // ── Real-time form score (for the ring — recorded only in active phase) ────
  // This is BRUTAL: every issue stacks, and severity matters
  let formScore = 100;

  if (isActivePhase) {
    // Back rounding: proportional — even slight rounding costs points
    if (torsoAngleDeg > SQUAT_BACK_ROUND_WARN) {
      const severity = Math.min(1, (torsoAngleDeg - SQUAT_BACK_ROUND_WARN) / (SQUAT_BACK_ROUND_MAX - SQUAT_BACK_ROUND_WARN));
      formScore -= Math.round(severity * 40);
    }

    // Knee cave: proportional
    if (kneesCaringIn) {
      const severity = Math.min(1, (SQUAT_KNEE_CAVE_RATIO - kneeCaveRatio) / SQUAT_KNEE_CAVE_RATIO);
      formScore -= Math.round(10 + severity * 30);
    }

    // Depth penalty: at the bottom, must hit parallel
    if (phase === "bottom" && !hipBelowKnee) {
      // How far above parallel?
      const depthGap = midKneeY - midHipY; // positive = hip still above knee
      const severity = Math.min(1, depthGap / 0.06);
      formScore -= Math.round(severity * 35);
    }

    // Forward lean
    if (forwardLean) {
      const severity = Math.min(1, (torsoFromVertical - SQUAT_FORWARD_LEAN_DEG) / 20);
      formScore -= Math.round(10 + severity * 20);
    }

    // Asymmetric knees (one leg compensating)
    const kneeDiff = Math.abs(leftKneeAngle - rightKneeAngle);
    if (kneeDiff > 15) {
      formScore -= Math.round(Math.min(15, (kneeDiff - 15) / 2));
    }
  }

  formScore = Math.max(0, Math.min(100, formScore));

  return {
    leftKneeAngle,
    rightKneeAngle,
    leftHipAngle,
    rightHipAngle,
    hipBelowKnee,
    backRounded,
    kneesCaringIn,
    forwardLean,
    torsoAngleDeg,
    kneeCaveRatio,
    formScore,
    isActivePhase,
    phase,
  };
}

// ─── Per-rep squat score (called once per completed rep) ──────────────────────
export function scoreSquatRep(flags: {
  hadBackRound: boolean;
  hadKneeCave: boolean;
  reachedDepth: boolean;
  hadForwardLean: boolean;
  maxTorsoAngle: number;
  minKneeCaveRatio: number;
  minHipKneeGap: number; // negative = hip went below knee (good)
}): number {
  let score = 100;

  // Back rounding (proportional to worst angle in rep)
  if (flags.hadBackRound) {
    const severity = Math.min(1, (flags.maxTorsoAngle - SQUAT_BACK_ROUND_WARN) / (SQUAT_BACK_ROUND_MAX - SQUAT_BACK_ROUND_WARN));
    score -= Math.round(15 + severity * 35);
  }

  // Knee cave
  if (flags.hadKneeCave) {
    const severity = Math.min(1, (SQUAT_KNEE_CAVE_RATIO - flags.minKneeCaveRatio) / SQUAT_KNEE_CAVE_RATIO);
    score -= Math.round(15 + severity * 25);
  }

  // Depth — biggest penalty of all if you didn't hit parallel
  if (!flags.reachedDepth) {
    // How far short of parallel?
    const howShort = Math.max(0, flags.minHipKneeGap); // positive = never passed parallel
    const severity = Math.min(1, howShort / 0.05);
    score -= Math.round(20 + severity * 30);
  }

  // Forward lean
  if (flags.hadForwardLean) score -= 15;

  return Math.max(0, Math.min(100, score));
}

// ═════════════════════════════════════════════════════════════════════════════
// BICEP CURL
// ═════════════════════════════════════════════════════════════════════════════

export type CurlArmPhase = "rest" | "curling" | "peak" | "returning";

export interface CurlMetrics {
  leftElbowAngle: number;
  rightElbowAngle: number;
  leftShoulderAngle: number;
  rightShoulderAngle: number;
  leftElbowSwing: boolean;
  rightElbowSwing: boolean;
  leftElbowTilt: number;    // raw degrees for display
  rightElbowTilt: number;
  leftFullRange: boolean;
  rightFullRange: boolean;
  bodySway: boolean;
  formScore: number;
  isActivePhase: boolean;
  leftPhase: CurlArmPhase;
  rightPhase: CurlArmPhase;
}

// Strict curl thresholds
const CURL_SWING_WARN = 20;  // degrees upper-arm tilt before flagging
const CURL_SWING_MAX  = 50;
const CURL_PEAK_THRESH = 65; // must get this low for full contraction
const CURL_REST_THRESH = 150;
const CURL_START_THRESH = 130;

function upperArmForwardTilt(shoulder: Landmark, elbow: Landmark): number {
  const dx = elbow.x - shoulder.x;
  const dy = elbow.y - shoulder.y;
  return Math.atan2(Math.abs(dx), Math.max(dy, 0.001)) * 180 / Math.PI;
}

function nextCurlPhase(
  prev: CurlArmPhase,
  angle: number,
  peakReached: { value: boolean }
): { phase: CurlArmPhase; peakReached: boolean; repComplete: boolean } {
  let phase = prev;
  let repComplete = false;

  switch (prev) {
    case "rest":
      if (angle < CURL_START_THRESH) phase = "curling";
      break;
    case "curling":
      if (angle < CURL_PEAK_THRESH) {
        phase = "peak";
        peakReached.value = true;
      } else if (angle > CURL_REST_THRESH) {
        // Gave up before reaching peak
        phase = "rest";
        peakReached.value = false;
      }
      break;
    case "peak":
      if (angle > CURL_START_THRESH) phase = "returning";
      break;
    case "returning":
      if (angle > CURL_REST_THRESH) {
        if (peakReached.value) repComplete = true;
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
  const lElbow    = landmarks[13];
  const rElbow    = landmarks[14];
  const lWrist    = landmarks[15];
  const rWrist    = landmarks[16];
  const lHip      = landmarks[23];
  const rHip      = landmarks[24];

  const leftElbowAngle  = lShoulder && lElbow && lWrist ? calculateAngle(lShoulder, lElbow, lWrist) : 180;
  const rightElbowAngle = rShoulder && rElbow && rWrist ? calculateAngle(rShoulder, rElbow, rWrist) : 180;

  const leftElbowTilt  = lShoulder && lElbow ? upperArmForwardTilt(lShoulder, lElbow) : 0;
  const rightElbowTilt = rShoulder && rElbow ? upperArmForwardTilt(rShoulder, rElbow) : 0;
  const leftElbowSwing  = leftElbowTilt  > CURL_SWING_WARN;
  const rightElbowSwing = rightElbowTilt > CURL_SWING_WARN;

  const leftShoulderAngle  = lHip && lShoulder && lElbow ? calculateAngle(lHip, lShoulder, lElbow) : 90;
  const rightShoulderAngle = rHip && rShoulder && rElbow ? calculateAngle(rHip, rShoulder, rElbow) : 90;

  // Body sway: torso should stay vertical — check shoulder vs hip lateral drift
  const shoulderMidX = lShoulder && rShoulder ? (lShoulder.x + rShoulder.x) / 2 : 0.5;
  const hipMidX      = lHip && rHip           ? (lHip.x + rHip.x) / 2           : 0.5;
  const bodySway = Math.abs(shoulderMidX - hipMidX) > 0.08;

  const leftResult  = nextCurlPhase(prevLeft,  leftElbowAngle,  leftPeakRef);
  const rightResult = nextCurlPhase(prevRight, rightElbowAngle, rightPeakRef);

  const leftFullRange  = leftResult.peakReached  || leftElbowAngle  < CURL_PEAK_THRESH;
  const rightFullRange = rightResult.peakReached || rightElbowAngle < CURL_PEAK_THRESH;

  const isActivePhase =
    leftResult.phase !== "rest" || rightResult.phase !== "rest";

  // ── Real-time form score ────────────────────────────────────────────────────
  let formScore = 100;

  if (isActivePhase) {
    // Left elbow swing — proportional
    if (leftElbowSwing) {
      const severity = Math.min(1, (leftElbowTilt - CURL_SWING_WARN) / (CURL_SWING_MAX - CURL_SWING_WARN));
      formScore -= Math.round(15 + severity * 30);
    }
    // Right elbow swing — proportional
    if (rightElbowSwing) {
      const severity = Math.min(1, (rightElbowTilt - CURL_SWING_WARN) / (CURL_SWING_MAX - CURL_SWING_WARN));
      formScore -= Math.round(15 + severity * 30);
    }
    // Body sway
    if (bodySway) formScore -= 25;

    // Partial range penalty — if curling and still far from peak
    if (leftResult.phase === "curling" && leftElbowAngle > 100) {
      formScore -= Math.round((leftElbowAngle - 100) / 30 * 15);
    }
    if (rightResult.phase === "curling" && rightElbowAngle > 100) {
      formScore -= Math.round((rightElbowAngle - 100) / 30 * 15);
    }
  }

  formScore = Math.max(0, Math.min(100, formScore));

  return {
    leftElbowAngle,
    rightElbowAngle,
    leftShoulderAngle,
    rightShoulderAngle,
    leftElbowSwing,
    rightElbowSwing,
    leftElbowTilt,
    rightElbowTilt,
    leftFullRange,
    rightFullRange,
    bodySway,
    formScore,
    isActivePhase,
    leftPhase:  leftResult.phase,
    rightPhase: rightResult.phase,
    leftRepComplete:  leftResult.repComplete,
    rightRepComplete: rightResult.repComplete,
  };
}

// ─── Per-rep curl score ────────────────────────────────────────────────────────
export function scoreCurlRep(flags: {
  hadLeftSwing: boolean;
  hadRightSwing: boolean;
  hadBodySway: boolean;
  reachedPeak: boolean;
  maxLeftTilt: number;
  maxRightTilt: number;
  minElbowAngle: number; // lowest angle reached
}): number {
  let score = 100;

  if (flags.hadLeftSwing) {
    const severity = Math.min(1, (flags.maxLeftTilt - CURL_SWING_WARN) / (CURL_SWING_MAX - CURL_SWING_WARN));
    score -= Math.round(10 + severity * 30);
  }
  if (flags.hadRightSwing) {
    const severity = Math.min(1, (flags.maxRightTilt - CURL_SWING_WARN) / (CURL_SWING_MAX - CURL_SWING_WARN));
    score -= Math.round(10 + severity * 30);
  }
  if (flags.hadBodySway) score -= 20;
  if (!flags.reachedPeak) {
    // Penalty for not reaching full contraction
    const shortfall = Math.max(0, flags.minElbowAngle - CURL_PEAK_THRESH);
    score -= Math.round(10 + Math.min(1, shortfall / 40) * 30);
  }

  return Math.max(0, Math.min(100, score));
}

// ═════════════════════════════════════════════════════════════════════════════
// DRAWING
// ═════════════════════════════════════════════════════════════════════════════

const NEON_GREEN    = "#4ade80";
const WARNING_RED   = "#ef4444";
const WARNING_ORANGE = "#f97316";
const JOINT_WHITE   = "#ffffff";
const DIM_COLOR     = "rgba(255,255,255,0.12)";

function drawBone(
  ctx: CanvasRenderingContext2D,
  a: Landmark, b: Landmark,
  w: number, h: number,
  color: string, lineWidth = 3
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
  lm: Landmark, w: number, h: number,
  color = JOINT_WHITE, radius = 5
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
  joint: Landmark, angle: number,
  w: number, h: number, color: string
) {
  ctx.beginPath();
  ctx.arc(joint.x * w, joint.y * h, 22, 0, (angle / 180) * Math.PI);
  ctx.strokeStyle = color + "80";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function angleLabel(
  ctx: CanvasRenderingContext2D,
  lm: Landmark, angle: number, label: string,
  w: number, h: number,
  color = NEON_GREEN, offsetX = 10, offsetY = -10
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
  width: number, height: number,
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
      const isLeg = [[23,25],[25,27],[24,26],[26,28]].some(([x,y])=>x===i&&y===j);
      const isBack = [[11,23],[12,24],[11,12]].some(([x,y])=>x===i&&y===j);
      if (isLeg && squatMetrics.kneesCaringIn) color = WARNING_RED;
      if (isBack && (squatMetrics.backRounded || squatMetrics.forwardLean)) color = WARNING_ORANGE;
    }

    if (mode === "curl" && curlMetrics) {
      const isLeftArm  = [[11,13],[13,15],[15,17],[15,19],[15,21]].some(([x,y])=>x===i&&y===j);
      const isRightArm = [[12,14],[14,16],[16,18],[16,20],[16,22]].some(([x,y])=>x===i&&y===j);
      const isCore     = [[11,23],[12,24],[23,24]].some(([x,y])=>x===i&&y===j);
      if (isLeftArm  && curlMetrics.leftElbowSwing)  color = WARNING_ORANGE;
      if (isRightArm && curlMetrics.rightElbowSwing) color = WARNING_ORANGE;
      if (isCore) color = DIM_COLOR;
    }

    drawBone(ctx, a, b, width, height, color);
  }

  // Joints
  for (let idx = 0; idx < landmarks.length; idx++) {
    const lm = landmarks[idx];
    if (!lm || (lm.visibility ?? 1) < 0.25) continue;
    if (mode === "curl" && idx >= 25) continue;

    let jointColor = JOINT_WHITE;
    if (mode === "curl" && curlMetrics) {
      if ([13,15].includes(idx) && curlMetrics.leftElbowSwing)  jointColor = WARNING_ORANGE;
      if ([14,16].includes(idx) && curlMetrics.rightElbowSwing) jointColor = WARNING_ORANGE;
    }
    if (mode === "squat" && squatMetrics) {
      if ([25,26].includes(idx) && squatMetrics.kneesCaringIn) jointColor = WARNING_RED;
    }

    drawJoint(ctx, lm, width, height, jointColor);
  }

  // ── Squat labels ───────────────────────────────────────────────────────────
  if (mode === "squat" && squatMetrics) {
    if (landmarks[25]) angleLabel(ctx, landmarks[25], squatMetrics.leftKneeAngle, "L", width, height);
    if (landmarks[26]) angleLabel(ctx, landmarks[26], squatMetrics.rightKneeAngle, "R", width, height);
    // Torso angle hint
    if (landmarks[11]) {
      const col = squatMetrics.backRounded ? WARNING_ORANGE : NEON_GREEN;
      angleLabel(ctx, landmarks[11], squatMetrics.torsoAngleDeg, "torso", width, height, col, 10, -22);
    }
  }

  // ── Curl labels ────────────────────────────────────────────────────────────
  if (mode === "curl" && curlMetrics) {
    const lElbow = landmarks[13];
    const rElbow = landmarks[14];
    const leftColor  = curlMetrics.leftElbowSwing  ? WARNING_ORANGE : NEON_GREEN;
    const rightColor = curlMetrics.rightElbowSwing ? WARNING_ORANGE : NEON_GREEN;

    if (lElbow && (lElbow.visibility ?? 1) > 0.3) {
      drawAngleArc(ctx, lElbow, curlMetrics.leftElbowAngle, width, height, leftColor);
      angleLabel(ctx, lElbow, curlMetrics.leftElbowAngle, "L", width, height, leftColor, -65, -14);
    }
    if (rElbow && (rElbow.visibility ?? 1) > 0.3) {
      drawAngleArc(ctx, rElbow, curlMetrics.rightElbowAngle, width, height, rightColor);
      angleLabel(ctx, rElbow, curlMetrics.rightElbowAngle, "R", width, height, rightColor, 14, -14);
    }

    const phaseBadge = (p: CurlArmPhase) =>
      p === "curling" ? "↑" : p === "peak" ? "●" : p === "returning" ? "↓" : "";

    if (lElbow && (lElbow.visibility ?? 1) > 0.3) {
      const lbl = phaseBadge(curlMetrics.leftPhase);
      if (lbl) {
        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = leftColor;
        ctx.shadowBlur = 8; ctx.shadowColor = leftColor;
        ctx.fillText(lbl, lElbow.x * width - 65, lElbow.y * height + 22);
        ctx.shadowBlur = 0;
      }
    }
    if (rElbow && (rElbow.visibility ?? 1) > 0.3) {
      const lbl = phaseBadge(curlMetrics.rightPhase);
      if (lbl) {
        ctx.font = "bold 18px sans-serif";
        ctx.fillStyle = rightColor;
        ctx.shadowBlur = 8; ctx.shadowColor = rightColor;
        ctx.fillText(lbl, rElbow.x * width + 14, rElbow.y * height + 22);
        ctx.shadowBlur = 0;
      }
    }
  }
}
