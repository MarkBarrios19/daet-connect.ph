"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { extractQrTokenForType, type ScannableQrType } from "@/lib/tours/qr-token-input";

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

function getDetector(): Detector | null {
  const Ctor = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
}

/** Camera/manual QR scanner that routes to the server-side signed-token verifier. `showHeader={false}` drops the built-in title block when the caller supplies one (e.g. a CollapsibleCard header). */
export function QrVerifyScanner({ expectedType, showHeader = true }: { expectedType: ScannableQrType; showHeader?: boolean }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [navigating, setNavigating] = useState(false);

  const guide = expectedType === "guide";
  const title = guide ? "Scan a guide badge" : "Scan a tourist ticket";
  const description = guide
    ? "Scan a guide's CONNECT-Daet badge to check their current accreditation."
    : "Scan the tourist's CONNECT-Daet ticket to verify the signed QR and booking details. This does not check guests in.";
  const fieldLabel = guide ? "Or paste the guide badge link or code" : "Or paste the tourist ticket link or code";
  const invalidMessage = guide
    ? "That QR is not a CONNECT-Daet guide badge. Scan the badge QR or paste its verify link."
    : "That QR is not a CONNECT-Daet booking ticket. Scan the tourist's ticket QR or paste its verify link.";

  useEffect(() => {
    setSupported(Boolean(getDetector() && navigator.mediaDevices?.getUserMedia));
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function stop() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    setScanning(false);
  }

  function openVerification(value: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    stop();
    setCameraError(null);
    setScanError(null);

    const token = extractQrTokenForType(value, expectedType);
    if (!token) {
      busyRef.current = false;
      setScanError(invalidMessage);
      return;
    }

    setNavigating(true);
    const mode = expectedType === "booking" ? "?mode=verify" : "";
    router.push(`/tours/verify/${encodeURIComponent(token)}${mode}`);
  }

  async function start() {
    const detector = getDetector();
    if (!detector || !navigator.mediaDevices?.getUserMedia) return;
    setCameraError(null);
    setScanError(null);
    busyRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setScanning(true);

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        if (!busyRef.current && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (!streamRef.current) return;
            if (codes[0]?.rawValue) {
              openVerification(codes[0].rawValue);
              return;
            }
          } catch {
            // Skip unreadable frames; the next animation frame may be clear.
          }
        }
        if (streamRef.current) frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      stop();
      setCameraError("The camera could not be opened. Allow camera access, or use your phone's camera app or paste the QR link instead.");
    }
  }

  return (
    <section
      aria-labelledby={showHeader ? `qr-scanner-title-${expectedType}` : undefined}
      aria-label={showHeader ? undefined : title}
      className="space-y-4"
    >
      {showHeader ? (
        <div>
          <h2 id={`qr-scanner-title-${expectedType}`} className="text-lg font-bold text-daet-ink">{title}</h2>
          <p className="mt-1 text-sm text-daet-ink/70">{description}</p>
        </div>
      ) : null}

      {supported ? (
        <div className="overflow-hidden rounded-2xl bg-slate-950">
          <video ref={videoRef} playsInline muted className={scanning ? "aspect-square w-full object-cover" : "hidden"} aria-label="Camera preview" />
          {!scanning ? (
            <div className="grid aspect-[4/3] place-items-center p-5 text-center text-white">
              <div>
                <p className="text-sm text-white/75">Point your camera at the QR code.</p>
                <Button variant="accent" size="lg" className="mt-3" onClick={start} disabled={navigating}>
                  Start camera
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 text-center">
              <Button variant="secondary" onClick={stop}>Stop camera</Button>
            </div>
          )}
        </div>
      ) : supported === false ? (
        <Notice variant="info" title="Camera scanning is not supported here">
          Use your phone&apos;s camera app to open the verification link, or paste the QR code or link below.
        </Notice>
      ) : (
        <p role="status" className="text-sm text-daet-ink/70">Checking camera support…</p>
      )}

      {cameraError ? <Notice variant="error">{cameraError}</Notice> : null}
      {scanError ? <Notice variant="error">{scanError}</Notice> : null}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (manual.trim()) openVerification(manual);
        }}
      >
        <Field id={`manual-qr-${expectedType}`} label={fieldLabel}>
          <Input
            id={`manual-qr-${expectedType}`}
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            autoComplete="off"
            placeholder="https://…/tours/verify/CD1.…"
          />
        </Field>
        <Button type="submit" variant="secondary" loading={navigating} loadingText="Opening verification…" disabled={!manual.trim() || navigating}>
          Verify QR
        </Button>
      </form>
    </section>
  );
}
