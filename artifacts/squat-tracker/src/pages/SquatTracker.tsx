import { useRef, useEffect, useState, useCallback } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { computeSquatMetrics, drawSkeleton, type SquatMetrics, type Landmark } from "@/lib/poseUtils";
import { SidePanel } from "@/components/SidePanel";
import { SummaryCard } from "@/components/SummaryCard";
import type { SetSummary } from "@/lib/gemini";
import { Camera, CameraOff, Loader2 } from "lucide-react";

type AppState = "idle" | "loading" | "ready" | "tracking" | "summary";

const DEFAULT_METRICS: SquatMetrics = {
  leftKneeAngle: 180,
  rightKneeAngle: 180,
  leftHipAngle: 180,
  rightHipAngle: 180,
  hipBelowKnee: false,
  backRounded: false,
  kneesCaringIn: false,
  formScore: 100,
  phase: "standing",
};

export default function SquatTracker() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  const [appState, setAppState] = useState<AppState>("idle");
  const [metrics, setMetrics] = useState<SquatMetrics>(DEFAULT_METRICS);
  const [repCount, setRepCount] = useState(0);
  const [showDeepWarning, setShowDeepWarning] = useState(false);
  const [summary, setSummary] = useState<SetSummary | null>(null);

  // Tracking session data
  const sessionRef = useRef({
    formScores: [] as number[],
    deepReps: 0,
    backRoundedCount: 0,
    kneeCaveCount: 0,
    repCount: 0,
    lastPhase: "standing" as SquatMetrics["phase"],
    bottomReached: false,
    repHadBackRound: false,
    repHadKneeCave: false,
    deepWarningTimer: 0,
  });

  const loadPoseLandmarker = useCallback(async () => {
    setAppState("loading");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    setAppState("ready");
  }, []);

  const startCamera = useCallback(async () => {
    if (!landmarkerRef.current) await loadPoseLandmarker();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" },
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setAppState("tracking");
    sessionRef.current = {
      formScores: [],
      deepReps: 0,
      backRoundedCount: 0,
      kneeCaveCount: 0,
      repCount: 0,
      lastPhase: "standing",
      bottomReached: false,
      repHadBackRound: false,
      repHadKneeCave: false,
      deepWarningTimer: 0,
    };
    setRepCount(0);
    setMetrics(DEFAULT_METRICS);
    setShowDeepWarning(false);
  }, [loadPoseLandmarker]);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  const endSet = useCallback(() => {
    stopCamera();
    const s = sessionRef.current;
    const total = s.repCount;
    const avg = total > 0 && s.formScores.length > 0
      ? Math.round(s.formScores.reduce((a, b) => a + b, 0) / s.formScores.length)
      : 100;
    setSummary({
      reps: total,
      totalReps: total,
      avgFormScore: avg,
      deepReps: s.deepReps,
      backRoundedCount: s.backRoundedCount,
      kneeCaveCount: s.kneeCaveCount,
    });
    setAppState("summary");
  }, [stopCamera]);

  const resetForNewSet = useCallback(() => {
    setSummary(null);
    setAppState("idle");
    setRepCount(0);
    setMetrics(DEFAULT_METRICS);
    setShowDeepWarning(false);
  }, []);

  // Main detection loop
  useEffect(() => {
    if (appState !== "tracking") return;

    let metricsState = DEFAULT_METRICS;

    const detect = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
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

      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      if (result.landmarks && result.landmarks.length > 0) {
        const lms = result.landmarks[0] as Landmark[];
        metricsState = computeSquatMetrics(lms, metricsState.phase);
        drawSkeleton(ctx, lms, canvas.width, canvas.height, metricsState);

        const s = sessionRef.current;
        s.formScores.push(metricsState.formScore);

        // Track form issues per rep
        if (metricsState.backRounded) s.repHadBackRound = true;
        if (metricsState.kneesCaringIn) s.repHadKneeCave = true;

        // Rep counting logic
        const prevPhase = s.lastPhase;
        const currPhase = metricsState.phase;

        if (currPhase === "bottom") s.bottomReached = true;

        if (prevPhase === "ascending" && currPhase === "standing" && s.bottomReached) {
          // Rep completed
          s.repCount++;
          if (metricsState.hipBelowKnee || s.bottomReached) s.deepReps++;
          if (s.repHadBackRound) s.backRoundedCount++;
          if (s.repHadKneeCave) s.kneeCaveCount++;
          s.bottomReached = false;
          s.repHadBackRound = false;
          s.repHadKneeCave = false;
          setRepCount(s.repCount);
        }

        s.lastPhase = currPhase;

        // Deep warning: in descent/bottom but hip hasn't crossed knee
        const avgKnee = (metricsState.leftKneeAngle + metricsState.rightKneeAngle) / 2;
        if ((currPhase === "descending" || currPhase === "bottom") && !metricsState.hipBelowKnee && avgKnee < 130) {
          s.deepWarningTimer++;
          if (s.deepWarningTimer > 5) setShowDeepWarning(true);
        } else {
          s.deepWarningTimer = 0;
          setShowDeepWarning(false);
        }

        setMetrics({ ...metricsState });
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      animFrameRef.current = requestAnimationFrame(detect);
    };

    animFrameRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [appState]);

  // Cleanup on unmount
  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  const isTracking = appState === "tracking";

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden">
      {/* Main video area */}
      <div className="flex-1 relative flex flex-col">
        {/* Video + Canvas */}
        <div className="relative flex-1 bg-black overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            muted
            playsInline
            data-testid="webcam-video"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            data-testid="pose-canvas"
          />

          {/* Idle overlay */}
          {!isTracking && appState !== "summary" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/60">
              {appState === "loading" ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-green-400 animate-spin" style={{ filter: "drop-shadow(0 0 8px #4ade80)" }} />
                  <p className="text-green-400 font-semibold text-sm tracking-wide">Loading pose model...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="w-20 h-20 rounded-full border-2 border-green-400 flex items-center justify-center"
                    style={{ boxShadow: "0 0 30px rgba(74,222,128,0.3)" }}
                  >
                    <Camera className="w-8 h-8 text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold text-lg">Ready to Track</p>
                    <p className="text-muted-foreground text-sm mt-1">Position yourself so your full body is visible</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* "Go Deeper!" warning */}
          {isTracking && showDeepWarning && (
            <div
              className="absolute top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl border-2 border-red-400 bg-red-500/20 backdrop-blur-sm warn-glow"
              data-testid="go-deeper-warning"
            >
              <span className="text-red-400 font-black text-xl tracking-wide" style={{ textShadow: "0 0 10px rgba(239,68,68,0.8)" }}>
                Go Deeper!
              </span>
            </div>
          )}

          {/* Form issue overlays */}
          {isTracking && (
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
              {metrics.backRounded && (
                <div className="px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-400/50 backdrop-blur-sm" data-testid="back-warning">
                  <span className="text-orange-400 text-xs font-bold">⚠ Back Rounding</span>
                </div>
              )}
              {metrics.kneesCaringIn && (
                <div className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-400/50 backdrop-blur-sm" data-testid="knee-warning">
                  <span className="text-red-400 text-xs font-bold">⚠ Knees Caving In</span>
                </div>
              )}
            </div>
          )}

          {/* Camera off indicator */}
          {!isTracking && appState === "idle" && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/50">
              <CameraOff className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Camera off</span>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="w-72 border-l border-border bg-background flex flex-col p-4 gap-4">
        <SidePanel
          repCount={repCount}
          formScore={metrics.formScore}
          phase={metrics.phase}
          backRounded={metrics.backRounded}
          kneesCaringIn={metrics.kneesCaringIn}
          leftKneeAngle={metrics.leftKneeAngle}
          rightKneeAngle={metrics.rightKneeAngle}
          isTracking={isTracking}
          onEndSet={endSet}
          onStart={startCamera}
        />
      </div>

      {/* Summary modal */}
      {appState === "summary" && summary && (
        <SummaryCard summary={summary} onReset={resetForNewSet} />
      )}
    </div>
  );
}
