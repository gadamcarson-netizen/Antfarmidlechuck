/*
 * The fire ant nest (Ants menu, after the Fire ant slavemaking invasion is
 * beaten): a small picture in place of the fire ant count. A fire ant queen
 * lies on the left with room for 5 eggs beside her. One of your little
 * black workers goes from egg to egg, marking each with your colony's
 * scent while it develops. A fire ant that hatches walks off the right
 * edge; field.js then has it come in over the grass and join the colony.
 *
 * It is only for looking at: popup.js keeps the eggs (setEggs) and says when
 * one hatched (hatched).
 */

'use strict';

const FireNest = (() => {
  const PIXEL = 2;
  const WIDTH = 64;
  const HEIGHT = 22;
  const FLOOR = 17;            // the row the ants and eggs stand on
  const SPOTS = [24, 30, 36, 42, 48];   // the middle of each egg spot, across
  const SPEED = 12;            // the worker's pace, in pixels a second
  const LEAVE_SPEED = 20;      // a new fire ant walking out
  const MARK_MS = 1400;        // how long the worker stays at an egg
  const PUFF_MS = 160;         // the scent puff changes this often

  const COLORS = { dirt: '#502e0e', speck: '#414141', cave: '#8d7241' };

  // The fire ant queen, facing right: a big orange gaster with dark bands
  // between its segments, a red-orange thorax and head.
  const QUEEN = [
    '..oooooo.........L',
    '.oOhhOohO.....rRL.',
    'oOOOoOOoOo.rRRRkR.',
    'oOOOoOOoOorRRRRRRV',
    '.oOOoOOoOo.rRR.rr.',
    '..oooooo..L.L.L...',
    '.........L..L...L.'
  ];
  const QUEEN_COLORS = {
    o: '#5e2410', O: '#d8692c', h: '#f2a66a', r: '#8f2f12', R: '#c24a1e',
    k: '#1a0a06', V: '#5a1a0c', L: '#9c3a18'
  };
  const QUEEN_AT = { x: 2, y: FLOOR - QUEEN.length + 1 };

  const PUFF = ['#fbf4c6', '#eadea0'];   // the scent: the same pale yellow as the alarm pheromone cloud

  let canvas = null;
  let ctx = null;
  let base = null;
  let eggs = [];               // [{ spot, laidAt, hatchAt }]
  let leaving = [];            // new fire ants walking out: [{ startedAt, fromX }]
  const visits = new Map();    // when the worker last marked each egg (by eggKey)
  const eggKey = (egg) => egg.spot + ':' + egg.hatchAt;
  const worker = { x: 18, target: null, markUntil: 0, facing: 'right', lastAt: 0, pose: 0, stepAt: 0 };

  // Open space: a chamber with a flat floor, and a passage out of the right edge.
  function isOpen(x, y) {
    if (y > FLOOR + 1) return false;
    if (x >= 54 && y >= FLOOR - 5) return true;                 // the passage out
    const dx = (x - 28) / 27;
    const dy = (y - (FLOOR + 1)) / 14;
    return dx * dx + dy * dy <= 1;
  }

  function hashAt(i) {
    let h = (i * 2654435761) >>> 0;
    h = ((h ^ (h >>> 15)) * 2246822519) >>> 0;
    return ((h ^ (h >>> 13)) >>> 0) % 1000 / 1000;
  }

  function drawBase() {
    base = document.createElement('canvas');
    base.width = WIDTH;
    base.height = HEIGHT;
    const g = base.getContext('2d');
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        g.fillStyle = isOpen(x, y) ? COLORS.cave : hashAt(y * WIDTH + x) < 0.06 ? COLORS.speck : COLORS.dirt;
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  function paintRows(rows, colors, x, y) {
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const color = colors[rows[r][c]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  }

  // The worker: to the next egg that is waiting longest for a visit, a
  // pause there, then the next. With no eggs it rests by the queen.
  function moveWorker(now) {
    const passed = worker.lastAt ? Math.min(now - worker.lastAt, 200) : 0;
    worker.lastAt = now;
    if (now < worker.markUntil) return false;
    if (!worker.target || !eggs.some((egg) => egg.spot === worker.target.spot)) {
      const waiting = eggs.slice().sort((a, b) => (visits.get(eggKey(a)) || 0) - (visits.get(eggKey(b)) || 0));
      worker.target = waiting.length ? waiting[0] : null;
    }
    const goal = worker.target ? SPOTS[worker.target.spot] + 4 : 19;   // stands just right of the egg, facing it
    const gap = goal - worker.x;
    if (Math.abs(gap) < 0.5) {
      if (worker.target) {
        worker.facing = 'left';
        worker.markUntil = now + MARK_MS;
        visits.set(eggKey(worker.target), now);
        worker.target = null;
      }
      return false;
    }
    worker.facing = gap > 0 ? 'right' : 'left';
    worker.x += Math.sign(gap) * Math.min(Math.abs(gap), SPEED * passed / 1000);
    if (now >= worker.stepAt) {
      worker.pose = 1 - worker.pose;
      worker.stepAt = now + 150;
    }
    return true;
  }

  function draw() {
    if (!canvas || canvas.offsetParent === null) return;   // not showing
    const now = Date.now();
    const walking = moveWorker(now);
    ctx.drawImage(base, 0, 0);
    paintRows(QUEEN, QUEEN_COLORS, QUEEN_AT.x, QUEEN_AT.y);

    // Eggs, then pupae halfway to hatching (the same pictures as the main nest).
    for (const egg of eggs) {
      const pupa = now >= (egg.laidAt + egg.hatchAt) / 2;
      const name = pupa ? 'pupa' : 'egg';
      const art = Sprites.sizeOf(name);
      Sprites.paint(ctx, name, SPOTS[egg.spot] - Math.floor(art.cols / 2), FLOOR - art.rows + 1);
    }

    // The worker, and the scent it leaves while it stays at an egg.
    Sprites.paintTurned(ctx, walking && worker.pose ? 'walkerStep' : 'walker', Math.round(worker.x), FLOOR - 1, worker.facing);
    if (now < worker.markUntil) {
      const spotX = Math.round(worker.x) - 4;
      const frame = Math.floor(now / PUFF_MS);
      for (let n = 0; n < 4; n++) {
        const seed = hashAt(frame * 7 + n);
        ctx.fillStyle = PUFF[n % 2];
        ctx.fillRect(spotX - 2 + Math.floor(seed * 5), FLOOR - 3 - Math.floor(hashAt(frame * 13 + n) * 4), 1, 1);
      }
    }

    // New fire ants walking out to the right.
    leaving = leaving.filter((ant) => ant.fromX + LEAVE_SPEED * (now - ant.startedAt) / 1000 < WIDTH + 6);
    for (const ant of leaving) {
      const x = Math.round(ant.fromX + LEAVE_SPEED * (now - ant.startedAt) / 1000);
      Sprites.paintTurned(ctx, Math.floor(now / 120) % 2 ? 'fireAntStep' : 'fireAnt', x, FLOOR - 1, 'right');
    }
  }

  function start(target) {
    canvas = target;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.style.width = WIDTH * PIXEL + 'px';
    canvas.style.height = HEIGHT * PIXEL + 'px';
    ctx = canvas.getContext('2d');
    drawBase();
    setInterval(draw, 50);
  }

  // The eggs popup.js has: [{ spot (0-4), laidAt, hatchAt }].
  function setEggs(list) {
    eggs = list;
    for (const key of visits.keys()) if (!eggs.some((egg) => eggKey(egg) === key)) visits.delete(key);
  }

  // The egg in `spot` hatched: the new fire ant walks out.
  function hatched(spot) {
    leaving.push({ fromX: SPOTS[spot] || SPOTS[0], startedAt: Date.now() });
  }

  return { start, setEggs, hatched, SPOTS, WALK_OUT_MS: Math.round((WIDTH - SPOTS[0]) / LEAVE_SPEED * 1000) };
})();
