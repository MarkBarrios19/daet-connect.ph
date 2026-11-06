"use client";

import { useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const speechApi = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Speech to text where the browser can listen (Chrome, Edge, Safari); `supported`
 * is false elsewhere so the microphone button can be hidden. Philippine English
 * also catches most Filipino and Taglish.
 */
export function useSpeech(onText: (text: string) => void) {
  const recRef = useRef<Recognition | null>(null);
  const textRef = useRef(onText);
  textRef.current = onText;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  useEffect(() => setSupported(speechApi() !== null), []);
  useEffect(() => () => recRef.current?.stop(), []);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Api = speechApi();
    if (!Api) return;
    const rec = new Api();
    rec.lang = "en-PH";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (text) textRef.current(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };
  return { supported, listening, toggle };
}

export const MIC_PATH = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3";
