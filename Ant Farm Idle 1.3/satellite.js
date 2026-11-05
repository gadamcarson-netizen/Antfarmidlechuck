/*
 * The satellite colonies (Mega colony and Polydomy honeydew upgrades): tiny
 * nests drawn in their own small windows over the field. They are only for
 * looking at: the food they make is counted in popup.js.
 * Satellite.create(look) makes one view; `look` can change the dirt, the
 * queen's colors, and mirror the whole nest left to right.
 *
 * Layout, in game pixels (one game pixel = 2 screen pixels): a tunnel comes
 * down from the top on the right into a wide chamber with the queen. A side
 * passage off the tunnel holds two granaries, always full: each seed turns
 * into ant bread, then a new seed takes its place. One worker wanders the
 * nest, climbs out of the top now and then, and comes back.
 */

'use strict';

const Satellite = (() => {
  const PIXEL = 2;
  const WIDTH = 66;
  const HEIGHT = 46;

  const COLORS = {
    dirt: '#2b1707',      // much darker than the main field's dirt
    speck: '#3a3a3a',
    tunnel: '#8d7241',
    straw: ['#e2c46a', '#c9a24a', '#a8823a', '#f0d88a']
  };

  // The second satellite (Polydomy): mirrored, light sandy dirt with darker
  // tunnels, and a queen darker than the main one.
  const SECOND = {
    mirror: true,
    colors: { dirt: '#d9c08e', speck: '#b39a68', tunnel: '#8d7241' },
    queen: {
      B: '#040202', H: '#161010', k: '#000000', d: '#141414', g: '#2e2e2e',
      Q: '#060303', W: '#1a1211', F: '#070302', V: '#1a0804'
    }
  };

  // The queen, lighter than the main queen: a reddish brown.
  const LIGHT_QUEEN = {
    B: '#5a3a30', H: '#8a6a5e', k: '#3e2b24', d: '#6e5a52', g: '#b5aca8',
    Q: '#5e3a2c', W: '#8c6a5a', F: '#4a2e24', V: '#7a3020'
  };
  const QUEEN_AT = { x: 9, bottom: 39 };

  // Open space: the tunnel, the side passage and the chamber.
  const TUNNEL = { left: 44, right: 51, bottom: 27 };
  const PASSAGE = { top: 13, bottom: 20, left: 18, right: 51 };
  const CHAMBER = { cx: 32, cy: 33, half: 26, roof: 9, flatTo: 35, inset: [1, 2, 3, 5] };   // rows below flatTo step in

  // Two granaries in the side passage: straw in their bottom 3 rows.
  const GRANARIES = [22, 32];
  const GRANARY = { width: 8, strawTop: 18, strawBottom: 20 };
  const BREAD_CYCLE_MS = 20000;   // a seed for the first half, ant bread for the second

  // The worker's round trip: points in order, walked at SPEED, with a pause
  // at some. y is the middle of the ant; y below 0 is off the top.
  const SPEED = 14;               // pixels a second
  const STEP_MS = 150;            // leg pictures swap this often
  const FLOOR = 38;
  const SHELF = 19;
  const ROUTE = [
    { x: 48, y: FLOOR },
    { x: 14, y: FLOOR, pause: 1500 },
    { x: 48, y: FLOOR },
    { x: 48, y: -5, pause: 5000 },   // out of the top, gone for a while
    { x: 48, y: SHELF },
    { x: 42, y: SHELF, pause: 2500 }, // at the granaries
    { x: 48, y: SHELF },
    { x: 48, y: FLOOR },
    { x: 30, y: FLOOR, pause: 1200 }
  ];


  function isOpen(x, y) {
    if (x >= TUNNEL.left && x <= TUNNEL.right && y >= 0 && y <= TUNNEL.bottom) return true;
    if (y >= PASSAGE.top && y <= PASSAGE.bottom && x <= PASSAGE.right) {
      const slant = Math.max(0, 2 - (y - PASSAGE.top));   // the far end's top corner is rounded
      if (x >= PASSAGE.left + slant) return true;
    }
    const dy = y - CHAMBER.cy;
    if (dy < -CHAMBER.roof || y > CHAMBER.flatTo + CHAMBER.inset.length) return false;
    let half = CHAMBER.half;
    if (dy < 0) half = Math.round(CHAMBER.half * Math.sqrt(1 - (dy / CHAMBER.roof) ** 2));
    else if (y > CHAMBER.flatTo) half -= CHAMBER.inset[y - CHAMBER.flatTo - 1];
    return Math.abs(x - CHAMBER.cx) <= half;
  }

  // The same mixing as the main field, so the specks and straw look alike.
  function hashAt(i, salt) {
    let h = ((i + salt * 7919) * 2654435761) >>> 0;
    h = ((h ^ (h >>> 15)) * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 10000) / 10000;
  }

  // Where the worker is `ms` into its round trip: { x, y, heading, moving }.
  function workerAt(ms) {
    const legs = [];
    let total = 0;
    for (let n = 0; n < ROUTE.length; n++) {
      const from = ROUTE[n];
      const to = ROUTE[(n + 1) % ROUTE.length];
      const walk = (Math.abs(to.x - from.x) + Math.abs(to.y - from.y)) / SPEED * 1000;
      legs.push({ from, to, walk, pause: to.pause || 0 });
      total += walk + (to.pause || 0);
    }
    let t = ms % total;
    for (const leg of legs) {
      const heading = leg.to.x > leg.from.x ? 'right' : leg.to.x < leg.from.x ? 'left' : leg.to.y < leg.from.y ? 'up' : 'down';
      if (t < leg.walk) {
        const f = t / leg.walk;
        return { x: Math.round(leg.from.x + (leg.to.x - leg.from.x) * f), y: Math.round(leg.from.y + (leg.to.y - leg.from.y) * f), heading, moving: true };
      }
      t -= leg.walk;
      if (t < leg.pause) return { x: leg.to.x, y: leg.to.y, heading, moving: false };
      t -= leg.pause;
    }
    return { x: ROUTE[0].x, y: ROUTE[0].y, heading: 'right', moving: false };
  }


  // One satellite view, drawn on `target` while started.
  function create(look = {}) {
    const colors = Object.assign({}, COLORS, look.colors || {});
    let canvas = null;
    let ctx = null;
    let base = null;           // dirt, tunnels and straw, drawn once
    let work = null;           // each frame is drawn here, then copied (mirrored or not) to the window
    let timer = null;
    let started = 0;

    function drawBase() {
      base = document.createElement('canvas');
      base.width = WIDTH;
      base.height = HEIGHT;
      const g = base.getContext('2d');
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const i = y * WIDTH + x;
          const straw = y >= GRANARY.strawTop && y <= GRANARY.strawBottom &&
            GRANARIES.some((left) => x >= left && x < left + GRANARY.width);
          if (straw) g.fillStyle = colors.straw[Math.floor(hashAt(i, 2) * colors.straw.length)];
          else if (isOpen(x, y)) g.fillStyle = colors.tunnel;
          else g.fillStyle = hashAt(i, 5) < 0.06 ? colors.speck : colors.dirt;
          g.fillRect(x, y, 1, 1);
        }
      }
    }


    function draw() {
      const now = performance.now();
      const ms = now - started;
      const g = work.getContext('2d');
      g.drawImage(base, 0, 0);

      // The granaries: seed, then ant bread, the second half a cycle behind.
      GRANARIES.forEach((left, n) => {
        const phase = (Date.now() + n * BREAD_CYCLE_MS / 2) % BREAD_CYCLE_MS;
        const name = phase < BREAD_CYCLE_MS / 2 ? 'seed' : 'antBread';
        const art = Sprites.sizeOf(name);
        // Sitting on top of the straw, so all of it shows.
        if (name === 'seed') Sprites.paintSeed(g, 'sunflower', left + Math.floor(GRANARY.width / 2), GRANARY.strawTop - 1);
        else Sprites.paint(g, name, left + Math.floor((GRANARY.width - art.cols) / 2), GRANARY.strawTop - art.rows);
      });

      Sprites.paint(g, 'queen', QUEEN_AT.x, QUEEN_AT.bottom - Sprites.sizeOf('queen').rows + 1, look.queen || LIGHT_QUEEN);

      const ant = workerAt(ms);
      const pose = ant.moving && Math.floor(ms / STEP_MS) % 2 ? 'walkerStep' : 'walker';
      Sprites.paintTurned(g, pose, ant.x, ant.y, ant.heading);

      // Onto the window, mirrored left to right for a mirrored nest.
      ctx.save();
      if (look.mirror) {
        ctx.translate(WIDTH, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(work, 0, 0);
      ctx.restore();
    }

    function start(target) {
      canvas = target;
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      canvas.style.width = WIDTH * PIXEL + 'px';
      canvas.style.height = HEIGHT * PIXEL + 'px';
      ctx = canvas.getContext('2d');
      if (!base) drawBase();
      if (!work) {
        work = document.createElement('canvas');
        work.width = WIDTH;
        work.height = HEIGHT;
      }
      if (!started) started = performance.now();
      draw();
      if (!timer) timer = setInterval(draw, 50);
    }

    function stop() {
      clearInterval(timer);
      timer = null;
    }

    return { start, stop };
  }

  return { create, SECOND, WIDTH, HEIGHT };
})();
