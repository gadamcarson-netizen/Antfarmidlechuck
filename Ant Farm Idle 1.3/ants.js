/*
 * The ants that walk around the tunnels and chambers.
 *
 * Each one takes a step every so often, mostly keeps going the way it is
 * facing, sometimes turns, and now and then stops for a rest. Their legs
 * swap between two poses with every step.
 *
 * Now and then a worker heads up the tunnel to the surface, walks around on
 * the grass for a while, and comes back down to the main chamber. While a
 * bread crumb is lying on the grass, workers up there walk over to it, take
 * a few pixels of it, and carry them down to the queen, which brings in
 * that much food. Workers set off for a crumb one at a time, a few seconds
 * apart. Soldiers go up far less often; when one does, it pushes a crumb
 * half of the way to the tunnel opening and comes back down.
 *
 * Field.js tells them where they can stand and how far places are.
 */

const Wanderers = (() => {
  'use strict';

  // How each kind of ant looks and moves.
  const KINDS = {
    worker: {
      art: ['walker', 'walkerStep'],          // the two leg poses
      size: { x: 8, y: 4 },                   // how much room one takes up
      stepMs: 380,                            // time between steps
      climbs: true,                           // can face up or down (to climb tunnels)
      surfaceShare: 1,                        // how often it heads for the surface (workers: the full chance)
      explorers: []                           // which ones are explorers (none: see below)
    },
    soldier: {
      art: ['walkerSoldier', 'walkerSoldierStep'],
      size: { x: 16, y: 9 },
      stepMs: 520,
      climbs: false,                          // drawn facing left or right, except when climbing to the surface
      surfaceShare: 0.2,                      // five times less often than workers
      explorers: [1, 3, 5],                   // the 2nd, 4th and 6th soldiers (counting from 0)
      outsideLift: 2                          // drawn this much higher on the grass, so its legs stand on it
    },
    // Fire ants come in raids (spawnFire), not from the colony's counts.
    fire: {
      art: ['fireAnt', 'fireAntStep'],
      size: { x: 8, y: 4 },
      stepMs: 300,
      climbs: true,
      surfaceShare: 0,
      explorers: [],
      raider: true
    }
  };

  // Fire ant raids. Soldiers fight any fire ant they touch, and go after one
  // they see close by. Every FIGHT.everyMs each soldier bites one fire ant
  // on it and each fire ant bites its soldier. A fallen soldier lies on its
  // back until a worker carries it to the brood, where it heals.
  const FIGHT = {
    soldierHp: 8,
    majorSoldierHp: 13, // a major soldier (Majors, after Bigheaded)
    doorheadHp: 24,     // the door-head soldier: 3 times a soldier's health
    majorHp: 24,        // the supermajor: 3 times a soldier's health...
    majorBite: 6,       // ...and twice its bite
    fireHp: 7,
    soldierBite: 2,
    fireBite: 1,
    everyMs: 600,
    touchX: 10,         // a soldier and a fire ant this close (across, up or down) are touching
    touchY: 7,
    sight: 28,          // a soldier goes after a fire ant this close underground
    healMs: 60000,      // a fallen soldier heals this long after reaching the brood
    giveUpMs: 60000,    // ...or where it lies, if no worker has fetched it by then
    bodyMs: 120000,     // a beaten fire ant's body lies this long if no worker fetches it
    bodyFood: 5,        // food a worker gets for bringing a body to the queen
    hidePace: 0.35,     // workers hurrying to the chamber during a raid take steps this much quicker
    rallyPace: 0.35,    // soldiers answering the alarm hurry: about 3 times their usual pace
    haulPace: 1.4       // a worker carrying a soldier is slowed down
  };
  const STILL = new Set(['fight', 'fallen', 'carried', 'healing', 'dead', 'huddle', 'siege', 'caught']);   // (caught: on the anteater's tongue)   // plans in which an ant doesn't walk

  // The invasion (Fire ant slavemaking): fire ants that go straight for the
  // queen and stay there, taking some of her food every biteMs, until beaten.
  const INVADE = { biteMs: 10000, spread: 14 };   // spread: how far across from where they arrive they stand

  // Fire ant workers (bought after the invasion is beaten): workers in every
  // way, drawn as fire ants, walking `faster` times as fast.
  // During a raid they don't hide: they gang up on the fire ant nearest the
  // queen, several to one, and bite it together. Each is weak (hp, bite); one
  // beaten backs off home for restMs before it joins in again.
  const RED = { faster: 1.5, hp: 4, bite: 1, restMs: 8000, perArmyAnt: 2, downMs: 60000 };   // perArmyAnt: they take on army ants in pairs; downMs: knocked over by one this long

  // Fire ant workers on (going after or biting) army ant `f`, not counting `but`.
  function redsOn(f, but) {
    return ants.filter((a) => a.red && a !== but && (a.chasing === f || (a.plan === 'fight' && a.foes && a.foes.includes(f)))).length;
  }

  // Marauder ants (perk page II): fire ants in every way (soldiers fight them,
  // workers hide), but drawn as big-headed marauders, much tougher and
  // biting harder. Half go for the queen and take her food (queenBites times a
  // fire ant's take, every INVADE.biteMs) until beaten; the rest rob granaries,
  // aphids and repletes, `steals` times each, then leave. All leave after stayMs.
  const MARAUDER = { art: ['walkerMarauder', 'walkerMarauderStep'], hp: 27, bite: 2.5, queenBites: 3, steals: 3, stayMs: 90000 };
  const SOLDIER_GRASS = 2;   // soldiers walk this many times as fast on the grass
  const ARMY_GANG = 4;       // soldiers that take on one army ant together
  const FIRE_GANG = 2;       // ...and one fire ant (fire ants gang up on a soldier, so soldiers do too)
  const FIRE_ON_ONE = 1;     // fire ants that take on one soldier at once (the rest go on with the raid); the door-head takes on any number

  // Soldiers going after or biting army ant `f`, not counting `but`.
  function soldiersOn(f, but) {
    return ants.filter((a) => a.kind === 'soldier' && a !== but && (a.chasing === f || (a.plan === 'fight' && a.foes && a.foes.includes(f)))).length;
  }

  // Majors (after Bigheaded): major soldiers crack seeds in granaries, which
  // turns each into ant bread at once.
  const CRACK_REST = 1500;   // a pause after each seed
  const CRACKER_FASTER = 1.5; // a soldier on its way to crack a seed walks this many times as fast as other soldiers
  // Majors: up to `most` major soldiers at a time go and crack an uncracked
  // seed; after it, each looks once more for another within `nearby` pixels.
  const CRACK = { most: 2, everyMs: 2000, nearby: 40, patrolReach: 60 };
  const MEDIA_ART = ['walkerMedia', 'walkerMediaStep'];   // soldiers that are not majors
  let nextCrackAt = 0;
  let crackers = 0;   // how many may crack at once (0 before Majors)

  const RED_FIGHT_FROM = new Set(['wander', 'visit', 'up', 'outside', 'down', 'rally', 'hide', 'huddle']);

  // Can this fire ant worker join the fight now? (Not while carrying anything.)
  function redReady(ant, now) {
    return ant.red && !ant.arriving && ant.carry.length === 0 && RED_FIGHT_FROM.has(ant.plan) && now >= (ant.restUntil || 0);
  }
  // During a raid, workers doing these drop them and hurry to the main chamber.
  const HIDE_FROM = new Set(['wander', 'visit', 'up', 'outside', 'down', 'milk', 'fetchStash']);
  const BODY_COLORS = ['#c0461e', '#c0461e', '#5a1a0c', '#5a1a0c'];   // a fire ant body being carried
  let firePaused = false;    // the first raid waits while its message is up
  let rallySpot = null;      // where the alarm pheromone is calling the soldiers, or null
  let nextBiteAt = 0;
  let nextSiegeAt = 0;       // when the invaders at the queen next bite her
  let wantRed = 0;           // fire ant workers that should be walking about

  // The supermajor (Super major honeydew upgrade) is a worker in every way
  // except these: its picture, a slower walk, and a bigger load of crumb.
  const MAJOR = {
    art: ['walkerMajor', 'walkerMajorStep'],
    slower: 6 / 1.8,    // takes 3.3 times as long per step as a worker (Athleticism and Step counting still help)
    carryTimes: 9.6,    // takes 9.6 times as much crumb as a worker (8 x 1.2), rounded to whole pixels
    crumbWorth: 15,     // each pixel of crumb it brings the queen counts 15 times
    lift: 4             // drawn this much higher when facing left or right, so its feet line up with a worker's
  };

  const MAX_EACH = 15;           // most of one kind ever shown...
  const MAX_SHOWN = { worker: 30 };   // ...except these
  const REST_CHANCE = 0.012;     // chance of stopping for a rest after a step
  const REST_MIN = 500;          // shortest rest, in milliseconds
  const REST_MAX = 1500;         // longest rest
  const SURFACE_CHANCE = 0.004;  // chance per step that a wandering ant sets off for the surface (no crumb up there)
  const UP_PACE = 0.35;          // workers climbing to the surface take steps this much quicker (about 3 times as fast)
  const CARRY_PACE = 0.5;        // workers carrying crumb to the queen go twice as fast
  const MOST_STEPS = 3;          // most steps one ant takes between two checks (for very fast ants)
  const RUSH = { faster: 10, mostSteps: 20 };   // a rove beetle rush: workers walk 10x as fast (so they take more steps a check)
  // During a rush the jobs (crumb, seeds, aphids, stored seeds, litter) are
  // handed out on every update instead of one every few seconds, so a free
  // worker goes straight to the next one instead of wandering.
  function rushing(world) {
    return !!world.crumbRules().rush;
  }
  // A worker heading back down with nothing (the crumb ran out before it got
  // there): in a rush it turns round for the next one.
  function emptyHanded(ant) {
    return ant.plan === 'down' && ant.carry.length === 0 && !ant.task && !ant.scout && !ant.carryArt && !ant.major;
  }
  const CATCH_UP_MS = 100;       // an ant that fell behind its steps catches up this much at most
  const OUTSIDE_MIN = 20;        // steps a worker spends walking on the surface
  const OUTSIDE_MAX = 60;
  const VISIT_CHANCE = 0.04;     // chance per step that a wandering ant sets off to look around somewhere
  const ARRIVED = 3;             // this many steps from the place it was going counts as there
  const CRUMB_REACH = 3;         // a worker this far from the crumb's edge (by its middle) can take some
  // While a bread crumb is on the grass, one worker sets off for it every
  // FETCH_EVERY milliseconds, from wherever it is in the nest. Soldiers go
  // five times less often, to push a crumb closer to the tunnel.
  const FETCH_EVERY = 2000;
  const FETCH_EVERY_SOLDIER = FETCH_EVERY * 5;
  const HOME_REST = 2000;        // an ant back in the nest stays at least this long before going up again
  // Aphids: while one is full (or a herd has enough drops), a worker is sent
  // to milk it every MILK_EVERY milliseconds, the nearest one free.
  // Walking speed of the colony's ants (not fire ants): `overall` times
  // the usual everywhere, and `narrow` times that in tunnels 10 pixels
  // wide or less (field.js NARROW).
  const WALK = { overall: 0.9, narrow: 1.15 };
  const MILK_EVERY = 1500;
  let nextMilkAt = 0;
  // Stored seeds (EAT setting): every STASH_EVERY milliseconds a free worker
  // goes to pick one up off the tunnel floor and carry it to an empty granary.
  const STASH_EVERY = 1500;
  let nextStashAt = 0;

  // Litter foraging: with no crumb or seed to fetch, 3 in 4 of the workers
  // with nothing to do go out on the grass now and then, find a bit of
  // litter (a dead gnat, a petal, a fleck of leaf) and take it straight to
  // the queen: `pixels` pixels of crumb's worth (2 food, more with Crumbs).
  const LITTER = {
    share: 0.75,
    everyMs: 1500,     // one worker sent at most this often
    pixels: 2,
    giveUpMs: 40000,   // a forager that can't get there in this long comes home
    nearest: 12,       // how far from the nest entrance the litter lies (game pixels)
    farthest: 60,
    kinds: [['#2b2b2b', '#5a5a5a'], ['#e9a6c4', '#f6d1e2'], ['#5f7f2f', '#8aab4a']]   // gnat, petal, leaf
  };
  let nextLitterAt = 0;

  // The midden (field.js): a worker with nothing to do now and then carries
  // a bit of waste there (at most `carriers` at once). Fire ant bodies go
  // there too once there is a midden. Colony ants near it walk `slow` times
  // slower, so it is best out of the way.
  const MIDDEN = {
    everyMs: 3000,
    carriers: 3,
    workerLoad: 2,      // waste a worker brings
    bodyLoad: 30,       // waste a fire ant body brings...
    armyLoad: 50,       // ...and an army ant (marauder) body
    slow: 4,
    workerSlow: 0.5,    // ...ants working there walk this much of that slowdown (2x, not 4x)
    avoid: 0.02,        // a wandering ant (no job there, not passing through) steps toward it this much less often...
    leave: 5,           // ...and, already by it, steps away this much more often
    colors: ['#43301a', '#6b5a2c']   // a bit of refuse carried
  };
  let nextMiddenAt = 0;
  const FED_REST_MIN = 3000;     // a worker that fed the queen wanders the nest 3 to 20 seconds before the next trip
  const FED_REST_MAX = 20000;
  // A worker's rest in the nest between trips: shorter with Work Speed (crumbRules.restScale).
  // Division of labor (perk page II): soldiers (not the door-head) work like workers too.
  let laborOn = false;
  function worksAsWorker(ant) {
    return ant.kind === 'worker' || (laborOn && ant.kind === 'soldier' && !ant.doorhead && !ant.crackerDuty);   // (the seed cracker on duty sticks to cracking)
  }

  // Division of labor: while fewer than LABOR.least soldiers are at worker
  // jobs, a free soldier is picked first (so some always are).
  const LABOR = { least: 4 };
  const WORKER_PLANS = new Set(['milk', 'fetchStash', 'toMidden', 'milkCat', 'fetchBody', 'feedFungus', 'feedReplete', 'deliver', 'store']);
  function laborPool(free) {
    if (!laborOn) return free;
    const working = ants.filter((a) => a.kind === 'soldier' && (a.asWorker || WORKER_PLANS.has(a.plan))).length;
    if (working >= LABOR.least) return free;
    const soldiers = free.filter((a) => a.kind === 'soldier');
    return soldiers.length > 0 ? soldiers : free;
  }

  function restFor(ant, world, ms) {
    if (!worksAsWorker(ant) || ant.major) return ms;
    if (world.crumbRules().rush) return 0;   // a rove beetle rush: no rest at all
    return ms * (world.crumbRules().restScale || 1) * (world.crumbRules().minor ? MINOR.rest : 1);   // Work Speed, Minor workers
  }
  const MINOR = { faster: 1.3, rest: 0.7 };   // Minor workers (Ants menu): 30% faster, rest 30% less
  const WANDER_PACE = 0.7;       // workers wandering or looking around the nest step this much quicker (about 40% faster)
  // Explorers (set when the ant appears) never do any task: they walk from
  // one end of the nest to the other and back. After getting somewhere they
  // look around for a few steps before setting off.
  const EXPLORE_CHANCE = 0.15;   // chance per step that a resting explorer sets off again
  // A soldier done pushing a crumb has this chance of staying up on the grass
  // for a while (5 to 15 seconds), then looking for another crumb to push.
  const LINGER_CHANCE = 0.5;
  const LINGER_MIN = 5000;
  const LINGER_MAX = 15000;
  const PUSH_PACE = 1.5;         // a soldier pushing a crumb walks this much slower

  // How strongly an ant prefers each choice of direction.
  const KEEP_GOING = 12;
  const TURN = 2;
  const TURN_BACK = 0.3;
  const TOWARD_GOAL = 30;        // when heading somewhere: steps that get closer
  const LEAF = { share: 0.5, pixels: 8, colors: ['#5f9a2f', '#7fbf3f', '#4a7f24'] };   // Leafcutter gardens: half the fungus feedings are a bit of grass (8 pixels: a full feeding)
  const FUNGUS_SHARE = 0.8;      // chance a worker takes its crumb to a fungus garden needing one (Fungal garden); the rest feed the queen
  const SEED_TOWARD_GOAL = 120;  // ...for a worker carrying something home, which also ignores tight spots and crowds
  const AWAY_FROM_GOAL = 0.05;   // ...and steps that get farther away
  const INTO_CROWD = 1;          // steps that bump into more ants of the same kind: no different
  const OUT_OF_CROWD = 1;        // (ants walk over each other rather than veer away)
  const AGAINST_WALL = 0.03;     // steps that would rub against a wall, when there's a clear way
  const ONTO_ALATE = 0.01;       // a soldier just wandering about stepping onto the resting alate (none during a raid)
  const OFF_ALATE = 20;          // ...and, if it is on her, steps that take it away from her middle

  const DIRECTIONS = [
    { dx: 1, dy: 0, heading: 'right' },
    { dx: -1, dy: 0, heading: 'left' },
    { dx: 0, dy: 1, heading: 'down' },
    { dx: 0, dy: -1, heading: 'up' }
  ];

  // What a worker is doing: 'wander' (default), 'up' (going to the surface),
  // 'outside' (walking on the surface), 'down' (going back to the main
  // chamber), 'deliver' (carrying crumb to the queen). Any ant may also be on
  // a 'visit': walking to somewhere in the tunnels, usually a part the player
  // dug, to wander around there. A soldier on the surface may 'push' a crumb.
  let ants = [];   // { kind, explorer, x, y, direction, facing, pose, plan, outsideLeft, carry, visit, push, readyAt, lingerUntil, moveAt }
  let clock = 0;   // the time of the current update
  const nextFetchAt = { worker: 0, soldier: 0 };   // when the next ant of each kind sets off for a crumb

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // How many other ants of the same kind would overlap this ant at (x, y).
  function crowding(ant, x, y) {
    const size = KINDS[ant.kind].size;
    let count = 0;
    for (const other of ants) {
      if (other === ant || other.kind !== ant.kind) continue;
      if (Math.abs(other.x - x) < size.x && Math.abs(other.y - y) < size.y) count++;
    }
    return count;
  }

  // Put an ant somewhere it can stand, away from others of its kind if there
  // is room. Returns false if there is nowhere.
  function place(ant, world) {
    let spot = null;
    let best = Infinity;
    for (let tries = 0; tries < 25 && best > 0; tries++) {
      const option = world.randomSpot(ant.kind);
      if (!option) break;
      const crowd = crowding(ant, option.x, option.y);
      if (crowd < best) { best = crowd; spot = option; }
    }
    if (!spot) return false;
    ant.x = spot.x;
    ant.y = spot.y;
    ant.direction = pick(DIRECTIONS);
    ant.facing = pick(['left', 'right']);
    if (ant.task === 'seed' && ant.visit && ant.visit.id !== undefined) world.releaseGranary(ant.visit.id);
    ant.seedId = null;
    ant.plan = 'wander';
    ant.carry = [];
    ant.visit = null;
    ant.push = null;
    ant.task = null;
    ant.litter = false;
    ant.leaf = false;
    if (ant.scout) ant.gone = true;   // a scout that got stuck just leaves
    return true;
  }

  function newAnt(kind, explorer) {
    return { kind, explorer, x: 0, y: 0, direction: DIRECTIONS[0], facing: 'right', pose: 0, plan: 'wander', outsideLeft: 0, carry: [], visit: null, push: null, task: null, readyAt: 0, lingerUntil: 0, moveAt: 0 };
  }

  /* Show this many ants of each kind: { worker: n, soldier: n, major: 0 to 2 (supermajors), red: n (fire ant workers), doorhead: 0 or 1,
     majorShare: share of soldiers that are majors, crackers: how many majors may crack seeds at once }. */
  function setCounts(counts, world) {
    let changed = false;
    // The supermajor: a worker with major set.
    // (Twin supermajors: up to two.)
    let majors = ants.filter((ant) => ant.major).length;
    while (majors < (counts.major || 0)) {
      const ant = newAnt('worker', false);
      ant.major = true;
      if (!place(ant, world)) break;
      ant.moveAt = Date.now() + Math.random() * KINDS.worker.stepMs;
      ants.push(ant);
      majors++;
      changed = true;
    }
    while (majors > (counts.major || 0)) {
      ants.splice(ants.findIndex((ant) => ant.major), 1);
      majors--;
      changed = true;
    }
    // Door-head soldiers: one extra soldier, the door-head.
    let doorheads = ants.filter((ant) => ant.doorhead).length;
    if (doorheads < (counts.doorhead || 0)) {
      const ant = newAnt('soldier', false);
      ant.doorhead = true;
      if (place(ant, world)) {
        ant.moveAt = Date.now() + Math.random() * KINDS.soldier.stepMs;
        ants.push(ant);
        changed = true;
      }
    } else if (doorheads > (counts.doorhead || 0)) {
      ants = ants.filter((ant) => !ant.doorhead);
      changed = true;
    }
    // Majors: this share of the soldiers are major soldiers (the rest media).
    const soldiers = ants.filter((ant) => ant.kind === 'soldier' && !ant.doorhead);
    const wantMajors = Math.round(soldiers.length * (counts.majorShare || 0));
    let haveMajors = soldiers.filter((ant) => ant.majorSoldier).length;
    for (const ant of soldiers) {
      if (haveMajors < wantMajors && !ant.majorSoldier) { ant.majorSoldier = true; haveMajors++; changed = true; }
      else if (haveMajors > wantMajors && ant.majorSoldier) { ant.majorSoldier = false; haveMajors--; changed = true; if (ant.plan === 'crack') ant.plan = 'wander'; }
    }
    crackers = counts.crackers || 0;
    // Fire ant workers: workers with red set. Ones still arriving over the
    // grass (arrive) count as coming; they settle in, or join the colony
    // unseen, once they reach the chamber.
    wantRed = Math.min(Math.max(counts.red || 0, 0), MAX_EACH);
    let haveRed = ants.filter((ant) => ant.red).length;
    while (haveRed < wantRed) {
      const ant = newAnt('worker', false);
      ant.red = true;
      if (!place(ant, world)) break;
      ant.moveAt = Date.now() + Math.random() * KINDS.worker.stepMs;
      ants.push(ant);
      haveRed++;
      changed = true;
    }
    let settled = ants.filter((ant) => ant.red && !ant.arriving).length;
    while (settled > wantRed) {
      ants.splice(ants.findIndex((ant) => ant.red && !ant.arriving), 1);
      settled--;
      changed = true;
    }
    for (const kind in KINDS) {
      if (KINDS[kind].raider) continue;
      const wanted = Math.min(Math.max(counts[kind] || 0, 0), MAX_SHOWN[kind] || MAX_EACH);
      let have = ants.filter((ant) => ant.kind === kind && !ant.major && !ant.red && !ant.scout && !ant.doorhead).length;   // (scouts walking off are already counted out; the door-head is extra)

      while (have < wanted) {
        const explorer = KINDS[kind].explorers.includes(have);
        const ant = newAnt(kind, explorer);
        if (!place(ant, world)) break;
        ant.moveAt = Date.now() + Math.random() * KINDS[kind].stepMs;
        ants.push(ant);
        have++;
        changed = true;
      }
      while (have > wanted) {
        ants.splice(ants.findIndex((ant) => ant.kind === kind && !ant.major && !ant.red && !ant.scout && !ant.doorhead), 1);
        have--;
        changed = true;
      }
    }
    return changed;
  }

  // Which goal the ant is walking toward, if any.
  function goalOf(ant) {
    if (ant.plan === 'up') return 'surface';
    if (ant.plan === 'down') return 'home';
    if (ant.plan === 'deliver') return 'queen';
    if (ant.plan === 'visit') return ant.visit;
    return null;
  }

  // May the ant walk past the queen? Only when it is on its way somewhere
  // else (a visit, or a seed to a granary); it never stops there.
  function mayPassQueen(ant) {
    return ant.plan === 'visit' || ant.plan === 'store' || ant.plan === 'raid' || ant.plan === 'flee' ||
      ant.plan === 'rally' || ant.plan === 'rescue' || ant.plan === 'haul' || ant.plan === 'fetchBody' || ant.plan === 'feedFungus' || ant.plan === 'feedReplete' || ant.plan === 'milk' || ant.plan === 'fetchStash' || ant.plan === 'milkCat' || ant.plan === 'toMidden';
  }

  // Steps along the grass from x to where a worker can pick up the seed.
  function seedGap(x, seed, world) {
    return Math.max(0, Math.abs(x - seed.x) - world.seedReach());
  }

  // May the ant go up on the grass on its current plan? Only workers going
  // to, from, or along the surface.
  function mayGoOutside(ant) {
    return ant.plan !== 'wander' && ant.plan !== 'visit';
  }

  // Steps along the grass from x to where a worker can reach the crumb.
  function crumbGap(x, crumb) {
    if (x < crumb.left - CRUMB_REACH) return crumb.left - CRUMB_REACH - x;
    if (x > crumb.right + CRUMB_REACH) return x - crumb.right - CRUMB_REACH;
    return 0;
  }

  // The crumb a soldier on the grass will push, and where it must stand to
  // push it toward the tunnel: just past its far side, facing the tunnel.
  // It picks the crumb farthest from the tunnel that another soldier isn't
  // already pushing, skipping one it couldn't move: too close to the edge of
  // the grass to get behind, or stuck against another crumb or the tunnel
  // opening. Null if there is none.
  function pushPlan(ant, world) {
    const taken = new Set(ants.filter((other) => other !== ant && other.push).map((other) => other.push.id));
    const opening = world.opening();
    const away = (c) => Math.abs((c.left + c.right) / 2 - opening);
    const list = world.crumbs().filter((c) => !taken.has(c.id)).sort((a, b) => away(b) - away(a));
    const half = KINDS.soldier.size.x / 2;
    for (const crumb of list) {
      const middle = (crumb.left + crumb.right) / 2;
      const dir = opening > middle ? 1 : -1;
      const standX = dir > 0 ? crumb.left - half : crumb.right + half + 1;
      if (!world.canStand(ant.kind, standX, ant.y, true) || !world.canPushCrumb(crumb.id, dir)) continue;
      return { id: crumb.id, dir, standX, goal: middle + (opening - middle) / 2 };
    }
    return null;
  }

  // Is there a crumb a soldier could push closer to the tunnel (one no
  // soldier is pushing yet)?
  function somethingToPush(world) {
    const taken = new Set(ants.filter((ant) => ant.push).map((ant) => ant.push.id));
    const opening = world.opening();
    return world.crumbs().some((c) => !taken.has(c.id) &&
      world.canPushCrumb(c.id, opening > (c.left + c.right) / 2 ? 1 : -1));
  }

  // How far the ant at (x, y) is from where it is going, or -1 if it isn't
  // going anywhere in particular.
  function distanceToGo(ant, world, x, y) {
    const up = world.aboveGround(ant.y);   // (chosen by where the ant is now, so a step is never judged by two maps)
    if (ant.plan === 'raid' && ant.hunt) return Math.hypot(x - ant.hunt.x, y - ant.hunt.y);   // an army ant going for a fire ant worker of yours
    if (ant.plan === 'raid') {
      if (ant.target.grass) return up ? Math.abs(x - ant.target.x) : world.distance('surface', x, y);
      if (up) return world.distance('home', x, y);
      return ant.target === 'queen' ? world.distance('queen', x, y) : world.distance(ant.target, x, y, 'worker');
    }
    if (ant.plan === 'flee') return up ? Math.abs(x - ant.exitX) : world.distance('surface', x, y);
    if (ant.plan === 'rally') {
      // An alarm on the grass: up the tunnel, then along the grass to it.
      if (world.aboveGround(ant.visit.y)) return up ? Math.abs(x - ant.visit.x) : world.distance('surface', x, y);
      return up ? world.distance('home', x, y) : world.distance(ant.visit, x, y, 'worker');
    }
    if (ant.plan === 'crack' || ant.plan === 'guard' || ant.plan === 'plug') return world.distance(ant.visit, x, y, 'worker');   // (soldiers find their way along the worker paths)
    if (ant.plan === 'feedFungus' || ant.plan === 'feedReplete' || ant.plan === 'milk' || ant.plan === 'fetchStash' || ant.plan === 'toMidden' || ant.plan === 'milkCat') return up ? world.distance('home', x, y) : world.distance(ant.visit, x, y, 'worker');
    if (ant.plan === 'hide') return ant.visit ? world.distance(ant.visit, x, y, 'worker') : world.distance('home', x, y);
    if (ant.plan === 'rescue' || ant.plan === 'fetchBody') {
      const spot = ant.visit;
      if (world.aboveGround(spot.y)) return up ? Math.abs(x - spot.x) : world.distance('surface', x, y);
      return up ? world.distance('home', x, y) : world.distance(spot, x, y, 'worker');
    }
    if (ant.plan === 'haul') return up ? world.distance('home', x, y) : world.distance(ant.visit, x, y, 'worker');
    if (ant.plan === 'outside') {
      if (ant.kind === 'soldier' && !ant.asWorker) {   // (a soldier sent as a worker walks to its crumb or seed like a worker)
        if (clock < ant.lingerUntil) return -1;   // just walking about on the grass
        const plan = pushPlan(ant, world);
        return plan ? Math.abs(x - plan.standX) : -1;
      }
      if (ant.task === 'seed') {
        const seed = world.seedById(ant.seedId);
        return seed ? seedGap(x, seed, world) : -1;
      }
      if (ant.task === 'litter') return Math.abs(x - ant.litterX);
      if (ant.task === 'scout') return Math.abs(x - ant.exitX);
      if (ant.task === 'scoutHome') return Math.abs(x - world.opening());   // scouts coming home: to the nest hole
      const crumb = ant.carry.length === 0 && world.crumbs(x)[0];
      return crumb ? crumbGap(x, crumb) : -1;
    }
    if (ant.plan === 'store') {
      // Carrying a seed: down the tunnel first, then to the granary. (Which
      // map is chosen by where the ant is now, so a step is never judged by two.)
      return world.aboveGround(ant.y) ? world.distance('home', x, y) : world.distance(ant.visit, x, y, ant.kind);
    }
    const goal = goalOf(ant);
    return goal ? world.distance(goal, x, y, ant.kind) : -1;
  }

  // Take one step: choose among the open neighbors, leaning toward straight
  // ahead, toward places with more room, and toward the goal if it has one.
  function step(ant, world) {
    const outdoors = mayGoOutside(ant);
    // Carrying something home (crumb to the queen or a fungus garden, a seed
    // to a granary): heads straight in, past the narrow tunnel mouth and other ants.
    const seed = ant.carry.length > 0 && (ant.plan === 'store' || ant.plan === 'deliver' || ant.plan === 'feedFungus' || ant.plan === 'feedReplete');
    // A soldier with nowhere to be keeps off the alate, unless fire ants are about.
    const mindAlate = ant.kind === 'soldier' && ant.plan === 'wander' && world.onAlate &&
      !ants.some((a) => a.kind === 'fire' && a.plan !== 'dead');
    const onAlateNow = mindAlate && world.onAlate(ant.x, ant.y);
    // Ants with nothing to do keep away from the midden (ants with a job, there or past it, go on through).
    const mindMidden = ant.plan === 'wander' && ant.kind !== 'fire' && world.nearMidden;   // (marauders are fire kind too)
    const byMidden = mindMidden && world.nearMidden(ant.x, ant.y);
    const here = distanceToGo(ant, world, ant.x, ant.y);
    const crowdHere = crowding(ant, ant.x, ant.y);

    const choices = [];
    let total = 0;
    for (const direction of DIRECTIONS) {
      const x = ant.x + direction.dx;
      const y = ant.y + direction.dy;
      if (!world.canStand(ant.kind, x, y, outdoors, mayPassQueen(ant))) continue;
      if (ant.plan === 'outside' && direction.dy !== 0) continue;   // stay on the grass
      if (plug && ant.kind === 'fire' && y > ant.y && ant.y <= plug.y && y >= plug.y - DOORHEAD.blockAbove && Math.abs(x - plug.x) <= DOORHEAD.blockAcross) continue;   // the door-head blocks the hole

      let weight = TURN;
      if (direction === ant.direction) weight = KEEP_GOING;
      else if (direction.dx === -ant.direction.dx && direction.dy === -ant.direction.dy) weight = TURN_BACK;
      if (!seed) weight *= world.room(ant.kind, x, y) ** 3;   // (the narrow tunnel mouth doesn't slow a seed carrier)
      if (here >= 0) {
        const there = distanceToGo(ant, world, x, y);
        if (there >= 0 && there < here) weight *= seed ? SEED_TOWARD_GOAL : TOWARD_GOAL;
        else if (there > here || there < 0) weight *= AWAY_FROM_GOAL;
      }
      if (!world.clear(ant.kind, x, y)) weight *= AGAINST_WALL;
      if (onAlateNow) {
        if (Math.abs(x - world.alateX()) > Math.abs(ant.x - world.alateX())) weight *= OFF_ALATE;
      } else if (mindAlate && world.onAlate(x, y)) {
        weight *= ONTO_ALATE;
      }
      if (mindMidden) {
        const near = world.nearMidden(x, y);
        if (near && !byMidden) weight *= MIDDEN.avoid;
        else if (!near && byMidden) weight *= MIDDEN.leave;
      }
      const crowdThere = seed ? 0 : crowding(ant, x, y);
      if (crowdThere > crowdHere) weight *= INTO_CROWD;
      else if (crowdThere < crowdHere) weight *= OUT_OF_CROWD;

      choices.push({ direction, weight });
      total += weight;
    }
    if (choices.length === 0) return false;

    let roll = Math.random() * total;
    let chosen = choices[choices.length - 1];
    for (const choice of choices) {
      roll -= choice.weight;
      if (roll <= 0) { chosen = choice; break; }
    }
    ant.direction = chosen.direction;
    ant.x += chosen.direction.dx;
    ant.y += chosen.direction.dy;
    if (chosen.direction.dx !== 0) ant.facing = chosen.direction.heading;
    ant.pose = 1 - ant.pose;   // swap leg pose
    return true;
  }

  /*
   * What a fire ant goes for. Seeds come first: a granary in the nest holding
   * a seed or ant bread, then a seed lying on the grass (each preferably one
   * no other fire ant is after). Only with no seed anywhere does it go for
   * the queen's food.
   */
  const FIRE_GRASS = 2;   // fire ants in a raid that go for seeds on the grass
  function fireTarget(ant, world) {
    const others = ants.filter((a) => a.kind === 'fire' && a !== ant && a.plan === 'raid' && typeof a.target === 'object');
    const taken = new Set(others.map((a) => (a.target.grass ? 'g' : 'r') + a.target.id));
    const near = (list) => list.reduce((best, t) => (Math.abs(t.x - ant.x) < Math.abs(best.x - ant.x) ? t : best));
    // At most FIRE_GRASS of the raid take seeds off the grass; the rest raid the nest.
    const onGrass = ants.filter((a) => a.kind === 'fire' && !a.marauder && a !== ant && a.plan !== 'dead' &&
      ((a.target && typeof a.target === 'object' && a.target.grass) || a.stolenSeed)).length;
    const grass = onGrass < FIRE_GRASS ? world.seeds().filter((s) => !taken.has('g' + s.id)) : [];
    if (grass.length > 0) {
      const seed = near(grass);
      return { grass: true, id: seed.id, x: seed.x, kind: seed.kind };
    }
    const full = world.raidGranaries();
    const free = full.filter((g) => !taken.has('r' + g.id));
    const vault = free.filter((g) => g.vault);   // a Seed Vault first
    if (vault.length > 0) return vault[Math.floor(Math.random() * vault.length)];
    if (free.length > 0) return free[Math.floor(Math.random() * free.length)];
    if (full.length > 0) return full[Math.floor(Math.random() * full.length)];
    return 'queen';
  }

  // A fire ant: to its target, take the seed (or some food from the queen),
  // then back up and off the edge of the grass.
  function fireUpdate(ant, world) {
    if (ant.marauder) return marauderUpdate(ant, world);
    const up = world.aboveGround(ant.y);
    // An invader goes for the queen, then walks to a spot of its own on the
    // floor by her (so they don't all stand on one another), and stays there.
    if (ant.invade) {
      if (ant.plan !== 'raid' || up) return;
      if (ant.target === 'queen') {
        const left = world.distance('queen', ant.x, ant.y);
        if (left < 0 || left > ARRIVED) return;
        const spot = world.nearestStand('worker', ant.x + Math.round(Math.random() * INVADE.spread * 2 - INVADE.spread), ant.y);
        ant.target = spot || { x: ant.x, y: ant.y };
      }
      if (world.distance(ant.target, ant.x, ant.y, 'worker') <= 1) {
        ant.plan = 'siege';
      }
      return;
    }
    // A seed showing up turns a fire ant away from the queen.
    if (ant.plan === 'raid' && ant.target === 'queen') ant.target = fireTarget(ant, world);
    if (ant.plan === 'raid' && ant.target.grass) {
      if (!world.seedById(ant.target.id)) {
        ant.target = fireTarget(ant, world);   // a worker (or another fire ant) got it first
      } else if (up && Math.abs(ant.x - ant.target.x) <= world.seedReach() && world.raidSeed(ant.target.id)) {
        ant.carry = world.seedColors(ant.target.kind).slice(0, 4);
        ant.stolenSeed = true;
        ant.plan = 'flee';
        ant.exitX = world.raidExit(ant.x);
      }
      return;
    }
    if (ant.plan === 'raid' && !up) {
      const left = ant.target === 'queen' ? world.distance('queen', ant.x, ant.y) : world.distance(ant.target, ant.x, ant.y, 'worker');
      if (left >= 0 && left > ARRIVED) return;
      if (left >= 0) {
        if (ant.target === 'queen') {
          world.raidQueen(ant.x, ant.y);
          ant.carry = ['#f0d29a', '#d9b57a'];
        } else if (world.raidGranary(ant.target.id)) {
          ant.carry = world.seedColors().slice(0, 4);
          ant.stolenSeed = true;
        } else {
          ant.target = fireTarget(ant, world);   // someone got there first: try elsewhere
          return;
        }
      }
      ant.plan = 'flee';
      ant.exitX = world.raidExit(ant.x);
    } else if (ant.plan === 'flee' && up && Math.abs(ant.x - ant.exitX) <= 1) {
      ant.gone = true;
    }
  }

  /*
   * The door-head soldier (Door-head soldiers, perk page II): a soldier with
   * twice the health and a flat, plug-shaped head. With no fire ants about he
   * sits by the queen and the brood. When a raid starts he goes up the main
   * tunnel and plugs the nest hole, head up: fire ants can't get past him
   * while he stands, and must fight him. He leaves the alarm and chasing to
   * the other soldiers.
   */
  const DOORHEAD = { art: ['walkerDoorhead', 'walkerDoorheadStep'], plugDepth: 5, blockAbove: 4, blockAcross: 6, plugPace: 0.2, headTop: 7 };   // block: the part of the hole he fills; headTop: rows from where he is drawn, head up, to the top of his head (put level with the top of the ant hill)
  let plug = null;   // where he stands in the nest hole: { x, y }, while he is holding it

  function doorheadUpdate(world) {
    plug = null;
    const ant = ants.find((a) => a.doorhead);
    if (!ant) return;
    // Out of the hole (raid over, or he fell): back down where he stood.
    if (ant.post && ant.y < ant.post.y && ant.plan !== 'plugged' && ant.plan !== 'fight' && ant.plan !== 'carried') ant.y = ant.post.y;
    const raid = ants.some((a) => a.kind === 'fire' && a.plan !== 'dead' && !a.gone);
    if (raid && (ant.plan === 'plugged' || ant.plan === 'fight') && ant.post) plug = ant.post;
    if (STILL.has(ant.plan)) return;   // fighting, fallen, carried or healing
    if (raid) {
      if (ant.plan === 'plugged') return;
      if (ant.plan !== 'plug') {
        ant.inHole = false;
        ant.post = plugSpot(world);
        if (!ant.post) return;
        ant.plan = 'plug';
        ant.visit = ant.post;
        ant.moveAt = Math.min(ant.moveAt, clock);
      }
      const left = world.distance(ant.visit, ant.x, ant.y, 'worker');
      if (left >= 0 && left <= ARRIVED) {
        ant.plan = 'plugged';
        ant.inHole = true;
        ant.direction = DIRECTIONS[3];   // head up, in the hole
        ant.post = { x: ant.x, y: ant.y };   // (where he actually stopped: the hole is blocked there)
        plug = ant.post;
        if (world.hillTop) ant.y = world.hillTop() + DOORHEAD.headTop;   // up in the hole, the top of his head level with the top of the ant hill
      }
      return;
    }
    if (ant.plan === 'guarding') return;
    if (ant.plan !== 'guard') {
      const by = world.broodSpot();
      ant.post = world.nearestStand('soldier', by.x + 10, by.y - 3, 12) || by;   // a spot a soldier fits, beside the brood)
      ant.plan = 'guard';
      ant.visit = ant.post;
    }
    const left = world.distance(ant.visit, ant.x, ant.y, 'worker');
    if (left >= 0 && left <= ARRIVED) {
      ant.plan = 'guarding';
      ant.direction = DIRECTIONS[1];
      ant.facing = 'left';   // facing the queen
    }
  }

  // Just inside the nest hole, below the grass.
  function plugSpot(world) {
    let ground = 0;
    while (world.aboveGround(ground)) ground++;
    return world.nearestStand('worker', world.opening(), ground + DOORHEAD.plugDepth, 6);
  }

  // Back to what a soldier was doing before a fight or the alarm.
  function freeSoldier(ant) {
    ant.chasing = null;
    const wasUp = ant.wasUp;
    ant.wasUp = false;
    if (ant.doorhead) {                   // the door-head stays in the hole, or goes back to his post (doorheadUpdate)
      // (in the hole already: stays there; caught on his way up: carries on up to it, not stuck short of it)
      if (plug && ant.post === plug) {
        ant.plan = ant.inHole ? 'plugged' : 'plug';
        ant.visit = ant.inHole ? null : ant.post;
      } else {
        ant.plan = 'down';
        ant.visit = null;
      }
      return;
    }
    if (ant.major || ant.red) {           // the supermajor goes back to work, not to the alarm
      ant.plan = ant.carry.length > 0 ? 'deliver' : 'down';
      ant.visit = null;
      return;
    }
    if (rallySpot) {
      ant.plan = 'rally';
      ant.visit = rallySpot;
    } else if (wasUp) {
      ant.plan = 'up';     // on its way up (or out on the grass) before: carries on, not back down
      ant.visit = null;
    } else {
      ant.plan = 'down';   // back to the main chamber (a soldier may be in a tunnel)
      ant.visit = null;
    }
  }

  // A worker with crumb for the queen: to a replete with room instead, if
  // there is one (never the supermajor, whose load is worth more at the queen).
  function toQueen(ant, world) {
    ant.plan = 'deliver';
    toReplete(ant, world);
  }

  // A worker taking crumb to the queen switches to a replete that still has
  // room for it (counting the crumb other workers are already bringing there).
  function toReplete(ant, world) {
    if (ant.major || ant.bodyFood || ant.carry.length === 0 || !world.repleteTarget) return false;
    const coming = {};
    for (const a of ants) {
      if (a.plan === 'feedReplete' && a.visit) coming[a.visit.id] = (coming[a.visit.id] || 0) + a.carry.length;
    }
    const replete = world.repleteTarget(coming);
    if (!replete) return false;
    ant.plan = 'feedReplete';
    ant.visit = replete;
    return true;
  }

  // Majors: now and then a free major soldier goes to crack an uncracked seed
  // (up to CRACK.most at a time, never two on the same seed).
  function sendCrackers(now, world) {
    if (crackers <= 0 || !world.crackTarget) {
      for (const a of ants) a.crackerDuty = false;
      return;
    }
    // One major is always the seed cracker: it goes from granary to granary,
    // cracking what it finds, and never stops for other work.
    let duty = ants.find((a) => a.crackerDuty && a.majorSoldier);
    if (!duty) {
      const able = ants.filter((a) => a.majorSoldier && a.kind === 'soldier' && !a.doorhead && !a.explorer && !world.aboveGround(a.y));
      duty = able.find((a) => ['wander', 'visit', 'crack'].includes(a.plan)) ||
        able.find((a) => (a.asWorker || WORKER_PLANS.has(a.plan) || a.plan === 'up') && a.carry.length === 0 && !a.task);   // (one off a worker job if need be, before it picks anything up)
      if (duty) {
        duty.crackerDuty = true;
        if (!['wander', 'visit', 'crack'].includes(duty.plan)) { duty.plan = 'wander'; duty.visit = null; duty.asWorker = false; }
      }
    }
    if (duty && (duty.plan === 'wander' || duty.plan === 'visit') && !world.aboveGround(duty.y)) {
      const skip = new Set(ants.filter((a) => a !== duty && a.plan === 'crack').map((a) => a.visit && a.visit.id));
      const target = world.crackTarget('worker', duty.x, duty.y, skip) || nextRound(duty, world, skip);
      if (target) { duty.plan = 'crack'; duty.visit = target; duty.cracksLeft = 1; }
    }
    if (now < nextCrackAt) return;
    nextCrackAt = now + CRACK.everyMs;
    const busy = ants.filter((a) => a.plan === 'crack');
    if (busy.length >= Math.min(crackers, CRACK.most)) return;
    const free = ants.filter((a) => a.majorSoldier && !a.crackerDuty && a.kind === 'soldier' && !a.doorhead && !a.explorer && (a.plan === 'wander' || a.plan === 'visit') && clock >= a.readyAt && !world.aboveGround(a.y));
    if (free.length === 0) return;
    const ant = pick(free);
    const skip = new Set(busy.map((a) => a.visit && a.visit.id));
    const target = world.crackTarget('worker', ant.x, ant.y, skip);   // (soldiers find their way along the worker paths, as when answering the alarm)
    if (!target) return;   // (a second cracker only goes for a real seed)
    ant.plan = 'crack';
    ant.visit = target;
    ant.cracksLeft = 1;   // after this one, one more look for another nearby
  }

  // The seed cracker's next stop with nothing to crack: another granary, not one of the last few it looked in.
  function nextRound(ant, world, skip) {
    ant.lastGranaries = ant.lastGranaries || [];
    const avoid = new Set([...skip, ...ant.lastGranaries]);
    return world.crackTarget('worker', ant.x, ant.y, avoid, CRACK.patrolReach, true) || world.crackTarget('worker', ant.x, ant.y, avoid, undefined, true) ||
      world.crackTarget('worker', ant.x, ant.y, skip, undefined, true);
  }

  // On its way to a seed: crack it, then perhaps one more nearby, then back to wandering.
  // (The seed cracker on duty goes straight on to the next granary.)
  function crackUpdate(ant, world) {
    const left = world.distance(ant.visit, ant.x, ant.y, 'worker');
    if (left >= 0 && left > ARRIVED) return;
    if (left >= 0) world.crackSeed(ant.visit.id);
    const others = new Set(ants.filter((a) => a !== ant && a.plan === 'crack').map((a) => a.visit && a.visit.id));
    if (ant.crackerDuty) {
      if (ant.visit && ant.visit.id !== undefined) ant.lastGranaries = (ant.lastGranaries || []).concat(ant.visit.id).slice(-3);
      const next = left >= 0 ? (world.crackTarget('worker', ant.x, ant.y, others) || nextRound(ant, world, others)) : null;
      ant.readyAt = clock + CRACK_REST;
      if (next) { ant.visit = next; return; }
    }
    const next = left >= 0 && ant.cracksLeft > 0 ? world.crackTarget('worker', ant.x, ant.y, others, CRACK.nearby) : null;
    ant.visit = null;
    ant.readyAt = clock + CRACK_REST;
    if (next) {
      ant.cracksLeft -= 1;
      ant.visit = next;
    } else if (world.canStand(ant.kind, ant.x, ant.y, false)) {
      ant.plan = 'wander';
    } else {
      ant.plan = 'down';   // (a soldier only wanders where it fits)
    }
  }

  // After a step, decide whether the ant's plan changes.
  // At the spot it was sent to for a body or a fallen soldier (the nearest
  // place a worker can stand, which may be a few pixels from it, say when it
  // fell on a wall only a fire ant could climb): close enough to pick it up.
  function atPickup(ant, world) {
    const spot = ant.visit;
    if (!spot) return false;
    if (world.aboveGround(spot.y)) return world.aboveGround(ant.y) && Math.abs(ant.x - spot.x) <= 2;
    if (world.aboveGround(ant.y)) return false;
    const left = world.distance(spot, ant.x, ant.y, 'worker');
    return left >= 0 && left <= ARRIVED;
  }

  function updatePlan(ant, world) {
    if (ant.kind === 'fire') return fireUpdate(ant, world);
    if (ant.plan === 'rally') return;   // stays near the alarm until it fades (or a fight)
    if (ant.plan === 'hide') {
      // In the chamber: on to a spot of its own there (so they don't all pile
      // up under the tunnel), then wait.
      if (!ant.visit && world.distance('home', ant.x, ant.y) === 0) ant.visit = world.randomSpot('worker');
      if (ant.visit) {
        const left = world.distance(ant.visit, ant.x, ant.y, 'worker');
        if (left < 0 || left <= ARRIVED) ant.plan = 'huddle';
      }
      return;
    }
    if (ant.plan === 'feedFungus') {
      if (world.aboveGround(ant.y)) return;
      const left = world.distance(ant.visit, ant.x, ant.y, 'worker');
      if (left >= 0 && left > ARRIVED) return;
      const fed = left < 0 ? 'full' : world.feedFungus(ant.visit.id, ant.carry.length * (ant.carryWorth || 1));
      if (fed === 'fed') ant.carryWorth = 1;
      if (fed === 'fed' || ant.leaf) {   // (grass the garden could not take is dropped)
        ant.carry = [];
        ant.leaf = false;
        ant.visit = null;
        ant.plan = 'wander';
        ant.readyAt = clock + restFor(ant, world, FED_REST_MIN + Math.random() * (FED_REST_MAX - FED_REST_MIN));
      } else {
        ant.visit = null;
        toQueen(ant, world);    // gone, full, or grew moments ago: the queen (or a replete) gets it instead
      }
      return;
    }
    if (ant.plan === 'milk') {
      // On the way to a full aphid: milk it (and the full ones near it), then rest.
      const left = world.aboveGround(ant.y) ? -1 : world.distance(ant.visit, ant.x, ant.y, 'worker');
      if (left >= 0 && left > ARRIVED) return;
      if (left >= 0) world.milkAphids(ant.visit.id);
      ant.visit = null;
      ant.plan = 'wander';
      ant.readyAt = clock + restFor(ant, world, FED_REST_MIN);
      return;
    }
    if (ant.plan === 'fetchStash') {
      // On the way to a stored seed: pick it up and take it to the granary held for it.
      const left = world.aboveGround(ant.y) ? -1 : world.distance(ant.visit, ant.x, ant.y, 'worker');
      if (left >= 0 && left > ARRIVED) return;
      const item = left >= 0 ? world.takeStash(ant.visit.id) : null;
      if (item && ant.granary) {
        ant.carry = world.seedColors(item.kind).slice();
        ant.plan = 'store';
        ant.task = 'stash';
        ant.visit = Object.assign({}, ant.granary, { aged: item.aged, worth: item.worth, kind: item.kind, fromStash: true });
        ant.granary = null;
        return;
      }
      if (ant.granary) world.releaseGranary(ant.granary.id);
      ant.granary = null;
      ant.visit = null;
      ant.plan = 'wander';
      ant.readyAt = clock + restFor(ant, world, FED_REST_MIN);
      return;
    }
    if (ant.plan === 'feedReplete') {
      if (world.aboveGround(ant.y)) return;
      const left = world.distance(ant.visit, ant.x, ant.y, 'worker');
      if (left >= 0 && left > ARRIVED) return;
      const fed = left < 0 ? 'full' : world.feedReplete(ant.visit.id, ant.carry.length * (ant.carryWorth || 1));
      if (fed === 'fed') ant.carryWorth = 1;
      ant.visit = null;
      if (fed === 'fed') {
        ant.carry = [];
        ant.plan = 'wander';
        ant.readyAt = clock + restFor(ant, world, FED_REST_MIN + Math.random() * (FED_REST_MAX - FED_REST_MIN));
      } else {
        ant.plan = 'deliver';   // it filled up or is resting: on to the queen
      }
      return;
    }
    if (ant.plan === 'fetchBody') {
      const body = ant.body;
      if (!body || body.gone || body.collector !== ant) {
        ant.plan = 'down';
        ant.body = null;
      } else if ((Math.abs(ant.x - body.x) <= 4 && Math.abs(ant.y - body.y) <= 5) || atPickup(ant, world)) {
        body.gone = true;          // picked up: off to the queen with it (or to the midden)
        ant.body = null;
        ant.carry = BODY_COLORS.slice();
        ant.bodyFood = FIGHT.bodyFood;
        ant.bodyMarauder = !!body.marauder;
        const heap = world.middenSpot && world.middenSpot();
        if (heap) {
          ant.plan = 'toMidden';
          ant.visit = heap;
          ant.middenLoad = body.marauder ? MIDDEN.armyLoad : MIDDEN.bodyLoad;
        } else {
          ant.plan = 'deliver';
        }
      }
      return;
    }
    if (ant.plan === 'rescue') {
      const soldier = ant.hauling;
      if (!soldier || soldier.plan !== 'fallen') {
        ant.plan = 'down';
        ant.hauling = null;
      } else if ((Math.abs(ant.x - soldier.x) <= 4 && Math.abs(ant.y - soldier.y) <= 5) || atPickup(ant, world)) {
        soldier.plan = 'carried';
        ant.plan = 'haul';
        ant.visit = world.broodSpot();
      }
      return;
    }
    if (ant.plan === 'haul') {
      const left = world.aboveGround(ant.y) ? -1 : world.distance(ant.visit, ant.x, ant.y, 'worker');
      if (left >= 0 && left <= ARRIVED) {
        const soldier = ant.hauling;
        const bed = world.nearestStand('soldier', ant.x, ant.y - 3) || { x: ant.x, y: ant.y - 3 };
        soldier.x = bed.x;
        soldier.y = bed.y;
        soldier.plan = 'healing';
        if (world.soldierSaved) world.soldierSaved();   // (counted for the Matabele achievement)
        soldier.healAt = clock + FIGHT.healMs;
        soldier.rescuer = null;
        ant.hauling = null;
        ant.plan = 'wander';
        ant.readyAt = clock + restFor(ant, world, HOME_REST);
      }
      return;
    }
    if (ant.plan === 'crack') {
      crackUpdate(ant, world);
      return;
    }
    if (ant.explorer) {
      // Explorers only ever walk across the nest.
      if (ant.plan === 'wander' && Math.random() < EXPLORE_CHANCE) {
        const spot = world.farSpot(ant.kind, ant.x, ant.y);
        if (spot) {
          ant.plan = 'visit';
          ant.visit = spot;
        }
      } else if (ant.plan === 'visit') {
        const left = world.distance(ant.visit, ant.x, ant.y, ant.kind);
        if (left < 0 || (left <= ARRIVED && world.canStand(ant.kind, ant.x, ant.y, false))) {
          ant.plan = 'wander';
          ant.visit = null;
        }
      } else if (ant.plan !== 'wander') {
        ant.plan = 'wander';
      }
      return;
    }
    if (ant.plan === 'wander') {
      // With no crumb out, an ant now and then goes up for a look around.
      // (While a crumb is out, sendForCrumbs decides who goes up.)
      const crumbOut = world.crumbs().length > 0;
      const chance = crumbOut ? 0 : SURFACE_CHANCE * KINDS[ant.kind].surfaceShare;
      const rested = clock >= ant.readyAt;
      if (rested && Math.random() < chance && world.distance('surface', ant.x, ant.y) > 0) {
        ant.plan = 'up';
      } else if (Math.random() < VISIT_CHANCE) {
        const spot = world.destination(ant.kind);
        if (spot && world.distance(spot, ant.x, ant.y, ant.kind) > ARRIVED) {
          ant.plan = 'visit';
          ant.visit = spot;
        }
      }
    } else if (ant.plan === 'visit') {
      // There (or the way was filled in): wander around wherever it is.
      // An ant going past the queen keeps going until it is clear of her.
      const left = world.distance(ant.visit, ant.x, ant.y, ant.kind);
      if (left < 0 || (left <= ARRIVED && world.canStand(ant.kind, ant.x, ant.y, false))) {
        ant.plan = 'wander';
        ant.visit = null;
      }
    } else if (ant.plan === 'up') {
      if (world.distance('surface', ant.x, ant.y) === 0) {
        ant.plan = 'outside';
        ant.outsideLeft = OUTSIDE_MIN + Math.floor(Math.random() * (OUTSIDE_MAX - OUTSIDE_MIN));
        ant.direction = pick(DIRECTIONS.slice(0, 2));
      } else if (world.distance('surface', ant.x, ant.y) < 0) {
        ant.plan = 'down';   // the way up was filled in
      }
    } else if (ant.plan === 'outside' && ant.kind === 'soldier' && !ant.asWorker) {
      if (clock < ant.lingerUntil) return;   // staying up here for a while after a push
      // Walk to the far side of a crumb, then push it toward the tunnel.
      const plan = pushPlan(ant, world);
      if (plan && ant.x === plan.standX) {
        ant.push = plan;
        ant.plan = 'push';
        ant.facing = plan.dir > 0 ? 'right' : 'left';
      } else if (!plan) {
        ant.outsideLeft -= 1;
        if (ant.outsideLeft <= 0) ant.plan = 'down';
      }
    } else if (ant.plan === 'outside' && ant.task === 'seed') {
      // Sent for a seed: walk to it, pick it up, and take it to a granary.
      const seed = world.seedById(ant.seedId);
      if (!seed) {
        ant.task = null;   // gone (or taken): carry on as a normal trip
      } else if (seedGap(ant.x, seed, world) === 0) {
        const target = world.reserveGranary();
        const kind = world.seedKind(ant.seedId);
        const worth = target ? world.takeSeed(ant.seedId) : false;
        if (worth) {
          ant.carry = world.seedColors(kind).slice();
          ant.plan = 'store';
          ant.visit = Object.assign(target, { worth, kind });   // (a midden sunflower seed is worth more)
        } else {
          if (target) world.releaseGranary(target.id);
          ant.task = null;
        }
      }
    } else if (ant.plan === 'store') {
      if (!world.aboveGround(ant.y)) {
        const left = world.distance(ant.visit, ant.x, ant.y, ant.kind);
        if (left >= 0 && left <= ARRIVED) {
          world.storeSeed(ant.visit.id, ant.visit);
          ant.carry = [];
          ant.task = null;
          ant.visit = null;
          ant.plan = 'wander';
          ant.readyAt = clock + restFor(ant, world, FED_REST_MIN + Math.random() * (FED_REST_MAX - FED_REST_MIN));   // same rest as after feeding the queen
        } else if (left < 0) {
          world.releaseGranary(ant.visit.id);   // no way there: the seed is dropped
          ant.carry = [];
          ant.task = null;
          ant.visit = null;
          ant.plan = 'down';
        }
      }
    } else if (ant.plan === 'outside' && ant.task === 'scoutHome') {
      // A scout home from a trip, with its find: gone into the nest hole.
      if (Math.abs(ant.x - world.opening()) <= 1) ant.gone = true;
    } else if (ant.plan === 'outside' && ant.task === 'scout') {
      // A scout: off the edge of the grass, out of sight.
      if (Math.abs(ant.x - ant.exitX) <= 1) ant.gone = true;
    } else if (ant.plan === 'outside' && ant.task === 'litter') {
      // Out for litter: walk to the spot, pick it up, and take it to the queen.
      if (ant.x === ant.litterX) {
        ant.carry = pick(LITTER.kinds).slice(0, LITTER.pixels);
        ant.task = null;
        ant.litter = true;
        ant.plan = 'deliver';
      } else if (clock > ant.litterUntil) {
        ant.task = null;
        ant.plan = 'down';
      }
    } else if (ant.plan === 'outside') {
      const crumb = world.crumbs(ant.x)[0];
      if (crumb) {
        // Head for the nearest crumb (stepping weighs that); take some when there.
        if (crumbGap(ant.x, crumb) === 0) {
          const rules = world.crumbRules();
          // Leafcutter gardens: half the workers off to a fungus garden cut a bit of grass for it instead of taking crumb.
          if (rules.leafcutter && !ant.major && world.fungusTarget && Math.random() < (Number.isFinite(rules.fungusShare) ? rules.fungusShare : FUNGUS_SHARE) * LEAF.share) {
            const busy = {};
            for (const a of ants) if (a.plan === 'feedFungus') busy[a.visit.id] = (busy[a.visit.id] || 0) + 1;
            const garden = world.fungusTarget(busy);
            if (garden) {
              ant.carry = Array.from({ length: LEAF.pixels }, (_, n) => LEAF.colors[n % LEAF.colors.length]);
              ant.leaf = true;
              ant.plan = 'feedFungus';
              ant.visit = garden;
              return;
            }
          }
          const bite = rules.carryMin + Math.floor(Math.random() * (rules.carryMax - rules.carryMin + 1));
          ant.carryWorth = world.crumbWorthOf ? world.crumbWorthOf(crumb.id) : 1;   // (a fruit is worth more)
          ant.carry = world.takeCrumb(crumb.id, ant.major ? Math.round(bite * MAJOR.carryTimes) : bite);
          if (ant.carry.length > 0) {
            toQueen(ant, world);
            // Fungal garden: 4 in 5 workers (never the supermajor) take their
            // crumb to a fungus garden that needs it instead of the queen.
            // The crumb or fungus slider in the Build menu sets the share.
            const share = world.crumbRules().fungusShare;
            let chance = Number.isFinite(share) ? share : FUNGUS_SHARE;
            if (world.crumbRules().leafcutter) chance = Math.min(1, (chance * LEAF.share) / (1 - chance * LEAF.share));   // (with grass taking half: the same number of feedings in all)
            if (!ant.major && world.fungusTarget && Math.random() < chance) {
              const busy = {};
              for (const a of ants) if (a.plan === 'feedFungus') busy[a.visit.id] = (busy[a.visit.id] || 0) + 1;
              const garden = world.fungusTarget(busy);
              if (garden) {
                ant.plan = 'feedFungus';
                ant.visit = garden;
              }
            }
          }
        }
      } else {
        ant.outsideLeft -= 1;
        if (ant.outsideLeft <= 0) ant.plan = 'down';
      }
    } else if (ant.plan === 'milkCat') {
      if (world.aboveGround(ant.y)) return;
      const left = world.distance(ant.visit, ant.x, ant.y, 'worker');
      if (left >= 0 && left > ARRIVED) return;
      if (left >= 0) world.milkCaterpillar();
      ant.visit = null;
      ant.plan = 'wander';
      ant.readyAt = clock + restFor(ant, world, HOME_REST);
    } else if (ant.plan === 'toMidden') {
      if (world.aboveGround(ant.y)) return;   // (a body from the grass: down the tunnel first)
      const left = world.distance(ant.visit, ant.x, ant.y, 'worker');
      if (left >= 0 && left <= 1) {
        world.dumpMidden(ant.middenLoad || 0, ant.bodyFood || 0, ant.x, ant.y, ant.bodyMarauder);
        ant.leavingMidden = true;   // (walks out at the working pace)
        ant.bodyMarauder = false;
        ant.carry = [];
        ant.bodyFood = 0;
        ant.middenLoad = 0;
        ant.visit = null;
        ant.plan = 'wander';
        ant.readyAt = clock + restFor(ant, world, HOME_REST);
      } else if (left < 0) {
        ant.carry = [];      // no way there (dug or filled): dropped
        ant.middenLoad = 0;
        if (ant.bodyFood) world.deliverBody(ant.bodyFood);   // (a body still counts)
        ant.bodyFood = 0;
        ant.visit = null;
        ant.plan = 'down';
      }
    } else if (ant.plan === 'deliver') {
      // On the way to the queen: a replete with room takes the crumb instead.
      if (!ant.litter && clock >= (ant.repleteCheckAt || 0)) {   // (litter always goes to the queen)
        ant.repleteCheckAt = clock + 500;
        if (toReplete(ant, world)) return;
      }
      const left = world.distance('queen', ant.x, ant.y);
      if (left === 0) {
        if (ant.bodyFood) world.deliverBody(ant.bodyFood);   // a fire ant body
        else world.deliver(ant.carry.length * (ant.major ? MAJOR.crumbWorth : 1) * (ant.carryWorth || 1));
        ant.carryWorth = 1;
        ant.bodyFood = 0;
        ant.litter = false;
        ant.carry = [];
        ant.plan = 'wander';
        ant.readyAt = clock + restFor(ant, world, FED_REST_MIN + Math.random() * (FED_REST_MAX - FED_REST_MIN));
      } else if (left < 0) {
        ant.carry = [];      // no way to the queen: the crumb is dropped
        ant.bodyFood = 0;
        ant.litter = false;
        ant.plan = 'down';
      }
    } else if (ant.plan === 'down') {
      // Home: in the main chamber, somewhere it can stand (a soldier needs room).
      const left = world.distance('home', ant.x, ant.y);
      if (left <= 0 && world.canStand(ant.kind, ant.x, ant.y, false)) {
        ant.plan = 'wander';
        ant.readyAt = clock + restFor(ant, world, HOME_REST);
        if (ant.arriving) {
          // A new fire ant made it in: it stays out walking if there is room
          // for one more, or joins the others unseen.
          ant.arriving = false;
          if (ants.filter((a) => a.red && !a.arriving).length > wantRed) ant.gone = true;
        }
      }
    }
  }

  // One step of a soldier pushing a crumb: the crumb and the soldier both
  // move one pixel toward the tunnel, until the crumb has gone half of the
  // way there (or can't go any further). Then the soldier heads home, or
  // half the time stays on the grass for a while first.
  function pushStep(ant, world) {
    const push = ant.push;
    const crumb = world.crumbs().find((c) => c.id === push.id);
    const middle = crumb && (crumb.left + crumb.right) / 2;
    const done = !crumb || (push.dir > 0 ? middle >= push.goal : middle <= push.goal);
    if (done || !world.canStand(ant.kind, ant.x + push.dir, ant.y, true) || !world.pushCrumb(push.id, push.dir)) {
      ant.push = null;
      if (Math.random() < LINGER_CHANCE) {
        // Stay on the grass a while, then see whether there's another crumb to push.
        ant.plan = 'outside';
        ant.lingerUntil = clock + LINGER_MIN + Math.random() * (LINGER_MAX - LINGER_MIN);
        ant.outsideLeft = OUTSIDE_MIN + Math.floor(Math.random() * (OUTSIDE_MAX - OUTSIDE_MIN));
      } else {
        ant.plan = 'down';
      }
      return;
    }
    ant.x += push.dir;
    ant.direction = push.dir > 0 ? DIRECTIONS[0] : DIRECTIONS[1];
    ant.facing = ant.direction.heading;
    ant.pose = 1 - ant.pose;
  }

  // Time until the ant's next step. Workers climbing to the surface or
  // carrying crumb go quicker, and workers on their way to a crumb go
  // quicker still with the Ant Athleticism upgrade.
  function paceOf(ant, world) {
    let pace = KINDS[ant.kind].stepMs * (0.8 + Math.random() * 0.4);
    if (ant.kind === 'fire') return pace;
    pace /= WALK.overall;                                                   // the colony's ants: 10% slower...
    if (world.inNarrow && world.inNarrow(ant.x, ant.y)) pace /= WALK.narrow;   // ...but 15% faster in narrow tunnels
    if (ant.plan === 'rally') pace *= FIGHT.rallyPace;
    if (ant.plan === 'plug') pace *= DOORHEAD.plugPace;   // the door-head races up to the nest hole
    if (ant.plan === 'haul') pace *= FIGHT.haulPace;
    if (ant.kind === 'soldier' && world.aboveGround(ant.y)) pace /= SOLDIER_GRASS;   // soldiers hurry across the open grass
    if (ant.plan === 'hide') return pace * FIGHT.hidePace;
    if (worksAsWorker(ant)) pace /= world.crumbRules().walkSpeed || 1;   // Step counting
    if (worksAsWorker(ant) && world.crumbRules().rush) pace /= RUSH.faster;   // a rove beetle rush
    if (ant.major) pace *= MAJOR.slower;
    if (ant.plan === 'crack') pace /= CRACKER_FASTER;
    if (worksAsWorker(ant) && !ant.major && world.crumbRules().minor) pace /= MINOR.faster;   // Minor workers
    if (ant.red) pace /= RED.faster;
    if (worksAsWorker(ant) && (ant.plan === 'wander' || ant.plan === 'visit')) pace *= WANDER_PACE;
    if (ant.plan === 'up') pace *= UP_PACE;
    if (ant.plan === 'deliver' || ant.plan === 'store' || ant.plan === 'feedFungus' || ant.plan === 'feedReplete' || ant.plan === 'toMidden') pace *= CARRY_PACE;
    if (world.nearMidden && world.nearMidden(ant.x, ant.y)) {
      // The midden: colony ants pick their way slowly past it. Ants working
      // there (on the way in, or leaving after) know the way: half as slow.
      pace *= ant.plan === 'toMidden' || ant.leavingMidden ? MIDDEN.slow * MIDDEN.workerSlow : MIDDEN.slow;
    } else if (ant.leavingMidden) {
      ant.leavingMidden = false;   // clear of it
    }
    if (ant.plan === 'milk' || ant.plan === 'fetchStash') pace *= UP_PACE / (world.crumbRules().speed || 1);   // off to milk an aphid: as fast as a worker running for a crumb or seed
    if (ant.plan === 'push') pace *= PUSH_PACE;
    if (ant.task === 'scout' || ant.task === 'scoutHome') pace /= 2.5;   // scouts hurry off, and home
    if (world.onTrail && world.onTrail(ant.x, ant.y)) pace /= world.trailSpeed();   // pheromone trail: 60% faster
    const toCrumb = worksAsWorker(ant) && (ant.plan === 'up' || ant.plan === 'outside') &&
      ant.carry.length === 0 && !ant.carryArt && (world.crumbs().length > 0 || ant.task === 'seed');   // Athletics: crumb or seed
    if (toCrumb) pace /= world.crumbRules().speed;
    return pace;
  }

  // While a crumb is out: every FETCH_EVERY milliseconds one worker (and
  // five times less often one soldier) drops what it is doing anywhere in
  // the nest and heads up for it. Ants on a trip, ants back in the nest for
  // a moment (or resting after feeding the queen), and explorers are left alone.
  // A seed on the grass goes to the next worker sent out (instead of the
  // crumb), but only while a granary has room for it.
  function sendForCrumbs(now, world) {
    if (ants.some((a) => a.kind === 'fire' && a.plan !== 'dead')) return;   // not during a raid
    if ((world.crumbRules().winter && !world.crumbRules().winterForage) || (world.crumbRules().rain && !world.crumbRules().rainForage)) return;      // nobody forages in winter (unless Microbial heaters) or in the rain
    const crumbOut = world.crumbs().length > 0;
    const claimed = new Set(ants.filter((ant) => ant.task === 'seed').map((ant) => ant.seedId));
    const waiting = world.seeds().filter((s) => !claimed.has(s.id));
    const goingForSeeds = ants.filter((ant) => ant.task === 'seed' && ant.plan !== 'store').length;
    const seedJob = waiting.length > 0 && world.freeGranaries() > goingForSeeds;
    if (!crumbOut && !seedJob) return;
    if (crumbOut && rushing(world)) {
      // A rush: workers out for litter (nothing picked up yet) go for the crumb instead.
      for (const ant of ants) if (ant.task === 'litter' && ant.carry.length === 0 && (ant.plan === 'up' || ant.plan === 'outside')) ant.task = null;
    }
    for (const kind of ['worker', 'soldier']) {
      if (now < nextFetchAt[kind] && !(kind === 'worker' && rushing(world))) continue;   // (a rush: a free worker goes at once)
      if (kind === 'soldier' && (!crumbOut || !somethingToPush(world))) continue;   // every crumb is already by the tunnel
      const rush = kind === 'worker' && rushing(world);
      const free = ants.filter((ant) => (kind === 'worker' ? worksAsWorker(ant) : ant.kind === kind) && !ant.explorer && !ant.cracker && !ant.doorhead &&   // (Division of labor: soldiers go as workers too)
        !(ant.major && !crumbOut) &&   // the supermajor only goes up for crumb, never seeds
        (ant.plan === 'wander' || ant.plan === 'visit' || (rush && emptyHanded(ant))) && (now >= ant.readyAt || rush) &&
        world.canStand(ant.kind, ant.x, ant.y, true) && world.distance('surface', ant.x, ant.y) > 0);
      if (free.length === 0) continue;   // everyone is busy: try again on the next update
      const ant = pick(kind === 'worker' ? laborPool(free) : free);
      ant.plan = 'up';
      ant.visit = null;
      ant.asWorker = kind === 'worker' && ant.kind === 'soldier';   // (a soldier sent as a worker does a worker's trip, not a push)
      if (kind === 'worker' && seedJob && !ant.major) {
        ant.task = 'seed';
        ant.seedId = pick(waiting).id;
      }
      ant.moveAt = Math.min(ant.moveAt, now);   // no finishing a rest first
      nextFetchAt[kind] = now + (kind === 'worker' ? FETCH_EVERY : FETCH_EVERY_SOLDIER);
    }
  }

  // Full aphids: every MILK_EVERY milliseconds the nearest free worker in the
  // nest (not an explorer, the seedcracker or the supermajor) goes to milk
  // one that no worker is on the way to yet. Not during a raid.
  function sendForAphids(now, world) {
    if ((now < nextMilkAt && !rushing(world)) || !world.aphidJobs) return;
    nextMilkAt = now + MILK_EVERY;
    if (ants.some((a) => a.kind === 'fire' && a.plan !== 'dead')) return;
    const claimed = new Set(ants.filter((a) => a.plan === 'milk' && a.visit).map((a) => a.visit.id));
    const jobs = world.aphidJobs(claimed);
    if (jobs.length === 0) return;
    const free = laborPool(ants.filter((a) => worksAsWorker(a) && !a.explorer && !a.major && !a.arriving && a.carry.length === 0 &&
      (a.plan === 'wander' || a.plan === 'visit') && (now >= a.readyAt || rushing(world)) && !world.aboveGround(a.y)));
    if (free.length === 0) return;
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    let best = null;
    for (const ant of free) {
      const far = world.distance(job, ant.x, ant.y, 'worker');
      if (far >= 0 && (!best || far < best.far)) best = { ant, far };
    }
    if (!best) return;
    best.ant.plan = 'milk';
    best.ant.visit = job;
    best.ant.task = null;
    best.ant.moveAt = Math.min(best.ant.moveAt, now);
  }

  // Stored seeds (EAT setting): every STASH_EVERY milliseconds the nearest free
  // worker in the nest goes for one no worker is on the way to yet, once an
  // empty granary is held for it. Not during a raid. In winter too: it is
  // all inside the nest.
  function sendForStash(now, world) {
    if ((now < nextStashAt && !rushing(world)) || !world.stashJobs) return;
    nextStashAt = now + STASH_EVERY;
    if (ants.some((a) => a.kind === 'fire' && a.plan !== 'dead')) return;
    if (world.granariesFree() === 0) return;
    const claimed = new Set(ants.filter((a) => a.plan === 'fetchStash' && a.visit).map((a) => a.visit.id));
    const jobs = world.stashJobs(claimed);
    if (jobs.length === 0) return;
    const free = laborPool(ants.filter((a) => worksAsWorker(a) && !a.explorer && !a.major && !a.cracker && !a.arriving && !a.scout && a.carry.length === 0 &&
      (a.plan === 'wander' || a.plan === 'visit') && (now >= a.readyAt || rushing(world)) && !world.aboveGround(a.y)));
    if (free.length === 0) return;
    const job = jobs[Math.floor(Math.random() * jobs.length)];
    let best = null;
    for (const ant of free) {
      const far = world.distance(job, ant.x, ant.y, 'worker');
      if (far >= 0 && (!best || far < best.far)) best = { ant, far };
    }
    if (!best) return;
    const granary = world.reserveGranary(true);
    if (!granary) return;
    best.ant.plan = 'fetchStash';
    best.ant.visit = job;
    best.ant.granary = granary;
    best.ant.task = null;
    best.ant.moveAt = Math.min(best.ant.moveAt, now);
  }

  // Litter foraging (see LITTER): only while there is no crumb out and no
  // seed to fetch, and not during a raid.
  function sendForMidden(now, world) {
    if (now < nextMiddenAt && !rushing(world)) return;
    nextMiddenAt = now + MIDDEN.everyMs;
    if (!world.middenSpot || ants.some((a) => (a.kind === 'fire' || a.marauder) && a.plan !== 'dead')) return;
    if (ants.filter((a) => a.plan === 'toMidden' && !a.bodyFood).length >= MIDDEN.carriers) return;
    const spot = world.middenSpot();
    if (!spot) return;
    const free = laborPool(ants.filter((a) => worksAsWorker(a) && !a.explorer && !a.major && !a.cracker && !a.arriving && !a.scout && a.carry.length === 0 &&
      (a.plan === 'wander' || a.plan === 'visit') && (now >= a.readyAt || rushing(world)) && !world.aboveGround(a.y)));
    if (free.length === 0) return;
    const ant = pick(free);
    ant.plan = 'toMidden';
    ant.visit = spot;
    ant.task = null;
    ant.carry = MIDDEN.colors.slice();
    ant.middenLoad = MIDDEN.workerLoad;
    ant.moveAt = Math.min(ant.moveAt, now);
  }

  // Lycaenid Mutualism: when the caterpillar is ready, the nearest free worker
  // goes to milk it (one at a time).
  function sendForCaterpillar(now, world) {
    if (!world.caterpillarJob || ants.some((a) => a.plan === 'milkCat')) return;
    const spot = world.caterpillarJob();
    if (!spot) return;
    const free = laborPool(ants.filter((a) => worksAsWorker(a) && !a.explorer && !a.major && !a.arriving && !a.scout && a.carry.length === 0 &&
      (a.plan === 'wander' || a.plan === 'visit') && !world.aboveGround(a.y)));
    if (free.length === 0) return;
    const ant = free.reduce((best, a) => (Math.hypot(a.x - spot.x, a.y - spot.y) < Math.hypot(best.x - spot.x, best.y - spot.y) ? a : best));
    ant.plan = 'milkCat';
    ant.visit = spot;
    ant.task = null;
    ant.moveAt = Math.min(ant.moveAt, now);
  }

  function sendForLitter(now, world) {
    if (now < nextLitterAt && !rushing(world)) return;
    nextLitterAt = now + LITTER.everyMs;
    if ((world.crumbRules().winter && !world.crumbRules().winterForage) || (world.crumbRules().rain && !world.crumbRules().rainForage)) return;   // not in winter (unless Microbial heaters) or in the rain
    if (world.crumbs().length > 0 || world.seeds().length > 0) return;
    if (ants.some((a) => a.kind === 'fire' && a.plan !== 'dead')) return;
    const free = laborPool(ants.filter((a) => worksAsWorker(a) && !a.explorer && !a.major && !a.cracker && !a.arriving && a.carry.length === 0 &&
      (a.plan === 'wander' || a.plan === 'visit') && (now >= a.readyAt || rushing(world)) && !world.aboveGround(a.y) && world.distance('surface', a.x, a.y) > 0));
    const out = ants.filter((a) => a.task === 'litter' || a.litter).length;
    if (free.length === 0 || out >= Math.floor(LITTER.share * (free.length + out))) return;
    const ant = pick(free);
    // Somewhere on the grass not too far from the nest entrance.
    const right = world.raidExit(1e9) - 3;   // (the far right of the grass)
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = world.opening() + side * (LITTER.nearest + Math.floor(Math.random() * (LITTER.farthest - LITTER.nearest)));
    ant.plan = 'up';
    ant.visit = null;
    ant.task = 'litter';
    ant.litterX = Math.min(Math.max(x, 8), right);
    ant.litterUntil = now + LITTER.giveUpMs;
    ant.moveAt = Math.min(ant.moveAt, now);
  }

  /* Move every ant whose time has come. Returns true if any ant moved. */
  // Are a soldier and a fire ant touching?
  function touching(soldier, fire) {
    // (The door-head up in the nest hole: every fire ant at its mouth can reach him, and they gang up on him.)
    return Math.abs(soldier.x - fire.x) <= FIGHT.touchX && Math.abs(soldier.y - fire.y) <= FIGHT.touchY;
  }

  // Fights, soldiers going after fire ants, fetching the fallen, healing.
  // Returns true if anything changed.
  function raidStep(now, world) {
    let changed = false;
    const fire = ants.filter((ant) => ant.kind === 'fire' && ant.plan !== 'dead');
    // Soldiers fight, and so does the supermajor (much stronger, but too big to carry: he heals where he falls).
    // (and so do fire ant workers, together)
    const able = ants.filter((ant) => (ant.kind === 'soldier' || ant.major || (ant.red && (ant.plan === 'fight' || redReady(ant, now)))) &&
      (!STILL.has(ant.plan) || ant.plan === 'fight' || ant.red));

    // A body nobody fetched is gone after a while.
    for (const ant of ants) {
      if (ant.kind === 'fire' && ant.plan === 'dead' && !ant.gone && now >= ant.deadAt + FIGHT.bodyMs) {
        ant.gone = true;
        changed = true;
      }
    }

    // While fire ants are about, workers hurry to the main chamber and wait
    // there. When the raid is over they go back to work, and fetch the bodies.
    const workers = ants.filter((a) => a.kind === 'worker');
    if (fire.length > 0) {
      for (const w of workers) {
        if (w.major || w.red || w.arriving || !HIDE_FROM.has(w.plan) || w.carry.length > 0) continue;   // (fire ant workers fight instead)   // (a new fire ant keeps coming in)   // (the supermajor stands his ground)
        w.plan = 'hide';
        w.task = null;     // a seed it was sent for stays on the grass
        w.visit = null;
        w.moveAt = Math.min(w.moveAt, now);
        changed = true;
      }
    } else {
      for (const w of workers) {
        if (w.plan !== 'hide' && w.plan !== 'huddle') continue;
        w.plan = 'wander';
        w.readyAt = clock + HOME_REST;
        changed = true;
      }
      for (const body of ants.filter((a) => a.kind === 'fire' && a.plan === 'dead' && !a.gone)) {
        if (body.collector && body.collector.body === body && body.collector.plan === 'fetchBody') continue;
        const free = workers.filter((w) => !w.major && w.carry.length === 0 && (w.plan === 'wander' || w.plan === 'visit'));
        if (free.length === 0) break;
        const w = free.reduce((best, a) => (Math.hypot(a.x - body.x, a.y - body.y) < Math.hypot(best.x - body.x, best.y - body.y) ? a : best));
        w.plan = 'fetchBody';
        w.body = body;
        w.visit = world.aboveGround(body.y) ? { x: body.x, y: body.y } : world.nearestStand('worker', body.x, body.y) || { x: body.x, y: body.y };
        w.moveAt = Math.min(w.moveAt, now);
        body.collector = w;
      }
    }

    // Marauders at the queen leave too once their time is up.
    for (const m of fire) {
      if (m.marauder && m.plan === 'siege' && now >= m.leaveAt) {
        m.plan = 'flee';
        m.exitX = world.raidExit(m.x);
        changed = true;
      }
    }

    // Invaders at the queen take some of her food every biteMs, all together
    // (one bite each, shown as one loss). One fighting a soldier doesn't bite her.
    const biting = fire.filter((f) => f.plan === 'siege').reduce((sum, f) => sum + (f.marauder ? MARAUDER.queenBites : 1), 0);
    if (biting === 0) nextSiegeAt = 0;
    else if (!nextSiegeAt) nextSiegeAt = now + INVADE.biteMs;
    else if (now >= nextSiegeAt) {
      nextSiegeAt = now + INVADE.biteMs;
      world.raidQueen(undefined, undefined, biting);
    }

    if (!firePaused) {
      // New fights: a fire ant touching a soldier stops to fight it.
      for (const f of fire) {
        if (f.foe) continue;
        const soldier = able.find((s) => touching(s, f) && (s.doorhead || fire.filter((x) => x.foe === s).length < FIRE_ON_ONE));
        if (!soldier) continue;
        f.foe = soldier;
        f.resume = f.plan;
        f.plan = 'fight';
        soldier.foes = (soldier.foes || []).concat(f);
        if (['up', 'outside', 'push'].includes(soldier.plan)) soldier.wasUp = true;   // (after the fight it carries on up)
        soldier.plan = 'fight';
        soldier.chasing = null;
        soldier.push = null;
        changed = true;
      }
      // Soldiers touching an army ant (or fire ant) that is already fighting join in (up to ARMY_GANG, or FIRE_GANG, on one).
      for (const soldier of able.filter((a) => a.kind === 'soldier' && !a.doorhead && a.plan !== 'fight' && !STILL.has(a.plan))) {
        const f = fire.find((one) => one.plan === 'fight' && one.foe && touching(soldier, one) && soldiersOn(one, soldier) < (one.marauder ? ARMY_GANG : FIRE_GANG));
        if (!f) continue;
        if (['up', 'outside', 'push'].includes(soldier.plan)) soldier.wasUp = true;
        soldier.foes = [f];
        soldier.plan = 'fight';
        soldier.chasing = null;
        soldier.push = null;
        changed = true;
      }
      // Pinning (achievement): ARMY_GANG soldiers fighting one army ant at once.
      for (const f of fire) {
        if (!f.marauder || f.pinned || f.plan !== 'fight') continue;
        const holding = ants.filter((a) => a.kind === 'soldier' && a.plan === 'fight' && a.foes && a.foes.includes(f)).length;
        if (holding >= ARMY_GANG) { f.pinned = true; if (world.noteEvent) world.noteEvent('pin'); }
      }
      // Fire ant workers touching a fire ant that is already fighting join in.
      for (const red of able.filter((a) => a.red && a.plan !== 'fight' && a.plan !== 'fallen')) {
        const f = fire.find((one) => one.plan === 'fight' && one.foe && touching(red, one) && (!one.marauder || redsOn(one) < RED.perArmyAnt));   // (an army ant: two at most)
        if (!f) continue;
        red.foes = [f];
        red.plan = 'fight';
        red.chasing = null;
        changed = true;
      }
      // Bites.
      if (now >= nextBiteAt && fire.some((f) => f.foe)) {
        nextBiteAt = now + FIGHT.everyMs;
        for (const soldier of able.filter((s) => s.plan === 'fight')) {
          const target = soldier.foes.find((f) => f.plan === 'fight');
          if (!target) continue;
          target.hp -= soldier.red ? RED.bite : (soldier.major ? FIGHT.majorBite : FIGHT.soldierBite) * (world.crumbRules().soldierBite || 1);   // Marauder (page III): harder bites
          Sound.sfx('bite');
          if (target.hp <= 0) {
            target.plan = 'dead';
            target.deadAt = now;
            target.foe = null;
            if (target.stolenSeed) {   // a stolen seed is dropped for your workers
              target.stolenSeed = false;
              target.carry = [];
              world.dropSeed(target.x, world.aboveGround(target.y));
            }
            // Everyone biting it is done with it.
            for (const other of able) {
              if (!other.foes || !other.foes.includes(target)) continue;
              other.foes = other.foes.filter((f) => f !== target);
              if (other.foes.length === 0 && other.plan === 'fight') freeSoldier(other);
            }
          }
        }
        for (const f of fire.filter((a) => a.plan === 'fight' && a.foe)) {
          const soldier = f.foe;
          if (!soldier || soldier.plan !== 'fight') continue;   // already down this round
          soldier.hp = (soldier.hp === undefined ? fullHp(soldier) : soldier.hp) - (f.marauder ? MARAUDER.bite : FIGHT.fireBite);
          if (soldier.hp > 0) continue;
          if (soldier.red && f.marauder) {
            // An army ant knocks the fire ant worker it beats over: it lies on its
            // back for RED.downMs, then gets up by itself. The army ant turns on
            // another of the workers biting it, if any.
            soldier.plan = 'fallen';
            soldier.upAt = now + RED.downMs;
            soldier.hp = RED.hp;
            soldier.foes = [];
            soldier.chasing = null;
            soldier.visit = null;
            const next = able.find((a) => a !== soldier && a.plan === 'fight' && a.foes && a.foes.includes(f));
            f.foe = next || null;
            if (!next) f.plan = f.resume || 'raid';
            continue;
          }
          if (soldier.red) {
            // A beaten fire ant worker backs off home for a while; the fire ant
            // turns on another of the workers biting it, if any.
            soldier.hp = RED.hp;
            soldier.restUntil = now + RED.restMs;
            soldier.foes = [];
            soldier.chasing = null;
            soldier.plan = 'down';
            const next = able.find((a) => a !== soldier && a.plan === 'fight' && a.foes && a.foes.includes(f));
            f.foe = next || null;
            if (!next) f.plan = f.resume || 'raid';
            continue;
          }
          // The soldier falls (costing some food): its fire ants go back to the raid.
          world.soldierFell(soldier.x, soldier.y);
          soldier.plan = 'fallen';
          soldier.fallenAt = now;
          soldier.chasing = null;
          for (const other of soldier.foes || []) {
            other.foe = null;
            if (other.plan === 'fight') other.plan = other.resume || 'raid';
          }
          soldier.foes = [];
        }
        changed = true;
      }
      // A fire ant (or army ant) still fighting one that has left the fight
      // (a fire ant worker sent home, say) turns on another biting it, or carries on.
      for (const f of fire.filter((a) => a.plan === 'fight' && a.foe)) {
        const foe = f.foe;
        if (foe.plan === 'fight' && foe.foes && foe.foes.includes(f)) continue;
        const next = able.find((a) => a.plan === 'fight' && a.foes && a.foes.includes(f));
        f.foe = next || null;
        if (!next) f.plan = f.resume || 'raid';
        changed = true;
      }
      // A fire ant worker whose fire ant walked off (its soldier fell) goes after it again.
      for (const red of able.filter((a) => a.red && a.plan === 'fight')) {
        if ((red.foes || []).some((f) => f.plan === 'fight')) continue;
        red.foes = [];
        freeSoldier(red);
      }
      // Fire ant workers gang up: all go after the same fire ant, the one
      // nearest the queen, on the grass or in the nest. Army ants they take
      // on two by two: each pair goes after its own army ant.
      const loose = fire.filter((f) => f.plan !== 'flee' || !world.aboveGround(f.y));
      const army = loose.filter((f) => f.marauder);
      if (army.length > 0) {
        const queenWay = (f) => { const d = world.distance('queen', f.x, f.y); return d >= 0 ? d : 1e9; };
        for (const red of able.filter((a) => a.red && a.plan !== 'fight' && a.plan !== 'fallen')) {
          // Keep its army ant if its pair still needs it; else the one with the fewest on it, nearest the queen.
          let prey = red.chasing && army.includes(red.chasing) && redsOn(red.chasing, red) < RED.perArmyAnt ? red.chasing : null;
          if (!prey) prey = army.reduce((best, f) => { const n = redsOn(f, red), b = redsOn(best, red); return n < b || (n === b && queenWay(f) < queenWay(best)) ? f : best; });
          if (red.chasing === prey && red.visit && Math.abs(red.visit.x - prey.x) + Math.abs(red.visit.y - prey.y) < 4) continue;
          const spot = world.aboveGround(prey.y) ? { x: prey.x, y: prey.y } : world.nearestStand('worker', prey.x, prey.y);
          if (!spot) continue;
          red.plan = 'rally';
          red.visit = spot;
          red.chasing = prey;
          red.task = null;
          red.moveAt = Math.min(red.moveAt, now);
        }
      } else if (loose.length > 0) {
        const prey = loose.reduce((best, f) => {
          const d = world.distance('queen', f.x, f.y);
          const b = world.distance('queen', best.x, best.y);
          return d >= 0 && (b < 0 || d < b) ? f : best;
        });
        for (const red of able.filter((a) => a.red && a.plan !== 'fight' && a.plan !== 'fallen')) {
          if (red.chasing === prey && red.visit && Math.abs(red.visit.x - prey.x) + Math.abs(red.visit.y - prey.y) < 4) continue;
          const spot = world.aboveGround(prey.y) ? { x: prey.x, y: prey.y } : world.nearestStand('worker', prey.x, prey.y);
          if (!spot) continue;
          red.plan = 'rally';
          red.visit = spot;
          red.chasing = prey;
          red.task = null;
          red.moveAt = Math.min(red.moveAt, now);
        }
      } else {
        for (const red of ants.filter((a) => a.red && a.plan === 'rally')) freeSoldier(red);
      }
      // Soldiers go after a fire ant they can see in the nest (the alarm
      // pheromone brings them from farther). Up to ARMY_GANG of them take on
      // one army ant together, even one already fighting.
      for (const soldier of able) {
        if (soldier.red || soldier.doorhead) continue;   // (the door-head holds his post)
        if (soldier.plan === 'fight' || STILL.has(soldier.plan)) continue;   // (one that just fell stays down)
        const up = world.aboveGround(soldier.y);   // (on the grass: after the fire ants on the grass; in the nest: those in the nest)
        const far = (f) => Math.hypot(f.x - soldier.x, f.y - soldier.y);
        const near = fire.filter((f) => world.aboveGround(f.y) === up &&
          far(f) <= FIGHT.sight && (f.marauder && soldier.kind === 'soldier' ? f.plan !== 'flee' && soldiersOn(f, soldier) < ARMY_GANG : f.plan !== 'fight' || (soldier.kind === 'soldier' && f.plan !== 'flee' && soldiersOn(f, soldier) < FIRE_GANG)));
        if (near.length === 0) {
          if (soldier.chasing) freeSoldier(soldier);
          continue;
        }
        const keep = soldier.chasing && near.includes(soldier.chasing) ? soldier.chasing : null;   // (sticks with the one it is after)
        const f = keep || near.reduce((best, one) => (far(one) < far(best) ? one : best));
        if (!soldier.chasing || soldier.chasing !== f || Math.abs(soldier.visit.x - f.x) + Math.abs(soldier.visit.y - f.y) >= 4) {
          const spot = up ? { x: f.x, y: f.y } : world.nearestStand('worker', f.x, f.y);
          if (spot) {
            if (up) soldier.wasUp = true;
            soldier.plan = 'rally';
            soldier.visit = spot;
            soldier.chasing = f;
          }
        }
      }
    }

    // Fire ant workers an army ant knocked over get up again by themselves.
    for (const red of ants.filter((a) => a.red && a.plan === 'fallen' && now >= (a.upAt || 0))) {
      red.plan = world.aboveGround(red.y) ? 'down' : 'wander';
      red.restUntil = now;
      red.moveAt = Math.min(red.moveAt, now);
      changed = true;
    }

    // Fallen soldiers: a worker fetches each one; heal when the time comes.
    for (const soldier of ants.filter((a) => a.kind === 'soldier' || a.major)) {
      if (soldier.plan === 'fallen' && soldier.major) {
        soldier.plan = 'healing';   // the supermajor heals where he lies
        soldier.healAt = now + FIGHT.healMs;
        soldier.carry = [];
      } else if (soldier.plan === 'fallen') {
        if (now - soldier.fallenAt >= FIGHT.giveUpMs) {
          soldier.plan = 'healing';   // nobody came: it heals where it lies
          soldier.healAt = now;
          if (soldier.rescuer) { soldier.rescuer.plan = 'down'; soldier.rescuer.hauling = null; }
          soldier.rescuer = null;
        } else if (!soldier.rescuer || soldier.rescuer.hauling !== soldier) {
          const free = ants.filter((a) => a.kind === 'worker' && !a.major && (a.plan === 'wander' || a.plan === 'visit' || a.plan === 'huddle'));
          if (free.length > 0) {
            const worker = free.reduce((best, a) => (Math.hypot(a.x - soldier.x, a.y - soldier.y) < Math.hypot(best.x - soldier.x, best.y - soldier.y) ? a : best));
            worker.plan = 'rescue';
            worker.hauling = soldier;
            worker.visit = world.nearestStand('worker', soldier.x, soldier.y) || { x: soldier.x, y: soldier.y };
            worker.moveAt = Math.min(worker.moveAt, now);
            soldier.rescuer = worker;
          }
        }
      } else if (soldier.plan === 'carried' && (!soldier.rescuer || soldier.rescuer.hauling !== soldier || !ants.includes(soldier.rescuer))) {
        soldier.plan = 'fallen';   // its carrier is gone (taken away as a replete, say): it waits again
        soldier.rescuer = null;
        soldier.fallenAt = now;
      } else if (soldier.plan === 'healing' && now >= soldier.healAt) {
        soldier.plan = 'down';
        soldier.hp = fullHp(soldier);
        changed = true;
      }
    }

    // A carried soldier rides on its worker's back.
    for (const worker of ants.filter((a) => a.plan === 'haul' && a.hauling)) {
      worker.hauling.x = worker.x;
      worker.hauling.y = worker.y - 6;
    }

    const before = ants.length;
    ants = ants.filter((ant) => !ant.gone);
    return changed || ants.length !== before;
  }

  /* A raid: `count` fire ants walk in from one edge of the grass, in a line.
     An invasion: half from each edge, all going for the queen. */
  function spawnFire(world, count, invade) {
    const half = Math.ceil(count / 2);
    const starts = invade ? world.raidEntry(half, 'left').concat(world.raidEntry(count - half, 'right')) : world.raidEntry(count);
    starts.forEach((start, n) => {
      const ant = newAnt('fire', false);
      ant.invade = Boolean(invade);
      ant.x = start.x;
      ant.y = start.y;
      ant.facing = start.facing;
      ant.direction = DIRECTIONS.find((d) => d.heading === start.facing) || DIRECTIONS[0];
      ant.plan = 'raid';
      ant.hp = FIGHT.fireHp;
      ant.moveAt = Date.now() + (invade ? (n % half) : n) * 250;
      ants.push(ant);
      ant.target = invade ? 'queen' : fireTarget(ant, world);
    });
  }

  /* A marauder raid: `count` marauders, half from each edge. The ones from
     the left go for the queen; the ones from the right rob the stores. */
  function spawnMarauders(world, count) {
    const half = Math.ceil(count / 2);
    const starts = world.raidEntry(half, 'left').concat(world.raidEntry(count - half, 'right'));
    const now = Date.now();
    starts.forEach((start, n) => {
      const ant = newAnt('fire', false);
      ant.marauder = true;
      ant.robber = n >= half;
      ant.x = start.x;
      ant.y = start.y;
      ant.facing = start.facing;
      ant.direction = DIRECTIONS.find((d) => d.heading === start.facing) || DIRECTIONS[0];
      ant.plan = 'raid';
      ant.hp = MARAUDER.hp;
      ant.steals = 0;
      ant.leaveAt = now + MARAUDER.stayMs;
      ant.moveAt = now + (n % half) * 300;
      ants.push(ant);
      ant.target = ant.robber ? marauderTarget(ant, world) : 'queen';
    });
  }

  // A store for a robbing marauder: one no other marauder is after, or the queen.
  function marauderTarget(ant, world) {
    const taken = new Set(ants.filter((a) => a.marauder && a !== ant && a.target && typeof a.target === 'object').map((a) => a.target.kind + a.target.id));
    const stores = world.raidStores().filter((t) => !taken.has(t.kind + t.id));
    if (stores.length === 0) return 'queen';
    return stores[Math.floor(Math.random() * stores.length)];
  }

  function marauderUpdate(ant, world) {
    const up = world.aboveGround(ant.y);
    if (ant.plan === 'flee') {
      if (up && Math.abs(ant.x - ant.exitX) <= 1) ant.gone = true;
      return;
    }
    if (ant.plan !== 'raid' && ant.plan !== 'siege') return;
    if (clock >= ant.leaveAt) {   // time to go, with what they have
      ant.plan = 'flee';
      ant.exitX = world.raidExit(ant.x);
      return;
    }
    // A fire ant worker (yours) in sight, on its feet: it goes for that one first.
    if (ant.hunt && (ant.hunt.plan === 'fallen' || !ants.includes(ant.hunt) || Math.hypot(ant.hunt.x - ant.x, ant.hunt.y - ant.y) > FIGHT.sight * 1.5)) ant.hunt = null;
    if (!ant.hunt && ant.plan === 'raid') {
      const near = ants.filter((a) => a.red && a.plan !== 'fallen' && !a.arriving && world.aboveGround(a.y) === up && Math.hypot(a.x - ant.x, a.y - ant.y) <= FIGHT.sight);
      if (near.length > 0) ant.hunt = near.reduce((best, a) => (Math.hypot(a.x - ant.x, a.y - ant.y) < Math.hypot(best.x - ant.x, best.y - ant.y) ? a : best));
    }
    if (ant.hunt) return;   // (its fight starts when they touch)
    if (ant.plan === 'siege' || up) return;
    if (ant.target === 'queen') {
      // At the queen: a spot of its own on the floor by her, and it stays (as invaders do).
      const left = world.distance('queen', ant.x, ant.y);
      if (left < 0 || left > ARRIVED) return;
      const spot = world.nearestStand('worker', ant.x + Math.round(Math.random() * INVADE.spread * 2 - INVADE.spread), ant.y);
      ant.target = spot ? { x: spot.x, y: spot.y, atQueen: true } : { x: ant.x, y: ant.y, atQueen: true };
      return;
    }
    const left = world.distance(ant.target, ant.x, ant.y, 'worker');
    if (left < 0 || left > ARRIVED) {
      if (left < 0) ant.target = ant.target.atQueen ? 'queen' : marauderTarget(ant, world);   // no way there: elsewhere
      return;
    }
    if (ant.target.atQueen) {
      ant.plan = 'siege';
      return;
    }
    if (world.raidStore(ant.target)) {
      ant.steals += 1;
      if (ant.carry.length === 0) ant.carry = world.seedColors().slice(0, 4);
    }
    if (ant.steals >= MARAUDER.steals) {
      ant.plan = 'flee';
      ant.exitX = world.raidExit(ant.x);
    } else {
      ant.target = marauderTarget(ant, world);
    }
  }

  /* The fire ants of a raid now under way, for saving: live ones (and the
     bodies of beaten ones) with where they are and what they carry. */
  function exportRaid() {
    const now = Date.now();
    return ants.filter((a) => a.kind === 'fire' && !a.invade && !a.gone).map((a) => ({
      x: a.x, y: a.y, hp: a.hp, facing: a.facing,
      plan: a.plan === 'dead' ? 'dead' : a.plan === 'flee' ? 'flee' : 'raid',
      carry: a.carry.slice(0, 4), stolenSeed: !!a.stolenSeed, exitX: a.exitX,
      marauder: !!a.marauder, robber: !!a.robber, steals: a.steals || 0, leaveIn: a.marauder ? Math.max(0, (a.leaveAt || now) - now) : 0,
      deadFor: a.plan === 'dead' ? now - (a.deadAt || now) : 0
    }));
  }

  // Soldiers down (fallen, carried or healing) when the game closed: they stay
  // down when it opens again, healing on the same clock (time away counts).
  function exportDowned() {
    if (pendingDowned) return pendingDowned.slice();   // (not put back yet)
    return ants.filter((a) => (a.kind === 'soldier' || a.major) && (a.plan === 'fallen' || a.plan === 'carried' || a.plan === 'healing')).map((a) => ({
      major: !!a.major, doorhead: !!a.doorhead, x: a.x, y: a.plan === 'carried' ? a.y + 6 : a.y,
      healing: a.plan === 'healing', healAt: a.healAt || 0, fallenAt: a.fallenAt || 0
    }));
  }
  let pendingDowned = null;
  function loadDowned(list) {
    pendingDowned = Array.isArray(list) && list.length > 0 ? list.slice(0, 60) : null;
  }
  // (Done on the first update, once the soldiers are walking.)
  function putBackDowned(now, world) {
    const list = pendingDowned;
    pendingDowned = null;
    for (const saved of list) {
      if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) continue;
      if (saved.healing ? !(saved.healAt > now) : !(Number.isFinite(saved.fallenAt) && now - saved.fallenAt < FIGHT.giveUpMs)) continue;   // healed while away
      const soldier = ants.find((a) => (saved.major ? a.major : a.kind === 'soldier' && !!a.doorhead === !!saved.doorhead) && !STILL.has(a.plan) && a.plan !== 'rally');
      if (!soldier) continue;
      const spot = world.canStand(soldier.major ? 'worker' : 'soldier', Math.round(saved.x), Math.round(saved.y)) ? { x: Math.round(saved.x), y: Math.round(saved.y) }
        : world.nearestStand(soldier.major ? 'worker' : 'soldier', Math.round(saved.x), Math.round(saved.y), 12);
      if (spot) { soldier.x = spot.x; soldier.y = spot.y; }
      soldier.carry = [];
      soldier.visit = null;
      soldier.rescuer = null;
      if (saved.healing) {
        soldier.plan = 'healing';
        soldier.healAt = saved.healAt;
      } else {
        soldier.plan = 'fallen';
        soldier.fallenAt = saved.fallenAt;
      }
    }
  }

  /* Put back a raid saved by exportRaid (the game was closed during it).
     Only if no raid is on now. Returns true if any fire ant came back. */
  function loadRaid(list, world) {
    if (!Array.isArray(list) || list.length === 0) return false;
    if (ants.some((a) => a.kind === 'fire' && !a.invade)) return false;
    const now = Date.now();
    let added = 0;
    for (const saved of list.slice(0, 40)) {
      if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) continue;
      const ant = newAnt('fire', false);
      ant.x = Math.round(saved.x);
      ant.y = Math.round(saved.y);
      ant.facing = saved.facing === 'left' ? 'left' : 'right';
      ant.direction = DIRECTIONS.find((d) => d.heading === ant.facing) || DIRECTIONS[0];
      ant.marauder = saved.marauder === true;
      ant.robber = saved.robber === true;
      ant.steals = Number.isFinite(saved.steals) ? saved.steals : 0;
      ant.leaveAt = now + (Number.isFinite(saved.leaveIn) ? Math.min(saved.leaveIn, MARAUDER.stayMs) : MARAUDER.stayMs);
      ant.hp = Number.isFinite(saved.hp) && saved.hp > 0 ? saved.hp : ant.marauder ? MARAUDER.hp : FIGHT.fireHp;
      ant.carry = Array.isArray(saved.carry) ? saved.carry.filter((c) => typeof c === 'string').slice(0, 4) : [];
      ant.stolenSeed = saved.stolenSeed === true;
      ant.moveAt = now + Math.random() * KINDS.fire.stepMs;
      if (saved.plan === 'dead') {
        ant.plan = 'dead';
        ant.deadAt = now - Math.min(Math.max(saved.deadFor || 0, 0), FIGHT.bodyMs);
      } else if (saved.plan === 'flee') {
        ant.plan = 'flee';
        ant.exitX = Number.isFinite(saved.exitX) ? saved.exitX : world.raidExit(ant.x);
      } else {
        ant.plan = 'raid';
        ant.target = ant.marauder ? (ant.robber ? marauderTarget(ant, world) : 'queen') : fireTarget(ant, world);
      }
      if (ant.plan !== 'dead' && !world.canStand('fire', ant.x, ant.y, true, true)) continue;   // the ground there was filled in
      ants.push(ant);
      added++;
    }
    return added > 0;
  }

  /* A new fire ant (hatched in the fire ant nest) comes in over the grass
     from one edge after `delay` ms, and heads down into the nest. */
  function arrive(world, delay) {
    const start = world.raidEntry(1)[0];
    const ant = newAnt('worker', false);
    ant.red = true;
    ant.arriving = true;
    ant.x = start.x;
    ant.y = start.y;
    ant.facing = start.facing;
    ant.direction = DIRECTIONS.find((d) => d.heading === start.facing) || DIRECTIONS[0];
    ant.plan = 'down';
    ant.showAt = Date.now() + (delay || 0);   // when it first steps onto the grass
    ant.moveAt = ant.showAt;
    ants.push(ant);
  }

  /* Scouts leaving (popup.js): `count` workers walk up and off the edge of
     the grass on `side` ('left' or 'right'), and are gone. */
  function sendScouts(count, side, world) {
    const pickable = ants.filter((a) => a.kind === 'worker' && !a.major && !a.red && !a.scout && !a.explorer && STILL.has(a.plan) === false &&
      a.plan !== 'deliver' && a.plan !== 'store' && !world.aboveGround(a.y));
    for (let n = 0; n < count && pickable.length > 0; n++) {
      const ant = pickable.splice(Math.floor(Math.random() * pickable.length), 1)[0];
      if (ant.task === 'seed' && ant.visit && ant.visit.id !== undefined) world.releaseGranary(ant.visit.id);
      ant.scout = true;
      ant.task = 'scout';
      ant.exitX = world.raidExit(side === 'left' ? 0 : 1e9);
      ant.plan = 'up';
      ant.visit = null;
      ant.carry = [];
      ant.litter = false;
      ant.moveAt = Math.min(ant.moveAt, Date.now());
    }
  }

  /* Scouts home from a trip (popup.js): `count` workers come in over the
     grass from the edge on `side` ('left' or 'right'), each carrying a bit of
     what was found (`kind`: 'insect', a dead insect, or 'seeds'), and are
     gone at the nest hole. (Only seen: the food is already counted.) */
  const INSECT_BITS = ['bitLeg', 'bitHead', 'bitEye', 'bitShin', 'bitWing'];   // pictures in sprites.js
  const SCOUT_HOME_GAP = 700;   // ms between scouts coming in at the edge
  function returnScouts(count, side, kind, world) {
    const spot = world.raidEntry(1, side)[0];   // the edge of the grass
    const seed = world.seedColors();
    const first = Math.floor(Math.random() * INSECT_BITS.length);   // a mix of parts, starting anywhere
    for (let n = 0; n < count; n++) {
      const ant = newAnt('worker', false);
      ant.scout = true;
      ant.task = 'scoutHome';
      ant.plan = 'outside';
      ant.x = spot.x;
      ant.y = spot.y;
      ant.facing = spot.facing;
      ant.direction = spot.facing === 'right' ? DIRECTIONS[0] : DIRECTIONS[1];
      if (kind === 'insect') { ant.carry = []; ant.carryArt = INSECT_BITS[(first + n) % INSECT_BITS.length]; }
      else ant.carry = seed.concat(seed).slice(0, 6);
      ant.showAt = Date.now() + n * SCOUT_HOME_GAP;   // one after another, in from the edge
      ant.moveAt = ant.showAt;
      ants.push(ant);
    }
  }

  /* A structure was deleted: ants on their way to a granary, fungus garden or
     replete give that up (crumb goes to the queen; a seed is dropped). */
  function forgetBuildings(world) {
    for (const ant of ants) {
      if (ant.plan === 'feedFungus' && ant.leaf) {   // (a bit of grass is dropped)
        ant.carry = [];
        ant.leaf = false;
        ant.visit = null;
        ant.plan = 'wander';
      } else if (ant.plan === 'feedFungus' || ant.plan === 'feedReplete') {
        ant.visit = null;
        ant.plan = 'deliver';
      } else if (ant.plan === 'milk' || ant.plan === 'fetchStash') {
        ant.visit = null;
        ant.granary = null;   // (its granary may be the one taken away)
        ant.plan = 'wander';
      } else if (ant.plan === 'store') {
        ant.carry = [];
        ant.task = null;
        ant.visit = null;
        ant.plan = 'down';
      } else if (ant.plan === 'crack') {
        ant.visit = null;
        ant.plan = 'down';
      } else if (ant.kind === 'fire' && ant.plan === 'raid' && !ant.invade && ant.target && typeof ant.target === 'object' && !ant.target.grass) {
        ant.target = fireTarget(ant, world);
      }
    }
  }

  /* The alarm pheromone: every soldier able to walk heads for `spot`, until endRally(). */
  function rally(spot) {
    rallySpot = spot;
    for (const ant of ants) {
      if ((ant.kind !== 'soldier' && !ant.major) || ant.doorhead || STILL.has(ant.plan)) continue;   // soldiers and the supermajor (the door-head holds his post)
      ant.plan = 'rally';
      ant.visit = spot;
      ant.push = null;
      ant.chasing = null;
      ant.moveAt = Math.min(ant.moveAt, Date.now());
    }
  }

  function endRally() {
    rallySpot = null;
    for (const ant of ants) {
      if ((ant.kind === 'soldier' || ant.major) && ant.plan === 'rally' && !ant.chasing) freeSoldier(ant);
    }
  }

  // A defender's health when well.
  function fullHp(ant) {
    return ant.major ? FIGHT.majorHp : ant.red ? RED.hp : ant.doorhead ? FIGHT.doorheadHp : ant.majorSoldier ? FIGHT.majorSoldierHp : FIGHT.soldierHp;
  }

  function update(now, world) {
    let moved = false;
    clock = now;
    laborOn = !!world.crumbRules().labor;
    for (const ant of ants) if (ant.kind === 'soldier') {   // (with Division of labor, the soldier explorers go to work too)
      if (ant.bornExplorer === undefined) ant.bornExplorer = !!ant.explorer;
      ant.explorer = ant.bornExplorer && !laborOn;
    }
    for (const ant of ants) if (ant.asWorker && (!laborOn || ((ant.plan === 'wander' || ant.plan === 'visit') && ant.carry.length === 0 && !ant.task))) ant.asWorker = false;   // (back to being a soldier once home)
    if (pendingDowned) putBackDowned(now, world);
    sendForCrumbs(now, world);
    sendForAphids(now, world);
    sendForStash(now, world);
    sendForLitter(now, world);
    sendForMidden(now, world);
    sendForCaterpillar(now, world);
    sendCrackers(now, world);
    for (const ant of ants) if (ant.scout && ant.plan !== 'up' && ant.plan !== 'outside') ant.gone = true;   // a scout turned back (a raid): it just goes
    if ((world.crumbRules().rain && !world.crumbRules().rainForage) || (world.crumbRules().winter && !world.crumbRules().winterForage)) {   // (weaver branch 3: waterproof canopies, foraging in the rain)
      // Rain or winter: everyone out on the grass (but scouts and ants carrying something home) heads back in.
      for (const ant of ants) {
        if (ant.scout || ant.kind === 'fire' || ant.carry.length > 0) continue;
        if (ant.plan === 'up' || ant.plan === 'outside') {
          if (ant.task === 'seed' && ant.visit && ant.visit.id !== undefined) world.releaseGranary(ant.visit.id);
          ant.task = null;
          ant.plan = 'down';
          ant.visit = null;
        }
      }
    }
    doorheadUpdate(world);
    if (raidStep(now, world)) moved = true;
    const party = partying(now);
    if (party) moved = true;   // (they dance on every tick)
    for (const ant of ants) {
      if (STILL.has(ant.plan) || (ant.kind === 'fire' && firePaused)) continue;
      if (party && dances(ant)) { ant.moveAt = Math.max(ant.moveAt, now); continue; }   // dancing where it stands
      if (ant.plan === 'guarding' || ant.plan === 'plugged') continue;   // the door-head at his post
      const most = worksAsWorker(ant) && world.crumbRules().rush ? RUSH.mostSteps : MOST_STEPS;
      for (let n = 0; n < most && now >= ant.moveAt; n++) {
        // An ant whose ground was filled in, or that is boxed in, starts again elsewhere.
        const outdoors = mayGoOutside(ant);
        if (ant.plan === 'push' && world.canStand(ant.kind, ant.x, ant.y, true)) {
          pushStep(ant, world);
        } else if (!world.canStand(ant.kind, ant.x, ant.y, outdoors, mayPassQueen(ant)) || !step(ant, world)) {
          if (ant.kind === 'fire') { ant.gone = true; break; }   // a boxed-in fire ant gives up
          if (ant.plan === 'rescue' || ant.plan === 'haul') {
            if (ant.hauling) { ant.hauling.plan = 'fallen'; ant.hauling.rescuer = null; ant.hauling.fallenAt = Math.min(ant.hauling.fallenAt || now, now); }
            ant.hauling = null;
          }
          place(ant, world);
        } else {
          updatePlan(ant, world);
        }
        moved = true;

        const rest = ant.plan === 'wander' && Math.random() < REST_CHANCE && !(worksAsWorker(ant) && world.crumbRules().rush)
          ? REST_MIN + Math.random() * (REST_MAX - REST_MIN)
          : 0;
        ant.moveAt = Math.max(ant.moveAt, now - CATCH_UP_MS) + paceOf(ant, world) + rest;
      }
    }
    return moved;
  }

  // Where a worker holds what it carries: just in front of its head, from
  // the ant's middle, for each way it faces. A bigger load sticks out
  // further forward: each pixel goes `ahead` steps forward and `side` across.
  const CARRY_AT = {
    right: { x: 4, y: -1 },
    left: { x: -5, y: -1 },
    up: { x: -1, y: -5 },
    down: { x: -1, y: 4 }
  };
  const SOLDIER_JAWS = 4;   // a soldier holds what it carries this much farther ahead (Division of labor)
  const CARRY_ORDER = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1], [3, 0], [3, 1]];   // [ahead, side]

  // `more`: how much farther ahead the jaws are (a soldier's big head).
  function carryPixel(heading, ahead, side, more = 0) {
    const at = CARRY_AT[heading];
    ahead += more;
    if (heading === 'right') return [at.x + ahead, at.y + side];
    if (heading === 'left') return [at.x - ahead, at.y + side];
    if (heading === 'up') return [at.x + side, at.y - ahead];
    return [at.x + side, at.y + ahead];
  }

  // The supermajor holds its big load as a block in its mandibles, at most
  // 10 rows (or columns) across and as deep as it needs to be, centered on
  // the mandibles' row (or column).
  function majorCarryPixel(heading, n, lift, total) {
    const deep = Math.max(6, Math.ceil(total / 10));
    const ahead = n % deep;
    const side = Math.floor(n / deep) - Math.floor(Math.ceil(total / deep) / 2);
    if (heading === 'right') return [9 + ahead, -lift + 2 + side];
    if (heading === 'left') return [-10 - ahead, -lift + 2 + side];
    if (heading === 'up') return [-2 + side, -10 - ahead];
    return [2 + side, 9 + ahead];
  }

  /* ---------- A party (the party block, field.js) ----------
   * The colony's ants stop where they are, put on party hats and dance:
   * they turn left, right, left... (each on its own beat). Fire ants,
   * marauders and ants that are down don't. A raid stops the dancing. */
  const PARTY = {
    beatMs: 250,
    hats: ['#ff4fa3', '#3ec7ff', '#ffd23e', '#9b6bff', '#ff7a3e'],
    stripe: '#ffffff', pom: '#ffffff'
  };
  let partyUntil = 0;
  function partying(now) {
    return now < partyUntil && !ants.some((ant) => (ant.kind === 'fire' || ant.marauder || ant.invade) && ant.plan !== 'dead' && !ant.gone);
  }
  function dances(ant) {
    return !(ant.kind === 'fire' || ant.red || ant.marauder || ant.invade || ant.scout) &&
      !['fallen', 'carried', 'healing', 'dead', 'caught', 'guarding', 'plugged'].includes(ant.plan);
  }
  function danceHeading(ant, now) {
    if (ant.beat === undefined) ant.beat = Math.floor(Math.random() * 2);
    return (Math.floor(now / PARTY.beatMs) + ant.beat) % 2 ? 'left' : 'right';
  }
  // Where the hat goes on a picture facing right: the middle of the top of
  // the head (the front part of the body, behind the antenna tip).
  const hatSpots = {};
  function hatSpot(name) {
    if (hatSpots[name]) return hatSpots[name];
    const rows = Sprites.ART[name];
    const width = rows[0].length;
    let spot = { col: Math.floor(width * 0.7), row: 0 };
    for (let r = 0; r < rows.length; r++) {
      const cols = [];
      for (let c = Math.floor(width * 0.5); c <= width - 2; c++) if (Sprites.PALETTE[rows[r][c]]) cols.push(c);
      if (cols.length) { spot = { col: Math.round((cols[0] + cols[cols.length - 1]) / 2), row: r }; break; }
    }
    hatSpots[name] = spot;
    return spot;
  }
  // A cone hat with a white stripe and pom-pom: 3 rows (4 on a big ant).
  function drawHat(ctx, ant, name, x, y, heading) {
    const rows = Sprites.ART[name];
    const width = rows[0].length;
    const spot = hatSpot(name);
    const col = heading === 'left' ? width - 1 - spot.col : spot.col;
    const cx = x - Math.floor(width / 2) + col;
    const base = y - Math.floor(rows.length / 2) + spot.row - 1;   // the row just above the head
    if (ant.hat === undefined) ant.hat = Math.floor(Math.random() * PARTY.hats.length);
    const big = width >= 14;
    const shape = big ? [[-2, 2], [-1, 1], [0, 0]] : [[-1, 1], [0, 0]];   // each row's left and right, from the bottom up
    shape.forEach(([from, to], k) => {
      for (let dx = from; dx <= to; dx++) {
        ctx.fillStyle = k === 0 && dx === 0 ? PARTY.stripe : PARTY.hats[ant.hat];
        ctx.fillRect(cx + dx, base - k, 1, 1);
      }
    });
    ctx.fillStyle = PARTY.pom;
    ctx.fillRect(cx, base - shape.length, 1, 1);
  }

  /* Paint every ant, and whatever it is carrying. */
  // A picture held in the jaws (a scout bringing home part of an insect):
  // its bottom row level with the mouth, starting just in front of the head.
  function drawCarryArt(ctx, ant, heading, lift) {
    const size = Sprites.sizeOf(ant.carryArt);
    const side = heading === 'left' ? 'left' : 'right';
    const at = CARRY_AT[side];
    const left = side === 'right' ? ant.x + at.x : ant.x + at.x - size.cols + 1;
    const top = ant.y - lift + at.y + 1 - size.rows + 1;
    Sprites.paintTurned(ctx, ant.carryArt, left + Math.floor(size.cols / 2), top + Math.floor(size.rows / 2), side, false);
  }

  function draw(ctx, world) {
    const now = Date.now();
    const party = partying(now);
    for (const ant of ants) {
      if ((ant.arriving || ant.task === 'scoutHome') && Date.now() < ant.showAt) continue;   // a new fire ant (or a scout coming home) not here yet
      const kind = KINDS[ant.kind];
      const dancing = party && dances(ant);
      // Soldiers stand on end only while climbing to or from the surface.
      const climbing = mayGoOutside(ant) && ant.direction.dy !== 0;
      const heading = dancing ? danceHeading(ant, now) : kind.climbs || climbing ? ant.direction.heading : ant.facing;
      const pose = dancing ? Math.floor(now / PARTY.beatMs) % 2 : ant.pose;
      if (ant.major) {
        const down = ant.plan === 'fallen' || ant.plan === 'healing';
        const face = down ? ant.facing : heading;
        const lift = face === 'left' || face === 'right' ? MAJOR.lift : 0;
        Sprites.paintTurned(ctx, MAJOR.art[pose], ant.x, ant.y - lift, face, down);
        if (dancing) drawHat(ctx, ant, MAJOR.art[pose], ant.x, ant.y - lift, face);
        ant.carry.forEach((color, n) => {
          const [dx, dy] = majorCarryPixel(heading, n, lift, ant.carry.length);
          ctx.fillStyle = color;
          ctx.fillRect(ant.x + dx, ant.y + dy, 1, 1);
        });
        continue;
      }
      const lift = kind.outsideLift && world && world.aboveGround(ant.y) ? kind.outsideLift : 0;
      const onBack = ant.plan === 'fallen' || ant.plan === 'carried' || ant.plan === 'healing' || ant.plan === 'dead';
      const art = ant.marauder ? MARAUDER.art : ant.red ? KINDS.fire.art : ant.doorhead ? DOORHEAD.art : ant.kind === 'soldier' && !ant.majorSoldier ? MEDIA_ART : kind.art;   // fire ant workers look like fire ants; soldiers are media until they are majors
      Sprites.paintTurned(ctx, art[pose], ant.x, ant.y - lift, onBack ? ant.facing : heading, onBack);
      if (dancing) drawHat(ctx, ant, art[pose], ant.x, ant.y - lift, heading);
      if (ant.carryArt) drawCarryArt(ctx, ant, heading, lift);
      ant.carry.slice(0, CARRY_ORDER.length).forEach((color, n) => {
        const [dx, dy] = carryPixel(heading, CARRY_ORDER[n][0], CARRY_ORDER[n][1], ant.kind === 'soldier' ? SOLDIER_JAWS : 0);
        ctx.fillStyle = color;
        ctx.fillRect(ant.x + dx, ant.y + dy, 1, 1);
      });
    }
  }

  return {
    setCounts, update, draw, spawnFire, rally, endRally, arrive, sendScouts, returnScouts, forgetBuildings, exportRaid, loadRaid, exportDowned, loadDowned,
    pauseFire: (paused) => { firePaused = paused; },
    setParty: (until) => { partyUntil = until; },
    raiders: () => ants.filter((ant) => ant.kind === 'fire' && ant.plan !== 'dead').length,
    marauders: () => ants.filter((ant) => ant.marauder && ant.plan !== 'dead' && !ant.gone).length,
    spawnMarauders,
    invaders: () => ants.filter((ant) => ant.invade && ant.plan !== 'dead' && !ant.gone).length,
    list: () => ants
  };
})();
