/*
 * The main display area: sky, a line of grass, dirt, and the queen's cave
 * with a tunnel up to the surface. Eggs and pupae sit next to the queen,
 * and ants walk around the tunnels. Bread crumbs lie on the grass: clicking
 * one takes a bite for food, workers carry pieces of them to the queen, and
 * soldiers sometimes push one closer to the tunnel.
 *
 * With a tool selected (dig or fill) it also shows where that tool can be
 * used and lets the player pick a square. The view can be zoomed in and
 * dragged around.
 *
 * Everything here is measured in game pixels (one game pixel = 2 screen
 * pixels at normal zoom).
 */

const Field = (() => {
  'use strict';

  // Looks that can each be switched off on their own (false = the old look):
  //   soil:       dirt in bands by depth, pebbles, stones and grass roots
  //   walls:      a darker strip along tunnel floors and a shadow under ceilings
  //   rim:        a darker outline of packed dirt around every tunnel (tried, then turned off)
  //   quietPops:  smaller food numbers that rise a little and fade, and food
  //               paid out close together shown as one number
  const LOOK = { soil: false, walls: true, rim: false, quietPops: true };

  const PIXEL = 2;          // one game pixel = 2 screen pixels at zoom 1 (times `fit`)
  const RES = 2;            // the canvas is drawn at twice the screen size, so a fit of 0.75 still gives whole pixels (3)
  const SKY_ROWS = 13;      // sky showing above the tallest grass
  const HILL = { height: 3, reach: 12 };   // the ant hill around the tunnel's mouth: rows high, and how far it slopes out
  const GRASS_ROWS = 8;     // tallest a blade of grass can be
  const MAX_CRUMB = 3;      // floating bits of dirt this small are cleared away
  const ZOOMS = [1, 2, 3, 4];   // zoom steps (at a fit below 1, see setFit, the steps after the first match these at fit 1)
  const DRAG_START = 4;     // screen pixels the mouse must move before a press counts as a drag
  const WHEEL_PAUSE = 250;  // milliseconds between zoom steps while scrolling
  const EDGE_ZONE = 28;     // while zoomed in, the mouse this close (screen pixels) to an edge of the field...
  const EDGE_SPEED = 320;   // ...slides the view that way, up to this many screen pixels a second (at the very edge)
  const EDGE_DELAY = 700;   // ...after the mouse has stayed there this many milliseconds
  const ANT_CLOCK = 50;     // how often the walking ants are checked, in milliseconds

  // The queen's idle animation. Two small things happen on their own clocks:
  // her antenna nods, and the shine on her back shifts as if she is breathing.
  const QUEEN_IDLE = {
    nodWaitMin: 900,        // pause between antenna nods, in milliseconds
    nodWaitMax: 2600,
    nodHold: 260,           // how long a nod lasts
    breathMin: 1000,        // time between breaths in and out
    breathMax: 1500
  };

  // Where each animation patch goes on the queen: [picture, x, y] from her top-left corner.
  const QUEEN_PATCHES = {
    nod: [['queenNod', 25, 0]],
    shine: [['queenShineGaster', 1, 2], ['queenShineThorax', 15, 2], ['queenBreath', 3, 9]]
  };

  // The starting cave, measured from its center.
  const CAVE = {
    halfWidth: 40,          // widest point, left and right of center
    roof: 9,                // rows above center
    floor: 5,               // rows below center (flat floor)
    tunnelWidth: 8,
    tunnelOffset: 5,        // where the tunnel meets the roof, right of center
    solidBelow: 6           // rows of dirt under the floor that can never be dug
  };

  // Saved caves carry a version number. Version 2 widened the starting
  // tunnel from 4 to 6 pixels, and version 3 to 8 pixels and straighter;
  // older saved caves get the newest tunnel once (added to what was there).
  const CAVE_VERSION = 3;

  // The queen's left edge, in steps from the cave center.
  const QUEEN_LEFT = -34;

  // Where each egg sits along the floor: the left edge of its spot, in steps
  // from the cave center. An egg keeps its spot until it hatches. One spot
  // per egg allowed. Each spot is wide enough for the largest pupa.
  const BROOD_SPOTS = [-5, 3, 11, 19, 27];
  const SPOT_WIDTH = 7;

  // The bread crumb on the grass. Clicking it takes a bite (food for the
  // player); workers on the surface carry pieces of it down to the queen.
  // How long the wait after a click is, and how fast and how much workers
  // carry, come from upgrades (popup.js sets them with setCrumbRules).
  const CRUMB = {
    biteMin: 2,             // pixels a click takes off
    biteMax: 3,
    respawnMin: 15000,      // a new crumb appears 15 to 27.5 seconds after one is used up
    respawnMax: 27500,
    clearOfTunnel: 12,      // keeps the crumb this far from the tunnel opening
    clearOfEdge: 8          // ...and from the sides of the field
  };

  const POP_MS = { 'pop-crumb': 900, 'pop-queen': 1800, 'pop-steal': 1800 };   // how long each kind of number stays up
  const QUIET_POPS = { life: 1300, rise: 6, joinMs: 1000, joinReach: 24 };   // LOOK.quietPops: ms up, screen pixels risen, and "+N Food" this close in time and game pixels adds up

  // LOOK.soil: the dirt's color by depth, as [share of the way down, color],
  // top to bottom. The second band is the old dirt color.
  const SOIL = {
    bands: [[0.07, '#3e230b'], [0.38, '#502e0e'], [0.66, '#5c3313'], [0.86, '#4e2c10'], [2, '#42250e']],
    pebble: '#414141', pebbleTop: '#6e6e6e',
    stone: '#4f4b45', stoneTop: '#7a756c', stoneBottom: '#35322d',
    root: '#6e5130', rootDark: '#58401f'
  };
  // LOOK.walls
  const WALLS = { rim: 'rgba(0, 0, 0, 0.3)', floor: '#7f6638', ceiling: '#6f5a33' };   // (rim: for LOOK.rim)

  // Straight lines while dragging the dig, fill or trail tool (see steady()):
  // only ever straight across or straight down, with square corners. A drag
  // picks its way once the mouse is lockAfter pixels from where it began,
  // and stays on its line until the mouse is a tool's width (at least
  // `drift` pixels) off it; movement within `slope` of straight counts as
  // straight. Shift keeps it on one line.
  // The Line assist box in the Dig menu turns this off (setLineAssist); Shift still works.
  const LINE = { lockAfter: 3, slope: 0.36, drift: 3, turnWait: 16, stepAfter: 2 };   // turnWait: pixels watched after leaving a line; stepAfter: tool widths off it before a step
  let lineAssist = true;

  const COLORS = {
    sky: '#4ca7e5',
    grassLight: '#56b339',
    grassDark: '#2a6320',
    dirt: '#502e0e',
    speck: '#414141',
    cave: '#8d7241',
    diggable: '#56b339',    // dirt the dig tool can reach
    fillable: '#ed6f2d',    // tunnel the fill tool can reach
    pick: '#fdf351',        // the pixels the tool would change, under the mouse
    pickBlocked: '#cd2e1f', // the same, when food is short
    trail: '#937845',       // tunnel marked with pheromones: a shade off the tunnel color...
    trailSpeck: '#7d6334',  // ...with a few darker brown specks
    trailShown: '#d9c23a',  // pheromone trail while the Build menu is open
    trailPick: '#fff9b0',   // the pixels a trail block would mark, under the mouse
    midden: '#7b6337',      // a midden: tunnel a shade darker...
    middenRefuse: ['#d8cfb0', '#3a3a3a', '#e8e8e2', '#a8401c', '#4a160a', '#5e7e2c', '#3f5f22', '#d9b57a', '#b8935a', '#5a4224'],   // ...gathering refuse as it fills: seed husks, fire ant bodies, plant matter, crumbs, muck
    middenPick: '#c9a46a',  // the pixels a midden block would cover, under the mouse
    plant: '#4b6a2a',       // bits of plant matter in an aphid's pen...
    plantDark: '#33501c',   // ...two shades, dark enough that the light green aphid stands out
    penPick: '#c9f0a2',     // an aphid pen that can go here, under the mouse
    fungusPick: '#f2eee2',  // a fungus garden that can go here, under the mouse
    penBlocked: '#cd2e1f',  // ...or can't
    straw: ['#e2c46a', '#c9a24a', '#a8823a', '#f0d88a'],   // a granary's straw bedding
    granaryPick: '#f3dc8f', // a granary that can go here, under the mouse
    repletePick: '#f6d65a', // a replete that can go here, under the mouse
    deletePick: '#e0412f'   // the structure the delete tool would remove, under the mouse
  };

  // Granaries: straw bedding on a dirt floor, 8 wide and 3 tall, each holding
  // one seed. Now and then a seed appears on the grass (up to SEED.max lying
  // about). While a granary has room, a worker carries one to it, where it
  // turns into ant bread after 30 seconds and is eaten 30 seconds after
  // that, for 15 food.
  // A granary takes a whole clear 8x8 space; the straw fills its bottom 3 rows.
  const GRANARY = { width: 8, space: 8, height: 3, breadAfter: 30000, eatenAfter: 60000, food: 45, reserveFor: 60000 };
  // max: seeds lying about at once, unless the Harvester upgrade raises it (crumbRules.seedMax), up to mostEver.
  // (Sunflowers can add more; a save keeps up to mostKept.)
  const SEED = { everyMin: 25000, everyMax: 50000, reach: 3, max: 5, mostEver: 20, mostKept: 120, colors: ['#000000', '#e8e8e8', '#000000', '#9a9a9a'] };

  // Aphids: each lives in its own 8x8 pen on open tunnel, wandering inside it.
  // Each aphid fills with honeydew over fillMs. Then a drop shows, the aphid
  // moves to the middle of its pen and keeps still until a worker milks it
  // for `food` food. That worker milks every other full aphid within `reach`
  // pixels at the same time.
  const APHID = {
    size: 8,
    stepMin: 700,           // milliseconds between an aphid's small moves
    stepMax: 1800,
    plantChance: 0.22,      // share of a pen's pixels drawn as plant matter
    fillMs: 60000,
    food: 200,
    reach: 24,
    drop: ['#f6d65a', '#c8941c']   // a honeydew drop: light, edge
  };

  // Merged structures (Build menu, Merge): 10 of one kind become one big
  // structure in a clear 24x24 space.
  //   vault     10 granaries: a Seed Vault holding `slots` seeds, each worth
  //             `food` times a granary's (workers fill it first, fire ants rob it first)
  //   chamber   10 fungus gardens: a Fungus Chamber that grows a stage on its
  //             own every aloneMs and pays `pays` seeds' worth when harvested
  //   honeypot  10 repletes: a Honeypot Chamber holding `holds` crumbs, paying
  //             `pays` times what a replete would for them
  //   herd      10 aphids: a Mealybug Herd that makes a honeydew drop every
  //             dropMs (up to `most`); a worker comes once `ready` are waiting
  //             and takes them all, `APHID.food` each
  const BIG = {
    size: 24,
    honeypotHeight: 16,     // a Honeypot Chamber is 24 wide and only this tall
    vaultHeight: 21,        // ...and a Seed Vault this tall
    kinds: ['vault', 'chamber', 'honeypot', 'herd'],
    vault: { slots: 10, food: 1.2 },   // each seed in a vault gives 20% more food (workers fill a vault first)
    chamber: { aloneMs: 20000, pays: 5, stageMs: 6000 },   // stageMs: wait between feedings, 50% longer than a garden's
    honeypot: { holds: 200, pays: 1.2 },
    // bugs: mealybugs drawn; wiggleMin/Max: ms between one's idle wiggles;
    // filaments: where its wax filaments stick out in each of its two poses
    herd: { dropMs: 5000, most: 12, ready: 6, bugs: 8, wiggleMin: 900, wiggleMax: 2600,
      filaments: [[[-1, 1], [6, 1], [1, 3], [4, 3]], [[-1, 0], [6, 2], [2, 3], [3, -1]]] },
    colors: {
      packed: ['#6b4522', '#62401f', '#744b26'], packedEdge: '#4a2a0c',   // a Fungus Chamber's packed dirt, and its shadowed edge
      vaultDirt: ['#502e0e', '#4c2b0c', '#55310f'], vaultEdge: '#3a2008', // a Seed Vault's: close to the dirt around it
      crack: '#7a5a32', crackFrom: 0.12, crackTo: 0.7,                   // a Fungus Chamber's cracks: empty, and how wide
      fungus: ['#f6f3ea', '#ece7da', '#e0dacb'], fungusShade: '#b9ae96', fungusLight: '#ffffff', tip: ['#fff6c8', '#e2cf86'],
      wax: '#f4f1ea', waxShade: '#ffffff', waxLine: '#cfc8b8', filament: '#e2ddd0'   // mealybugs
    }
  };

  // Pheromone trail: placed in 8x8 blocks on tunnel (dug-out ground) only.
  // Ants walking on it go 60% faster.
  const TRAIL = {
    size: 8,
    leastNew: 1,            // a block must mark at least this many new pixels (it is paid by the pixel)
    speed: 1.6,
    speckChance: 0.12       // share of trail pixels drawn as a darker speck
  };

  // The midden (honeydew upgrade): a trash pile painted in 8x8 blocks on
  // tunnel, like pheromone trail. popup.js keeps how full it is; idle workers
  // carry waste to it (ants.js), and colony ants near it walk slowly. When
  // it is full a root grows up from it, a sunflower grows on the grass above
  // and bursts into seeds (bloom()).
  const MIDDEN = {
    near: 10,               // colony ants this close (game pixels) walk slowly
    refuseMost: 0.85,       // share of a full midden's pixels covered in refuse
    huskShare: 1 / 40,      // about this share of its pixels get a broken seed shell, a quarter of them for each quarter it fills
    mostBodies: 60,         // fire ant and marauder bodies lying on the middens (they stay until their pile empties)
    wastePerPixel: 1,       // a midden holds this much waste per pixel
    seedPixels: 32 / 1.3, seedsMax: 32,   // its sunflower bursts into a seed for every seedPixels pixels (the rest a chance of one more), at most seedsMax
    worth: 1.3, bigWorth: 800,   // each of its seeds is worth `worth` times a seed, up to twice that for a pile of bigWorth pixels or more
    rootMs: 3000, growMs: 3500, flowerMs: 1500, wiltMs: 3000,   // the bloom: roots, then the stem, then the flower, then it wilts after the seeds burst out
    stem: 12,               // sunflower height above the grass
    spread: 40,             // seeds land this far either side of it
    flyMin: 700, flyMax: 1300, flyHigh: 14   // the seeds burst out of the flower and arc down to the grass: how long (ms) and how high
  };

  // Falling fruit (weaver branch 2): now and then a fruit drops from the tree
  // onto the grass. It is a crumb, in fruit colors, worth `worth` times as much
  // (clicked or carried), and it does not grow back. Not saved.
  const FRUIT = { everyMin: 3 * 60000, everyMax: 6 * 60000, worth: 5, fallMs: 1100, colors: ['#5e1e0c', '#a8381a', '#e0652a', '#f5a347'] };

  // The party block (type ???!): a green block on the grass, eaten like a
  // crumb. When the last of it is taken the party starts: confetti, party
  // hats, and the ants dance (ants.js) for `ms` (the length of the song).
  // Not saved.
  const PARTY = {
    w: 10, h: 8,
    colors: { edge: '#1c5e24', fill: '#3fb84a', light: '#86e07c', shade: '#2c8f37' },
    ms: 63000,
    confetti: ['#ff4fa3', '#3ec7ff', '#ffd23e', '#9b6bff', '#4fe07a', '#ff7a3e', '#ffffff'],
    confettiPer: 90   // one piece for every this many view pixels
  };
  let partyCells = [];       // the block's pixels, like crumbCells
  let partyUntil = 0;        // the party is on until then
  let partyHandler = null;   // told when a party starts

  let canvas = null;
  let ctx = null;
  let cols = 0;
  let rows = 0;
  let ground = 0;           // first row of dirt
  let center = null;        // cave center

  let frame = null;         // the whole field at game-pixel size, before zooming
  let baseLayer = null;     // sky, grass, dirt
  let caveLayer = null;     // every dug-out pixel
  let bandLayer = null;     // where the current tool can be used

  let open = null;          // 1 for every dug-out pixel, row by row
  let chamber = null;       // 1 for every pixel of the main chamber (never filled in)
  let supportLayer = null;  // the dirt holding a structure up, in red, shown with the dig tool
  let sumOpen = null;       // running totals, for counting open pixels in a rectangle quickly

  let queenNod = false;     // antenna mid-nod
  let queenShine = false;   // shine shifted (breathing)
  let alate = null;         // the winged queen flying off after a nuptial flight: { start, done }
  let beetle = null;        // a rove beetle sneaking through the nest: { x, y, dx, dy, until, stepAt }
  let beetleHandler = null; // told when the player catches it
  let broodHandler = null;  // told which brood spot was clicked (Brood tending)
  let alateExtras = 0;     // Nuptial swarm: more alates resting beside her
  let alateHome = false;    // the alate is resting by the brood
  let alateNod = false;     // her antenna lowered (idle twitch)
  let brood = [];           // [{ spot, stage, type }]
  let trophicEggs = 0;      // trophic eggs laid this run: drawn as small grey eggs under the queen
  let broodKey = '';
  let tool = null;          // null (just looking), 'dig', 'fill' or 'trail'
  let trail = null;         // 1 for every pixel marked with pheromone trail (always tunnel)
  let midden = null;        // 1 for every pixel of midden (always tunnel)
  let middenNear = null;    // 1 within MIDDEN.near of the midden: colony ants walk slowly
  let middenSpots = [];     // midden pixels a worker can stand on, to drop waste
  let middenCount = 0;      // midden pixels
  let middenLabel = null;   // which midden (pile) each pixel is in: its index + 1, or 0
  let piles = [];           // each separate (connected) midden: { size, waste, rep, left, right, shown, husks }
  let stashFullSaidAt = 0;   // when 'Seed storage full' last showed
  let stashHeld = [];       // floor spots a worker is on the way to with a seed: [{ x, y, at }]
  let storeFlag = -1;       // where stored seeds go (a floor pixel), or -1 (picked when needed)
  let storeFlagAuto = false; // true if the game picked that spot (it picks again after digging); false if the player put it there
  let flagPlacedShowUntil = 0;   // just put down: shown until then
  let flagShown = false;    // the Build menu is open (the only time the flag shows)
  let flagPicking = null;   // while the player puts the flag down: called with true once it is down
  let middenBodies = [];    // bodies dropped on a midden: { i (the pixel), marauder, face }
  let bloom = null;         // a midden's sunflower growing: { start, x, rootX, rootY, pile, count, burst }
  let bloomHandler = null;  // told when a sunflower bursts (how many seeds)
  let middenHoverHandler = null;   // told what midden is under the mouse (to show how full it is)
  let trailView = false;    // the Build menu is open: show the trail in yellow
  let trailMarkLayer = null;   // the trail in yellow, for the Build menu
  let pens = [];            // aphid pens: [{ x, y, ax, ay, pose, moveAt }] (top-left corner, aphid's place inside)
  let gardens = [];         // fungus gardens: [{ x, y, stage, grewAt, ripeAt, since, side, art }] (top-left corner; since: when it last grew, or was placed)
  let fungusMask = null;    // 1 for every pixel inside a fungus garden
  let droppedFungi = 0;     // saved gardens the last loadCave could not place
  let penMask = null;       // 1 for every pixel inside an aphid pen
  // Lycaenid Mutualism: one big caterpillar on a floor (w x h clear space);
  // every everyMs the game is open, a worker milks it for 1 honeydew.
  const CATERPILLAR = { w: 36, h: 10, everyMs: 60000, dropX: 8, rippleMs: 2400, rippleFor: 500 };   // dropX: the drop shows above its back, this far from its tail; ripple: its idle twitch, rippleFor ms every rippleMs   // dropX: the drop shows above its back, this far from its tail
  let caterpillars = [];    // [{ x, y, readyAt }] (at most one)
  let caterpillarHandler = null;
  let caterpillarShown = null;   // whether its drop was drawn ready
  const NURSERY_SPOT = 100;   // egg spots from here on are in the nurseries (100: the first)
  let nurseries = [];      // nurseries (Brood tending): [{ x, y }], top-left of a granary-sized space; one more egg hatches at once for each
  let granaries = [];       // [{ x, y, storedAt, reservedAt, vault }]: top-left corner; storedAt is when its seed came in (0: empty); vault: the Seed Vault it is a slot of
  let vaults = [];          // Seed Vaults: [{ x, y }] (top-left corner of the 24x24 space); their seeds are slots in `granaries`
  let granaryMask = null;   // 1 for every pixel of a granary
  let repletes = [];        // repletes: [{ x, y, crumbs, coolUntil, emptied }] (top-left corner of the 10x10 space)
  let repleteMask = null;   // 1 for every pixel of a replete's space
  let supportMask = null;
  let mergeHidden = new Set();   // while a merge tool is chosen: the structures it would use up (not drawn)
  let mergeFocus = null;    // where they are counted nearest from: the mouse, or the middle of the view
  let lastPoint = null;     // the mouse, in game pixels, as of the last move or click over the field
  let lastDeleted = null;   // what the delete tool last took away (see deleteStructure)
  let conflict = null;      // a structure tool's square overlapping other structures: { key, rects, since }
  let hiddenMask = null;    // ...and 1 for every pixel of them (a merged structure may go there)   // 1 for dirt holding something up: the floor under a granary, the ceiling over a replete (can't be dug)
  let seeds = [];           // seeds on the grass: [{ id, x }] (x: left end)
  let stash = [];           // seeds stored on tunnel floors (the STORE seed setting): [{ id, x, y, at }]
  let lastStashId = 0;
  let lastSeedId = 0;
  let nextSeedAt = 0;       // when the next seed may appear
  let caveHandler = null;   // told when granaries change, so popup.js saves the cave
  let size = 8;             // width of the tool's square (starts large)
  let shape = 'round';      // 'square', or 'round' for a circle that fits in the square (starts round)
  let affordable = true;
  let hover = null;         // the square under the mouse: { x, y, pixels }
  let useHandler = null;
  let strokeEndHandler = null;
  let stroke = null;        // mouse held down with dig, fill or trail: { x, y, point, used } (the last square used)
  let hoverHandler = null;

  let zoom = 1;
  let fit = 1;              // below 1, the whole field is drawn smaller, so the world is bigger (Polydomy's second level)
  let zooms = ZOOMS;        // the zoom steps now

  // Screen pixels (CSS) per game pixel, at the zoom and fit now.
  function screenScale() {
    return PIXEL * zoom * fit;
  }
  let viewX = 0;            // top-left corner of the view
  let viewY = 0;
  let zoomHandler = null;
  let press = null;         // mouse button held down: where it started
  let dragEndedAt = 0;
  let wheelSum = 0;
  let wheelSteppedAt = 0;
  let edgeSince = 0;        // when the mouse came near an edge (for EDGE_DELAY)
  let edgeMouse = null;     // where the mouse is on screen while it is over the field, for sliding the view
  let edgeView = null;      // the view's position while sliding, kept to fractions of a pixel
  let edgeTime = 0;         // time of the last slide step

  let startMask = null;     // 1 for every pixel of the starting cave
  let extraDug = 0;         // dug-out pixels beyond the starting cave
  let newPixels = [];       // where those pixels are (positions in the `open` list)
  let openPixels = [];      // every dug-out pixel
  let visitMaps = new Map();   // distances to places walking ants are visiting

  let crumbCells = [];      // every pixel of the crumb picture: { dx, dy, color }
  let crumbs = [];          // [{ x, bits, respawnAt }]: bits has a 1 for each pixel still there
  let crumbReadyAt = 0;     // when a crumb can be clicked again
  let crumbRules = { clickWaitMs: 1500, clickFood: 1, speed: 1, carryMin: 2, carryMax: 3, walkSpeed: 1, slots: 1, foodBoost: 1, crumbWorth: 1 };
  let crumbExtra = 0;       // the part of a food not yet paid out for delivered crumb (Crumb Value)
  let hintWanted = false;   // show the "Click!" arrow by the crumb
  let hintEl = null;
  let hintSide = '';
  let crumbHandler = null;
  let foodHandler = null;
  let raidHandler = null;   // asked how much food fire ants take from the queen
  let eventHandler = null;  // told about things achievements count: 'feedQueen', 'body', 'seed', 'fungus', 'repleteFill'
  function note(name, value) {
    if (eventHandler) eventHandler(name, value);
  }
  let fallHandler = null;   // asked how much food a fallen soldier costs

  // Alarm pheromone: after armAlarm(), the next click on the field puts a
  // see-through red cloud there and every soldier heads for it.
  const ALARM = { radius: 10, lastsMs: 30000, fadeMs: 3000, alpha: 0.35 };
  let alarmArmed = null;    // called with true (placed) or false (cancelled), while waiting for that click
  let alarmCloud = null;    // { x, y, until }
  let mouse = { x: 0, y: 0 };   // last mouse position on the screen
  let cooldownBar = null;   // the little bar by the mouse while the crumb can't be clicked
  let popLayer = null;      // holds the floating "+1" numbers
  let pops = [];            // [{ el, x, y, born }]

  // Small repeatable random number generator, so the dirt and grass look
  // the same every time the game opens.
  function makeRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newLayer() {
    const layer = document.createElement('canvas');
    layer.width = cols;
    layer.height = rows;
    return layer;
  }

  // Column of the tunnel's center at a given row: a gentle wave, 2 pixels either way.
  function tunnelX(y) {
    return center.x + CAVE.tunnelOffset + Math.round(2 * Math.sin((center.y - y) / 12));
  }

  /* ---------- Sky, grass and dirt ---------- */

  function drawBase() {
    const g = baseLayer.getContext('2d');
    const random = makeRandom(1991);

    g.fillStyle = COLORS.dirt;
    g.fillRect(0, 0, cols, rows);

    if (LOOK.soil) {
      drawSoil(g);
    } else {
      // Specks in the dirt: mostly single pixels, a few 2x2 pebbles
      g.fillStyle = COLORS.speck;
      for (let y = ground + 1; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const roll = random();
          if (roll < 0.004) g.fillRect(x, y, 2, 2);
          else if (roll < 0.034) g.fillRect(x, y, 1, 1);
        }
      }
    }

    g.fillStyle = COLORS.sky;
    g.fillRect(0, 0, cols, ground);

    // Grass: one blade per column, random height and shade
    for (let x = 0; x < cols; x++) {
      const height = 3 + Math.floor(random() * (GRASS_ROWS - 2));
      g.fillStyle = random() < 0.5 ? COLORS.grassLight : COLORS.grassDark;
      g.fillRect(x, ground - height, 1, height);
      // Solid turf along the bottom so no sky shows through at ground level
      g.fillStyle = random() < 0.6 ? COLORS.grassLight : COLORS.grassDark;
      g.fillRect(x, ground - 2, 1, 2);
    }

    // Ant hill: a low mound of dug-up dirt around the tunnel's mouth, highest
    // at the tunnel and sloping away into the grass. The tunnel carries on up
    // through it, so it opens at the top of the hill.
    const opening = tunnelX(ground);
    const left = opening - CAVE.tunnelWidth / 2;
    const right = left + CAVE.tunnelWidth - 1;
    for (let x = left - HILL.reach; x <= right + HILL.reach; x++) {
      if (x < 0 || x >= cols || (x >= left && x <= right)) continue;
      const d = x < left ? left - x : x - right;   // pixels out from the tunnel's side
      const height = Math.round(HILL.height * (1 - (d / HILL.reach) ** 2));
      if (height <= 0) continue;
      g.fillStyle = COLORS.sky;                 // no grass on the hill
      g.fillRect(x, 0, 1, ground - height);
      for (let y = ground - height; y < ground; y++) {
        g.fillStyle = random() < 0.08 ? COLORS.speck : LOOK.soil ? SOIL.bands[0][1] : COLORS.dirt;
        g.fillRect(x, y, 1, 1);
      }
    }
    // The tunnel's mouth: tunnel color through the hill, open sky above it.
    g.fillStyle = COLORS.sky;
    g.fillRect(left, 0, CAVE.tunnelWidth, ground - HILL.height);
    g.fillStyle = COLORS.cave;
    g.fillRect(left, ground - HILL.height, CAVE.tunnelWidth, HILL.height);
  }

  /*
   * LOOK.soil: the dirt in bands that change with depth, with wavy edges
   * that mix for a row; single specks; small pebbles with a light pixel on
   * top; a few larger stones; and grass roots hanging into the topsoil.
   * Its own random numbers, so the grass is the same either way.
   */
  function drawSoil(g) {
    const random = makeRandom(2024);
    const depth = rows - ground;
    const edges = SOIL.bands.slice(0, -1).map(([share], k) => {
      const row = Math.round(share * depth);
      const a = random() * 6;
      const b = random() * 6;
      return Array.from({ length: cols }, (_, x) => row + Math.round(1.6 * Math.sin(x / 9 + a) + Math.sin(x / 4.3 + b)));
    });
    for (let y = ground; y < rows; y++) {
      const d = y - ground;
      for (let x = 0; x < cols; x++) {
        let band = 0;
        while (band < edges.length && (d > edges[band][x] || (d === edges[band][x] && random() < 0.5))) band++;
        g.fillStyle = SOIL.bands[band][1];
        g.fillRect(x, y, 1, 1);
      }
    }
    // Specks, pebbles and stones (none right under the grass).
    for (let y = ground + 3; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const roll = random();
        if (roll < 0.00022 && x + 5 < cols && y + 3 < rows) {
          // A stone, 5 wide and 3 tall with rounded corners: light along the top, dark along the bottom.
          g.fillStyle = SOIL.stoneTop;
          g.fillRect(x + 1, y, 3, 1);
          g.fillStyle = SOIL.stone;
          g.fillRect(x, y + 1, 5, 1);
          g.fillStyle = SOIL.stoneBottom;
          g.fillRect(x + 1, y + 2, 3, 1);
          g.fillRect(x + 4, y + 1, 1, 1);
        } else if (roll < 0.0032) {
          // A pebble: 2 or 3 dark pixels with a light one on top.
          const wide = roll < 0.0014 ? 3 : 2;
          g.fillStyle = SOIL.pebble;
          g.fillRect(x, y + 1, wide, 1);
          g.fillStyle = SOIL.pebbleTop;
          g.fillRect(x + (wide === 3 ? 1 : 0), y, 1, 1);
        } else if (roll < 0.022) {
          g.fillStyle = COLORS.speck;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    // Grass roots: thin lines from the grass down into the topsoil, wandering a little.
    const topsoil = Math.round(SOIL.bands[0][0] * depth) + 2;
    for (let x = 2 + Math.floor(random() * 8); x < cols - 2; x += 7 + Math.floor(random() * 12)) {
      let rx = x;
      const length = 3 + Math.floor(random() * Math.max(1, topsoil - 2));
      for (let d = 0; d < length; d++) {
        g.fillStyle = d > length - 3 ? SOIL.rootDark : SOIL.root;
        g.fillRect(rx, ground + d, 1, 1);
        const turn = random();
        if (turn < 0.2) rx--;
        else if (turn > 0.8) rx++;
        if (random() < 0.12 && d > 1) {   // a short side root
          g.fillStyle = SOIL.rootDark;
          g.fillRect(rx + (random() < 0.5 ? -1 : 1), ground + d + 1, 1, 1);
        }
      }
    }
  }

  /* ---------- Cave and tunnels ---------- */

  // Is (x, y) inside the dirt part of the field?
  function inDirt(x, y) {
    return x >= 0 && x < cols && y >= ground && y < rows;
  }

  function isOpen(x, y) {
    return inDirt(x, y) && open[y * cols + x] === 1;
  }

  // Set every pixel of a rectangle in a mask. Parts outside the dirt are skipped.
  function setRect(mask, value, x, y, width, height) {
    for (let yy = Math.max(y, ground); yy < Math.min(y + height, rows); yy++) {
      for (let xx = Math.max(x, 0); xx < Math.min(x + width, cols); xx++) {
        mask[yy * cols + xx] = value;
      }
    }
  }

  // The main chamber: a dome with a flat floor.
  function markChamber(mask) {
    for (let dy = -CAVE.roof; dy <= CAVE.floor; dy++) {
      const reach = Math.round(
        CAVE.halfWidth * Math.sqrt(1 - (dy / (CAVE.roof + 1)) ** 2)
      );
      setRect(mask, 1, center.x - reach, center.y + dy, reach * 2, 1);
    }
  }

  // The tunnel winding from the chamber's roof up to the surface.
  function carveTunnel() {
    for (let y = ground; y <= center.y - CAVE.roof + 2; y++) {
      setRect(open, 1, tunnelX(y) - CAVE.tunnelWidth / 2, y, CAVE.tunnelWidth, 1);
    }
  }

  // The cave a new game starts with: the chamber and the tunnel.
  function carveStartingCave() {
    open.fill(0);
    carveTunnel();
    markChamber(open);
  }

  // The dirt under the main chamber's floor, CAVE.solidBelow rows deep and as
  // wide as the chamber. It stays solid so the queen always has ground to
  // stand on. The dirt beside the chamber, level with it, is not included, so
  // the chamber's rounded corners can be dug square.
  function isSolid(x, y) {
    return x >= center.x - CAVE.halfWidth && x < center.x + CAVE.halfWidth &&
           y > center.y + CAVE.floor && y <= center.y + CAVE.floor + CAVE.solidBelow;
  }

  /*
   * Clear away crumbs: bits of dirt of MAX_CRUMB pixels or fewer that have
   * been cut off from the rest of the dirt on all four sides. Dirt touching
   * the edge of the field, the grass, or the solid ground under the main
   * chamber is never a crumb.
   */
  function clearCrumbs() {
    const seen = new Uint8Array(cols * rows);
    const stack = [];
    for (let start = ground * cols; start < cols * rows; start++) {
      if (open[start] || seen[start]) continue;

      // Walk over this whole piece of dirt, remembering its first few pixels.
      const piece = [];
      let pieceSize = 0;
      let anchored = false;
      seen[start] = 1;
      stack.push(start);
      while (stack.length > 0) {
        const i = stack.pop();
        const x = i % cols;
        const y = (i - x) / cols;
        pieceSize++;
        if (piece.length <= MAX_CRUMB) piece.push(i);
        if (x === 0 || x === cols - 1 || y === ground || y === rows - 1 || isSolid(x, y)) {
          anchored = true;
        }
        const neighbors = [];
        if (x > 0) neighbors.push(i - 1);
        if (x < cols - 1) neighbors.push(i + 1);
        if (y > ground) neighbors.push(i - cols);
        if (y < rows - 1) neighbors.push(i + cols);
        for (const n of neighbors) {
          if (open[n] || seen[n]) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }

      if (!anchored && pieceSize <= MAX_CRUMB) {
        for (const i of piece) open[i] = 1;
      }
    }
  }

  /* ---------- Counting open pixels in a rectangle ---------- */

  // Running totals let any rectangle be counted with four lookups.
  function buildSums() {
    const w = cols + 1;
    sumOpen = new Int32Array(w * (rows + 1));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y + 1) * w + (x + 1);
        sumOpen[i] = open[y * cols + x] + sumOpen[i - 1] + sumOpen[i - w] - sumOpen[i - w - 1];
      }
    }
  }

  // How many open pixels lie in the rectangle (parts outside the field count as none).
  function openIn(x, y, width, height) {
    const x0 = Math.max(x, 0);
    const y0 = Math.max(y, 0);
    const x1 = Math.min(x + width, cols);
    const y1 = Math.min(y + height, rows);
    if (x1 <= x0 || y1 <= y0) return 0;
    const w = cols + 1;
    return sumOpen[y1 * w + x1] - sumOpen[y0 * w + x1] - sumOpen[y1 * w + x0] + sumOpen[y0 * w + x0];
  }

  /* ---------- What a tool can do ---------- */

  // May the tool change this one pixel at all?
  //   Dig changes dirt, but never the solid ground under the main chamber.
  //   Fill changes tunnel, but never the main chamber itself.
  function canChange(which, x, y) {
    if (!inDirt(x, y)) return false;
    const i = y * cols + x;
    if (which === 'dig') return open[i] === 0 && !isSolid(x, y) && !supportMask[i];
    // The starting chamber and tunnel, aphid pens and granaries can't be filled in.
    return open[i] === 1 && chamber[i] === 0 && startMask[i] === 0 && penMask[i] === 0 && granaryMask[i] === 0 && fungusMask[i] === 0 && repleteMask[i] === 0;
  }

  // Does this pixel sit directly beside (up, down, left or right) the kind of
  // ground the tool works from? Dig works outward from tunnel; fill works
  // inward from dirt. Ground beyond the field's edges counts as dirt.
  function besideSource(which, x, y) {
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of neighbors) {
      if (which === 'dig') {
        if (isOpen(nx, ny)) return true;
      } else if (ny >= ground && !isOpen(nx, ny)) {
        return true;
      }
    }
    return false;
  }

  /*
   * Which pixels of an s-wide square the tool covers: all of them for the
   * square shape, or those whose middles lie inside the circle that fits in
   * the square for the round shape (2: all 4, 4: 12, 8: 52).
   */
  const shapeMasks = {};
  function shapeMask(s) {
    const key = shape + s;
    if (shapeMasks[key]) return shapeMasks[key];
    const mask = new Uint8Array(s * s);
    const r = s / 2;
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        const ox = dx + 0.5 - r;
        const oy = dy + 0.5 - r;
        mask[dy * s + dx] = shape === 'square' || ox * ox + oy * oy <= r * r ? 1 : 0;
      }
    }
    shapeMasks[key] = mask;
    return mask;
  }

  /*
   * The pixels the tool would change in the square whose top-left corner is
   * (x0, y0), as a list of positions in the `open` list. Empty if none.
   *
   * Only part of a square may be usable. A pixel counts if the tool may
   * change it and it is joined, through other such pixels inside the square,
   * to the ground the tool works from. So a dig always stays connected to
   * the tunnels, and a fill always grows out from the dirt.
   */
  function reach(which, x0, y0, s) {
    if (which === 'trail') return trailReach(x0, y0);
    if (which === 'midden') return middenReach(x0, y0);
    if (which === 'aphid') return penFits(x0, y0) ? penPixels(x0, y0) : [];
    if (which === 'fungus') { const spot = fungusNear(x0, y0); return spot ? fungusPixels(spot.x, spot.y) : []; }
    if (which === 'replete') return repleteFits(x0, y0) ? repletePixels(x0, y0) : [];
    if (which === 'delete') return [];   // (the delete tool works from the structure under the mouse: squareAtPoint)
    if (which === 'granary' || which === 'nursery') return granaryFits(x0, y0) ? granaryPixels(x0, y0) : [];   // (a nursery goes where a granary would)
    if (which === 'caterpillar') return caterpillars.length === 0 && caterpillarFits(x0, y0) ? caterpillarPixels(x0, y0) : [];   // (only one)
    if (BIG.kinds.includes(which)) { const spot = bigNear(which, x0, y0); const { w, h } = bigDims(which); return spot ? squarePixels(spot.x, spot.y, w, h) : []; }
    // Quick ways out, before looking at single pixels.
    const openInside = openIn(x0, y0, s, s);
    if (which === 'dig' && openIn(x0 - 1, y0 - 1, s + 2, s + 2) === 0) return [];
    if (which === 'fill' && openInside === 0) return [];

    const inShape = shapeMask(s);
    const taken = new Uint8Array(s * s);
    const stack = [];
    const found = [];

    // Start from every changeable pixel that touches the source ground...
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (inShape[dy * s + dx] && canChange(which, x, y) && besideSource(which, x, y)) {
          taken[dy * s + dx] = 1;
          stack.push(dy * s + dx);
        }
      }
    }
    // ...and spread through the changeable pixels joined to them.
    while (stack.length > 0) {
      const cell = stack.pop();
      const dx = cell % s;
      const dy = (cell - dx) / s;
      found.push((y0 + dy) * cols + (x0 + dx));
      const around = [[dx - 1, dy], [dx + 1, dy], [dx, dy - 1], [dx, dy + 1]];
      for (const [nx, ny] of around) {
        if (nx < 0 || ny < 0 || nx >= s || ny >= s || taken[ny * s + nx] || !inShape[ny * s + nx]) continue;
        if (!canChange(which, x0 + nx, y0 + ny)) continue;
        taken[ny * s + nx] = 1;
        stack.push(ny * s + nx);
      }
    }
    return found;
  }

  // The tunnel pixels in the 8x8 block at (x0, y0) that aren't trail yet.
  // Empty if that is fewer than TRAIL.leastNew (or the block is off the dirt).
  function trailReach(x0, y0) {
    const found = [];
    for (let y = y0; y < y0 + TRAIL.size; y++) {
      for (let x = x0; x < x0 + TRAIL.size; x++) {
        if (isOpen(x, y) && !trail[y * cols + x] && !penMask[y * cols + x] && !granaryMask[y * cols + x] && !fungusMask[y * cols + x] && !repleteMask[y * cols + x]) found.push(y * cols + x);
      }
    }
    return found.length >= TRAIL.leastNew ? found : [];
  }

  // The tunnel pixels in the 8x8 block at (x0, y0) that aren't midden yet
  // (and no structure; pheromone trail under it is covered over).
  function middenReach(x0, y0) {
    const found = [];
    for (let y = y0; y < y0 + TRAIL.size; y++) {
      for (let x = x0; x < x0 + TRAIL.size; x++) {
        const i = y * cols + x;
        if (x < 0 || x >= cols || y <= ground || y >= rows) continue;
        if (isOpen(x, y) && !midden[i] && !penMask[i] && !granaryMask[i] && !fungusMask[i] && !repleteMask[i] && !nearQueen(x, y)) found.push(i);
      }
    }
    return found;
  }

  // After the midden changes: the separate piles (each keeps the waste it
  // had, shared out by the pixels that stayed), which ground is near one,
  // and where waste can be dropped.
  function middenChanged() {
    const oldLabel = middenLabel.slice();
    const oldPiles = piles;
    piles = [];
    middenLabel.fill(0);
    middenNear.fill(0);
    middenSpots = [];
    middenCount = 0;
    const stack = [];
    for (let i = 0; i < midden.length; i++) {
      if (!midden[i] || middenLabel[i]) continue;
      const pile = { size: 0, waste: 0, rep: i, left: cols, right: 0, shown: -1, husks: [] };
      piles.push(pile);
      const label = piles.length;
      const carried = new Map();   // old pile -> pixels of it now in this one
      middenLabel[i] = label;
      stack.push(i);
      while (stack.length > 0) {
        const j = stack.pop();
        const x = j % cols;
        pile.size += 1;
        if (hashAt(j, 9) < MIDDEN.huskShare) pile.husks.push(j);
        pile.left = Math.min(pile.left, x);
        pile.right = Math.max(pile.right, x);
        if (oldLabel[j]) carried.set(oldLabel[j], (carried.get(oldLabel[j]) || 0) + 1);
        for (const k of [j - 1, j + 1, j - cols, j + cols]) {
          if (k < 0 || k >= midden.length || !midden[k] || middenLabel[k]) continue;
          if ((k === j - 1 || k === j + 1) && Math.floor(k / cols) !== Math.floor(j / cols)) continue;
          middenLabel[k] = label;
          stack.push(k);
        }
      }
      if (pile.husks.length === 0) pile.husks.push(i);   // (even a tiny pile shows one)
      for (const [old, n] of carried) {
        const before = oldPiles[old - 1];
        if (before && before.size > 0) pile.waste += before.waste * n / before.size;
      }
      pile.waste = Math.min(pile.waste, pileHolds(pile));
      middenCount += pile.size;
    }
    if (bloom) bloom.pile = piles[middenLabel[bloom.rootIndex] - 1] || null;   // (still blooming over what is left)
    middenBodies = middenBodies.filter((body) => midden[body.i]);   // (filled in or removed: gone)
    const r = MIDDEN.near;
    for (let i = 0; i < midden.length; i++) {
      if (!midden[i]) continue;
      const x = i % cols;
      const y = (i - x) / cols;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= rows) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < cols) middenNear[yy * cols + xx] = 1;
        }
      }
      if (world.canStand('worker', x, y)) middenSpots.push(i);
    }
  }

  // How much waste a pile holds when full: one per pixel, so every pixel
  // fills at the same pace however the middens are split up.
  function pileHolds(pile) {
    return Math.max(1, pile.size) * MIDDEN.wastePerPixel;
  }

  // How full a pile is, 0 to 1.
  function pileFull(pile) {
    return pile.size > 0 ? Math.min(1, pile.waste / pileHolds(pile)) : 0;
  }

  // Waste into one pile (not while its sunflower grows); the picture is
  // redrawn when its refuse has visibly grown.
  // Seed keepers: each seed put away adds this much waste to the middens, shared by size.
  function keeperWaste() {
    const amount = crumbRules.keeperWaste || 0;
    if (amount > 0 && middenCount > 0) for (const pile of piles) addToPile(pile, amount * pile.size / middenCount);
  }

  function addToPile(pile, amount) {
    if (!pile || !(amount > 0) || (bloom && bloom.pile === pile)) return;
    pile.waste = Math.min(pileHolds(pile), pile.waste + amount);
    showPiles();
  }

  function showPiles() {
    let changed = false;
    for (const pile of piles) {
      const step = Math.floor(pileFull(pile) * 20);
      if (step !== pile.shown) { pile.shown = step; changed = true; }
    }
    if (changed) { paintCave(); redraw(); }
  }

  // A fixed, random-looking number from 0 to 1 per pixel (so specks don't move).
  function hashAt(i, salt) {
    let h = ((i + salt * 7919) * 2654435761) >>> 0;
    h = ((h ^ (h >>> 15)) * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return (h % 10000) / 10000;
  }

  function speckAt(i) {
    return hashAt(i, 0) < TRAIL.speckChance;
  }

  /* ---------- Fungus gardens ---------- */

  // Fungus gardens (Fungal garden honeydew upgrade): an 8x8 patch of white
  // fungus threads on clear tunnel, stuck to a floor, ceiling or wall and
  // growing out from it. Workers feed it crumbs. Each feeding, at
  // least stageMs after the last, grows it a stage: a small patch, then thin
  // threads over the whole square, then a thick mat. ripeMs after it is thick
  // it is eaten for `food` food and starts again as a small patch. A garden
  // nobody feeds for aloneMs grows a stage on its own.
  const FUNGUS = {
    size: 8,
    stageMs: 4000,
    aloneMs: 60000,
    ripeMs: 3000,
    food: 45,           // ...or, with crumb rules set, a seed's worth: the Harvester value, 45 up to 300
    feedBonus: 0.1,     // each feeding adds up to 10% to the next payout (two feedings: up to 20%)...
    bigCrumb: 8,        // ...the full 10% for a crumb this many pixels or more, less for smaller
    colors: ['#f6f3ea', '#e4dfd1', '#cdc6b3', '#bdbdb9', '#a9a9a6', '#fff6c8', '#d9c98f']   // white, cream, greys, and the pale yellow gongylidia
  };

  // Can a garden go with its top-left corner at (x0, y0)? Every pixel must be
  // open tunnel, with no trail, pen, granary or other garden, clear of the
  // queen, and one whole side must rest on solid dirt (fungusSide).
  function fungusFits(x0, y0) {
    for (let y = y0; y < y0 + FUNGUS.size; y++) {
      for (let x = x0; x < x0 + FUNGUS.size; x++) {
        if (!isOpen(x, y)) return false;
        const i = y * cols + x;
        if (trail[i] || midden[i] || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i] || nearQueen(x, y)) return false;
      }
    }
    return fungusSide(x0, y0) !== null;
  }

  // Which surface a garden at (x0, y0) grows from: solid dirt all along the
  // row under it ('floor'), over it ('ceiling'), or the column to its left or
  // right ('left', 'right'), in that order. null if none.
  // Does a garden at (x0, y0) have solid dirt all along this side?
  function fungusFitsSide(x0, y0, side, n = FUNGUS.size) {
    const solid = (x, y) => inDirt(x, y) && !isOpen(x, y);
    for (let k = 0; k < n; k++) {
      const [x, y] = side === 'floor' ? [x0 + k, y0 + n] : side === 'ceiling' ? [x0 + k, y0 - 1] : side === 'left' ? [x0 - 1, y0 + k] : [x0 + n, y0 + k];
      if (!solid(x, y)) return false;
    }
    return true;
  }

  // `prefer`: a point (the mouse); when more than one side fits, the one
  // whose surface is nearest it.
  function fungusSide(x0, y0, n = FUNGUS.size, prefer = null) {
    const fits = ['floor', 'ceiling', 'left', 'right'].filter((side) => fungusFitsSide(x0, y0, side, n));
    if (fits.length < 2 || !prefer) return fits[0] || null;
    const far = surfaceDistances(x0, y0, n, prefer);
    return fits.reduce((best, side) => (far[side] < far[best] ? side : best));
  }

  // How far a point (the mouse) is from each surface a garden at (x0, y0)
  // could grow from: the floor below it, the ceiling above, the walls.
  function surfaceDistances(x0, y0, n, point) {
    return { floor: Math.abs(y0 + n - point.y), ceiling: Math.abs(point.y - (y0 - 1)), left: Math.abs(point.x - (x0 - 1)), right: Math.abs(x0 + n - point.x) };
  }

  // A point of the art (drawn growing up from the bottom) turned to grow out from `side`.
  function turnFungus(cell, side, n = FUNGUS.size) {
    if (side === 'ceiling') return { x: cell.x, y: n - 1 - cell.y };
    if (side === 'left') return { x: n - 1 - cell.y, y: cell.x };
    if (side === 'right') return { x: cell.y, y: cell.x };
    return cell;
  }

  // The nearest spot to (x0, y0), up to 3 pixels away, where a garden fits:
  // the build tool settles on it, so it need not be placed to the pixel. Null if none.
  // With the mouse known, spots against the surface nearest the mouse come
  // first (in a corner, pointing near the floor gives a floor garden).
  function fungusNear(x0, y0) {
    let best = null;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (!fungusFits(x0 + dx, y0 + dy)) continue;
        let d = dx * dx + dy * dy;
        if (lastPoint) {
          const far = surfaceDistances(x0 + dx, y0 + dy, FUNGUS.size, lastPoint);
          const sides = ['floor', 'ceiling', 'left', 'right'].filter((side) => fungusFitsSide(x0 + dx, y0 + dy, side));
          d += Math.min(...sides.map((side) => far[side])) ** 2;
        }
        if (!best || d < best.d) best = { x: x0 + dx, y: y0 + dy, d };
      }
    }
    return best;
  }

  function fungusPixels(x0, y0) {
    const list = [];
    for (let y = y0; y < y0 + FUNGUS.size; y++) {
      for (let x = x0; x < x0 + FUNGUS.size; x++) list.push(y * cols + x);
    }
    return list;
  }

  // Each stage, the same for a garden every time: a fuzzy mat of fungus
  // growing up from the bottom of its square (addGarden turns it to face
  // out from the surface it is on), cream and grey with a ragged
  // grey top edge, thicker each stage. Once thin it starts to show clusters
  // of pale yellow swollen tips (gongylidia), more when thick.
  // Shades are FUNGUS.colors: 0 white, 1 cream, 2 tan-grey, 3 grey, 4 dark grey, 5 pale yellow, 6 straw.
  function fungusArt(x0, y0, n = FUNGUS.size) {
    const big = n / FUNGUS.size;   // a Fungus Chamber: the same, three times as big, with more gongylidia
    const TOPS = [5, 3, 1].map((t) => Math.round(t * big));
    const SPOTS = big === 1 ? [[], [[2, 5], [5, 4]], [[1, 4], [4, 2], [5, 5], [2, 6]]]
      : [[[5, 20]], [[3, 15], [10, 12], [17, 16], [20, 11]], [[2, 6], [7, 12], [12, 4], [15, 9], [19, 5], [4, 17], [11, 19], [18, 15], [21, 20]]];
    const pick = (random, list) => list[Math.floor(random() * list.length)];
    return TOPS.map((top, stage) => {
      const random = makeRandom(x0 * 977 + y0 * 131 + 7);
      const grid = new Map();
      for (let x = 0; x < n; x++) {
        const t = top + pick(random, stage < 2 ? [0, 0, 1, 1, 2] : [0, 1, 1, 2]) * Math.max(1, big - 1);
        for (let y = t; y < n; y++) {
          grid.set(y * n + x, y > t ? pick(random, [1, 1, 2, 0, 3]) : pick(random, [2, 3, 4]));
        }
      }
      for (const [sx, sy] of SPOTS[stage]) {
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const i = (sy + dy) * n + sx + dx;
          if (sx + dx < n && sy + dy < n && grid.has(i)) grid.set(i, (dx + dy) % 2 === 0 ? 5 : 6);
        }
      }
      return [...grid].map(([i, shade]) => ({ x: i % n, y: Math.floor(i / n), shade }));
    });
  }

  // `since`, `bonus` and `savedSide`, from a save: when it last grew, its
  // feeding bonus, and the surface it grows from (if that still holds it).
  // `prefer`: when placing, the mouse (see fungusSide).
  function addGarden(x0, y0, stage, since, bonus, prefer, savedSide) {
    const side = (savedSide && fungusFitsSide(x0, y0, savedSide) ? savedSide : fungusSide(x0, y0, FUNGUS.size, prefer)) || 'floor';
    const art = fungusArt(x0, y0).map((cells) => cells.map((cell) => Object.assign({}, cell, turnFungus(cell, side))));
    const grew = Number.isFinite(since) ? Math.min(since, Date.now()) : Date.now();
    gardens.push({ x: x0, y: y0, stage: stage || 0, grewAt: 0, ripeAt: stage === 2 ? grew + FUNGUS.ripeMs : 0, since: grew, sinceUnknown: !Number.isFinite(since), bonus: Number.isFinite(bonus) ? Math.min(Math.max(bonus, 0), 1) : 0, side, art });
    for (const i of fungusPixels(x0, y0)) fungusMask[i] = 1;
    markSupports();
  }

  function clearGardens() {
    gardens = [];
    if (fungusMask) fungusMask.fill(0);
    markSupports();
  }

  // A ripe (thick) garden is eaten ripeMs after it grew thick: food, and back
  // to a small patch. A garden left unfed for aloneMs grows a stage by itself.
  // Returns true if any changed.
  function tickGardens(now) {
    let changed = false;
    for (const garden of gardens) {
      if (garden.stage < 2 && now - garden.since >= (garden.chamber ? BIG.chamber.aloneMs : (crumbRules.fungusAloneMs || FUNGUS.aloneMs))) {
        garden.stage += 1;
        garden.grewAt = now;
        garden.since = now;
        if (garden.stage === 2) garden.ripeAt = now + FUNGUS.ripeMs;
        changed = true;
        continue;
      }
      if (garden.stage < 2 || now < garden.ripeAt) continue;
      garden.stage = 0;
      garden.grewAt = now;
      garden.since = now;
      const food = Math.round((crumbRules.seedFood || FUNGUS.food) * (garden.chamber ? BIG.chamber.pays : 1) * (1 + (garden.bonus || 0)) * (crumbRules.fungusWorth || 1));
      garden.bonus = 0;
      popText('+' + food + ' Food', 'pop-queen', garden.x + (garden.size || FUNGUS.size) / 2, garden.y - 1);
      note('fungus');
      if (foodHandler) foodHandler(food, 'fungus');
      changed = true;
    }
    if (changed && caveHandler) caveHandler();
    return changed;
  }

  /* ---------- Repletes ---------- */

  // Repletes (Repletes honeydew upgrade): a worker hanging from the ceiling
  // of a 10x10 space, used as a store. Workers taking crumb to the queen take
  // it to a replete that has room instead. It holds `holds` crumb pixels (and
  // whatever is left over from the last load); once full it gives `pays`
  // times their food all at once (or crumbRules.repletePays: Honeypot doubles it), then empties over restMs, taking none.
  const REPLETE = {
    size: 10,
    holds: 20,
    pays: 2.5,
    restMs: 15000,
    colors: { leg: '#000000', body: '#000000', light: '#f9e08a', fill: '#f2c230', edge: '#c8941c', stripe: '#6b4a12' }
  };

  // Can a replete go with its top-left corner at (x0, y0)? All of the space
  // must be open tunnel (no trail, pen, granary, garden or other replete,
  // clear of the queen), under a ceiling: solid dirt all along the row above.
  function repleteFits(x0, y0) {
    for (let y = y0; y < y0 + REPLETE.size; y++) {
      for (let x = x0; x < x0 + REPLETE.size; x++) {
        if (!isOpen(x, y)) return false;
        const i = y * cols + x;
        if (trail[i] || midden[i] || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i] || nearQueen(x, y)) return false;
      }
    }
    for (let x = x0; x < x0 + REPLETE.size; x++) {
      if (!inDirt(x, y0 - 1) || isOpen(x, y0 - 1)) return false;
    }
    return true;
  }

  function repletePixels(x0, y0) {
    const list = [];
    for (let y = y0; y < y0 + REPLETE.size; y++) {
      for (let x = x0; x < x0 + REPLETE.size; x++) list.push(y * cols + x);
    }
    return list;
  }

  function addReplete(x0, y0, crumbs) {
    repletes.push({ x: x0, y: y0, crumbs: crumbs || 0, coolUntil: 0, emptied: 0 });
    for (const i of repletePixels(x0, y0)) repleteMask[i] = 1;
    markSupports();
  }

  function clearRepletes() {
    repletes = [];
    if (repleteMask) repleteMask.fill(0);
    markSupports();
  }

  // How full it looks, 0 to 1: its crumbs, or while resting, shrinking from
  // what it held to empty.
  function repleteFullness(r, now) {
    const holds = r.holds || REPLETE.holds;
    if (now < r.coolUntil) return Math.min(1, r.emptied / holds) * (r.coolUntil - now) / REPLETE.restMs;
    return Math.min(1, r.crumbs / holds);
  }

  // Redraw while any replete is emptying.
  function tickRepletes(now) {
    return repletes.some((r) => now < r.coolUntil + 200);
  }

  // A worker hanging from the ceiling by long legs, head up, its gaster
  // below: a small black one when empty, swelling into a round yellow ball
  // with dark stripes (the hard plates of its gaster, pushed apart) as it
  // fills. Drawn in its 10x10 space, the body in columns 4 and 5.
  // Head, thorax and legs: the front legs grip the ceiling beside the head,
  // the long back legs reach up and out to it.
  const REPLETE_TOP = [
    'k..kkkk..k',
    '.k..kk..k.',
    '..k.kk.k..',
    '...kkkk...',
    '....kk....'
  ];

  function paintReplete(g, r, now) {
    if (r.honeypot) { paintHoneypot(g, r, now); return; }
    const c = REPLETE.colors;
    const f = repleteFullness(r, now);
    const dot = (x, y, color) => {
      g.fillStyle = color;
      g.fillRect(r.x + x, r.y + y, 1, 1);
    };
    REPLETE_TOP.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'k') dot(x, y, c.body);
    });
    // The gaster: from row 5 down, 2 to 8 pixels wide and 2 to 5 tall.
    const w = 2 + 2 * Math.round(3 * f);
    const h = 2 + Math.round(3 * f);
    for (let y = 5; y < 5 + h; y++) {
      for (let x = 5 - w / 2; x < 5 + w / 2; x++) {
        const u = (x + 0.5 - 5) / (w / 2);
        const v = (y + 0.5 - (5 + h / 2)) / (h / 2);
        const d = u * u + v * v;
        if (d > 1.15) continue;
        if (f < 0.15) { dot(x, y, c.body); continue; }   // still nearly empty: a plain black gaster
        let color = d > 0.6 ? c.edge : c.fill;
        if ((y - 5) % 2 === 1 && y < 4 + h) color = c.stripe;   // the plates, spread apart
        if (u < -0.15 && v < -0.15 && d < 0.6) color = c.light;
        dot(x, y, color);
      }
    }
  }

  /* ---------- Aphid pens ---------- */

  // The queen and the brood beside her: no pen may cover them.
  // The spot for the store flag nearest (x, y) (in the air or on a floor), within a few pixels: -1 if none.
  function flagSpotNear(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    let best = -1, bestD = Infinity;
    for (let yy = y - 8; yy <= y + 8; yy++) {
      for (let xx = x - 8; xx <= x + 8; xx++) {
        if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
        const i = yy * cols + xx;
        const d = Math.abs(xx - x) + Math.abs(yy - y);
        if (d < bestD && flagOkAt(i)) { bestD = d; best = i; }
      }
    }
    return best;
  }

  function nearQueen(x, y) {
    const floorY = center.y + CAVE.floor;
    const left = center.x + QUEEN_LEFT;
    const right = center.x + BROOD_SPOTS[BROOD_SPOTS.length - 1] + SPOT_WIDTH;
    return x >= left - 1 && x <= right && y >= floorY - Sprites.sizeOf('queen').rows && y <= floorY;
  }

  // Can a pen go with its top-left corner at (x0, y0)? Every pixel must be
  // open tunnel, with no trail, no other pen, and clear of the queen and brood.
  function penFits(x0, y0) {
    for (let y = y0; y < y0 + APHID.size; y++) {
      for (let x = x0; x < x0 + APHID.size; x++) {
        if (!isOpen(x, y)) return false;
        const i = y * cols + x;
        if (trail[i] || midden[i] || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i] || nearQueen(x, y)) return false;
      }
    }
    return true;
  }

  function penPixels(x0, y0) {
    const list = [];
    for (let y = y0; y < y0 + APHID.size; y++) {
      for (let x = x0; x < x0 + APHID.size; x++) list.push(y * cols + x);
    }
    return list;
  }

  function addPen(x0, y0, fillStart) {
    const art = Sprites.sizeOf('aphid');
    pens.push({
      x: x0, y: y0,
      fillStart: Number.isFinite(fillStart) ? Math.min(fillStart, Date.now()) : Date.now(),   // when it began filling with honeydew
      ax: Math.floor(Math.random() * (APHID.size - art.cols + 1)),
      ay: Math.floor(Math.random() * (APHID.size - art.rows + 1)),
      pose: 0,
      moveAt: Date.now() + APHID.stepMin + Math.random() * (APHID.stepMax - APHID.stepMin)
    });
    for (const i of penPixels(x0, y0)) penMask[i] = 1;
  }

  /* ---------- Granaries and seeds ---------- */

  // Can a granary go with its top-left corner at (x0, y0)? All of it must be
  // open tunnel (no trail, pen or other granary, clear of the queen), lying
  // on a floor: solid dirt all along the row just below it.
  function granaryFits(x0, y0) {
    for (let y = y0; y < y0 + GRANARY.space; y++) {
      for (let x = x0; x < x0 + GRANARY.width; x++) {
        if (!isOpen(x, y)) return false;
        const i = y * cols + x;
        if (trail[i] || midden[i] || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i] || nearQueen(x, y)) return false;
      }
    }
    for (let x = x0; x < x0 + GRANARY.width; x++) {
      if (!inDirt(x, y0 + GRANARY.space) || isOpen(x, y0 + GRANARY.space)) return false;
    }
    return true;
  }

  // The whole 8x8 space (kept clear: no trail, pens or filling in).
  function granaryPixels(x0, y0) {
    const list = [];
    for (let y = y0; y < y0 + GRANARY.space; y++) {
      for (let x = x0; x < x0 + GRANARY.width; x++) list.push(y * cols + x);
    }
    return list;
  }

  function addGranary(x0, y0, storedAt) {
    granaries.push({ x: x0, y: y0, storedAt: storedAt || 0, reservedAt: 0 });
    // 2 marks the straw (the bottom rows), 1 the clear space above it.
    for (const i of granaryPixels(x0, y0)) granaryMask[i] = Math.floor(i / cols) >= y0 + GRANARY.space - GRANARY.height ? 2 : 1;
    markSupports();
  }

  function clearGranaries() {
    granaries = [];
    vaults = [];
    granaryMask.fill(0);
    for (const n of nurseries) for (const i of granaryPixels(n.x, n.y)) granaryMask[i] = 3;   // (nurseries stay)
    for (const c of caterpillars) for (const i of caterpillarPixels(c.x, c.y)) granaryMask[i] = 4;   // (so does the caterpillar)
    markSupports();
  }

  // Can the caterpillar go with its top-left at (x0, y0)? Clear tunnel, on a floor.
  function caterpillarFits(x0, y0) {
    for (let y = y0; y < y0 + CATERPILLAR.h; y++) {
      for (let x = x0; x < x0 + CATERPILLAR.w; x++) {
        if (!isOpen(x, y)) return false;
        const i = y * cols + x;
        if (trail[i] || midden[i] || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i] || nearQueen(x, y)) return false;
      }
    }
    for (let x = x0; x < x0 + CATERPILLAR.w; x++) {
      if (!inDirt(x, y0 + CATERPILLAR.h) || isOpen(x, y0 + CATERPILLAR.h)) return false;
    }
    return true;
  }
  function caterpillarPixels(x0, y0) {
    return squarePixels(x0, y0, CATERPILLAR.w, CATERPILLAR.h);
  }
  // Stored seeds under a building just placed move to another storage spot (or are lost if there is none).
  function moveStashOff() {
    const under = stash.filter((item) => granaryMask[item.y * cols + item.x]);
    if (under.length === 0) return;
    stash = stash.filter((item) => !under.includes(item));
    for (const item of under) {
      const spot = stashSpot(true);
      if (spot) stash.push({ id: item.id, x: spot.floorX, y: spot.floorY, at: item.at, worth: item.worth || 1, kind: item.kind });
    }
  }
  function addCaterpillar(x0, y0, readyIn) {
    caterpillars.push({ x: x0, y: y0, readyAt: Date.now() + (Number.isFinite(readyIn) ? Math.max(0, readyIn) : CATERPILLAR.everyMs) });
    for (const i of caterpillarPixels(x0, y0)) granaryMask[i] = 4;
    markSupports();
  }

  // A nursery (Brood tending): a granary-sized space on a floor, holding a pile
  // of trophic eggs; 3 in the granary mask, so nothing else goes there.
  function addNursery(x0, y0) {
    nurseries.push({ x: x0, y: y0 });
    for (const i of granaryPixels(x0, y0)) granaryMask[i] = 3;
    markSupports();
  }
  // After the tunnels change all at once (a flight without Supercolony): only
  // the nurseries still lying on a floor in a tunnel stay.
  function keepNurseriesThatFit() {
    const kept = nurseries;
    nurseries = [];
    for (const n of kept) for (const i of granaryPixels(n.x, n.y)) if (granaryMask[i] === 3) granaryMask[i] = 0;
    for (const n of kept) if (granaryFits(n.x, n.y)) addNursery(n.x, n.y);
    const cats = caterpillars;
    caterpillars = [];
    for (const c of cats) for (const i of caterpillarPixels(c.x, c.y)) if (granaryMask[i] === 4) granaryMask[i] = 0;
    for (const c of cats) if (caterpillarFits(c.x, c.y)) addCaterpillar(c.x, c.y, c.readyAt - Date.now());
  }

  // The dirt under each granary and over each replete holds it up: mark it so it can't be dug.
  function markSupports() {
    if (!supportMask) return;
    supportMask.fill(0);
    const mark = (x0, y, width) => {
      for (let x = x0; x < x0 + width; x++) if (inDirt(x, y)) supportMask[y * cols + x] = 1;
    };
    for (const g of granaries) if (!g.vault) mark(g.x, g.y + GRANARY.space, GRANARY.width);
    for (const n of nurseries) mark(n.x, n.y + GRANARY.space, GRANARY.width);
    for (const c of caterpillars) mark(c.x, c.y + CATERPILLAR.h, CATERPILLAR.w);
    for (const v of vaults) mark(v.x, v.y + BIG.vaultHeight, BIG.size);
    for (const r of repletes) mark(r.x, r.y - 1, r.size || REPLETE.size);
    // The dirt a fungus garden grows from.
    const markCol = (x, y0, n) => { for (let y = y0; y < y0 + n; y++) if (inDirt(x, y)) supportMask[y * cols + x] = 1; };
    for (const f of gardens) {
      const n = f.size || FUNGUS.size;
      if (f.side === 'floor') mark(f.x, f.y + n, n);
      else if (f.side === 'ceiling') mark(f.x, f.y - 1, n);
      else if (f.side === 'left') markCol(f.x - 1, f.y, n);
      else if (f.side === 'right') markCol(f.x + n, f.y, n);
    }
    paintSupports();
  }

  // The dirt that can't be dug, in see-through red, for the dig tool.
  function paintSupports() {
    if (!supportLayer) return;
    const g = supportLayer.getContext('2d');
    g.clearRect(0, 0, cols, rows);
    g.fillStyle = 'rgba(205, 46, 31, 0.6)';
    for (let i = 0; i < supportMask.length; i++) if (supportMask[i]) g.fillRect(i % cols, Math.floor(i / cols), 1, 1);
  }

  /* ---------- The delete tool (Build menu) ---------- */

  // The structure covering game pixel (x, y): { kind, index, x, y, w, h }, or null.
  function structureAt(x, y) {
    const inside = (sx, sy, w, h) => x >= sx && x < sx + w && y >= sy && y < sy + h;
    let found = null;
    granaries.forEach((g, index) => { if (!g.vault && inside(g.x, g.y, GRANARY.width, GRANARY.space)) found = { kind: 'granary', index, x: g.x, y: g.y, w: GRANARY.width, h: GRANARY.space }; });
    nurseries.forEach((n, index) => { if (inside(n.x, n.y, GRANARY.width, GRANARY.space)) found = { kind: 'nursery', index, x: n.x, y: n.y, w: GRANARY.width, h: GRANARY.space }; });
    caterpillars.forEach((c, index) => { if (inside(c.x, c.y, CATERPILLAR.w, CATERPILLAR.h)) found = { kind: 'caterpillar', index, x: c.x, y: c.y, w: CATERPILLAR.w, h: CATERPILLAR.h }; });
    vaults.forEach((v, index) => { if (inside(v.x, v.y, BIG.size, BIG.vaultHeight)) found = { kind: 'vault', index, x: v.x, y: v.y, w: BIG.size, h: BIG.vaultHeight }; });
    pens.forEach((p, index) => { const n = p.size || APHID.size; if (inside(p.x, p.y, n, n)) found = { kind: 'pen', index, x: p.x, y: p.y, w: n, h: n }; });
    gardens.forEach((g, index) => { const n = g.size || FUNGUS.size; if (inside(g.x, g.y, n, n)) found = { kind: 'garden', index, x: g.x, y: g.y, w: n, h: n }; });
    repletes.forEach((r, index) => { const n = r.size || REPLETE.size; const h = r.h || n; if (inside(r.x, r.y, n, h)) found = { kind: 'replete', index, x: r.x, y: r.y, w: n, h }; });
    return found;
  }

  function structurePixels(s) {
    const list = [];
    for (let y = s.y; y < s.y + s.h; y++) {
      for (let x = s.x; x < s.x + s.w; x++) list.push(y * cols + x);
    }
    return list;
  }

  // Take away the structure covering pixel i. Ants on their way to any
  // structure give that up (their places in the lists may have moved).
  function deleteStructure(i) {
    const s = structureAt(i % cols, Math.floor(i / cols));
    if (!s) return false;
    const masks = { granary: granaryMask, vault: granaryMask, nursery: granaryMask, caterpillar: granaryMask, pen: penMask, garden: fungusMask, replete: repleteMask };
    const lists = { granary: granaries, vault: vaults, nursery: nurseries, caterpillar: caterpillars, pen: pens, garden: gardens, replete: repletes };
    const gone = lists[s.kind].splice(s.index, 1)[0];
    if (s.kind === 'vault') granaries = granaries.filter((g) => g.vault !== gone);   // and its seeds
    // What went, for popup.js's refund: granary, pen, garden or replete, or
    // the merged kind (vault, chamber, honeypot, herd); where to show it.
    lastDeleted = { kind: s.kind === 'vault' ? 'vault' : gone.chamber ? 'chamber' : gone.honeypot ? 'honeypot' : gone.herd ? 'herd' : s.kind, x: s.x + s.w / 2, y: s.y };
    for (const p of structurePixels(s)) masks[s.kind][p] = 0;
    markSupports();
    Wanderers.forgetBuildings(world);
    paintCave();
    redraw();
    return true;
  }

  // Seeds stored deeper pay more: a granary's (or Seed Vault's) floor at the
  // very bottom of the world pays DEPTH.most more, at the surface nothing more.
  const DEPTH = { most: 0.5 };
  function depthBonus(granary) {
    const floor = granary.vault ? granary.vault.y + BIG.vaultHeight : granary.y + GRANARY.space;
    const share = Math.min(1, Math.max(0, (floor - ground) / (rows - ground)));
    return 1 + DEPTH.most * share;
  }

  // Is this granary free for a new seed (empty, and no worker bringing one)?
  function granaryFree(granary, now) {
    return !granary.storedAt && now - granary.reservedAt > GRANARY.reserveFor;
  }

  // Somewhere on the grass for a seed: away from the tunnel opening, the
  // crumbs and the other seeds.
  function seedSpot() {
    const opening = tunnelX(ground);
    const width = Sprites.sizeOf('seed').cols;
    for (let tries = 0; tries < 200; tries++) {
      const x = CRUMB.clearOfEdge + Math.floor(Math.random() * (cols - 2 * CRUMB.clearOfEdge - width));
      if (Math.abs(x + width / 2 - opening) < CRUMB.clearOfTunnel) continue;
      if (crumbs.some((crumb) => { const box = crumbBox(crumb); return box && x + width >= box.left - 2 && x <= box.right + 2; })) continue;
      if (seeds.some((other) => x + width + 2 > other.x && x < other.x + width + 2)) continue;
      return x;
    }
    return null;
  }

  function nextSeedTime(now) {
    const range = crumbRules.seedRange;   // Harvester's last level: its own range
    const fewer = 1 / (1 - Math.min(SURFACE.most, surfaceShare()));   // the surface dug out: fewer seeds (a longer wait)
    if (range) return now + (range[0] + Math.random() * (range[1] - range[0])) * fewer;
    return now + (SEED.everyMin + Math.random() * (SEED.everyMax - SEED.everyMin)) * (crumbRules.seedWait || 1) * fewer;   // Harvester: sooner
  }

  // Seeds fall on grass: the share of the top row of dirt dug out (not the
  // nest hole) cuts how many come by that share (20% dug, 20% fewer).
  const SURFACE = { most: 0.9 };   // (never fewer than a tenth)
  let surfaceCached = { stamp: -1, share: 0 };
  function surfaceShare() {
    if (surfaceCached.stamp === caveStamp) return surfaceCached.share;
    let dug = 0;
    for (let x = 0; x < cols; x++) {
      const i = ground * cols + x;
      if (open[i] && !startMask[i]) dug += 1;
    }
    surfaceCached = { stamp: caveStamp, share: cols > 0 ? dug / cols : 0 };
    return surfaceCached.share;
  }

  // Seeds appear now and then; granaries turn seeds into ant bread, then
  // food. Returns true if anything changed on screen.
  // Seeds stored on tunnel floors (the STORE seed setting): at most `most`,
  // `gap` pixels apart, never by the queen and brood, in the main tunnel or in
  // a structure. While the setting is EAT, workers carry them to empty
  // granaries (ants.js), where they are eaten as usual. Seed keepers: one
  // stored longer than its age (crumbRules.seedAgeMs) is ant bread, and pays
  // agedTimes in the granary.
  const STORE_FLAG = { room: 10, roomWorth: 0.4 };   // the flag picked for STORE: tunnel steps from the main tunnel, plus roomWorth for each open pixel (every other one counted) within `room`
  const STASH = { most: 60, fullNoteMs: 30000, fullShowMs: 5000, gap: 4, agedTimes: 2, holdMs: 60000, shift: 2, choices: 12, emptyReach: 12, crowdCost: 25 };   // choices: places weighed for each seed; each seed or structure within emptyReach counts as crowdCost steps nearer

  // Is there any spot for a stored seed? Checked at most every 3 seconds (the search is random).
  let stashRoomAt = 0;
  let stashRoomWas = false;
  function stashRoom() {
    const now = Date.now();
    if (now - stashRoomAt > 3000) {
      stashRoomAt = now;
      stashRoomWas = stashSpot(true) !== null;
      // Full, with seeds waiting on the grass: said by the nest hole now and then (no click needed).
      if (stash.length >= STASH.most && seeds.length > 0 && now - stashFullSaidAt > STASH.fullNoteMs) {
        stashFullSaidAt = now;
        popText('Seed storage full', 'pop-steal', tunnelX(ground), ground - 8, STASH.fullShowMs);
      }
    }
    return stashRoomWas;
  }

  // A free spot on a tunnel floor for a stored seed: { id: 'stash', stash: true, x, y }, or null.
  // The store flag (STORE): stored seeds go on the floor nearest it, filling
  // outward. Picked when STORE is switched on (a tunnel end with room, far
  // from the main tunnel up to the grass), or put down by the player.
  const stashByQueen = (x, y) => Math.abs(x - center.x) <= 36 && y <= center.y + CAVE.floor && y >= center.y - CAVE.roof;   // the queen, the brood and the alate
  function mainTunnelAt(i) {
    return startMask[i] && !chamber[i];
  }
  // Where the player can put the flag: any open pixel in the nest but the main tunnel.
  function flagOkAt(i) {
    const x = i % cols;
    const y = (i - x) / cols;
    return i >= 0 && i < open.length && y > ground + 2 && !!open[i] && !mainTunnelAt(i);
  }
  // Where a stored seed can be set down by the flag: any open pixel (on a
  // floor or not) clear of structures, the main tunnel and the queen.
  function storeSpotAt(i) {
    const x = i % cols;
    const y = (i - x) / cols;
    if (y <= ground + 2 || y >= rows - 1 || x < 2 || x >= cols - 2) return false;
    if (!open[i] || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i]) return false;
    return !mainTunnelAt(i) && !stashByQueen(x, y);
  }
  // A floor pixel the flag can be on when it is picked for you.
  function storeFloorAt(i) {
    const x = i % cols;
    const y = (i - x) / cols;
    if (y <= ground + 2 || y >= rows - 1 || x < 2 || x >= cols - 2) return false;
    if (!open[i] || open[i + cols] || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i]) return false;
    return !mainTunnelAt(i) && !stashByQueen(x, y);
  }
  // Steps through the tunnels from `starts` (pixel indices): each open pixel's distance, -1 if none.
  function tunnelSteps(starts) {
    const steps = new Int32Array(open.length).fill(-1);
    const queue = new Int32Array(open.length);
    let head = 0, tail = 0;
    for (const i of starts) if (open[i] && steps[i] < 0) { steps[i] = 0; queue[tail++] = i; }
    while (head < tail) {
      const j = queue[head++];
      const x = j % cols;
      for (const k of [x > 0 ? j - 1 : -1, x < cols - 1 ? j + 1 : -1, j - cols, j + cols]) {
        if (k < 0 || k >= open.length || !open[k] || steps[k] >= 0) continue;
        if (Math.floor(k / cols) <= ground) continue;   // (through the nest, not over the grass)
        steps[k] = steps[j] + 1;
        queue[tail++] = k;
      }
    }
    return { steps, order: queue.subarray(0, tail) };
  }
  function autoStoreFlag() {
    const mains = [];
    for (let i = 0; i < open.length; i++) if (open[i] && mainTunnelAt(i)) mains.push(i);
    const { steps } = tunnelSteps(mains);
    const r = STORE_FLAG.room;
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < open.length; i++) {
      if (i % 2 || !storeFloorAt(i) || steps[i] < 0) continue;
      const x = i % cols, y = (i - x) / cols;
      let room = 0;
      for (let yy = Math.max(ground + 1, y - r); yy <= Math.min(rows - 1, y + r); yy += 2) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(cols - 1, x + r); xx += 2) {
          const k = yy * cols + xx;
          if (open[k] && !granaryMask[k] && !fungusMask[k] && !repleteMask[k] && !penMask[k] && !mainTunnelAt(k)) room += 1;
        }
      }
      const score = steps[i] + STORE_FLAG.roomWorth * room;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    storeFlag = best;
    storeFlagAuto = best >= 0;
    redraw();
    return best >= 0;
  }

  // `probe`: only asking whether there is room (nothing is held for a worker).
  function stashSpot(probe) {
    if (stash.length >= STASH.most) return null;
    const now = Date.now();
    stashHeld = stashHeld.filter((held) => now - held.at < STASH.holdMs);
    // Taken: near a stored seed, or where a worker is already taking one.
    const taken = new Uint8Array(open.length);
    for (const item of stash.concat(stashHeld)) {
      for (let y = item.y - STASH.gap + 1; y < item.y + STASH.gap; y++) {
        for (let x = item.x - STASH.gap + 1; x < item.x + STASH.gap; x++) {
          if (x >= 0 && y >= 0 && x < cols && y < rows) taken[y * cols + x] = 1;
        }
      }
    }
    const free = (x, y) => !taken[y * cols + x];
    const byQueen = stashByQueen;
    if (storeFlag < 0 || !flagOkAt(storeFlag)) autoStoreFlag();
    if (storeFlag >= 0) {
      // Nearest the flag first (through the tunnels), filling outward.
      for (const i of tunnelSteps([storeFlag]).order) {
        if (!storeSpotAt(i)) continue;
        const x = i % cols, y = (i - x) / cols;
        if (!free(x, y)) continue;
        const stand = world.nearestStand('worker', x, y, 6);
        if (!stand) continue;
        if (!probe) stashHeld.push({ x, y, at: now });
        return { id: 'stash', stash: true, x: stand.x, y: stand.y, floorX: x, floorY: y };
      }
      return null;
    }
    // A tunnel floor first (open, with dirt right under it); failing that,
    // anywhere in the tunnels dug since (not the main tunnel). Of a few
    // places found, the emptiest and farthest from the queen: tunnel ends,
    // empty rooms.
    const crowd = (x, y) => {
      let n = stash.filter((item) => Math.abs(item.x - x) <= STASH.emptyReach && Math.abs(item.y - y) <= STASH.emptyReach).length;
      for (const g of granaries) if (Math.abs(g.x - x) <= STASH.emptyReach && Math.abs(g.y - y) <= STASH.emptyReach) n += 1;
      for (const g of gardens) if (Math.abs(g.x - x) <= STASH.emptyReach && Math.abs(g.y - y) <= STASH.emptyReach) n += 1;
      for (const r of repletes) if (Math.abs(r.x - x) <= STASH.emptyReach && Math.abs(r.y - y) <= STASH.emptyReach) n += 1;
      for (const p of pens) if (Math.abs(p.x - x) <= STASH.emptyReach && Math.abs(p.y - y) <= STASH.emptyReach) n += 1;
      return n;
    };
    for (const needFloor of [true, false]) {
      let best = null;
      let found = 0;
      for (let tries = 0; tries < 400 && found < STASH.choices; tries++) {
        const x = 2 + Math.floor(Math.random() * (cols - 4));
        const y = ground + 3 + Math.floor(Math.random() * (rows - ground - 4));
        const i = y * cols + x;
        if (!open[i] || (needFloor && open[i + cols]) || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i]) continue;
        if (startMask[i] && !chamber[i]) continue;   // never in the main tunnel up to the grass
        if (byQueen(x, y) || !free(x, y)) continue;
        const stand = world.nearestStand('worker', x, y, 6);   // where the ant stands to set it down
        if (!stand) continue;
        const far = world.distance('home', stand.x, stand.y);
        if (far < 0) continue;
        found += 1;
        const score = far - STASH.crowdCost * crowd(x, y);
        if (!best || score > best.score) best = { score, spot: { id: 'stash', stash: true, x: stand.x, y: stand.y, floorX: x, floorY: y } };
      }
      if (best) return best.spot;
    }
    return null;
  }

  /* ---------- Seasons (popup.js runs the clock) ----------
   * crumbRules.dusk (0 to 1) darkens the sky as winter nears; in winter
   * (crumbRules.winter) the sky stays dark and the grass is frosted with a
   * line of snow. Rain darkens the field a little and falls over it. */
  const RAIN = { drops: 70 };
  function drawSeason(g) {
    const dusk = crumbRules.winter ? 1 : Math.max(0, Math.min(1, crumbRules.dusk || 0));
    if (dusk > 0) {
      g.fillStyle = 'rgba(18, 22, 46, ' + (0.6 * dusk).toFixed(3) + ')';
      g.fillRect(0, 0, cols, ground);   // the whole sky, down to the ground (the grass dims too)
    }
    if (crumbRules.winter) {
      g.fillStyle = 'rgba(205, 205, 200, 0.6)';   // frost on the grass
      g.fillRect(0, ground - GRASS_ROWS, cols, GRASS_ROWS);
      g.fillStyle = 'rgba(250, 250, 255, 0.95)';  // snow along the ground
      g.fillRect(0, ground - 2, cols, 2);
    }
    if (crumbRules.rain) {
      g.fillStyle = 'rgba(20, 30, 60, 0.18)';
      g.fillRect(0, 0, cols, rows);
    }
  }

  // Rain floods the lowest tunnels: while it rains the water rises from the
  // deepest dug row, up to FLOOD.most rows over riseMs, then drains over
  // drainMs once it stops. Never into the queen's chamber or above it.
  // Flooded tunnel can't be walked (world.canStand), so ants keep out.
  const FLOOD = { most: 24, riseMs: 30000, drainMs: 40000, water: 'rgba(48, 104, 186, 0.62)', top: 'rgba(160, 205, 245, 0.85)' };
  let floodDepth = 0;       // rows of water, with a fraction
  let floodTop = null;      // the highest flooded row, or null when dry
  let floodClock = 0;
  let deepest = { stamp: -1, row: 0 };

  function deepestRow() {
    if (deepest.stamp === caveStamp) return deepest.row;
    let row = 0;
    for (let y = rows - 1; y >= ground && !row; y--) {
      for (let x = 0; x < cols; x++) if (open[y * cols + x]) { row = y; break; }
    }
    deepest = { stamp: caveStamp, row };
    return row;
  }

  // Returns true if the water line moved (so the field redraws).
  function updateFlood(now) {
    const dt = floodClock ? Math.min(1000, Math.max(0, now - floodClock)) : 0;
    floodClock = now;
    if (crumbRules.rain) floodDepth = Math.min(FLOOD.most, floodDepth + FLOOD.most * dt / FLOOD.riseMs);
    else floodDepth = Math.max(0, floodDepth - FLOOD.most * dt / FLOOD.drainMs);
    let top = null;
    if (floodDepth >= 1) {
      const bottom = deepestRow();
      top = Math.max(bottom - Math.floor(floodDepth) + 1, center.y + CAVE.floor + 3);   // the chamber stays dry
      if (top > bottom) top = null;
    }
    if (top === floodTop) return false;
    floodTop = top;
    visitMaps = new Map();   // the ways around have changed
    distances = {};
    caveStamp++;
    return true;
  }

  function flooded(x, y) {
    return floodTop !== null && y >= floodTop;
  }

  // Rain starts: crumbs and seeds lying on the grass wash away.
  function rainWash() {
    for (const crumb of crumbs) {
      if (crumb.respawnAt || crumb.party) continue;   // (the party block stays)
      crumb.bits.fill(0);
      crumb.respawnAt = nextRespawn();
      if (crumb.fruit) { crumb.respawnAt = Infinity; crumb.gone = true; }   // a fruit is gone for good (so the next one can come)
    }
    seeds = [];
    crumbChanged();
    redraw();
  }

  function tickGranaries(now) {
    let changed = false;
    let saveNeeded = false;
    for (const granary of granaries) {
      if (!granary.storedAt) continue;
      const age = now - granary.storedAt;
      if (age >= GRANARY.eatenAfter) {
        granary.storedAt = 0;
        const food = Math.round((crumbRules.seedFood || GRANARY.food) * (granary.vault ? BIG.vault.food : 1) * (crumbRules.seedMult || 1) * (granary.aged ? STASH.agedTimes : 1) * (granary.worth || 1) * depthBonus(granary));   // Harvester: more; a Seed Vault: 20% more; winter: 4x (6x with Diapause); Seed keepers' ant bread: 2x; deeper: up to 50% more
        granary.aged = false;
        granary.worth = 1;
        if (granary.vault) popText('+' + food + ' Food', 'pop-queen', granary.vault.x + BIG.size / 2, granary.vault.y + 2);
        else popText('+' + food + ' Food', 'pop-queen', granary.x + GRANARY.width / 2, granary.y + GRANARY.space - GRANARY.height - 2);
        if (foodHandler) foodHandler(food, 'granary');
        changed = true;
        saveNeeded = true;
      } else if (age >= GRANARY.breadAfter && !granary.bread) {
        granary.bread = true;
        changed = true;
      }
      if (!granary.storedAt) granary.bread = false;
    }
    // A new seed now and then, whether or not a granary has room (at most SEED.max lying about).
    if (!nextSeedAt) nextSeedAt = nextSeedTime(now);   // the first one waits too
    const noSeeds = crumbRules.winter && !crumbRules.winterForage;   // winter: no seeds fall (and none are owed after), unless Microbial heaters
    if (noSeeds) nextSeedAt = Math.max(nextSeedAt, now);
    if (!noSeeds && seeds.length < (crumbRules.seedMax || SEED.max) && now >= nextSeedAt) {
      const x = seedSpot();
      if (x !== null) {
        seeds.push({ id: ++lastSeedId, x, kind: Sprites.pickSeed() });
        changed = true;
        saveNeeded = true;
      }
      nextSeedAt = nextSeedTime(now);
    }
    if (saveNeeded && caveHandler) caveHandler();
    return changed;
  }

  function clearPens() {
    pens = [];
    penMask.fill(0);
  }

  // Each aphid now and then shifts a pixel inside its pen (or just moves its
  // legs). Returns true if any changed.
  function moveAphids(now) {
    const art = Sprites.sizeOf('aphid');
    let changed = false;
    for (const pen of pens) {
      if (pen.herd) {
        if (moveHerd(pen, now)) changed = true;
        // A Mealybug Herd: a new drop every dropMs, up to `most`.
        while (pen.drops < BIG.herd.most && now >= pen.dropAt) {
          pen.drops += 1;
          pen.dropAt += BIG.herd.dropMs;
          changed = true;
        }
        if (pen.drops >= BIG.herd.most) pen.dropAt = now + BIG.herd.dropMs;
        continue;
      }
      if (aphidFull(pen, now)) {
        // Full: to the middle of the pen, and keep still until milked.
        const ax = Math.floor((APHID.size - art.cols) / 2);
        const ay = Math.floor((APHID.size - art.rows) / 2);
        if (pen.ax !== ax || pen.ay !== ay || pen.pose || !pen.showsDrop) {
          pen.ax = ax;
          pen.ay = ay;
          pen.pose = 0;
          pen.showsDrop = true;
          changed = true;
        }
        continue;
      }
      pen.showsDrop = false;
      if (now < pen.moveAt) continue;
      pen.ax = Math.max(0, Math.min(APHID.size - art.cols, pen.ax + Math.floor(Math.random() * 3) - 1));
      pen.ay = Math.max(0, Math.min(APHID.size - art.rows, pen.ay + Math.floor(Math.random() * 3) - 1));
      pen.pose = 1 - pen.pose;
      pen.moveAt = now + APHID.stepMin + Math.random() * (APHID.stepMax - APHID.stepMin);
      changed = true;
    }
    return changed;
  }

  /* ---------- Aphid milking ---------- */

  // Has this aphid filled with honeydew (or, for a herd, are enough drops waiting)?
  function aphidFull(pen, now) {
    if (pen.herd) return pen.drops >= BIG.herd.ready;
    return now - pen.fillStart >= APHID.fillMs;
  }

  // Milk an aphid or a herd: its food, and it starts filling again.
  function milkOne(pen, now) {
    const food = pen.herd ? pen.drops * APHID.food : APHID.food;
    if (pen.herd) {
      pen.drops = 0;
      pen.dropAt = now + BIG.herd.dropMs;
    } else {
      pen.fillStart = now;
      pen.showsDrop = false;
      pen.moveAt = now + APHID.stepMin;
    }
    return food;
  }

  /* ---------- Merged structures ---------- */

  // The space a merged structure takes: { w, h }. A Honeypot Chamber is
  // shorter, since its repletes only hang down so far from the ceiling.
  function bigDims(kind) {
    if (kind === 'honeypot') return { w: BIG.size, h: BIG.honeypotHeight };
    if (kind === 'vault') return { w: BIG.size, h: BIG.vaultHeight };
    return { w: BIG.size, h: BIG.size };
  }

  function squarePixels(x0, y0, w, h = w) {
    const list = [];
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) list.push(y * cols + x);
    }
    return list;
  }

  // Can a merged structure of this kind go with its top-left corner at
  // (x0, y0)? All of its space must be open tunnel with no other structure in
  // it (pheromone trail is fine: it is cleared), clear of the queen. A Seed
  // Vault needs a floor, a Honeypot Chamber a ceiling, and a Fungus Chamber
  // one solid side.
  function bigFits(kind, x0, y0) {
    const { w, h } = bigDims(kind);
    if (x0 < 0 || y0 < ground || x0 + w > cols || y0 + h > rows || openIn(x0, y0, w, h) !== w * h) return false;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = y * cols + x;
        if (hiddenMask[i]) continue;   // one of the structures this merge uses up
        if (midden[i] || penMask[i] || granaryMask[i] || fungusMask[i] || repleteMask[i] || nearQueen(x, y)) return false;
      }
    }
    const solidRow = (y) => { for (let x = x0; x < x0 + w; x++) if (!inDirt(x, y) || isOpen(x, y)) return false; return true; };
    if (kind === 'vault') return solidRow(y0 + h);
    if (kind === 'honeypot') return solidRow(y0 - 1);
    if (kind === 'chamber') return fungusSide(x0, y0, w) !== null;
    return true;
  }

  // The nearest spot to (x0, y0), up to 4 pixels away, where one fits (the
  // tool settles on it, so it need not be placed to the pixel). Null if none.
  function bigNear(kind, x0, y0) {
    let best = null;
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = dx * dx + dy * dy;
        if ((!best || d < best.d) && bigFits(kind, x0 + dx, y0 + dy)) best = { x: x0 + dx, y: y0 + dy, d };
      }
    }
    return best;
  }

  // A smooth random-looking value from 0 to 1 across the square, the same
  // every time for the same seed (for the Fungus Chamber's maze).
  function smoothNoise(seed) {
    const random = makeRandom(seed);
    const table = [];
    for (let k = 0; k < 100; k++) table.push(random());
    const at = (x, y) => table[(((x % 10) + 10) % 10) + (((y % 10) + 10) % 10) * 10];
    const ease = (t) => t * t * (3 - 2 * t);
    return (x, y, scale) => {
      x /= scale;
      y /= scale;
      const ax = Math.floor(x);
      const ay = Math.floor(y);
      const fx = ease(x - ax);
      const fy = ease(y - ay);
      const p = at(ax, ay), q = at(ax + 1, ay), r = at(ax, ay + 1), s = at(ax + 1, ay + 1);
      return p + (q - p) * fx + (r - p) * fy + (p - q - r + s) * fx * fy;
    };
  }

  // The Fungus Chamber's picture at each stage: a square of packed dirt
  // cracked into a winding maze, with fungus growing through the cracks from
  // the bottom of each one, a little further each stage until every crack is
  // full; then pale yellow gongylidia show. Worked out once per chamber.
  function chamberArt(x0, y0) {
    const n = BIG.size;
    const c = BIG.colors;
    const big = smoothNoise(x0 * 31 + y0 * 17 + 41);
    const fine = smoothNoise(x0 * 7 + y0 * 59 + 7);
    const crack = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = (big(x, y, 3.2) * 0.75 + fine(x, y, 1.6) * 0.25) * 4.2;
        const f = v - Math.floor(v);
        crack[y * n + x] = f > c.crackFrom && f < c.crackTo ? 1 : 0;
      }
    }
    // How far each crack pixel is from where its fungus starts: the lowest
    // pixel of its crack.
    const dist = new Int32Array(n * n).fill(-1);
    const queue = [];
    const seen = new Uint8Array(n * n);
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = n - 1; y >= 0; y--) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        if (!crack[i] || seen[i]) continue;
        const stack = [i];
        seen[i] = 1;
        while (stack.length) {
          const j = stack.pop();
          for (const [dx, dy] of steps) {
            const nx = (j % n) + dx;
            const ny = Math.floor(j / n) + dy;
            const k = ny * n + nx;
            if (nx >= 0 && ny >= 0 && nx < n && ny < n && crack[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
          }
        }
        dist[i] = 0;
        queue.push(i);
      }
    }
    for (let head = 0; head < queue.length; head++) {
      const j = queue[head];
      for (const [dx, dy] of steps) {
        const nx = (j % n) + dx;
        const ny = Math.floor(j / n) + dy;
        const k = ny * n + nx;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n && crack[k] && dist[k] < 0) { dist[k] = dist[j] + 1; queue.push(k); }
      }
    }
    const order = queue.map((j) => dist[j]).sort((a, b) => a - b);
    const reach = (share) => order.length ? order[Math.max(0, Math.ceil(order.length * share) - 1)] : -1;
    const wall = (x, y) => x < 0 || y < 0 || x >= n || y >= n || !crack[y * n + x];
    return [0.3, 0.65, 1].map((share, stage) => {
      const limit = reach(share);
      const random = makeRandom(x0 * 13 + y0 * 29 + 3);
      const cells = [];
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const roll = random();
          if (wall(x, y)) {
            const edge = (!wall(x, y + 1) || !wall(x + 1, y)) && roll < 0.6;
            cells.push([x, y, edge ? c.packedEdge : c.packed[Math.floor(roll * 3)]]);
            continue;
          }
          const d = dist[y * n + x];
          if (d < 0 || d > limit) { cells.push([x, y, c.crack]); continue; }
          let color = c.fungus[Math.floor(roll * 3)];
          if (wall(x, y - 1)) color = c.fungusShade;
          else if (wall(x, y + 1) && roll < 0.5) color = c.fungusLight;
          if (stage < 2 && d === limit) color = c.fungusShade;   // the growing edge
          cells.push([x, y, color]);
        }
      }
      // Gongylidia: 3 small clusters while growing, 8 when ready.
      const want = [0, 3, 8][stage];
      const spots = makeRandom(x0 * 3 + y0 * 101 + 23);
      const color = new Map(cells.map(([x, y, col]) => [y * n + x, col]));
      for (let tries = 0, found = 0; tries < 400 && found < want; tries++) {
        const x = 1 + Math.floor(spots() * (n - 3));
        const y = 1 + Math.floor(spots() * (n - 3));
        const ok = (px, py) => crack[py * n + px] && dist[py * n + px] >= 0 && dist[py * n + px] <= limit;
        if (!ok(x, y) || !ok(x + 1, y) || !ok(x, y + 1)) continue;
        color.set(y * n + x, c.tip[0]);
        color.set(y * n + x + 1, c.tip[1]);
        color.set((y + 1) * n + x, c.tip[1]);
        if (stage === 2 && ok(x + 1, y + 1)) color.set((y + 1) * n + x + 1, c.tip[0]);
        found++;
      }
      return [...color].map(([i, col]) => [i % n, Math.floor(i / n), col]);
    });
  }

  // The Honeypot Chamber's repletes: a carpet of them packed along the
  // ceiling, a back row of 6 and a lower row of 5, each a little off: nudged
  // a pixel, hanging a little higher or lower, a little bigger or smaller.
  // The same for a chamber every time. [{ x, len, size, lean }]
  function honeypotLayout(x0, y0) {
    const random = makeRandom(x0 * 71 + y0 * 37 + 58);
    const rowsOf = [[2, 0, 2], [6, 0, 2], [10, 0, 2], [14, 0, 2], [18, 0, 2], [22, 0, 2], [4, 4, 2.2], [8, 4, 2.2], [12, 4, 2.2], [16, 4, 2.2], [20, 4, 2.2]];
    const jitter = 0.8;
    return rowsOf.map(([x, len, size]) => {
      const dx = Math.round((random() - 0.5) * 2 * jitter);
      return {
        x: Math.max(1, Math.min(BIG.size - 2, x + dx)),
        len: Math.max(0, len + Math.round((random() - 0.3) * 2.5 * jitter)),
        size: Math.max(1.5, size + (random() - 0.5) * 0.6 * jitter),
        lean: dx ? -Math.sign(dx) : 0
      };
    }).sort((a, b) => a.len - b.len);   // the back row first, so the lower row hangs in front
  }

  // The Mealybug Herd's mealybugs: white, waxy, oval, scattered over the
  // plant matter, each with its own little clock for its idle wiggle.
  function herdBugs(x0, y0) {
    const random = makeRandom(x0 * 53 + y0 * 97 + 11);
    const bugs = [];
    const now = Date.now();
    for (let tries = 0; tries < 400 && bugs.length < BIG.herd.bugs; tries++) {
      const x = 1 + Math.floor(random() * (BIG.size - 7));
      const y = 2 + Math.floor(random() * (BIG.size - 6));
      if (bugs.every((o) => Math.abs(o.x - x) > 6 || Math.abs(o.y - y) > 4)) {
        bugs.push({ x, y, home: { x, y }, pose: 0, moveAt: now + 500 + random() * 3000 });
      }
    }
    return bugs;
  }

  // Put a merged structure in place. `carry`: the stored seeds (their
  // storedAt times) for a vault, the stage for a chamber, the crumbs held
  // for a honeypot, the drops waiting for a herd.
  function addBig(kind, x0, y0, carry) {
    const { w, h } = bigDims(kind);
    const now = Date.now();
    for (const i of squarePixels(x0, y0, w, h)) trail[i] = 0;
    if (kind === 'vault') {
      const vault = { x: x0, y: y0 };
      vaults.push(vault);
      const stored = (Array.isArray(carry) ? carry : []).filter(Number.isFinite);
      for (let k = 0; k < BIG.vault.slots; k++) {
        // Workers walk in and drop seeds off along the vault floor (each
        // slot's spot is where a granary there would take its seed); each
        // seed then shows in its own cell in the wall.
        granaries.push({ x: x0 + 1 + Math.round(k * 1.7), y: y0 + h - GRANARY.space, storedAt: stored[k] ? Math.min(stored[k], now) : 0, reservedAt: 0, vault, slot: k });
      }
      for (const i of squarePixels(x0, y0, w, h)) granaryMask[i] = 1;
    } else if (kind === 'chamber') {
      // carry: its stage, or (from a save) [stage, since, bonus].
      const side = fungusSide(x0, y0, w) || 'floor';
      const saved = Array.isArray(carry) ? carry : [carry];
      const stage = Number.isInteger(saved[0]) ? Math.min(Math.max(saved[0], 0), 2) : 0;
      const since = Number.isFinite(saved[1]) ? Math.min(saved[1], now) : now;
      const bonus = Number.isFinite(saved[2]) ? Math.min(Math.max(saved[2], 0), 1) : 0;
      gardens.push({ x: x0, y: y0, size: w, chamber: true, stage, grewAt: 0, ripeAt: stage === 2 ? since + FUNGUS.ripeMs : 0, since, bonus, side, art: chamberArt(x0, y0) });
      for (const i of squarePixels(x0, y0, w, h)) fungusMask[i] = 1;
    } else if (kind === 'honeypot') {
      const crumbs = Number.isFinite(carry) ? Math.min(Math.max(Math.floor(carry), 0), BIG.honeypot.holds - 1) : 0;
      repletes.push({ x: x0, y: y0, size: w, h, honeypot: true, holds: BIG.honeypot.holds, crumbs, coolUntil: 0, emptied: 0, layout: honeypotLayout(x0, y0) });
      for (const i of squarePixels(x0, y0, w, h)) repleteMask[i] = 1;
    } else if (kind === 'herd') {
      const drops = Number.isFinite(carry) ? Math.min(Math.max(Math.floor(carry), 0), BIG.herd.most) : 0;
      pens.push({ x: x0, y: y0, size: w, herd: true, drops, dropAt: now + BIG.herd.dropMs, bugs: herdBugs(x0, y0), ax: 0, ay: 0, pose: 0 });
      for (const i of squarePixels(x0, y0, w, h)) penMask[i] = 1;
    }
    markSupports();
  }

  // The base structures a merge uses up, oldest first: granaries, fungus
  // gardens, repletes or aphids (never merged ones).
  function baseList(kind) {
    if (kind === 'vault') return granaries.filter((g) => !g.vault);
    if (kind === 'chamber') return gardens.filter((g) => !g.chamber);
    if (kind === 'honeypot') return repletes.filter((r) => !r.honeypot);
    return pens.filter((p) => !p.herd);
  }

  // Merge `count` of the base structures into one merged structure at
  // (x0, y0). What they held comes along: a vault takes their seeds, a
  // honeypot their crumbs. False if there aren't enough.
  function mergeInto(kind, x0, y0, count) {
    // The ones hidden while placing (the 10 nearest the mouse), or else the
    // 10 nearest the spot.
    const { w: bw, h: bh } = bigDims(kind);
    const hidden = [...mergeHidden];
    const used = hidden.length === count && hidden.every((item) => baseList(kind).includes(item)) ? hidden
      : nearestBase(kind, { x: x0 + bw / 2, y: y0 + bh / 2 }, count);
    if (used.length < count) return false;
    // It may only cover the structures it uses up: check its space with
    // exactly those set aside (not whatever the preview had hidden).
    const sizes = { vault: [GRANARY.width, GRANARY.space], chamber: [FUNGUS.size, FUNGUS.size], honeypot: [REPLETE.size, REPLETE.size], herd: [APHID.size, APHID.size] };
    const preview = hiddenMask.slice();
    hiddenMask.fill(0);
    for (const item of used) for (const i of structurePixels({ x: item.x, y: item.y, w: sizes[kind][0], h: sizes[kind][1] })) hiddenMask[i] = 1;
    const fits = bigFits(kind, x0, y0);
    hiddenMask.set(preview);
    if (!fits) return false;
    // Seeds stored on the floor where it goes are moved, not lost.
    const inSpace = (item) => item.x >= x0 && item.x < x0 + bw && item.y >= y0 && item.y < y0 + bh;
    const moving = stash.filter(inSpace);
    stash = stash.filter((item) => !inSpace(item));
    let carry = 0;
    if (kind === 'vault') carry = used.filter((g) => g.storedAt).map((g) => g.storedAt);
    if (kind === 'honeypot') carry = used.reduce((sum, r) => sum + r.crumbs, 0);
    const lists = { vault: () => granaries, chamber: () => gardens, honeypot: () => repletes, herd: () => pens };
    const masks = { vault: granaryMask, chamber: fungusMask, honeypot: repleteMask, herd: penMask };
    for (const item of used) {
      const [w, h] = sizes[kind];
      for (const p of structurePixels({ x: item.x, y: item.y, w, h })) masks[kind][p] = 0;
      const list = lists[kind]();
      list.splice(list.indexOf(item), 1);
    }
    addBig(kind, x0, y0, carry);
    for (const item of moving) {
      const spot = stashSpot();
      if (spot) stash.push({ id: item.id, x: spot.floorX, y: spot.floorY, at: item.at, worth: item.worth || 1, kind: item.kind });
    }
    mergeHidden = new Set();
    hiddenMask.fill(0);
    hideForMerge();   // (the next 10, if the tool stays chosen)
    Wanderers.forgetBuildings(world);
    paintCave();
    redraw();
    if (caveHandler) caveHandler();
    return true;
  }

  // How many of each merged structure there are.
  function bigCount(kind) {
    if (kind === 'vault') return vaults.length;
    if (kind === 'chamber') return gardens.filter((g) => g.chamber).length;
    if (kind === 'honeypot') return repletes.filter((r) => r.honeypot).length;
    return pens.filter((p) => p.herd).length;
  }

  // ---- Drawing the merged structures ----

  // A Seed Vault: a wall of packed dirt, close in color to the dirt around
  // it, with two rows of five round cells dug into it. Each cell has a
  // little straw and, once a seed is stored, the seed (or ant bread) on it.
  function vaultCell(k) {
    return { x: 2.5 + (k % 5) * 4.8, y: 5 + Math.floor(k / 5) * 9 };
  }

  function paintVault(g, v) {
    const c = BIG.colors;
    const n = BIG.size;
    const dot = (x, y, color) => {
      g.fillStyle = color;
      g.fillRect(v.x + x, v.y + y, 1, 1);
    };
    const inCell = (x, y) => {
      for (let k = 0; k < BIG.vault.slots; k++) {
        const cell = vaultCell(k);
        const u = (x + 0.5 - cell.x) / 2.2;
        const w = (y + 0.5 - cell.y) / 2.6;
        if (u * u + w * w <= 1) return true;
      }
      return false;
    };
    for (let y = 0; y < BIG.vaultHeight; y++) {
      for (let x = 0; x < n; x++) {
        if (inCell(x, y)) dot(x, y, inCell(x, y - 1) ? COLORS.cave : WALLS.ceiling);
        else if (inCell(x, y + 1) || inCell(x + 1, y)) dot(x, y, c.vaultEdge);
        else dot(x, y, hashAt(y * n + x, 9) < 0.08 ? COLORS.speck : c.vaultDirt[Math.floor(hashAt(y * n + x, 5) * 3)]);
      }
    }
    for (let k = 0; k < BIG.vault.slots; k++) {
      const cell = vaultCell(k);
      const cx = Math.floor(cell.x);
      const cy = Math.floor(cell.y);
      for (let x = cx - 1; x <= cx + 1; x++) dot(x, cy + 1, COLORS.straw[(x + k) % COLORS.straw.length]);
    }
    for (const slot of granaries) {
      if (slot.vault !== v || !slot.storedAt) continue;
      const cell = vaultCell(slot.slot);
      const sx = Math.floor(cell.x) - 1;
      const sy = Math.floor(cell.y) - 1;
      const cells = slot.bread
        ? [['#d9b57a', 0, 0], ['#f0d29a', 1, 0], ['#f0d29a', 2, 0], ['#cfb77c', 0, 1], ['#f0d29a', 1, 1], ['#d9b57a', 2, 1]]
        : [['#000000', 0, 0], ['#e8e8e8', 1, 0], ['#000000', 2, 0], ['#000000', 0, 1], ['#9a9a9a', 1, 1], ['#000000', 2, 1]];
      for (const [color, dx, dy] of cells) dot(sx + dx, sy + dy, color);
    }
  }

  function paintChamber(g, garden) {
    for (const [x, y, color] of garden.art[garden.stage]) {
      g.fillStyle = color;
      g.fillRect(garden.x + x, garden.y + y, 1, 1);
    }
  }

  // A Honeypot Chamber: its carpet of repletes, each hanging by its legs
  // from the ceiling, swelling from a small black gaster into a big striped
  // golden one as the chamber fills.
  function paintHoneypot(g, r, now) {
    const c = REPLETE.colors;
    const f = repleteFullness(r, now);
    const dot = (x, y, color) => {
      g.fillStyle = color;
      g.fillRect(r.x + x, r.y + y, 1, 1);
    };
    for (const one of r.layout) {
      const x = one.x;
      for (let i = 0; i < one.len; i++) {
        const o = Math.round(one.lean * i / Math.max(1, one.len));
        dot(x - 1 + o, i, c.leg);
        dot(x + 1 + o, i, c.leg);
      }
      dot(x - 2, 0, c.leg);
      dot(x + 2, 0, c.leg);
      const head = one.len;
      dot(x, head, c.body); dot(x - 1, head, c.body); dot(x + 1, head, c.body); dot(x, head + 1, c.body);
      const top = head + 2;
      const cx = x + 0.5;
      const rx = 0.9 + (one.size - 0.9) * f;
      const ry = 1 + (one.size * 1.15 - 1) * f;
      const cy = top + ry;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
        for (let px = Math.floor(cx - rx); px <= Math.ceil(cx + rx); px++) {
          const u = (px + 0.5 - cx) / rx;
          const v = (y + 0.5 - cy) / ry;
          const d = u * u + v * v;
          if (d > 1.05 || y >= r.h) continue;
          if (f < 0.15) { dot(px, y, c.body); continue; }   // nearly empty: a plain black gaster
          let color = d > 0.6 ? c.edge : c.fill;
          if ((y - top) % 2 === 1 && d < 0.9) color = c.stripe;   // the plates, spread apart
          if (u < -0.15 && v < -0.2 && d < 0.55) color = c.light;
          dot(px, y, color);
        }
      }
    }
  }

  // A Mealybug Herd: mealybugs on the plant matter, white and waxy with
  // grey segment lines and little wax filaments around the edge, which
  // wiggle; now and then one shuffles a pixel. The honeydew drops waiting
  // lie beside them.
  function paintHerd(g, pen) {
    const c = BIG.colors;
    const dot = (x, y, color) => {
      g.fillStyle = color;
      g.fillRect(pen.x + x, pen.y + y, 1, 1);
    };
    for (const bug of pen.bugs) {
      const { x, y } = bug;
      for (let dx = 1; dx <= 4; dx++) { dot(x + dx, y, c.wax); dot(x + dx, y + 2, c.wax); }
      for (let dx = 0; dx <= 5; dx++) dot(x + dx, y + 1, c.wax);
      dot(x + 2, y + 1, c.waxLine);
      dot(x + 4, y + 1, c.waxLine);
      dot(x + 3, y, c.waxShade);
      // Wax filaments around the edge, in one of two poses (the wiggle).
      for (const [dx, dy] of BIG.herd.filaments[bug.pose]) dot(x + dx, y + dy, c.filament);
    }
    for (let k = 0; k < pen.drops; k++) {
      const bug = pen.bugs[k % pen.bugs.length];
      const second = k >= pen.bugs.length;
      const x = bug.home.x + (second ? -2 : 6);
      const y = bug.home.y + (second ? 2 : 1);
      dot(x, y, APHID.drop[0]);
      dot(x, y + 1, APHID.drop[1]);
    }
  }

  // The herd's mealybugs wiggle their filaments, and now and then shuffle a
  // pixel (never more than one from where they started). True if any moved.
  function moveHerd(pen, now) {
    let changed = false;
    for (const bug of pen.bugs) {
      if (now < bug.moveAt) continue;
      bug.pose = 1 - bug.pose;
      if (Math.random() < 0.3) {
        bug.x = Math.max(bug.home.x - 1, Math.min(bug.home.x + 1, bug.x + Math.floor(Math.random() * 3) - 1));
        bug.y = Math.max(bug.home.y - 1, Math.min(bug.home.y + 1, bug.y + Math.floor(Math.random() * 3) - 1));
      }
      bug.moveAt = now + BIG.herd.wiggleMin + Math.random() * (BIG.herd.wiggleMax - BIG.herd.wiggleMin);
      changed = true;
    }
    return changed;
  }



  /* ---------- Coming back after the game was closed ---------- */

  /*
   * The game was closed from `closedAt` until now. Granary seeds that came
   * due, fully grown fungus gardens, and aphids that filled up while it was
   * closed pay only `percent` of their food (0 with no Away level), all at
   * once; each then starts over. Returns the food paid (popup.js adds it).
   */
  function settleAway(closedAt, percent) {
    const now = Date.now();
    const share = Math.max(0, percent) / 100;
    let owed = 0;
    for (const granary of granaries) {
      // A seed already in a granary when it closed, eaten while it was closed.
      if (!granary.storedAt || now - granary.storedAt < GRANARY.eatenAfter) continue;
      owed += (crumbRules.seedFood || GRANARY.food) * (granary.vault ? BIG.vault.food : 1) * (granary.aged ? STASH.agedTimes : 1) * (granary.worth || 1) * depthBonus(granary) * share;
      granary.storedAt = 0;
      granary.aged = false;
        granary.worth = 1;
      granary.bread = false;
    }
    for (const garden of gardens) {
      // Each garden keeps growing on its own from where it was (a stage every
      // aloneMs); one that would have been harvested while closed pays the
      // share once and starts again now. No new growing starts while closed.
      const alone = garden.chamber ? BIG.chamber.aloneMs : (crumbRules.fungusAloneMs || FUNGUS.aloneMs);
      let stage = garden.stage;
      let at = garden.sinceUnknown ? closedAt : Math.min(garden.since || now, now);   // (saved before gardens kept their timer: from when it closed)
      garden.sinceUnknown = false;
      while (stage < 2 && at + alone <= now) {
        at += alone;
        stage += 1;
      }
      const ripe = stage === 2 ? at + FUNGUS.ripeMs : Infinity;
      if (ripe <= now) {
        owed += (crumbRules.seedFood || FUNGUS.food) * (garden.chamber ? BIG.chamber.pays : 1) * (1 + (garden.bonus || 0)) * (crumbRules.fungusWorth || 1) * share;
        garden.stage = 0;
        garden.bonus = 0;
        garden.grewAt = now;
        garden.since = now;
        garden.ripeAt = 0;
      } else {
        garden.stage = stage;
        garden.since = at;
        if (stage === 2) garden.ripeAt = ripe;
      }
    }
    for (const pen of pens) {
      if (pen.herd) {
        // The drops a herd made while closed (up to the most it holds) pay the share.
        const made = Math.min(BIG.herd.most - pen.drops, Math.max(0, Math.floor((now - closedAt) / BIG.herd.dropMs)));
        owed += made * APHID.food * share;
        pen.dropAt = now + BIG.herd.dropMs;
        continue;
      }
      const fullAt = pen.fillStart + APHID.fillMs;
      if (fullAt <= closedAt || fullAt > now) continue;   // full before it closed (still waiting to be milked), or not full yet
      owed += APHID.food * share;
      pen.fillStart = now;
      pen.showsDrop = false;
    }
    if (caveHandler) caveHandler();
    redraw();
    return Math.floor(owed);
  }

  // Repaint the cave from the list of dug-out pixels, with any pheromone
  // trail a shade off the tunnel color. The yellow Build-menu view of the
  // trail goes on its own layer.
  // On the middens: broken seed shells (more at each quarter full) and the
  // bodies dropped there, on their backs, until the pile empties.
  function paintMiddenBits(g) {
    for (const pile of piles) {
      const quarters = Math.floor(pileFull(pile) * 4 + 1e-9);
      if (quarters <= 0) continue;
      const shown = Math.ceil(pile.husks.length * quarters / 4);
      for (let n = 0; n < shown; n++) {
        const i = pile.husks[n];
        if (hiddenMask[i]) continue;
        Sprites.paintTurned(g, hashAt(i, 11) < 0.5 ? 'seedShell' : 'seedBits', i % cols, Math.floor(i / cols), hashAt(i, 12) < 0.5 ? 'left' : 'right', false);
      }
    }
    for (const body of middenBodies) {
      if (hiddenMask[body.i]) continue;
      Sprites.paintTurned(g, body.marauder ? 'walkerMarauder' : 'fireAnt', body.i % cols, Math.floor(body.i / cols), body.face, true);
    }
  }

  function paintCave() {
    const g = caveLayer.getContext('2d');
    const m = trailMarkLayer.getContext('2d');
    g.clearRect(0, 0, cols, rows);
    m.clearRect(0, 0, cols, rows);
    m.fillStyle = COLORS.trailShown;
    for (let y = ground; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!open[i]) continue;
        if (hiddenMask[i]) {
          g.fillStyle = COLORS.cave;   // a structure hidden while a merge is placed
        } else if (granaryMask[i] === 2) {
          // Straw bedding: strands in a few shades.
          g.fillStyle = COLORS.straw[Math.floor(hashAt(i, 2) * COLORS.straw.length)];
        } else if (penMask[i]) {
          // Plant matter for the aphid: small dark green bits on the tunnel color.
          const roll = hashAt(i, 1);
          g.fillStyle = roll < APHID.plantChance / 2 ? COLORS.plantDark : roll < APHID.plantChance ? COLORS.plant : COLORS.cave;
        } else if (midden[i]) {
          // A shade darker than the tunnel, gathering refuse as it fills.
          const pile = piles[middenLabel[i] - 1];
          const covered = pile ? pileFull(pile) * MIDDEN.refuseMost : 0;
          g.fillStyle = hashAt(i, 4) < covered ? COLORS.middenRefuse[Math.floor(hashAt(i, 6) * COLORS.middenRefuse.length)] : COLORS.midden;
        } else if (trail[i]) {
          g.fillStyle = speckAt(i) ? COLORS.trailSpeck : COLORS.trail;
          m.fillRect(x, y, 1, 1);
        } else if (LOOK.walls && y > ground && isDirtAt(x, y - 1)) {
          g.fillStyle = WALLS.ceiling;   // the shadow under a ceiling
        } else if (LOOK.walls && isDirtAt(x, y + 1)) {
          g.fillStyle = WALLS.floor;     // the floor ants walk on
        } else {
          g.fillStyle = COLORS.cave;
        }
        g.fillRect(x, y, 1, 1);
      }
    }
    paintMiddenBits(g);
    // Nurseries: a low pile of dark trophic eggs on the floor.
    const pile = Sprites.sizeOf('nursery');
    for (const n of nurseries) Sprites.paint(g, 'nursery', n.x + Math.floor((GRANARY.width - pile.cols) / 2), n.y + GRANARY.space - pile.rows);
    // (The caterpillar is drawn with the moving things, for its ripple: redraw.)
    if (!LOOK.rim) return;
    // A rim of packed dirt: every dirt pixel beside a tunnel, a little darker.
    g.fillStyle = WALLS.rim;
    for (let y = ground; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (open[i]) continue;
        if ((x > 0 && open[i - 1]) || (x < cols - 1 && open[i + 1]) || (y > ground && open[i - cols]) || (y < rows - 1 && open[i + cols])) g.fillRect(x, y, 1, 1);
      }
    }
  }

  // Solid dirt at (x, y), for LOOK.walls (outside the field counts as dirt).
  function isDirtAt(x, y) {
    if (y >= rows || x < 0 || x >= cols) return true;
    return y >= ground && !open[y * cols + x];
  }

  // Repaint the band that shows where the current tool can be used: every
  // pixel it would change in any square, including squares that hang partly
  // over ground it can't touch. For the small dig tool this is the dirt
  // within two pixels of a tunnel.
  function paintBand() {
    const g = bandLayer.getContext('2d');
    g.clearRect(0, 0, cols, rows);
    if (!tool || tool === 'trail' || tool === 'midden' || tool === 'aphid' || tool === 'granary' || tool === 'nursery' || tool === 'caterpillar' || tool === 'fungus' || tool === 'replete' || tool === 'delete' || BIG.kinds.includes(tool)) return;   // these go on tunnel, which is easy to see

    const marked = new Uint8Array(cols * rows);
    for (let y0 = ground - size + 1; y0 < rows; y0++) {
      for (let x0 = -size + 1; x0 < cols; x0++) {
        for (const i of reach(tool, x0, y0, size)) marked[i] = 1;
      }
    }

    g.fillStyle = tool === 'dig' ? COLORS.diggable : COLORS.fillable;
    for (let y = ground; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (marked[y * cols + x]) g.fillRect(x, y, 1, 1);
      }
    }
  }

  // Narrow tunnels: an open pixel whose stretch of tunnel, straight across
  // or straight up and down through it, is NARROW pixels or fewer (a passage
  // or a small room). Ants walk faster there (ants.js).
  const NARROW = 10;
  let narrowMask = null;
  function markNarrow() {
    narrowMask = new Uint8Array(cols * rows);
    const across = new Uint16Array(cols * rows);
    for (let y = ground; y < rows; y++) {
      let x = 0;
      while (x < cols) {
        if (!open[y * cols + x]) { x++; continue; }
        const start = x;
        while (x < cols && open[y * cols + x]) x++;
        for (let k = start; k < x; k++) across[y * cols + k] = x - start;
      }
    }
    for (let x = 0; x < cols; x++) {
      let y = ground;
      while (y < rows) {
        if (!open[y * cols + x]) { y++; continue; }
        const start = y;
        while (y < rows && open[y * cols + x]) y++;
        for (let k = start; k < y; k++) {
          const i = k * cols + x;
          if (Math.min(across[i], y - start) <= NARROW) narrowMask[i] = 1;
        }
      }
    }
  }

  // Call after the dug-out pixels change.
  function caveChanged() {
    buildSums();
    markNarrow();
    if (midden) middenChanged();
    newPixels = [];
    openPixels = [];
    for (let i = 0; i < open.length; i++) {
      if (!open[i]) continue;
      openPixels.push(i);
      if (!startMask[i]) newPixels.push(i);
    }
    extraDug = newPixels.length;
    visitMaps = new Map();
    distances = {};
    caveStamp++;
    paintCave();
    if (!stroke) paintBand();   // during a drag the band is redrawn once, at the end
    redraw();
  }

  // Use a tool, then drop any stored seed (STASH) now buried by a fill or
  // covered by a structure.
  function applyTool(which, pixels) {
    applyToolHere(which, pixels);
    const before = stash.length;
    stash = stash.filter((item) => {
      const i = item.y * cols + item.x;
      return open[i] && !penMask[i] && !granaryMask[i] && !fungusMask[i] && !repleteMask[i];
    });
    if (stash.length !== before) redraw();
  }

  // Dig out or fill in a list of pixels (from reach).
  function applyToolHere(which, pixels) {
    if (which === 'trail') {
      for (const i of pixels) trail[i] = 1;
      paintCave();
      redraw();
      return;
    }
    if (which === 'aphid') {
      addPen(pixels[0] % cols, Math.floor(pixels[0] / cols));
      paintCave();
      redraw();
      return;
    }
    if (which === 'fungus') {
      addGarden(pixels[0] % cols, Math.floor(pixels[0] / cols), 0, undefined, undefined, lastPoint);   // on the surface nearest the mouse
      redraw();
      return;
    }
    if (which === 'midden') {
      for (const i of pixels) { midden[i] = 1; trail[i] = 0; }
      middenChanged();
      paintCave();
      redraw();
      return;
    }
    if (which === 'eraseTrail') {   // a trash-can drag: trail and midden only
      let piled = false;
      for (const i of pixels) { if (midden[i]) piled = true; trail[i] = 0; midden[i] = 0; }
      if (piled) middenChanged();
      lastDeleted = { kind: 'trail', x: pixels[0] % cols + TRAIL.size / 2, y: Math.floor(pixels[0] / cols) };
      paintCave();
      redraw();
      return;
    }
    if (which === 'delete') {
      lastDeleted = null;
      if (deleteStructure(pixels[0])) return;
      lastDeleted = { kind: 'trail', x: pixels[0] % cols + TRAIL.size / 2, y: Math.floor(pixels[0] / cols) };
      let piled = false;
      for (const i of pixels) { if (midden[i]) piled = true; trail[i] = 0; midden[i] = 0; }   // pheromone trail and midden
      if (piled) middenChanged();
      paintCave();
      redraw();
      return;
    }
    if (which === 'replete') {
      addReplete(pixels[0] % cols, Math.floor(pixels[0] / cols), 0);
      redraw();
      return;
    }
    if (which === 'granary') {
      addGranary(pixels[0] % cols, Math.floor(pixels[0] / cols));
      moveStashOff();
      paintCave();
      redraw();
      return;
    }
    if (which === 'nursery') {
      addNursery(pixels[0] % cols, Math.floor(pixels[0] / cols));
      moveStashOff();
      paintCave();
      redraw();
      return;
    }
    if (which === 'caterpillar') {
      addCaterpillar(pixels[0] % cols, Math.floor(pixels[0] / cols));
      moveStashOff();
      paintCave();
      redraw();
      return;
    }
    if (BIG.kinds.includes(which)) {
      mergeInto(which, pixels[0] % cols, Math.floor(pixels[0] / cols), mergeCount);
      return;
    }
    for (const i of pixels) {
      open[i] = which === 'dig' ? 1 : 0;
      if (which === 'fill') { trail[i] = 0; midden[i] = 0; }   // filled-in ground loses its trail and midden
    }
    if (which === 'dig') clearCrumbs();
    caveChanged();
  }

  /* ---------- Walking ants ---------- */

  // How far each kind of walking ant reaches from its middle, so it doesn't
  // overlap the queen. A worker is 8 by 4 pixels; a soldier is 16 by 9.
  const WALKER_REACH = { worker: { x: 4, y: 2 }, soldier: { x: 8, y: 5 }, fire: { x: 4, y: 2 } };

  // The row workers walk along when they are up on the grass.
  function surfaceRow() {
    return ground - 3;
  }

  // Would an ant standing at (x, y) touch the queen?
  function touchesQueen(kind, x, y) {
    const reach = WALKER_REACH[kind];
    const queen = Sprites.sizeOf('queen');
    const left = center.x + QUEEN_LEFT;
    const bottom = center.y + CAVE.floor;
    return x >= left - reach.x && x <= left + queen.cols - 1 + reach.x &&
           y >= bottom - queen.rows + 1 - reach.y && y <= bottom + reach.y;
  }

  // Up on the grass: the walking row, and the open air above a tunnel
  // opening that leads up to it.
  function isOutdoors(x, y) {
    if (x < 4 || x >= cols - 4) return false;
    if (y === surfaceRow()) return true;
    return y > surfaceRow() && y < ground && openIn(x - 1, ground, 3, 1) === 3;
  }

  // Is (x, y) right beside the space kept clear around the queen? Workers
  // bringing her food stop there.
  function besideQueen(x, y) {
    const reach = WALKER_REACH.worker;
    const queen = Sprites.sizeOf('queen');
    const left = center.x + QUEEN_LEFT - reach.x;
    const right = center.x + QUEEN_LEFT + queen.cols - 1 + reach.x;
    const bottom = center.y + CAVE.floor + reach.y;
    const top = center.y + CAVE.floor - queen.rows + 1 - reach.y;
    return x >= left - 2 && x <= right + 2 && y >= top - 2 && y <= bottom + 2;
  }

  // Distances from the surface, from the main chamber, and from the queen,
  // for workers going up, coming back, and bringing food. Worked out when
  // first needed after the cave changes.
  let distances = {};
  let caveStamp = 0;        // goes up whenever the tunnels change

  // Steps from every place a `kind` of ant can stand to the nearest of the
  // `seeds` (positions in the `open` list), or -1 where there is no way.
  function spread(seeds, kind, outdoors, passing) {
    const dist = new Int32Array(cols * rows).fill(-1);
    const queue = [];
    for (const i of seeds) {
      dist[i] = 0;
      queue.push(i);
    }
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const x = i % cols;
      const y = (i - x) / cols;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (dist[n] >= 0 || !world.canStand(kind, nx, ny, outdoors, passing)) continue;
        dist[n] = dist[i] + 1;
        queue.push(n);
      }
    }
    return dist;
  }

  // Distances to a place an ant is visiting: { x, y }, for one kind of ant.
  function visitMap(spot, kind) {
    const key = kind + ':' + spot.x + ',' + spot.y;
    if (visitMaps.has(key)) return visitMaps.get(key);
    if (visitMaps.size >= 40) visitMaps.clear();
    const map = spread([spot.y * cols + spot.x], kind, false, true);   // ants may pass the queen on the way
    visitMaps.set(key, map);
    return map;
  }

  function distanceMap(goal) {
    if (distances[goal]) return distances[goal];
    const seeds = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let isGoal;
        if (goal === 'surface') isGoal = y === surfaceRow() && world.canStand('worker', x, y, true);
        else if (goal === 'queen') isGoal = besideQueen(x, y) && world.canStand('worker', x, y, false);
        else isGoal = chamber[y * cols + x] === 1 && world.canStand('worker', x, y, false);
        if (isGoal) seeds.push(y * cols + x);
      }
    }
    distances[goal] = spread(seeds, 'worker', true);
    return distances[goal];
  }

  // What the walking ants need to know about the ground.
  const world = {
    // Can an ant of this kind stand with its middle at (x, y)? Workers fit
    // the tunnels, and may go up on the grass when `outdoors` is true.
    // Soldiers need room to turn around, which means chambers. Neither may
    // touch the queen, except an ant `passing` her on the way somewhere.
    // A soldier on a trip to the surface squeezes through the tunnels like a worker.
    canStand(kind, x, y, outdoors, passing) {
      if (flooded(x, y)) return false;   // rain: the lowest tunnels are under water
      if (kind === 'beetle') return beetleRoom(x, y) && !touchesQueen('worker', x, y);   // the rove beetle: never touching the dirt
      if (!passing && touchesQueen(kind, x, y)) return false;
      if (kind === 'soldier' && !outdoors) return openIn(x - 8, y - 4, 16, 9) >= 135;
      if (y < ground) return !!outdoors && isOutdoors(x, y);
      return isOpen(x, y) && openIn(x - 1, y - 1, 3, 3) >= 6;
    },
    // Is there clear room all around an ant at (x, y), so it isn't touching
    // a wall? Ants keep to such places when they can.
    clear(kind, x, y) {
      if (kind === 'soldier' || y < ground) return true;
      return openIn(x - 2, y - 2, 4, 4) === 16;
    },
    // How much open space is around (x, y): more is better.
    room(kind, x, y) {
      if (y < ground) return 16;
      if (kind === 'soldier') return Math.max(openIn(x - 8, y - 4, 16, 9) / 9, openIn(x - 2, y - 2, 4, 4));
      return y < ground ? 16 : openIn(x - 2, y - 2, 4, 4);
    },
    // Steps from (x, y) to the goal, or -1 if there is no way. The goal is
    // 'surface', 'home' or 'queen' (for workers), or a place { x, y } that
    // an ant of this `kind` is visiting.
    distance(goal, x, y, kind) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return -1;
      const map = typeof goal === 'string' ? distanceMap(goal) : visitMap(goal, kind || 'worker');
      return map[y * cols + x];
    },
    // Somewhere for an ant of this kind to go and look around: usually in
    // ground the player has dug, otherwise anywhere dug out. Null if nowhere.
    destination(kind) {
      const pools = Math.random() < 0.85 ? [newPixels, openPixels] : [openPixels];
      for (const pool of pools) {
        for (let tries = 0; tries < 40 && pool.length > 0; tries++) {
          const i = pool[Math.floor(Math.random() * pool.length)];
          const x = i % cols;
          const y = (i - x) / cols;
          if (world.canStand(kind, x, y, false) && !(kind === 'soldier' && world.onAlate(x, y)) && !world.nearMidden(x, y)) return { x, y };   // (soldiers don't pick the alate's spot; nobody picks the midden)
        }
      }
      return null;
    },
    // Somewhere far across the nest from (x, y) that an ant of this kind can
    // walk to: the farthest of a dozen random places underground. For explorers.
    farSpot(kind, x, y) {
      const options = [];
      for (let tries = 0; tries < 80 && options.length < 12 && openPixels.length > 0; tries++) {
        const i = openPixels[Math.floor(Math.random() * openPixels.length)];
        const sx = i % cols;
        const sy = (i - sx) / cols;
        if (sy >= ground && world.canStand(kind, sx, sy, false) && !(kind === 'soldier' && world.onAlate(sx, sy)) && !world.nearMidden(sx, sy)) options.push({ x: sx, y: sy });
      }
      const far = (spot) => (spot.x - x) ** 2 + (spot.y - y) ** 2;
      options.sort((a, b) => far(b) - far(a));
      for (const spot of options.slice(0, 3)) {
        if (world.distance(spot, x, y, kind) > 0) return spot;
      }
      return null;
    },
    // Somewhere to start: in the main chamber if possible, else anywhere open.
    randomSpot(kind) {
      for (let tries = 0; tries < 200; tries++) {
        const x = center.x - CAVE.halfWidth + Math.floor(Math.random() * CAVE.halfWidth * 2);
        const y = center.y - CAVE.roof + Math.floor(Math.random() * (CAVE.roof + CAVE.floor + 1));
        if (world.canStand(kind, x, y) && !world.nearMidden(x, y)) return { x, y };   // (not by the midden, if there is anywhere else)
      }
      for (let tries = 0; tries < 400; tries++) {
        const x = Math.floor(Math.random() * cols);
        const y = ground + Math.floor(Math.random() * (rows - ground));
        if (world.canStand(kind, x, y)) return { x, y };
      }
      return null;
    },
    // The crumbs lying on the grass: [{ id, left, right }], nearest to `x` first if given.
    crumbs(x) {
      const list = [];
      crumbs.forEach((crumb, id) => {
        const box = crumbBox(crumb);
        if (box) list.push({ id, left: box.left, right: box.right });
      });
      if (x !== undefined) {
        const off = (c) => Math.abs((c.left + c.right) / 2 - x);
        list.sort((a, b) => off(a) - off(b));
      }
      return list;
    },
    // How much each pixel of crumb `id` is worth (a fruit: FRUIT.worth).
    crumbWorthOf(id) {
      return (crumbs[id] && crumbs[id].worth) || 1;
    },
    // Take up to `count` pixels off crumb `id`. Returns their colors.
    takeCrumb(id, count) {
      return crumbs[id] ? takeFromCrumb(crumbs[id], count) : [];
    },
    // Slide crumb `id` one pixel along the grass (a soldier pushing it).
    // Returns false if it can't go that way.
    pushCrumb(id, dx) {
      if (!world.canPushCrumb(id, dx)) return false;
      crumbs[id].x += dx;
      crumbChanged();
      return true;
    },
    // Could crumb `id` slide one pixel along the grass by dx? Not off the
    // edge, into the tunnel opening, or into another crumb.
    canPushCrumb(id, dx) {
      const crumb = crumbs[id];
      if (!crumb || crumb.respawnAt) return false;
      const width = Sprites.sizeOf('crumb').cols;
      const x = crumb.x + dx;
      const opening = tunnelX(ground);
      if (x < 2 || x + width > cols - 2) return false;
      if (x + width > opening - CAVE.tunnelWidth && x < opening + CAVE.tunnelWidth) return false;
      return !crumbs.some((other) => other !== crumb && !other.respawnAt &&
        x < other.x + width + 2 && x + width + 2 > other.x);
    },
    // The seeds on the grass: [{ id, x }] with x their middle.
    seeds() {
      const half = Sprites.sizeOf('seed').cols / 2;
      const now = Date.now();
      return seeds.filter((s) => !s.fly || now >= s.fly.end).map((s) => ({ id: s.id, x: s.x + half, kind: s.kind }));
    },
    // For achievements: something the ants did ('pin': soldiers holding down an army ant).
    noteEvent(name, value) { note(name, value); },
    // What kind of seed `id` is (see Sprites.SEEDS).
    seedKind(id) {
      const seed = seeds.find((s) => s.id === id);
      return seed ? Sprites.seedKind(seed.kind) : 'sunflower';
    },
    seedById(id) {
      return world.seeds().find((s) => s.id === id) || null;
    },
    // How many granaries could take a seed now.
    freeGranaries() {
      const now = Date.now();
      const free = granaries.filter((granary) => granaryFree(granary, now)).length;
      return free + (stashRoom() ? STASH.most - stash.length : 0);   // room on the tunnel floors too (STORE, or every granary full)
    },
    seedReach() {
      return SEED.reach + Math.floor(Sprites.sizeOf('seed').cols / 2);
    },
    seedColors(kind) {
      return Sprites.seedColors(kind);
    },
    // Pick up seed `id`. True if it was there.
    takeSeed(id) {
      const n = seeds.findIndex((s) => s.id === id);
      if (n < 0) return false;
      const worth = seeds[n].worth || 1;
      seeds.splice(n, 1);
      if (caveHandler) caveHandler();
      return worth;   // (a sunflower seed is worth more; at least 1, so true)
    },
    // Hold a free granary for a worker bringing a seed: { id, x, y } to walk to, or null.
    // `granaryOnly`: a granary even on STORE (a stored seed being brought in).
    reserveGranary(granaryOnly) {
      if (crumbRules.storeSeeds && !granaryOnly) {   // STORE: a spot on a tunnel floor instead...
        const spot = stashSpot();
        if (spot) return spot;       // ...or, with no room for one, a granary as usual
      }
      const now = Date.now();
      let id = granaries.findIndex((granary) => granary.vault && granaryFree(granary, now));   // a Seed Vault first
      if (id < 0) id = granaries.findIndex((granary) => granaryFree(granary, now));
      if (id < 0) return granaryOnly ? null : stashSpot();   // every granary full: set it down by the flag (moved to a granary once one is free)
      const granary = granaries[id];
      granary.reservedAt = now;
      return { id, x: granary.x + GRANARY.width / 2, y: granary.y + GRANARY.space - 2 };
    },
    // Put the seed in the granary.
    storeSeed(id, visit) {
      if (id === 'stash') {   // STORE: set it down on the tunnel floor
        if (visit) stashHeld = stashHeld.filter((held) => held.x !== visit.floorX || held.y !== visit.floorY);
        if (visit && stash.length < STASH.most) {
          // Set down where it was meant to go, or off it (half the time: 2 pixels
          // or, as often, 1), so they don't line up too neatly.
          let x = visit.floorX || visit.x, y = visit.floorY || visit.y;
          if (Math.random() < 0.5) {
            const step = Math.random() < 0.5 ? STASH.shift : 1;
            const [dx, dy] = [[step, 0], [-step, 0], [0, step], [0, -step]][Math.floor(Math.random() * 4)];
            if (storeSpotAt((y + dy) * cols + x + dx)) { x += dx; y += dy; }
          }
          stash.push({ id: ++lastStashId, x, y, at: Date.now(), worth: visit.worth || 1, kind: Sprites.seedKind(visit.kind) });
          keeperWaste();
        }
        note('seed');
        redraw();
        if (caveHandler) caveHandler();
        return;
      }
      const granary = granaries[id];
      if (!granary) return;
      granary.storedAt = Date.now();
      granary.reservedAt = 0;
      granary.bread = false;
      granary.aged = !!(visit && visit.aged);   // ant bread from the tunnel floor (Seed keepers): pays 2x
      granary.worth = (visit && visit.worth) || 1;   // a sunflower seed: more
      granary.kind = Sprites.seedKind(visit && visit.kind);
      if (!(visit && visit.fromStash)) keeperWaste();   // (a stored seed moved to a granary was counted when it was stored)
      note('seed');
      redraw();
      if (caveHandler) caveHandler();
    },
    // Granaries free for a seed now, whatever the seed setting.
    granariesFree() {
      const now = Date.now();
      return granaries.filter((granary) => granaryFree(granary, now)).length;
    },
    // Stored seeds no worker is on the way to (`claimed`: ids taken), each
    // with a place to stand by it: [{ id, x, y }]. None on STORE.
    stashJobs(claimed) {
      if (crumbRules.storeSeeds) return [];
      const jobs = [];
      for (const item of stash) {
        if (claimed.has(item.id)) continue;
        if (!item.stand || item.standFor !== caveStamp) {
          item.stand = world.nearestStand('worker', item.x, item.y - 1, 8);
          item.standFor = caveStamp;
        }
        if (item.stand) jobs.push({ id: item.id, x: item.stand.x, y: item.stand.y });
      }
      return jobs;
    },
    // A worker picks up stored seed `id`: { aged } (Seed keepers' ant bread), or null if it is gone.
    takeStash(id) {
      const n = stash.findIndex((item) => item.id === id);
      if (n < 0) return null;
      const item = stash.splice(n, 1)[0];
      redraw();
      if (caveHandler) caveHandler();
      return { aged: crumbRules.seedAgeMs > 0 && Date.now() - item.at >= crumbRules.seedAgeMs, worth: item.worth || 1, kind: Sprites.seedKind(item.kind) };
    },
    releaseGranary(id) {
      if (id === 'stash') return;
      if (granaries[id]) granaries[id].reservedAt = 0;
    },
    // Is (x, y) touching the Seed Vault granary `id` is a slot of? A worker
    // can drop its seed in from any edge.
    atVault(id, x, y) {
      const v = granaries[id] && granaries[id].vault;
      return !!v && x >= v.x - 2 && x <= v.x + BIG.size + 1 && y >= v.y - 2 && y <= v.y + BIG.vaultHeight + 1;
    },
    // Is (x, y) in a narrow tunnel (see NARROW)?
    inNarrow(x, y) {
      return !!narrowMask && inDirt(x, y) && narrowMask[y * cols + x] === 1;
    },
    // Is (x, y) on pheromone trail?
    onTrail(x, y) {
      return inDirt(x, y) && trail[y * cols + x] === 1;
    },
    trailSpeed() {
      return TRAIL.speed;
    },
    // The column where the tunnel comes out on the grass.
    opening() {
      return tunnelX(ground);
    },
    // The top row of the ant hill around the nest hole.
    hillTop() {
      return ground - HILL.height;
    },
    // Is row y above the ground (on the grass)?
    aboveGround(y) {
      return y < ground;
    },
    // How fast workers go for the crumb, and how much they carry: { speed, carryMin, carryMax }.
    crumbRules() {
      return crumbRules;
    },
    // ---- Fire ant raids ----
    // Where a raid comes in: `count` places along the grass at one edge
    // (`side` 'left' or 'right', or either), in a line, the first nearest
    // the tunnel. [{ x, y, facing }]
    raidEntry(count, side) {
      const fromLeft = side ? side === 'left' : Math.random() < 0.5;
      const list = [];
      for (let n = 0; n < count; n++) {
        const back = (count - 1 - n) * 9;
        list.push({ x: fromLeft ? 6 + back : cols - 7 - back, y: surfaceRow(), facing: fromLeft ? 'right' : 'left' });
      }
      return list.reverse();
    },
    // Granaries holding a seed or ant bread, for fire ants: [{ id, x, y, vault }] to walk to.
    // What marauders can rob: granaries with a seed, aphids with any honeydew
    // (herds with drops) and repletes holding crumb, each with a place to
    // stand by it: [{ kind, id, x, y }].
    raidStores() {
      const now = Date.now();
      const stores = [];
      granaries.forEach((granary, id) => {
        if (granary.storedAt) stores.push({ kind: 'granary', id, x: granary.x + GRANARY.width / 2, y: granary.y + GRANARY.space - 2 });
      });
      const standBy = (thing, n, h) => world.nearestStand('worker', thing.x + n / 2, thing.y + (h || n) / 2);
      pens.forEach((pen, id) => {
        if (pen.herd ? pen.drops <= 0 : now - pen.fillStart < APHID.fillMs / 4) return;
        const spot = standBy(pen, pen.size || APHID.size);
        if (spot) stores.push({ kind: 'pen', id, x: spot.x, y: spot.y });
      });
      repletes.forEach((r, id) => {
        if (!(r.crumbs > 0)) return;
        const spot = standBy(r, r.size || REPLETE.size, r.h);
        if (spot) stores.push({ kind: 'replete', id, x: spot.x, y: spot.y });
      });
      return stores;
    },
    // A marauder robs one of raidStores(). True if there was something to take.
    raidStore(target) {
      if (target.kind === 'granary') return world.raidGranary(target.id);
      if (target.kind === 'pen') {
        const pen = pens[target.id];
        if (!pen) return false;
        if (pen.herd) { if (pen.drops <= 0) return false; pen.drops = 0; pen.dropAt = Date.now() + BIG.herd.dropMs; }
        else { pen.fillStart = Date.now(); pen.showsDrop = false; }
        popText('Honeydew stolen!', 'pop-steal', target.x, target.y - 6);
      } else if (target.kind === 'replete') {
        const r = repletes[target.id];
        if (!r || !(r.crumbs > 0)) return false;
        r.crumbs = 0;
        popText('Crumb stolen!', 'pop-steal', target.x, target.y - 6);
      } else {
        return false;
      }
      redraw();
      if (caveHandler) caveHandler();
      return true;
    },
    raidGranaries() {
      const full = [];
      granaries.forEach((granary, id) => {
        if (granary.storedAt) full.push({ id, x: granary.x + GRANARY.width / 2, y: granary.y + GRANARY.space - 2, vault: !!granary.vault });
      });
      return full;
    },
    // Full aphids (and herds with enough drops) no worker is on the way to
    // yet, nor to one near enough to milk them too: [{ id, x, y }] with a
    // place to stand by each. `claimed`: ids taken.
    aphidJobs(claimed) {
      const now = Date.now();
      const jobs = [];
      const middle = (pen) => ({ x: pen.x + (pen.size || APHID.size) / 2, y: pen.y + (pen.size || APHID.size) / 2 });
      const coming = [...claimed].filter((id) => pens[id]).map((id) => middle(pens[id]));   // a worker on its way milks these too
      pens.forEach((pen, id) => {
        if (claimed.has(id) || !aphidFull(pen, now)) return;
        const m = middle(pen);
        if (coming.some((c) => Math.hypot(c.x - m.x, c.y - m.y) <= APHID.reach)) return;
        if (!pen.stand || pen.standFor !== caveStamp) {
          const n = pen.size || APHID.size;
          pen.stand = world.nearestStand('worker', pen.x + n / 2, pen.y + n / 2);
          pen.standFor = caveStamp;
        }
        if (pen.stand) jobs.push({ id, x: pen.stand.x, y: pen.stand.y });
      });
      return jobs;
    },
    // A worker milks aphid `id`, and every other full aphid within APHID.reach of it.
    milkAphids(id) {
      const first = pens[id];
      const now = Date.now();
      if (!first || !aphidFull(first, now)) return 0;
      const middle = (pen) => ({ x: pen.x + (pen.size || APHID.size) / 2, y: pen.y + (pen.size || APHID.size) / 2 });
      const at = middle(first);
      let food = 0;
      for (const pen of pens) {
        if (!aphidFull(pen, now)) continue;
        const m = middle(pen);
        if (pen !== first && Math.hypot(m.x - at.x, m.y - at.y) > APHID.reach) continue;
        food += milkOne(pen, now);
      }
      popText('+' + food + ' Food', 'pop-queen', at.x, first.y - 1);
      if (foodHandler) foodHandler(food, 'aphid');
      redraw();
      if (caveHandler) caveHandler();
      return food;
    },
    // A fire ant takes seed `id` off the grass. True if it was there.
    raidSeed(id) {
      const seed = world.seedById(id);
      if (!seed || !world.takeSeed(id)) return false;
      popText('Seed stolen!', 'pop-steal', seed.x, crumbBottom() - 6);
      redraw();
      return true;
    },
    // A fire ant carrying a seed was beaten: the seed is dropped. On the grass
    // it lands where the fire ant fell; in the nest it goes back into an
    // empty granary (or, with none, out onto the grass).
    dropSeed(x, up) {
      const width = Sprites.sizeOf('seed').cols;
      const now = Date.now();
      let spot = null;
      if (up) {
        spot = Math.max(0, Math.min(cols - width, Math.round(x - width / 2)));
      } else {
        const granary = granaries.find((one) => granaryFree(one, now));
        if (granary) {
          granary.storedAt = now;
          granary.bread = false;
          granary.aged = false;
        granary.worth = 1;
          granary.kind = Sprites.pickSeed();
          popText('Seed saved!', 'pop-queen', granary.x + GRANARY.width / 2, granary.y + GRANARY.space - GRANARY.height - 2);
          redraw();
          if (caveHandler) caveHandler();
          return;
        }
        spot = seedSpot();
      }
      if (spot === null) return;
      seeds.push({ id: ++lastSeedId, x: spot, kind: Sprites.pickSeed() });
      redraw();
      if (caveHandler) caveHandler();
    },
    // A fire ant takes what is in granary `id`. True if there was something.
    raidGranary(id) {
      const granary = granaries[id];
      if (!granary || !granary.storedAt) return false;
      granary.storedAt = 0;
      granary.bread = false;
      granary.aged = false;
        granary.worth = 1;
      popText('Seed stolen!', 'pop-steal', granary.x + GRANARY.width / 2, granary.y + GRANARY.space - GRANARY.height - 2);
      redraw();
      if (caveHandler) caveHandler();
      return true;
    },
    // A fire ant reached the queen: popup.js takes some food. Invaders bite
    // her `times` times at once, shown as one loss.
    raidQueen(x, y, times = 1) {
      let lost = 0;
      for (let n = 0; n < times && raidHandler; n++) lost += raidHandler();
      if (lost <= 0) return;
      const queen = Sprites.sizeOf('queen');
      popText('-' + lost + ' Food', 'pop-steal', center.x + QUEEN_LEFT + Math.floor(queen.cols / 2), center.y + CAVE.floor - queen.rows - 1);
    },
    // A soldier fell at (x, y): popup.js takes its cost, shown rising from it.
    soldierFell(x, y) {
      const lost = fallHandler ? fallHandler() : 0;
      if (lost > 0) popText('-' + lost + ' Food', 'pop-steal', x, y - 6);
    },
    // The edge of the grass a fleeing fire ant leaves by: the side it is on.
    raidExit(x) {
      return x < tunnelX(ground) ? 5 : cols - 6;
    },
    // Where a fallen soldier is brought to heal: beside the brood.
    broodSpot() {
      const floorY = center.y + CAVE.floor;
      // By the first egg spot, clear of the alate resting further right.
      return world.nearestStand('worker', center.x + BROOD_SPOTS[0] + 3, floorY - 1) || { x: center.x, y: floorY - 1 };
    },
    // The nearest place to (x, y) where an ant of this kind can stand in
    // the nest, within `reach` pixels. Null if none.
    nearestStand(kind, x, y, reach = 24) {
      x = Math.round(x);
      y = Math.round(y);
      for (let r = 0; r <= reach; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const sx = x + dx;
            const sy = y + dy;
            if (sy >= ground && world.canStand(kind, sx, sy, false)) return { x: sx, y: sy };
          }
        }
      }
      return null;
    },
    // A worker has brought `count` pixels of crumb to the queen.
    // Would a soldier with its middle at (x, y) be standing on the alate
    // resting behind the eggs: its middle over her body? (False when she
    // isn't there.) Its legs may overlap her; the chamber is too small otherwise.
    onAlate(x, y) {
      if (!alateHome || alate) return false;
      const art = Sprites.sizeOf('alateCrawl1');
      const ax = center.x + ALATE.home;
      const bottom = center.y + CAVE.floor;
      return x >= ax - art.cols / 2 && x <= ax + art.cols / 2 && y >= bottom - art.rows - 2 && y <= bottom + 2;
    },
    // The middle of the resting alate, across.
    alateX() {
      return center.x + ALATE.home;
    },
    // A fungus garden a worker carrying crumb could feed: { id, x, y } to
    // walk to, or null. `busy` counts the workers already on their way to
    // each garden ({ id: count }); a garden needs (2 - stage) more feedings.
    fungusTarget(busy) {
      const open = [];
      gardens.forEach((garden, id) => {
        if (garden.stage < 2 && (busy[id] || 0) < 2 - garden.stage) open.push(id);
      });
      if (open.length === 0) return null;
      const id = open[Math.floor(Math.random() * open.length)];
      const garden = gardens[id];
      const n = garden.size || FUNGUS.size;
      const base = turnFungus({ x: n / 2, y: n - 2 }, garden.side, n);   // by the surface it grows on
      const spot = world.nearestStand('worker', garden.x + base.x, garden.y + base.y) || { x: garden.x + base.x, y: garden.y + base.y };
      return { id, x: spot.x, y: spot.y };
    },
    // Bigheaded: a granary holding a seed that is not ant bread yet, for the
    // seedcracker: { id, x, y } to walk to (the nearest), or null.
    // `skip`: granary ids already being cracked; `within`: only this close (pixels across or down), if given.
    // `any`: any granary at all (a seed cracker with nothing to crack looks around them).
    crackTarget(kind, fromX, fromY, skip, within, any) {
      let best = null;
      granaries.forEach((granary, id) => {
        if (granary.vault && any) return;
        if ((!any && (!granary.storedAt || granary.bread)) || (skip && skip.has(id))) return;
        if (within && (Math.abs(granary.x + GRANARY.width / 2 - fromX) > within || Math.abs(granary.y + GRANARY.space - fromY) > within)) return;
        const spot = world.nearestStand(kind, granary.x + GRANARY.width / 2, granary.y + GRANARY.space - 2);
        if (!spot) return;
        const far = Math.hypot(spot.x - fromX, spot.y - fromY);
        if (!best || far < best.far) best = { id, x: spot.x, y: spot.y, far };
      });
      return best && { id: best.id, x: best.x, y: best.y };
    },
    // The seedcracker cracks the seed in granary `id`: it is ant bread at once
    // (eaten breadAfter later, as usual).
    crackSeed(id) {
      const granary = granaries[id];
      if (!granary || !granary.storedAt || granary.bread) return false;
      granary.storedAt = Math.min(granary.storedAt, Date.now() - GRANARY.breadAfter);
      granary.bread = true;
      popText('Cracked!', 'pop-queen', granary.x + GRANARY.width / 2, granary.y + GRANARY.space - GRANARY.height - 2);
      redraw();
      if (caveHandler) caveHandler();
      return true;
    },
    // A replete a worker taking crumb to the queen could take it to instead:
    // { id, x, y } to walk to, or null. Of those not resting and with room
    // left (`coming`: crumb already on its way to each, { id: pixels }), the
    // one nearest the surface (so near the entrance saves the most walking).
    repleteTarget(coming = {}) {
      const now = Date.now();
      let best = null;
      repletes.forEach((r, id) => {
        if (now < r.coolUntil || r.crumbs + (coming[id] || 0) >= (r.holds || REPLETE.holds)) return;
        if (!r.stand || r.standFor !== caveStamp) {   // where to stand to feed it, worked out once per cave shape
          const n = r.size || REPLETE.size;
          r.stand = world.nearestStand('worker', r.x + n / 2, r.y + (r.h || n) - 1);
          r.standFor = caveStamp;
        }
        if (!r.stand) return;
        const far = world.distance('surface', r.stand.x, r.stand.y);
        if (far >= 0 && (!best || far < best.far)) best = { id, x: r.stand.x, y: r.stand.y, far };
      });
      return best && { id: best.id, x: best.x, y: best.y };
    },
    // A worker gives replete `id` its `count` crumb pixels: 'fed', or 'full'
    // (gone, resting, or filled before it got there).
    feedReplete(id, count) {
      const r = repletes[id];
      const now = Date.now();
      const holds = r && (r.holds || REPLETE.holds);
      if (!r || now < r.coolUntil || r.crumbs >= holds) return 'full';
      r.crumbs += count;   // the last load may take it over what it holds
      if (r.crumbs >= holds) {
        // Communal Stomach: crumb to a replete is worth more (repleteBoost); a Honeypot Chamber pays more again.
        const food = Math.round(r.crumbs * crumbRules.foodBoost * (crumbRules.crumbWorth || 1) * (crumbRules.repletePays || REPLETE.pays) *
          (crumbRules.repleteBoost || 1) * (r.honeypot ? BIG.honeypot.pays : 1));
        popText((r.honeypot ? 'Honeypot +' : 'Replete +') + food + ' Food', 'pop-queen', r.x + (r.size || REPLETE.size) / 2, r.y + 4);
        if (foodHandler) foodHandler(food, 'delivery');
        note('repleteFill');
        r.emptied = r.crumbs;
        r.crumbs = 0;
        r.coolUntil = now + REPLETE.restMs;
      }
      redraw();
      if (caveHandler) caveHandler();
      return 'fed';
    },
    // A worker feeds garden `id` its crumb of `count` pixels: 'fed' (it grew), 'wait' (it grew
    // less than stageMs ago), or 'full' (gone, or already thick).
    feedFungus(id, count = 0) {
      const garden = gardens[id];
      if (!garden || garden.stage >= 2) return 'full';
      const now = Date.now();
      if (now - garden.grewAt < (garden.chamber ? BIG.chamber.stageMs : FUNGUS.stageMs)) return 'wait';
      garden.bonus = (garden.bonus || 0) + FUNGUS.feedBonus * Math.min(1, count / FUNGUS.bigCrumb);   // bigger crumb, bigger payout
      garden.stage += 1;
      garden.grewAt = now;
      garden.since = now;
      if (garden.stage === 2) garden.ripeAt = now + FUNGUS.ripeMs;
      redraw();
      if (caveHandler) caveHandler();
      return 'fed';
    },
    // A fallen soldier was carried to the brood to heal.
    soldierSaved() {
      note('rescue');
    },
    // Is (x, y) near the midden? (Colony ants walk slowly there.)
    nearMidden(x, y) {
      return middenCount > 0 && x >= 0 && y >= 0 && x < cols && y < rows && middenNear[y * cols + x] === 1;
    },
    // Lycaenid Mutualism: where a worker stands to milk the caterpillar, while
    // it is ready ({ x, y }), or null.
    caterpillarJob() {
      const c = caterpillars[0];
      const ready = !!c && Date.now() >= c.readyAt;
      if (ready !== caterpillarShown) { caterpillarShown = ready; redraw(); }   // (its drop shows)
      if (!ready) return null;
      if (!c.stand || c.standFor !== caveStamp) {
        c.stand = world.nearestStand('worker', c.x + Math.floor(CATERPILLAR.w / 2), c.y + CATERPILLAR.h - 2, 14);
        c.standFor = caveStamp;
      }
      return c.stand ? { x: c.stand.x, y: c.stand.y } : null;
    },
    // A worker milks it: +1 honeydew (popup.js), and the next in a minute of the game being open.
    milkCaterpillar() {
      const c = caterpillars[0];
      if (!c || Date.now() < c.readyAt) return false;
      c.readyAt = Date.now() + CATERPILLAR.everyMs;
      popText('+1 Honeydew', 'pop-queen', c.x + Math.floor(CATERPILLAR.w / 2), c.y + 2);
      if (caterpillarHandler) caterpillarHandler();
      caterpillarShown = false;
      redraw();
      return true;
    },
    // Somewhere on the midden a worker can stand to drop waste: { x, y }, or null.
    middenSpot() {
      if (middenSpots.length === 0 || !crumbRules.midden) return null;
      const i = middenSpots[Math.floor(Math.random() * middenSpots.length)];
      return { x: i % cols, y: Math.floor(i / cols) };
    },
    // A worker dropped `load` waste on the midden (and, for a fire ant body, `food` food).
    dumpMidden(load, food, x, y, marauder) {
      if (food > 0) {
        popText('+' + food + ' Food', 'pop-queen', x, y - 4);
        if (foodHandler) foodHandler(food, 'delivery');
        note('body');
      }
      let label = x >= 0 && y >= 0 && x < cols && y < rows ? middenLabel[y * cols + x] : 0;
      let spot = label ? y * cols + x : -1;
      if (!label) {   // (dropped beside it: the nearest pile)
        let best = Infinity;
        for (const i of middenSpots) {
          const d = Math.abs(i % cols - x) + Math.abs(Math.floor(i / cols) - y);
          if (d < best) { best = d; label = middenLabel[i]; spot = i; }
        }
      }
      if (food > 0 && spot >= 0 && !(bloom && bloom.pile === piles[label - 1])) {   // a body: it stays there until the pile empties
        middenBodies.push({ i: spot, marauder: !!marauder, face: Math.random() < 0.5 ? 'left' : 'right' });
        if (middenBodies.length > MIDDEN.mostBodies) middenBodies.shift();
        paintCave();
        redraw();
      }
      addToPile(piles[label - 1], load);
    },
    // A worker brought a fire ant body to the queen.
    deliverBody(food) {
      const queen = Sprites.sizeOf('queen');
      popText('+' + food + ' Food', 'pop-queen',
        center.x + QUEEN_LEFT + Math.floor(queen.cols / 2),
        center.y + CAVE.floor - queen.rows - 1);
      if (foodHandler) foodHandler(food, 'delivery');
      note('body');
    },
    deliver(count) {
      if (count <= 0) return;
      // Communal Stomach (more while eggs hatch, and more again at the queen), and Crumb Value (fractions carry over to the next delivery).
      crumbExtra += count * crumbRules.foodBoost * (crumbRules.queenBoost || 1) * (crumbRules.crumbWorth || 1);
      const food = Math.floor(crumbExtra + 1e-9);
      crumbExtra -= food;
      const queen = Sprites.sizeOf('queen');
      popText('+' + food + ' Food', 'pop-queen',
        center.x + QUEEN_LEFT + Math.floor(queen.cols / 2),
        center.y + CAVE.floor - queen.rows - 1);
      if (foodHandler) foodHandler(food, 'delivery');
      note('feedQueen');
    }
  };

  /* ---------- The bread crumb ---------- */

  // The row the bottom of the crumb sits on: just above the ground, among the grass.
  function crumbBottom() {
    return ground - 2;
  }

  // Somewhere along the grass for a crumb, away from the tunnel opening and
  // from the other crumbs.
  function crumbSpot(self) {
    const width = Sprites.sizeOf('crumb').cols;
    const opening = tunnelX(ground);
    for (let tries = 0; tries < 200; tries++) {
      const x = CRUMB.clearOfEdge + Math.floor(Math.random() * (cols - 2 * CRUMB.clearOfEdge - width));
      if (x + width + CRUMB.clearOfTunnel > opening && x < opening + CRUMB.clearOfTunnel) continue;
      const crowded = crumbs.some((other) => other !== self && x < other.x + width + 6 && x + width + 6 > other.x);
      if (crowded) continue;
      return x;
    }
    return CRUMB.clearOfEdge;
  }

  // The pixels of a crumb's picture (the party block has its own).
  function cellsOf(crumb) {
    return crumb.party ? partyCells : crumbCells;
  }
  // A fruit or a party block: an extra crumb that never grows back and is not saved.
  function extraCrumb(crumb) {
    return crumb.fruit || crumb.party;
  }

  function freshCrumb() {
    const crumb = { x: 0, bits: new Uint8Array(crumbCells.length).fill(1), respawnAt: 0 };
    crumb.x = crumbSpot(crumb);
    return crumb;
  }

  // As many crumbs as the upgrades allow (one, or two with Charitable Toddler).
  function fitCrumbSlots() {
    const fruit = crumbs.filter(extraCrumb);
    crumbs = crumbs.filter((crumb) => !extraCrumb(crumb));
    let changed = false;
    while (crumbs.length < crumbRules.slots) {
      crumbs.push(freshCrumb());
      changed = true;
    }
    while (crumbs.length > crumbRules.slots) {
      crumbs.pop();
      changed = true;
    }
    crumbs.push(...fruit);   // (a fruit or party block stays after the crumbs)
    if (changed) {
      hintSide = '';
      crumbChanged();
    }
  }

  function crumbLeft(crumb) {
    let count = 0;
    for (const bit of crumb.bits) count += bit;
    return count;
  }

  function nextRespawn() {
    return Date.now() + (CRUMB.respawnMin + Math.random() * (CRUMB.respawnMax - CRUMB.respawnMin)) * (crumbRules.respawnScale || 1);
  }

  // The rectangle around what is left of a crumb, or null if there's nothing.
  function crumbBox(crumb) {
    if (!crumb || crumb.respawnAt) return null;
    if (crumb.fruit && Date.now() < crumb.landAt) return null;   // (a fruit still falling)
    let box = null;
    const top = crumbBottom() - Sprites.sizeOf('crumb').rows + 1;
    cellsOf(crumb).forEach((cell, n) => {
      if (!crumb.bits[n]) return;
      const x = crumb.x + cell.dx;
      const y = top + cell.dy;
      if (!box) box = { left: x, right: x, top: y, bottom: y };
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y);
      box.bottom = Math.max(box.bottom, y);
    });
    return box;
  }

  function crumbChanged() {
    redraw();
    if (crumbHandler) crumbHandler();
  }

  /*
   * Take up to `count` pixels off a crumb, from the outside in: each time, a
   * pixel with the most sides open to the air. Returns their colors. When
   * the last pixel goes, that crumb's next time and place are picked.
   */
  function takeFromCrumb(crumb, count) {
    if (!crumb || crumb.respawnAt) return [];
    const taken = [];
    const cells = cellsOf(crumb);
    const has = (dx, dy) => cells.some((cell, n) => crumb.bits[n] && cell.dx === dx && cell.dy === dy);
    for (let k = 0; k < count; k++) {
      let best = -1;
      let bestScore = -1;
      cells.forEach((cell, n) => {
        if (!crumb.bits[n]) return;
        let score = Math.random() * 1.5;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          if (!has(cell.dx + dx, cell.dy + dy)) score += 1;
        }
        if (score > bestScore) { bestScore = score; best = n; }
      });
      if (best < 0) break;
      crumb.bits[best] = 0;
      taken.push(crumb.fruit ? fruitColor(cells[best].color) : cells[best].color);
    }
    if (taken.length > 0 && crumbLeft(crumb) === 0 && crumb.party) {
      crumb.respawnAt = Infinity;   // all gone: party time
      crumb.gone = true;
      startParty();
      crumbChanged();
      return taken;
    }
    if (taken.length > 0 && crumbLeft(crumb) === 0 && crumb.fruit) {
      crumb.respawnAt = Infinity;   // eaten: the fruit is gone (its place is used for the next one)
      crumb.gone = true;
      crumbChanged();
      return taken;
    }
    if (taken.length > 0 && crumbLeft(crumb) === 0) {
      crumb.respawnAt = nextRespawn();
      crumb.x = crumbSpot(crumb);
      hintSide = '';
    }
    if (taken.length > 0) crumbChanged();
    return taken;
  }

  /* ---------- Falling fruit ---------- */
  let nextFruitAt = 0;

  // A crumb color in fruit colors: the crumb's shades, darkest to lightest, become FRUIT.colors.
  const fruitShades = {};
  function fruitColor(color) {
    if (!fruitShades[color]) {
      const light = (hex) => { const n = parseInt(hex.slice(1), 16); return (n >> 16) * 3 + ((n >> 8) & 255) * 6 + (n & 255); };
      const all = [...new Set(crumbCells.map((cell) => cell.color))].sort((a, b) => light(a) - light(b));
      const k = all.indexOf(color);
      fruitShades[color] = FRUIT.colors[Math.min(FRUIT.colors.length - 1, Math.round(k * (FRUIT.colors.length - 1) / Math.max(1, all.length - 1)))];
    }
    return fruitShades[color];
  }

  // How far above the grass a falling fruit is now.
  function fruitDrop(crumb, now) {
    if (!(now < crumb.landAt)) return 0;
    const t = 1 - (crumb.landAt - now) / FRUIT.fallMs;
    return Math.round((crumbBottom() + 4) * (1 - t * t));   // (from the top, faster as it falls)
  }

  // Each tick: a new fruit when its time comes. True while one is falling.
  let fruitNow = false;   // (the F dev key: one at once)
  let lastFruitTick = 0;
  function tickFruit(now) {
    const passed = lastFruitTick ? Math.max(0, now - lastFruitTick) : 0;
    lastFruitTick = now;
    const live = crumbs.find((crumb) => crumb.fruit && !crumb.gone);
    if (live) return now < live.landAt;
    if (fruitNow) { fruitNow = false; nextFruitAt = now; }
    else if (!crumbRules.fruit || (crumbRules.winter && !crumbRules.winterForage)) { nextFruitAt = 0; return false; }
    else if (crumbRules.peaceful) { if (nextFruitAt) nextFruitAt += passed; return false; }   // Peaceful mode: the wait stands still
    if (!nextFruitAt) nextFruitAt = now + FRUIT.everyMin + Math.random() * (FRUIT.everyMax - FRUIT.everyMin);
    if (now < nextFruitAt) return false;
    nextFruitAt = 0;
    const fruit = freshCrumb();
    fruit.fruit = true;
    fruit.worth = FRUIT.worth;
    fruit.landAt = now + FRUIT.fallMs;
    const old = crumbs.findIndex((crumb) => crumb.fruit);
    if (old >= 0) crumbs[old] = fruit; else crumbs.push(fruit);   // (into the last one's place)
    hintSide = '';
    crumbChanged();
    return true;
  }

  /* ---------- The party block ---------- */

  // The block's pixels: a dark edge, light on the top and left, shade on the
  // bottom and right. Its bottom row sits where the crumb's does.
  function makePartyCells() {
    const c = PARTY.colors;
    const crumbSize = Sprites.sizeOf('crumb');
    const left = Math.floor((crumbSize.cols - PARTY.w) / 2), top = crumbSize.rows - PARTY.h;
    partyCells = [];
    for (let y = 0; y < PARTY.h; y++) {
      for (let x = 0; x < PARTY.w; x++) {
        const edge = x === 0 || y === 0 || x === PARTY.w - 1 || y === PARTY.h - 1;
        const color = edge ? c.edge : (x === 1 || y === 1) ? c.light : (x === PARTY.w - 2 || y === PARTY.h - 2) ? c.shade : c.fill;
        partyCells.push({ dx: left + x, dy: top + y, color });
      }
    }
  }

  // Put a party block on the grass (not if one is there already). True if it did.
  function dropPartyBlock() {
    if (crumbs.some((crumb) => crumb.party && !crumb.gone)) return false;
    const block = { x: 0, bits: new Uint8Array(partyCells.length).fill(1), respawnAt: 0, party: true };
    block.x = crumbSpot(block);
    const old = crumbs.findIndex((crumb) => crumb.party);
    if (old >= 0) crumbs[old] = block; else crumbs.push(block);   // (into the last one's place)
    hintSide = '';
    crumbChanged();
    return true;
  }

  function partyOn(now) {
    return (now || Date.now()) < partyUntil;
  }
  function startParty() {
    partyUntil = Date.now() + PARTY.ms;
    Wanderers.setParty(partyUntil);
    if (partyHandler) partyHandler();
  }

  // Confetti drifting down over the part of the field being looked at.
  function drawConfetti(g) {
    const now = Date.now();
    const vw = Math.ceil(cols / zoom), vh = Math.ceil(rows / zoom);
    const count = Math.max(20, Math.round(vw * vh / PARTY.confettiPer));
    const fade = Math.min(1, (partyUntil - now) / 3000);   // (fewer pieces over the last 3 s)
    for (let n = 0; n < count * fade; n++) {
      const speed = 0.006 + (n % 5) * 0.002;   // view pixels per ms
      const y = viewY + ((n * 97 + now * speed) % vh);
      const sway = Math.sin(now / (400 + (n % 7) * 60) + n) * 3;
      const x = viewX + ((n * 61 + Math.floor(n / 3) * 17) % vw) + Math.round(sway);
      g.fillStyle = PARTY.confetti[n % PARTY.confetti.length];
      const flat = Math.floor(now / 180 + n) % 2 === 0;   // (it tumbles: wide, then tall)
      g.fillRect(Math.round(x), Math.round(y), flat ? 2 : 1, flat ? 1 : 2);
    }
  }

  // Put out new crumbs once their time has come.
  function respawnCrumbs(now) {
    if (crumbRules.winter && !crumbRules.winterForage && !crumbRules.regrow) return;   // winter: no crumbs grow back (unless Microbial heaters, or a click frenzy)
    for (const crumb of crumbs) {
      if (extraCrumb(crumb)) continue;   // (a fruit or party block never grows back)
      if (!crumb.respawnAt || (now < crumb.respawnAt && !crumbRules.rush && !crumbRules.regrow)) continue;   // a rove beetle rush or click frenzy: an eaten crumb is back at once
      crumb.bits.fill(1);
      crumb.respawnAt = 0;
      crumbChanged();
    }
  }

  // The crumb at the game point (x, y) (or right next to it), or null.
  function crumbAt(point) {
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    for (const crumb of crumbs) {
      const box = crumbBox(crumb);
      if (box && x >= box.left - 1 && x <= box.right + 1 && y >= box.top - 1 && y <= box.bottom + 1) return crumb;
    }
    return null;
  }

  function onCrumb(point) {
    return crumbAt(point) !== null;
  }

  function biteCrumb(crumb) {
    const now = Date.now();
    if (!crumb || now < crumbReadyAt) return;
    const bite = CRUMB.biteMin + Math.floor(Math.random() * (CRUMB.biteMax - CRUMB.biteMin + 1));
    const box = crumbBox(crumb);
    if (takeFromCrumb(crumb, bite).length === 0) return;
    crumbReadyAt = now + crumbRules.clickWaitMs;
    const food = crumbRules.clickFood * crumbRules.foodBoost * (crumb.worth || 1);   // Click Amount, times Communal Stomach's boost (and a fruit's worth)
    popText('+' + food, 'pop-crumb', Math.floor((box.left + box.right + 1) / 2), box.top - 2);
    showCooldown();
    if (hintWanted) {
      hintWanted = false;
      placeHint();
    }
    if (foodHandler) foodHandler(food, 'click');
  }

  // The little bar beside the mouse that empties while the crumb can't be
  // clicked. It moves in 2-pixel steps.
  function showCooldown() {
    cooldownBar.hidden = false;
    const fill = cooldownBar.firstChild;
    const inner = 20;
    const tick = () => {
      const left = crumbReadyAt - Date.now();
      if (left <= 0) {
        cooldownBar.hidden = true;
        return;
      }
      fill.style.width = Math.ceil(left / crumbRules.clickWaitMs * inner / 2) * 2 + 'px';
      placeCooldown();
      requestAnimationFrame(tick);
    };
    tick();
  }

  function placeCooldown() {
    cooldownBar.style.left = Math.round(mouse.x + 10) + 'px';
    cooldownBar.style.top = Math.round(mouse.y + 14) + 'px';
  }

  // A number like "+1" that rises from a game point and disappears.
  // With LOOK.quietPops, food numbers are small, and a "+N Food" close to
  // another of the same kind shown moments ago is added to that one instead.
  // `life`: how long it stays up (ms), if not its kind's usual; `big`: drawn this many times the size.
  function popText(text, kind, x, y, life, big) {
    const quiet = LOOK.quietPops && kind !== 'pop-crumb';
    const amount = /^\+(\d+) Food$/.exec(text);
    if (quiet && amount) {
      const now = Date.now();
      const near = pops.find((pop) => pop.kind === kind && pop.amount && now - pop.born < QUIET_POPS.joinMs &&
        Math.abs(pop.x - x) <= QUIET_POPS.joinReach && Math.abs(pop.y - y) <= QUIET_POPS.joinReach);
      if (near) {
        near.amount += Number(amount[1]);
        near.born = now;
        PixelFont.write(near.el, '+' + near.amount + ' Food', { small: true });
        return;
      }
    }
    const el = document.createElement('span');
    el.className = 'px pop ' + kind;
    popLayer.appendChild(el);
    PixelFont.write(el, text, quiet && !big ? { small: true } : undefined);
    if (big) {
      // As big as asked, but no wider than most of the field.
      const width = [...el.querySelectorAll('canvas')].reduce((sum, canvas) => sum + parseFloat(canvas.style.width), 0);
      const room = (popLayer.clientWidth || canvas.clientWidth) * 0.9;
      if (width > 0 && room > 0) big = Math.min(big, room / width);
      for (const canvas of el.querySelectorAll('canvas')) {
        canvas.style.width = parseFloat(canvas.style.width) * big + 'px';
        canvas.style.height = parseFloat(canvas.style.height) * big + 'px';
      }
    }
    pops.push({ el, kind, x, y, born: Date.now(), quiet: quiet && !big, life, amount: quiet && amount ? Number(amount[1]) : 0 });
    if (pops.length === 1) requestAnimationFrame(movePops);
  }

  /*
   * The "Click!" arrow, shown beside the crumb until it is first clicked.
   * It sits to the right of the crumb, or to the left when there isn't room.
   */
  function placeHint() {
    const first = crumbs.find((crumb) => crumbBox(crumb));
    const box = hintWanted && first && crumbBox(first);
    if (!box) {
      hintEl.hidden = true;
      return;
    }
    const scale = screenScale();
    const side = box.right + 60 < cols ? 'right' : 'left';
    if (side !== hintSide) {
      hintSide = side;
      hintEl.className = 'hint hint-' + side;
      hintEl.innerHTML = '';
      const arrow = document.createElement('span');
      arrow.className = 'sprite';
      arrow.dataset.sprite = side === 'right' ? 'arrowLeft' : 'arrowRight';
      const text = document.createElement('span');
      text.className = 'px';
      hintEl.append(arrow, text);
      Sprites.fillAll(hintEl);
      PixelFont.write(text, 'Click!');
    }
    hintEl.hidden = false;
    const middle = ((box.top + box.bottom + 1) / 2 - viewY) * scale;
    hintEl.style.top = Math.round(middle - hintEl.offsetHeight / 2) + 'px';
    if (side === 'right') {
      hintEl.style.left = Math.round((box.right + 2 - viewX) * scale) + 'px';
    } else {
      hintEl.style.left = Math.round((box.left - 1 - viewX) * scale - hintEl.offsetWidth) + 'px';
    }
  }

  function movePops() {
    const now = Date.now();
    const scale = screenScale();
    pops = pops.filter((pop) => {
      const age = now - pop.born;
      const life = pop.life || (pop.quiet ? QUIET_POPS.life : POP_MS[pop.kind] || 1200);   // (any other kind: a little over a second)
      if (age >= life) {
        pop.el.remove();
        return false;
      }
      const rise = pop.quiet ? Math.floor(age / life * QUIET_POPS.rise / 2) * 2 : Math.floor(age / life * 6) * 2;
      if (pop.quiet) pop.el.style.opacity = String(age < life * 0.5 ? 0.85 : age < life * 0.75 ? 0.55 : 0.3);   // fades in steps
      pop.el.style.left = Math.round((pop.x - viewX) * scale - pop.el.offsetWidth / 2) + 'px';
      pop.el.style.top = Math.round((pop.y - viewY) * scale - pop.el.offsetHeight - rise) + 'px';
      return true;
    });
    if (pops.length > 0) requestAnimationFrame(movePops);
  }

  /* ---------- The midden's sunflower ----------
   * Once the midden is full (popup.js decides), bloom(seeds, done): a pale
   * root grows from the top of the midden up through the dirt to the grass,
   * a sunflower grows there and flowers, then bursts: `seeds` seeds land on
   * the grass around it and done() is called. The plant wilts and is gone. */
  function startBloom(pile) {
    if (bloom || !pile || pile.size === 0) return false;
    // From the middle of the pile, at its top there, up to the grass.
    const label = piles.indexOf(pile) + 1;
    const x = Math.round((pile.left + pile.right) / 2);
    let rootIndex = -1;
    for (let y = ground; y < rows && rootIndex < 0; y++) if (middenLabel[y * cols + x] === label) rootIndex = y * cols + x;
    if (rootIndex < 0) rootIndex = pile.rep;
    const rootX = rootIndex % cols;
    const opening = tunnelX(ground);
    const flowerX = Math.abs(rootX - opening) < 8 ? rootX + (rootX < opening ? -8 : 8) : rootX;   // (not in the nest hole)
    // Seeds by exact size (so many small piles give no more than one big one): the part of a seed left over is a chance of one more.
    const exact = pile.size / MIDDEN.seedPixels;
    const count = Math.min(MIDDEN.seedsMax, Math.floor(exact) + (Math.random() < exact - Math.floor(exact) ? 1 : 0));
    const worth = MIDDEN.worth * (1 + Math.min(1, pile.size / MIDDEN.bigWorth));
    bloom = { start: Date.now(), x: flowerX, rootX, rootY: Math.floor(rootIndex / cols), rootIndex, pile, count, worth, burst: false };
    Sound.sfx('fill');
    redraw();
    return true;
  }

  // Seeds landing on the grass around x (they may go past the usual most on the grass).
  function scatterSeeds(count, x, worth, from) {
    const width = Sprites.sizeOf('seed').cols;
    const before = seeds.length;
    const opening = tunnelX(ground);
    let placed = 0;
    for (let tries = 0; tries < count * 30 && placed < count; tries++) {
      const sx = Math.round(x - width / 2 + (Math.random() * 2 - 1) * MIDDEN.spread);
      if (sx < 2 || sx + width > cols - 2) continue;
      if (Math.abs(sx + width / 2 - opening) < CRUMB.clearOfTunnel / 2) continue;
      if (seeds.some((other) => sx + width > other.x && sx < other.x + width)) continue;
      seeds.push({ id: ++lastSeedId, x: sx, worth: worth || 1, kind: 'sunflower' });   // (the midden's sunflower: sunflower seeds only)
      placed += 1;
    }
    // No room left between the seeds already there: the rest land anyway, on top of others.
    for (let tries = 0; tries < count * 30 && placed < count; tries++) {
      const reach = tries < count * 10 ? MIDDEN.spread : cols;
      const sx = Math.round(x - width / 2 + (Math.random() * 2 - 1) * reach);
      if (sx < 2 || sx + width > cols - 2) continue;
      if (Math.abs(sx + width / 2 - opening) < CRUMB.clearOfTunnel / 2) continue;
      seeds.push({ id: ++lastSeedId, x: sx, worth: worth || 1, kind: 'sunflower' });   // (the midden's sunflower: sunflower seeds only)
      placed += 1;
    }
    // Out of the flower: each new seed arcs from the flower head to where it lands.
    if (from) {
      const now = Date.now();
      for (const s of seeds.slice(before)) {
        const ms = MIDDEN.flyMin + Math.random() * (MIDDEN.flyMax - MIDDEN.flyMin);
        s.fly = { x: from.x, y: from.y, start: now, end: now + ms, high: MIDDEN.flyHigh * (0.6 + Math.random() * 0.8) };
      }
    }
    if (caveHandler) caveHandler();
    return placed;
  }

  // Each tick while it grows: the burst at its time, and the end. True while there is something to draw.
  function tickBloom(now) {
    if (!bloom) {
      // A full pile (and the upgrade owned): its sunflower.
      if (crumbRules.midden && !alate) {
        const full = piles.find((pile) => pile.size > 0 && pileFull(pile) >= 1);
        if (full) startBloom(full);
      }
      return false;
    }
    const t = now - bloom.start;
    const burstAt = MIDDEN.rootMs + MIDDEN.growMs + MIDDEN.flowerMs;
    if (!bloom.burst && t >= burstAt) {
      bloom.burst = true;
      const placed = bloom.count > 0 ? scatterSeeds(bloom.count, bloom.x, bloom.worth, { x: bloom.x, y: ground - 1 - MIDDEN.stem - 2 }) : 0;
      note('bloom', placed);   // (Helianthus: a burst of 20 or more)
      if (placed > 0) popText('+' + placed + (placed === 1 ? ' Seed' : ' Seeds'), 'pop-queen', bloom.x, ground - MIDDEN.stem - 6);
      Sound.sfx('catch');
      if (bloom.pile) {   // emptied: the refuse (and the bodies on it) gone, and it fills again
        bloom.pile.waste = 0;
        const label = piles.indexOf(bloom.pile) + 1;
        middenBodies = middenBodies.filter((body) => middenLabel[body.i] !== label);
        bloom.pile.shown = -1;
        showPiles();
      }
      if (bloomHandler) bloomHandler(placed);
    }
    if (t >= burstAt + MIDDEN.wiltMs) {
      bloom = null;
      return true;
    }
    return true;
  }

  function drawBloom(g) {
    if (!bloom) return;
    const t = Date.now() - bloom.start;
    const share = (from, length) => Math.max(0, Math.min(1, (t - from) / length));
    // The root: from the midden up to the grass, then across to the plant.
    const rootShare = share(0, MIDDEN.rootMs);
    const rootTop = Math.round(bloom.rootY - (bloom.rootY - ground) * rootShare);
    const wilting = bloom.burst ? share(MIDDEN.rootMs + MIDDEN.growMs + MIDDEN.flowerMs, MIDDEN.wiltMs) : 0;
    g.fillStyle = wilting > 0.5 ? '#9c8a68' : '#e3d6b4';
    for (let y = bloom.rootY - 1; y >= rootTop; y--) {
      const wobble = Math.round(Math.sin(y * 0.45) * 1.2);
      g.fillRect(bloom.rootX + wobble, y, 1, 1);
      if (y % 7 === 0) g.fillRect(bloom.rootX + wobble + (y % 14 === 0 ? 1 : -1), y + 1, 1, 1);   // little side roots
    }
    if (rootShare >= 1 && bloom.x !== bloom.rootX) {
      const from = Math.min(bloom.x, bloom.rootX), to = Math.max(bloom.x, bloom.rootX);
      for (let x = from; x <= to; x++) g.fillRect(x, ground + 1, 1, 1);
    }
    // The sunflower on the grass.
    const grow = share(MIDDEN.rootMs, MIDDEN.growMs);
    if (grow <= 0) return;
    const stem = Math.max(1, Math.round(MIDDEN.stem * grow * (1 - wilting * 0.4)));
    const base = ground - 1;
    const green = wilting > 0.3 ? '#7d7a3a' : '#3f8f2a';
    g.fillStyle = green;
    for (let h = 0; h < stem; h++) g.fillRect(bloom.x, base - h, 1, 1);
    if (stem > 5) { g.fillRect(bloom.x - 1, base - 5, 1, 1); g.fillRect(bloom.x - 2, base - 6, 1, 1); }   // leaves
    if (stem > 9) { g.fillRect(bloom.x + 1, base - 9, 1, 1); g.fillRect(bloom.x + 2, base - 10, 1, 1); }
    const flower = share(MIDDEN.rootMs + MIDDEN.growMs, MIDDEN.flowerMs);
    if (flower <= 0) return;
    const top = base - stem + 1;
    const big = flower >= 0.5;               // opening: a bud, then the full flower
    const cy = top - (big ? 3 : 2);
    const head = big ? 5 : 2;                // the seed head: within this squared distance
    const petals = big ? 10 : 5;             // the petals: the ring out to here
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = dx * dx + dy * dy;
        if (d <= head) g.fillStyle = bloom.burst ? '#4a3a22' : '#5a3a1a';   // (empty and dull once burst)
        else if (d <= petals && !bloom.burst) g.fillStyle = wilting > 0 ? '#c9a64a' : '#f2c82a';
        else continue;
        g.fillRect(bloom.x + dx, cy + dy, 1, 1);
      }
    }
  }

  /* ---------- Drawing ---------- */

  function redraw() {
    if (!ctx) return;

    // 1. Draw the whole field at game-pixel size.
    const g = frame.getContext('2d');
    g.drawImage(baseLayer, 0, 0);
    g.drawImage(caveLayer, 0, 0);
    if (floodTop !== null) {
      for (let y = floodTop; y < rows; y++) {
        g.fillStyle = y === floodTop ? FLOOD.top : FLOOD.water;
        for (let x = 0; x < cols; x++) if (open[y * cols + x]) g.fillRect(x, y, 1, 1);
      }
    }
    drawSeason(g);
    drawBloom(g);
    // The caterpillar on the floor of its space, now and then rippling; its
    // honeydew drop shows while it is ready to be milked.
    for (const c of caterpillars) {
      const cat = Sprites.sizeOf('caterpillar');
      const left = c.x + Math.floor((CATERPILLAR.w - cat.cols) / 2);
      const top = c.y + CATERPILLAR.h - cat.rows;
      const ripple = (Date.now() + c.x * 97) % CATERPILLAR.rippleMs < CATERPILLAR.rippleFor;
      Sprites.paint(g, ripple ? 'caterpillar2' : 'caterpillar', left, top);
      if (Date.now() >= c.readyAt) Sprites.paint(g, 'catDrop', left + CATERPILLAR.dropX, top - 3);
    }
    if (storeFlag >= 0 && flagShown && (crumbRules.storeSeeds || flagPicking || Date.now() < flagPlacedShowUntil)) {
      const size = Sprites.sizeOf('storeFlag');
      Sprites.paint(g, 'storeFlag', storeFlag % cols, Math.floor(storeFlag / cols) - size.rows + 1);
    }

    if (trailView) g.drawImage(trailMarkLayer, 0, 0);
    if (tool) {
      if (!stroke) g.drawImage(bandLayer, 0, 0);   // where the tool reaches; hidden while dragging
      if (tool === 'dig' && supportLayer) g.drawImage(supportLayer, 0, 0);   // dirt holding up a structure: can't be dug
      if (hover && hover.pixels.length > 0) {
        g.fillStyle = !affordable ? COLORS.pickBlocked : tool === 'trail' ? COLORS.trailPick : tool === 'midden' ? COLORS.middenPick : tool === 'aphid' || tool === 'herd' ? COLORS.penPick : tool === 'fungus' || tool === 'chamber' ? COLORS.fungusPick : tool === 'replete' || tool === 'honeypot' ? COLORS.repletePick : tool === 'delete' ? COLORS.deletePick : tool === 'granary' || tool === 'vault' || tool === 'nursery' || tool === 'caterpillar' ? COLORS.granaryPick : COLORS.pick;
        for (const i of hover.pixels) g.fillRect(i % cols, Math.floor(i / cols), 1, 1);
      } else if (hover && (tool === 'aphid' || tool === 'granary' || tool === 'nursery' || tool === 'caterpillar' || tool === 'trail' || tool === 'midden' || tool === 'fungus' || tool === 'replete' || BIG.kinds.includes(tool))) {
        // A pen, granary or trail block can't go here: its whole square in
        // red, over dirt and tunnel alike.
        const w = tool === 'caterpillar' ? CATERPILLAR.w : tool === 'granary' || tool === 'nursery' ? GRANARY.width : BIG.kinds.includes(tool) ? bigDims(tool).w : toolSize();
        const h = tool === 'caterpillar' ? CATERPILLAR.h : tool === 'granary' || tool === 'nursery' ? GRANARY.space : BIG.kinds.includes(tool) ? bigDims(tool).h : toolSize();
        g.fillStyle = COLORS.penBlocked;
        g.fillRect(hover.x, hover.y, w, h);
      }
      // Dig and fill: the tool's outline always follows the mouse, even where
      // it can't change anything (or has just dug everything it can).
      if (hover && (tool === 'dig' || tool === 'fill')) {
        const s = toolSize();
        const mask = shapeMask(s);
        const inside = (dx, dy) => dx >= 0 && dy >= 0 && dx < s && dy < s && mask[dy * s + dx];
        g.fillStyle = 'rgba(255, 255, 255, 0.55)';
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            if (inside(dx, dy) && !(inside(dx - 1, dy) && inside(dx + 1, dy) && inside(dx, dy - 1) && inside(dx, dy + 1))) g.fillRect(hover.x + dx, hover.y + dy, 1, 1);
          }
        }
      }
      // Structures in the way, blinking red after a moment.
      const now = Date.now();
      if (conflictShowing(now) && Math.floor((now - conflict.since - CONFLICT.after) / CONFLICT.blinkMs) % 2 === 0) {
        g.fillStyle = CONFLICT.color;
        for (const r of conflict.rects) g.fillRect(r.x, r.y, r.w, r.h);
      }
    }

    const floorY = center.y + CAVE.floor;

    // Queen, standing on the cave floor, left of center, with whichever
    // animation patches are showing right now.
    const queen = Sprites.sizeOf('queen');
    const queenX = center.x + QUEEN_LEFT;
    const queenY = floorY - queen.rows + 1;
    paintTrophicEggs(g, queenX, floorY, queen.cols);
    Sprites.paint(g, 'queen', queenX, queenY);
    const patches = [].concat(queenShine ? QUEEN_PATCHES.shine : [], queenNod ? QUEEN_PATCHES.nod : []);
    for (const [name, dx, dy] of patches) Sprites.paint(g, name, queenX + dx, queenY + dy);

    // The alate rests behind the eggs, facing the queen. Hidden while she
    // is leaving on a nuptial flight.
    if (alateHome && !alate) {
      for (const [dx, dy, face] of ALATE.extras.slice(0, alateExtras)) Sprites.paintTurned(g, 'alateCrawl1', center.x + ALATE.home + dx, floorY - 5 + dy, face);   // (behind her)
      Sprites.paintTurned(g, alateNod ? 'alateRestNod' : 'alateCrawl1', center.x + ALATE.home, floorY - 5, 'left');
    }

    // Eggs and pupae on the floor to the right of the queen, each centered
    // in its spot. Soldier eggs and pupae use the larger pictures.
    for (const item of brood) {
      const name = item.stage + (item.type !== 'worker' && item.type !== 'fireAnt' ? 'Soldier' : '');   // soldier and supermajor brood use the larger pictures
      const art = Sprites.sizeOf(name);
      if (item.spot >= NURSERY_SPOT) {   // in a nursery: on its pile of eggs
        const n = nurseries[item.spot - NURSERY_SPOT];
        if (!n) continue;
        const top = n.y + GRANARY.space - Sprites.sizeOf('nursery').rows;
        Sprites.paint(g, name, n.x + Math.floor((GRANARY.width - art.cols) / 2), top - art.rows + 1);
        continue;
      }
      const x = center.x + BROOD_SPOTS[item.spot] + Math.floor((SPOT_WIDTH - art.cols) / 2);
      Sprites.paint(g, name, x, floorY - art.rows + 1);
    }

    // The bread crumbs on the grass.
    const crumbTop = crumbBottom() - Sprites.sizeOf('crumb').rows + 1;
    for (const crumb of crumbs) {
      if (crumb.respawnAt) continue;
      const drop = crumb.fruit ? fruitDrop(crumb, Date.now()) : 0;
      cellsOf(crumb).forEach((cell, n) => {
        if (!crumb.bits[n]) return;
        g.fillStyle = crumb.fruit ? fruitColor(cell.color) : cell.color;
        g.fillRect(crumb.x + cell.dx, crumbTop + cell.dy - drop, 1, 1);
      });
    }

    // The seed on the grass, and seeds or ant bread in the granaries.
    const seedSpace = Sprites.sizeOf('seed').cols;
    const drawNow = Date.now();
    for (const s of seeds) {
      let x = s.x + Math.floor(seedSpace / 2), y = crumbBottom();
      if (s.fly && drawNow < s.fly.end) {   // still in the air, out of the sunflower
        const t = Math.max(0, (drawNow - s.fly.start) / (s.fly.end - s.fly.start));
        x = Math.round(s.fly.x + (x - s.fly.x) * t);
        y = Math.round(s.fly.y + (y - s.fly.y) * t - s.fly.high * 4 * t * (1 - t));
      }
      Sprites.paintSeed(g, s.kind, x, y);
    }

    // Seeds stored on the tunnel floors (STORE): a seed, or ant bread once aged (Seed keepers).
    if (stash.length > 0) {
      const art = Sprites.sizeOf('seed');
      const now = Date.now();
      for (const item of stash) {
        if (crumbRules.seedAgeMs > 0 && now - item.at >= crumbRules.seedAgeMs) {
          g.fillStyle = '#c9a24a';
          g.fillRect(item.x - 2, item.y - 1, 4, 2);
          g.fillStyle = '#e2c46a';
          g.fillRect(item.x - 1, item.y - 2, 2, 1);
        } else {
          Sprites.paintSeed(g, item.kind, item.x, item.y);
        }
      }
    }
    for (const v of vaults) paintVault(g, v);
    for (const granary of granaries) {
      if (!granary.storedAt || granary.vault || mergeHidden.has(granary)) continue;
      // Resting on the straw: its bottom on the granary's middle row.
      if (!granary.bread) { Sprites.paintSeed(g, granary.kind, granary.x + Math.floor(GRANARY.width / 2), granary.y + GRANARY.space - 2); continue; }
      const art = Sprites.sizeOf('antBread');
      Sprites.paint(g, 'antBread', granary.x + Math.floor((GRANARY.width - art.cols) / 2), granary.y + GRANARY.space - 2 - art.rows + 1);
    }

    // Repletes, hanging from the ceiling.
    for (const r of repletes) if (!mergeHidden.has(r)) paintReplete(g, r, Date.now());

    // Fungus gardens, each at its stage.
    for (const garden of gardens) {
      if (mergeHidden.has(garden)) continue;
      if (garden.chamber) { paintChamber(g, garden); continue; }
      for (const cell of garden.art[garden.stage]) {
        g.fillStyle = FUNGUS.colors[cell.shade];
        g.fillRect(garden.x + cell.x, garden.y + cell.y, 1, 1);
      }
    }

    // Aphids, each in its pen.
    for (const pen of pens) {
      if (mergeHidden.has(pen)) continue;
      if (pen.herd) { paintHerd(g, pen); continue; }
      Sprites.paint(g, pen.pose ? 'aphidStep' : 'aphid', pen.x + pen.ax, pen.y + pen.ay);
      if (pen.showsDrop) {
        // A honeydew drop beside the full aphid.
        const art = Sprites.sizeOf('aphid');
        g.fillStyle = APHID.drop[0];
        g.fillRect(pen.x + pen.ax + art.cols, pen.y + pen.ay + art.rows - 3, 1, 1);
        g.fillStyle = APHID.drop[1];
        g.fillRect(pen.x + pen.ax + art.cols, pen.y + pen.ay + art.rows - 2, 1, 1);
      }
    }

    // Walking ants: they keep clear of the queen, and walk over the brood.
    Wanderers.draw(g, world);
    drawAnteater(g);   // (its tongue over the ants it reaches for)

    // A rove beetle sneaking through.
    if (beetle) {
      const name = (beetle.dx < 0 ? 'roveBeetleLeft' : 'roveBeetle') + (beetle.step % 2 ? '2' : '');   // two steps, walking
      const size = Sprites.sizeOf(name);
      Sprites.paint(g, name, beetle.x - Math.floor(size.cols / 2), beetle.y - Math.floor(size.rows / 2), BEETLE.colors);
    }

    // Rain (summer, now and then): streaks falling over the sky and grass.
    if (crumbRules.rain) {
      const t = Date.now();
      g.fillStyle = 'rgba(170, 200, 240, 0.75)';
      for (let n = 0; n < RAIN.drops; n++) {
        const x = (n * 37 + Math.floor(t / 7) * (n % 3 + 1)) % cols;
        const y = (n * 53 + Math.floor(t / 4)) % (ground + 2);
        g.fillRect(x, y, 1, 3);
      }
    }

    // A party: confetti over everything but the winged queen.
    if (partyOn()) drawConfetti(g);

    // After a nuptial flight: the winged queen, over everything else.
    if (alate) drawAlate(g);

    // The alarm pheromone cloud: see-through red, denser in the middle, fading at the end.
    if (alarmCloud) {
      const fade = Math.min(1, Math.max(0, (alarmCloud.until - Date.now()) / ALARM.fadeMs));
      for (const [radius, alpha] of [[ALARM.radius, ALARM.alpha * fade], [ALARM.radius / 2, ALARM.alpha * fade * 0.8]]) {
        g.fillStyle = 'rgba(224, 40, 30, ' + alpha.toFixed(3) + ')';
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy <= radius * radius) g.fillRect(Math.round(alarmCloud.x + dx), Math.round(alarmCloud.y + dy), 1, 1);
          }
        }
      }
    }

    // 2. Copy the part being looked at onto the screen, enlarged by the zoom.
    const scale = screenScale() * RES;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = COLORS.dirt;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame, -viewX * scale, -viewY * scale, cols * scale, rows * scale);
    if (hintEl) placeHint();
  }

  /* ---------- Nuptial flight: the winged queen flies off ---------- */

  // From her place behind the eggs she crawls along the floor to the
  // tunnel and all the way up it with her wings folded back, walks a little
  // way onto the ant hill, beats her wings for a moment, then flies off the
  // top of the screen to the right.
  const ALATE = {
    home: 17,           // where she rests: her middle, in pixels right of the cave center
    extras: [[8, -2, 'right'], [-7, -1, 'left'], [15, -3, 'right'], [-14, 0, 'left'], [22, -2, 'right']],   // Nuptial swarm: the others, [across, up/down, facing] from her
    nodWaitMin: 1500,   // her idle twitch: pause between antenna dips, in milliseconds
    nodWaitMax: 4500,
    nodHold: 300,       // how long a dip lasts
    crawlSpeed: 40,     // pixels a second, along the floor, up the tunnel and along the hill
    walk: 12,           // pixels she walks out from the tunnel before taking off
    stepMs: 140,        // each leg picture (alateCrawl1, 2) shows this long
    warmUpMs: 600,      // wings beating before she lifts off
    flyMs: 2200,        // from lift-off to off the screen
    beatMs: 70,         // each wing picture (alate1 to 4) shows this long
    drift: 60,          // pixels she moves right on the way up
    bob: 1,             // pixels she bobs up and down as she flies
    followMs: 450       // Nuptial swarm: the others set off this long apart, behind her
  };

  // Where her crawl starts and turns: along the floor (her middle 5 rows
  // up), then up from the floor to half out of the tunnel's mouth.
  function alatePath(dx = 0) {
    const floorY = center.y + CAVE.floor;
    const homeX = center.x + ALATE.home + dx;
    const climbBottom = floorY - 10;                 // her middle, standing on end on the floor
    const turnX = tunnelX(climbBottom);
    const climbTop = ground - HILL.height;
    return { floorY, homeX, turnX, climbBottom, climbTop };
  }

  function alateTimes(dx = 0) {
    const path = alatePath(dx);
    const speed = ALATE.crawlSpeed / 1000;
    const floor = Math.abs(path.turnX - path.homeX) / speed;
    const climb = (path.climbBottom - path.climbTop) / speed;
    const walk = ALATE.walk / speed;
    return { floor, climb, walk, warmUp: ALATE.warmUpMs, fly: ALATE.flyMs, total: floor + climb + walk + ALATE.warmUpMs + ALATE.flyMs };
  }

  function setAlate(on, count) {
    const extra = on ? Math.max(0, Math.min((count || 1) - 1, ALATE.extras.length)) : 0;
    if (alateHome === on && alateExtras === extra) return;
    alateHome = on;
    alateExtras = extra;
    redraw();
  }

  // Her idle twitch: wait, lower the antenna briefly, repeat.
  function alateNodLoop() {
    setTimeout(() => {
      if (!alateHome || alate) return alateNodLoop();
      alateNod = true;
      redraw();
      setTimeout(() => {
        alateNod = false;
        redraw();
        alateNodLoop();
      }, ALATE.nodHold);
    }, between(ALATE.nodWaitMin, ALATE.nodWaitMax));
  }

  // `count`: how many alates fly (Nuptial swarm), her included.
  function flyAway(count, done) {
    if (typeof count === 'function') { done = count; count = 1; }
    if (alate && alate.done) alate.done();
    alate = { start: performance.now(), done, extras: Math.max(0, Math.min((count || 1) - 1, ALATE.extras.length)) };
    requestAnimationFrame(moveAlate);
  }

  function moveAlate() {
    if (!alate) return;
    if (performance.now() - alate.start >= swarmTotal()) {
      const done = alate.done;
      alate = null;
      redraw();
      if (done) done();
      return;
    }
    redraw();
    requestAnimationFrame(moveAlate);
  }

  // How many rows the ant hill rises above the ground at column x.
  function hillHeightAt(x) {
    const left = tunnelX(ground) - CAVE.tunnelWidth / 2;
    const right = left + CAVE.tunnelWidth - 1;
    if (x >= left && x <= right) return HILL.height;
    const d = x < left ? left - x : x - right;
    return Math.max(0, Math.round(HILL.height * (1 - (d / HILL.reach) ** 2)));
  }

  // Nuptial swarm: the others set off one after another behind her
  // (ALATE.followMs apart), each from its own place, and every other one
  // flies off to the left instead.
  function swarmTotal() {
    let most = alateTimes().total;
    ALATE.extras.slice(0, alate ? alate.extras : 0).forEach(([dx], n) => { most = Math.max(most, (n + 1) * ALATE.followMs + alateTimes(dx).total); });
    return most;
  }

  function drawAlate(g) {
    const ms = performance.now() - alate.start;
    const floorY = center.y + CAVE.floor;
    ALATE.extras.slice(0, alate.extras).forEach(([dx, dy, face], n) => {
      const own = ms - (n + 1) * ALATE.followMs;
      if (own < 0) Sprites.paintTurned(g, 'alateCrawl1', center.x + ALATE.home + dx, floorY - 5 + dy, face);   // (still waiting its turn)
      else if (own < alateTimes(dx).total) drawOneAlate(g, own, dx, n % 2 === 0 ? -1 : 1, (n + 1) * 7);
    });
    if (ms < alateTimes().total) drawOneAlate(g, ms, 0, 1, 0);
  }

  // One alate on its way: `dx` its place from hers, `way` 1 to fly off to the
  // right or -1 to the left, `wobble` to set its bob apart.
  function drawOneAlate(g, ms, dx, way, wobble) {
    const times = alateTimes(dx);
    const crawlName = 'alateCrawl' + (1 + Math.floor(ms / ALATE.stepMs) % 2);
    const crawl = Sprites.sizeOf('alateCrawl1');
    const fly = Sprites.sizeOf('alate1');

    const path = alatePath(dx);

    // 1. Along the floor from her place to below the tunnel.
    if (ms < times.floor) {
      const step = ALATE.crawlSpeed * ms / 1000;
      const x = Math.round(path.homeX + Math.sign(path.turnX - path.homeX) * step);
      Sprites.paintTurned(g, crawlName, x, path.floorY - 5, path.turnX < path.homeX ? 'left' : 'right');
      return;
    }
    ms -= times.floor;

    // 2. Up the tunnel, head first, until she is half out of its mouth.
    if (ms < times.climb) {
      const y = Math.round(path.climbBottom - ALATE.crawlSpeed * ms / 1000);
      Sprites.paintTurned(g, crawlName, tunnelX(y), y, 'up');
      return;
    }
    ms -= times.climb;

    // 3. Along the top of the hill to the right, feet on the dirt.
    const startX = tunnelX(ground);
    const walked = Math.min(ALATE.walk, ALATE.crawlSpeed * ms / 1000);
    const middle = Math.round(startX + walked);
    const feet = ground - hillHeightAt(middle) - 1;    // the row just above the dirt
    const left = middle - Math.floor(crawl.cols / 2);
    if (ms < times.walk) {
      Sprites.paint(g, crawlName, left, feet - crawl.rows + 1);
      return;
    }
    ms -= times.walk;

    // 4. Wings open and beat while she stands. 5. Off she flies.
    const beat = 'alate' + (1 + Math.floor(ms / ALATE.beatMs) % 4);
    const top = feet - fly.rows + 1;
    if (ms < times.warmUp) {
      Sprites.paint(g, beat, left, top);
      return;
    }
    ms -= times.warmUp;
    const t = Math.min(1, ms / times.fly);
    const rise = top + fly.rows + 2;                 // far enough to leave the top
    const x = left + way * ALATE.drift * t * t;
    const y = top - rise * (0.4 * t + 0.6 * t * t) + Math.sin((ms + wobble * 23) / 160) * ALATE.bob * Math.min(1, t * 4);
    if (way < 0) Sprites.paintTurned(g, beat, Math.round(x) + Math.floor(fly.cols / 2), Math.round(y) + Math.floor(fly.rows / 2), 'left');
    else Sprites.paint(g, beat, Math.round(x), Math.round(y));
  }

  /* ---------- Fire ant raids and the alarm pheromone ---------- */

  function startRaid(count, invade) {
    Wanderers.spawnFire(world, count, invade);
    redraw();
  }

  /* A marauder ant raid (perk page II): `count` marauders, half from each edge (ants.js). */
  function startMarauders(count) {
    Wanderers.spawnMarauders(world, count);
    redraw();
  }

  function armAlarm(done) {
    alarmArmed = done || (() => {});
    canvas.style.cursor = 'crosshair';
  }

  function cancelAlarm() {
    if (!alarmArmed) return;
    const done = alarmArmed;
    alarmArmed = null;
    canvas.style.cursor = '';
    done(false);
  }

  function placeAlarm(point) {
    const done = alarmArmed;
    alarmArmed = null;
    canvas.style.cursor = '';
    alarmCloud = { x: point.x, y: point.y, until: Date.now() + ALARM.lastsMs };
    Sound.sfx('alarm');
    // On the grass: the soldiers gather on the grass there. In the dirt: the
    // nearest place in the nest.
    const spot = point.y < ground
      ? { x: Math.min(Math.max(Math.round(point.x), 5), cols - 6), y: surfaceRow() }
      : world.nearestStand('worker', point.x, point.y, 30);
    if (spot) Wanderers.rally(spot);
    redraw();
    done(true);
  }

  /* ---------- The queen's idle animation ---------- */

  function between(min, max) {
    return min + Math.random() * (max - min);
  }

  // Antenna: wait a moment, nod briefly, repeat.
  function nodLoop() {
    setTimeout(() => {
      queenNod = true;
      redraw();
      setTimeout(() => {
        queenNod = false;
        redraw();
        nodLoop();
      }, QUEEN_IDLE.nodHold);
    }, between(QUEEN_IDLE.nodWaitMin, QUEEN_IDLE.nodWaitMax));
  }

  // Breathing: the shine on her back shifts over and back.
  function breathLoop() {
    setTimeout(() => {
      queenShine = !queenShine;
      redraw();
      breathLoop();
    }, between(QUEEN_IDLE.breathMin, QUEEN_IDLE.breathMax));
  }

  /* ---------- Zooming and moving the view ---------- */

  function setView(x, y) {
    const maxX = Math.max(0, Math.ceil(cols - cols / zoom));
    const maxY = Math.max(0, Math.ceil(rows - rows / zoom));
    viewX = Math.min(Math.max(Math.round(x), 0), maxX);
    viewY = Math.min(Math.max(Math.round(y), 0), maxY);
  }

  // Zoom one step in (+1) or out (-1), keeping the spot under the mouse
  // (or the middle of the view) where it is.
  function zoomBy(step, event) {
    const at = Math.max(0, zooms.indexOf(zoom));
    const next = zooms[Math.min(Math.max(at + step, 0), zooms.length - 1)];
    if (next === zoom) return;

    const box = canvas.getBoundingClientRect();
    const anchorX = event ? event.clientX - box.left : box.width / 2;
    const anchorY = event ? event.clientY - box.top : box.height / 2;
    const gameX = viewX + anchorX / screenScale();
    const gameY = viewY + anchorY / screenScale();

    zoom = next;
    setView(gameX - anchorX / screenScale(), gameY - anchorY / screenScale());
    edgeView = null;
    setHover(null);
    canvas.classList.toggle('can-drag', zoom > 1);
    redraw();
    if (zoomHandler) zoomHandler(zoom, zooms[zooms.length - 1]);
    edgeCheck();   // zoomed in with the mouse already near an edge
  }

  /*
   * Sliding the view: while zoomed in, holding the mouse near an edge of the
   * field moves the view that way, faster the closer it is to the edge.
   */

  // How hard the mouse pushes each way: -1 (at the left or top edge) to 1
  // (right or bottom), 0 away from the edges.
  function edgePush() {
    const box = canvas.getBoundingClientRect();
    const push = (low, high, at) => {
      if (at - low < EDGE_ZONE) return -(1 - Math.max(0, at - low) / EDGE_ZONE);
      if (high - at < EDGE_ZONE) return 1 - Math.max(0, high - at) / EDGE_ZONE;
      return 0;
    };
    return { x: push(box.left, box.right, edgeMouse.x), y: push(box.top, box.bottom, edgeMouse.y) };
  }

  function edgeSlide(time) {
    const push = edgeMouse && zoom > 1 && !press ? edgePush() : { x: 0, y: 0 };
    if (push.x === 0 && push.y === 0) {
      edgeView = null;
      edgeTime = 0;
      edgeSince = 0;
      return;
    }
    if (!edgeSince) edgeSince = time;
    if (time - edgeSince < EDGE_DELAY) {   // not yet: the mouse has to rest there a moment
      edgeTime = time;
      requestAnimationFrame(edgeSlide);
      return;
    }
    const seconds = edgeTime ? Math.min(time - edgeTime, 50) / 1000 : 0;
    edgeTime = time;
    if (!edgeView) edgeView = { x: viewX, y: viewY };
    const step = EDGE_SPEED / screenScale() * seconds;   // in game pixels
    const maxX = Math.max(0, Math.ceil(cols - cols / zoom));
    const maxY = Math.max(0, Math.ceil(rows - rows / zoom));
    edgeView.x = Math.min(Math.max(edgeView.x + push.x * step, 0), maxX);
    edgeView.y = Math.min(Math.max(edgeView.y + push.y * step, 0), maxY);
    const before = viewX + ',' + viewY;
    setView(edgeView.x, edgeView.y);
    if (viewX + ',' + viewY !== before) {
      if (tool) setHover(squareAt({ clientX: edgeMouse.x, clientY: edgeMouse.y }));
      redraw();
    }
    requestAnimationFrame(edgeSlide);
  }

  // Start sliding if the mouse is near an edge (and it isn't already).
  function edgeCheck() {
    if (edgeTime || !edgeMouse || zoom <= 1 || press) return;
    const push = edgePush();
    if (push.x !== 0 || push.y !== 0) {
      edgeTime = performance.now();
      requestAnimationFrame(edgeSlide);
    }
  }

  /* ---------- Mouse ---------- */

  // Where the mouse is, in game pixels.
  function gamePoint(event) {
    const box = canvas.getBoundingClientRect();
    const scale = screenScale();
    return {
      x: viewX + (event.clientX - box.left) / scale,
      y: viewY + (event.clientY - box.top) / scale
    };
  }

  // The tool square whose middle is nearest the mouse, with the pixels the
  // tool would change there.
  function toolSize() {
    return tool === 'trail' || tool === 'midden' ? TRAIL.size : tool === 'aphid' ? APHID.size : tool === 'fungus' ? FUNGUS.size : tool === 'replete' ? REPLETE.size : BIG.kinds.includes(tool) ? BIG.size : size;
  }

  function squareAt(event) {
    return squareAtPoint(gamePoint(event));
  }

  // The pheromone trail in a trail-block-sized square centered on a point.
  function trailSquareAt(point) {
    const x0 = Math.round(point.x) - TRAIL.size / 2;
    const y0 = Math.round(point.y) - TRAIL.size / 2;
    const marked = [];
    for (let y = y0; y < y0 + TRAIL.size; y++) {
      for (let x = x0; x < x0 + TRAIL.size; x++) {
        if (x >= 0 && y >= 0 && x < cols && y < rows && (trail[y * cols + x] || midden[y * cols + x])) marked.push(y * cols + x);
      }
    }
    return { x: x0, y: y0, pixels: marked };
  }

  function squareAtPoint(point) {
    if (tool === 'delete') {
      if (stroke && stroke.erase) return trailSquareAt(point);   // dragging: trail only, never a structure
      const s = structureAt(Math.floor(point.x), Math.floor(point.y));
      if (s) return { x: s.x, y: s.y, pixels: structurePixels(s) };
      return trailSquareAt(point);   // no structure here: the trail under the mouse
    }
    if (tool === 'caterpillar') {
      const x = Math.round(point.x) - CATERPILLAR.w / 2;
      const y = Math.round(point.y) - CATERPILLAR.h / 2;
      return { x, y, pixels: reach(tool, x, y, 0) };
    }
    if (tool === 'granary' || tool === 'nursery') {
      const x = Math.round(point.x) - GRANARY.width / 2;
      const y = Math.round(point.y) - GRANARY.space / 2;
      return { x, y, pixels: reach(tool, x, y, 0) };
    }
    if (BIG.kinds.includes(tool)) {
      hideForMerge(point);   // the 10 nearest the mouse are the ones it would use (and their space is free)
      const { w, h } = bigDims(tool);
      const x = Math.round(point.x) - Math.floor(w / 2);   // (whole pixels: a Seed Vault is an odd 21 tall)
      const y = Math.round(point.y) - Math.floor(h / 2);
      return { x, y, pixels: reach(tool, x, y, 0) };
    }
    const s = toolSize();
    const x = Math.round(point.x) - s / 2;
    const y = Math.round(point.y) - s / 2;
    return { x, y, pixels: reach(tool, x, y, s) };
  }

  // Remember the square under the mouse and tell popup.js how many pixels
  // it would change, so the price shown can follow the mouse.
  // Structures (not hidden for a merge) overlapping a w x h square at (x, y):
  // [{ x, y, w, h }].
  function structuresIn(x, y, w, h) {
    const found = [];
    const add = (item, iw, ih) => {
      if (!mergeHidden.has(item) && item.x < x + w && item.x + iw > x && item.y < y + h && item.y + ih > y) found.push({ x: item.x, y: item.y, w: iw, h: ih });
    };
    for (const g of granaries) if (!g.vault) add(g, GRANARY.width, GRANARY.space);
    for (const n of nurseries) add(n, GRANARY.width, GRANARY.space);
    for (const c of caterpillars) add(c, CATERPILLAR.w, CATERPILLAR.h);
    for (const v of vaults) add(v, BIG.size, BIG.vaultHeight);
    for (const p of pens) add(p, p.size || APHID.size, p.size || APHID.size);
    for (const f of gardens) add(f, f.size || FUNGUS.size, f.size || FUNGUS.size);
    for (const r of repletes) add(r, r.size || REPLETE.size, r.h || r.size || REPLETE.size);
    return found;
  }

  // While a structure's square (or a trail block) is red because it overlaps
  // other structures, those flash red too, once it has been so for
  // CONFLICT.after milliseconds.
  const CONFLICT = { after: 200, blinkMs: 250, color: 'rgba(225, 40, 30, 0.75)' };
  const PLACED = ['aphid', 'granary', 'nursery', 'caterpillar', 'trail', 'midden', 'fungus', 'replete'];
  function noteConflict(square) {
    let rects = [];
    if (square && square.pixels.length === 0 && (PLACED.includes(tool) || BIG.kinds.includes(tool))) {
      const w = tool === 'caterpillar' ? CATERPILLAR.w : tool === 'granary' || tool === 'nursery' ? GRANARY.width : BIG.kinds.includes(tool) ? bigDims(tool).w : toolSize();
      const h = tool === 'caterpillar' ? CATERPILLAR.h : tool === 'granary' || tool === 'nursery' ? GRANARY.space : BIG.kinds.includes(tool) ? bigDims(tool).h : toolSize();
      rects = structuresIn(square.x, square.y, w, h);
    }
    if (rects.length === 0) {
      conflict = null;
      return;
    }
    const key = rects.map((r) => r.x + ',' + r.y).join(' ');
    if (!conflict || conflict.key !== key) conflict = { key, rects, since: Date.now() };
  }

  // Is a conflict showing (so the field redraws to make it blink)?
  function conflictShowing(now) {
    return !!conflict && now - conflict.since >= CONFLICT.after;
  }

  function setHover(next) {
    noteConflict(next);
    const before = hover ? hover.pixels.length : 0;
    hover = next;
    const after = hover ? hover.pixels.length : 0;
    if (hoverHandler && before !== after) hoverHandler(after);
  }

  // Tools that can be dragged to paint a stroke (an aphid is placed with a click).
  function strokeTool() {
    return tool === 'dig' || tool === 'fill' || tool === 'trail' || tool === 'midden';
  }

  function onDown(event) {
    if (alate) return;   // no clicks on the field while the new queen flies off
    if (event.button !== 0) return;
    const point = gamePoint(event);
    if (flagPicking) {   // putting the store flag down: on the nearest floor to the click
      event.preventDefault();
      dragEndedAt = Date.now();
      const spot = flagSpotNear(point.x, point.y);
      if (spot >= 0) {
        storeFlag = spot;
        storeFlagAuto = false;   // (put there by the player: it stays)
        flagPlacedShowUntil = Date.now() + 1000;   // (shown a second even with seeds set to EAT)
        setTimeout(redraw, 1050);
        const done = flagPicking;
        flagPicking = null;
        canvas.style.cursor = '';
        done(true);
      } else {
        popText('Not there', 'pop-steal', point.x, point.y - 4);
      }
      redraw();
      return;
    }
    if (beetle && Math.abs(point.x - beetle.x) <= BEETLE.reach + 3 && Math.abs(point.y - beetle.y) <= BEETLE.reach) {
      // Caught the rove beetle (before any tool is used). popup.js says what it gave.
      event.preventDefault();
      const caught = beetle;
      beetle = null;
      dragEndedAt = Date.now();   // the click that follows does nothing else
      const label = beetleHandler ? beetleHandler() : '';
      if (label) popText(label, 'pop-queen', caught.x, caught.y - 5);
      redraw();
      return;
    }
    if (broodHandler && !strokeTool()) {
      // Brood tending: a click on an egg or pupa beside the queen.
      const floorY = center.y + CAVE.floor;
      const item = brood.find((b) => point.x >= center.x + BROOD_SPOTS[b.spot] - 1 && point.x <= center.x + BROOD_SPOTS[b.spot] + SPOT_WIDTH + 1 && point.y >= floorY - 9 && point.y <= floorY + 1);
      if (item && broodHandler(item.spot)) {
        event.preventDefault();
        dragEndedAt = Date.now();
        return;
      }
    }
    if (alarmArmed) {
      event.preventDefault();
      placeAlarm(point);
      dragEndedAt = Date.now();   // the click that follows does nothing else
      return;
    }
    if (tool === 'delete' && useHandler && !onCrumb(point) && !structureAt(Math.floor(point.x), Math.floor(point.y))) {
      // The trash can held down where there is no structure: a drag that
      // takes away pheromone trail (only trail) wherever it passes.
      event.preventDefault();
      stroke = { x: null, y: null, point, used: false, start: point, lock: null, erase: true };
      strokeAt(point);
      return;
    }
    if (strokeTool() && useHandler && !onCrumb(point)) {
      // Holding the button down with a tool paints: every square the mouse
      // passes over is used, paid for by the pixel.
      event.preventDefault();
      stroke = { x: null, y: null, point, used: false, start: point, lock: null };
      strokeAt(point);
      return;
    }
    press = { x: event.clientX, y: event.clientY, viewX, viewY, dragged: false };
  }

  // Use the tool's square centered on this point, unless it is the square
  // used last. popup.js decides whether it can be paid for.
  function strokeAt(point) {
    const square = squareAtPoint(point);
    if (square.x === stroke.x && square.y === stroke.y) return;
    stroke.x = square.x;
    stroke.y = square.y;
    if (square.pixels.length === 0) return;
    const usedTool = stroke.erase ? 'eraseTrail' : tool;
    const usedSize = toolSize();
    useHandler({
      tool: usedTool,
      size: usedSize,
      pixels: square.pixels.length,
      first: !stroke.used,
      apply: () => {
        stroke.used = true;
        applyTool(usedTool, square.pixels);
        // The square under the mouse now has less (or nothing) left to change.
        setHover(usedTool === 'eraseTrail' ? trailSquareAt({ x: square.x + TRAIL.size / 2, y: square.y + TRAIL.size / 2 }) : { x: square.x, y: square.y, pixels: reach(usedTool, square.x, square.y, usedSize) });
        redraw();
      }
    });
  }

  // Keep a drag on straight lines (LINE): returns where to paint for the
  // mouse at `point`, or null to paint nothing yet. stroke.lock is 'across'
  // (y kept) or 'down' (x kept).
  //
  // With Line assist on, a drag is only ever straight across or straight
  // down, joined by square corners, never at a slant:
  //   - It starts once the mouse has gone LINE.lockAfter pixels, along
  //     whichever way it went most.
  //   - It stays on its line until the mouse is more than stroke.tol pixels
  //     off it (a tool's width, at least LINE.drift, to begin with). Then
  //     painting waits while the mouse goes up to LINE.turnWait pixels,
  //     watching which way it heads over each few pixels (a hand rounds a
  //     corner off):
  //       heading the other way: a corner, right where the line already
  //         painted ends (so nothing sticks out past it), the new line
  //         starting there;
  //       heading along the same way, not far off (under LINE.stepAfter
  //         tool widths): on along the old line, which now lets the mouse
  //         stray that far before it counts as leaving;
  //       heading along the same way, far off: a step, two corners over to
  //         the mouse's line, then on along that.
  //     Still unclear after turnWait pixels, it goes whichever way the
  //     mouse went most.
  //   The corners are painted first, by onMove (stroke.corners).
  // Shift keeps it on one line however far the mouse goes off it.
  function steady(point, shift) {
    const painting = tool === 'trail' || tool === 'midden';   // trail and midden follow the mouse exactly (Shift still holds a line)
    if ((!lineAssist || painting) && !shift) {
      stroke.lock = null;
      stroke.turn = null;
      stroke.start = point;
      return point;
    }
    const width = Math.max(LINE.drift, toolSize());
    const mostly = (vx, vy) => (Math.abs(vx) >= Math.abs(vy) ? 'across' : 'down');
    const clearly = (vx, vy) => (Math.abs(vy) <= Math.abs(vx) * LINE.slope ? 'across' : Math.abs(vx) <= Math.abs(vy) * LINE.slope ? 'down' : null);
    const offOf = (lock, start) => (lock === 'across' ? point.y - start.y : point.x - start.x);
    const turn = stroke.turn;
    if (turn) {
      const sx = point.x - turn.seg.x;
      const sy = point.y - turn.seg.y;
      if (Math.max(Math.abs(sx), Math.abs(sy)) < LINE.lockAfter) return null;
      let way = clearly(sx, sy);
      if (!way) {
        if (Math.hypot(point.x - turn.from.x, point.y - turn.from.y) < LINE.turnWait) {
          turn.seg = point;   // not sure yet: keep watching
          return null;
        }
        way = mostly(point.x - turn.from.x, point.y - turn.from.y);
      }
      stroke.turn = null;
      const side = offOf(turn.lock, turn.start);
      if (way !== turn.lock) {
        // A corner where the painted line ends; the new line allows for the
        // mouse having gone a little past it.
        const corner = turn.end;
        stroke.lock = way;
        stroke.start = corner;
        stroke.corners = [corner];
        stroke.tol = Math.max(width, Math.abs(offOf(way, corner)) + LINE.drift);
      } else if (Math.abs(side) < width * LINE.stepAfter) {
        stroke.lock = turn.lock;   // still the old line: on along it, a little more forgiving
        stroke.start = turn.start;
        stroke.tol = Math.abs(side) + LINE.drift;
      } else {
        // A step over to the mouse's line.
        const over = turn.lock === 'across' ? { x: point.x, y: turn.start.y } : { x: turn.start.x, y: point.y };
        stroke.lock = turn.lock;
        stroke.start = { x: point.x, y: point.y };
        stroke.corners = [over, stroke.start];
        stroke.tol = width;
      }
    } else if (!stroke.lock) {
      const dx = point.x - stroke.start.x;
      const dy = point.y - stroke.start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LINE.lockAfter) return stroke.start;   // which way? (paint nothing at a slant meanwhile)
      stroke.lock = mostly(dx, dy);
      stroke.tol = width;
    }
    if (!shift && Math.abs(offOf(stroke.lock, stroke.start)) > stroke.tol) {
      // Left the line: see which way it goes.
      stroke.turn = { lock: stroke.lock, start: stroke.start, end: stroke.end || stroke.start, from: point, seg: point };
      stroke.lock = null;
      return null;
    }
    stroke.end = stroke.lock === 'across' ? { x: point.x, y: stroke.start.y } : { x: stroke.start.x, y: point.y };
    return stroke.end;
  }

  // Follow the mouse from the last point to this one in half-pixel steps,
  // so a quick drag leaves no gaps.
  function strokeTo(point) {
    const from = stroke.point;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(point.x - from.x), Math.abs(point.y - from.y)) * 2));
    for (let n = 1; n <= steps; n++) {
      strokeAt({ x: from.x + (point.x - from.x) * n / steps, y: from.y + (point.y - from.y) * n / steps });
    }
    stroke.point = point;
  }

  function endStroke() {
    const used = stroke.used;
    stroke = null;
    dragEndedAt = Date.now();   // the click that follows is not a second use
    if (!used) return;
    paintBand();
    redraw();
    if (strokeEndHandler) strokeEndHandler();
  }

  // Listens on the whole window so a drag keeps going if the mouse leaves the field.
  function onMove(event) {
    mouse = { x: event.clientX, y: event.clientY };
    if (!cooldownBar.hidden) placeCooldown();

    if (stroke) {
      const mousePoint = gamePoint(event);
      lastPoint = mousePoint;
      const point = steady(mousePoint, event.shiftKey);   // (null: waiting to see which way a turn goes)
      edgeMouse = event.target === canvas ? { x: event.clientX, y: event.clientY } : null;
      edgeCheck();
      if (stroke.corners && event.target === canvas) for (const corner of stroke.corners) strokeTo(corner);   // a turn or step: the corners first
      stroke.corners = null;
      if (point && event.target === canvas) strokeTo(point);
      else if (point) stroke.point = point;   // off the field: paint nothing, pick up again from where it comes back
      setHover(squareAtPoint(point || mousePoint));
      redraw();
      return;
    }

    // Dragging moves the view while zoomed in.
    if (press && zoom > 1) {
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (press.dragged || Math.abs(dx) >= DRAG_START || Math.abs(dy) >= DRAG_START) {
        press.dragged = true;
        const scale = screenScale();
        setView(press.viewX - dx / scale, press.viewY - dy / scale);
        edgeView = null;
        setHover(null);
        redraw();
        return;
      }
    }

    edgeMouse = event.target === canvas ? { x: event.clientX, y: event.clientY } : null;
    if (event.target !== canvas) return;
    edgeCheck();
    const point = gamePoint(event);
    lastPoint = point;
    hoverMidden(point, event);
    const overCrumb = onCrumb(point);
    canvas.classList.toggle('on-crumb', overCrumb);
    if (overCrumb && hover) {
      setHover(null);
      redraw();
    }
    if (!tool || overCrumb) return;
    const x = Math.round(point.x) - toolSize() / 2;
    const y = Math.round(point.y) - toolSize() / 2;
    if (hover && hover.x === x && hover.y === y) return;
    setHover(squareAt(event));
    redraw();
  }

  function onUp() {
    if (stroke) endStroke();
    if (press && press.dragged) dragEndedAt = Date.now();
    press = null;
  }

  // The mouse over a midden: popup.js shows how full it is, by the mouse.
  let middenHovered = 0;
  function hoverMidden(point, event) {
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    const label = x >= 0 && y >= 0 && x < cols && y < rows ? middenLabel[y * cols + x] : 0;
    const pile = piles[label - 1];
    if (!pile) {
      if (middenHovered && middenHoverHandler) middenHoverHandler(null);
      middenHovered = 0;
      return;
    }
    middenHovered = label;
    if (middenHoverHandler) middenHoverHandler({ full: pileFull(pile), size: pile.size, blooming: !!(bloom && bloom.pile === pile) }, event.clientX, event.clientY);
  }

  function onLeave() {
    if (middenHovered && middenHoverHandler) middenHoverHandler(null);
    middenHovered = 0;
    edgeMouse = null;
    if (!hover) return;
    setHover(null);
    redraw();
  }

  function onClick(event) {
    if (Date.now() - dragEndedAt < 100) return;   // the end of a drag is not a click
    if (anteater && hitTongue(gamePoint(event))) { redraw(); return; }   // the anteater's tongue, dragging an ant
    const clicked = crumbAt(gamePoint(event));
    if (clicked) {
      biteCrumb(clicked);
      return;
    }
    if (!tool || !useHandler || strokeTool()) return;   // dig, fill and trail are used on mouse down
    lastPoint = gamePoint(event);
    const square = squareAt(event);
    setHover(square);
    if (square.pixels.length === 0) return;

    const usedTool = tool;
    useHandler({
      tool: usedTool,
      size,
      pixels: square.pixels.length,
      apply: () => {
        applyTool(usedTool, square.pixels);
        // The same square now has nothing left to change.
        setHover({ x: square.x, y: square.y, pixels: reach(usedTool, square.x, square.y, toolSize()) });
        redraw();
      }
    });
  }

  function onWheel(event) {
    event.preventDefault();
    const now = Date.now();
    if (now - wheelSteppedAt < WHEEL_PAUSE) {
      wheelSum = 0;
      return;
    }
    wheelSum += event.deltaY;
    if (Math.abs(wheelSum) < 30) return;
    const step = wheelSum < 0 ? 1 : -1;
    wheelSum = 0;
    wheelSteppedAt = now;
    zoomBy(step, event);
  }

  /* ---------- Controls used by popup.js ---------- */

  /* Set up the display with the starting cave. Call once. */
  // Size the world to the screen at the fit now, with the starting cave.
  // Everything sized by the world starts over here.
  function sizeWorld() {
    const box = canvas.parentElement.getBoundingClientRect();
    cols = Math.ceil(box.width / (PIXEL * fit));
    rows = Math.ceil(box.height / (PIXEL * fit));
    canvas.width = Math.round(cols * PIXEL * fit * RES);
    canvas.height = Math.round(rows * PIXEL * fit * RES);
    ctx = canvas.getContext('2d');

    ground = SKY_ROWS + GRASS_ROWS;
    center = { x: Math.floor(cols / 2), y: Math.floor((ground + rows) / 2) };

    frame = newLayer();
    baseLayer = newLayer();
    caveLayer = newLayer();
    bandLayer = newLayer();
    trailMarkLayer = newLayer();
    supportLayer = newLayer();
    drawBase();

    open = new Uint8Array(cols * rows);
    trail = new Uint8Array(cols * rows);
    midden = new Uint8Array(cols * rows);
    middenNear = new Uint8Array(cols * rows);
    middenLabel = new Int32Array(cols * rows);
    penMask = new Uint8Array(cols * rows);
    fungusMask = new Uint8Array(cols * rows);
    repleteMask = new Uint8Array(cols * rows);
    granaryMask = new Uint8Array(cols * rows);
    supportMask = new Uint8Array(cols * rows);
    hiddenMask = new Uint8Array(cols * rows);
    chamber = new Uint8Array(cols * rows);
    markChamber(chamber);
    carveStartingCave();
    startMask = open.slice();
    zoom = 1;
    viewX = 0;
    viewY = 0;
  }

  // Polydomy's second level: a smaller drawing, so a bigger world. Call
  // before the saved cave is loaded (the cave is kept centered).
  function setFit(value) {
    if (value === fit) return;
    fit = value;
    // Zooming in once shows the nest as it looked before; then the usual steps.
    zooms = fit < 1 ? [1].concat(ZOOMS.map((z) => z / fit)) : ZOOMS;
    sizeWorld();
    crumbs = [freshCrumb()];
    caveChanged();
    if (fit < 1) {
      // Start zoomed in one step: the nest as it looked before, the sky at the top.
      zoom = zooms[1];
      setView((cols - cols / zoom) / 2, 0);
      canvas.classList.toggle('can-drag', true);
      if (zoomHandler) zoomHandler(zoom, zooms[zooms.length - 1]);
    }
    redraw();
  }

  function init(target) {
    canvas = target;
    sizeWorld();

    const crumbArt = Sprites.ART.crumb;
    crumbCells = [];
    crumbArt.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (Sprites.PALETTE[ch]) crumbCells.push({ dx, dy, color: Sprites.PALETTE[ch] });
      });
    });
    crumbs = [freshCrumb()];
    makePartyCells();

    popLayer = document.createElement('div');
    popLayer.className = 'pops';
    canvas.parentElement.appendChild(popLayer);
    hintEl = document.createElement('div');
    hintEl.hidden = true;
    popLayer.appendChild(hintEl);
    cooldownBar = document.createElement('div');
    cooldownBar.className = 'cooldown';
    cooldownBar.hidden = true;
    cooldownBar.appendChild(document.createElement('div'));
    document.body.appendChild(cooldownBar);

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    caveChanged();
    nodLoop();
    setInterval(() => { if (caterpillars.length > 0) redraw(); }, 250);   // (the caterpillar's ripple)
    breathLoop();
    alateNodLoop();
    setInterval(() => {
      if (alate) return;   // the game stands still while the new queen flies off
      const now = Date.now();
      const blooming = tickBloom(now);   // (called every tick: the seeds burst out on time)
      const fruitFalling = tickFruit(now);
      const anteaterOn = tickAnteater(now);
      if (moveBeetle(now) || crumbRules.rain || blooming || fruitFalling || anteaterOn || partyOn(now)) redraw();   // (rain and confetti fall on every tick)   // (rain falls on every tick)
      if (updateFlood(now)) redraw();
      respawnCrumbs(now);
      const aphidsMoved = moveAphids(now);
      const granariesChanged = tickGranaries(now) | tickGardens(now) | tickRepletes(now);
      let alarmChanged = false;
      if (alarmCloud && now >= alarmCloud.until) {
        alarmCloud = null;
        Wanderers.endRally();
        alarmChanged = true;
      }
      if (Wanderers.update(now, world) || aphidsMoved || granariesChanged || alarmChanged || alarmCloud || conflictShowing(now)) redraw();
    }, ANT_CLOCK);
  }

  /*
   * Restore a saved cave.
   *   { runs: [[y, x, length], ...] }  every dug-out strip, in steps from the cave center
   *   { dug: [[x, y], ...] }           older saves: the 2x2 squares dug so far
   * Returns true if the cave had to be brought up to date (so it should be saved again).
   */
  function loadCave(saved) {
    let updated = false;
    if (saved && Array.isArray(saved.runs)) {
      open.fill(0);
      for (const run of saved.runs) {
        if (!Array.isArray(run) || run.length !== 3 || !run.every(Number.isInteger)) continue;
        setRect(open, 1, center.x + run[1], center.y + run[0], run[2], 1);
      }
      markChamber(open);   // the main chamber is always open
      // The starting tunnel is always open too: in a bigger world (Polydomy's
      // second level) it reaches the surface again from where the cave now sits.
      for (let i = 0; i < open.length; i++) if (startMask[i]) open[i] = 1;
      buildSums();         // (placing merged structures counts open pixels with these)
      trail.fill(0);
      for (const run of Array.isArray(saved.trail) ? saved.trail : []) {
        if (!Array.isArray(run) || run.length !== 3 || !run.every(Number.isInteger)) continue;
        setRect(trail, 1, center.x + run[1], center.y + run[0], run[2], 1);
      }
      for (let i = 0; i < trail.length; i++) if (!open[i]) trail[i] = 0;   // trail only on tunnel
      midden.fill(0);
      for (const run of Array.isArray(saved.midden) ? saved.midden : []) {
        if (!Array.isArray(run) || run.length !== 3 || !run.every(Number.isInteger)) continue;
        setRect(midden, 1, center.x + run[1], center.y + run[0], run[2], 1);
      }
      for (let i = 0; i < midden.length; i++) if (!open[i]) midden[i] = 0;   // midden only on tunnel
      piles = [];
      middenLabel.fill(0);
      middenChanged();
      // How full each pile was: saved by one of its pixels.
      for (const fill of Array.isArray(saved.middenFill) ? saved.middenFill : []) {
        if (!Array.isArray(fill) || fill.length !== 3 || !fill.every(Number.isFinite)) continue;
        const i = (center.y + fill[0]) * cols + center.x + fill[1];
        const pile = i >= 0 && i < midden.length ? piles[middenLabel[i] - 1] : null;
        if (pile) pile.waste = Math.min(pileHolds(pile), Math.max(0, fill[2]));
      }
      middenBodies = [];
      for (const body of Array.isArray(saved.middenBodies) ? saved.middenBodies.slice(0, MIDDEN.mostBodies) : []) {
        if (!Array.isArray(body) || body.length !== 4 || !body.every(Number.isInteger)) continue;
        const i = (center.y + body[0]) * cols + center.x + body[1];
        if (i >= 0 && i < midden.length && midden[i]) middenBodies.push({ i, marauder: body[2] === 1, face: body[3] === 1 ? 'left' : 'right' });
      }
      clearPens();
      clearGranaries();
      seeds = [];
      for (const one of Array.isArray(saved.seeds) ? saved.seeds.slice(0, SEED.mostKept) : []) {
        const x = Array.isArray(one) ? one[0] : one;   // ([x, worth] for a sunflower seed)
        const worth = Array.isArray(one) && Number.isFinite(one[1]) ? Math.min(Math.max(one[1], 1), 4) : 1;
        const kind = Array.isArray(one) && Number.isInteger(one[2]) ? seedOfIndex(one[2]) : 'sunflower';
        if (Number.isInteger(x) && x >= 0 && x + Sprites.sizeOf('seed').cols <= cols) seeds.push({ id: ++lastSeedId, x, worth, kind });
      }
      storeFlag = -1;
      storeFlagAuto = false;
      if (Array.isArray(saved.storeFlag) && saved.storeFlag.length === 2 && saved.storeFlag.every(Number.isInteger)) {
        const i = (center.y + saved.storeFlag[0]) * cols + center.x + saved.storeFlag[1];
        if (i >= 0 && i < open.length) { storeFlag = i; storeFlagAuto = saved.storeFlagAuto === true; }   // (checked when a seed is stored: filled in, and another is picked)
      }
      stash = [];
      for (const item of Array.isArray(saved.stash) ? saved.stash.slice(0, STASH.most) : []) {
        if (!Array.isArray(item) || item.length < 3 || item.length > 5 || !Number.isInteger(item[0]) || !Number.isInteger(item[1])) continue;
        const worth = Number.isFinite(item[3]) ? Math.min(Math.max(item[3], 1), 4) : 1;   // a sunflower seed
        const x = center.x + item[1], y = center.y + item[0];
        if (x >= 0 && x < cols && y > ground && y < rows && open[y * cols + x]) stash.push({ id: ++lastStashId, x, y, at: Number.isFinite(item[2]) ? Math.min(item[2], Date.now()) : Date.now(), worth, kind: Number.isInteger(item[4]) ? seedOfIndex(item[4]) : 'sunflower' });
      }
      // granarySpaces: the top-left of each 8x8 space. Older saves kept
      // granaries, the top-left of the straw alone (5 rows lower).
      const spaces = Array.isArray(saved.granarySpaces) ? saved.granarySpaces.map((g) => [g, 0])
        : Array.isArray(saved.granaries) ? saved.granaries.map((g) => [g, GRANARY.space - GRANARY.height]) : [];
      for (const [spot, shift] of spaces) {
        if (!Array.isArray(spot) || spot.length < 3 || !Number.isInteger(spot[0]) || !Number.isInteger(spot[1]) || !Number.isFinite(spot[2])) continue;
        const x0 = center.x + spot[1];
        const y0 = center.y + spot[0] - shift;
        if (granaryFits(x0, y0)) {
          addGranary(x0, y0, Math.min(spot[2], Date.now()));
          if (spot[3] === 1 && spot[2]) granaries[granaries.length - 1].aged = true;   // Seed keepers' ant bread
          if (spot[2] && Number.isFinite(spot[4]) && spot[4] > 1) granaries[granaries.length - 1].worth = Math.min(spot[4], 4);   // a sunflower seed
          if (spot[2] && Number.isInteger(spot[5])) granaries[granaries.length - 1].kind = seedOfIndex(spot[5]);
        }
      }
      if (Array.isArray(saved.nurseries)) {
        for (const n of nurseries) for (const i of granaryPixels(n.x, n.y)) if (granaryMask[i] === 3) granaryMask[i] = 0;
        nurseries = [];
        for (const spot of saved.nurseries) {
          if (!Array.isArray(spot) || spot.length !== 2 || !spot.every(Number.isInteger)) continue;
          if (granaryFits(center.x + spot[1], center.y + spot[0])) addNursery(center.x + spot[1], center.y + spot[0]);
        }
      }
      if (Array.isArray(saved.caterpillars)) {
        for (const c of caterpillars) for (const i of caterpillarPixels(c.x, c.y)) if (granaryMask[i] === 4) granaryMask[i] = 0;
        caterpillars = [];
        for (const spot of saved.caterpillars.slice(0, 1)) {
          if (!Array.isArray(spot) || spot.length !== 3 || !spot.every(Number.isFinite)) continue;
          if (caterpillarFits(center.x + spot[1], center.y + spot[0])) addCaterpillar(center.x + spot[1], center.y + spot[0], spot[2]);   // (its minute counts only while the game is open)
        }
      }
      clearRepletes();
      for (const spot of Array.isArray(saved.repletes) ? saved.repletes : []) {
        if (!Array.isArray(spot) || spot.length !== 3 || !spot.every(Number.isInteger)) continue;
        const x0 = center.x + spot[1];
        const y0 = center.y + spot[0];
        if (repleteFits(x0, y0)) addReplete(x0, y0, Math.min(Math.max(spot[2], 0), REPLETE.holds - 1));
      }
      clearGardens();
      droppedFungi = 0;
      // Gardens saved before they were 8x8 and stuck to a surface were 10x10:
      // each becomes an 8x8 garden inside its old square that touches a
      // floor (tried first), ceiling or wall. One that can not is dropped,
      // for popup.js to pay back (takeDroppedFungi).
      const oldSize = saved.fungusSize === FUNGUS.size ? 0 : 10;
      const inside = [[1, 2], [1, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 0], [2, 0], [1, 1]];
      for (const spot of Array.isArray(saved.fungi) ? saved.fungi : []) {
        if (!Array.isArray(spot) || spot.length < 3 || !spot.slice(0, 3).every(Number.isInteger)) continue;
        const x0 = center.x + spot[1];
        const y0 = center.y + spot[0];
        const stage = Math.min(Math.max(spot[2], 0), 2);
        const tries = oldSize ? inside.map(([dx, dy]) => [x0 + dx, y0 + dy]) : [[x0, y0]];
        const fit = tries.find(([x, y]) => fungusFits(x, y));
        if (fit) addGarden(fit[0], fit[1], stage, spot[3], spot[4], null, typeof spot[5] === 'string' ? spot[5] : null);   // [y, x, stage, since, bonus, side]
        else droppedFungi++;
      }
      if (oldSize && Array.isArray(saved.fungi) && saved.fungi.length) updated = true;
      for (const spot of Array.isArray(saved.pens) ? saved.pens : []) {
        if (!Array.isArray(spot) || spot.length < 2 || !Number.isInteger(spot[0]) || !Number.isInteger(spot[1])) continue;
        const x0 = center.x + spot[1];
        const y0 = center.y + spot[0];
        if (penFits(x0, y0)) addPen(x0, y0, spot[2]);
      }
      // Merged structures: [kind, y, x, what it holds]. A vault holds its seeds' storedAt times.
      for (const big of Array.isArray(saved.bigs) ? saved.bigs : []) {
        if (!Array.isArray(big) || !BIG.kinds.includes(big[0]) || !Number.isInteger(big[1]) || !Number.isInteger(big[2])) continue;
        const x0 = center.x + big[2];
        const y0 = center.y + big[1];
        if (bigFits(big[0], x0, y0)) addBig(big[0], x0, y0, big[3]);
        else if (big[0] === 'vault' && bigFits('vault', x0, y0 + 3)) addBig('vault', x0, y0 + 3, big[3]);   // (saved when a vault was 3 pixels taller)
      }
      if (!(saved.v >= CAVE_VERSION)) {
        carveTunnel();     // the newest starting tunnel, for caves saved before it
        updated = true;
      }
    } else {
      carveStartingCave();
      for (const square of (saved && saved.dug) || []) {
        setRect(open, 1, center.x + square[0], center.y + square[1], 2, 2);
      }
      clearCrumbs();
    }
    // (Another copy of the game saved: anything hidden for a merge preview is
    // worked out again from the structures just loaded.)
    mergeHidden = new Set();
    hiddenMask.fill(0);
    hideForMerge();
    caveChanged();
    return updated;
  }

  /* Back to the starting cave: just the chamber and the tunnel (a nuptial flight). */
  function resetCave() {
    carveStartingCave();
    stash = [];
    trail.fill(0);
    midden.fill(0);
    bloom = null;
    middenChanged();
    clearPens();
    clearGranaries();
    keepNurseriesThatFit();   // (nurseries stay after a flight, where there is still tunnel for them)
    caveChanged();
  }

  // A seed kind as a number for saves (0: sunflower), and back.
  function seedIndex(kind) { return Math.max(0, Sprites.SEED_KINDS.indexOf(kind)); }
  function seedOfIndex(n) { return Sprites.SEED_KINDS[n] || 'sunflower'; }

  /* The cave as it is now, in the { runs } form loadCave understands. */
  function exportCave() {
    return { v: CAVE_VERSION, runs: runsOf(open), trail: runsOf(trail), midden: runsOf(midden),
      middenFill: piles.map((pile) => [Math.floor(pile.rep / cols) - center.y, pile.rep % cols - center.x, Math.round(pile.waste * 10) / 10]),
      middenBodies: middenBodies.map((body) => [Math.floor(body.i / cols) - center.y, body.i % cols - center.x, body.marauder ? 1 : 0, body.face === 'left' ? 1 : 0]), pens: pens.filter((pen) => !pen.herd).map((pen) => [pen.y - center.y, pen.x - center.x, pen.fillStart]),
      nurseries: nurseries.map((n) => [n.y - center.y, n.x - center.x]),
      caterpillars: caterpillars.map((c) => [c.y - center.y, c.x - center.x, Math.max(0, Math.round(c.readyAt - Date.now()))]),
      granarySpaces: granaries.filter((granary) => !granary.vault).map((granary) => granary.storedAt && seedIndex(granary.kind) > 0 ? [granary.y - center.y, granary.x - center.x, granary.storedAt, granary.aged ? 1 : 0, granary.worth || 1, seedIndex(granary.kind)] : (granary.worth || 1) > 1 ? [granary.y - center.y, granary.x - center.x, granary.storedAt, granary.aged ? 1 : 0, granary.worth] : granary.aged ? [granary.y - center.y, granary.x - center.x, granary.storedAt, 1] : [granary.y - center.y, granary.x - center.x, granary.storedAt]),
      fungi: gardens.filter((garden) => !garden.chamber).map((garden) => [garden.y - center.y, garden.x - center.x, garden.stage, garden.since, garden.bonus || 0, garden.side]), fungusSize: FUNGUS.size,
      repletes: repletes.filter((r) => !r.honeypot).map((r) => [r.y - center.y, r.x - center.x, r.crumbs]),
      bigs: [].concat(
        vaults.map((v) => ['vault', v.y - center.y, v.x - center.x, granaries.filter((slot) => slot.vault === v).map((slot) => slot.storedAt)]),
        gardens.filter((garden) => garden.chamber).map((garden) => ['chamber', garden.y - center.y, garden.x - center.x, [garden.stage, garden.since, garden.bonus || 0]]),
        repletes.filter((r) => r.honeypot).map((r) => ['honeypot', r.y - center.y, r.x - center.x, r.crumbs]),
        pens.filter((pen) => pen.herd).map((pen) => ['herd', pen.y - center.y, pen.x - center.x, pen.drops])),
      seeds: seeds.map((s) => seedIndex(s.kind) > 0 ? [s.x, s.worth || 1, seedIndex(s.kind)] : (s.worth || 1) > 1 ? [s.x, s.worth] : s.x),
      storeFlag: storeFlag >= 0 ? [Math.floor(storeFlag / cols) - center.y, storeFlag % cols - center.x] : null,
      storeFlagAuto,
      stash: stash.map((item) => seedIndex(item.kind) > 0 ? [item.y - center.y, item.x - center.x, item.at, item.worth || 1, seedIndex(item.kind)] : (item.worth || 1) > 1 ? [item.y - center.y, item.x - center.x, item.at, item.worth] : [item.y - center.y, item.x - center.x, item.at]) };
  }

  // Every strip of 1s in a mask, as [y, x, length] in steps from the cave center.
  function runsOf(mask) {
    const runs = [];
    for (let y = ground; y < rows; y++) {
      let x = 0;
      while (x < cols) {
        if (!mask[y * cols + x]) { x++; continue; }
        const start = x;
        while (x < cols && mask[y * cols + x]) x++;
        runs.push([y - center.y, start - center.x, x - start]);
      }
    }
    return runs;
  }

  /* Show the pheromone trail in yellow (true, for the Build menu) or as it normally looks. */
  function setTrailView(show) {
    if (show === trailView) return;
    trailView = show;
    redraw();
  }

  /* How many aphid pens there are. */
  function aphidCount() {
    return pens.filter((pen) => !pen.herd).length;
  }

  /* How many granaries there are. */
  function caterpillarCount() {
    return caterpillars.length;
  }

  function nurseryCount() {
    return nurseries.length;
  }

  function granaryCount() {
    return granaries.filter((granary) => !granary.vault).length;
  }

  /* Take away every granary and the seed on the grass (a nuptial flight). */
  /* ---------- The anteater ----------
   * Now and then (popup.js decides when, and asks FIGHT? first) a giant
   * anteater comes: only the end of its snout and one front leg fit in the
   * view. The workers spread out through the tunnels. Its tongue shoots down
   * the tunnels to an ant (not one near the hole) and can't be stopped on the
   * way; it sticks to the ant and drags it back up, fast. Clicking the
   * tongue's end while it drags lets the ant go and sends the tongue back
   * into the snout: a hit. Five hits drive it off; after eight sticks it
   * leaves anyway. An ant dragged all the way up is eaten. Not saved. */
  const ANTEATER = {
    slideSpeed: 30, runSpeed: 70,  // game pixels a second, sliding in and out (driven off: running)
    shootSpeed: 110,               // the tongue going down (it can't be clicked then)
    dragSpeed: 36, dragPerPixel: 0.45,   // ...dragging an ant up (click its end now): faster the farther down the ant was (pixels a second, plus this much for each pixel of the way)
    backSpeed: 160,                // ...shooting back in after a hit
    waitMs: 1300,                  // between tongues
    nearest: 24,                   // it goes for ants at least this far along the tunnels from the hole
    hitsToBeat: 5, sticksMost: 8,
    clickReach: 8,                 // how close to the tongue's end a click must be (it moves fast)
    big: { snout: '#86765f', snoutDark: '#5e5243', snoutLight: '#a69580', nose: '#000000', leg: '#ddd6c6', legShade: '#b9b1a1', legEdge: '#6e6658', band: '#1c1814', claw: '#2a241e' },
    tongue: '#d76a7a', tongueDark: '#a8485a', tongueTip: '#f39aa6', pip: '#cd2e1f', pipBack: '#3a0d08', stickPip: '#f39aa6', stickBack: '#5a2a32'
  };
  let anteater = null;   // { phase: 'walk' | 'feed' | 'leave', x (how far out of place), hits, sticks, mode: 'in' | 'shoot' | 'drag' | 'back', path, len, prey, nextAt, driven }
  let anteaterHandler = null;   // told what happened: ('ate', [kinds]) and ('gone', driven)

  function holeIndex() {
    const ey = ground + 1, ex = tunnelX(ey);
    for (let d = 0; d < CAVE.tunnelWidth; d++) for (const x of [ex - d, ex + d]) if (x >= 0 && x < cols && open[ey * cols + x]) return ey * cols + x;
    return -1;
  }

  function anteaterArrive() {
    if (anteater || alate || holeIndex() < 0) return false;
    anteater = { phase: 'walk', x: 90, hits: 0, sticks: 0, mode: 'in', path: [], len: 0, prey: null, nextAt: 0, driven: false };
    redraw();
    return true;
  }

  // The workers scatter through the tunnels (it's harder to pick them off).
  function spreadWorkers() {
    for (const ant of Wanderers.list()) {
      if (ant.kind !== 'worker' || ant.red || ant.major || ant.scout || STILL_PLANS.has(ant.plan) || world.aboveGround(ant.y)) continue;
      const spot = world.destination('worker');
      if (!spot) continue;
      ant.task = null;
      ant.plan = 'visit';
      ant.visit = spot;
      ant.moveAt = Math.min(ant.moveAt, Date.now());
    }
  }

  // The tongue's way from the hole to the ant `prey`, or null.
  function pathTo(prey, steps) {
    let i = -1;
    for (let r = 0; r < 4 && i < 0; r++) for (let y = Math.round(prey.y) - r; y <= Math.round(prey.y) + r && i < 0; y++) for (let x = Math.round(prey.x) - r; x <= Math.round(prey.x) + r; x++) {
      if (x >= 0 && y > ground && x < cols && y < rows && steps[y * cols + x] >= 0) { i = y * cols + x; break; }
    }
    if (i < 0 || steps[i] < ANTEATER.nearest) return null;
    const path = [i];
    while (steps[i] > 0) {
      const x = i % cols;
      const next = [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, i - cols, i + cols].find((k) => k >= 0 && k < open.length && steps[k] === steps[i] - 1);
      if (next === undefined) return null;
      path.push(next);
      i = next;
    }
    return path.reverse();   // (hole first)
  }

  // A new tongue: at a random ant not too near the hole, which stops where it is.
  function shootTongue() {
    const hole = holeIndex();
    if (hole < 0) return false;
    const { steps } = tunnelSteps([hole]);
    const prey = Wanderers.list().filter((ant) => ant.kind !== 'fire' && !ant.red && !ant.doorhead && !ant.major && !ant.scout && !STILL_PLANS.has(ant.plan) && !world.aboveGround(ant.y));
    for (let tries = 0; tries < 12 && prey.length > 0; tries++) {
      const ant = prey.splice(Math.floor(Math.random() * prey.length), 1)[0];
      const path = pathTo(ant, steps);
      if (!path) continue;
      ant.plan = 'caught';   // (held still: the tongue is on its way)
      ant.visit = null;
      anteater.prey = ant;
      anteater.path = path;
      anteater.len = 0;
      anteater.mode = 'shoot';
      return true;
    }
    return false;
  }

  function tongueTip() {
    const a = anteater;
    if (!a.path.length) { const h = holeIndex(); return { x: h % cols, y: Math.floor(h / cols) }; }
    const i = a.path[Math.max(0, Math.min(a.path.length - 1, Math.floor(a.len)))];
    return { x: i % cols, y: Math.floor(i / cols) };
  }

  // A click on the tongue's end while it drags an ant: the ant is let go, the tongue goes back in.
  function hitTongue(point) {
    const a = anteater;
    if (!a || a.phase !== 'feed' || a.mode !== 'drag') return false;
    const tip = tongueTip();
    if (Math.max(Math.abs(point.x - tip.x), Math.abs(point.y - tip.y)) > ANTEATER.clickReach) return false;
    if (a.prey) { a.prey.plan = 'wander'; a.prey.visit = null; a.prey.moveAt = Date.now(); a.prey = null; }
    a.hits += 1;
    a.mode = 'back';
    popText('Hit!', 'pop-steal', tip.x, tip.y - 4);
    Sound.sfx('catch');
    return true;
  }

  function anteaterLeave(driven) {
    const a = anteater;
    a.phase = 'leave';
    a.driven = driven;
    if (a.prey) { a.prey.plan = 'wander'; a.prey.visit = null; a.prey = null; }
    if (a.mode !== 'in') a.mode = 'back';
  }

  // Each tick. True while there is something to draw.
  function tickAnteater(now) {
    if (!anteater) return false;
    const a = anteater;
    const dt = Math.min(0.2, (now - (a.lastAt || now)) / 1000);
    a.lastAt = now;
    if (a.phase === 'walk') {
      a.x = Math.max(0, a.x - ANTEATER.slideSpeed * dt);
      if (a.x <= 0) { a.phase = 'feed'; a.nextAt = now + ANTEATER.waitMs; spreadWorkers(); }
      return true;
    }
    // The tongue.
    if (a.mode === 'shoot') {
      a.len = Math.min(a.path.length - 1, a.len + ANTEATER.shootSpeed * dt);
      if (a.len >= a.path.length - 1) { a.mode = 'drag'; a.sticks += 1; }   // stuck on
    } else if (a.mode === 'drag') {
      a.len = Math.max(0, a.len - (ANTEATER.dragSpeed + ANTEATER.dragPerPixel * a.path.length) * dt);
      if (a.prey) { const tip = tongueTip(); a.prey.x = tip.x; a.prey.y = tip.y; }
      if (a.len <= 0) {   // up to the mouth: eaten
        if (a.prey) {
          const list = Wanderers.list();
          const n = list.indexOf(a.prey);
          if (n >= 0) list.splice(n, 1);
          const kind = a.prey.kind;
          a.prey = null;
          popText('Gulp!', 'pop-steal', tongueTip().x, ground - 6);
          if (anteaterHandler) anteaterHandler('ate', [kind]);
        }
        a.mode = 'in';
        a.nextAt = now + ANTEATER.waitMs;
      }
    } else if (a.mode === 'back') {
      a.len = Math.max(0, a.len - ANTEATER.backSpeed * dt);
      if (a.len <= 0) { a.mode = 'in'; a.nextAt = now + ANTEATER.waitMs; }
    }
    if (a.phase === 'feed' && a.mode === 'in') {
      if (a.hits >= ANTEATER.hitsToBeat) anteaterLeave(true);
      else if (a.sticks >= ANTEATER.sticksMost) anteaterLeave(false);
      else if (now >= a.nextAt && !shootTongue()) a.nextAt = now + 1000;   // (no ant to go for: it waits)
    }
    if (a.phase === 'leave' && a.mode === 'in') {
      a.x += (a.driven ? ANTEATER.runSpeed : ANTEATER.slideSpeed) * dt;
      if (a.x > 110) {
        const driven = a.driven;
        anteater = null;
        if (anteaterHandler) anteaterHandler('gone', driven);
      }
    }
    return true;
  }
  const STILL_PLANS = new Set(['fight', 'fallen', 'carried', 'healing', 'dead', 'caught', 'siege']);

  // The anteater is far too big for the view: only the end of its long, thin
  // snout, reaching down to the nest hole from up out of sight (bowed a
  // little, barely wider up high), and one huge front leg on the grass to
  // the right, stepping while it comes and goes. `off`: how far out of place.
  function paintSnoutAndLeg(g, hx, off, now, walking) {
    const C = ANTEATER.big;
    const dx = Math.round(off), dy = -Math.round(off * 0.6);
    const tx = hx + dx, ty = ground - 2 + dy;               // its tip
    const bx = hx + 36 + dx, by = ground - 50 + dy;         // up and away, out of sight
    const len = Math.hypot(bx - tx, by - ty), ux = (bx - tx) / len, uy = (by - ty) / len;
    for (let y = Math.min(ty, by) - 10; y <= Math.max(ty, by) + 10; y++) {
      for (let x = Math.min(tx, bx) - 10; x <= Math.max(tx, bx) + 10; x++) {
        const px = x - tx, py = y - ty;
        const along = px * ux + py * uy;
        if (along < -1 || along > len) continue;
        const t = Math.max(0, along / len);
        const bow = Math.sin(Math.PI * t) * 3;                // a gentle downward curve
        const side = px * -uy + py * ux - bow;
        const half = 3 + t * 2.5 + (t > 0.85 ? (t - 0.85) * 12 : 0);   // a long thin tube, the head starting at the top
        if (Math.abs(side) > half) continue;
        let color = C.snout;
        if (side > half - 1.5) color = C.snoutDark;           // its underside
        else if (side < -half + 1.5) color = C.snoutLight;    // the light along its top
        if (along < 4) color = C.nose;                        // the black tip of its nose
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
    }
    // The front leg: white, the black band at the wrist, claws on the grass. It lifts and sets down as it walks.
    const lift = walking ? Math.round(Math.max(0, Math.sin(now / 160)) * 6) : 0;
    const lx = hx + 46 + dx, top = ground - 64 + dy, foot = ground - 1 + Math.max(0, dy) - lift;
    for (let y = top; y <= foot - 3; y++) {
      const w = 16 + Math.round((y - top) / 8);
      for (let x = lx; x < lx + w; x++) {
        const edge = x === lx || x === lx + w - 1;
        let color = (y >= foot - 14 && y <= foot - 10) ? C.band : C.leg;
        if (edge) color = C.legEdge;
        else if (x >= lx + w - 3 && color === C.leg) color = C.legShade;
        g.fillStyle = color;
        g.fillRect(x, y, 1, 1);
      }
    }
    const fw = 16 + Math.round((foot - 3 - top) / 8);
    g.fillStyle = C.legShade;
    g.fillRect(lx - 2, foot - 2, fw + 3, 3);
    g.fillStyle = C.claw;
    for (const cx of [lx - 4, lx + 1, lx + 6]) { g.fillRect(cx, foot - 1, 4, 1); g.fillRect(cx - 1, foot, 2, 1); }
  }

  function drawAnteater(g) {
    if (!anteater) return;
    const a = anteater;
    const hole = holeIndex();
    const hx = hole % cols;
    const now = Date.now();
    if (a.mode !== 'in') {
      // The tongue, thick: from the snout's tip into the hole, then along the tunnels.
      const n = Math.min(a.path.length, Math.floor(a.len) + 1);
      const fat = (x, y) => g.fillRect(x - 1, y - 1, 3, 3);
      g.fillStyle = ANTEATER.tongueDark;
      for (let y = ground - 1; y <= Math.floor(hole / cols); y++) fat(hx, y);
      for (let k = 0; k < n; k++) fat(a.path[k] % cols, Math.floor(a.path[k] / cols));
      g.fillStyle = ANTEATER.tongue;
      for (let y = ground - 1; y <= Math.floor(hole / cols); y++) g.fillRect(hx, y, 1, 1);
      for (let k = 0; k < n; k++) g.fillRect(a.path[k] % cols, Math.floor(a.path[k] / cols), 1, 1);
      const tip = tongueTip();
      g.fillStyle = ANTEATER.tongueTip;
      g.fillRect(tip.x - 2, tip.y - 1, 4, 3);
      if (a.mode === 'drag' && Math.floor(now / 150) % 2) {   // its end blinks: click it!
        g.fillStyle = '#ffffff';
        g.fillRect(tip.x - 3, tip.y - 2, 6, 1);
        g.fillRect(tip.x - 3, tip.y + 2, 6, 1);
      }
    }
    paintSnoutAndLeg(g, hx, a.x, now, a.phase !== 'feed');
    // Hits to go (red) and tongues left (pink), up in the sky left of the snout.
    if (a.phase === 'feed') {
      const top = Math.max(1, ground - 20), x0 = Math.max(2, hx - 52);
      for (let k = 0; k < ANTEATER.hitsToBeat; k++) {
        g.fillStyle = k < ANTEATER.hitsToBeat - a.hits ? ANTEATER.pip : ANTEATER.pipBack;
        g.fillRect(x0 + k * 6, top, 5, 4);
      }
      for (let k = 0; k < ANTEATER.sticksMost; k++) {
        g.fillStyle = k < ANTEATER.sticksMost - a.sticks ? ANTEATER.stickPip : ANTEATER.stickBack;
        g.fillRect(x0 + k * 4, top + 6, 3, 2);
      }
    }
  }

  /* ---------- Rove beetle ----------
   * Now and then (popup.js decides when) a small Sceptobius rove beetle
   * sneaks into the nest somewhere in the tunnels, walks from one spot to
   * another for stayMs and leaves. Clicking it catches it (popup.js picks
   * the reward and says what to show). */
  const BEETLE = {
    stayMs: 200000,    // about 3 and a half minutes
    pauseSteps: 3,     // a short look around at each spot it reaches (in steps)
    stepMs: 260,       // careful steps...
    stillChance: 0.1,  // ...and now and then (this share of steps) a still pause, 4 steps long
    reach: 3,   // how close a click must be (game pixels, more side to side)
    // Reddish ambers, like the real beetle, mixed a fifth of the way toward the tunnel color: a hint of red to spot it by, but it mostly hides.
    colors: { 1: '#af733b', 2: '#753d1e', 3: '#924f27', 4: '#a35f30', 5: '#c1854e', 6: '#c89659', 7: '#7f4321' }   // legs and antennae, head, wing covers, abdomen, shine, antenna clubs, dark bands
  };

  // Is there open tunnel all over the beetle at (x, y): its whole picture,
  // legs and antennae too, so it never touches the dirt?
  function beetleRoom(x, y) {
    const size = Sprites.sizeOf('roveBeetle');
    const left = x - Math.floor(size.cols / 2);
    const top = y - Math.floor(size.rows / 2);
    return top >= ground && openIn(left, top, size.cols, size.rows) === size.cols * size.rows;
  }

  // It walks where it fits without touching the dirt ('beetle' in
  // world.canStand); in a nest with no room that big anywhere, it walks
  // like a worker instead.
  // It comes in where the player can see it: within the view as it is now
  // (the nest can be bigger than the view), or anywhere if there's no room there.
  function inView(x, y, margin) {
    const m = margin || 0;
    return x >= viewX + m && x < viewX + cols / zoom - m && y >= viewY + m && y < viewY + rows / zoom - m;
  }
  function beetleArrive() {
    for (const seen of [true, false]) {
      for (const kind of ['beetle', 'worker']) {
        for (let tries = 0; tries < 600; tries++) {
          const x = Math.floor(Math.random() * cols);
          const y = ground + 2 + Math.floor(Math.random() * (rows - ground - 2));
          if (seen && !inView(x, y, 4)) continue;
          if (world.canStand(kind, x, y)) return placeBeetle(x, y, kind);
        }
      }
    }
    return false;
  }
  function placeBeetle(x, y, kind) {
    beetle = { x, y, kind, dx: Math.random() < 0.5 ? -1 : 1, dy: 0, until: Date.now() + BEETLE.stayMs, stepAt: 0, step: 0, goal: null, waits: 0 };
    Sound.sfx('skitter');
    redraw();
    return true;
  }

  // A new spot in the tunnels for the beetle to walk to, that it can reach.
  // (A spot in the view first, so it stays where it can be seen; else anywhere.)
  function beetleGoal() {
    for (let tries = 0; tries < 60; tries++) {
      const spot = world.destination(beetle.kind);
      if (tries < 40 && spot && !inView(spot.x, spot.y, 4)) continue;
      if (spot && (spot.x !== beetle.x || spot.y !== beetle.y) && world.distance({ x: spot.x, y: spot.y }, beetle.x, beetle.y, beetle.kind) > 0) return { x: spot.x, y: spot.y };
    }
    return null;
  }

  // A careful step now and then along the shortest way to its spot; there it
  // looks around a moment and picks the next. Gone after stayMs.
  function moveBeetle(now) {
    if (!beetle) return false;
    if (now >= beetle.until) {
      beetle = null;
      return true;
    }
    if (now < beetle.stepAt) return false;
    beetle.stepAt = now + BEETLE.stepMs * (Math.random() < BEETLE.stillChance ? 4 : 1);   // ...and now and then a still pause, like a sneaking beetle
    if (beetle.waits > 0) {
      beetle.waits -= 1;
      return false;
    }
    if (!beetle.goal) beetle.goal = beetleGoal();
    if (beetle.goal) {
      const here = world.distance(beetle.goal, beetle.x, beetle.y, beetle.kind);
      if (here <= 1) {   // there: look around, then on to the next spot
        beetle.goal = null;
        beetle.waits = BEETLE.pauseSteps;
        return false;
      }
      let best = null;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const d = world.distance(beetle.goal, beetle.x + dx, beetle.y + dy, beetle.kind);
          if (d >= 0 && d < here && (!best || d < best.d)) best = { dx, dy, d };
        }
      }
      if (best) {
        beetle.x += best.dx;
        beetle.y += best.dy;
        if (best.dx) beetle.dx = best.dx;   // (faces the way it walks)
        beetle.step += 1;
        return true;
      }
      beetle.goal = null;   // the way is gone (dug or filled): pick another spot
    }
    for (let tries = 0; tries < 8; tries++) {
      const x = beetle.x + beetle.dx;
      const y = beetle.y + beetle.dy;
      if (world.canStand(beetle.kind, x, y)) {
        beetle.x = x;
        beetle.y = y;
        beetle.step += 1;
        if (Math.random() < 0.1) beetle.dy = Math.floor(Math.random() * 3) - 1;
        return true;
      }
      beetle.dx = Math.random() < 0.5 ? -1 : 1;
      beetle.dy = Math.floor(Math.random() * 3) - 1;
    }
    return false;
  }

  // Seed cache: the granaries stay after a flight; only the seeds lying on the grass go.
  function clearSeeds() {
    seeds = [];
    nextSeedAt = 0;
    redraw();
  }

  function removeGranaries() {
    clearGranaries();
    stash = [];
    seeds = [];
    nextSeedAt = 0;
    paintCave();
    redraw();
  }

  /* Called when the granaries change by themselves (a seed stored or eaten), so the cave is saved. */
  function onCaveChange(handler) {
    caveHandler = handler;
  }

  /* How many repletes there are. */
  function repleteCount() {
    return repletes.filter((r) => !r.honeypot).length;
  }

  /* Take away every replete (a nuptial flight). */
  function removeRepletes() {
    clearRepletes();
    redraw();
  }

  /* How many saved gardens the last loadCave could not place (then 0 again). */
  function takeDroppedFungi() {
    const count = droppedFungi;
    droppedFungi = 0;
    return count;
  }

  /* How many fungus gardens there are. */
  function fungusCount() {
    return gardens.filter((garden) => !garden.chamber).length;
  }

  /* Take away every fungus garden (a nuptial flight). */
  function removeFungi() {
    clearGardens();
    redraw();
  }

  /* Take away every aphid (a nuptial flight). */
  function removeAphids() {
    clearPens();
    paintCave();
    redraw();
  }

  /* Pixels marked with pheromone trail. */
  function trailPixels() {
    let n = 0;
    for (let i = 0; i < trail.length; i++) n += trail[i];
    return n;
  }

  /* The crumbs as they are now, for saving: [{ x, bits: '1101...', respawnAt }]. */
  function exportCrumbs() {
    return crumbs.filter((crumb) => !extraCrumb(crumb)).map((crumb) => ({ x: crumb.x, bits: Array.from(crumb.bits).join(''), respawnAt: crumb.respawnAt }));
  }

  /*
   * Restore saved crumbs: a list, or one crumb as older versions saved it.
   * Anything missing or broken gives a fresh crumb.
   */
  function loadCrumbs(saved) {
    const width = Sprites.sizeOf('crumb').cols;
    const list = Array.isArray(saved) ? saved : saved ? [saved] : [];
    crumbs = [];
    for (const item of list.slice(0, crumbRules.slots)) {
      const valid = item && Number.isInteger(item.x) &&
        item.x >= 0 && item.x + width <= cols &&
        typeof item.bits === 'string' && item.bits.length === crumbCells.length &&
        /^[01]*$/.test(item.bits) && Number.isFinite(item.respawnAt);
      if (!valid) {
        crumbs.push(freshCrumb());
        continue;
      }
      const crumb = { x: item.x, bits: Uint8Array.from(item.bits, (bit) => Number(bit)), respawnAt: item.respawnAt };
      // Used up but no time set for the next one: set it now.
      if (!crumb.respawnAt && crumbLeft(crumb) === 0) crumb.respawnAt = nextRespawn();
      // Never make the wait longer than the longest wait from now (the clock may have moved back).
      if (crumb.respawnAt) crumb.respawnAt = Math.min(crumb.respawnAt, Date.now() + CRUMB.respawnMax);
      crumbs.push(crumb);
    }
    while (crumbs.length < crumbRules.slots) crumbs.push(freshCrumb());
    respawnCrumbs(Date.now());
    hintSide = '';
    redraw();
  }

  // How many base structures a merge uses up (popup.js sets it).
  let mergeCount = 10;

  // While a merge tool is chosen, the structures it would use up are hidden
  // (their space can take the merged structure); they show again once
  // another tool, or none, is chosen.
  // The `count` base structures of this kind nearest a point (by their middles).
  function nearestBase(kind, point, count) {
    const sizes = { vault: [GRANARY.width, GRANARY.space], chamber: [FUNGUS.size, FUNGUS.size], honeypot: [REPLETE.size, REPLETE.size], herd: [APHID.size, APHID.size] };
    const [w, h] = sizes[kind];
    const far = (item) => Math.hypot(item.x + w / 2 - point.x, item.y + h / 2 - point.y);
    return baseList(kind).map((item) => ({ item, d: far(item) })).sort((a, b) => a.d - b.d).slice(0, count).map((o) => o.item);
  }

  // The structures a merge uses up: the 10 nearest the mouse (or, before the
  // mouse is over the field, the middle of the view).
  function hideForMerge(point) {
    if (point) mergeFocus = point;
    const focus = mergeFocus || { x: viewX + cols / zoom / 2, y: viewY + rows / zoom / 2 };
    const used = BIG.kinds.includes(tool) ? nearestBase(tool, focus, mergeCount) : [];
    if (used.length === mergeHidden.size && used.every((item) => mergeHidden.has(item))) return false;
    mergeHidden = new Set(used);
    hiddenMask.fill(0);
    const sizes = { vault: [GRANARY.width, GRANARY.space], chamber: [FUNGUS.size, FUNGUS.size], honeypot: [REPLETE.size, REPLETE.size], herd: [APHID.size, APHID.size] };
    for (const item of used) {
      const [w, h] = sizes[tool];
      for (const i of structurePixels({ x: item.x, y: item.y, w, h })) hiddenMask[i] = 1;
    }
    paintCave();
    return true;
  }

  /* Choose 'dig' or 'fill', or null to just look at the field. */
  function setTool(next) {
    if (next === tool) return;
    tool = next;
    setHover(null);
    mergeFocus = null;
    hideForMerge();
    paintBand();
    redraw();
  }

  /* How many trophic eggs to draw under the queen. */
  function setTrophicEggs(count) {
    if (count === trophicEggs) return;
    trophicEggs = count;
    redraw();
  }

  // Trophic eggs: a grey egg of 1 or 2 pixels for each, on the floor under
  // the queen, 3 pixels apart, filling a row from the middle out, then piling
  // up a row higher, set half a step over (4 rows at most). Each egg keeps
  // its spot and size.
  const TROPHIC_LOOK = { colors: ['#a9a9a6', '#cfcfcb'], rows: 4, margin: 2, gap: 3 };
  function paintTrophicEggs(g, queenX, floorY, width) {
    const across = Math.floor((width - TROPHIC_LOOK.margin * 2) / TROPHIC_LOOK.gap);
    const shown = Math.min(trophicEggs, across * TROPHIC_LOOK.rows);
    const middle = queenX + Math.floor(width / 2);
    for (let n = 0; n < shown; n++) {
      const row = Math.floor(n / across);
      const k = n % across;
      const slot = k % 2 === 0 ? k / 2 : -(k + 1) / 2;   // middle out: 0, -1, 1, -2, 2 ...
      const x = middle + slot * TROPHIC_LOOK.gap + (row % 2) * 1;
      g.fillStyle = TROPHIC_LOOK.colors[n % 2];
      g.fillRect(x, floorY - row, hashAt(n, 5) < 0.4 ? 2 : 1, 1);
    }
  }

  /* Choose the tool's shape: 'square' or 'round'. */
  function setShape(next) {
    if (next === shape) return;
    shape = next;
    setHover(null);
    paintBand();
    redraw();
  }

  /* Line assist (Dig menu): keep drags straight (LINE), or not. */
  function setLineAssist(on) {
    lineAssist = !!on;
  }

  /* How many pixels a whole tool of this width covers, in the current shape. */
  function areaOf(width) {
    return shapeMask(width).reduce((sum, bit) => sum + bit, 0);
  }

  /* Set the width of the tool's square, in game pixels. */
  function setSize(next) {
    if (next === size) return;
    size = next;
    setHover(null);
    paintBand();
    redraw();
  }

  /*
   * Eggs and pupae to show: a list of { spot, stage, type } where stage is
   * 'egg' or 'pupa' and type is 'worker' or 'soldier'.
   */
  function setBrood(list) {
    const key = list.map((item) => item.spot + item.stage + item.type).join(',');
    if (key === broodKey) return;
    broodKey = key;
    brood = list;
    redraw();
  }

  /* How many ants of each kind should be walking around: { worker: n, soldier: n }. */
  function setWanderers(counts) {
    if (Wanderers.setCounts(counts, world)) redraw();
  }

  /* Whether the player has enough food for the square under the mouse. Changes its color. */
  function setAffordable(value) {
    if (value === affordable) return;
    affordable = value;
    if (tool && hover) redraw();
  }

  /*
   * Call `handler({ tool, size, pixels, apply })` when the player clicks a
   * square where the tool would change at least one pixel. `pixels` is how
   * many it would change. The handler calls apply() to carry it out.
   */
  function onUse(handler) {
    useHandler = handler;
  }

  /* Called when the mouse is let go after a dig, fill or trail stroke that used the tool. */
  function onStrokeEnd(handler) {
    strokeEndHandler = handler;
  }

  /*
   * Call `handler(pixels)` when the number of pixels the tool would change
   * under the mouse changes. 0 means nothing there (or the mouse has left).
   */
  function onHover(handler) {
    hoverHandler = handler;
  }

  /*
   * Rules for the crumb that upgrades change:
   *   clickWaitMs  wait after a click before the crumb can be clicked again
   *   speed        how many times faster workers go for the crumb
   *   carryMin, carryMax  pixels a worker carries down per trip
   *   walkSpeed    how many times faster workers walk (Step counting)
   *   slots        how many crumbs can lie on the grass at once (Charitable Toddler)
   *   foodBoost    food from each bite or delivered pixel (Communal Stomach)
   */
  function setCrumbRules(rules) {
    crumbRules = Object.assign({}, crumbRules, rules);
    if (crumbs.length !== crumbRules.slots && crumbCells.length) fitCrumbSlots();
  }

  /* Show (true) or hide (false) the "Click!" arrow by the crumb. */
  function setHint(show) {
    if (show === hintWanted) return;
    hintWanted = show;
    if (hintEl) placeHint();
  }

  /*
   * Call `handler(food, source)` when food comes in from the crumb: source is
   * 'click' (the player clicked it) or 'delivery' (a worker reached the queen).
   */
  function onFood(handler) {
    foodHandler = handler;
  }

  /* Call `handler()` whenever the crumb changes (so it can be saved). */
  function onCrumbChange(handler) {
    crumbHandler = handler;
  }

  /* Call `handler(zoom, maxZoom)` whenever the zoom changes. */
  function onZoom(handler) {
    zoomHandler = handler;
  }

  return {
    init, loadCave, resetCave, exportCave, loadCrumbs, exportCrumbs,
    setTool, setSize, setShape, setLineAssist, setTrophicEggs, areaOf, setBrood, setWanderers, setAffordable,
    flyAway, flying: () => alate !== null, setAlate, rainWash,
    stashCount: () => stash.length,
    popAtEntrance: (text) => { popText(text, 'pop-queen', tunnelX(ground), ground - 8); redraw(); },
    // Yellow words with a black edge (like CLICK FRENZY!, smaller), over the nest hole, up for `ms`.
    popYellow: (text, ms) => { popText(text, 'pop-big', tunnelX(ground), ground + 6, ms, 1.5); redraw(); },
    // The party block (type ???!) and the party when it is eaten.
    dropPartyBlock, partyOn: () => partyOn(), onParty: (handler) => { partyHandler = handler; }, partyMs: PARTY.ms,
    // Big pink words over the middle of the view, with yellow ones `under` them (like popBig).
    popLove(text, under, ms) {
      const x = Math.round(viewX + cols / (2 * zoom));
      const y = Math.max(ground + 30, Math.round(viewY + rows / (3 * zoom)));
      popText(text, 'pop-big pop-love', x, y, ms, 2.5);
      if (under) popText(under, 'pop-big', x, y + 14, ms, 1.5);
      redraw();
    },
    popNote: (text, ms) => { popText(text, 'pop-steal', tunnelX(ground), ground - 8, ms); redraw(); },   // (like Seed storage full: easy to see, shown `ms`)
    // Big yellow words over the middle of the view (a click frenzy), up for `ms`, with a smaller line under them.
    popBig(text, under, ms) {
      const x = Math.round(viewX + cols / (2 * zoom));
      const y = Math.max(ground + 30, Math.round(viewY + rows / (3 * zoom)));
      popText(text, 'pop-big', x, y, ms, 3);
      if (under) popText(under, 'pop-big', x, y + 14, ms, 1.5);
      redraw();
    },
    onBroodClick: (handler) => { broodHandler = handler; },
    anteaterArrive, anteaterHere: () => anteater !== null, onAnteater: (handler) => { anteaterHandler = handler; },
    anteaterState: () => anteater && { phase: anteater.phase, mode: anteater.mode, hits: anteater.hits, sticks: anteater.sticks, tip: anteater.mode === 'in' ? null : tongueTip() },   // (for checking)
    visualAnts: () => Wanderers.list().filter((ant) => ant.kind !== 'fire' && !ant.red && ant.plan !== 'dead').length,   // colony ants walking about
    beetleArrive, beetleHere: () => beetle !== null, beetleSpot: () => beetle && { x: beetle.x, y: beetle.y, kind: beetle.kind, clear: beetleRoom(beetle.x, beetle.y) }, beetleColors: () => BEETLE.colors, onBeetle: (handler) => { beetleHandler = handler; }, startRaid, armAlarm, cancelAlarm, fungusCount, takeDroppedFungi, removeFungi,
    pauseRaid: (paused) => Wanderers.pauseFire(paused),
    raiders: () => Wanderers.raiders(),
    invaders: () => Wanderers.invaders(),
    onEvent: (handler) => { eventHandler = handler; },
    breadCount: () => granaries.filter((g) => g.storedAt && g.bread).length,   // granaries holding ant bread
    fireDead: () => Wanderers.list().filter((a) => a.kind === 'fire' && a.plan === 'dead').length,
    fireAntArrives: (delay) => Wanderers.arrive(world, delay),   // a new fire ant comes in over the grass
    onRaid: (handler) => { raidHandler = handler; },
    onSoldierFall: (handler) => { fallHandler = handler; },
    surfaceDug: () => surfaceShare(),
    middenPixels: () => middenCount, startMarauders, marauders: () => Wanderers.marauders(), middenBlooming: () => bloom !== null, onBloom: (handler) => { bloomHandler = handler; }, onMiddenHover: (handler) => { middenHoverHandler = handler; },
    // Waste from the food harvested: shared among the piles by size, so each fills in the same time.
    feedMiddens: (amount) => { if (middenCount > 0 && amount > 0) for (const pile of piles) addToPile(pile, amount * pile.size / middenCount); },
    middens: () => piles.map((pile) => ({ size: pile.size, full: pileFull(pile) })),
    onUse, onStrokeEnd, onHover, onZoom, onFood, onCrumbChange, setCrumbRules, setHint, setTrailView, trailPixels, aphidCount, removeAphids, granaryCount, nurseryCount, caterpillarCount, removeGranaries, clearSeeds, onCaveChange, repleteCount, removeRepletes,
    extraDug: () => extraDug,
    bigCount, settleAway,
    dropFruit: () => { fruitNow = true; },
    fruitIn: () => (nextFruitAt ? nextFruitAt - Date.now() : null),   // (for checking: ms until the next fruit falls)
    // How many kinds of seed are stored now (granaries, Seed Vaults aside, and the tunnel floors), for Diaspore.
    storedSeedKinds: () => new Set(granaries.filter((g) => g.storedAt && !g.vault).map((g) => Sprites.seedKind(g.kind)).concat(stash.map((item) => Sprites.seedKind(item.kind)))).size,
    lastDeleted: () => lastDeleted,
    pop: (text, x, y) => popText(text, 'pop-queen', x, y),
    setMergeCount: (count) => { mergeCount = count; },
    exportRaid: () => Wanderers.exportRaid(),
    autoStoreFlag: () => autoStoreFlag(),
    onCaterpillarMilk: (handler) => { caterpillarHandler = handler; },
    // Put the store flag down with the next click on the nest (done(true) once it is), or stop.
    // After digging: a flag the game picked is picked again (the tunnels may have changed). True if it moved.
    repickStoreFlag() {
      if (!storeFlagAuto || storeFlag < 0) return false;
      const was = storeFlag;
      autoStoreFlag();
      return storeFlag !== was;
    },
    pickStoreFlag(done) {
      flagPicking = done || null;
      if (canvas) canvas.style.cursor = done ? 'crosshair' : '';
      redraw();
    },
    pickingStoreFlag: () => !!flagPicking,
    showStoreFlag(shown) {
      if (flagShown === shown) return;
      flagShown = shown;
      redraw();
    },
    exportDowned: () => Wanderers.exportDowned(),
    loadDowned: (list) => Wanderers.loadDowned(list),
    loadRaid: (list) => { if (Wanderers.loadRaid(list, world)) redraw(); },
    zoomIn: () => zoomBy(1, null),
    zoomOut: () => zoomBy(-1, null),
    view: () => ({ zoom, maxZoom: zooms[zooms.length - 1], x: viewX, y: viewY, scale: screenScale() }),
    sendScouts: (count, side) => { Wanderers.sendScouts(count, side, world); redraw(); },
    returnScouts: (count, side, kind) => { Wanderers.returnScouts(count, side, kind, world); redraw(); },
    setFit
  };
})();
