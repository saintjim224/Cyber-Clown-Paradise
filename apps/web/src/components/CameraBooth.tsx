"use client";

import { Camera, CameraOff, ScanFace, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import type { FaceDescriptor } from "@/lib/api";

type FaceLandmarkerModule = typeof import("@mediapipe/tasks-vision");
type FaceLandmarkerInstance = Awaited<ReturnType<FaceLandmarkerModule["FaceLandmarker"]["createFromOptions"]>>;

const MEDIAPIPE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

const fallbackDescriptor: FaceDescriptor = {
  face_roundness: 0.52,
  eye_spacing: 0.5,
  eye_size: 0.5,
  brow_lift: 0.48,
  smile_curve: 0.54,
  mouth_width: 0.5,
  cheek_fullness: 0.55,
  nose_scale: 0.5,
  head_tilt: 0.5,
  confidence: 0,
  capture_quality: "fallback"
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function descriptorFromLandmarks(result: ReturnType<FaceLandmarkerInstance["detect"]>): FaceDescriptor | null {
  const points = result.faceLandmarks?.[0];
  if (!points || points.length < 300) return null;

  const leftEyeOuter = points[33];
  const rightEyeOuter = points[263];
  const leftEyeTop = points[159];
  const leftEyeBottom = points[145];
  const rightEyeTop = points[386];
  const rightEyeBottom = points[374];
  const chin = points[152];
  const forehead = points[10];
  const leftCheek = points[234];
  const rightCheek = points[454];
  const mouthLeft = points[61];
  const mouthRight = points[291];
  const mouthTop = points[13];
  const mouthBottom = points[14];
  const nose = points[1];

  const faceHeight = Math.max(distance(forehead, chin), 0.01);
  const faceWidth = Math.max(distance(leftCheek, rightCheek), 0.01);
  const eyeGap = distance(leftEyeOuter, rightEyeOuter);
  const eyeHeight = (distance(leftEyeTop, leftEyeBottom) + distance(rightEyeTop, rightEyeBottom)) / 2;
  const mouthSpan = distance(mouthLeft, mouthRight);
  const smileLift = (mouthTop.y + mouthBottom.y) / 2 - (mouthLeft.y + mouthRight.y) / 2;
  const tilt = Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x);
  const blendCategories = result.faceBlendshapes?.[0]?.categories ?? [];
  const blend = (name: string) => blendCategories.find((item) => item.categoryName === name)?.score ?? 0;

  const smileBlend = Math.max(blend("mouthSmileLeft"), blend("mouthSmileRight"), blend("mouthShrugUpper"));
  const browBlend = Math.max(blend("browOuterUpLeft"), blend("browOuterUpRight"), blend("browInnerUp"));

  return {
    face_roundness: clamp01((faceWidth / faceHeight - 0.62) / 0.28),
    eye_spacing: clamp01((eyeGap / faceWidth - 0.5) / 0.26),
    eye_size: clamp01((eyeHeight / faceHeight - 0.018) / 0.045),
    brow_lift: clamp01(browBlend || 0.45),
    smile_curve: clamp01(smileBlend || 0.5 + smileLift * 4),
    mouth_width: clamp01((mouthSpan / faceWidth - 0.25) / 0.32),
    cheek_fullness: clamp01((faceWidth / faceHeight - 0.56) / 0.34),
    nose_scale: clamp01((distance(nose, mouthTop) / faceHeight - 0.08) / 0.18),
    head_tilt: clamp01(0.5 + tilt * 1.8),
    confidence: 0.92,
    capture_quality: "good"
  };
}

function descriptorFromPixels(canvas: HTMLCanvasElement): FaceDescriptor {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallbackDescriptor;
  const width = canvas.width;
  const height = canvas.height;
  const sample = context.getImageData(Math.floor(width * 0.2), Math.floor(height * 0.18), Math.floor(width * 0.6), Math.floor(height * 0.64));
  let total = 0;
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;
  for (let y = 0; y < sample.height; y += 8) {
    for (let x = 0; x < sample.width; x += 8) {
      const offset = (y * sample.width + x) * 4;
      const brightness = (sample.data[offset] + sample.data[offset + 1] + sample.data[offset + 2]) / 765;
      const weight = 1 - brightness;
      total += weight;
      if (x < sample.width / 2) left += weight;
      else right += weight;
      if (y < sample.height / 2) top += weight;
      else bottom += weight;
    }
  }
  const balance = total ? left / Math.max(right, 0.01) : 1;
  const vertical = total ? top / Math.max(bottom, 0.01) : 1;
  return {
    ...fallbackDescriptor,
    face_roundness: clamp01(0.48 + (vertical - 1) * 0.12),
    eye_spacing: clamp01(0.5 + (balance - 1) * 0.08),
    brow_lift: clamp01(0.45 + (vertical - 1) * 0.1),
    head_tilt: clamp01(0.5 + (balance - 1) * 0.12),
    confidence: total > 12 ? 0.38 : 0.16,
    capture_quality: total > 12 ? "low" : "fallback"
  };
}

function isMediapipeRuntimeInfo(args: unknown[]) {
  return args.some((item) => typeof item === "string" && item.includes("Created TensorFlow Lite XNNPACK delegate for CPU"));
}

function ensureMediapipeRuntimeInfoSilenced() {
  const patchedConsole = console as Console & { __cyberjokerMediapipeRuntimeInfoSilenced?: true };
  if (patchedConsole.__cyberjokerMediapipeRuntimeInfoSilenced) return;
  patchedConsole.__cyberjokerMediapipeRuntimeInfoSilenced = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    if (isMediapipeRuntimeInfo(args)) return;
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    if (isMediapipeRuntimeInfo(args)) return;
    originalWarn(...args);
  };
}

async function withSilencedMediapipeRuntimeInfo<T>(run: () => T | Promise<T>): Promise<T> {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    if (isMediapipeRuntimeInfo(args)) return;
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    if (isMediapipeRuntimeInfo(args)) return;
    originalWarn(...args);
  };

  try {
    return await run();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

async function loadLandmarker(): Promise<FaceLandmarkerInstance | null> {
  try {
    ensureMediapipeRuntimeInfoSilenced();
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    return await withSilencedMediapipeRuntimeInfo(() =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        outputFaceBlendshapes: true,
        runningMode: "IMAGE",
        numFaces: 1
      })
    );
  } catch {
    return null;
  }
}

async function analyzeCanvas(canvas: HTMLCanvasElement): Promise<FaceDescriptor> {
  const landmarker = await loadLandmarker();
  if (!landmarker) return descriptorFromPixels(canvas);
  try {
    const result = await withSilencedMediapipeRuntimeInfo(() => landmarker.detect(canvas));
    return descriptorFromLandmarks(result) ?? descriptorFromPixels(canvas);
  } catch {
    return descriptorFromPixels(canvas);
  } finally {
    landmarker.close();
  }
}

function drawVideo(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasFromFile(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 720;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export function CameraBooth({
  descriptor,
  onDescriptor
}: {
  descriptor?: FaceDescriptor | null;
  onDescriptor?: (descriptor: FaceDescriptor) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    async function boot() {
      if (!enabled) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError("摄像头没有打开，先用上传图片或默认小丑特征继续。");
        setEnabled(false);
      }
    }

    void boot();
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !onDescriptor) return;
    const canvas = drawVideo(video);
    if (!canvas) return;
    setBusy(true);
    setError(null);
    try {
      onDescriptor(await analyzeCanvas(canvas));
    } catch {
      setError("这张脸谱没读稳，已经改用默认 Q 版小丑比例。");
      onDescriptor(fallbackDescriptor);
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onDescriptor) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = await canvasFromFile(file);
      onDescriptor(canvas ? await analyzeCanvas(canvas) : fallbackDescriptor);
    } catch {
      setError("图片没有读出稳定人脸，已经改用默认 Q 版小丑比例。");
      onDescriptor(fallbackDescriptor);
    } finally {
      setBusy(false);
    }
  }

  const quality = descriptor?.capture_quality ?? "fallback";

  return (
    <div className="camera-panel" aria-label="小丑滤镜摄像头预览">
      {enabled ? (
        <>
          <video ref={videoRef} playsInline muted />
          <div className="camera-overlay" />
          <div className="camera-toolbar">
            <button className="secondary-button" type="button" disabled={busy} onClick={captureFrame}>
              <ScanFace size={18} aria-hidden />
              {busy ? "读取中" : "捕捉脸谱"}
            </button>
            <button className="icon-button" type="button" onClick={() => setEnabled(false)} title="关闭摄像头">
              <CameraOff size={18} aria-hidden />
            </button>
          </div>
        </>
      ) : (
        <div className="camera-empty">
          <div>
            <ScanFace size={36} aria-hidden />
            <p className="helper">{error ?? `脸谱特征：${quality}，只保存低维摘要。`}</p>
            <div className="task-actions">
              <button className="secondary-button" type="button" onClick={() => setEnabled(true)}>
                <Camera size={18} aria-hidden />
                打开滤镜
              </button>
              <label className="secondary-button file-button">
                <Upload size={18} aria-hidden />
                上传自拍
                <input accept="image/*" type="file" onChange={uploadImage} />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
