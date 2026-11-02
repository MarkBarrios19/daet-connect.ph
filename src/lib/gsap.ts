"use client";

/**
 * The one place GSAP is set up.
 *
 * Client code imports `gsap`, `ScrollTrigger` and `useGSAP` from here rather
 * than from the packages directly, so the plugins are registered exactly once
 * and no server module ever pulls GSAP in (it reaches for `window`).
 */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export { gsap, ScrollTrigger, useGSAP };
