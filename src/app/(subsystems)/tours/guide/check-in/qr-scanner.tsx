"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { checkInByScan, type CheckInResult } from "./actions";

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

function getDetector(): Detector | null {
  const Ctor = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  return Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
}

/**
 * Scans a ticket QR with the camera where the browser supports
 * BarcodeDetector (Chrome on Android). Elsewhere the guide can scan with the
 * phone's camera app (the QR is a link to the check-in page) or paste the code.
 */
export function QrScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [manual, setManual] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSupported(getDetector() !== null && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => stop();
  }, []);

  function stop() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  function submit(value: string) {
    startTransition(async () => {
      const response = await checkInByScan(value);
      setResult(response);
      busyRef.current = false;
    });
  }

  async function start() {
    const detector = getDetector();
    if (!detector) return;
    setCameraError(null);
    setResult(null);
    try {
      let stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      // Some Android phones open the 0.5x ultra-wide lens by default. Labels
      // are only readable once permission is granted, so look again now and
      // switch to a back camera that isn't the ultra-wide one.
      try {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
        const wide = (label: string) => /ultra|0\.5/i.test(label);
        const mainBack = devices.find((d) => /back|rear|environment/i.test(d.label) && !wide(d.label));
        if (mainBack && mainBack.deviceId && mainBack.deviceId !== current) {
          const better = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: mainBack.deviceId } }, audio: false });
          stream.getTracks().forEach((track) => track.stop());
          stream = better;
        }
        // Where the browser exposes zoom, a minimum below 1 is the ultra-wide: go to 1x.
        const track = stream.getVideoTracks()[0];
        const zoom = (track?.getCapabilities?.() as { zoom?: { min: number; max: number } } | undefined)?.zoom;
        if (track && zoom && zoom.min < 1 && zoom.max >= 1) {
          await track.applyConstraints({ advanced: [{ zoom: 1 } as MediaTrackConstraintSet] }).catch(() => {});
        }
      } catch {
        // Keep the camera we already have.
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);

      const tick = async () => {
        if (!streamRef.current) return;
        if (!busyRef.current && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              busyRef.current = true;
              stop();
              submit(codes[0].rawValue);
              return;
            }
          } catch {
            // A frame that can't be read is skipped.
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      stop();
      setCameraError("The camera could not be opened. Allow camera access, or scan with your phone's camera app instead.");
    }
  }

  return (
    <div className="space-y-4">
      {result ? (
        result.success ? (
          <Notice variant="success" title={result.outcome === "already" ? "Already checked in" : "Checked in"}>
            {result.bookingId ? (
              <Link href={`/tours/guide/tours/${result.bookingId}/roster`} className="font-bold underline">
                Open the guest list
              </Link>
            ) : null}
          </Notice>
        ) : (
          <Notice variant="error" title="Not checked in">
            {result.error}
          </Notice>
        )
      ) : null}

      {supported ? (
        <div className="overflow-hidden rounded-2xl bg-slate-950">
          <video ref={videoRef} playsInline muted className={scanning ? "aspect-square w-full object-cover" : "hidden"} aria-label="Camera preview" />
          {!scanning ? (
            <div className="grid aspect-[4/3] place-items-center p-6 text-center text-white">
              <div>
                <p className="text-lg font-bold">Scan a ticket</p>
                <p className="mt-1 text-sm text-white/70">Point the camera at the tourist&apos;s ticket QR.</p>
                <Button variant="accent" size="lg" className="mt-4" onClick={start} loading={pending} loadingText="Checking…">
                  Start camera
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-3 text-center">
              <Button variant="secondary" onClick={stop}>
                Stop camera
              </Button>
            </div>
          )}
        </div>
      ) : supported === false ? (
        <Notice variant="info" title="Use your phone's camera app">
          This browser can&apos;t scan here. Open your phone&apos;s camera, scan the ticket, and tap the link: it opens the check-in page.
        </Notice>
      ) : null}
      {cameraError ? <Notice variant="error">{cameraError}</Notice> : null}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (manual.trim()) submit(manual);
        }}
      >
        <Field id="manual-code" label="Or paste the ticket link or code">
          <Input id="manual-code" value={manual} onChange={(event) => setManual(event.target.value)} autoComplete="off" placeholder="https://…/tours/verify/CD1.booking…" />
        </Field>
        <Button type="submit" variant="secondary" loading={pending} loadingText="Checking…" disabled={!manual.trim()}>
          Check in
        </Button>
      </form>
    </div>
  );
}
