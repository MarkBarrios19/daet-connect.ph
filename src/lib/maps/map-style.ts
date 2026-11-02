/**
 * Map tiles: the standard OpenStreetMap raster layer, drawn by Leaflet.
 *
 * No key, no account, and the tiles are the same ones openstreetmap.org serves
 * — change the provider here and every map follows. OpenStreetMap's tile policy
 * asks for a credit (MAP_ATTRIBUTION, which Leaflet draws in the corner) and
 * for light use; a production site at real traffic should run its own tiles or
 * move to a paid provider before it gets popular.
 */
export const MAP_TILES = {
  light: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  dark: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
} as const;

/** Shown in the map's corner, as the tile policy requires. */
export const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/**
 * There is no dark OpenStreetMap raster, so dark mode turns the tiles down
 * rather than asking for different ones: inverted, desaturated and dimmed, the
 * standard layer reads as a dark basemap and keeps its street names legible.
 */
export const DARK_TILE_FILTER = "invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88) saturate(0.65)";

/** The deepest the standard tiles go. */
export const TILE_MAX_ZOOM = 19;

/** Give up on tiles and draw the sketch if none has arrived by then. */
export const MAP_LOAD_TIMEOUT_MS = 10_000;

/** How many tile failures, with none loaded, mean the network or the provider is away. */
export const TILE_FAILURES_BEFORE_SKETCH = 4;
