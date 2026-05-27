import { useRef, useEffect, useState, useCallback } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import {
  computeSquatMetrics,
  computeCurlMetrics,
  scoreSquatRep,
  scoreCurlRep,
  drawSkeleton,
  type SquatMetrics,
  type CurlMetrics,
  type CurlArmPhase,
  type ExerciseMode,
  type Landmark,
} from "@/lib/poseUtils";
import { SidePanel } from "@/components/SidePanel";
import { SummaryCard } from "@/components/SummaryCard";
import type { SetSummary } from "@/lib/gemini";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { Dumbbell } from "lucide-react";

type AppState = "idle" | "loading" | "ready" | "tracking" | "summary";

const DEFAULT_SQUAT: SquatMetrics = {
  leftKneeAngle: 180, rightKneeAngle: 180,
  leftHipAngle: 180,  rightHipAngle: 180,
  hipBelowKnee: false, backRounded: false,
  kneesCaringIn: false, forwardLean: false,
  torsoAngleDeg: 0, kneeCaveRatio: 1,
  formScore: 100, isActivePhase: false, phase: "standing",
};

const DEFAULT_CURL: CurlMetrics & { leftRepComplete: boolean; rightRepComplete: boolean } = {
  leftElbowAngle: 180, rightElbowAngle: 180,
  leftShoulderAngle: 90, rightShoulderAngle: 90,
  leftElbowSwing: false, rightElbowSwing: false,
  leftElbowTilt: 0, rightElbowTilt: 0,
  leftFullRange: false, rightFullRange: false,
  bodySway: false, formScore: 100, isActivePhase: false,
  leftPhase: "rest", rightPhase: "rest",
  leftRepComplete: false, rightRepComplete: false,
};

export default function SquatTracker() {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animFrameRef  = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  const [appState, setAppState]     = useState<AppState>("idle");
  const [exercise, setExercise]     = useState<ExerciseMode>("squat");
  const [squatMetrics, setSquatMetrics] = useState<SquatMetrics>(DEFAULT_SQUAT);
  const [curlMetrics, setCurlMetrics]   = useState(DEFAULT_CURL);
  const [repCount, setRepCount]     = useState(0);
  const [showWarning, setShowWarning]   = useState<string | null>(null);
  const [summary, setSummary]       = useState<SetSummary | null>(null);

  // ── Squat session state ────────────────────────────────────────────────────
  // repScores: one score per COMPLETED REP (not per frame)
  const squatSessionRef = useRef({
    repScores:        [] as number[],   // per-rep scores only
    repCount:         0,
    deepReps:         0,
    backRoundedCount: 0,
    kneeCaveCount:    0,
    forwardLeanCount: 0,
    lastPhase: "standing" as SquatMetrics["phase"],
    bottomReached: false,
    // Per-rep worst-case trackers
    repHadBackRound:  false,
    repHadKneeCave:   false,
    repHadForwardLean:false,
    repReachedDepth:  false,
    repMaxTorsoAngle: 0,
    repMinKneeCaveRatio: 1,
    repMinHipKneeGap:   1,   // positive = hip above knee; goes negative when depth hit
    // Live form score (only during active phase)
    liveFormScore: 100,
    warningTimer: 0,
  });

  // ── Curl session state ─────────────────────────────────────────────────────
  const curlSessionRef = useRef({
    repScores:        [] as number[],
    leftReps:         0,
    rightReps:        0,
    elbowSwingReps:   0,
    shortRangeReps:   0,
    bodySwayCurlCount:0,
    leftPhase:  "rest" as CurlArmPhase,
    rightPhase: "rest" as CurlArmPhase,
    leftPeak:  { value: false },
    rightPeak: { value: false },
    // Per-rep worst-case
    repHadLeftSwing:  false,
    repHadRightSwing: false,
    repHadBodySway:   false,
    repLeftPeak:      false,
    repRightPeak:     false,
    repMaxLeftTilt:   0,
    repMaxRightTilt:  0,
    repMinLeftAngle:  180,
    repMinRightAngle: 180,
    liveFormScore: 100,
    warningTimer: 0,
  });

  const exerciseRef = useRef<ExerciseMode>(exercise);
  useEffect(() => { exerciseRef.current = exercise; }, [exercise]);

  // ── Load model ──────────────────────────────────────────────────────────────
  const loadPoseLandmarker = useCallback(async () => {
    setAppState("loading");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    setAppState("ready");
  }, []);

  // ── Start camera ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (!landmarkerRef.current) await loadPoseLandmarker();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" },
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    squatSessionRef.current = {
      repScores: [], repCount: 0, deepReps: 0,
      backRoundedCount: 0, kneeCaveCount: 0, forwardLeanCount: 0,
      lastPhase: "standing", bottomReached: false,
      repHadBackRound: false, repHadKneeCave: false, repHadForwardLean: false,
      repReachedDepth: false, repMaxTorsoAngle: 0,
      repMinKneeCaveRatio: 1, repMinHipKneeGap: 1,
      liveFormScore: 100, warningTimer: 0,
    };
    curlSessionRef.current = {
      repScores: [], leftReps: 0, rightReps: 0,
      elbowSwingReps: 0, shortRangeReps: 0, bodySwayCurlCount: 0,
      leftPhase: "rest", rightPhase: "rest",
      leftPeak: { value: false }, rightPeak: { value: false },
      repHadLeftSwing: false, repHadRightSwing: false, repHadBodySway: false,
      repLeftPeak: false, repRightPeak: false,
      repMaxLeftTilt: 0, repMaxRightTilt: 0,
      repMinLeftAngle: 180, repMinRightAngle: 180,
      liveFormScore: 100, warningTimer: 0,
    };

    setRepCount(0);
    setSquatMetrics(DEFAULT_SQUAT);
    setCurlMetrics(DEFAULT_CURL);
    setShowWarning(null);
    lastVideoTimeRef.current = -1;
    setAppState("tracking");
  }, [loadPoseLandmarker]);

  // ── Stop camera ─────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  // ── End set ─────────────────────────────────────────────────────────────────
  const endSet = useCallback(() => {
    stopCamera();
    const ex = exerciseRef.current;

    if (ex === "squat") {
      const s = squatSessionRef.current;
      const total = s.repCount;
      // Average of PER-REP scores — never inflated by idle frames
      const avg = s.repScores.length > 0
        ? Math.round(s.repScores.reduce((a, b) => a + b, 0) / s.repScores.length)
        : 0;
      setSummary({
        exercise: "squat", reps: total, totalReps: total, avgFormScore: avg,
        deepReps: s.deepReps,
        backRoundedCount: s.backRoundedCount,
        kneeCaveCount: s.kneeCaveCount,
        forwardLeanCount: s.forwardLeanCount,
      });
    } else {
      const c = curlSessionRef.current;
      const total = c.leftReps + c.rightReps;
      const avg = c.repScores.length > 0
        ? Math.round(c.repScores.reduce((a, b) => a + b, 0) / c.repScores.length)
        : 0;
      setSummary({
        exercise: "curl", reps: total, totalReps: total, avgFormScore: avg,
        leftReps: c.leftReps, rightReps: c.rightReps,
        elbowSwingCount: c.elbowSwingReps,
        shortRangeCount: c.shortRangeReps,
        bodySwayCurlCount: c.bodySwayCurlCount,
      });
    }
    setAppState("summary");
  }, [stopCamera]);

  const resetForNewSet = useCallback(() => {
    setSummary(null);
    setAppState("idle");
    setRepCount(0);
    setSquatMetrics(DEFAULT_SQUAT);
    setCurlMetrics(DEFAULT_CURL);
    setShowWarning(null);
  }, []);

  // ── Detection loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (appState !== "tracking") return;

    let sqState = { ...DEFAULT_SQUAT };
    let cqState = { ...DEFAULT_CURL };

    const detect = () => {
      const video    = videoRef.current;
      const canvas   = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !canvas || !landmarker || video.paused || video.ended) {
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      if (video.currentTime === lastVideoTimeRef.current) {
        animFrameRef.current = requestAnimationFrame(detect);
        return;
      }
      lastVideoTimeRef.current = video.currentTime;

      const result = landmarker.detectForVideo(video, performance.now());
      const ctx = canvas.getContext("2d");
      if (!ctx) { animFrameRef.current = requestAnimationFrame(detect); return; }

      canvas.width  = video.videoWidth  || 1280;
      canvas.height = video.videoHeight || 720;

      const ex = exerciseRef.current;

      if (result.landmarks && result.landmarks.length > 0) {
        const lms = result.landmarks[0] as Landmark[];

        if (ex === "squat") {
          // ── SQUAT ─────────────────────────────────────────────────────────
          sqState = computeSquatMetrics(lms, sqState.phase);
          drawSkeleton(ctx, lms, canvas.width, canvas.height, "squat", sqState, null);

          const s = squatSessionRef.current;
          const currPhase = sqState.phase;

          // Only accumulate worst-case data during active phases
          if (sqState.isActivePhase) {
            if (sqState.backRounded)   s.repHadBackRound   = true;
            if (sqState.kneesCaringIn) s.repHadKneeCave    = true;
            if (sqState.forwardLean)   s.repHadForwardLean = true;

            // Track worst values for proportional scoring
            s.repMaxTorsoAngle    = Math.max(s.repMaxTorsoAngle, sqState.torsoAngleDeg);
            s.repMinKneeCaveRatio = Math.min(s.repMinKneeCaveRatio, sqState.kneeCaveRatio);

            // Track depth: hipY - kneeY (positive = hip above knee, negative = below)
            const midHipY  = (lms[23]?.y + lms[24]?.y) / 2;
            const midKneeY = (lms[25]?.y + lms[26]?.y) / 2;
            const hipKneeGap = midHipY - midKneeY; // positive = hip below knee
            s.repMinHipKneeGap = Math.max(s.repMinHipKneeGap, hipKneeGap); // track best depth
            if (hipKneeGap > 0) s.repReachedDepth = true;

            // Live form score (only during movement — drives the ring)
            s.liveFormScore = sqState.formScore;
          } else {
            s.liveFormScore = 100; // looks fine when standing
          }

          if (currPhase === "bottom") s.bottomReached = true;

          // Rep completion: ascending → standing
          if (s.lastPhase === "ascending" && currPhase === "standing" && s.bottomReached) {
            s.repCount++;

            // Score THIS rep based on what happened during it
            const repScore = scoreSquatRep({
              hadBackRound:      s.repHadBackRound,
              hadKneeCave:       s.repHadKneeCave,
              reachedDepth:      s.repReachedDepth,
              hadForwardLean:    s.repHadForwardLean,
              maxTorsoAngle:     s.repMaxTorsoAngle,
              minKneeCaveRatio:  s.repMinKneeCaveRatio,
              minHipKneeGap:     -(s.repMinHipKneeGap), // negate: negative = short of parallel
            });
            s.repScores.push(repScore);

            // Accumulate set-level flags
            if (s.repReachedDepth) s.deepReps++;
            if (s.repHadBackRound)   s.backRoundedCount++;
            if (s.repHadKneeCave)    s.kneeCaveCount++;
            if (s.repHadForwardLean) s.forwardLeanCount++;

            // Reset per-rep trackers
            s.bottomReached       = false;
            s.repHadBackRound     = false;
            s.repHadKneeCave      = false;
            s.repHadForwardLean   = false;
            s.repReachedDepth     = false;
            s.repMaxTorsoAngle    = 0;
            s.repMinKneeCaveRatio = 1;
            s.repMinHipKneeGap    = -1; // reset to "haven't reached depth"

            setRepCount(s.repCount);
          }
          s.lastPhase = currPhase;

          // "Go Deeper!" — descending/bottom but hip not below knee
          const avgKnee = (sqState.leftKneeAngle + sqState.rightKneeAngle) / 2;
          if ((currPhase === "descending" || currPhase === "bottom") && !sqState.hipBelowKnee && avgKnee < 125) {
            s.warningTimer++;
            if (s.warningTimer > 8) setShowWarning("Go Deeper!");
          } else {
            s.warningTimer = 0;
            setShowWarning(null);
          }

          setSquatMetrics({ ...sqState, formScore: s.liveFormScore });

        } else {
          // ── BICEP CURL ────────────────────────────────────────────────────
          const c = curlSessionRef.current;
          cqState = computeCurlMetrics(
            lms, c.leftPhase, c.rightPhase,
            c.leftPeak, c.rightPeak
          );
          drawSkeleton(ctx, lms, canvas.width, canvas.height, "curl", null, cqState);

          c.leftPhase  = cqState.leftPhase;
          c.rightPhase = cqState.rightPhase;

          // Only accumulate worst-case during active phases
          if (cqState.isActivePhase) {
            if (cqState.leftElbowSwing)  c.repHadLeftSwing  = true;
            if (cqState.rightElbowSwing) c.repHadRightSwing = true;
            if (cqState.bodySway)        c.repHadBodySway   = true;
            if (cqState.leftPeak  || cqState.leftElbowAngle  < 65) c.repLeftPeak  = true;
            if (cqState.rightPeak || cqState.rightElbowAngle < 65) c.repRightPeak = true;

            c.repMaxLeftTilt   = Math.max(c.repMaxLeftTilt,   cqState.leftElbowTilt);
            c.repMaxRightTilt  = Math.max(c.repMaxRightTilt,  cqState.rightElbowTilt);
            c.repMinLeftAngle  = Math.min(c.repMinLeftAngle,  cqState.leftElbowAngle);
            c.repMinRightAngle = Math.min(c.repMinRightAngle, cqState.rightElbowAngle);

            c.liveFormScore = cqState.formScore;
          } else {
            c.liveFormScore = 100;
          }

          // Left rep completion
          if (cqState.leftRepComplete) {
            c.leftReps++;
            const repScore = scoreCurlRep({
              hadLeftSwing:  c.repHadLeftSwing,
              hadRightSwing: false,
              hadBodySway:   c.repHadBodySway,
              reachedPeak:   c.repLeftPeak,
              maxLeftTilt:   c.repMaxLeftTilt,
              maxRightTilt:  0,
              minElbowAngle: c.repMinLeftAngle,
            });
            c.repScores.push(repScore);
            if (c.repHadLeftSwing) c.elbowSwingReps++;
            if (!c.repLeftPeak)    c.shortRangeReps++;
            if (c.repHadBodySway)  c.bodySwayCurlCount++;
            // Reset left-side trackers
            c.repHadLeftSwing  = false;
            c.repHadBodySway   = false;
            c.repLeftPeak      = false;
            c.repMaxLeftTilt   = 0;
            c.repMinLeftAngle  = 180;
            setRepCount(c.leftReps + c.rightReps);
          }

          // Right rep completion
          if (cqState.rightRepComplete) {
            c.rightReps++;
            const repScore = scoreCurlRep({
              hadLeftSwing:  false,
              hadRightSwing: c.repHadRightSwing,
              hadBodySway:   c.repHadBodySway,
              reachedPeak:   c.repRightPeak,
              maxLeftTilt:   0,
              maxRightTilt:  c.repMaxRightTilt,
              minElbowAngle: c.repMinRightAngle,
            });
            c.repScores.push(repScore);
            if (c.repHadRightSwing) c.elbowSwingReps++;
            if (!c.repRightPeak)    c.shortRangeReps++;
            if (c.repHadBodySway)   c.bodySwayCurlCount++;
            // Reset right-side trackers
            c.repHadRightSwing = false;
            c.repHadBodySway   = false;
            c.repRightPeak     = false;
            c.repMaxRightTilt  = 0;
            c.repMinRightAngle = 180;
            setRepCount(c.leftReps + c.rightReps);
          }

          // "Full Range!" warning
          const leftStalled  = cqState.leftPhase  === "curling" && cqState.leftElbowAngle  > 95;
          const rightStalled = cqState.rightPhase === "curling" && cqState.rightElbowAngle > 95;
          if (leftStalled || rightStalled) {
            c.warningTimer++;
            if (c.warningTimer > 15) setShowWarning("Full Range!");
          } else {
            c.warningTimer = 0;
            setShowWarning(null);
          }

          setCurlMetrics({ ...cqState, formScore: c.liveFormScore });
        }
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      animFrameRef.current = requestAnimationFrame(detect);
    };

    animFrameRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [appState]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const isTracking = appState === "tracking";
  const isCurl     = exercise === "curl";
  const liveScore  = isCurl ? curlMetrics.formScore : squatMetrics.formScore;

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden">
      {/* Video area */}
      <div className="flex-1 relative flex flex-col overflow-hidden">
        <div className="relative flex-1 bg-black overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            muted playsInline
            data-testid="webcam-video"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            data-testid="pose-canvas"
          />

          {/* Idle / loading overlay */}
          {!isTracking && appState !== "summary" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/65">
              {appState === "loading" ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-green-400 animate-spin" style={{ filter: "drop-shadow(0 0 8px #4ade80)" }} />
                  <p className="text-green-400 font-semibold text-sm tracking-wide">Loading pose model…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-5">
                  <div className="flex gap-3">
                    <ExercisePicker label="Squat"      icon="🦵" active={!isCurl} onClick={() => setExercise("squat")} />
                    <ExercisePicker label="Bicep Curl" icon="💪" active={isCurl}  onClick={() => setExercise("curl")}  />
                  </div>
                  <div
                    className="w-20 h-20 rounded-full border-2 border-green-400 flex items-center justify-center"
                    style={{ boxShadow: "0 0 30px rgba(74,222,128,0.3)" }}
                  >
                    <Camera className="w-8 h-8 text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold text-lg">Ready to Track</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      {isCurl
                        ? "Face the camera so both arms are clearly visible"
                        : "Position yourself so your full body is visible from the side"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Warning banner */}
          {isTracking && showWarning && (
            <div
              className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl border-2 border-red-400 bg-red-500/20 backdrop-blur-sm warn-glow"
              data-testid="warning-banner"
            >
              <span className="text-red-400 font-black text-xl tracking-wide" style={{ textShadow: "0 0 10px rgba(239,68,68,0.8)" }}>
                {showWarning}
              </span>
            </div>
          )}

          {/* Exercise badge */}
          {isTracking && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/50 border border-green-400/20">
              <Dumbbell className="w-3 h-3 text-green-400" />
              <span className="text-xs font-bold text-green-400">{isCurl ? "Bicep Curl" : "Squat"}</span>
            </div>
          )}

          {/* Per-frame form issue alerts */}
          {isTracking && (
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
              {isCurl ? (
                <>
                  {curlMetrics.leftElbowSwing  && <FormAlert text="⚠ Left Elbow Swinging"  testId="left-swing-warning"  color="orange" />}
                  {curlMetrics.rightElbowSwing && <FormAlert text="⚠ Right Elbow Swinging" testId="right-swing-warning" color="orange" />}
                  {curlMetrics.bodySway        && <FormAlert text="⚠ Body Swaying"          testId="body-sway-warning"   color="orange" />}
                </>
              ) : (
                <>
                  {squatMetrics.backRounded   && <FormAlert text="⚠ Back Rounding"    testId="back-warning" color="orange" />}
                  {squatMetrics.kneesCaringIn && <FormAlert text="⚠ Knees Caving In"  testId="knee-warning" color="red"    />}
                  {squatMetrics.forwardLean   && <FormAlert text="⚠ Excessive Lean"   testId="lean-warning" color="orange" />}
                </>
              )}
            </div>
          )}

          {!isTracking && appState === "idle" && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/50">
              <CameraOff className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Camera off</span>
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      <div className="w-72 border-l border-border bg-background flex flex-col p-4 gap-4 flex-shrink-0">
        <SidePanel
          exercise={exercise}
          repCount={repCount}
          formScore={liveScore}
          isTracking={isTracking}
          onEndSet={endSet}
          onStart={startCamera}
          onChangeExercise={() => setExercise(isCurl ? "squat" : "curl")}
          squatPhase={squatMetrics.phase}
          backRounded={squatMetrics.backRounded}
          kneesCaringIn={squatMetrics.kneesCaringIn}
          forwardLean={squatMetrics.forwardLean}
          leftKneeAngle={squatMetrics.leftKneeAngle}
          rightKneeAngle={squatMetrics.rightKneeAngle}
          leftElbowAngle={curlMetrics.leftElbowAngle}
          rightElbowAngle={curlMetrics.rightElbowAngle}
          leftPhase={curlMetrics.leftPhase}
          rightPhase={curlMetrics.rightPhase}
          leftElbowSwing={curlMetrics.leftElbowSwing}
          rightElbowSwing={curlMetrics.rightElbowSwing}
          bodySway={curlMetrics.bodySway}
          leftReps={curlSessionRef.current.leftReps}
          rightReps={curlSessionRef.current.rightReps}
        />
      </div>

      {/* Summary */}
      {appState === "summary" && summary && (
        <SummaryCard summary={summary} onReset={resetForNewSet} />
      )}
    </div>
  );
}

function ExercisePicker({ label, icon, active, onClick }: {
  label: string; icon: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl border-2 font-bold text-sm transition-all
        ${active
          ? "border-green-400 bg-green-400/15 text-green-400"
          : "border-white/10 bg-white/5 text-white/50 hover:border-white/30 hover:text-white/70"
        }`}
      style={active ? { boxShadow: "0 0 20px rgba(74,222,128,0.25)" } : {}}
      data-testid={`exercise-${label.toLowerCase().replace(" ", "-")}`}
    >
      <span className="text-2xl">{icon}</span>
      {label}
    </button>
  );
}

function FormAlert({ text, testId, color }: { text: string; testId: string; color: "orange" | "red" }) {
  const cls = color === "orange"
    ? "bg-orange-500/20 border-orange-400/50 text-orange-400"
    : "bg-red-500/20 border-red-400/50 text-red-400";
  return (
    <div className={`px-3 py-1.5 rounded-lg border backdrop-blur-sm ${cls}`} data-testid={testId}>
      <span className="text-xs font-bold">{text}</span>
    </div>
  );
}
