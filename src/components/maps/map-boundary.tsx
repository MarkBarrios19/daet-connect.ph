"use client";

import { Component, type ReactNode } from "react";

/**
 * Keeps a map's failure to the map.
 *
 * Leaflet owns its own DOM and throws from inside effects and event handlers,
 * where React has nothing to recover with. Without a boundary here that throw
 * travels up to `app/error.tsx` and replaces the whole page — which is exactly
 * what happened on a phone whose tiles never arrived: the home page became
 * "Something went wrong." because a tile host was away.
 *
 * The map is the last thing between a reader and the footer. It may fail on its
 * own; the rest of the page has no reason to.
 */
export class MapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // The map is decoration over a list of the same places, so a failure is
    // reported once and not shown as an alarm.
    console.error("the map could not be drawn; the page carries on", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="rounded-2xl card-edge bg-surface p-6 text-lg text-daet-ink">
        The map is not available just now. Every place it pins is listed on this page, and the{" "}
        <a href="/tours/attractions" className="font-bold text-blue-700 underline dark:text-blue-300">
          places page
        </a>{" "}
        has them all with their own maps.
      </p>
    );
  }
}
