/*
 * The canopy (weaver ants): a second place to play, up in the tree over the
 * nest, drawn pixel by pixel like the nest below: the same sky, a few
 * clouds, dark foliage in the distance, the trunk on the right with four
 * branches growing out of it (textured bark, twigs and leaf sprays), and the
 * weaver nest on the lowest branch, a ball of leaves stitched with silk.
 * Resting the mouse on the nest shows the inside, as through an x-ray: the
 * queen, her eggs and larvae, and a few workers.
 *
 * Weaver workers walk the branches you can reach. With the leaf tool you
 * place leaves, one cell at a time, each touching a branch, the trunk or
 * another leaf. Workers walk along leaves and climb them only on a slant
 * (one cell up for each cell across, never straight up), so leaves make
 * stairs to the next branch. popup.js keeps the weaver food, workers and
 * leaves in the save and pays for each leaf.
 *
 * The trip up from the nest (and back) is a scroll up the trunk through the sky.
 */

'use strict';

const Canopy = (() => {
  // ART SWITCHES. Flip to true to put the art back.
  //   ART: the pixel-art scene (blue sky, clouds, distant trees, textured bark,
  //        twigs with leaves, leaf-shaped stair tiles, falling leaves, the trip up the trunk).
  //        false: the plain first version (pale sky, flat brown bars, outlined leaves).
  //   NEST_ART: the nest made of leaves stitched with silk, and inside it the
  //        queen (the nest queen in green), eggs, larvae and workers.
  //        false: a plain green ball, with a green bar for the queen.
  const ART = true;
  const NEST_ART = false;

  const PIXEL = 2;     // screen pixels per canopy pixel (like the field at its usual zoom)
  const CELL = 4;      // leaves are placed on a grid of 4 x 4 canopy pixels
  const BRANCH_CELLS = 3;   // a branch is 3 cells thick where it leaves the trunk
  const TRUNK = 22;    // the trunk's width, at the right edge
  // Branches, lowest first: the top of each as a share of the height, and
  // where its tip is as a share of the width (each grows out of the trunk).
  const BRANCHES = [
    { y: 0.80, x0: 0.06 },
    { y: 0.53, x0: 0.42 },
    { y: 0.27, x0: 0.10 },
    { y: 0.05, x0: 0.18 }
  ];
  const C = {
    plainSky: '#c8eef8', plainBranch: '#5a4120', plainBranchDark: '#43301a', plainBranchLight: '#6e5230', plainLeaf: '#4f7f3a',
    sky: '#4ca7e5', haze: '#3f93cf', hazeLeaf: '#4a9bc8', cloud: '#ffffff', cloudShade: '#cfe8f7',
    far: ['#2f6e2a', '#285f24', '#3a7f30', '#23521b'],       // distant foliage
    bark: '#5c3f1e', barkDark: '#3f2a12', barkLight: '#7a5630', barkEdge: '#2e1f0c', barkKnot: '#4a3216',
    leaf: ['#2a6320', '#4f8a2e', '#79b84a', '#a8d86a'],       // outline, body, light, vein
    leafShade: ['#1f4c18', '#3c6e24', '#5f9a3a', '#86bd56'],  // the same, in shadow (inside the nest's lower half)
    silk: '#e8e8e2', silkDim: '#b9bfae',
    queen: '#6fbf3a', inside: '#33291a', insideDeep: '#271f12', insideWall: '#4f5e2a',
    egg: '#f4f1e2', larva: '#efe6c8',
    ring: '#d8ecd0',
    good: '#ffffff', bad: '#cd2e1f'
  };
  const WALK_MS = 320;       // a worker takes one cell this often
  const MOST_SHOWN = 20;     // workers drawn at most
  const XRAY = 18;           // the x-ray circle's radius, in canopy pixels
  const TRIP = { firstMs: 3600, fastMs: 750, gap: 1.6 };   // the scroll up: first time, by the arrow; sky between, in screens
  const FALLING = 4;         // leaves drifting down through the scene

  let host = null;           // { leaves(), workers(), placeLeaf(c, r), reached(n), fieldCanvas }
  let wrap, canvas, ctx, tripCanvas, tripCtx;
  let W = 0, H = 0, cols = 0, rows = 0;
  let solid = null;          // 1 where a branch or the trunk is
  let leafSet = new Set();
  let nodes = null;          // standable cells: Map from index to { c, r, y } (y: where an ant's feet are)
  let reach = new Set();     // standable cells the workers can get to from the lowest branch
  let reachedCount = 1;      // branches reached (the lowest always)
  let walkers = [];
  let falling = [];
  let base = null;           // the scene without the moving parts (redrawn when the size changes)
  let inside = null;         // the nest's inside, for the x-ray: { canvas, x, y }
  let nestMask = null;       // which pixels of the scene are nest: { x, y, w, h, bits }
  let xrayMask = null;
  let shell = null;          // the nest's outline, for Show queen       // a crisp circle, for cutting the x-ray out
  let showing = false;
  let busy = false;          // a trip is playing
  let leafTool = false;
  let mouse = null;          // { x, y } in canopy pixels, while over the canopy
  let painting = false;
  let note = null;           // { text, until }

  /* ---------- pixels ---------- */

  // A seeded random number source, so the scene is the same every time.
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rgbCache = {};
  function rgb(hex) {
    if (!rgbCache[hex]) rgbCache[hex] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    return rgbCache[hex];
  }
  // A picture built pixel by pixel.
  function makePix(w, h) {
    const img = new ImageData(w, h);
    return {
      w, h, img,
      set(x, y, hex) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const [r, g, b] = rgb(hex);
        const i = (y * w + x) * 4;
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      },
      has(x, y) { return x >= 0 && y >= 0 && x < w && y < h && img.data[(y * w + x) * 4 + 3] > 0; },
      rect(x, y, rw, rh, hex) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) this.set(x + i, y + j, hex); },
      canvas() {
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').putImageData(img, 0, 0);
        return cv;
      }
    };
  }

  // A leaf: a pointed lens `len` long and `wid` wide, turned by `turn`
  // radians, its stalk at (x, y). Dark edge, light midrib.
  function paintLeaf(pix, x, y, len, wid, turn, colors, inMask) {
    const cos = Math.cos(turn), sin = Math.sin(turn);
    const reachOut = Math.ceil(len + 1);
    const inLeaf = (px, py) => {
      const dx = px - x, dy = py - y;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      if (u < 0 || u > len) return 0;
      const half = (wid / 2) * Math.sin(Math.PI * Math.min(1, u / len * 1.1));
      if (Math.abs(v) > half + 0.25) return 0;
      if (Math.abs(v) < 0.6 && u > 1 && u < len - 1) return 2;   // the midrib
      return v < 0 ? 3 : 1;   // one half catches the light
    };
    for (let py = Math.floor(y - reachOut); py <= y + reachOut; py++) {
      for (let px = Math.floor(x - reachOut); px <= x + reachOut; px++) {
        const k = inLeaf(px, py);
        if (!k || (inMask && !inMask(px, py))) continue;
        const edge = !inLeaf(px + 1, py) || !inLeaf(px - 1, py) || !inLeaf(px, py + 1) || !inLeaf(px, py - 1);
        pix.set(px, py, edge ? colors[0] : k === 2 ? colors[3] : k === 3 ? colors[2] : colors[1]);
      }
    }
  }

  /* ---------- the grid ---------- */

  function idx(c, r) { return r * cols + c; }
  function inGrid(c, r) { return c >= 0 && r >= 0 && c < cols && r < rows; }
  function isSolid(c, r) { return inGrid(c, r) && solid[idx(c, r)] === 1; }
  function isLeaf(c, r) { return leafSet.has(idx(c, r)); }
  function isTrunk(c) { return c >= trunkCol(); }
  function trunkCol() { return Math.floor((W - TRUNK) / CELL); }

  function branchRect(n) {
    const b = BRANCHES[n];
    const r0 = Math.round(b.y * H / CELL);
    const c0 = Math.round(b.x0 * W / CELL);
    return { c0, r0, c1: cols - 1, r1: r0 + BRANCH_CELLS - 1 };
  }

  function layout() {
    const size = host.fieldCanvas;   // (the canopy covers the field exactly; it may be hidden, the field is not)
    const w = Math.max(60, Math.floor(size.clientWidth / PIXEL));
    const h = Math.max(60, Math.floor(size.clientHeight / PIXEL));
    if (w === W && h === H && solid) return;
    W = w; H = h;
    canvas.width = W; canvas.height = H;
    cols = Math.floor(W / CELL); rows = Math.floor(H / CELL);
    solid = new Uint8Array(cols * rows);
    BRANCHES.forEach((b, n) => {
      const rect = branchRect(n);
      for (let r = rect.r0; r <= rect.r1; r++) for (let c = rect.c0; c <= rect.c1; c++) if (inGrid(c, r)) solid[idx(c, r)] = 1;
    });
    for (let r = 0; r < rows; r++) for (let c = trunkCol(); c < cols; c++) solid[idx(c, r)] = 1;   // the trunk
    paintScene();
    falling = [];
    rebuild();
  }

  // The nest: on the lowest branch, near its tip.
  function nestShape() {
    const rect = branchRect(0);
    const top = rect.r0 * CELL;
    if (NEST_ART) {   // an oval
      const ox = Math.round(W * 0.17), oy = Math.round(H * 0.1);
      return { cx: rect.c0 * CELL + ox + 4, cy: top - oy + 5, rx: ox, ry: oy, top };
    }
    // wrapped around the branch: more of it above than below
    const rx = Math.round(W * 0.16), ry = Math.round(H * 0.11);
    const cx = rect.c0 * CELL + rx + 10;
    return { cx, cy: top + Math.round(BRANCH_CELLS * CELL / 2) - Math.round(ry * 0.35), rx, ry, top };
  }

  /* ---------- the scene ---------- */

  function paintScene() {
    if (!ART) { paintPlainScene(); return; }
    const rand = seeded(7);
    const pix = makePix(W, H);
    pix.rect(0, 0, W, H, C.sky);
    // Clouds: a few soft lumps, flat underneath.
    for (const [fx, fy, fw] of [[0.18, 0.13, 0.16], [0.55, 0.36, 0.12], [0.3, 0.64, 0.14], [0.62, 0.9, 0.1]]) {
      const cx = Math.round(fx * W), cy = Math.round(fy * H), cw = Math.round(fw * W);
      for (let k = 0; k < 4; k++) {
        const bx = cx + Math.round((k - 1.5) * cw / 4), r = Math.round(cw / 5 + (k % 2) * 2);
        for (let y = -r; y <= 0; y++) for (let x = -r; x <= r; x++) if (x * x + y * y * 2.2 <= r * r) pix.set(bx + x, cy + y, y > -2 ? C.cloudShade : C.cloud);
      }
    }
    // Distant foliage: dark leafy masses at the top and behind the trunk.
    const blob = (bx, by, br) => {
      for (let y = -br; y <= br; y++) for (let x = -br; x <= br; x++) {
        if (x * x + y * y > br * br) continue;
        const n = rand();
        pix.set(bx + x, by + y, n < 0.12 ? C.far[2] : n < 0.25 ? C.far[3] : (x + y) % 3 ? C.far[0] : C.far[1]);
      }
    };
    for (let k = 0; k < 26; k++) blob(rand() * W * 0.75, rand() * H * 0.08 - 4, 5 + rand() * 8);
    for (let k = 0; k < 18; k++) blob(W - TRUNK - 10 + rand() * 30, rand() * H, 4 + rand() * 7);
    paintTrunk(pix, 0, H, rand, 0);
    BRANCHES.forEach((b, n) => paintBranch(pix, n, rand));
    if (NEST_ART) paintLeafNest(pix, rand); else paintNest(pix);
    base = pix.canvas();
  }

  // Loose leaves drawn about the sky in the plain scene: [x, y, size, turn] (shares of the width and height, radians).
  const LOOSE = [[0.27, 0.03, 0.05, 0.6], [0.14, 0.17, 0.07, -0.4], [0.38, 0.15, 0.05, 0.8], [0.58, 0.19, 0.06, 2.2],
    [0.11, 0.37, 0.05, 1.2], [0.39, 0.37, 0.06, -0.9], [0.66, 0.47, 0.05, 0.1], [0.42, 0.55, 0.06, 1.5],
    [0.67, 0.64, 0.04, 0.3], [0.7, 0.75, 0.05, -0.3], [0.62, 0.93, 0.06, 0.9]];

  // The plain scene (ART off): pale sky, outlined leaves, flat brown branches and trunk.
  function paintPlainScene() {
    const sky = makePix(W, H);
    sky.rect(0, 0, W, H, C.plainSky);
    base = sky.canvas();
    const g = base.getContext('2d');
    g.save();
    g.strokeStyle = C.plainLeaf;
    g.lineWidth = 1;
    g.lineJoin = 'round';
    for (const [fx, fy, fs, turn] of LOOSE) {
      const x = fx * W, y = fy * H, sz = fs * W;
      const pts = [[0, -sz], [sz * 0.42, sz * 0.05], [0, sz * 0.9], [-sz * 0.3, sz * 0.1]];
      g.beginPath();
      pts.forEach(([px, py], k) => {
        const rx = x + px * Math.cos(turn) - py * Math.sin(turn);
        const ry = y + px * Math.sin(turn) + py * Math.cos(turn);
        if (k) g.lineTo(rx, ry); else g.moveTo(rx, ry);
      });
      g.closePath();
      g.stroke();
    }
    g.restore();
    const x0 = W - TRUNK;
    const box = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
    box(x0, 0, TRUNK, H, C.plainBranch);
    box(x0, 0, 2, H, C.plainBranchDark);
    BRANCHES.forEach((b, n) => {
      const rect = branchRect(n);
      const x = rect.c0 * CELL, y = rect.r0 * CELL, w = x0 - x, h = BRANCH_CELLS * CELL;
      box(x, y, w, h, C.plainBranch);
      box(x, y, w, 1, C.plainBranchLight);
      box(x, y + h - 2, w, 2, C.plainBranchDark);
      for (let bx = x + 5 + (n * 7) % 11; bx < x0 - 3; bx += 13 + (bx % 5)) box(bx, y + 3 + (bx % 3), 3, 1, C.plainBranchDark);   // bark
    });
    const nest = makePix(W, H);   // (see-through around the nest)
    if (NEST_ART) paintLeafNest(nest, seeded(7)); else paintNest(nest);
    g.drawImage(nest.canvas(), 0, 0);
  }

  // The trunk's left edge at height `gy` (counted down from the top of the
  // canopy; the sky below it, on the trip, carries on from H). It sways a
  // little, so the trunk is not a straight bar.
  function trunkEdge(gy) {
    return W - TRUNK + Math.round(2.5 * Math.sin(gy / 19) + 1.5 * Math.sin(gy / 7.3 + 2));
  }

  // The trunk from y0 to y1 of `pix`, which starts at height `from` (see
  // trunkEdge). `bend`, if given: from that row down the trunk curves off the
  // right side (the tree grows up beside the nest, not out of the sky).
  function paintTrunk(pix, y0, y1, rand, from, bend) {
    for (let y = y0; y < y1; y++) {
      const gy = from + y;
      let x0 = trunkEdge(gy);
      if (bend !== undefined && y > bend) x0 += Math.round(Math.pow((y - bend) / (y1 - bend), 2) * (TRUNK + 16));
      for (let x = x0; x < W; x++) {
        const i = x - x0;
        const streak = (i * 7 + Math.floor(gy / 5) * 3) % 9 === 0;
        const crack = (gy * 5 + i * 3) % 41 === 0;
        pix.set(x, y, i < 2 ? C.barkEdge : streak || crack ? C.barkDark : i === 2 ? C.barkLight : i > TRUNK - 6 ? C.barkDark : C.bark);
      }
      if (rand() < 0.04) pix.set(x0 + 4 + Math.floor(rand() * (TRUNK - 8)), y, C.barkLight);
    }
  }

  // A branch from the trunk to its tip: flat on top (the ants walk there),
  // its underside thinner toward the tip, wavy, and flaring where it meets
  // the trunk; bark streaks, knots, a twig past the tip, a stub underneath,
  // and twigs with leaf sprays hanging below.
  function paintBranch(pix, n, rand) {
    const rect = branchRect(n);
    const top = rect.r0 * CELL, left = rect.c0 * CELL;
    const full = BRANCH_CELLS * CELL;
    const right = Math.max(trunkEdge(top), trunkEdge(top + full + 10)) + 3;
    const under = (x) => {
      const fromTip = Math.min(1, (x - left) / 50);
      const near = Math.max(0, 16 - (right - x)) / 16;   // the flare into the trunk
      return Math.round(full * (0.45 + 0.55 * fromTip) + 1.2 * Math.sin(x / 9 + n * 2) * fromTip + near * near * 10);
    };
    for (let x = left; x < right; x++) {
      const thick = Math.max(3, under(x));
      for (let y = top; y < top + thick; y++) {
        let color = C.bark;
        if (y === top) color = C.barkLight;
        else if (y >= top + thick - 1) color = C.barkEdge;
        else if (y >= top + thick - 3) color = C.barkDark;
        else if ((x * 3 + y * 7 + n) % 17 === 0 || (y - top === 5 && (x + n * 5) % 23 < 6)) color = C.barkDark;
        pix.set(x, y, color);
      }
    }
    // a rounded tip, and a twig going on past it, up and out, with leaves
    pix.set(left, top, C.sky);
    pix.set(left, top + Math.max(3, under(left)) - 1, C.sky);
    let x = left, y = top + 2;
    const twig = 7 + Math.floor(rand() * 5);
    for (let s = 0; s < twig; s++) { x -= 1; if (s % 2) y -= 1; pix.set(x, y, C.barkDark); if (s < 3) pix.set(x, y + 1, C.barkEdge); }
    for (let l = 0; l < 3; l++) paintLeaf(pix, x, y, 5 + rand() * 3, 3 + rand(), Math.PI + (rand() - 0.5) * 2.4, C.leaf);
    // knots
    for (let k = 0; k < 3; k++) {
      const kx = left + 12 + Math.floor(rand() * (right - left - 24));
      pix.rect(kx, top + 4, 3, 2, C.barkKnot);
      pix.set(kx + 1, top + 4, C.barkDark);
    }
    // a broken-off stub underneath
    const sx = left + 18 + Math.floor(rand() * Math.max(1, right - left - 40));
    const sy = top + under(sx) - 2;
    for (let s = 0; s < 5; s++) { pix.rect(sx - s, sy + s, 3, 1, s === 4 ? C.barkEdge : C.barkDark); pix.set(sx - s + 1, sy + s, C.bark); }
    // twigs with sprays of leaves, hanging below
    const sprays = 2 + Math.floor((right - left) / 30);
    for (let k = 0; k < sprays; k++) {
      const tx = left + 8 + Math.floor(rand() * (right - left - 16));
      let x = tx, y = top + under(tx) - 2;
      const len = 4 + Math.floor(rand() * 5);
      const lean = rand() < 0.5 ? -1 : 1;
      for (let s = 0; s < len; s++) { y += 1; if (s % 2) x += lean; pix.set(x, y, C.barkDark); }
      for (let l = 0; l < 4; l++) paintLeaf(pix, x, y, 5 + rand() * 4, 3 + rand() * 1.5, Math.PI / 2 + (rand() - 0.5) * 2.2, C.leaf);
    }
  }

  // The weaver queen (seen in the x-ray): the nest queen's picture in weaver green.
  const QUEEN_COLORS = { B: '#6f8a2e', H: '#a3b85a', k: '#7d6a26', d: '#a89040', Q: '#6a5420', W: '#9a8040', g: '#d8d8a0', V: '#4a3010', F: '#3b2a14' };

  // (NEST_ART) The weaver nest: an oval of leaves overlapping, darker underneath,
  // stitched with silk. Its inside (for the x-ray) is drawn as well.
  function paintLeafNest(pix, rand) {
    const n = nestShape();
    const inOval = (x, y) => {
      const dx = (x - n.cx) / n.rx, dy = (y - n.cy) / (y < n.cy ? n.ry : n.top + 2 - n.cy);
      return dx * dx + dy * dy <= 1 && y <= n.top + 2;
    };
    const box = { x: n.cx - n.rx - 1, y: n.cy - n.ry - 1, w: n.rx * 2 + 3, h: n.top + 4 - (n.cy - n.ry - 1) };
    const bits = new Uint8Array(box.w * box.h);
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) if (inOval(box.x + x, box.y + y)) bits[y * box.w + x] = 1;
    nestMask = { ...box, bits };
    // Back layer first: a dark fill, then rows of leaves from the top down.
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) if (inOval(x, y)) pix.set(x, y, C.leafShade[0]);
    const leaves = [];
    for (let k = 0; k < 70; k++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand());
      leaves.push({ x: n.cx + Math.cos(a) * d * n.rx * 0.95, y: n.cy + Math.sin(a) * d * n.ry * 0.95, turn: (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.9 });
    }
    leaves.sort((a, b) => a.y - b.y);
    for (const l of leaves) paintLeaf(pix, l.x, l.y, 9 + rand() * 5, 5 + rand() * 2, l.turn, l.y > n.cy + n.ry * 0.25 ? C.leafShade : C.leaf, inOval);
    // Silk stitching between the leaves: short pale threads.
    for (let k = 0; k < 14; k++) {
      let x = n.cx + (rand() - 0.5) * n.rx * 1.6, y = n.cy + (rand() - 0.6) * n.ry * 1.4;
      const dx = rand() < 0.5 ? 1 : -1;
      for (let s = 0; s < 4; s++) { if (inOval(x, y)) pix.set(x, y, s % 3 ? C.silk : C.silkDim); x += dx; if (s % 2) y += 1; }
    }
    // The outline.
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
      if (inOval(x, y) && (!inOval(x + 1, y) || !inOval(x - 1, y) || !inOval(x, y - 1))) pix.set(x, y, C.leaf[0]);
    }
    paintLeafInside(box, inOval, n, rand);
  }

  function paintLeafInside(box, inOval, n, rand) {
    const pix = makePix(box.w, box.h);
    const ox = box.x, oy = box.y;
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
      if (!inOval(ox + x, oy + y)) continue;
      const wall = !inOval(ox + x + 2, oy + y) || !inOval(ox + x - 2, oy + y) || !inOval(ox + x, oy + y - 2);
      pix.set(x, y, wall ? C.insideWall : (rand() < 0.07 ? C.insideDeep : C.inside));
    }
    // Silk sheets dividing the chambers.
    for (const fx of [-0.58, 0.58]) {
      const sx = Math.round(n.cx + fx * n.rx) - ox;
      for (let y = 0; y < box.h; y++) if (inOval(ox + sx, oy + y) && y % 3 !== 2) pix.set(sx, y, C.silkDim);
    }
    // Eggs and larvae in the side chambers, on the floor.
    const floor = n.top - oy;
    for (const side of [-1, 1]) {
      const at = Math.round(n.cx + side * n.rx * 0.78) - ox;
      for (const [dx, dy] of [[-2, 0], [0, 0], [2, 0], [-1, -1], [1, -1], [0, -2]]) { pix.set(at + dx, floor - 1 + dy, C.egg); }
      pix.rect(at + side * 5 - 1, floor - 2, 3, 2, C.larva);
    }
    const cv = pix.canvas();
    const g = cv.getContext('2d');
    // The queen in the middle chamber, and a worker by each pile.
    const q = Sprites.sizeOf('queen');
    Sprites.paint(g, 'queen', Math.round(n.cx - ox - q.cols / 2), floor - q.rows, QUEEN_COLORS);
    Sprites.paintTurned(g, 'weaverWorker', Math.round(n.cx - n.rx * 0.66) - ox, floor - 7, 'right', false);
    Sprites.paintTurned(g, 'weaverWorker', Math.round(n.cx + n.rx * 0.66) - ox, floor - 7, 'left', false);
    inside = { canvas: cv, x: ox, y: oy };
    makeXrayMask();
  }

  // The weaver nest: a few big leaves pulled together around
  // the branch into one lumpy bundle, their ends folded in to its edge, silk
  // in the seams. Plain colors, lit from the upper left. Its inside (for the
  // x-ray) is drawn as well.
  function nestBody(n) {
    // The lumpy oval the leaves are pulled into (scale < 1: a smaller one inside).
    return (x, y, scale) => {
      const dx = (x - n.cx) / n.rx, dy = (y - n.cy) / n.ry;
      const a = Math.atan2(dy, dx);
      const r = 1 + 0.1 * Math.sin(2 * a + 1) + 0.06 * Math.sin(5 * a + 2);
      return Math.sqrt(dx * dx + dy * dy) <= r * (scale || 1);
    };
  }

  // The nest's leaves, back ones first: where the stalk is (in shares of the
  // nest's width and height from its middle), which way the leaf points
  // (degrees, 0 = right, 90 = down), how long and how wide (shares of the
  // nest's height). Each is cut to the nest's outline.
  const NEST_LEAVES = [
    [0.0, -1.1, 90, 2.2, 1.3], [-1.0, -0.4, 50, 2.0, 1.1], [1.0, -0.5, 125, 2.0, 1.1],
    [-0.55, -1.0, 80, 2.1, 1.1], [0.6, -0.95, 105, 2.0, 1.0],
    [-0.9, 0.2, -15, 1.9, 0.9], [-0.1, -0.85, 70, 2.1, 1.0]
  ];
  // Colored like the nest view's ground: one flat color, darker seams and
  // outline, single specks. Drawn in 2 x 2 blocks.
  const NEST_LOOK = { fill: '#2a6320', lit: '#317029', shade: '#245a1c', vein: '#357a2c', seam: '#173c12', outline: '#10300c', speck: '#22561c', light: '#3a7a2c', silk: '#bfc8b4', block: 2 };

  function paintNest(pix) {
    const n = nestShape();
    const body = nestBody(n);
    const rand = seeded(23);
    const B = NEST_LOOK.block;
    const leaves = NEST_LEAVES.map(([fx, fy, deg, long, wide]) => {
      const turn = deg * Math.PI / 180;
      return { x: n.cx + fx * n.rx, y: n.cy + fy * n.ry, cos: Math.cos(turn), sin: Math.sin(turn), len: long * n.ry, wid: wide * n.ry };
    });
    // Which leaf is on top at a point (-1: none, the silk shows).
    const topLeaf = (px, py) => {
      for (let k = leaves.length - 1; k >= 0; k--) {
        const l = leaves[k], dx = px - l.x, dy = py - l.y;
        const u = dx * l.cos + dy * l.sin, v = -dx * l.sin + dy * l.cos;
        if (u < 0 || u > l.len) continue;
        const half = (l.wid / 2) * Math.pow(Math.sin(Math.PI * u / l.len), 0.7);
        if (Math.abs(v) <= half) { side[0] = v / half; along[0] = u / l.len; return k; }
      }
      return -1;
    };
    const side = [0], along = [0];   // (where on its leaf the last point found was: -1..1 across, 0..1 along)
    // Work in blocks: each block takes its look from its middle.
    const x0 = Math.floor((n.cx - n.rx * 1.3) / B) * B, y0 = Math.floor((n.cy - n.ry * 1.3) / B) * B;
    const bw = Math.ceil(n.rx * 2.6 / B) + 1, bh = Math.ceil(n.ry * 2.6 / B) + 1;
    const inBody = (bx, by) => bx >= 0 && by >= 0 && bx < bw && by < bh && body(x0 + bx * B + B / 2, y0 + by * B + B / 2);
    const leafAt = [], across = [], length = [];
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const i = by * bw + bx;
      leafAt[i] = inBody(bx, by) ? topLeaf(x0 + bx * B + B / 2, y0 + by * B + B / 2) : -2;
      across[i] = side[0]; length[i] = along[0];
    }
    const near = (bx, by) => (inBody(bx, by) ? leafAt[by * bw + bx] : -2);
    const box = { x: x0, y: y0, w: bw * B, h: bh * B };
    const bits = new Uint8Array(box.w * box.h);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const k = leafAt[by * bw + bx];
      if (k === -2) continue;
      const around = [near(bx + 1, by), near(bx - 1, by), near(bx, by + 1), near(bx, by - 1)];
      let color = NEST_LOOK.fill;
      if (around.includes(-2)) color = NEST_LOOK.outline;
      else if (k === -1) color = NEST_LOOK.silk;
      else if (around.some((m) => m > k)) color = NEST_LOOK.seam;   // the edge of a leaf lying over this one
      else {
        // a little shading: the leaf's lit half, its midrib, a shadow just under a leaf lying over it,
        // and the nest's lower right a shade darker
        const i = by * bw + bx, a = across[i];
        const under = near(bx, by - 2) > k || near(bx - 2, by) > k;
        const low = (bx * B + x0 - n.cx) / n.rx + (by * B + y0 - n.cy) / n.ry > 0.7;
        if (Math.abs(a) < 0.15 && length[i] > 0.15 && length[i] < 0.85) color = NEST_LOOK.vein;
        else if (under || low) color = NEST_LOOK.shade;
        else if (a < -0.35) color = NEST_LOOK.lit;
      }
      for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
        const px = x0 + bx * B + i, py = y0 + by * B + j;
        pix.set(px, py, color);
        bits[(py - y0) * box.w + (px - x0)] = 1;
      }
    }
    // single specks, a few lighter ones on the upper left
    for (let k = 0; k < 40; k++) {
      const px = Math.round(n.cx + (rand() - 0.5) * n.rx * 1.8), py = Math.round(n.cy + (rand() - 0.5) * n.ry * 1.8);
      const bx = Math.floor((px - x0) / B), by = Math.floor((py - y0) / B);
      if ([near(bx, by), near(bx + 1, by), near(bx - 1, by), near(bx, by + 1), near(bx, by - 1)].some((m) => m < 0)) continue;
      const lit = px < n.cx && py < n.cy && rand() < 0.5;
      pix.set(px, py, lit ? NEST_LOOK.light : NEST_LOOK.speck);
    }
    nestMask = { ...box, bits };
    paintInside(box, (x, y) => x >= x0 && y >= y0 && x < x0 + box.w && y < y0 + box.h && bits[(y - y0) * box.w + (x - x0)] === 1, body, n);
  }

  // The inside: a dark hollow with the branch running through it, and the
  // queen sitting on the branch.
  function paintInside(box, inNestShape, body, n) {
    const pix = makePix(box.w, box.h);
    const ox = box.x, oy = box.y;
    const top = n.top, bottom = top + BRANCH_CELLS * CELL;
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
      const px = ox + x, py = oy + y;
      if (!inNestShape(px, py)) continue;
      let color = body(px, py, 0.8) ? C.inside : C.insideWall;
      if (py >= top && py < bottom) color = py === top ? C.barkLight : py >= bottom - 2 ? C.barkDark : C.bark;
      pix.set(x, y, color);
    }
    // The queen (the nest queen's picture, in weaver colors) standing on the branch.
    const cv = pix.canvas();
    const q = Sprites.sizeOf('queen');
    Sprites.paint(cv.getContext('2d'), 'queen', Math.round(n.cx - q.cols / 2) - ox, top - q.rows - oy, QUEEN_COLORS);
    inside = { canvas: cv, x: ox, y: oy };
    makeXrayMask();
  }

  // The nest's outline alone (for Show queen: the front of the nest taken away).
  function makeShell() {
    const m = nestMask;
    const sh = makePix(m.w, m.h);
    const on = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.bits[y * m.w + x] === 1;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (on(x, y) && (!on(x + 1, y) || !on(x - 1, y) || !on(x, y + 1) || !on(x, y - 1))) sh.set(x, y, NEST_LOOK.outline);
    }
    shell = { canvas: sh.canvas(), x: m.x, y: m.y };
  }

  // A crisp circle, for cutting the x-ray out of the inside.
  function makeXrayMask() {
    makeShell();
    const m = makePix(XRAY * 2 + 1, XRAY * 2 + 1);
    for (let y = -XRAY; y <= XRAY; y++) for (let x = -XRAY; x <= XRAY; x++) if (x * x + y * y <= XRAY * XRAY) m.set(x + XRAY, y + XRAY, '#ffffff');
    xrayMask = m.canvas();
  }

  /* ---------- where workers can walk ---------- */

  // A cell an ant can stand in: a leaf (on top of it), or open air just
  // over a branch (on the branch).
  function standY(c, r) {
    if (!inGrid(c, r)) return null;
    if (isLeaf(c, r)) return r * CELL;   // (leaves can be on a branch too)
    if (isSolid(c, r)) return null;   // (a leaf under another still works as a step: ants walk along leaves)
    if (isSolid(c, r + 1) && c < trunkCol()) return (r + 1) * CELL;
    return null;
  }

  // `placed`: a leaf was just placed (a new branch reached is announced).
  function rebuild(placed) {
    leafSet = new Set(host ? host.leaves().filter(([c, r]) => inGrid(c, r) && !isTrunk(c)).map(([c, r]) => idx(c, r)) : []);
    nodes = new Map();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const y = standY(c, r);
      if (y !== null) nodes.set(idx(c, r), { c, r, y });
    }
    // From the lowest branch: across, or one cell up or down on a slant (never straight up or down).
    reach = new Set();
    const queue = [];
    const low = branchRect(0);
    for (let c = low.c0; c <= low.c1; c++) {
      const i = idx(c, low.r0 - 1);
      if (nodes.has(i)) { reach.add(i); queue.push(i); }
    }
    while (queue.length) {
      const i = queue.shift();
      const { c, r } = nodes.get(i);
      for (const dc of [-1, 1]) for (const dr of [-1, 0, 1]) {
        const j = idx(c + dc, r + dr);
        if (!inGrid(c + dc, r + dr) || reach.has(j) || !nodes.has(j)) continue;
        reach.add(j);
        queue.push(j);
      }
    }
    let count = 1;
    for (let n = 1; n < BRANCHES.length; n++) {
      const rect = branchRect(n);
      let got = false;
      for (let c = rect.c0; c <= rect.c1 && !got; c++) got = reach.has(idx(c, rect.r0 - 1));
      if (got) count = n + 1; else break;
    }
    if (placed && count > reachedCount) {
      const more = host.boostText ? ' ' + host.boostText(count) : '';
      note = { text: (count === BRANCHES.length ? 'Top branch!' : 'Branch ' + count + '!') + more, until: Date.now() + 3000 };
      host.reached(count);
    }
    reachedCount = count;
    showBranchNotes();
    for (const w of walkers) if (!reach.has(w.node)) { w.node = pickHome(); w.path = []; }
  }

  // A line of small text on each branch not reached yet, saying what reaching
  // it does (from host.branchInfo); it goes once the branch is reached.
  let branchNotes = [];
  function showBranchNotes() {
    if (!host || !host.branchInfo || !wrap || !W) return;
    if (branchNotes.length === 0) {
      for (let n = 1; n < BRANCHES.length; n++) {
        const span = document.createElement('span');
        span.className = 'px branch-note';
        wrap.appendChild(span);
        branchNotes[n] = span;
      }
    }
    for (let n = 1; n < BRANCHES.length; n++) {
      const span = branchNotes[n];
      const text = n >= reachedCount ? host.branchInfo(n + 1) : '';
      span.hidden = !text;
      if (!text) continue;
      PixelFont.write(span, text, { small: true });
      const rect = branchRect(n);
      span.style.left = (rect.c0 * CELL + 2) / W * 100 + '%';
      span.style.top = (rect.r0 * CELL - 6) / H * 100 + '%';
    }
  }

  // Can a leaf go in cell (c, r)? In the air: touching a branch, the trunk or
  // another leaf. On a branch (a log): only next to one of your leaves.
  // (Touching counts sides and corners. Never on the trunk.)
  function leafOk(c, r) {
    if (!inGrid(c, r) || isTrunk(c) || isLeaf(c, r)) return false;
    const onLog = isSolid(c, r);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue;
      if (isLeaf(c + dc, r + dr)) return true;
      if (!onLog && isSolid(c + dc, r + dr)) return true;
    }
    return false;
  }

  /* ---------- the workers ---------- */

  function reachList() { return [...reach]; }
  function pickHome() {
    const nest = nestShape();
    const near = reachList().filter((i) => Math.abs(nodes.get(i).c * CELL - nest.cx) < nest.rx);
    const list = near.length ? near : reachList();
    return list[Math.floor(Math.random() * list.length)];
  }

  function pathTo(from, to) {
    const prev = new Map([[from, -1]]);
    const queue = [from];
    while (queue.length) {
      const i = queue.shift();
      if (i === to) break;
      const { c, r } = nodes.get(i);
      for (const dc of [-1, 1]) for (const dr of [-1, 0, 1]) {
        const j = idx(c + dc, r + dr);
        if (!inGrid(c + dc, r + dr) || prev.has(j) || !reach.has(j)) continue;
        prev.set(j, i);
        queue.push(j);
      }
    }
    if (!prev.has(to)) return [];
    const path = [];
    for (let i = to; i !== from; i = prev.get(i)) path.unshift(i);
    return path;
  }

  function syncWalkers() {
    const want = Math.min(MOST_SHOWN, host ? host.workers() : 0);
    while (walkers.length < want && reach.size) walkers.push({ node: pickHome(), path: [], from: null, at: 0, facing: 'right', pose: 0 });
    walkers.length = Math.min(walkers.length, want);
  }

  function stepWalkers(now) {
    for (const w of walkers) {
      if (now < w.at + WALK_MS) continue;
      if (!reach.has(w.node)) { w.node = pickHome(); w.path = []; }
      if (w.path.length === 0) {
        if (Math.random() < 0.3) { w.at = now + Math.random() * 1500; w.from = null; continue; }   // a rest now and then
        const list = reachList();
        w.path = pathTo(w.node, list[Math.floor(Math.random() * list.length)]).slice(0, 40);
        if (w.path.length === 0) { w.at = now; continue; }
      }
      const next = w.path.shift();
      w.from = w.node;
      w.node = next;
      w.at = now;
      w.pose = 1 - w.pose;
      const a = nodes.get(w.from), b = nodes.get(next);
      if (a && b && a.c !== b.c) w.facing = b.c > a.c ? 'right' : 'left';
    }
  }

  /* ---------- drawing ---------- */

  function draw(now) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0);
    drawLeaves(ctx);
    drawWalkers(ctx, now);
    if (host.showQueen && host.showQueen() && inside && shell) {   // the front of the nest taken away
      ctx.drawImage(inside.canvas, inside.x, inside.y);
      ctx.drawImage(shell.canvas, shell.x, shell.y);
    } else if (mouse) drawXray(ctx, mouse.x, mouse.y);
    if (leafTool && mouse) drawPreview(ctx);
    if (note && now < note.until) drawNote(ctx, note.text);
  }

  // A placed leaf: a small leaf tile, its edge dark where no leaf joins it, a midrib down the slant.
  function drawLeaves(g) {
    if (!ART) { drawPlainLeaves(g); return; }
    for (const i of leafSet) {
      const c = i % cols, r = (i - c) / cols;
      const x = c * CELL, y = r * CELL;
      g.fillStyle = C.leaf[1];
      g.fillRect(x, y, CELL, CELL);
      g.fillStyle = C.leaf[2];
      g.fillRect(x + 1, y, 2, 1);
      g.fillStyle = C.leaf[3];
      g.fillRect(x + 1, y + 2, 1, 1);
      g.fillRect(x + 2, y + 1, 1, 1);
      g.fillStyle = C.leaf[0];
      if (!isLeaf(c, r + 1)) g.fillRect(x, y + CELL - 1, CELL, 1);
      if (!isLeaf(c - 1, r) && !isLeaf(c - 1, r + 1) && !isLeaf(c - 1, r - 1)) g.fillRect(x, y, 1, CELL);
      if (!isLeaf(c + 1, r) && !isLeaf(c + 1, r + 1) && !isLeaf(c + 1, r - 1)) g.fillRect(x + CELL - 1, y, 1, CELL);
      if (!isLeaf(c, r - 1)) { g.fillRect(x, y, 1, 1); g.fillRect(x + CELL - 1, y, 1, 1); }
      // silk to the leaf below and beside it, on the slant
      g.fillStyle = C.silk;
      if (isLeaf(c + 1, r - 1)) g.fillRect(x + CELL - 1, y, 1, 1);
      if (isLeaf(c - 1, r - 1)) g.fillRect(x, y, 1, 1);
    }
  }

  // A placed leaf in the plain scene: a green square, edged where no leaf joins it.
  function drawPlainLeaves(g) {
    for (const i of leafSet) {
      const c = i % cols, r = (i - c) / cols;
      const x = c * CELL, y = r * CELL;
      g.fillStyle = '#5f9a2f';
      g.fillRect(x, y, CELL, CELL);
      g.fillStyle = '#9fd06a';
      g.fillRect(x + 1, y + 1, CELL - 2, 1);
      g.fillStyle = '#2f5a1c';
      if (!isLeaf(c, r + 1)) g.fillRect(x, y + CELL - 1, CELL, 1);
      if (!isLeaf(c - 1, r)) g.fillRect(x, y, 1, CELL);
      if (!isLeaf(c + 1, r)) g.fillRect(x + CELL - 1, y, 1, CELL);
    }
  }

  function drawFalling(g, now) {
    while (falling.length < FALLING) falling.push({ x: Math.random() * (W - TRUNK), y: -4 - Math.random() * H, sway: Math.random() * 6, speed: 0.008 + Math.random() * 0.006 });
    for (const f of falling) {
      f.y += f.speed * 16;
      if (f.y > H + 4) { f.y = -4; f.x = Math.random() * (W - TRUNK); }
      const x = Math.round(f.x + Math.sin(now / 700 + f.sway) * 3), y = Math.round(f.y);
      const flip = Math.sin(now / 500 + f.sway) > 0;
      g.fillStyle = C.leaf[0];
      g.fillRect(x, y + (flip ? 1 : 0), 1, 1);
      g.fillRect(x + 3, y + (flip ? 0 : 1), 1, 1);
      g.fillStyle = C.leaf[2];
      g.fillRect(x + 1, y, 2, 2);
    }
  }

  function drawWalkers(g, now) {
    for (const w of walkers) {
      const b = nodes.get(w.node);
      if (!b) continue;
      let x = b.c * CELL + CELL / 2, y = b.y;
      const a = w.from !== null && nodes.get(w.from);
      const t = Math.min(1, Math.max(0, (now - w.at) / WALK_MS));
      if (a && t < 1) { x = a.c * CELL + CELL / 2 + (x - (a.c * CELL + CELL / 2)) * t; y = a.y + (y - a.y) * t; }
      Sprites.paintTurned(g, w.pose ? 'weaverWorkerStep' : 'weaverWorker', Math.round(x), Math.round(y) - 2, w.facing, false);
    }
  }

  function inNest(x, y) {
    if (!nestMask) return false;
    const px = Math.round(x) - nestMask.x, py = Math.round(y) - nestMask.y;
    return px >= 0 && py >= 0 && px < nestMask.w && py < nestMask.h && nestMask.bits[py * nestMask.w + px] === 1;
  }

  // Through the nest wall: a crisp circle at the mouse showing the inside,
  // cut to the nest, with a pale rim.
  function drawXray(g, x, y) {
    if (!inNest(x, y) || !inside) return;
    const mx = Math.round(x), my = Math.round(y);
    const cut = document.createElement('canvas');
    cut.width = inside.canvas.width; cut.height = inside.canvas.height;
    const cg = cut.getContext('2d');
    cg.drawImage(inside.canvas, 0, 0);
    cg.globalCompositeOperation = 'destination-in';
    cg.drawImage(xrayMask, mx - XRAY - inside.x, my - XRAY - inside.y);
    g.drawImage(cut, inside.x, inside.y);
    g.fillStyle = C.ring;
    for (let y = -XRAY - 1; y <= XRAY + 1; y++) for (let x = -XRAY - 1; x <= XRAY + 1; x++) {
      const d = x * x + y * y;
      if (d > XRAY * XRAY && d <= (XRAY + 1) * (XRAY + 1) && inNest(mx + x, my + y)) g.fillRect(mx + x, my + y, 1, 1);
    }
  }

  function drawPreview(g) {
    const c = Math.floor(mouse.x / CELL), r = Math.floor(mouse.y / CELL);
    if (!inGrid(c, r) || isTrunk(c)) return;
    g.fillStyle = leafOk(c, r) ? C.good : C.bad;
    const x = c * CELL, y = r * CELL;
    g.fillRect(x, y, CELL, 1); g.fillRect(x, y + CELL - 1, CELL, 1);
    g.fillRect(x, y, 1, CELL); g.fillRect(x + CELL - 1, y, 1, CELL);
  }

  // A line of the game's pixel letters near the top of the canopy, white on a dark shadow.
  function drawNote(g, text) {
    const glyphs = PixelFont.GLYPHS;
    const chars = [...text].filter((ch) => ch === ' ' || glyphs[ch]);
    let x = Math.round((W - TRUNK - chars.length * 6) / 2);
    const y = Math.round(H * 0.4);   // (between branches 2 and 3, clear of the branch notes)
    for (const ch of chars) {
      if (ch !== ' ') {
        glyphs[ch].split(' ').forEach((row, r) => [...row].forEach((p, c) => {
          if (p !== '#') return;
          g.fillStyle = C.barkEdge; g.fillRect(x + c + 1, y + r + 1, 1, 1);
          g.fillStyle = C.good; g.fillRect(x + c, y + r, 1, 1);
        }));
      }
      x += 6;
    }
  }

  /* ---------- running ---------- */

  function loop() {
    if (!showing) return;
    const now = Date.now();
    syncWalkers();
    stepWalkers(now);
    draw(now);
    requestAnimationFrame(loop);
  }

  function toCanopy(event) {
    const box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width * W, y: (event.clientY - box.top) / box.height * H };
  }

  function tryLeaf() {
    if (!leafTool || !mouse || !host) return;
    const c = Math.floor(mouse.x / CELL), r = Math.floor(mouse.y / CELL);
    if (!leafOk(c, r)) return;
    if (host.placeLeaf(c, r)) rebuild(true);
  }

  /* ---------- the trip up and down ---------- */

  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // The sky between the nest and the canopy: the trunk going up the right side, a few clouds.
  function paintGap(gap) {
    const rand = seeded(11);
    const pix = makePix(W, gap);
    if (!ART) {   // plain: pale sky, lighter lower down, a flat trunk
      const a = rgb(C.plainSky), b = rgb('#9fd6ef');
      for (let y = 0; y < gap; y++) {
        const t = y / gap, hex = '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
        pix.rect(0, y, W, 1, hex);
      }
      pix.rect(W - TRUNK, 0, TRUNK, gap, C.plainBranch);
      pix.rect(W - TRUNK, 0, 2, gap, C.plainBranchDark);
      return pix.canvas();
    }
    pix.rect(0, 0, W, gap, C.sky);
    for (let k = 0; k < 5; k++) {
      const cx = Math.round(rand() * (W - TRUNK - 30) + 15), cy = Math.round(rand() * gap), r = 6 + Math.round(rand() * 6);
      for (let y = -r; y <= 0; y++) for (let x = -r * 2; x <= r * 2; x++) if (x * x / 4 + y * y * 2 <= r * r) pix.set(cx + x, cy + y, y > -2 ? C.cloudShade : C.cloud);
    }
    const bend = Math.round(gap * 0.6);
    paintTrunk(pix, 0, gap, rand, H, bend);
    // a twig or two off the trunk, with leaves
    for (let k = 0; k < 3; k++) {
      let y = Math.round(rand() * bend * 0.9), x = trunkEdge(H + y);
      for (let s = 0; s < 8; s++) { pix.set(x, y, C.barkDark); x -= 1; if (s % 3 === 2) y -= 1; }
      for (let l = 0; l < 3; l++) paintLeaf(pix, x, y, 6 + rand() * 3, 3.5, Math.PI + (rand() - 0.5) * 2, C.leaf);
    }
    return pix.canvas();
  }

  // Scroll between the nest (the field) and the canopy, through the sky and up the trunk.
  function trip(up, ms, done) {
    busy = true;
    layout();
    rebuild();
    draw(Date.now());
    const field = document.createElement('canvas');
    field.width = W; field.height = H;
    const fctx = field.getContext('2d');
    fctx.imageSmoothingEnabled = false;
    if (host.fieldCanvas) fctx.drawImage(host.fieldCanvas, 0, 0, host.fieldCanvas.width, host.fieldCanvas.height, 0, 0, W, H);
    const top = document.createElement('canvas');
    top.width = W; top.height = H;
    top.getContext('2d').drawImage(canvas, 0, 0);
    const gap = Math.round(H * TRIP.gap);
    const sky = paintGap(gap);
    tripCanvas.width = W; tripCanvas.height = H;
    tripCanvas.hidden = false;
    const span = gap + H;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const k = ease(up ? t : 1 - t);
      const off = Math.round(k * span);   // 0: the field fills the view; span: the canopy does
      const g = tripCtx;
      g.imageSmoothingEnabled = false;
      g.drawImage(sky, 0, off - gap);
      g.drawImage(field, 0, off);
      g.drawImage(top, 0, off - span);
      if (t < 1) { requestAnimationFrame(step); return; }
      tripCanvas.hidden = true;
      busy = false;
      done();
    };
    requestAnimationFrame(step);
  }

  /* ---------- outside ---------- */

  function init(options) {
    host = options;
    wrap = options.wrap;
    canvas = options.canvas;
    ctx = canvas.getContext('2d');
    tripCanvas = options.tripCanvas;
    tripCtx = tripCanvas.getContext('2d');
    canvas.addEventListener('mousemove', (e) => { mouse = toCanopy(e); if (painting) tryLeaf(); });
    canvas.addEventListener('mouseleave', () => { mouse = null; painting = false; });
    canvas.addEventListener('mousedown', (e) => { mouse = toCanopy(e); if (leafTool) { painting = true; tryLeaf(); } });
    window.addEventListener('mouseup', () => { painting = false; });
  }

  // Go up (fast: by the arrow, a quick trip).
  function open(fast, done) {
    if (showing || busy) return;
    trip(true, fast ? TRIP.fastMs : TRIP.firstMs, () => {
      showing = true;
      wrap.hidden = false;
      layout();
      rebuild();
      loop();
      if (done) done();
    });
  }

  function close(done) {
    if (!showing || busy) return;
    showing = false;
    leafTool = false;
    wrap.hidden = true;
    trip(false, TRIP.fastMs, () => { if (done) done(); });
  }

  return {
    init, open, close,
    isOpen: () => showing,
    busy: () => busy,
    setLeafTool: (on) => { leafTool = !!on; },
    leafTool: () => leafTool,
    refresh: () => { if (W) rebuild(); },
    reached: () => reachedCount,
    branches: () => BRANCHES.length,
    // Elevation: how many rows above the lowest branch's top a leaf in row r is
    // (0: the first step, on the branch; never below 0). Leaves cost more higher up.
    levelOf: (r) => (W ? Math.max(0, branchRect(0).r0 - 1 - r) : 0),
    // The elevation of branch n's top (0 for the lowest).
    branchLevel: (n) => (W ? branchRect(0).r0 - branchRect(n).r0 : 0),
    // The elevation of the cell under the mouse, while placing leaves there is allowed; else null.
    hoverLevel: () => {
      if (!leafTool || !mouse || !W) return null;
      const c = Math.floor(mouse.x / CELL), r = Math.floor(mouse.y / CELL);
      return leafOk(c, r) ? Math.max(0, branchRect(0).r0 - 1 - r) : null;
    },
    // The elevation of the next step up from the highest place the workers reach.
    nextLevel: () => {
      if (!W || !nodes) return 0;
      const top = branchRect(0).r0 - 1;
      let best = 0;
      for (const i of reach) {
        const node = nodes.get(i);
        if (!node) continue;
        best = Math.max(best, top - node.r + (isLeaf(node.c, node.r) ? 1 : 0));   // (on a leaf: the step above it; on a branch: that row)
      }
      return Math.max(0, best);
    },
    // (for checking)
    debug: () => ({ W, H, cols, rows, reach: reach.size, nodes: nodes ? nodes.size : 0, reachedCount, walkers: walkers.length, branch: (n) => branchRect(n), leafOk, nest: nestShape() })
  };
})();
