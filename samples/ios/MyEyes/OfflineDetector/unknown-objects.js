/*
 * Offline, class-independent APPEARANCE proposals, not an object classifier.
 * The caller supplies an upright RGBA image and a normalized floor-zone polygon
 * ({x,y} or [x,y] vertices). Both APIs are plain-script globals, with no imports.
 *
 * A robust dominant color must explain most of the zone. Only small, enclosed,
 * compact contrasting components with sharp borders are proposed. RGB distances
 * treat all channels equally: no target color, hue, object class or learned model.
 * Broad surfaces, thin seams and soft shading are deliberately rejected.
 *
 * LIMITATIONS: appearance cannot establish height or physical obstruction.
 * Small rugs, patterned tiles, stains, reflections and hard-edged shadows can
 * resemble objects. Same-colored, tiny, blurred, boundary-touching or large objects
 * may be missed. Multicolored flooring can make us abstain entirely. Persistence
 * reduces flicker, not these ambiguities. Confidence 0 is intentionally NOT a
 * classifier probability, and must not be displayed as a percentage or interpreted
 * as a calibrated safety guarantee. Device/real-scene validation remains necessary.
 */
(function (root) {
  'use strict';

  const LABEL = 'Possible unknown object';
  const MAX_CANDIDATES = 3;
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / Math.sqrt(3);
  const median = values => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  function inside(x, y, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  }
  function validBox(b) {
    return b && [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
      b.width > 0 && b.height > 0 && b.x >= 0 && b.y >= 0 &&
      b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001;
  }
  function overlap(a, b) {
    return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  }
  function proposal(bbox) {
    return { label: LABEL, confidence: 0, bbox: { ...bbox },
      anchor: { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height }, inZone: true };
  }

  function findUnknownObjects(rgba, width, height, knownDetections, zone) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 8 || height < 8 ||
        !rgba || !Number.isSafeInteger(width * height * 4) || rgba.length !== width * height * 4 ||
        !Array.isArray(zone) || zone.length < 3 || zone.length > 32) return [];
    const polygon = Array.from(zone, p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
    if (polygon.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
        p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return [];

    // Bound both dimensions, preserving aspect ratio and never upsampling.
    const scale = Math.min(1, 160 / width, 160 / height);
    const gw = Math.max(1, Math.floor(width * scale)), gh = Math.max(1, Math.floor(height * scale));
    const pixels = new Array(gw * gh), mask = new Uint8Array(gw * gh);
    const channels = [[], [], []];
    let count = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (!inside((x + 0.5) / gw, (y + 0.5) / gh, polygon)) continue;
      const source = (Math.min(height - 1, Math.floor((y + 0.5) * height / gh)) * width +
        Math.min(width - 1, Math.floor((x + 0.5) * width / gw))) * 4;
      const color = [rgba[source], rgba[source + 1], rgba[source + 2]];
      // Incomplete/transparent input must not invent a dominant black floor.
      if (rgba[source + 3] !== 255 || color.some(v => !Number.isFinite(v) || v < 0 || v > 255)) return [];
      const i = y * gw + x;
      mask[i] = 1; pixels[i] = color; count++;
      for (let c = 0; c < 3; c++) channels[c].push(color[c]);
    }
    if (count < 100) return [];
    const floor = channels.map(median);
    const deviations = [];
    let supported = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) {
      const d = distance(pixels[i], floor);
      deviations.push(d);
      if (d <= 32) supported++;
    }
    // A median between two competing floor palettes is not convincing evidence.
    if (supported / count < 0.65) return [];
    deviations.sort((a, b) => a - b);
    const threshold = Math.max(40, deviations[Math.floor(count * 0.65)] * 2.5);
    const foreground = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) if (mask[i] && distance(pixels[i], floor) > threshold) foreground[i] = 1;

    const seen = new Uint8Array(mask.length), candidates = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let seed = 0; seed < foreground.length; seed++) {
      if (!foreground[seed] || seen[seed]) continue;
      const queue = [seed]; seen[seed] = 1;
      let minX = gw, minY = gh, maxX = 0, maxY = 0;
      let touchesEdge = false, boundary = 0, sharpBoundary = 0;
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q], x = i % gw, y = Math.floor(i / gw);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [dx, dy] of directions) {
          const nx = x + dx, ny = y + dy, ni = ny * gw + nx;
          if (nx < 0 || nx >= gw || ny < 0 || ny >= gh || !mask[ni]) { touchesEdge = true; continue; }
          if (foreground[ni]) {
            if (!seen[ni]) { seen[ni] = 1; queue.push(ni); }
          } else {
            boundary++;
            if (distance(pixels[i], pixels[ni]) >= 24) sharpBoundary++;
          }
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1, area = queue.length;
      if (touchesEdge || area < Math.max(12, count * 0.002) || area > count * 0.10 ||
          bw < 3 || bh < 3 || bw > gw * 0.35 || bh > gh * 0.30 ||
          Math.max(bw / bh, bh / bw) > 3.5 || area / (bw * bh) < 0.45 ||
          !boundary || sharpBoundary / boundary < 0.55) continue;
      // Require a surrounding collar of floor, not another nearby broad surface.
      let ring = 0, floorRing = 0, enclosed = true;
      for (let y = minY - 2; y <= maxY + 2; y++) for (let x = minX - 2; x <= maxX + 2; x++) {
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) continue;
        const i = y * gw + x;
        if (x < 0 || x >= gw || y < 0 || y >= gh || !mask[i]) { enclosed = false; continue; }
        ring++;
        if (!foreground[i]) floorRing++;
      }
      if (!enclosed || !ring || floorRing / ring < 0.85) continue;
      const bbox = { x: minX / gw, y: minY / gh, width: bw / gw, height: bh / gh };
      const covered = Array.isArray(knownDetections) && knownDetections.some(d => {
        if (!validBox(d && d.bbox)) return false;
        const intersection = overlap(bbox, d.bbox);
        return intersection / Math.min(bbox.width * bbox.height, d.bbox.width * d.bbox.height) >= 0.4;
      });
      if (!covered) candidates.push({ detection: proposal(bbox), area });
    }
    return candidates.sort((a, b) => b.area - a.area).slice(0, MAX_CANDIDATES).map(c => c.detection);
  }

  function createUnknownObjectTracker() {
    let tracks = [], previousTime = null;
    function reset() { tracks = []; previousTime = null; }
    return {
      reset,
      breakStreak: reset,
      update(candidates, now) {
        if (!Number.isFinite(now) || now < 0 || (previousTime !== null && now <= previousTime)) {
          // Reject this observation, but retain the clock high-water mark so an
          // out-of-order stream cannot immediately create a new stale streak.
          tracks = [];
          return [];
        }
        if (previousTime !== null && now - previousTime > 750) tracks = [];
        previousTime = now;
        const current = Array.isArray(candidates) ? candidates.filter(d => d && validBox(d.bbox)).slice(0, MAX_CANDIDATES) : [];
        const used = new Set();
        tracks = current.map(d => {
          const b = d.bbox;
          let best = -1, bestDistance = Infinity;
          for (let i = 0; i < tracks.length; i++) {
            if (used.has(i)) continue;
            const old = tracks[i].bbox;
            const sizeRatio = Math.max(b.width / old.width, old.width / b.width, b.height / old.height, old.height / b.height);
            const displacement = Math.hypot(b.x + b.width / 2 - old.x - old.width / 2, b.y + b.height / 2 - old.y - old.height / 2);
            const allowed = Math.min(0.06, Math.min(b.width, b.height, old.width, old.height) * 0.5);
            if (sizeRatio <= 1.6 && displacement <= allowed && displacement < bestDistance) { best = i; bestDistance = displacement; }
          }
          if (best >= 0) used.add(best);
          return { bbox: { ...b }, streak: best >= 0 ? Math.min(3, tracks[best].streak + 1) : 1 };
        });
        return tracks.filter(t => t.streak >= 3).map(t => proposal(t.bbox));
      }
    };
  }
  root.findUnknownObjects = findUnknownObjects;
  root.createUnknownObjectTracker = createUnknownObjectTracker;
})(globalThis);
