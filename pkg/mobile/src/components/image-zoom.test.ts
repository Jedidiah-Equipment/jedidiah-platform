import { expect, test } from 'vitest';
import { containedSize, DOUBLE_TAP_ZOOM, doubleTap, MAX_ZOOM, pinch, settle, UNZOOMED } from './image-zoom';

const frame = { width: 400, height: 800 };

test('a pinch keeps the image point under the fingers under them', () => {
  const zoom = pinch(UNZOOMED, { x: 100, y: 50 }, { x: 100, y: 50 }, 2);
  expect(zoom).toEqual({ scale: 2, x: -100, y: -50 });
  // That image point (100, 50) now paints at translation + scale × point.
  expect(zoom.x + zoom.scale * 100).toBe(100);
});

test('a pinch stops at the largest zoom', () => {
  expect(pinch(UNZOOMED, { x: 0, y: 0 }, { x: 0, y: 0 }, 10).scale).toBe(MAX_ZOOM);
});

test('a photo pinched smaller than the frame settles back to fit', () => {
  expect(settle({ scale: 0.8, x: 30, y: 30 }, frame, frame)).toEqual(UNZOOMED);
});

test('a zoomed photo settles with no edge pulled inside the frame', () => {
  const content = containedSize(frame, { width: 1000, height: 1000 });
  expect(content).toEqual({ width: 400, height: 400 });
  // At 3×, the 1200-wide image may move 400 either way; at 1200 tall it may move 200.
  expect(settle({ scale: 3, x: 900, y: -900 }, frame, content)).toEqual({ scale: 3, x: 400, y: -200 });
  // At 2× the image is exactly the frame's height, so it cannot move vertically.
  expect(settle({ scale: 2, x: 0, y: 120 }, frame, content).y).toBe(0);
});

test('a double tap zooms in on the tapped point, and out again', () => {
  const zoomed = doubleTap(UNZOOMED, { x: 40, y: 0 }, frame, frame);
  expect(zoomed).toEqual({ scale: DOUBLE_TAP_ZOOM, x: 40 * (1 - DOUBLE_TAP_ZOOM), y: 0 });
  expect(doubleTap(zoomed, { x: 40, y: 0 }, frame, frame)).toEqual(UNZOOMED);
});
