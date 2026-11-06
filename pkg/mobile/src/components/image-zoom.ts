export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
/** A scale about the frame's centre, then a translation; every point here is relative to that centre. */
export type Zoom = { scale: number; x: number; y: number };

export const UNZOOMED: Zoom = { scale: 1, x: 0, y: 0 };
export const MAX_ZOOM = 4;
export const DOUBLE_TAP_ZOOM = 2.5;
/** How far a pinch may shrink the image before it settles back to fit. */
const MIN_LIVE_ZOOM = 0.75;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The zoom while a pinch is under way: the image point under the fingers' first midpoint follows them. */
export function pinch(start: Zoom, from: Point, to: Point, ratio: number): Zoom {
  const scale = clamp(start.scale * ratio, MIN_LIVE_ZOOM, MAX_ZOOM);
  const k = scale / start.scale;
  return { scale, x: to.x - k * (from.x - start.x), y: to.y - k * (from.y - start.y) };
}

export function pan(start: Zoom, dx: number, dy: number): Zoom {
  return { scale: start.scale, x: start.x + dx, y: start.y + dy };
}

/** The size a `contain` image actually paints inside the frame; the frame itself until the image reports its own. */
export function containedSize(frame: Size, image: Size | null): Size {
  if (!image || image.width <= 0 || image.height <= 0) return frame;
  const fit = Math.min(frame.width / image.width, frame.height / image.height);
  return { width: image.width * fit, height: image.height * fit };
}

/** Where a released gesture comes to rest: back in range, with no edge of the image pulled inside the frame. */
export function settle(zoom: Zoom, frame: Size, content: Size): Zoom {
  const scale = clamp(zoom.scale, 1, MAX_ZOOM);
  if (scale === 1) return UNZOOMED;
  const reachX = Math.max(0, (content.width * scale - frame.width) / 2);
  const reachY = Math.max(0, (content.height * scale - frame.height) / 2);
  return { scale, x: clamp(zoom.x, -reachX, reachX), y: clamp(zoom.y, -reachY, reachY) };
}

/** A double tap zooms in on the tapped point, or back out when already zoomed. */
export function doubleTap(zoom: Zoom, at: Point, frame: Size, content: Size): Zoom {
  if (zoom.scale > 1) return UNZOOMED;
  return settle(pinch(UNZOOMED, at, at, DOUBLE_TAP_ZOOM), frame, content);
}

/** A one-finger drag's travel and sideways speed (points per millisecond) when it lets go. */
export type Drag = { dx: number; dy: number; vx: number };

/** Share of the frame's width a released drag must cover to turn the photo. */
const SWIPE_DISTANCE = 0.25;
/** A flick this fast turns the photo after only {@link SWIPE_FLICK_DISTANCE} points. */
const SWIPE_VELOCITY = 0.3;
const SWIPE_FLICK_DISTANCE = 20;
/** Past the first or last photo, the photo follows the finger only this much. */
const SWIPE_EDGE_RESISTANCE = 1 / 3;

/** Where an unzoomed photo sits while a finger drags it sideways. */
export function swipeOffset(dx: number, index: number, count: number): number {
  const toward = dx < 0 ? index + 1 : index - 1;
  return toward >= 0 && toward < count ? dx : dx * SWIPE_EDGE_RESISTANCE;
}

/**
 * The photo a released one-finger drag lands on: a mostly sideways drag on a photo that was not zoomed in, far or
 * fast enough, turns to the next (dragged left) or previous (dragged right) photo, never past either end.
 */
export function swipeTarget(start: Zoom, drag: Drag, frameWidth: number, index: number, count: number): number {
  const reach = Math.abs(drag.dx);
  if (start.scale !== 1 || reach <= Math.abs(drag.dy)) return index;
  const far = reach > frameWidth * SWIPE_DISTANCE;
  const flick = reach > SWIPE_FLICK_DISTANCE && drag.vx * Math.sign(drag.dx) > SWIPE_VELOCITY;
  if (!far && !flick) return index;
  return clamp(index - Math.sign(drag.dx), 0, count - 1);
}
