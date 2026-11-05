/*
 * Ant Tycoon: game rules, saving, and the side panel.
 */

'use strict';

/* ---------- Rules (change these numbers to rebalance the game) ---------- */

// The kinds of ant the player can hatch.
const ANT_TYPES = {
  worker: {
    costStart: 5,        // price of the first one
    costStep: 4,         // flat amount added to the price after each purchase
    tripMs: 5000         // a trip every 5 seconds (the Work Speed upgrade replaces this); steady food is half that (PASSIVE_SLOW)
  },
  soldier: {
    costStart: 40,
    costStep: 16,
    tripMs: 5000 / 3     // 3 times as fast as an unupgraded worker
  },
  // Fire ants (after the Fire ant slavemaking invasion is beaten): workers in
  // every way, with every worker upgrade, but twice the price, prices rising
  // twice as fast, and walking 1.5 times as fast (ants.js).
  fireAnt: {
    name: 'fire ant',
    costStart: 10,
    costStep: 8,
    costGrowth: 0.24,    // twice the 12% workers rise by
    sameAs: 'worker',
    needs: 'slavemaking',
    needsWin: true       // ...and the invasion beaten
  },
  // Supermajor (Bigheaded honeydew upgrade): one per colony. Works like an
  // unupgraded worker (only Athleticism and Step counting help his walking,
  // in ants.js), but brings in 25 times the food (50 times now that workers
  // and soldiers bring in half: see PASSIVE_SLOW).
  supermajor: {
    costStart: 10000,
    costStep: 0,
    tripMs: 5000,        // trips take as long as an unupgraded worker's...
    yield: 25,           // ...and each brings in 25 food
    max: 1,
    needs: 'superMajor'
  }
};

// Repletes (Build menu, Repletes honeydew upgrade): a worker that hangs from
// the ceiling and stores crumb (field.js). Each costs a little food and one
// worker, and that worker comes off the worker price: the next one costs
// what the last one did.
const REPLETE_COST = { start: 25, growth: 1.12, after: 6, lateGrowth: 1.5 };   // 25, 28, 31, 35, 39, 44, then 50% more each: 66, 99, 150, 220 ...
// A full replete gives this many times the food it holds; Honeypot (the
// Repletes honeydew upgrade's second level) doubles it.
const REPLETE_PAYS = { base: 2.5, honeypot: 2 };

// Fungus gardens (Build menu, Fungal garden honeydew upgrade): an 8x8 patch
// of fungus, stuck to a floor, ceiling or wall, that workers feed crumbs; field.js grows it and pays its food.
// Each garden costs more than the one before.
const FUNGUS_COST = { start: 210, growth: 1.3 };   // 210, 270, 350, 460, 600 ...
// The crumb or fungus slider (Build menu): the percent of workers bringing
// back crumb who feed a fungus garden instead of the queen or a replete.
// Starts at 80, and can not go past 80 (the red line).
const FUNGUS_SPLIT = { start: 80, most: 80 };

// Aphids (Build menu): each lives in an 8x8 pen and fills with honeydew
// every minute; a worker then milks it for 200 food (field.js). They are not
// steady food: no worker, no food. They cost a lot, and more for each one
// you have.
const APHIDS = {
  food: 200,            // food a worker gets for milking a full aphid...
  fillMinutes: 1,       // ...which takes this long to fill
  honeydewBoost: 0.1,   // each aphid makes food count 10% more toward honeydew
  costStart: 1000,
  costGrowth: 1.4     // 1,000, 1,400, 2,000, 2,700, 3,800, 5,400 ...
};

/*
 * Merging (Build menu): 10 of one structure become one merged structure in
 * a clear 24x24 space (field.js), for `cost` food. Afterwards the next one of
 * that structure is priced as if you owned 6 fewer, not 10: each merged one
 * counts as MERGE_PRICE_COUNTS of them. A Honeypot Chamber takes 4 workers, so 6
 * of the 10 repletes' workers come back. A Mealybug Herd counts as 12
 * aphids toward honeydew.
 */
// times: a merge costs this many times the price of the 10th of its
// structure; each further merge of that kind is priced from MERGE_STEP
// structures on (the 16th, then the 22nd ...). first: instead, what the
// first costs (later ones grow from it the same way).
const MERGES = {
  vault: { from: 'granary', name: 'Seed Vault', first: 15000 },
  chamber: { from: 'fungus', name: 'Fungus Chamber', times: 16 },
  honeypot: { from: 'replete', name: 'Honeypot Chamber', times: 16, workersBack: 6 },
  herd: { from: 'aphid', name: 'Mealybug Herd', times: 16, aphids: 12 }
};
const MERGE_STEP = 6;
const MERGE_COUNT = 10;
const MERGE_PRICE_COUNTS = 4;   // each merged structure counts as 4 of its kind in prices (10 merged away, priced as 6 fewer)

// The price of a structure when `n` are already counted (the price of the n + 1st).
function structureCostAt(from, n) {
  return roundPrice(baseStructureCost(from, n) * weaverShare());
}

// Weaver nests (perk page II): buildings cost 10% less for each egg hatching, up to 50%.
function weaverShare() {
  if (perkLevel('weaverNests') === 0) return 1;
  return 1 - Math.min(PAGE_TWO.weaverMost, PAGE_TWO.weaverPerEgg * state.eggs.length);
}

function baseStructureCost(from, n) {
  if (from === 'granary' || from === 'nursery') return roundPrice(n === 0 ? GRANARY_COST.start : n === 1 ? GRANARY_COST.second : GRANARY_COST.third * Math.pow(GRANARY_COST.growth, n - 2));
  if (from === 'fungus') return roundPrice(FUNGUS_COST.start * Math.pow(FUNGUS_COST.growth, n));
  if (from === 'replete') {
    const early = Math.min(n, REPLETE_COST.after - 1);   // the first 6 rise 12% each...
    return roundPrice(REPLETE_COST.start * Math.pow(REPLETE_COST.growth, early) * Math.pow(REPLETE_COST.lateGrowth, Math.max(0, n - early)));   // ...then 50% each
  }
  return roundPrice(APHIDS.costStart * Math.pow(APHIDS.costGrowth, n));
}

// What the next merge of this kind costs: `times` the price of the 10th of
// its structure for the first, of the 16th for the second, the 22nd for
// the third ... (counting the merged ones there are now).
function mergeCost(kind) {
  const merge = MERGES[kind];
  const times = merge.first ? merge.first / structureCostAt(merge.from, MERGE_COUNT - 1) : merge.times;
  return roundPrice(times * structureCostAt(merge.from, MERGE_COUNT - 1 + MERGE_STEP * Field.bigCount(kind)));
}

// How many of a structure the price counts: those you have, plus 4 for each merged one.
function mergedCount(from) {
  const kind = Object.keys(MERGES).find((k) => MERGES[k].from === from);
  const base = { granary: Field.granaryCount, fungus: Field.fungusCount, replete: Field.repleteCount, aphid: Field.aphidCount }[from]();
  return base + MERGE_PRICE_COUNTS * Field.bigCount(kind);
}

// How many base structures of a merge's kind there are.
function mergeBase(kind) {
  return { granary: Field.granaryCount, fungus: Field.fungusCount, replete: Field.repleteCount, aphid: Field.aphidCount }[MERGES[kind].from]();
}

// Is this merge's base structure unlocked at all?
function mergeUnlocked(kind) {
  const from = MERGES[kind].from;
  return from === 'granary' || (from === 'fungus' && fungusUnlocked()) || (from === 'replete' && repletesUnlocked()) || (from === 'aphid' && aphidsUnlocked());
}

// The satellite colonies (Mega colony, then Polydomy, honeydew upgrades)
// each make food every minute: seedsPerMinute seeds' worth (a seed is
// worth the Harvester value), plus perLevel more for each level of its own
// upgrade, bought with food in its window. While the game is closed they
// follow the Away upgrade, like the ants: only the first Away minutes
// count, at the Away percent.
const SATELLITE = {
  seedsPerMinute: 4,
  perLevel: 1,
  maxLevel: 10,
  costStart: 700,
  costGrowth: 2.2      // 700, 1,500, 3,400, 7,500, 16,000 ... 850,000 for the last level (1.5 million in all)
};

// Fire ant raids, only while the game is open: now and then a few fire
// ants walk in after the seeds in the granaries (or, with none stored, some
// of the queen's food). Only once there is a granary and a soldier. R starts
// one at once, for testing.
const RAID = {
  everyMinMs: 5 * 60000,    // time between raids: 5 to 8 minutes of time the game is open
  everyMaxMs: 8 * 60000,
  sizeMin: 2,               // fire ants in a raid: 2 to 4...
  sizeMax: 4,
  afterFlight: 1,           // ...and one more (3 to 5) once you have taken a nuptial flight,
  perAnts: 25,              // ...one more for every 25 ants...
  perFlights: 3,            // ...and one more for every 3 nuptial flights...
  laterPace: 1.25,          // ...both 25% faster once the first raid has come (one more for every 20 ants, and every 2.4 flights)...
  most: 10,                 // ...but never more than 10
  stealShare: 0.03,         // a fire ant that reaches the queen takes 3% of the food...
  stealMost: 2000,          // ...but never more than this
  fallCost: 5,              // food lost when a soldier falls (food never goes below 0)
  warnMs: 10000             // with no soldiers, a warning shows this long before a raid
};

// The message shown the first time fire ants come.
// { text, className } lines are styled: the Latin name is red italics.
const RAID_INTRO = [
  { text: 'Solenopsis invicta', className: 'latin' },
  '(fire ants) have arrived,',
  'and they want your seeds!',
  'Press the red alarm',
  'pheromone button, then',
  'click a spot to send',
  'your soldiers there.',
  'Soldiers also fight any',
  'fire ant they run into.',
  'Your ants learned from',
  'Matabele ants: a fallen',
  'soldier is carried home',
  'and heals in a minute.'
];

const RULES = {
  startFood: 5,       // food in a brand new game
  costGrowth: 0.12,   // ant prices also go up by 12% of themselves (rounded) per purchase
  alateCost: 250,     // the alate, the winged queen a nuptial flight needs: bought once per colony
  hatchMs: 10000,     // an egg takes 10 seconds to become an ant
  maxEggs: 5,         // most eggs that can be waiting to hatch at once
  digCostStart: 1,    // listed price of a small dig at first...
  digCostScale: 0.3,  // ...plus digCostScale x (digs so far ^ digCostPower): cheap early on,
  digCostPower: 1.6,  //    rising faster later (10 digs: 13, 30 digs: 70, 50 digs: 158)
  cheapDigs: 10,      // the first 10 digs of each colony cost half
  digDiscount: 0.664, // digging actually costs 66.4% less than the listed price (20% off, then 30% off, then 40% off)
  fillCost: 5,        // price of a small fill; this one never rises
  // A walking ant appears for these ants of a kind, then for every few more after the last:
  walkers: {
    worker: { at: [1, 3, 4, 5, 7, 8, 9, 11, 12, 14, 15, 18, 19], every: 3, max: 40 },   // these workers, then 22nd, 25th, ... up to 40 walking (at 100 workers)
    soldier: { at: [1, 3, 6, 9], every: 5, max: 18 }       // 1st, 3rd, 6th, 9th soldier, then 14th, 19th, ... up to 18 walking (at 79 soldiers)
  },
  maxWalkers: 15,         // ...up to 15 walking ants of each kind (or the kind's own max)
  freeAnts: 3,        // the first 3 ants of each kind need no extra room...
  antsPerRoom: 5,     // ...then every 5 more of a kind need one more block of dug-out room
  roomPixels: 80,     // the first block of room: 80 pixels (a little more than an 8x8 square), dug beyond the starting cave...
  roomPixelsMore: 10, // ...and each block after needs this many more than the one before (80, 90, 100 ...)
  cheatFood: 30000,    // food given by the C key cheat (counts as harvested, for testing the flight)
  awayAfterMs: 5000,  // a gap this long since the game last ran means it was closed
  welcomeAfterMs: 5 * 60 * 1000   // a gap this long shows the Welcome Back window
};

/* ---------- Achievements ----------
 * Each is named for a real ant term (`term` explains it, shown on hover).
 * When `done()` first holds it is ready: a red ! shows on the Achievements
 * button, and clicking it in the window gives honeydew (achievementReward).
 * `hidden` ones show as ??? until done. Kept by flights. The button appears
 * after the first nuptial flight.
 */
const ACHIEVEMENTS = [
  { key: 'nanitic', name: 'Nanitic', goal: 'Hatch your first worker',
    term: 'The first workers a new queen raises, small because she feeds them from her own body.',
    done: () => state.ants.worker >= 1 || state.stats.hatched >= 1 },
  { key: 'callow', name: 'Callow', goal: 'Hatch 25 ants in one run',
    term: 'A newly emerged adult ant, still pale and soft for its first days.',
    done: () => state.hatchedRun >= 25 },
  { key: 'eclosion', name: 'Eclosion', goal: 'Hatch 100 ants in one run',
    term: 'An adult ant coming out of its pupa.',
    done: () => state.hatchedRun >= 100 },
  { key: 'forager', name: 'Forager', goal: 'Have 50 workers',
    term: 'A worker that gathers food outside the nest. In many ants these are the older workers.',
    done: () => state.ants.worker >= 50 },
  { key: 'majorWorkers', name: 'Major Workers', goal: 'Have 35 soldiers',
    term: 'Big workers with big heads. In one large harvester ant, majors reach 18 to 20 mm and crush seeds open with their mandibles.',
    done: () => state.ants.soldier >= 35 },
  { key: 'granary', name: 'Granary', goal: 'Build 10 granaries',
    term: 'A nest chamber where harvester ants store their seeds.',
    done: () => Field.granaryCount() >= 10 },
  { key: 'recruitment', name: 'Recruitment', goal: 'Bring home 10,000 food of crumb',
    term: 'An ant that finds food lays a scent trail home, calling nestmates to follow it out.',
    done: () => state.stats.crumbs >= 10000 },
  { key: 'polymorphism', name: 'Polymorphism', goal: 'Have a media, a major and a supermajor',
    term: 'Workers of different sizes in one colony. Leafcutter ants have minims, minors, medias and majors, and some Pheidole add supermajors.',
    done: () => state.ants.soldier > 0 && state.flats.major && state.ants.supermajor > 0 },
  { key: 'trophallaxis', name: 'Trophallaxis', goal: 'Feed the queen 500 times',
    term: 'Passing liquid food from mouth to mouth, how ants share food through the colony.',
    done: () => state.stats.queenFeeds >= 500 },
  { key: 'stigmergy', name: 'Stigmergy', goal: 'Lay 50 blocks of pheromone trail',
    term: 'Working together through marks left behind, like a scent trail other ants follow.',
    done: () => state.stats.trails >= 50 },
  { key: 'granivore', name: 'Granivore', goal: 'Store 100 seeds',
    term: 'A seed eater. Harvester ants gather and store seeds as their main food.',
    done: () => state.stats.seeds >= 100 },
  { key: 'antBread', name: 'Ant Bread', goal: 'Have 5 granaries of ant bread at once',
    term: 'Harvester ant workers chew seeds and mix them with saliva into a dough to feed the colony.',
    done: () => Field.breadCount() >= 5 },
  { key: 'trophobiosis', name: 'Trophobiosis', goal: 'Own 5 aphids',
    term: 'Ants guarding other insects in return for the sweet honeydew they make.',
    done: () => state.aphids + MERGES.herd.aphids * state.herds >= 5 },   // (a Mealybug Herd counts as 12)
  { key: 'fungiculture', name: 'Fungiculture', goal: 'Harvest 50 fungus gardens',
    term: 'Farming fungus for food, done by fungus-gardening ants.',
    done: () => state.stats.fungus >= 50 },
  { key: 'larder', name: 'Living Larder', goal: 'Fill repletes 10 times',
    term: 'Honeypot ant repletes hang from the nest ceiling with gasters swollen full of food.',
    done: () => state.stats.repletes >= 10 },
  { key: 'necrophoresis', name: 'Necrophoresis', goal: 'Carry 25 fire ant bodies',
    term: 'Carrying the dead away from the nest, which keeps disease out. Strictly it means dead nestmates.',
    done: () => state.stats.bodies >= 25 },
  { key: 'alarm', name: 'Alarm Pheromone', goal: 'Sound the alarm 10 times', hidden: true,
    term: 'A scent released in danger that calls nestmates to defend.',
    done: () => state.stats.alarms >= 10 },
  { key: 'phragmosis', name: 'Phragmosis', goal: 'Beat a raid without losing a soldier',
    term: 'Defending a nest by blocking its entrance with the body, often a big flat head.',
    done: () => state.stats.cleanRaids >= 1 },
  { key: 'dulosis', name: 'Dulosis', goal: 'Beat the fire ant invasion',
    term: 'The scientific term for slavemaking: one species raising workers taken from another.',
    done: () => state.invasion === 'won' },
  { key: 'colonyOdor', name: 'Colony Odor', goal: 'Raise 20 fire ants in your nest',
    term: 'The scent ants use to tell nestmates from strangers. Brood raised in a colony learns its scent.',
    done: () => state.ants.fireAnt >= 20 },
  { key: 'dealate', name: 'Dealate', goal: 'Take your first nuptial flight',
    term: 'A queen that has shed her wings after her mating flight.',
    done: () => state.flights >= 1 },
  { key: 'swarm', name: 'Swarm Season', goal: 'Take 10 nuptial flights',
    term: 'Many colonies releasing their alates on the same days, often after rain.',
    done: () => state.flights >= 10 },
  { key: 'polydomy', name: 'Polydomy', goal: 'Own both satellite colonies',
    term: 'One colony living in two or more separate nests.',
    done: () => SATS.every(satOwned) },
  { key: 'supercolony', name: 'Supercolony', goal: 'Have 100 ants at once',
    term: 'Many nests whose ants all treat each other as nestmates.',
    done: () => totalAnts() >= 100 },
  { key: 'mature', name: 'Mature Colony', goal: 'Harvest 1,000,000 food in all',
    term: 'A colony grown large enough to raise winged queens and males.',
    done: () => state.stats.food >= 1000000 },
  // Late game
  { key: 'superorganism', name: 'Superorganism', goal: 'Harvest 10,000,000 food in all',
    term: 'A colony seen as one living thing, its workers like the cells of a body. William Morton Wheeler used the word for ant colonies.',
    done: () => state.stats.food >= 10000000 },
  { key: 'eusociality', name: 'Eusociality', goal: 'Own every page I honeydew upgrade',
    term: 'The highest level of social life: shared care of young, generations living together, and only some members breeding.',
    done: () => Object.keys(PERKS).every((k) => (PERKS[k].page || 1) !== 1 || perkLevel(k) >= PERKS[k].costs.length) },   // (page I)
  { key: 'dominance', name: 'Ecological Dominance', goal: 'Own every honeydew upgrade on both pages',
    term: 'When one group of living things shapes the life around it. Ants are among the most ecologically dominant animals on land.',
    done: () => Object.keys(PERKS).every((k) => PERKS[k].page === 3 || perkLevel(k) >= PERKS[k].costs.length) },   // (pages I and II)
  { key: 'division', name: 'Division of Labor', goal: 'Max out every upgrade in one run',
    term: 'Different ants doing different jobs, by size or by age: nursing, digging, foraging, guarding.',
    done: () => Object.keys(UPGRADES).every((k) => state.upgrades[k] >= regularMax(k)) },   // (not the very expensive end levels)
  { key: 'polygyny', name: 'Polygyny', goal: 'Upgrade both satellite colonies fully',
    term: 'A colony with more than one egg-laying queen.',
    done: () => SATS.every((sat) => satOwned(sat) && state[sat.key].level >= SATELLITE.maxLevel) },
  { key: 'attine', name: 'Attine', goal: 'Harvest 500 fungus gardens',
    term: 'The tribe Attini: every fungus-growing ant, found only in the Americas. They began farming fungus about 55 to 60 million years ago.',
    done: () => state.stats.fungus >= 500 },
  { key: 'honeypot', name: 'Honeypot', goal: 'Fill repletes 100 times',
    term: 'Honeypot ants of the genus Myrmecocystus, whose repletes are drained by the colony when food runs short.',
    done: () => state.stats.repletes >= 100 },
  { key: 'matabele', name: 'Matabele', goal: 'Rescue 25 fallen soldiers',
    term: 'Matabele ants carry injured nestmates home after raids on termites, where they are cared for.',
    done: () => state.stats.rescues >= 25 },
  { key: 'myrmecophile', name: 'Myrmecophile', goal: 'Own 15 aphids',
    term: 'Any creature that lives with ants, like the aphids, beetles and caterpillars many colonies keep or tolerate.',
    done: () => state.aphids >= 15 },
  // More, easy to very hard. Terms: Wikipedia, Glossary of ant terms (and as noted).
  { key: 'trophicEgg', name: 'Trophic Egg', goal: 'Have 5 eggs waiting at once',
    term: 'An egg that will never hatch, laid to be eaten as food.',
    done: () => state.eggs.length >= 5 },
  { key: 'epigaeic', name: 'Epigaeic', goal: 'Bring home 500 food of crumb',
    term: 'Living or foraging above ground.',
    done: () => state.stats.crumbs >= 500 },
  { key: 'myrmecologist', name: 'Myrmecologist', goal: 'Read 10 encyclopedia entries',
    term: 'A scientist who studies ants.',
    done: () => Object.keys(state.readTerms).length >= 10 },
  { key: 'pilosity', name: 'Pilosity', goal: 'Zoom all the way in', hidden: true,
    term: 'How hairy an ant is. Its hairs help tell species apart.',
    done: () => state.stats.zoomMax >= 1 },
  { key: 'monodomy', name: 'Monodomy', goal: 'Dig out 1,000 pixels of nest',
    term: 'A colony living in a single nest.',
    done: () => Field.extraDug() >= 1000 },
  { key: 'plerergate', name: 'Plerergate', goal: 'Have 5 repletes at once',
    term: 'Another name for a replete: a worker used as a living larder.',
    done: () => Field.repleteCount() >= 5 },
  { key: 'multicolonial', name: 'Multicoloniality', goal: 'Own a satellite colony',
    term: 'A population made up of many separate colonies.',
    done: () => satOwned(SATS[0]) },
  { key: 'monogyny', name: 'Monogyny', goal: 'Harvest 100,000 food in one run with no satellite',
    term: 'A nest with a single queen.',
    done: () => state.harvested >= 100000 && !satOwned(SATS[0]) },
  { key: 'socialStomach', name: 'Social Stomach', goal: 'Feed the queen 2,500 times',
    term: 'The crop, where an ant carries liquid food to share with its nestmates.',
    done: () => state.stats.queenFeeds >= 2500 },
  { key: 'myrmecology', name: 'Myrmecology', goal: 'Read every encyclopedia entry',
    term: 'The study of ants.',
    done: () => ENCYCLOPEDIA.every((e) => state.readTerms[e.term]) },
  { key: 'harvesterAnt', name: 'Harvester Ant', goal: 'Store 500 seeds',
    term: 'Ants that gather seeds and keep them in underground granaries.',
    done: () => state.stats.seeds >= 500 },
  { key: 'fungivorous', name: 'Fungivorous', goal: 'Get 10,000 food from fungus gardens',
    term: 'Feeding on fungi.',
    done: () => state.stats.fungusFood >= 10000 },
  { key: 'polyandry', name: 'Polyandry', goal: 'Take a flight worth 10 honeydew',
    term: 'A queen mating with several males.',
    done: () => state.stats.bestFlight >= 10 },
  { key: 'pheromoneTrail', name: 'Pheromone Trail', goal: 'Lay 200 blocks of pheromone trail',
    term: 'Chemicals ants lay down to guide nestmates to a target, usually food.',
    done: () => state.stats.trails >= 200 },
  { key: 'slaveMaking', name: 'Slave-making', goal: 'Raise 30 fire ants',
    term: 'Capturing the brood of another ant species and raising it as workers.',
    done: () => state.ants.fireAnt >= 30 },
  { key: 'dinergate', name: 'Dinergate', goal: 'Have 50 soldiers',
    term: 'A soldier: a big-headed worker built for defense or for cracking food.',
    done: () => state.ants.soldier >= 50 },
  { key: 'midden', name: 'Midden', goal: 'Carry 100 fire ant bodies',
    term: 'The refuse pile of a nest, where ants dump the dead, husks and other waste.',
    done: () => state.stats.bodies >= 100 },
  { key: 'polyethism', name: 'Polyethism', goal: 'Have every kind of ant at once',
    term: 'Division of labor: different ants taking on different roles. Here: workers, media and major soldiers, fire ants and the supermajor.',
    done: () => state.ants.worker > 0 && state.ants.soldier > 0 && state.ants.fireAnt > 0 && state.ants.supermajor > 0 && perkLevel('superMajor') > 0 },
  { key: 'bivouacAch', name: 'Bivouac', goal: 'Have 150 ants at once',
    term: 'In army and driver ants, a nest made of the workers own bodies, holding the queen and brood.',
    done: () => totalAnts() >= 150 },
  { key: 'nuptialFlight', name: 'Nuptial Flight', goal: 'Take 25 nuptial flights',
    term: 'The mating flight of winged queens and males.',
    done: () => state.flights >= 25 },
  { key: 'honeydew', name: 'Honeydew', goal: 'Earn 200 honeydew from flights in all',
    term: 'The sugary liquid aphids and other sap-feeding insects give off, which many ants collect.',
    done: () => state.stats.honeydew >= 200 },
  { key: 'unicolonial', name: 'Unicoloniality', goal: 'Have 200 ants at once',
    term: 'A whole population living as one huge colony spread over many nests.',
    done: () => totalAnts() >= 200 },
  { key: 'myrmecochory', name: 'Myrmecochory', goal: 'Build a Seed Vault',
    term: 'Seeds spread by ants. Ants carry seeds home to store or eat, and many plants rely on it to spread.',
    done: () => Field.bigCount('vault') > 0 },
  { key: 'gongylidia', name: 'Gongylidia', goal: 'Build a Fungus Chamber',
    term: 'The swollen tips of the fungus leafcutter ants grow, which they harvest to feed their larvae.',
    done: () => Field.bigCount('chamber') > 0 },
  { key: 'myrmecocystus', name: 'Myrmecocystus', goal: 'Build a Honeypot Chamber',
    term: 'The honeypot ants of dry lands, whose repletes hang from chamber ceilings full of stored food.',
    done: () => Field.bigCount('honeypot') > 0 },
  { key: 'trophobiont', name: 'Trophobiont', goal: 'Build a Mealybug Herd',
    term: 'An insect, such as a mealybug, that gives ants honeydew in return for their care and protection.',
    done: () => Field.bigCount('herd') > 0 },
  { key: 'arboreal', name: 'Arboreal', goal: 'Go up to the weaver ant canopy',
    term: 'Living in trees. Many ants nest and forage high up in the canopy.',
    done: () => !!state.weaver && state.weaver.visited },
  { key: 'larvalSilk', name: 'Larval Silk', goal: 'Place 50 weaver leaves',
    term: 'Weaver ant workers hold their larvae in their jaws and use the silk the larvae spin to stitch leaves into a nest.',
    done: () => !!state.weaver && state.weaver.leaves.length >= 50 },
  { key: 'oecophylla', name: 'Oecophylla', goal: 'Reach the top weaver branch',
    term: 'The weaver ants of Africa, Asia and Australia, which build their nests from living leaves in the treetops.',
    done: () => !!state.weaver && state.weaver.best >= 4 },
  { key: 'diaspore', name: 'Diaspore', goal: 'Have all eight kinds of seed stored at once',
    term: 'The part of a plant that is spread to grow somewhere new, such as a seed or a fruit.',
    done: () => Field.storedSeedKinds() >= Sprites.SEED_KINDS.length },
  { key: 'helianthus', name: 'Helianthus', goal: 'Have a midden sunflower burst into 20 seeds',
    term: 'The sunflower genus. One sunflower head holds hundreds of seeds.',
    done: () => state.stats.bloomBest >= 20 },
  { key: 'messor', name: 'Messor', goal: 'Buy the last Harvester upgrade',
    term: 'The harvester ant genus of your colony, Messor barbarus, which stores seeds in underground granaries.',
    done: () => state.upgrades.harvester >= maxLevel('harvester') },
  { key: 'pinning', name: 'Pinning', goal: 'Have 4 soldiers fight one army ant',
    term: 'Several ants holding an enemy down by its legs and antennae from all sides, also called spread-eagling.',
    done: () => state.stats.pins >= 1 },
  { key: 'eciton', name: 'Eciton', goal: 'See off 3 army ant raids',
    term: 'Army ants of the American tropics that raid in huge swarms and rest in living bivouacs made of their own bodies.',
    done: () => state.stats.armyRaids >= 3 },
  { key: 'sceptobius', name: 'Sceptobius', goal: 'Catch 5 rove beetles',
    term: 'A rove beetle that lives in velvety tree ant nests. It grooms the ants to take on their smell, so they treat it as one of their own.',
    done: () => state.stats.beetles >= 5 }
];

// Honeydew each achievement gives when claimed: 1 for the easy and midgame
// ones, 3 for late game, 5 for the six hardest.
const ACHIEVEMENT_REWARD = {
  mid: { honeydew: 1, keys: ['larvalSilk', 'pinning', 'sceptobius', 'eclosion', 'forager', 'majorWorkers', 'recruitment', 'trophallaxis', 'stigmergy', 'granivore', 'antBread', 'trophobiosis', 'fungiculture', 'larder', 'necrophoresis', 'alarm', 'phragmosis', 'supercolony', 'plerergate', 'multicolonial', 'monogyny', 'socialStomach', 'myrmecology', 'fungivorous', 'polyandry', 'dinergate'] },
  top: { honeydew: 5, keys: ['superorganism', 'eusociality', 'dominance', 'division', 'nuptialFlight', 'honeydew'] },
  late: { honeydew: 3, keys: ['polygyny', 'attine', 'honeypot', 'matabele', 'myrmecophile', 'mature', 'dulosis', 'colonyOdor', 'slaveMaking', 'polymorphism', 'polydomy', 'polyethism', 'swarm', 'harvesterAnt', 'pheromoneTrail', 'midden', 'bivouacAch', 'unicolonial', 'myrmecochory', 'gongylidia', 'myrmecocystus', 'trophobiont', 'oecophylla', 'diaspore', 'helianthus', 'messor', 'eciton'] }
};
function achievementReward(key) {
  for (const tier of Object.values(ACHIEVEMENT_REWARD)) if (tier.keys.includes(key)) return tier.honeydew;
  return 1;
}

const STAT_KEYS = ['hatched', 'queenFeeds', 'trails', 'seeds', 'fungus', 'repletes', 'bodies', 'alarms', 'cleanRaids', 'food', 'rescues', 'crumbs', 'zoomMax', 'flightOne', 'bestFlight', 'honeydew', 'fungusFood', 'beetles', 'armyRaids', 'bloomBest', 'pins', 'anteaters'];

function newStats() {
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = 0;
  return stats;
}

// Counts from field.js events.
function noteEvent(name, value) {
  if (name === 'bloom') state.stats.bloomBest = Math.max(state.stats.bloomBest, value || 0);   // Helianthus: the most seeds from one sunflower
  const key = { feedQueen: 'queenFeeds', body: 'bodies', seed: 'seeds', fungus: 'fungus', repleteFill: 'repletes', rescue: 'rescues', pin: 'pins' }[name];
  if (key) state.stats[key] += 1;
  const sound = { feedQueen: 'queen', body: 'queen', seed: 'seed', fungus: 'fungus', repleteFill: 'replete' }[name];
  if (sound) Sound.sfx(sound);
}

// Any achievement newly done becomes ready. Returns true if any did.
function checkAchievements() {
  const view = Field.view();
  if (view.zoom >= view.maxZoom) state.stats.zoomMax = 1;   // for Pilosity
  if (!state.achieveShown && state.flights > 0) state.achieveShown = true;   // after the first nuptial flight
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (state.achieve[a.key] && state.achieve[a.key] !== 'old') continue;   // (done before a platinum restart: can be earned again)
    if (a.done()) {
      state.achieve[a.key] = 'ready';
      changed = true;
    }
  }
  return changed;
}

function claimAchievement(key) {
  if (state.achieve[key] !== 'ready') return;
  state.achieve[key] = 'claimed';
  state.royal.jelly += achievementReward(key);
  Sound.sfx('fanfare');
  save();
  render();
}

function renderAchievements() {
  el.btnAchieve.hidden = !state.achieveShown;
  el.achieveAlert.hidden = !Object.values(state.achieve).includes('ready');
  if (screen !== 'achieve') return;
  const done = ACHIEVEMENTS.filter((a) => state.achieve[a.key] === 'claimed' || state.achieve[a.key] === 'old').length;
  PixelFont.write(el.achieveCount, done + ' of ' + ACHIEVEMENTS.length + ' done', { small: true });
  for (const a of ACHIEVEMENTS) {
    const row = el.achieveRows[a.key];
    const status = state.achieve[a.key];
    const secret = a.hidden && !status;
    row.button.classList.toggle('is-ready', status === 'ready');
    row.button.classList.toggle('is-claimed', status === 'claimed');
    row.button.classList.toggle('is-old', status === 'old');
    row.alert.hidden = status !== 'ready';
    PixelFont.write(row.name, secret ? '???' : a.name, { faded: !status });
    PixelFont.write(row.note, secret ? 'Hidden achievement' : status === 'ready' ? 'Click for +' + achievementReward(a.key) + ' Honeydew' : status === 'claimed' ? 'Done: ' + a.goal : status === 'old' ? 'Again for honeydew: ' + a.goal : a.goal, { small: true });
    row.button.dataset.tip = secret ? 'Hidden achievement|Keep playing' : [a.name].concat(wrapText(a.term, 24), ['Worth ' + achievementReward(a.key) + ' honeydew']).join('|');
  }
}

/* ---------- Minor workers and Major soldiers (Ants menu) ----------
 * One-time purchases each run, beside the worker and soldier counts. */
const FLATS = {
  worker: { key: 'minor', cost: 20000, tip: 'Minim > Minor|Costs 20,000 food|Workers walk 30% faster,|carry 30% more, rest|30% less. +30% steady|food.' },
  soldier: { key: 'major', cost: 500000, needs: 'superMajor', tip: 'Media > Major|Costs 500,000 food|Soldiers make 2x|steady food. Half of|them become majors:|13 health, and they|crack seeds.', locked: 'Media > Major|Locked: needs|Bigheaded (honeydew|upgrade).' }
};

function buyFlat(type) {
  const flat = FLATS[type];
  catchUp(Date.now());
  if (state.flats[flat.key] || state.food < flat.cost || (flat.needs && perkLevel(flat.needs) === 0)) return;
  state.food -= flat.cost;
  state.flats[flat.key] = true;
  save();
  render();
}

function renderFlats() {
  for (const type in FLATS) {
    const flat = FLATS[type];
    const button = el.flat[type];
    const owned = state.flats[flat.key];
    const locked = !owned && flat.needs && perkLevel(flat.needs) === 0;   // shown, with a lock, until its upgrade is bought
    button.classList.toggle('is-on', owned);
    button.classList.toggle('is-off', !owned && (locked || state.food < flat.cost));
    button.classList.toggle('is-locked', !!locked);
    button.setAttribute('aria-disabled', String(owned || locked || state.food < flat.cost));
    const lock = button.querySelector('.lock');
    if (lock) {
      lock.hidden = !locked;
      button.querySelector('.sprite:not(.lock)').hidden = !!locked;
    }
    button.dataset.tip = owned ? flat.tip.split('|')[0].split(' > ')[1] + '|Bought this run' : locked ? flat.locked : flat.tip;
  }
}

/*
 * Upgrades, bought on the Upgrades menu. Each builds its list of levels
 * (`values`, level 0 first) and their prices (`costs`: costs[n] buys level
 * n + 1) in levels(). The regular levels are small steps whose price grows
 * by `growth` each level (rounded to two significant figures); the last
 * `ends` levels are a few very expensive ones after them (Division of Labor
 * only asks for the regular levels).
 * `tip` is shown when the mouse rests on the upgrade: one line per "|".
 */
// Prices that start at `start` and grow by `growth` each level.
function growingCosts(count, start, growth) {
  return Array.from({ length: count }, (_, n) => roundPrice(start * Math.pow(growth, n)));
}

const UPGRADES = {
  // Crumbs: the first upgrade, cheap with many small levels. Levels take
  // turns: one adds 1 food to a click on the bread crumb, the next makes
  // each bit of crumb your ants bring home worth 0.1x more (to the queen or
  // a replete). The wait between clicks stays 1.5 seconds.
  click: {
    label: 'Crumbs',
    tip: 'Crumbs|Each level: +1 food a|click, or +0.1x crumb|food.|Shows: click, crumb',
    ends: 3,
    levels() {
      const values = [{ food: 1, wait: 1.5, crumb: 1 }];
      for (let n = 1; n <= 80; n++) {
        const last = values[values.length - 1];
        values.push(n % 2 === 1 ? Object.assign({}, last, { food: last.food + 1 })
          : Object.assign({}, last, { crumb: Math.round((last.crumb + 0.1) * 10) / 10 }));
      }
      const costs = growingCosts(80, 2, 1.11);   // 2, 2, 2, 3 ... about 41 at level 30, 7,600 for the 80th
      for (const [food, crumb, cost] of [[50, 6, 200000], [60, 7, 1000000], [80, 8, 5000000]]) {
        values.push({ food, wait: 1.5, crumb });
        costs.push(cost);
      }
      return { values, costs };
    },
    show: (v) => ['+' + v.food, 'x' + v.crumb]
  },
  // Away: how many minutes of the time the game is closed still earn food,
  // and what percent of the usual food is earned in that time. Between two
  // main steps there are four levels: half the extra time, the rest of it,
  // half the extra percent, the rest of it.
  away: {
    label: 'Away',
    tip: 'Away|Earn food while the|game is closed.|Shows: time, share of|normal food',
    ends: 7,
    levels() {
      const steps = [[0, 5], [5, 10], [15, 15], [30, 20], [60, 25], [120, 30], [240, 35], [480, 40], [720, 45], [1440, 50]];
      const values = [{ minutes: 0, percent: 5 }];
      for (let n = 0; n + 1 < steps.length; n++) {
        const [m0, p0] = steps[n];
        const [m1, p1] = steps[n + 1];
        values.push({ minutes: Math.round((m0 + m1) / 2), percent: p0 }, { minutes: m1, percent: p0 },
          { minutes: m1, percent: (p0 + p1) / 2 }, { minutes: m1, percent: p1 });
      }
      const costs = growingCosts(36, 3, 1.48);   // 3, 4, 7, 10 ... about 2,700,000 for the 36th
      // The first level goes straight to 5 minutes (what the first two used
      // to do), for the first level's price.
      values.splice(1, 1);
      costs.splice(1, 1);
      // After the last step: more of the usual food, then more time, at a high price.
      for (const [minutes, percent, cost] of [[1440, 60, 3000000], [1440, 70, 5000000], [1440, 80, 10000000], [1440, 90, 20000000],
        [1440, 100, 40000000], [2160, 100, 250000000], [2880, 100, 1000000000]]) {
        values.push({ minutes, percent });
        costs.push(cost);
      }
      return { values, costs };
    },
    show: (v) => [minutesText(v.minutes), v.percent + '%']
  },
  // Work Speed: seconds a worker takes to bring in 1 food, and its Ant
  // Athleticism level (see ATHLETICS below). 70 small levels: between two
  // main steps, ten levels of 0.05 s (0.1 s as shown), then two of
  // Athleticism (half a level each). Every level also shortens the rest
  // workers take in the nest between trips a little, down to half.
  work: {
    label: 'Work Speed',
    tip: 'Work Speed|Workers gather, run,|carry and rest better.|Shows: seconds per|food, run speed',
    ends: 3,
    levels() {
      const steps = [[5, 0], [4.5, 2], [4, 4], [3.5, 6], [3, 8], [2.5, 10], [2, 10]];
      const values = [{ seconds: 5, athletics: 0 }];
      for (let n = 0; n + 1 < steps.length; n++) {
        const [s0, a0] = steps[n];
        const [s1, a1] = steps[n + 1];
        for (let i = 1; i <= 10; i++) values.push({ seconds: Math.round((s0 + (s1 - s0) * i / 10) * 1000) / 1000, athletics: a0 });
        for (let a = a0 + 1; a <= a1; a++) values.push({ seconds: s1, athletics: a });
      }
      const last = values.length - 1;
      values.forEach((v, i) => { v.rest = Math.round((1 - 0.5 * i / last) * 1000) / 1000; });
      const costs = growingCosts(last, 23, 1.1);   // 23, 25, 28 ... about 360 at level 30, 17,000 for the 70th
      for (const [seconds, cost] of [[1.8, 500000], [1.6, 2500000], [1.4, 10000000]]) {
        values.push({ seconds, athletics: 10, rest: 0.5 });
        costs.push(cost);
      }
      return { values, costs };
    },
    show: (v) => [Math.round(v.seconds * PASSIVE_SLOW.worker * 100) / 100 + 's', 'x' + ATHLETICS[v.athletics].speed]
  },
  // Harvester: food a seed gives in the granary, how long seeds take to
  // appear, as a share of the usual 25 to 50 seconds, and how many can lie
  // on the grass at once. With no Harvester a seed gives half (23); the
  // first level, 10 food, fixes that, then 23 small levels take a seed from
  // 45 to 300 food. The seed wait and the most seeds follow the food along
  // the old main steps. The last regular level brings a seed every 5 to
  // 8.5 seconds.
  harvester: {
    label: 'Harvester',
    tip: 'Harvester|Seeds and fungus give|more food, seeds come|faster and more can lie|on the grass.|Shows: food per seed',
    ends: 4,
    levels() {
      // [food a seed, seed wait as a share of the usual, most seeds on the grass at once]
      const anchors = [[45, 1, 5], [60, 0.85, 5], [75, 0.7, 5], [90, 0.5, 6], [120, 0.35, 8], [150, 0.25, 10], [300, 0.15, 10]];
      const along = (food) => {
        for (let n = 0; n + 1 < anchors.length; n++) {
          const [f0, w0, c0] = anchors[n];
          const [f1, w1, c1] = anchors[n + 1];
          if (food > f1) continue;
          const t = (food - f0) / (f1 - f0);
          return { food, wait: Math.round((w0 + (w1 - w0) * t) * 1000) / 1000, cap: Math.round(c0 + (c1 - c0) * t) };
        }
        return { food, wait: 0.15, cap: 10 };
      };
      const values = [{ food: 23, wait: 1, cap: 5 }];
      for (let n = 0; n < 24; n++) values.push(along(Math.round(45 * Math.pow(300 / 45, n / 23))));
      values[24].range = [5000, 8500];   // last regular level: a seed every 5 to 8.5 s
      const costs = growingCosts(24, 10, 1.417);   // 10, 14, 20 ... about 230 at level 10, 30,000 for the 24th
      for (const [food, cost] of [[400, 500000], [500, 2500000], [650, 10000000], [850, 40000000]]) {
        values.push({ food, wait: 0.15, cap: 10, range: [5000, 8500] });
        costs.push(cost);
      }
      return { values, costs };
    },
    show: (v) => String(v.food)
  }
};

// A price rounded to two significant figures.
function roundPrice(raw) {
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1));
  return Math.max(1, Math.round(raw / step) * step);
}

for (const key in UPGRADES) Object.assign(UPGRADES[key], UPGRADES[key].levels());

// Saves from before the in-between levels: each old level is two new ones.
const UPGRADE_STEPS = 2;
// Saves from before Harvester's cheap first level: their level is one higher now.
const HARVESTER_FIRST = 1;
// Saves from before Work Speed's small levels: old level -> new level.
const WORK_SPLIT = 1;
const WORK_FROM_OLD = [0, 5, 6, 11, 12, 17, 18, 23, 24, 29, 30, 32, 35];
// Saves from before every upgrade had twice the levels (layout 1): the
// level with about the same effect. Layout 2: before Away's first two levels
// became one.
const UPGRADE_LAYOUT = 3;
function levelFromLayout1(key, level) {
  if (key === 'harvester') {
    const oldFood = [23, 45, 53, 60, 68, 75, 83, 90, 105, 120, 135, 150, 300][Math.min(level, 12)];
    const values = UPGRADES.harvester.values;
    let n = 0;
    while (n + 1 < values.length - UPGRADES.harvester.ends && values[n + 1].food <= oldFood) n++;
    return n;
  }
  if (key === 'away') return level <= 18 ? level * 2 : 36 + (level - 18);   // the old costly levels follow on (layout 2 numbering)
  return level * 2;   // Crumbs, Work Speed: two new levels for each old one
}

// Old saves had these upgrades split in two. Each merged upgrade starts at
// the higher of its two old levels.
const MERGED_UPGRADES = { click: ['clickRate', 'clickAmount'], away: ['awayTime', 'awayRate'], work: ['workSpeed', 'athletics'] };

// Minutes written short: 5m, 2h, 1.5h.
function minutesText(minutes) {
  return minutes < 60 ? minutes + 'm' : minutes / 60 + 'h';
}

// What each Ant Athleticism level (part of Work Speed) does: how many times faster workers go for
// the crumb, and how many pixels of it they carry back (fewest, most). Every
// other level is a half level between the two around it.
const ATHLETICS = [
  { speed: 1, carryMin: 2, carryMax: 3 },
  { speed: 1.5, carryMin: 3, carryMax: 4 },
  { speed: 2, carryMin: 4, carryMax: 5 },
  { speed: 2.5, carryMin: 5, carryMax: 6 },
  { speed: 3, carryMin: 6, carryMax: 7 },
  { speed: 4, carryMin: 7, carryMax: 8 }
].flatMap((level, n, list) => {
  const next = list[n + 1];
  return next ? [level, { speed: (level.speed + next.speed) / 2, carryMin: level.carryMin, carryMax: next.carryMax }] : [level];
});

// The highest level an upgrade can reach.
function maxLevel(key) {
  return UPGRADES[key].values.length - 1;
}

// The highest level before the very expensive end levels.
function regularMax(key) {
  return maxLevel(key) - (UPGRADES[key].ends || 0);
}

// The price of the next level, when the upgrade is at `level` now.
function upgradeCost(key, level) {
  return UPGRADES[key].costs[level];
}

/*
 * Nuptial flight upgrades, bought with honeydew. They form a tree: each
 * one (except the first) needs the one it grows from (`needs`) bought first.
 * `costs` has one price per time it can be bought. `col` and `row` place it
 * in the tree window (4 columns, 4 rows). `tip` is shown when the mouse
 * rests on it: one line per "|".
 * Aphids don't do anything yet.
 *
 * What each one does is worked into the game where it applies: Pheromone
 * trails in tripSteps(), Step counting, Charitable Toddler and Communal
 * Stomach in fieldRules(), Nanitics, Supercolony and Mealybug flight in
 * takeFlight(), and Aphid Farming shows the Aphids count.
 */
// `from` names the ants your harvester ants learned it from (shown in red under the tip).
// Perk page III: opens once every page I upgrade is owned and at least
// `pageTwoLeast` page II upgrades are bought. Its three upgrades can be
// bought again and again (up to `levels` times): each level adds `share`
// (2%) to seed food, worker speed or soldier bites, and costs `growth`
// times the last, from `start`.
const PAGE_THREE = { pageTwoLeast: 5, start: 150 * 0.25, growth: 1.2, share: 0.02, levels: 60 };

const PERKS = {
  pheromone: {
    title: 'Pheromone trails', costs: [1], col: 1, row: 2, from: 'fire ants',
    tip: 'Workers gather 45%|faster. Unlocks|pheromone trail|building.'
  },
  stepCounting: {
    title: 'Step counting', costs: [3, 20, 40], col: 0, row: 2, needs: 'pheromone', from: 'desert ants',
    tip: 'Workers walk 25%|faster per level.'
  },
  pheromone2: {
    title: 'Cuticular hydrocarbons', costs: [5, 10, 20], col: 0, row: 3, needs: 'stepCounting', from: 'black garden ants',
    tip: 'Workers gather 22.5%|faster per level.'
  },
  bivouac: {
    title: 'Bivouac', costs: [20], col: 1, row: 3, needs: 'pheromone2', from: 'driver ants',
    tip: 'Workers and soldiers|gather 1% faster per|other ant.|Ant prices rise 2%|slower.'
  },
  superMajor: {
    title: 'Bigheaded', costs: [100], col: 2, row: 3, needs: 'bivouac', from: 'bigheaded ants',
    tip: 'Unlocks Majors, an|upgrade to soldiers,|which crack seeds,|produce more idle|food, and have more|health.|Unlocks the supermajor.'
  },
  nanitics: {
    title: 'Nanitics', costs: [3], col: 1, row: 1, needs: 'pheromone', from: 'Pharaoh ants',
    tip: 'Start each new colony|with 2 workers (and get|2 now).'
  },
  // Two levels: Repletes, then Honeypot (the box shows the next one's name).
  repletes: {
    title: 'Repletes', costs: [5, 10], col: 0, row: 0, needs: 'communalStomach', from: 'honeypot ants',
    levelTitles: ['Repletes', 'Honeypot'],
    tip: 'Unlocks repletes: they|store crumb, then pay|2.5x its food. Each|costs a worker.',
    levelTips: ['Unlocks repletes: they|store crumb, then pay|2.5x its food. Each|costs a worker.',
      'Full repletes pay 5x|instead of 2.5x.']
  },
  communalStomach: {
    title: 'Communal Stomach', costs: [3], col: 0, row: 1, needs: 'nanitics', from: 'Dracula ants',
    tip: 'Crumbs give 2x food|for each egg hatching.|Crumb to the queen is|worth 1.5x, to a|replete 1.2x.'
  },
  // Polydomy (saved as supercolony): level 2 makes the nest roomier and digging cheaper (POLYDOMY_2).
  supercolony: {
    title: 'Polydomy', costs: [20, 20, 50], col: 1, row: 0, needs: 'nanitics', from: 'wood ants',
    levelTitles: ['Polydomy', 'Polydomy', 'Formicary'], levelFrom: ['wood ants', 'wood ants', 'Allegheny mound ants'],   // (the third level has its own name)
    tip: 'Tunnels stay dug|after a flight.',
    levelTips: ['Tunnels stay dug|after a flight.', 'A bigger nest: zoom|out to see a third|more dirt each way.|Digging costs 25%|less.', 'Digging and filling|are free.']
  },
  // Seed cache: granaries and stored seeds stay after a flight.
  seedCache: {
    title: 'Seed cache', costs: [30], col: 2, row: 0, needs: 'supercolony', from: 'red harvester ants',
    tip: 'Stored seeds and|granaries stay after|a flight.'
  },
  // Supercolony and Mega colony, one upgrade with two levels (saved as
  // megaColony): the first satellite colony, then the second. Needs Seed cache.
  megaColony: {
    title: 'Supercolony', costs: [50, 75], col: 3, row: 0, needs: 'seedCache', from: 'crazy ants',
    levelTitles: ['Supercolony', 'Mega colony'],
    levelFrom: ['crazy ants', 'Argentine ants'],
    tip: 'Starts a satellite|colony that makes food,|also while away.',
    levelTips: ['Starts a satellite|colony that makes food,|also while away.', 'Starts a second|satellite colony.']
  },
  // Needs two upgrades (`requires`), drawn without lines to either. 'key:2'
  // means that upgrade's second level.
  slavemaking: {
    title: 'Fire ant slavemaking', costs: [100], col: 3, row: 1, requires: ['superMajor', 'megaColony:2'], from: 'American slavemaking ants',
    tip: '20 fire ants invade.|Beat them to hatch|fire ants: workers that|walk 1.5x as fast, at|2x the price.'
  },
  charitable: {
    title: 'Charitable Toddler', costs: [5, 20], col: 2, row: 1, needs: 'nanitics', from: 'odorous house ants',
    tip: 'Up to 2 bread crumbs|on the grass.',
    levelTips: ['Up to 2 bread crumbs|on the grass.', 'Bread crumbs come|back twice as fast.']
  },
  fungalGarden: {
    title: 'Fungal garden', costs: [10], col: 2, row: 2, needs: 'pheromone', from: 'northern fungus-gardening ants',
    tip: 'Unlocks fungus gardens:|fed crumbs, they turn|into food.'
  },
  // The Midden (field.js): a trash pile painted in the Build menu.
  midden: {
    title: 'Midden', costs: [15], col: 3, row: 2, needs: 'fungalGarden', from: 'red harvester ants',
    tip: 'Unlocks the midden: a|trash pile you paint.|Once full, a plant|grows over it and|bursts into seeds.'
  },
  // Two levels: Aphid Farming, then Mealybug flight (the box shows the next one's name).
  aphidFarming: {
    title: 'Aphid Farming', costs: [35, 30], col: 3, row: 3, needs: 'midden', from: 'rover ants',
    levelTitles: ['Aphid Farming', 'Mealybug flight'],
    levelFrom: ['rover ants', 'Acropyga sp. ants'],
    tip: 'Unlocks aphids.|+10% honeydew earnings|per aphid.',
    levelTips: ['Unlocks aphids.|+10% honeydew earnings|per aphid.', 'Your first aphid each|colony is free (and get|one free now).']
  },

  // Page II (after PAGE_TWO.flights flights): four branches, each bought top to bottom.
  broodTending: {
    page: 2, title: 'Brood tending', costs: [100], col: 0, row: 0, from: 'Pharaoh ants',
    tip: 'Unlocks the nursery:|build it on a floor.|Each one lets one|more egg hatch at|once. Nurseries stay|after a flight.'
  },
  seedKeepers: {
    page: 2, title: 'Seed keepers', costs: [200], col: 0, row: 1, needs: 'broodTending', from: 'red harvester ants',
    tip: 'Every seed stored or|put in a granary adds|10 waste to your|middens.'
  },
  trophallaxisChain: {
    page: 2, title: 'Trophallaxis chain', costs: [400], col: 0, row: 2, needs: 'seedKeepers', from: 'carpenter ants',
    tip: 'Crumb delivered to the|queen or a replete is|worth 10x.'
  },
  doorHead: {
    page: 2, title: 'Door-head soldiers', costs: [100], col: 1, row: 0, from: 'door-head ants',
    tip: 'Gain a door-head|soldier: 3x the|health. He guards the|queen and plugs the|nest hole in a raid.'
  },
  // Marauder raids (see MARAUDER_RAID): a hard enemy that pays honeydew when beaten.
  marauders: {
    page: 2, title: 'Army ant raids', costs: [200], col: 1, row: 1, needs: 'doorHead', from: 'army ants',
    tip: 'Army ants raid now|and then: very strong.|Half go for the queen,|half rob granaries,|aphids and repletes.|Each raid over: +5|honeydew.'
  },
  twinMajor: {
    page: 2, title: 'True polymorphism', costs: [400], col: 1, row: 2, needs: 'marauders', from: 'bigheaded ants',
    tip: 'Hatch as many|supermajors as you like,|but each costs 10x the|last. Needs Bigheaded.'
  },
  leafcutter: {
    page: 2, title: 'Leafcutter gardens', costs: [100], col: 2, row: 0, from: 'leafcutter ants',
    tip: 'Half the time, workers|feed fungus bits of|grass, not crumb.|Fungus pays 20% more.'
  },
  weaverNests: {
    page: 2, title: 'Weaver nests', costs: [200], col: 2, row: 1, needs: 'leafcutter', from: 'weaver ants',
    tip: 'Buildings cost 10%|less for each egg|hatching (up to 75%).'
  },
  honeypotReserves: {
    page: 2, title: 'Honeypot reserves', costs: [400], col: 2, row: 2, needs: 'weaverNests', from: 'honeypot ants',
    tip: 'In winter each replete|shares its store: a|full payout every 30 s,|as steady food.'
  },
  diapause: {
    page: 2, title: 'Diapause', costs: [100], col: 3, row: 0, from: 'acorn ants',
    tip: 'Seeds give 6x the food|in winter (not 4x).'
  },
  rainFlight: {
    page: 2, title: 'Rain flight', costs: [200], col: 3, row: 1, needs: 'diapause', from: 'black garden ants',
    tip: 'A nuptial flight taken|in the rain gives 50%|more honeydew.'
  },
  microbialHeaters: {
    page: 2, title: 'Microbial heaters', costs: [400], col: 3, row: 2, needs: 'rainFlight', from: 'wood ants',
    tip: 'Microbes rotting in the|nest mound keep it warm:|workers go out for|crumbs, seeds and litter|in winter, and crumbs|and seeds keep coming.'
  },
  // Page II, fourth row (500 each).
  autoHatch: {
    page: 2, title: 'Superorganism', costs: [500], col: 0, row: 3, needs: 'trophallaxisChain', from: 'army ants',
    tip: 'The colony hatches ants|on its own: a worker or|a soldier, whichever is|cheaper, whenever you|can pay. Turn it off at|the top of the Ants menu.'
  },
  laborShare: {
    page: 2, title: 'Division of labor', costs: [500], col: 1, row: 3, needs: 'twinMajor', from: 'Pheidole ants',
    tip: 'Soldiers do every|worker job too, and|worker upgrades help|them. Majors still|crack seeds.'
  },
  lycaenid: {
    page: 2, title: 'Lycaenid Mutualism', costs: [500], col: 2, row: 3, needs: 'honeypotReserves', from: 'Myrmica ants',
    tip: 'Unlocks one big|caterpillar to place in|the Build menu. Every|minute the game is open|an ant milks it: +1|honeydew.'
  },
  nuptialSwarm: {
    page: 2, title: 'Nuptial swarm', costs: [500], col: 3, row: 3, needs: 'microbialHeaters', from: 'black garden ants',
    tip: 'Raise up to 6 alates,|each 25x the price of|the last. Each one adds|25% honeydew to a|flight.'
  },
  // Page III (see PAGE_THREE): three small boosts bought again and again, a
  // way to spend honeydew once everything else is owned.
  messor: {
    page: 3, endless: true, title: 'Messor', costs: growingCosts(PAGE_THREE.levels, PAGE_THREE.start, PAGE_THREE.growth), col: 0.5, row: 1.5, from: 'Messor harvester ants',
    tip: 'Seeds, ant bread and|fungus give ' + PAGE_THREE.share * 100 + '% more|food a level.'
  },
  silver: {
    page: 3, endless: true, title: 'Silver', costs: growingCosts(PAGE_THREE.levels, PAGE_THREE.start, PAGE_THREE.growth), col: 1.5, row: 1.5, from: 'Saharan silver ants',
    tip: 'Workers walk ' + PAGE_THREE.share * 100 + '%|faster a level.'
  },
  marauder: {
    page: 3, endless: true, title: 'Marauder', costs: growingCosts(PAGE_THREE.levels, PAGE_THREE.start, PAGE_THREE.growth), col: 2.5, row: 1.5, from: 'marauder ants',
    tip: 'Soldiers bite ' + PAGE_THREE.share * 100 + '%|harder a level.'
  }
};

// Tool sizes on the Size slider: small, medium, large. Each is the width of
// the square in game pixels.
const TOOL_SIZES = [2, 4, 8];

const STEP_MS = 100;                  // the game counts time in tenth-of-a-second steps
const SAVE_VERSION = 3;               // bump when the meaning of saved numbers changes
const PUPA_MS = RULES.hatchMs / 2;    // an egg becomes a pupa halfway to hatching
const SAVE_KEY = 'antTycoonSave';     // food, ants, eggs, prices
const CAVE_KEY = 'antTycoonCave';     // the shape of the tunnels

// The game can be open in two places at once (the toolbar popup and the
// floating window). Each copy marks what it saves, so it can tell its own
// saves from the other copy's and pick up the other copy's changes.
const COPY_ID = Math.random().toString(36).slice(2);

// True when this copy is running inside the floating window.
const IN_FLOATING_WINDOW = window.top !== window;

// The name on the title bar, until the player changes it.
const DEFAULT_NAME = 'Ant Farm';
const NAME_MAX = 24;   // most letters that fit on the title bar

// A name with only the letters the pixel font can draw, cut to fit.
function cleanName(text) {
  return [...String(text || '')].filter((ch) => PixelFont.GLYPHS[ch]).join('').slice(0, NAME_MAX);
}

/*
 * Honeydew. A nuptial flight turns the food harvested this run into
 * honeydew: the first drop takes JELLY.first food, and each one after
 * that takes more than the one before: 1,000 more up to the 50th drop,
 * 2,000 more from the 51st, and 6,000 more from the 101st (JELLY.steps).
 * So 5,000 food gives 1, 11,000 gives 2, 18,000 gives 3, 26,000 gives 4:
 * more food always helps, but each drop costs more.
 */
const JELLY = { first: 5000, steps: [[1, 1000], [51, 2000], [101, 6000]] };   // [from this drop on, its price rises by this much over the last]
const jellyTotals = [0];   // food needed for 0, 1, 2 ... drops, filled in as needed

// Food needed in one run for `count` honeydew.
function foodForJelly(count) {
  while (jellyTotals.length <= count) {
    const k = jellyTotals.length;   // the drop being priced (1 is the first)
    let price = JELLY.first;
    if (k > 1) {
      const step = JELLY.steps.filter(([from]) => k >= from).pop()[1];
      price = (jellyTotals[k - 1] - jellyTotals[k - 2]) + step;
    }
    jellyTotals.push(jellyTotals[k - 1] + price);
  }
  return jellyTotals[count];
}

// Honeydew a run that harvested this much food earns.
function jellyForFood(harvested) {
  let count = 0;
  while (foodForJelly(count + 1) <= harvested) count++;
  return count;
}

// The listed price of a small dig after this many digs.
function listedDigCost(digs) {
  return RULES.digCostStart + RULES.digCostScale * Math.pow(digs, RULES.digCostPower);
}

/* An ant's price after one more purchase: the flat step plus 12% of the current price. */
function nextCost(cost, step, growth = RULES.costGrowth) {
  return cost + step + Math.round(cost * growth);
}

// Early workers cost a little more: the second is `second`, and the price
// step is `step` (not the usual costStep) while the price is under `under`
// (the first 5 purchases): 5, 15, 22, 30, 39, 49, then the usual.
const EARLY_WORKERS = { second: 15, step: 5, under: 40 };
function nextAntCost(type, cost, growth) {
  const kind = ANT_TYPES[type];
  if (type === 'worker' && cost <= kind.costStart) return EARLY_WORKERS.second;
  if (type === 'worker' && cost < EARLY_WORKERS.under) return nextCost(cost, EARLY_WORKERS.step, growth);
  return nextCost(cost, kind.costStep, growth);
}

// How much this kind of ant's price rises a purchase (as a share of the
// price): 12%, or the kind's own; the Bivouac honeydew upgrade takes 2% off.
const BIVOUAC_GROWTH_CUT = 0.02;
const TWIN_GROWTH = 9;   // (the price plus 9 times itself: 10x)
function antGrowth(type) {
  if (type === 'supermajor' && perkLevel('twinMajor') > 0) return TWIN_GROWTH;   // True polymorphism (key twinMajor): each one 10x the last
  const growth = ANT_TYPES[type].costGrowth || RULES.costGrowth;
  return perkLevel('bivouac') > 0 ? growth - BIVOUAC_GROWTH_CUT : growth;
}

/* ---------- Game state ---------- */

function newGame() {
  return {
    food: RULES.startFood,
    ants: { worker: 0, soldier: 0, fireAnt: 0, supermajor: 0 },   // ants that have hatched
    antCost: {
      worker: ANT_TYPES.worker.costStart,
      soldier: ANT_TYPES.soldier.costStart,
      fireAnt: ANT_TYPES.fireAnt.costStart,
      supermajor: ANT_TYPES.supermajor.costStart
    },
    phase: { worker: 0, soldier: 0, fireAnt: 0, supermajor: 0, aphid: 0 },   // steps since each kind last brought food
    eggs: [],                               // one entry per egg: { hatchAt, spot, type }
    fireEggs: [],                           // eggs in the fire ant nest (firenest.js): { laidAt, hatchAt, spot }
    digs: 0,                                // digs so far (the dig price rises with them)
    digCost: listedDigCost(0),              // listed price of a small dig right now
    trailBlocks: 0,                         // pheromone trail blocks placed (the price rises with them)
    middenBlocks: 0,                        // midden blocks painted (the price rises with them)
    upgrades: { click: 0, away: 0, work: 0, harvester: 0 },   // level of each upgrade
    upgradeSteps: UPGRADE_STEPS,            // how upgrade levels are counted (see UPGRADE_STEPS)
    harvesterFirst: HARVESTER_FIRST,        // and Harvester's (see HARVESTER_FIRST)
    workSplit: WORK_SPLIT,                  // and Work Speed's (see WORK_SPLIT)
    upgradeLayout: UPGRADE_LAYOUT,          // and the twice-as-many levels (see UPGRADE_LAYOUT)
    priceGrowth: RULES.costGrowth,          // the ant price growth the prices were set with
    alate: false,                           // true once the winged queen is raised (needed to fly)
    alates: 0,                              // how many are raised (Nuptial swarm: up to 6)
    trophicEggs: 0,                         // trophic eggs laid this run (Upgrades menu)
    flights: 0,                             // nuptial flights taken so far (kept by flights)
    flightsEver: 0,                         // nuptial flights in all, before platinum restarts too (kept by flights and restarts)
    cheats: false,                          // true once C was pressed: fly with no alate, aphid button shown (kept by flights)
    slowHatch: false,                       // true after the H developer key: eggs hatch at the usual speed even after C (kept by flights)
    flightTutorialDone: false,              // true once the nuptial flight menu's short tutorial was shown (kept by flights)
    hoverTipShown: false,                   // true once "Hover over anything..." was shown on the Build menu (kept by flights)
    supportAsked: false,                    // true once the one-time support request was shown (kept by flights)
    supportAgainAt: 0,                      // LATER: ask again once this many flights are taken (0: never)
    fireAntsSeen: false,                    // true once the first fire ant raid came (kept by flights)
    raidIn: null,                           // ms of open-game time until the next raid (kept when closed, and by flights)
    marauderIn: null,                       // the same for the next marauder raid (Marauder raids)
    beetleIn: null,                         // ms of open-game time until a rove beetle sneaks in (the same way)
    beetleSeen: false,                      // true once the first rove beetle was announced (kept by flights)
    anteaterIn: null,                       // ms of open-game time until an anteater comes (kept by flights)
    anteaterSeen: false,                    // true once the first anteater was announced (kept by flights)
    missingShown: { worker: 0, soldier: 0 },   // ants the anteater ate off the screen: that many fewer walk about until more hatch
    surfaceWarned: false,                   // true once told that digging the surface means fewer seeds (kept by flights)
    season: { t: 0, year: 0, rainAt: null, rained: false, rainUntil: 0, introSeen: false, winterSeen: false },   // the season clock (see SEASON), kept by flights
    scoutIn: null,                          // ms of open-game time until scouts find something (see SCOUT)
    scoutFind: null,                        // what they found, waiting: { kind, value, need, until }
    scouts: null,                           // workers out on a trip: { count, backAt, food }
    raidAnts: [],                           // the fire ants of a raid under way, saved so closing the game doesn't end it
    downedSoldiers: [],                     // soldiers fallen or healing when the game closed (they stay down)
    herds: 0,                               // Mealybug Herds (field.js keeps them; counted here for honeydew)
    invasion: null,                         // Fire ant slavemaking: null, 'warned', 'on', then 'won' (kept by flights)
    jasonUsed: false,                       // true once the JASON bonus was given (kept by flights)
    angeleeUsed: false,                     // true once the ANGELEE honeydew was given (kept by flights)
    starCodeUsed: false,                    // true once the star code was used (kept by flights and platinum restarts)
    stats: newStats(),                      // counts for achievements (kept by flights)
    achieve: {},                            // achievement key: 'ready' or 'claimed' (kept by flights)
    achieveShown: false,                    // true once the Achievements button appears (kept by flights)
    pageTwoSeen: false,                     // true once perk page II was opened (it blinks until then; kept by flights)
    pageThreeSeen: false,                   // the same for page III
    readTerms: {},                          // encyclopedia entries opened: { term: 1 } (kept by flights)
    weaver: newWeaver(),                    // the weaver ants up in the canopy (canopy.js): kept by flights
    early: 'none',                          // the early player offer (PLATINUM): 'pending' for saves from before it, then 'taken' or 'declined'; 'none' for new players
    platinum: { early: 0, page2: 0 },       // platinum stars: from the early player offer (0 to 3), and from page II restarts (kept by flights and restarts)
    hatchedRun: 0,                          // ants hatched this run
    flats: { minor: false, major: false },  // Minor workers and Major soldiers bought this run
    satellite: { level: 0, lastAt: null },  // satellite colony: upgrade level, and the time its food is counted up to
    satellite2: { level: 0, lastAt: null }, // the second satellite colony (Polydomy), the same way
    crumbs: null,                           // the bread crumbs on the grass (kept by field.js)
    harvested: 0,                           // food brought in this run, boosted by aphids (turned into honeydew by a flight)
    peacefulHarvested: 0,                   // the part of `harvested` brought in while Peaceful mode was on (see PEACEFUL)
    aphids: 0,                              // aphids, each in its pen (field.js keeps where)
    freeAphids: 0,                          // aphids that can be placed for free (Mealybug flight)
    crumbClicked: false,                    // true once the player has clicked a crumb (no more "Click!" arrow)
    tutorialAsked: false,                   // true once the player answered "30-second tutorial?"
    royal: { jelly: 0, perks: {} },         // honeydew (named jelly in the save), and how many times each nuptial flight upgrade was bought
    name: DEFAULT_NAME,                     // the name on the window's title bar (the player can change it)
    music20: true,                          // the music was set to 20% once, with the weaver ant update (see readSettings)
    settings: { music: 20, sfx: 70, sfxOn: true, lineAssist: true, fungusShare: FUNGUS_SPLIT.start, seedMode: 'eat', autoHatch: true, peaceful: false },   // volumes in percent (music at 20% to start), sound effects on or off (Settings); Line assist box in the Dig menu
    lastTick: Date.now()                    // the time the game is counted up to
  };
}

let state = newGame();

// What the player has picked on the dig menu. Not saved.
let tool = 'dig';       // 'dig' or 'fill'
let sizeIndex = 2;      // position of the Size slider: 0, 1 or 2 (starts at large)
let shape = 'round';    // 'square' or 'round' (starts round)

// How many walking ants to show for this many ants of one kind.
function walkersFor(count, kind = 'soldier', nanitics = true) {
  const rule = RULES.walkers[kind];
  let shown = rule.at.filter((at) => count >= at).length;
  // Nanitics: the two workers a colony starts with both walk about.
  if (kind === 'worker' && nanitics && perkLevel('nanitics') > 0) shown = Math.max(shown, Math.min(count, 2));
  const last = rule.at[rule.at.length - 1];
  if (count > last) shown += Math.floor((count - last) / rule.every);
  return Math.min(shown, rule.max || RULES.maxWalkers);
}

function totalAnts() {
  return state.ants.worker + state.ants.soldier + state.ants.fireAnt;
}

/*
 * The rules the field and the walking ants follow, from the upgrades:
 *   Crumb Value       food per click, wait between clicks, and what a bit of crumb is worth
 *   Work Speed        also how fast workers go for a crumb and how much they carry
 *   Step counting     workers walk 25% faster per level
 *   Charitable Toddler  two crumbs at a time instead of one; level 2: they come back twice as fast
 *   Communal Stomach  crumbs give 2x the food for each egg hatching, and crumb
 *                     fed to the queen is worth 1.5x, to a replete 1.2x
 */
// Communal Stomach: every crumb gives perEgg times the food for each egg
// hatching; crumb fed to the queen is also worth `queen` times, to a replete `replete` times.
const COMMUNAL = { perEgg: 2, queen: 1.5, replete: 1.2 };

function fieldRules() {
  const eggs = state.eggs.length;
  const rules = Object.assign({
    clickWaitMs: Date.now() < beetleFrenzyUntil ? 0 : upgradeValue('click').wait * 1000,   // a rove beetle frenzy: no wait...
    clickFood: upgradeValue('click').food * (Date.now() < beetleFrenzyUntil ? BEETLE.frenzyTimes : 1),   // ...and 10x a click
    rush: Date.now() < beetleRushUntil,
    regrow: Date.now() < beetleFrenzyUntil,   // a click frenzy: an eaten crumb is back at once (even in winter)
    fruit: !!state.weaver && state.weaver.best >= 2,
    peaceful: peaceful(),   // Peaceful mode: the fruit countdown waits (field.js)   // weaver branch 2: fruit falls from the tree now and then
    rainForage: !!state.weaver && state.weaver.best >= 3,   // weaver branch 3: waterproof canopies, ants go out in the rain
    midden: middenUnlocked(),   // workers take waste (and fire ant bodies) to the midden   // a rove beetle rush: workers 10x as fast, no rests
    restScale: upgradeValue('work').rest,   // Work Speed: shorter rests between trips
    crumbWorth: upgradeValue('click').crumb,
    seedFood: upgradeValue('harvester').food * pageThreeBoost('messor'),   // (Messor, page III)
    seedWait: upgradeValue('harvester').wait,
    seedMax: upgradeValue('harvester').cap,
    seedRange: upgradeValue('harvester').range || null,
    walkSpeed: (1 + 0.25 * perkLevel('stepCounting')) * pageThreeBoost('silver'),   // Step counting, and Silver (page III)
    soldierBite: pageThreeBoost('marauder'),   // Marauder (page III): soldiers bite harder (ants.js)
    slots: perkLevel('charitable') > 0 ? 2 : 1,
    respawnScale: perkLevel('charitable') >= 2 ? 0.5 : 1,   // Charitable Toddler level 2: crumbs back twice as fast
    foodBoost: perkLevel('communalStomach') > 0 ? Math.max(1, COMMUNAL.perEgg * eggs) : 1,
    queenBoost: perkLevel('communalStomach') > 0 ? COMMUNAL.queen : 1,
    repleteBoost: perkLevel('communalStomach') > 0 ? COMMUNAL.replete : 1,
    fungusShare: state.settings.fungusShare / 100,
    repletePays: REPLETE_PAYS.base * (perkLevel('repletes') >= 2 ? REPLETE_PAYS.honeypot : 1),
    minor: state.flats.minor,                // Minor workers: faster, less rest (ants.js)
    // Seasons (see SEASON) and the seed setting:
    winter: isWinter(),
    winterForage: perkLevel('microbialHeaters') > 0,   // Microbial heaters: foraging, and crumbs, go on in winter
    rain: isRaining(),
    dusk: duskShare(),
    seedMult: isWinter() ? (perkLevel('diapause') > 0 ? SEASON.diapauseSeeds : SEASON.winterSeeds) : 1,
    storeSeeds: seasonsOn() && state.settings.seedMode === 'store',
    // Perk page II:
    seedAgeMs: 0,   // (Seed keepers used to age stored seeds into ant bread)
    keeperWaste: perkLevel('seedKeepers') > 0 ? PAGE_TWO.keeperWaste : 0,
    labor: perkLevel('laborShare') > 0,   // Division of labor: soldiers do worker jobs (ants.js)   // Seed keepers: waste to the middens for each seed put away
    leafcutter: perkLevel('leafcutter') > 0,   // Leafcutter gardens: grass for the fungus half the time (ants.js), fungus pays 20% more
    fungusWorth: perkLevel('leafcutter') > 0 ? 1.2 : 1
  }, ATHLETICS[upgradeValue('work').athletics]);
  if (perkLevel('trophallaxisChain') > 0) {   // Trophallaxis chain: crumb to the queen or a replete is worth 10x
    rules.queenBoost *= 10;
    rules.repleteBoost *= 10;
  }
  if (state.flats.minor) {                   // ...and 30% more crumb carried
    rules.carryMin = Math.round(rules.carryMin * 1.3);
    rules.carryMax = Math.round(rules.carryMax * 1.3);
  }
  return rules;
}

// How many times a nuptial flight upgrade has been bought.
function perkLevel(key) {
  return state.royal.perks[key] || 0;
}

// Can this nuptial flight upgrade be bought now? 'owned' (bought as many
// times as it can be), 'locked' (needs another first), 'short' (not enough
// royal jelly) or 'ready'.
// A `requires` entry: 'key' (owned at all) or 'key:2' (that level or more).
// Perk page II opens after this many nuptial flights.
// Perk page II is open: after PAGE_TWO.flights flights, or once the C key was pressed.
function pageTwoOpen() {
  return state.flights >= PAGE_TWO.flights || state.cheats;
}
function pageThreeOpen() {
  if (state.cheats) return true;
  const pageOneDone = Object.keys(PERKS).every((k) => (PERKS[k].page || 1) !== 1 || perkLevel(k) >= PERKS[k].costs.length);
  const pageTwoBought = Object.keys(PERKS).filter((k) => PERKS[k].page === 2 && perkLevel(k) > 0).length;
  return pageOneDone && pageTwoBought >= PAGE_THREE.pageTwoLeast;
}
// A page III boost: 1 + 2% for each level of `key`.
function pageThreeBoost(key) {
  return 1 + PAGE_THREE.share * perkLevel(key);
}
const PAGE_TWO = { flights: 3, seedAgeMs: 5 * 60000, weaverPerEgg: 0.1, weaverMost: 0.75, keeperWaste: 10, honeypotEveryS: 30, rainFlight: 1.5 };

function needMet(need) {
  const [key, level] = need.split(':');
  return perkLevel(key) >= (Number(level) || 1);
}
function needTitle(need) {
  const [key, level] = need.split(':');
  const perk = PERKS[key];
  return level && perk.levelTitles ? perk.levelTitles[Number(level) - 1] : perk.title;
}

// Why a locked upgrade can't be bought yet, for its tip.
function lockedNote(key) {
  const perk = PERKS[key];
  if (perk.page === 2 && !pageTwoOpen()) return 'Opens after ' + PAGE_TWO.flights + ' flights';
  if (perk.page === 3 && !pageThreeOpen()) return 'Opens when page I is|all owned, with ' + PAGE_THREE.pageTwoLeast + '|page II upgrades';
  const needs = (perk.requires || (perk.needs ? [perk.needs] : [])).filter((need) => !needMet(need));
  if (key === 'twinMajor' && perkLevel('superMajor') === 0) needs.push('superMajor');
  return needs.length ? 'Needs ' + needs.map(needTitle).join(' and|') : 'Locked';
}

function perkState(key) {
  const perk = PERKS[key];
  if (!perk) return 'locked';   // (a perk that no longer exists, from an old save or the dev keys)
  const level = perkLevel(key);
  if (level >= perk.costs.length) return 'owned';
  if (perk.page === 2 && !pageTwoOpen()) return 'locked';
  if (perk.page === 3 && !pageThreeOpen()) return 'locked';
  if (key === 'twinMajor' && perkLevel('superMajor') === 0) return 'locked';   // (a second supermajor needs the first)
  if (perk.needs && perkLevel(perk.needs) === 0) return 'locked';
  if (perk.requires && perk.requires.some((need) => !needMet(need))) return 'locked';
  if (state.royal.jelly < perk.costs[level]) return 'short';
  return 'ready';
}

/*
 * The nuptial flight: the colony's young queen flies off to start a new
 * colony. The food harvested this run becomes honeydew, and everything
 * starts over except the honeydew, the nuptial flight upgrades, the
 * name, the settings, and the tunnels if Supercolony was bought. Press
 * FLY twice (within 3 seconds) to go.
 */
const FLY_CONFIRM_MS = 3000;
let flyArmedUntil = 0;

// Honeydew a flight would give now (Rain flight: more in the rain).
function flightGain() {
  let gain = jellyForFood(state.harvested);
  if (perkLevel('nuptialSwarm') > 0) gain = Math.round(gain * (1 + SWARM.share * (state.alates || 0)));   // Nuptial swarm: +25% for each alate
  if (perkLevel('rainFlight') > 0 && isRaining()) gain = Math.round(gain * PAGE_TWO.rainFlight);
  if (gain >= 1) gain = gain * peacefulShare();   // Peaceful mode: 20% less on what was brought in while it was on
  return gain >= 1 ? Math.round(gain * platinumBoost()) : gain;   // Platinum stars: more honeydew
}

function takeFlight() {
  catchUp(Date.now());
  notePeacefulHarvest();
  const gain = flightGain();
  if (gain < 1) return;
  if (!state.alate && !state.cheats) {
    showMessage(['You need a', 'reproductive alate', 'before you can fly!']);
    return;
  }
  const now = Date.now();
  if (now > flyArmedUntil) {
    flyArmedUntil = now + FLY_CONFIRM_MS;
    render();
    setTimeout(render, FLY_CONFIRM_MS + 50);
    return;
  }
  flyArmedUntil = 0;
  const flying = state.alates || 1;   // Nuptial swarm: every alate flies off together
  // Counted for achievements (Monandry, Polyandry, Honeydew).
  if (gain === 1) state.stats.flightOne = 1;
  state.stats.bestFlight = Math.max(state.stats.bestFlight, gain);
  state.stats.honeydew += gain;

  const kept = {
    royal: { jelly: state.royal.jelly + gain, perks: state.royal.perks },
    name: state.name,
    settings: state.settings,
    crumbClicked: state.crumbClicked,
    tutorialAsked: state.tutorialAsked,
    flights: state.flights + 1,
    flightsEver: flightsEver() + 1,
    cheats: state.cheats,
    slowHatch: state.slowHatch,
    flightTutorialDone: state.flightTutorialDone,
    hoverTipShown: state.hoverTipShown,
    supportAsked: state.supportAsked,
    supportAgainAt: state.supportAgainAt,
    fireAntsSeen: state.fireAntsSeen,
    raidIn: state.raidIn,
    marauderIn: state.marauderIn,
    season: state.season,
    beetleIn: state.beetleIn,
    beetleSeen: state.beetleSeen,
    anteaterIn: state.anteaterIn,
    anteaterSeen: state.anteaterSeen,
    surfaceWarned: state.surfaceWarned,
    invasion: state.invasion,
    jasonUsed: state.jasonUsed,
    angeleeUsed: state.angeleeUsed,
    starCodeUsed: state.starCodeUsed,
    music20: state.music20,
    stats: state.stats,
    achieve: state.achieve,
    achieveShown: state.achieveShown,
    pageTwoSeen: state.pageTwoSeen,
    pageThreeSeen: state.pageThreeSeen,
    readTerms: state.readTerms,
    early: state.early,
    platinum: state.platinum,
    weaver: state.weaver
  };
  state = Object.assign(newGame(), kept);
  if (perkLevel('nanitics') > 0) state.ants.worker = 2;     // Nanitics: two workers to start
  if (perkLevel('aphidFarming') >= 2) state.freeAphids = 1;  // Mealybug flight: the first aphid is free
  state.lastTick = Date.now();

  if (perkLevel('supercolony') === 0) Field.resetCave();    // Supercolony: the tunnels stay dug
  Field.removeAphids();                                     // aphids never come along
  Field.removeFungi();                                      // nor fungus gardens
  Field.removeRepletes();                                   // nor repletes
  if (perkLevel('seedCache') === 0) Field.removeGranaries(); // nor granaries (unless Seed cache)
  else Field.clearSeeds();                                  // (Seed cache: they stay; seeds on the grass go)
  Field.setCrumbRules(fieldRules());
  Field.loadCrumbs(null);                                   // fresh crumbs
  save();
  saveCave();
  showScreen('main');
  // The new queen flies off the screen first, then the message.
  Sound.play('wings');
  Field.flyAway(flying, () => showMessage(['Nuptial Flight!', 'A new queen flies off', 'to start a new colony.', '+' + gain + ' Honeydew']));
}

/* ---------- The canopy: weaver ants (canopy.js) ----------
 * Unlocked after WEAVER.flights nuptial flights in all: the arrow over the
 * nest shows, flashing until it is first clicked, and goes up to the canopy.
 * Up there the weaver ants have their own food, made by their workers
 * (WEAVER.base a second, plus WEAVER.perWorker for each worker), only while
 * the game is open (a long gap, such as the computer asleep, counts as at
 * most WEAVER.gapMs). Leaves cost weaver food by elevation (Canopy.levelOf):
 * leafGrowth more for each row up, leafGrowthHigh more for each row past
 * branch 2. Going straight up, each step costs what the next leaf always
 * did; low leaves stay cheap. They make stairs to the next branch. Getting
 * to the top branch takes hours. */
const WEAVER = { base: 0.1, perWorker: 0.05, workerStart: 15, workerGrowth: 1.15, leafStart: 10, leafGrowth: 1.1, leafGrowthHigh: 1.13, startFood: 20, gapMs: 5000, flights: 5 };

// Weaver ants: unlocked after WEAVER.flights flights (or already visited, on older saves).
function weaverUnlocked() {
  return flightsEver() >= WEAVER.flights || state.weaver.visited || state.cheats;   // (C, the dev cheat: unlocked at once)
}

// Nuptial flights taken in all, also before platinum restarts (the weaver
// ants and the anteater go by this). Saves from before it was counted:
// at least what the achievements show (Dealate 1, Swarm Season 10,
// Nuptial Flight 25; a page II restart needs PAGE_TWO.flights).
function flightsEver() {
  return Math.max(state.flightsEver || 0, state.flights);
}
function flightsShownBefore(saved) {
  const done = (key) => saved.achieve && ['ready', 'claimed', 'old'].includes(saved.achieve[key]);
  let most = 0;
  if (done('dealate')) most = 1;
  if (saved.platinum && saved.platinum.page2 > 0) most = Math.max(most, PAGE_TWO.flights);
  if (done('swarm')) most = Math.max(most, 10);
  if (done('nuptialFlight')) most = Math.max(most, 25);
  return most;
}

function newWeaver() {
  return { visited: false, food: 0, workers: 0, leaves: [], best: 1, at: 0, showQueen: false, leavesAtBranch2: null, tutorialDone: false };   // leavesAtBranch2: leaves placed when branch 2 was reached
}

function readWeaver(saved) {
  const w = newWeaver();
  if (!saved || typeof saved !== 'object') return w;
  w.visited = saved.visited === true;
  w.food = Number.isFinite(saved.food) && saved.food > 0 ? saved.food : 0;
  w.workers = Number.isInteger(saved.workers) && saved.workers > 0 ? saved.workers : 0;
  w.leaves = Array.isArray(saved.leaves) ? saved.leaves.filter((p) => Array.isArray(p) && Number.isInteger(p[0]) && Number.isInteger(p[1])).map((p) => [p[0], p[1]]) : [];
  w.best = Number.isInteger(saved.best) && saved.best > 0 ? saved.best : 1;
  w.at = Date.now();   // (time the game was closed earns no weaver food)
  w.showQueen = saved.showQueen === true;
  w.tutorialDone = saved.tutorialDone === true;
  w.leavesAtBranch2 = Number.isInteger(saved.leavesAtBranch2) ? saved.leavesAtBranch2 : w.best >= 2 ? w.leaves.length : null;   // (saves from before this: from now on)
  return w;
}

function weaverRate() {
  return WEAVER.base + WEAVER.perWorker * state.weaver.workers;
}
function weaverWorkerCost() {
  return Math.round(WEAVER.workerStart * Math.pow(WEAVER.workerGrowth, state.weaver.workers));
}
// A leaf at elevation `level` (rows above the lowest branch's top; see Canopy.levelOf).
function leafCost(level) {
  const at = Canopy.branchLevel(1);   // branch 2's top: higher than this, costs rise faster
  if (level <= at) return Math.round(WEAVER.leafStart * Math.pow(WEAVER.leafGrowth, level));
  return Math.round(WEAVER.leafStart * Math.pow(WEAVER.leafGrowth, at) * Math.pow(WEAVER.leafGrowthHigh, level - at));
}
// The cost shown: the leaf under the mouse, or else the next step up.
function shownLeafCost() {
  const hover = Canopy.hoverLevel();
  return leafCost(hover !== null ? hover : Canopy.nextLevel());
}

function weaverTick(now) {
  const w = state.weaver;
  if (!w.visited) return;
  if (!w.at) w.at = now;
  const passed = Math.min(Math.max(0, now - w.at), WEAVER.gapMs);   // (no weaver food while the game is closed)
  w.food += weaverRate() * passed / 1000;
  w.at = now;
}

function renderCanopy() {
  el.canopyUp.hidden = !weaverUnlocked() || screen === 'canopy';
  el.canopyUp.classList.toggle('is-new', !state.weaver.visited && !state.cheats);   // (no flashing after C)
  if (screen !== 'canopy') return;
  const w = state.weaver;
  PixelFont.write(el.weaverFood, shortNumber(Math.floor(w.food), WIDE_BOX, false));
  el.weaverFoodReadout.dataset.tip = 'Weaver Food|+' + Number(weaverRate().toFixed(2)) + ' a second|from ' + w.workers + ' weaver workers|(and the queen).';
  PixelFont.write(el.weaverCount, shortNumber(w.workers, COST_BOX, false));
  PixelFont.write(el.weaverCost, shortNumber(weaverWorkerCost(), COST_BOX, true), { fit: costRoom(el.weaverCost) });
  el.btnWeaverAnt.classList.toggle('is-off', w.food < weaverWorkerCost());
  el.btnWeaverAnt.dataset.tip = 'Weaver Worker|Costs ' + weaverWorkerCost() + ' weaver food.|+' + WEAVER.perWorker + ' weaver food a|second each.';
  PixelFont.write(el.leafCost, shortNumber(shownLeafCost(), COST_BOX, true), { fit: costRoom(el.leafCost) });
  const on = Canopy.leafTool();
  el.btnWeaverLeaf.classList.toggle('is-on', on);
  el.btnWeaverLeaf.setAttribute('aria-pressed', String(on));
  el.btnWeaverLeaf.dataset.tip = 'Leaves|Click or drag to place|leaves, each touching|a branch or a leaf.|Workers climb them|only on a slant: build|stairs to the next|branch. Higher leaves|cost more, low ones|stay cheap.';
  PixelFont.write(el.weaverBranch, 'Branch ' + Canopy.reached() + ' of ' + Canopy.branches(), { small: true });
  el.weaverBranchLabel.dataset.tip = 'Branches|Each branch you reach|past the first adds to|all your food: +5%,|+10%, then +5%.|Now: +' + Math.round((weaverBoost() - 1) * 100) + '%';
  el.weaverQueen.setAttribute('aria-checked', String(w.showQueen));
  el.groupExchange.hidden = w.best < EXCHANGE.branch;
  if (w.best >= EXCHANGE.branch) {
    const rate = exchangeRate();
    PixelFont.write(el.exchangeRate, 'Each: ' + shortNumber(rate, 12, false) + ' food', { small: true });   // (the pixel font has no =)
    el.btnExchange.classList.toggle('is-off', w.food < 1);
    el.btnExchange.dataset.tip = 'Exchange|Trade all your weaver|food for food: each one|is worth ' + EXCHANGE.seconds + ' seconds of|your steady food, and|at least ' + EXCHANGE.least + ' food.|Now: ' + shortNumber(Math.floor(w.food) * rate, 12, false) + ' food';
  }
}

// Up to the canopy (fast: by the arrow over the nest).
function enterCanopy(fast) {
  if (Canopy.busy() || Canopy.isOpen()) return;
  const w = state.weaver;
  if (!w.visited) {
    w.visited = true;
    w.food += WEAVER.startFood;
    w.at = Date.now();
    save();
  }
  showScreen('canopy');
  Canopy.open(fast, () => {
    render();
    if (!w.tutorialDone && el.tut.hidden) startWeaverTutorial();
  });
  render();
}

function leaveCanopy() {
  if (Canopy.busy()) return;
  showScreen('main');
  render();
}

function hatchWeaver() {
  weaverTick(Date.now());
  const cost = weaverWorkerCost();
  if (state.weaver.food < cost) return Sound.play('button_disabled');
  state.weaver.food -= cost;
  state.weaver.workers += 1;
  save();
  render();
}

/* ---------- Platinum stars ----------
 * Players from before this update get one early player offer: restart from
 * nothing for 1 to 3 platinum stars (Polydomy earned: 1; and 200 honeydew
 * earned: 2; all of perk page I: 3). Each star is +33% steady food and
 * flight honeydew (3 stars: +100%). Any player with every page II perk can
 * restart for another star, +50%. Stars show after the farm's name.
 * Achievements are kept, turned red, and pay honeydew again when done again; the
 * Achievements button is hidden until the first flight after the restart. */
const PLATINUM = { early: [0, 33, 66, 100], page2: 50, honeydew: 200, waitMs: 500 };

// The top weaver branch: an exchange. All weaver food is traded at once, each
// for `seconds` seconds' worth of the colony's steady food (ants and
// satellite colonies), at least `least` food each.
const EXCHANGE = { seconds: 0.5, branch: 4, least: 25 };   // least: the fewest food one weaver food is worth
function exchangeRate() {
  const steady = Object.values(steadyRates()).reduce((a, b) => a + b, 0);
  return Math.max(EXCHANGE.least, Math.floor(steady * EXCHANGE.seconds));
}
function tradeWeaverFood() {
  weaverTick(Date.now());
  const w = state.weaver;
  const amount = Math.floor(w.food);
  if (w.best < EXCHANGE.branch || amount < 1) return Sound.play('button_disabled');
  const food = amount * exchangeRate();
  w.food -= amount;
  state.food += food;
  addHarvest(food);
  Sound.sfx('munch');
  save();
  render();
}

// Weaver branches: each branch reached past the first adds this much to all food.
const WEAVER_BRANCH_BOOST = { 2: 0.05, 3: 0.1, 4: 0.05 };   // by branch: +5%, +10%, +5% (+20% at the top)
// All food, from weaver branches reached up to `best` (as a share: 0.15 is +15%).
function weaverBoostAt(best) {
  let more = 0;
  for (let n = 2; n <= best; n++) more += WEAVER_BRANCH_BOOST[n] || 0;
  return more;
}
function weaverBoost() {
  return 1 + weaverBoostAt(state.weaver ? state.weaver.best : 1);
}

function platinumBoost() {
  return 1 + (PLATINUM.early[state.platinum.early] + PLATINUM.page2 * state.platinum.page2) / 100;
}

function platinumStars() {
  return state.platinum.early + state.platinum.page2;
}

const PAGE_ONE_BEFORE = { supercolony: 2 };   // levels that made page I complete before Polydomy's third level
function earlyStars() {
  if (Object.keys(PERKS).every((k) => (PERKS[k].page || 1) !== 1 || perkLevel(k) >= (PAGE_ONE_BEFORE[k] || PERKS[k].costs.length))) return 3;
  if (!state.achieve.polydomy) return 0;
  return state.stats.honeydew >= PLATINUM.honeydew ? 2 : 1;
}

function pageTwoDone() {
  return Object.keys(PERKS).every((k) => PERKS[k].page !== 2 || perkLevel(k) >= PERKS[k].costs.length);
}

// `count` platinum stars side by side on `canvas`, each pixel `scale` screen pixels (2 unless given).
function drawStars(canvas, count, scale = 2) {
  if (!canvas) return;
  const size = Sprites.sizeOf('platinumStar');
  canvas.hidden = count <= 0;
  if (count <= 0) return;
  canvas.width = count * (size.cols + 1) - 1;
  canvas.height = size.rows;
  canvas.style.width = canvas.width * scale + 'px';
  canvas.style.height = canvas.height * scale + 'px';
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let n = 0; n < count; n++) Sprites.paint(g, 'platinumStar', n * (size.cols + 1), 0);
}

function starsPicture(count) {
  const canvas = document.createElement('canvas');
  canvas.className = 'dialog-picture';
  drawStars(canvas, count, 3);
  return canvas;
}

// The early player offer waits until nothing else is showing.
function offerWhenFree() {
  if (state.early !== 'pending') return;
  if (!el.noRoom.hidden || !el.tut.hidden || !el.welcome.hidden || Field.flying()) {
    setTimeout(offerWhenFree, PLATINUM.waitMs);
    return;
  }
  offerEarly();
}

function offerEarly() {
  const stars = earlyStars();
  if (stars === 0) {   // (not far enough along for a star: no offer)
    state.early = 'none';
    save();
    return;
  }
  const more = '+' + PLATINUM.early[stars] + '%';
  showConfirm(['Thank you for being', 'an early player!', 'This is a', { red: 'ONE TIME OFFER.' },
    'Restart to get ' + more, 'idle gathering, ' + more, 'honeydew gathering,', 'and ' + stars + ' platinum star' + (stars > 1 ? 's' : ''), 'by your farm name.',
    'You keep achievements', 'and can earn their', 'honeydew again.', 'Restart now?'],
  () => platinumRestart((fresh) => { fresh.early = 'taken'; fresh.platinum.early = stars; }),
  ['YES', 'NO'], null, declineEarly, starsPicture(stars));
}

function declineEarly() {
  showConfirm(['Are you sure?', 'This offer will not', 'come back.'], () => {
    state.early = 'declined';
    save();
  }, ['YES', 'NO'], null, offerEarly);
}

// Every page II perk owned: restart for a +50% platinum star.
function offerPageTwoStar() {
  if (!pageTwoDone()) return;
  showConfirm(['Platinum prestige', 'Restart for a platinum', 'star: +50% idle', 'gathering and +50%', 'honeydew gathering.',
    'You keep achievements', 'and can earn their', 'honeydew again.', 'Restart now?'],
  () => platinumRestart((fresh) => { fresh.platinum.page2 += 1; }), ['YES', 'NO'], null, null, starsPicture(1));
}

// A new game from nothing (honeydew and perks too), keeping the name,
// settings, stars and achievements (turned red), then the game opens again.
function platinumRestart(change) {
  const old = state;
  const fresh = Object.assign(newGame(), {
    name: old.name,
    settings: old.settings,
    tutorialAsked: true,
    crumbClicked: old.crumbClicked,
    flightTutorialDone: old.flightTutorialDone,
    hoverTipShown: old.hoverTipShown,
    supportAsked: old.supportAsked,
    supportAgainAt: old.supportAgainAt,
    beetleSeen: old.beetleSeen,
    anteaterSeen: old.anteaterSeen,
    surfaceWarned: old.surfaceWarned,
    achieveShown: false,   // (the Achievements button comes back after the first flight)
    pageTwoSeen: old.pageTwoSeen,
    pageThreeSeen: old.pageThreeSeen,
    readTerms: old.readTerms,
    early: old.early,
    starCodeUsed: old.starCodeUsed,
    flightsEver: flightsEver(),   // (the weaver ants and the anteater count every flight ever taken)
    platinum: { early: old.platinum.early, page2: old.platinum.page2 },
    achieve: Object.fromEntries(Object.keys(old.achieve).map((key) => [key, 'old']))   // (kept, red: honeydew again when done again)
  });
  change(fresh);
  fresh.lastTick = Date.now();
  resetting = true;   // nothing else may be saved from here on
  const items = {
    [SAVE_KEY]: Object.assign({ savedBy: COPY_ID, v: SAVE_VERSION }, fresh),
    [CAVE_KEY]: { savedBy: COPY_ID, restart: Date.now() }   // (no tunnels: the starting cave is dug again)
  };
  if (extensionStorage) {
    extensionStorage.set(items, () => location.reload());
    return;
  }
  try {
    for (const key in items) localStorage.setItem(key, JSON.stringify(items[key]));
  } catch (error) {
    // Storage unavailable: nothing to keep.
  }
  location.reload();
}

/*
 * Satellite colony windows: small windows over the field that can be
 * dragged by their title bars and closed with X. Each has its upgrade button
 * in the bottom-right corner. The satellite button opens every satellite
 * colony you have, or closes them if they are all open.
 */
function renderSatellite() {
  el.btnSat.hidden = !satOwned(SATS[0]);
  el.btnSat.dataset.tip = satOwned(SATS[1]) ? 'Satellite Colonies' : 'Satellite Colony';
  for (const sat of SATS) {
    if (!satOwned(sat)) {
      if (!sat.el.win.hidden) closeSatellite(sat);
      continue;
    }
    const level = state[sat.key].level;
    const maxed = level >= SATELLITE.maxLevel;
    const perMinute = Math.round(satFoodPerMinute(sat));
    sat.el.up.classList.toggle('is-off', maxed || state.food < satUpgradeCost(sat));
    sat.el.up.dataset.tip = sat.name + '|Makes ' + shortNumber(perMinute, 12, false) + ' food/min,|' +
      (SATELLITE.seedsPerMinute + SATELLITE.perLevel * level) + ' seeds a minute.|' +
      (maxed ? 'Fully upgraded' : 'Upgrade: +' + SATELLITE.perLevel + ' seed/min|Costs ' + shortNumber(satUpgradeCost(sat), 12, true) + ' food');
  }
}

function openSatellite(sat) {
  hideTip();
  sat.el.win.hidden = false;
  sat.view = sat.view || Satellite.create(sat.look);
  sat.view.start(sat.el.canvas);
  placeSatellite(sat, sat.el.win.offsetLeft, sat.el.win.offsetTop);
}

function closeSatellite(sat) {
  hideTip();
  sat.el.win.hidden = true;
  if (sat.view) sat.view.stop();
}

// The satellite button: open any closed ones, or close them all.
function toggleSatellites() {
  const owned = SATS.filter(satOwned);
  const closed = owned.filter((sat) => sat.el.win.hidden);
  if (closed.length > 0) closed.forEach(openSatellite);
  else owned.forEach(closeSatellite);
}

// Keep the window inside the field.
function placeSatellite(sat, left, top) {
  const win = sat.el.win;
  const field = win.parentElement;
  const maxLeft = Math.max(0, field.clientWidth - win.offsetWidth);
  const maxTop = Math.max(0, field.clientHeight - win.offsetHeight);
  win.style.left = Math.round(Math.min(Math.max(0, left), maxLeft)) + 'px';
  win.style.top = Math.round(Math.min(Math.max(0, top), maxTop)) + 'px';
}

let satDrag = null;   // { sat, x, y, left, top } while a title bar is being dragged

/*
 * Trophic eggs (Upgrades menu): eggs the queen lays as food, not to hatch. Each
 * makes every ant bring in TROPHIC.boost more steady food. The nth costs
 * costStep x n food, so the price rises by the same amount each time. They
 * are gone after a nuptial flight. field.js draws one under the queen for each.
 */
const TROPHIC = { boost: 0.005, costStep: 125 };

function trophicCost() {
  return TROPHIC.costStep * (state.trophicEggs + 1);
}

function buyTrophic() {
  catchUp(Date.now());
  const cost = trophicCost();
  if (state.food < cost) return;
  state.food -= cost;
  state.trophicEggs += 1;
  save();
  render();
}

/* Raise the alate, the winged queen a nuptial flight needs. Once per colony. */
// Nuptial swarm (perk page II): up to SWARM.most alates, each `growth` times
// the price of the last, each adding `share` more honeydew to the flight.
const SWARM = { most: 6, growth: 25, share: 0.25 };
function alatesMost() {
  return perkLevel('nuptialSwarm') > 0 ? SWARM.most : 1;
}
function alateCost() {
  return RULES.alateCost * Math.pow(SWARM.growth, state.alates || 0);
}
function buyAlate() {
  catchUp(Date.now());
  const owned = state.alates || (state.alate ? 1 : 0);
  if (owned >= alatesMost() || state.food < alateCost()) return;
  state.food -= alateCost();
  state.alates = owned + 1;
  state.alate = true;
  save();
  render();
}

function buyPerk(key, sure) {
  if (perkState(key) !== 'ready') return;
  // Fire ant slavemaking starts an invasion: ask first, and only spend the honeydew on OK.
  if (key === 'slavemaking' && !sure) {
    showConfirm(['Prepare your army!', '20 fire ants will invade', 'as soon as you buy this.'], () => buyPerk(key, true));
    return;
  }
  state.royal.jelly -= PERKS[key].costs[perkLevel(key)];
  state.royal.perks[key] = perkLevel(key) + 1;
  Sound.play('upgrade_subtle', 0.35);   // (quiet)
  if (key === 'supercolony' && perkLevel(key) === 2) {
    // Polydomy's second level: the world grows, which takes a fresh start of the page.
    save();
    saveCave();
    showMessage(['The nest grows!', 'Zoom out to see', 'the new dirt.'], () => setTimeout(() => location.reload(), 300));
    return;
  }
  if (key === 'slavemaking') state.invasion = 'warned';
  if (key === 'nanitics') state.ants.worker += 2;   // Nanitics: this colony gets its 2 workers now too
  if (key === 'aphidFarming' && perkLevel(key) === 2) state.freeAphids += 1;    // Mealybug flight: and a free aphid now
  save();
  render();
  if (key === 'slavemaking') {
    showScreen('main');
    beginInvasion();
  }
}

/* ---------- The invasion (Fire ant slavemaking) ----------
 * After the warning, INVASION.count fire ants come in, half from each edge
 * of the grass, and go straight for the queen (ants.js). Once none are
 * left, fire ants can be hatched. If the game closes during the invasion,
 * it starts over the next time the game opens. */
const INVASION = { count: 20 };
let invasionLive = false;   // the invaders are on the field in this copy of the game

function beginInvasion() {
  if (state.invasion !== 'warned' && state.invasion !== 'on') return;
  state.invasion = 'on';
  state.fireAntsSeen = true;   // shows the alarm button
  invasionLive = true;
  Field.startRaid(INVASION.count, true);
  Sound.sfx('raid');
  save();
  render();
}

function invasionCheck() {
  if (state.invasion === 'warned') beginInvasion();   // bought, but the game closed before it began
  else if (state.invasion === 'on' && !invasionLive) beginInvasion();   // closed during the invasion
  else if (state.invasion === 'on' && Field.invaders() === 0) {
    state.invasion = 'won';
    invasionLive = false;
    save();
    render();
    showMessage(['You did it!', 'Fire ants are now', 'available for purchase.']);
  }
}

// The current value of an upgrade (its value at the level bought).
function upgradeValue(key) {
  return UPGRADES[key].values[state.upgrades[key]];
}

// Food one ant of this kind brings in per second.
function foodPerSecond(type) {
  return (ANT_TYPES[type].yield || 1) * 1000 / (tripSteps(type) * STEP_MS);
}

// A rate written short: 0.22, 2.4, 36, 1.2K...
function rateText(rate) {
  if (rate >= 100) return shortNumber(Math.round(rate), WIDE_BOX, false);
  return String(Number(rate.toFixed(rate >= 10 ? 1 : 2)));
}

// Steady food from workers and soldiers is half what their trip time says:
// each takes this many times as long to bring in 1 food. (Fire ants count as
// workers.)
const PASSIVE_SLOW = { worker: 2, soldier: 2 };

// How many steps one ant of this kind takes to bring in 1 food.
function tripSteps(type) {
  if (ANT_TYPES[type].sameAs) return tripSteps(ANT_TYPES[type].sameAs);
  // Pheromone trails: workers gather 45% faster, and 22.5% more per level of
  // Cuticular hydrocarbons. Bivouac: 1% faster for every other ant.
  // Not rounded: a trip may be a fraction of a step, so every upgrade counts.
  let gather = 1 + 0.45 * perkLevel('pheromone') + 0.225 * perkLevel('pheromone2');
  if (perkLevel('bivouac') > 0) gather *= 1 + 0.01 * Math.max(0, totalAnts() - 1);
  let ms = type === 'worker' ? upgradeValue('work').seconds * 1000 / gather : ANT_TYPES[type].tripMs;
  if (type === 'soldier' && perkLevel('bivouac') > 0) ms /= 1 + 0.01 * Math.max(0, totalAnts() - 1);   // Bivouac speeds soldiers too
  if (type === 'worker' && state.flats.minor) ms /= 1.3;    // Minor workers: 30% more steady food
  if (type === 'soldier' && state.flats.major) ms /= 2;     // Major soldiers: twice the steady food
  ms *= PASSIVE_SLOW[type] || 1;                             // workers and soldiers: half the steady food
  ms /= 1 + TROPHIC.boost * state.trophicEggs;               // Trophic eggs: more steady food from every ant
  ms /= platinumBoost();                                     // Platinum stars: more steady food
  ms /= weaverBoost();                                       // Weaver branches: more of all food
  return Math.max(1, ms / STEP_MS);
}

/*
 * Hand out food for every full step between lastTick and `time`.
 * Returns true if any food was gained.
 */
function collectFood(time) {
  const steps = Math.floor((time - state.lastTick) / STEP_MS);
  if (steps <= 0) return false;
  state.lastTick += steps * STEP_MS;

  let gained = 0;
  for (const type in ANT_TYPES) {
    const every = tripSteps(type);
    const done = state.phase[type] + steps;
    const trips = Math.floor(done / every);
    gained += trips * state.ants[type] * (ANT_TYPES[type].yield || 1);
    state.phase[type] = done - trips * every;   // (may be a fraction of a step)
  }
  // (Aphids are milked by workers in field.js: not steady food.)
  state.food += gained;
  addHarvest(gained);
  return gained > 0;
}

/*
 * Bring the game up to date: hatch eggs whose time has come, in order,
 * and hand out food. Because everything works from saved times, this also
 * covers the time the popup was closed. Returns true if anything changed.
 */
function advanceTo(now) {
  let changed = false;

  // If the computer's clock was set backwards, don't make anything wait
  // longer than it normally would.
  if (now < state.lastTick) state.lastTick = now;
  for (const egg of state.eggs.concat(state.fireEggs)) {
    egg.hatchAt = Math.min(egg.hatchAt, now + RULES.hatchMs);
  }

  // Hatch eggs in order, from the main nest and the fire ant nest.
  state.eggs.sort((a, b) => a.hatchAt - b.hatchAt);
  state.fireEggs.sort((a, b) => a.hatchAt - b.hatchAt);
  for (;;) {
    const main = state.eggs[0];
    const fire = state.fireEggs[0];
    const fromFire = fire && fire.hatchAt <= now && (!main || fire.hatchAt < main.hatchAt);
    if (!fromFire && !(main && main.hatchAt <= now)) break;
    const egg = fromFire ? state.fireEggs.shift() : state.eggs.shift();
    const type = fromFire ? 'fireAnt' : egg.type;
    collectFood(egg.hatchAt);             // food earned before this ant existed
    // A new ant's first food arrives one full period after it hatches.
    if (totalAnts() === 0) state.lastTick = egg.hatchAt;
    if (state.ants[type] === 0) state.phase[type] = 0;
    state.ants[type] += 1;
    if (state.missingShown[type] > 0) state.missingShown[type] -= 1;   // a new ant fills a place the anteater emptied
    state.hatchedRun += 1;
    state.stats.hatched += 1;
    if (fromFire) fireHatched.push(egg.spot);
    changed = true;
  }

  if (collectFood(now)) changed = true;
  return changed;
}

/*
 * Bring the game up to date, treating a long gap as time the game was closed.
 *
 * While the game is open it runs at full speed. Time it was closed only
 * earns food for the first Away minutes, at the Away percent. A long
 * enough gap also leaves a report for the Welcome Back window.
 * Eggs keep hatching while it is closed either way.
 */
function catchUp(now) {
  const wasAway = now - state.lastTick > RULES.awayAfterMs;
  const away = upgradeValue('away');
  if (!wasAway) {
    // Open but ignored (see IDLE): what the ants and satellites make is cut to the Away percent.
    const before = { food: state.food, harvested: state.harvested, stat: state.stats.food };
    const fromSatellite = collectSatellites(now, null);
    const changed = advanceTo(now);
    if (idle) {
      const kept = idleKeep(state.food - before.food);
      state.food = before.food + kept;
      state.harvested = before.harvested + kept * honeydewBoost();
      state.stats.food = before.stat + kept;
    }
    showFireHatches();   // new fire ants walk in (before anything draws the ants)
    return changed || fromSatellite > 0;
  }
  const fromSatellite = collectSatellites(now, away);

  const gone = now - state.lastTick;
  const before = state.food;
  const harvestedBefore = state.harvested;
  const statFoodBefore = state.stats.food;   // food thrown away below must not count toward food achievements
  const antsBefore = totalAnts();
  const countedUntil = state.lastTick + away.minutes * 60 * 1000;
  advanceTo(Math.min(now, countedUntil));   // the time that counts
  const earned = state.food - before;
  advanceTo(now);                           // the rest: eggs hatch, no food kept
  fireHatched = [];                         // (fire ants that hatched while closed are just there)
  const kept = Math.floor(earned * away.percent / 100);
  state.food = before + kept;
  state.harvested = harvestedBefore + kept * honeydewBoost();
  state.stats.food = statFoodBefore + kept;
  if (gone >= RULES.welcomeAfterMs) {
    // Added to any report not yet shown (the computer slept twice, say).
    const last = awayReport || { ms: 0, food: 0, satellite: 0, hatched: 0 };
    awayReport = { ms: last.ms + gone, food: last.food + kept, satellite: last.satellite + fromSatellite, hatched: last.hatched + totalAnts() - antsBefore, away };
  }
  return true;
}

// Blocks of room needed for this many ants of one kind.
// Dug-out pixels needed for this many blocks of room.
// Polydomy's second level: the field is drawn at this size (fit), so the
// world holds a third more dirt each way, and digging costs this share.
const POLYDOMY_2 = { fit: 0.75, dig: 0.75 };

// Polydomy's third level: digging and filling cost nothing.
function freeDigging() {
  return perkLevel('supercolony') >= 3;
}
function roomPixelsFor(blocks) {
  return blocks * RULES.roomPixels + RULES.roomPixelsMore * blocks * (blocks - 1) / 2;
}

function roomBlocksFor(count) {
  return count <= RULES.freeAnts ? 0 : Math.ceil((count - RULES.freeAnts) / RULES.antsPerRoom);
}

// Ants of a kind the player has, counting eggs and pupae.
function ownedAnts(type) {
  return state.ants[type] + state.eggs.filter((egg) => egg.type === type).length +
    (type === 'fireAnt' ? state.fireEggs.length : 0);
}

/*
 * Fire ants hatch in their own nest (firenest.js): a fire ant queen with
 * room for FIRE_NEST_EGGS eggs. Each new fire ant walks out of that
 * picture and then comes in over the grass (fireHatched, handled in tick).
 */
const FIRE_NEST_EGGS = 5;
let fireHatched = [];   // spots of fire ant eggs that hatched since the last tick

function freeFireSpot() {
  for (let spot = 0; spot < FIRE_NEST_EGGS; spot++) {
    if (!state.fireEggs.some((egg) => egg.spot === spot)) return spot;
  }
  return -1;
}

function showFireHatches() {
  for (const spot of fireHatched) {
    FireNest.hatched(spot);
    Field.fireAntArrives(FireNest.WALK_OUT_MS);
  }
  fireHatched = [];
}

/*
 * Is there room for one more ant of this kind? Past the first few of a
 * kind, every ant needs the cave to have enough room dug out beyond the
 * starting cave, adding up what every kind needs.
 */
function hasRoomFor(type) {
  let blocks = 0;
  for (const kind in ANT_TYPES) {
    blocks += roomBlocksFor(ownedAnts(kind) + (kind === type ? 1 : 0));
  }
  if (roomBlocksFor(ownedAnts(type) + 1) === 0) return true;
  return Field.extraDug() >= roomPixelsFor(blocks);
}

// Can this kind of ant be hatched at all yet?
function antUnlocked(type) {
  const kind = ANT_TYPES[type];
  if (kind.needs && perkLevel(kind.needs) === 0) return false;
  return !kind.needsWin || state.invasion === 'won';
}

// The most of a kind of ant a colony may have (0: no limit).
function antMax(type) {
  const kind = ANT_TYPES[type];
  if (!kind.max) return 0;
  if (type === 'supermajor' && perkLevel('twinMajor') > 0) return 0;   // True polymorphism: no limit (each costs 10x the last)
  return kind.max;
}

function canHatch(type) {
  const kind = ANT_TYPES[type];
  if (!antUnlocked(type)) return false;
  if (antMax(type) && ownedAnts(type) >= antMax(type)) return false;   // the supermajor: one per colony (as many as you like with Twin supermajors)
  if (type === 'fireAnt') return state.food >= state.antCost[type] && state.fireEggs.length < FIRE_NEST_EGGS;
  return state.food >= state.antCost[type] && state.eggs.length < maxEggs();
}

// Eggs that can hatch at once: the spots by the queen, and one in each nursery (Brood tending).
function maxEggs() {
  return RULES.maxEggs + Field.nurseryCount();
}

// The lowest-numbered egg spot nobody is using, or -1 if all are taken.
function freeSpot() {
  for (let spot = 0; spot < RULES.maxEggs; spot++) {
    if (!state.eggs.some((egg) => egg.spot === spot)) return spot;
  }
  for (let n = 0; n < Field.nurseryCount(); n++) {   // then a nursery
    if (!state.eggs.some((egg) => egg.spot === NURSERY_SPOT + n)) return NURSERY_SPOT + n;
  }
  return -1;
}
const NURSERY_SPOT = 100;   // egg spots from here on are in the nurseries (field.js draws them there)

/* Pay for an egg of the given kind. It becomes an ant after RULES.hatchMs. */
// Superorganism (perk page II): whenever the cheaper of a worker and a
// soldier can be paid for (and has room), it is laid, at most one a second.
let lastAutoHatch = 0;
function autoHatchTick() {
  if (perkLevel('autoHatch') === 0 || !state.settings.autoHatch) return;
  const now = Date.now();
  if (now - lastAutoHatch < 1000) return;
  // The cheaper of workers and soldiers; if that one has no room in the nest, the other.
  const types = ['worker', 'soldier'].filter((t) => antUnlocked(t)).sort((a, b) => state.antCost[a] - state.antCost[b]);
  const type = types.find((t) => canHatch(t) && hasRoomFor(t));
  if (!type) {
    // Food for one, but no room: say so now and then (a hatch by hand shows Not enough room).
    if (types.some((t) => canHatch(t)) && now - lastAutoRoomNote > AUTO_ROOM_NOTE_MS) {
      lastAutoRoomNote = now;
      Field.popNote('Dig more room to auto hatch', AUTO_ROOM_NOTE_SHOW_MS);
    }
    return;
  }
  lastAutoHatch = now;
  layEgg(type);
}
const AUTO_ROOM_NOTE_MS = 30000;      // at most this often
const AUTO_ROOM_NOTE_SHOW_MS = 5000;  // shown this long
let lastAutoRoomNote = 0;

function layEgg(type) {
  const now = Date.now();
  catchUp(now);
  if (!canHatch(type)) return;
  if (!hasRoomFor(type)) {
    showNoRoom();
    return;
  }

  state.food -= state.antCost[type];
  state.antCost[type] = nextAntCost(type, state.antCost[type], antGrowth(type));
  const hatchIn = state.cheats && !state.slowHatch ? 0 : RULES.hatchMs;   // (after the C developer key: hatches at once, unless the H key turned that off)
  if (type === 'fireAnt') state.fireEggs.push({ laidAt: now, hatchAt: now + hatchIn, spot: freeFireSpot() });
  else state.eggs.push({ hatchAt: now + hatchIn, spot: freeSpot(), type });

  save();
  render();
}

/*
 * The price of changing `pixels` pixels with a tool. Prices are set for a
 * small (2x2) square, so each pixel costs a quarter of that. A full medium
 * square costs 4 times small and a full large square 16 times; a square that
 * is only partly usable costs only for the pixels it changes.
 */
function toolCost(which, pixels) {
  if (which === 'aphid') return aphidCost();
  if (which === 'fungus') return fungusCost();
  if (which === 'replete') return repleteCost();
  if (which === 'granary') return granaryCost();
  if ((which === 'dig' || which === 'fill') && freeDigging()) return 0;
  return Math.max(1, Math.round(exactCost(which, pixels)));
}

// The price of changing this many pixels with dig, fill or trail, before
// rounding: each tool is paid by the pixel. Dig and fill are priced from a
// small (2x2) square; the trail from a whole 8x8 block.
function exactCost(which, pixels) {
  if ((which === 'dig' || which === 'fill') && freeDigging()) return 0;   // Polydomy's third level
  if (which === 'trail') return trailBlockCost() * pixels / TRAIL_PIXELS;
  if (which === 'midden') return middenBlockCost() * pixels / TRAIL_PIXELS;
  const small = which === 'dig'
    ? listedDigCost(state.digs) * (1 - RULES.digDiscount) * (perkLevel('supercolony') >= 2 ? POLYDOMY_2.dig : 1) * (state.digs < RULES.cheapDigs ? 0.5 : 1)   // (the first cheapDigs digs: half price)
    : RULES.fillCost;
  const smallPixels = TOOL_SIZES[0] * TOOL_SIZES[0];
  return small * pixels / smallPixels;
}

// Pheromone trail (Build menu): each 8x8 block costs a little more than the last.
const TRAIL_COST = { start: 5, growth: 1.12 };   // 5, 5.6, 6.3, 7, 7.9 ... per block
const TRAIL_PIXELS = 64;   // a whole 8x8 block

// Price of a whole block now. trailBlocks counts blocks' worth of trail
// laid (it can have a fraction, as the trail is paid by the pixel).
function trailBlockCost() {
  return TRAIL_COST.start * Math.pow(TRAIL_COST.growth, state.trailBlocks);
}

function trailCost() {
  return Math.round(trailBlockCost());
}

function trailUnlocked() {
  return perkLevel('pheromone') > 0;
}

/*
 * The midden (Midden honeydew upgrade): trash piles painted in 8x8 blocks in
 * the Build menu (field.js keeps each separate pile, how full it is, and its
 * sunflower). Piles fill with waste: harvestShare of a second's worth of the
 * colony's food for every second's worth harvested while the game is open
 * (shared among the piles by size), a little from idle workers that carry
 * waste to one, and a lot from fire ant bodies (ants.js).
 */
const MIDDEN = { blockCost: { start: 10, growth: 1.12 }, harvestShare: 0.1 };

function middenUnlocked() {
  return perkLevel('midden') > 0;
}

function middenBlockCost() {
  return MIDDEN.blockCost.start * Math.pow(MIDDEN.blockCost.growth, state.middenBlocks);
}

// Food harvested fills the piles a little: harvestShare of a second's worth of food for each second's worth.
function middenFromFood(food) {
  if (!middenUnlocked() || !(food > 0)) return;
  Field.feedMiddens(MIDDEN.harvestShare * food / Math.max(1, colonyFoodRate()));
}

// A sunflower burst out of a full pile.
function middenBloomed() {
  state.stats.middenBlooms = (state.stats.middenBlooms || 0) + 1;
  save();
  saveCave();
  render();
}

// The mouse over a midden: how full it is, in a small box by the mouse.
function showMiddenTip(pile, x, y) {
  if (!pile) {
    el.middenTip.hidden = true;
    return;
  }
  const lines = ['Midden', pile.blooming ? 'Blooming!' : Math.floor(pile.full * 100) + '% full'];
  if (el.middenTip.dataset.text !== lines.join('|')) {
    el.middenTip.dataset.text = lines.join('|');
    el.middenTip.replaceChildren();
    for (const line of lines) {
      const span = document.createElement('span');
      span.className = 'px';
      el.middenTip.appendChild(span);
      PixelFont.write(span, line);
    }
  }
  el.middenTip.hidden = false;
  const box = el.middenTip.getBoundingClientRect();
  el.middenTip.style.left = Math.round(Math.min(x + 12, window.innerWidth - box.width - 2)) + 'px';
  el.middenTip.style.top = Math.round(Math.min(y + 12, window.innerHeight - box.height - 2)) + 'px';
}

// Granaries (Build menu): the first is cheap, the second costs `second`,
// the third `third`, and each after that 42% more than the one before.
const GRANARY_COST = { start: 20, second: 43, third: 122, growth: 1.42 };  // 20, 43, 122, 170, 250, 350 ...

// A nursery (Brood tending) is priced like a granary, counting nurseries.
function nurseryCost() {
  return structureCostAt('nursery', Field.nurseryCount());
}

function granaryCost() {
  return structureCostAt('granary', mergedCount('granary'));   // (two significant figures)
}

function aphidCost() {
  if (state.freeAphids > 0) return 0;
  return structureCostAt('aphid', mergedCount('aphid'));
}

// Food counts this much toward honeydew: 1, plus 10% for each aphid (a
// Mealybug Herd counts as 12).
function honeydewBoost() {
  return 1 + APHIDS.honeydewBoost * (state.aphids + MERGES.herd.aphids * state.herds);   // (state.herds: saved, so it counts while catching up too)
}

/*
 * Food per second, for the ? beside the food box. Steady sources earn the
 * same every second, so they are worked out: ants (counted as a whole) and
 * the satellite colonies. The rest is measured: the food workers actually
 * brought in from crumbs, seeds, fungus gardens and aphids over the last
 * full minute the game was open, updated once a minute. (Crumb counts clicks
 * and repletes.) The tip itself shows HISTORY, below.
 */
const MEASURE_MS = 60000;
const MEASURED = { delivery: 'crumbs', click: 'crumbs', replete: 'crumbs', granary: 'seeds', fungus: 'fungus', aphid: 'aphids' };   // gainFood source -> line
let measuring = { since: 0, crumbs: 0, seeds: 0, fungus: 0, aphids: 0 };   // this minute so far
let measured = null;                                             // the last full minute: food a second, or null

// Count food from a measured source toward this minute.
function measureFood(amount, source) {
  if (MEASURED[source]) measuring[MEASURED[source]] += amount;
  if (MEASURED[source]) foodHistory.now[MEASURED[source]] += amount;
}

// Called every tick: closes the minute when it is up. A long gap (the
// computer asleep) throws the minute away and starts again.
function measureTick(now) {
  if (!measuring.since || now < measuring.since || now - measuring.since > MEASURE_MS + 5000) {
    measuring = { since: now, crumbs: 0, seeds: 0, fungus: 0, aphids: 0 };
    return;
  }
  if (now - measuring.since < MEASURE_MS) return;
  const secs = (now - measuring.since) / 1000;
  measured = { crumbs: measuring.crumbs / secs, seeds: measuring.seeds / secs, fungus: measuring.fungus / secs, aphids: measuring.aphids / secs };
  measuring = { since: now, crumbs: 0, seeds: 0, fungus: 0, aphids: 0 };
}

function steadyRates() {
  return {
    ants: Object.keys(ANT_TYPES).reduce((sum, type) => sum + foodPerSecond(type) * state.ants[type], 0),
    satellite: SATS.filter(satOwned).reduce((sum, sat) => sum + satFoodPerMinute(sat) / 60, 0)
  };
}

/*
 * History for the food ? box: every second the game is open, the food that
 * came in that second from each source the player only gets while the game
 * is open (crumbs, granaries, fungus, aphids), with the ants' steady rate
 * beside it. Kept for HISTORY.seconds. The graph averages each over
 * HISTORY.smooth seconds, twice, so a lump of food (a granary paying) rises
 * and falls as a slope, and joins a point every HISTORY.pointEvery seconds
 * with straight lines, like a stock chart.
 */
const HISTORY = { seconds: 120, smooth: 10, pointEvery: 4 };   // smoothed twice; a graph point every 4 s
const LINES = [   // the graph's lines, drawn in this order (ants last, on top)
  { key: 'seeds', name: 'Granaries', color: '#ffd23c' },
  { key: 'fungus', name: 'Fungus', color: '#ffffff' },
  { key: 'crumbs', name: 'Crumbs', color: '#d9a866' },
  { key: 'aphids', name: 'Aphids', color: '#4fc23a' },
  { key: 'satellite', name: 'Satellite colony', color: '#2f63d8', steady: true },   // (steady, like the ants)
  { key: 'ants', name: 'Ants', color: '#000000', steady: true }
];
const foodHistory = { at: 0, now: { crumbs: 0, seeds: 0, fungus: 0, aphids: 0 }, seconds: [] };

// Called every tick: closes each second. A long gap (asleep, or closed) starts over.
function historyTick(now) {
  if (!foodHistory.at || now < foodHistory.at || now - foodHistory.at > 5000) {
    foodHistory.at = now;
    foodHistory.seconds = [];
    foodHistory.now = { crumbs: 0, seeds: 0, fungus: 0, aphids: 0 };
    return;
  }
  while (now - foodHistory.at >= 1000) {
    const steady = steadyRates();
    foodHistory.seconds.push(Object.assign({ ants: steady.ants, satellite: steady.satellite || 0 }, foodHistory.now));
    if (foodHistory.seconds.length > HISTORY.seconds) foodHistory.seconds.shift();
    foodHistory.now = { crumbs: 0, seeds: 0, fungus: 0, aphids: 0 };
    foodHistory.at += 1000;
  }
}

// Each line's food a second at every point in the history (smoothed).
function historyRates() {
  // The average of the last HISTORY.smooth values (missing ones at the start count as 0, so they don't spike).
  const average = (list) => list.map((second, n) => {
    const rate = { ants: second.ants, satellite: second.satellite || 0 };
    for (const key of ['crumbs', 'seeds', 'fungus', 'aphids']) {
      let total = 0;
      for (let k = Math.max(0, n - HISTORY.smooth + 1); k <= n; k++) total += list[k][key];
      rate[key] = total / HISTORY.smooth;
    }
    return rate;
  });
  return average(average(foodHistory.seconds));   // twice: a lump becomes a peak with sloped sides
}

// Food a second from the open-only sources over the last minute (or as much
// of it as there is).
function openRates() {
  const last = foodHistory.seconds.slice(-60);
  const rate = { crumbs: 0, seeds: 0, fungus: 0, aphids: 0 };
  if (last.length === 0) return rate;
  for (const second of last) for (const key in rate) rate[key] += second[key] / last.length;
  return rate;
}

const ANT_LINE_NAMES = { worker: 'Workers', soldier: 'Soldiers', fireAnt: 'Fire ants', supermajor: 'Supermajor' };

// Icons in the food ? box: [sprite, scale].
const TIP_ICONS = {
  ants: ['ant', 1], worker: ['walker', 2], soldier: ['walkerSoldier', 1], fireAnt: ['fireAnt', 2], supermajor: ['walkerMajor', 1],
  satellite: ['satellite', 1], seeds: ['granary', 1], fungus: ['fungus', 1], crumbs: ['crumb', 1], aphids: ['aphid', 2]
};

// The text for the food ? box, one line per "|". A line can start with
// codes, in this order: ">" nests it under the line above (a branch is
// drawn), "@key@" puts that TIP_ICONS picture first, and "^color^" a square
// of that color (the graph's key).
function foodRateTip() {
  const steady = steadyRates();
  const open = openRates();
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const rate = (r) => rateText(r) + '/s';
  const swatch = (key) => '^' + LINES.find((l) => l.key === key).color + '^';
  const icon = (key) => '@' + key + '@';
  let text = 'Food per second' +
    '|Steady (also away): ' + rate(sum(steady)) +
    '|' + icon('ants') + swatch('ants') + 'Ants: ' + rate(steady.ants);
  for (const type in ANT_TYPES) {
    const made = foodPerSecond(type) * state.ants[type];
    if (made > 0) text += '|>' + icon(type) + (ANT_LINE_NAMES[type] || type) + ': ' + rate(made);
  }
  if (steady.satellite > 0) text += '|' + icon('satellite') + swatch('satellite') + 'Satellite colony: ' + rate(steady.satellite);
  text += '|Only while open: ' + rate(sum(open)) + '|(the last minute)';
  for (const line of LINES) {
    if (!line.steady) text += '|' + icon(line.key) + swatch(line.key) + line.name + ': ' + rate(open[line.key]);
  }
  return text;
}

// The graph under the food ? box text: food a second over the history, one
// line per source, all on one scale.
const GRAPH = { width: 240, height: 100, brush: 2, background: '#8c8c8c', grid: '#9c9c9c' };
function drawFoodGraph(canvas) {
  canvas.width = GRAPH.width;
  canvas.height = GRAPH.height;
  const g = canvas.getContext('2d');
  g.fillStyle = GRAPH.background;
  g.fillRect(0, 0, GRAPH.width, GRAPH.height);
  g.fillStyle = GRAPH.grid;
  for (let y = 1; y < 4; y++) g.fillRect(0, Math.round(GRAPH.height * y / 4), GRAPH.width, 1);
  const rates = historyRates();
  if (rates.length < 2) return;
  // The points: every HISTORY.pointEvery seconds, counted back from now (always the newest).
  const points = [];
  for (let n = rates.length - 1; n >= 0; n -= HISTORY.pointEvery) points.unshift(n);
  if (points[0] !== 0) points.unshift(0);
  let top = 0;
  for (const n of points) for (const line of LINES) top = Math.max(top, rates[n][line.key]);
  if (top <= 0) top = 1;
  const room = GRAPH.width - GRAPH.brush;
  const xAt = (n) => Math.round(room - (rates.length - 1 - n) * room / (HISTORY.seconds - 1));   // now at the right edge
  const yAt = (v) => Math.round(GRAPH.height - GRAPH.brush - v / top * (GRAPH.height - GRAPH.brush * 2));
  for (const line of LINES) {
    if (line.key === 'satellite' && !points.some((n) => rates[n].satellite > 0)) continue;   // (no satellite colony: no line)
    g.fillStyle = line.color;
    for (let k = 1; k < points.length; k++) {
      // A straight line between two points, a brush square at each step.
      const x0 = xAt(points[k - 1]), x1 = xAt(points[k]);
      const y0 = yAt(rates[points[k - 1]][line.key]), y1 = yAt(rates[points[k]][line.key]);
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let s = 0; s <= steps; s++) {
        g.fillRect(Math.round(x0 + (x1 - x0) * s / steps), Math.round(y0 + (y1 - y0) * s / steps), GRAPH.brush, GRAPH.brush);
      }
    }
  }
  // The scale: the top line's value (shown under the graph).
  canvas.dataset.top = rateText(top);
}

// The satellite colonies: `key` is where its level is kept in the state,
// `perk` the honeydew upgrade that starts it, `look` how satellite.js draws it.
const SATS = [
  { key: 'satellite', perk: 'megaColony', suffix: '', name: 'Satellite colony', title: 'Satellite', look: {} },
  { key: 'satellite2', perk: 'megaColony', perkLevel: 2, suffix: '-2', name: 'Second satellite', title: 'Satellite 2', look: Satellite.SECOND }
];

function loadSatellite(saved) {
  return {
    level: Number.isInteger(saved && saved.level) && saved.level > 0 ? Math.min(saved.level, SATELLITE.maxLevel) : 0,
    lastAt: saved && Number.isFinite(saved.lastAt) ? saved.lastAt : null
  };
}

function satOwned(sat) {
  return perkLevel(sat.perk) >= (sat.perkLevel || 1);
}

function satFoodPerMinute(sat) {
  return (SATELLITE.seedsPerMinute + SATELLITE.perLevel * state[sat.key].level) * upgradeValue('harvester').food * weaverBoost();
}

function satUpgradeCost(sat) {
  return roundPrice(SATELLITE.costStart * Math.pow(SATELLITE.costGrowth, state[sat.key].level));
}

/*
 * Food from the satellite colonies since they were last counted, 1 food at
 * a time. With `away` (the game was closed), only the first Away minutes
 * since the game was last open count, at the Away percent. Returns the
 * food gained.
 */
function collectSatellites(now, away) {
  return SATS.reduce((sum, sat) => sum + collectSatellite(sat, now, away), 0);
}

function collectSatellite(sat, now, away) {
  const colony = state[sat.key];
  if (!satOwned(sat)) {
    colony.lastAt = null;
    return 0;
  }
  if (!Number.isFinite(colony.lastAt) || now < colony.lastAt) {
    colony.lastAt = now;   // just started, or the clock went back
    return 0;
  }
  const every = 60000 / satFoodPerMinute(sat);   // milliseconds per food
  if (away) {
    const until = Math.min(now, state.lastTick + away.minutes * 60000);
    const made = until > colony.lastAt ? Math.floor((until - colony.lastAt) / every) : 0;
    const kept = Math.floor(made * away.percent / 100);
    colony.lastAt = now;
    state.food += kept;
    addHarvest(kept);
    return kept;
  }
  const count = Math.floor((now - colony.lastAt) / every);
  if (count <= 0) return 0;
  colony.lastAt += count * every;
  state.food += count;
  addHarvest(count);
  return count;
}

function buySatelliteUpgrade(sat) {
  catchUp(Date.now());
  if (state[sat.key].level >= SATELLITE.maxLevel || state.food < satUpgradeCost(sat)) return;
  state.food -= satUpgradeCost(sat);
  state[sat.key].level += 1;
  Sound.play('upgrade_subtle', 0.35);   // (quiet)
  save();
  render();
}

function addHarvest(food) {
  state.harvested += food * honeydewBoost();
  state.stats.food += food;
}

function repletesUnlocked() {
  return perkLevel('repletes') > 0;
}

function repleteCost() {
  return structureCostAt('replete', mergedCount('replete'));
}

// The worker price one purchase back (undoing nextCost), never below the first price.
function previousCost(type) {
  const kind = ANT_TYPES[type];
  if (type === 'worker' && state.antCost[type] <= nextAntCost(type, EARLY_WORKERS.under - 1, antGrowth(type))) {
    let cost = kind.costStart;   // early workers: walk the prices up to this one
    for (let n = 0; n < 20; n++) {
      const next = nextAntCost(type, cost, antGrowth(type));
      if (next >= state.antCost[type]) return cost;
      cost = next;
    }
  }
  const back = Math.round((state.antCost[type] - kind.costStep) / (1 + antGrowth(type)));
  return Math.max(kind.costStart, back);
}

function fungusUnlocked() {
  return perkLevel('fungalGarden') > 0;
}

function fungusCost() {
  return structureCostAt('fungus', mergedCount('fungus'));
}

function aphidsUnlocked() {
  return perkLevel('aphidFarming') > 0;
}

// How many pixels the square under the mouse would change (0: none / not over the field).
let hoveredPixels = 0;

/*
 * The player clicked a square where the tool would change some pixels. Take
 * the food and carry it out. Digging raises the dig price by a flat step
 * (once per dig, whatever the size); filling never changes any price.
 */
/*
 * Dig, fill and trail are dragged: every square the mouse passes over is
 * used, and paid for by the pixel (pixels already done cost nothing). The
 * price rises as it would square by square: a dig counts as one more dig for
 * each tool-sized square's worth of pixels dug, and the trail as one more
 * block for each 64 pixels laid. A stroke's total is rounded once, at the
 * end, and is never less than 1 (so a single click costs just what it did).
 */
let stroke = null;   // { owed, charged }: food owed for this stroke so far, and taken so far

function useTool(use) {
  catchUp(Date.now());
  if (use.tool === 'delete' || use.tool === 'eraseTrail') {   // (eraseTrail: a trash-can drag over trail)   // removes a structure, pheromone trail or midden, and pays half its price back
    const trailBefore = Field.trailPixels();
    const middenBefore = Field.middenPixels();
    use.apply();
    const trailGone = trailBefore - Field.trailPixels();
    const middenGone = middenBefore - Field.middenPixels();
    if (middenGone > 0) {
      state.middenBlocks = Math.max(0, state.middenBlocks - middenGone / TRAIL_PIXELS);
      const food = Math.floor(middenGone * middenBlockCost() / TRAIL_PIXELS * REFUND_SHARE);
      if (food > 0 && trailGone === 0) {
        state.food += food;
        const spot = Field.lastDeleted();
        if (spot) Field.pop('+' + food + ' Food', spot.x, spot.y);
      }
    }
    // Trail taken away makes the next trail cheaper again, as structures do.
    state.trailBlocks = Math.max(0, state.trailBlocks - trailGone / TRAIL_PIXELS);
    state.aphids = Field.aphidCount();
    refundDeleted(Field.lastDeleted(), trailGone);
    save();
    saveCave();
    render();
    return;
  }
  if (use.tool === 'caterpillar') {   // free (one only: the Field won't place a second)
    use.apply();
    Sound.play('place');
    save();
    saveCave();
    render();
    return;
  }
  if (use.tool === 'granary' || use.tool === 'nursery') {
    const cost = use.tool === 'nursery' ? nurseryCost() : granaryCost();
    if (state.food < cost) return Sound.play('button_disabled');
    state.food -= cost;
    use.apply();
    Sound.play('place');
    save();
    saveCave();
    render();
    return;
  }
  if (use.tool === 'replete') {
    const cost = repleteCost();
    if (state.food < cost || state.ants.worker < 1) return Sound.play('button_disabled');
    state.food -= cost;
    state.ants.worker -= 1;                            // a worker becomes the replete...
    state.antCost.worker = previousCost('worker');     // ...and the worker price steps back one
    use.apply();
    Sound.play('place');
    save();
    saveCave();
    render();
    return;
  }
  if (use.tool === 'fungus') {
    const cost = fungusCost();
    if (state.food < cost) return Sound.play('button_disabled');
    state.food -= cost;
    use.apply();
    Sound.play('place');
    save();
    saveCave();
    render();
    return;
  }
  if (MERGES[use.tool]) {
    const merge = MERGES[use.tool];
    const cost = mergeCost(use.tool);
    if (state.food < cost || mergeBase(use.tool) < MERGE_COUNT) return Sound.play('button_disabled');
    const trailBefore = Field.trailPixels();
    const bigsBefore = Field.bigCount(use.tool);
    use.apply();
    if (Field.bigCount(use.tool) === bigsBefore) return;   // it didn't fit after all
    state.food -= cost;
    Sound.sfx('rumble');
    state.trailBlocks = Math.max(0, state.trailBlocks - (trailBefore - Field.trailPixels()) / TRAIL_PIXELS);   // trail under it is cleared
    for (let n = 0; n < (merge.workersBack || 0); n++) {
      // A Honeypot Chamber needs 4 of the 10 repletes' workers: the other 6
      // come back, and the worker price steps up for each, as if bought.
      state.ants.worker += 1;
      state.antCost.worker = nextAntCost('worker', state.antCost.worker, antGrowth('worker'));
    }
    state.aphids = Field.aphidCount();
    chooseBuildTool(null);
    save();
    saveCave();
    render();
    return;
  }
  if (use.tool === 'aphid') {
    const cost = aphidCost();
    if (state.food < cost) return Sound.play('button_disabled');
    state.food -= cost;
    if (state.freeAphids > 0) state.freeAphids -= 1;
    state.aphids += 1;
    use.apply();
    Sound.play('place');
    save();
    saveCave();
    render();
    return;
  }

  if (use.first || !stroke) stroke = { owed: 0, charged: 0 };
  const cost = exactCost(use.tool, use.pixels);
  const total = stroke.owed + cost > 0 ? Math.max(1, Math.round(stroke.owed + cost)) : 0;   // (0: free digging)
  if (state.food < total - stroke.charged) return;   // can't pay for this square: skip it

  stroke.owed += cost;
  if (use.tool === 'dig') Sound.dig();
  if (use.tool === 'fill') Sound.sfx('fill');
  if (use.tool === 'dig') {
    state.digs += use.pixels / Field.areaOf(use.size);
    state.digCost = listedDigCost(state.digs);
  }
  if (use.tool === 'trail') {
    state.trailBlocks += use.pixels / TRAIL_PIXELS;
    state.stats.trails += use.pixels / TRAIL_PIXELS;
  }
  if (use.tool === 'midden') {
    const trailBefore = Field.trailPixels();
    state.middenBlocks += use.pixels / TRAIL_PIXELS;
    const due = Math.floor(stroke.owed) - stroke.charged;
    if (due > 0) {
      state.food -= due;
      stroke.charged += due;
    }
    use.apply();
    state.trailBlocks = Math.max(0, state.trailBlocks - (trailBefore - Field.trailPixels()) / TRAIL_PIXELS);   // trail under it is covered over
    render();
    return;
  }
  const due = Math.floor(stroke.owed) - stroke.charged;   // take the whole food owed so far
  if (due > 0) {
    state.food -= due;
    stroke.charged += due;
  }
  use.apply();
  render();
}

// The mouse was let go: take the rest of the stroke's price and save.
function finishStroke() {
  if (stroke) {
    const rest = stroke.owed > 0 ? Math.max(1, Math.round(stroke.owed)) - stroke.charged : 0;   // (nothing for free digging)
    if (rest > 0) {
      state.food -= Math.min(rest, state.food);
      stroke.charged += rest;
    }
    stroke = null;
  }
  save();
  saveCave();
  render();
}

function canUpgrade(key) {
  const level = state.upgrades[key];
  return level < maxLevel(key) && state.food >= upgradeCost(key, level);
}

/* Buy the next level of an upgrade. */
function buyUpgrade(key) {
  catchUp(Date.now());
  if (!canUpgrade(key)) return;
  state.food -= upgradeCost(key, state.upgrades[key]);
  state.upgrades[key] += 1;
  Sound.play('upgrade_subtle', 0.35);   // (quiet)
  save();
  render();
}

// Food from the bread crumb: a click on it, or a worker reaching the queen.
function gainFood(amount, source) {
  catchUp(Date.now());
  if (idle) amount = idleKeep(amount);   // open but ignored: Away rates
  if (amount <= 0) return;
  amount *= weaverBoost();               // Weaver branches: more of all food
  const sound = { click: 'crumb', granary: 'munch', aphid: 'milk' }[source];
  if (sound) Sound.sfx(sound);
  measureFood(amount, source);
  middenFromFood(amount);
  if (source === 'delivery') state.stats.crumbs += amount;   // crumb (and bodies) brought home, for Recruitment
  if (source === 'fungus') state.stats.fungusFood += amount;   // for Fungivorous
  state.food += amount;
  addHarvest(amount);
  if (source === 'click') state.crumbClicked = true;
  save();
  render();
}

function cheat() {
  catchUp(Date.now());
  state.cheats = true;   // also: fly without an alate, and show the aphid button
  state.food += RULES.cheatFood;
  addHarvest(RULES.cheatFood);
  save();
  render();
}

// Developer tool: 100 royal jelly, to try the nuptial flight upgrades.
const CHEAT_JELLY = 100;
function cheatJelly() {
  state.royal.jelly += CHEAT_JELLY;
  save();
  render();
}

/*
 * Developer tool: wipe everything and start a brand new game.
 *
 * It erases all of the game's storage and then reloads the page, so anything
 * added to the game later is reset too, as long as it is saved with store().
 * The first press asks "SURE?"; a second press within 3 seconds does it.
 */
const RESET_CONFIRM_MS = 3000;
let resetArmedUntil = 0;
let resetting = false;

function reset() {
  const now = Date.now();
  if (now > resetArmedUntil) {
    resetArmedUntil = now + RESET_CONFIRM_MS;
    el.btnReset.classList.add('is-armed');   // red while it asks SURE?
    PixelFont.write(el.resetLabel, 'SURE?');
    setTimeout(() => {
      if (resetting) return;
      el.btnReset.classList.remove('is-armed');
      PixelFont.write(el.resetLabel, 'RESET');
    }, RESET_CONFIRM_MS);
    return;
  }

  resetting = true;   // nothing may be saved from here on
  wipeStorage().then(() => location.reload());
}

/*
 * Deleting pays a quarter back: a quarter of what the structure (or merge)
 * would cost now that it is gone, which is about what it cost; for
 * pheromone trail and the midden, a quarter of the price of what was taken
 * away. A small "+N Food" shows where it was. (Not counted as food harvested.)
 */
const REFUND_SHARE = 0.25;
function refundDeleted(gone, trailPixels) {
  if (!gone) return;
  const from = { granary: 'granary', garden: 'fungus', replete: 'replete', pen: 'aphid' }[gone.kind];
  let price = 0;
  if (gone.kind === 'trail') price = trailPixels * trailBlockCost() / TRAIL_PIXELS;
  else if (MERGES[gone.kind]) price = mergeCost(gone.kind);
  else if (gone.kind === 'nursery') price = structureCostAt('nursery', Field.nurseryCount());
  else if (from) price = structureCostAt(from, mergedCount(from));
  const food = Math.floor(price * REFUND_SHARE);
  if (food <= 0) return;
  state.food += food;
  Field.pop('+' + food + ' Food', gone.x, gone.y);
}

/* ---------- Saving ---------- */

// Inside the extension this uses Chrome's extension storage. Opening
// popup.html as a plain file falls back to the browser's page storage.
const extensionStorage =
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local
    ? chrome.storage.local
    : null;

function load(key) {
  return new Promise((resolve) => {
    if (extensionStorage) {
      extensionStorage.get(key, (items) => resolve(items ? items[key] : null));
      return;
    }
    try {
      resolve(JSON.parse(localStorage.getItem(key)));
    } catch (error) {
      resolve(null);
    }
  });
}

function store(key, value) {
  if (resetting) return;
  if (extensionStorage) {
    extensionStorage.set({ [key]: value });
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Storage unavailable: the game still runs, it just won't be saved.
  }
}

// Erase everything the game has saved.
function wipeStorage() {
  return new Promise((resolve) => {
    if (extensionStorage) {
      extensionStorage.clear(resolve);
      return;
    }
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('antTycoon')) localStorage.removeItem(key);
      }
    } catch (error) {
      // Nothing was saved, so there is nothing to erase.
    }
    resolve();
  });
}

let savedAt = 0;

function save() {
  savedAt = Date.now();
  state.crumbs = Field.exportCrumbs();
  state.raidAnts = Field.exportRaid();   // a raid under way comes back when the game opens again
  state.downedSoldiers = Field.exportDowned();   // so do soldiers still down from one
  state.herds = Field.bigCount('herd');
  store(SAVE_KEY, Object.assign({ savedBy: COPY_ID, v: SAVE_VERSION }, state));
}

// The tunnels are saved on their own, and only when they change.
function saveCave() {
  store(CAVE_KEY, Object.assign({ savedBy: COPY_ID }, Field.exportCave()));
}

// When the other copy of the game saves, take on its changes, so buying,
// digging and food stay the same in both. If RESET wiped the save, start over.
function followOtherCopy(changes, area) {
  if (area !== 'local' || resetting) return;
  const game = changes[SAVE_KEY];
  const cave = changes[CAVE_KEY];

  if ((game && !game.newValue) || (cave && !cave.newValue) || (cave && cave.newValue.restart)) {   // (erased, or a platinum restart)
    resetting = true;
    location.reload();
    return;
  }
  if (game && game.newValue.savedBy !== COPY_ID) {
    state = readSave(game.newValue);
    harvestSeen = state.harvested;   // (the other copy counted its own Peaceful mode share)
    const savedCrumbs = state.crumbs;
    Field.setCrumbRules(fieldRules());
    Field.loadCrumbs(savedCrumbs);
    render();
    // The other copy answered the tutorial: close it here too.
    if (state.tutorialAsked && !el.tut.hidden) {
      pointAt(null);
      el.tut.hidden = true;
    }
  }
  if (cave && cave.newValue.savedBy !== COPY_ID) {
    Field.loadCave(cave.newValue);
  }
}

/*
 * Fungus gardens from older saves that could not touch a floor, ceiling or
 * wall once they became 8x8 are gone: pay back what they cost. They count as
 * the last ones bought, the dearest.
 */
function refundDroppedFungi() {
  const dropped = Field.takeDroppedFungi();
  if (dropped < 1) return;
  const kept = Field.fungusCount();
  let food = 0;
  for (let k = kept; k < kept + dropped; k++) food += roundPrice(FUNGUS_COST.start * Math.pow(FUNGUS_COST.growth, k));
  state.food += food;
  showMessage(['Fungus gardens moved!', 'Gardens are now 8x8 and', 'must touch a floor,', 'ceiling or wall.', dropped + ' could not, so you', 'got back ' + shortNumber(food, WIDE_BOX, false) + ' food']);
}

/* Open the launcher window, which opens the floating game, then close the toolbar popup. */
function openFloating() {
  chrome.windows.create({
    url: chrome.runtime.getURL('float.html'),
    type: 'popup',
    width: 300,
    height: 230,
    focused: true
  }, () => {
    const isToolbarPopup = !chrome.extension || !chrome.extension.getViews ||
      chrome.extension.getViews({ type: 'popup' }).includes(window);
    if (isToolbarPopup) window.close();
  });
}

// Turn whatever was saved into a valid game, filling gaps with defaults.
// Saves from earlier versions (workers only) are understood too.
function readSave(saved) {
  const fresh = newGame();
  if (!saved || typeof saved !== 'object') return fresh;

  const wholeNumber = (value, fallback) =>
    Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;

  // Ant counts and prices: earlier versions saved a single number for workers.
  const savedAnts = typeof saved.ants === 'number' ? { worker: saved.ants } : saved.ants || {};
  const savedCost = typeof saved.antCost === 'number' ? { worker: saved.antCost } : saved.antCost || {};
  const savedPhase = saved.phase || {};
  // Before version 3, phases were counted in whole seconds instead of steps.
  const phaseScale = saved.v === SAVE_VERSION ? 1 : 1000 / STEP_MS;
  const ants = {};
  const antCost = {};
  const phase = {};
  for (const type in ANT_TYPES) {
    ants[type] = wholeNumber(savedAnts[type], fresh.ants[type]);
    antCost[type] = Math.max(ANT_TYPES[type].costStart, wholeNumber(savedCost[type], fresh.antCost[type]));
    phase[type] = (Number.isFinite(savedPhase[type]) && savedPhase[type] >= 0 ? savedPhase[type] : 0) * phaseScale;
  }
  phase.aphid = wholeNumber(savedPhase.aphid, 0);
  // Saves priced before ant prices rose 12% (not 20%) a purchase: the price
  // of the next ant, worked out again from how many of that kind there are.
  if (saved.priceGrowth !== RULES.costGrowth) {
    const eggs = Array.isArray(saved.eggs) ? saved.eggs : [];
    for (const type in ANT_TYPES) {
      let owned = ants[type] + eggs.filter((egg) => egg && egg.type === type).length;
      if (type === 'fireAnt' && Array.isArray(saved.fireEggs)) owned += saved.fireEggs.length;
      let cost = ANT_TYPES[type].costStart;
      for (let n = 0; n < owned; n++) cost = nextAntCost(type, cost, ANT_TYPES[type].costGrowth);
      antCost[type] = Math.min(antCost[type], cost);   // never dearer than before
    }
  }

  const upgrades = {};
  const savedUpgrades = saved.upgrades || {};
  for (const key in UPGRADES) {
    const old = MERGED_UPGRADES[key] || [];
    let level = Math.max(wholeNumber(savedUpgrades[key], 0), ...old.map((k) => wholeNumber(savedUpgrades[k], 0)));
    if (saved.upgradeSteps !== UPGRADE_STEPS) level *= 2;   // saved before the in-between levels
    if (key === 'harvester' && saved.upgrades && saved.harvesterFirst !== HARVESTER_FIRST) level += 1;   // saved before its first level
    if (key === 'work' && saved.upgrades && saved.workSplit !== WORK_SPLIT) level = WORK_FROM_OLD[Math.min(level, 12)];   // saved before the small levels
    if (saved.upgrades && saved.upgradeLayout !== UPGRADE_LAYOUT && saved.upgradeLayout !== 2) level = levelFromLayout1(key, level);   // saved before twice the levels
    if (saved.upgrades && saved.upgradeLayout !== UPGRADE_LAYOUT && key === 'away' && level >= 2) level -= 1;   // saved before Away's first two levels became one
    upgrades[key] = Math.min(level, maxLevel(key));
  }

  // Eggs: earlier versions stored just the hatch time, or no kind of ant.
  const eggs = [];
  const usedSpots = new Set();
  for (const item of Array.isArray(saved.eggs) ? saved.eggs : []) {
    const hatchAt = typeof item === 'number' ? item : item && item.hatchAt;
    if (!Number.isFinite(hatchAt)) continue;
    let spot = item && Number.isInteger(item.spot) ? item.spot : -1;
    if (spot < 0 || (spot >= RULES.maxEggs && spot < 100) || usedSpots.has(spot)) {   // (100 on: a nursery's, checked when it is drawn)
      spot = -1;
      for (let s = 0; s < RULES.maxEggs; s++) {
        if (!usedSpots.has(s)) { spot = s; break; }
      }
    }
    if (spot >= 0) usedSpots.add(spot);
    const type = item && ANT_TYPES[item.type] ? item.type : 'worker';
    eggs.push({ hatchAt, spot, type });   // spot -1: more eggs than spots; still hatches, just isn't drawn
  }

  // Digs so far. Earlier versions saved only the listed price, which started
  // at 5 and rose by 5 with each dig.
  const digs = Number.isFinite(saved.digs) && saved.digs >= 0
    ? saved.digs                // may have a fraction: drags count part of a dig
    : Math.max(0, Math.round((wholeNumber(saved.digCost, 5) - 5) / 5));

  return {
    food: wholeNumber(saved.food, fresh.food),
    ants,
    antCost,
    phase,
    eggs,
    fireEggs: (Array.isArray(saved.fireEggs) ? saved.fireEggs : [])
      .filter((egg) => egg && Number.isFinite(egg.hatchAt) && Number.isInteger(egg.spot) && egg.spot >= 0 && egg.spot < FIRE_NEST_EGGS)
      .map((egg) => ({ hatchAt: egg.hatchAt, laidAt: Number.isFinite(egg.laidAt) ? egg.laidAt : egg.hatchAt - RULES.hatchMs, spot: egg.spot })),
    digs,
    digCost: listedDigCost(digs),
    trailBlocks: Number.isFinite(saved.trailBlocks) && saved.trailBlocks >= 0 ? saved.trailBlocks : 0,
    middenBlocks: Number.isFinite(saved.middenBlocks) && saved.middenBlocks >= 0 ? saved.middenBlocks : 0,
    upgrades,
    upgradeSteps: UPGRADE_STEPS,
    harvesterFirst: HARVESTER_FIRST,
    workSplit: WORK_SPLIT,
    upgradeLayout: UPGRADE_LAYOUT,
    priceGrowth: RULES.costGrowth,
    alate: saved.alate === true,
    alates: Number.isInteger(saved.alates) ? Math.min(Math.max(saved.alates, 0), SWARM.most) : saved.alate === true ? 1 : 0,
    trophicEggs: wholeNumber(saved.trophicEggs, 0),
    // Saves from before this was counted: any honeydew or honeydew upgrade means a flight was taken.
    satellite: loadSatellite(saved.satellite),
    satellite2: loadSatellite(saved.satellite2),
    cheats: saved.cheats === true,
    slowHatch: saved.slowHatch === true,
    flightTutorialDone: saved.flightTutorialDone === true,
    hoverTipShown: saved.hoverTipShown === true,
    supportAsked: saved.supportAsked === true,
    supportAgainAt: wholeNumber(saved.supportAgainAt, 0),
    fireAntsSeen: saved.fireAntsSeen === true,
    raidIn: Number.isFinite(saved.raidIn) ? saved.raidIn : null,
    marauderIn: Number.isFinite(saved.marauderIn) ? saved.marauderIn : null,
    beetleIn: Number.isFinite(saved.beetleIn) ? saved.beetleIn : null,
    beetleSeen: saved.beetleSeen === true,
    anteaterIn: Number.isFinite(saved.anteaterIn) ? saved.anteaterIn : null,
    anteaterSeen: saved.anteaterSeen === true,
    missingShown: { worker: wholeNumber(saved.missingShown && saved.missingShown.worker, 0), soldier: wholeNumber(saved.missingShown && saved.missingShown.soldier, 0) },
    surfaceWarned: saved.surfaceWarned === true,
    scoutIn: Number.isFinite(saved.scoutIn) ? saved.scoutIn : null,
    season: readSeason(saved.season),
    scoutFind: saved.scoutFind && Number.isFinite(saved.scoutFind.value) && Number.isFinite(saved.scoutFind.until) ? saved.scoutFind : null,
    scouts: saved.scouts && Number.isInteger(saved.scouts.count) && saved.scouts.count > 0 && Number.isFinite(saved.scouts.backAt) ? saved.scouts : null,
    raidAnts: Array.isArray(saved.raidAnts) ? saved.raidAnts : [],
    downedSoldiers: Array.isArray(saved.downedSoldiers) ? saved.downedSoldiers : [],
    herds: wholeNumber(saved.herds, 0),
    invasion: ['warned', 'on', 'won'].includes(saved.invasion) ? saved.invasion : null,
    jasonUsed: saved.jasonUsed === true,
    angeleeUsed: saved.angeleeUsed === true,
    starCodeUsed: saved.starCodeUsed === true,
    stats: Object.assign(newStats(), Object.fromEntries(STAT_KEYS.filter((k) => saved.stats && Number.isFinite(saved.stats[k])).map((k) => [k, saved.stats[k]]))),
    achieve: Object.fromEntries(ACHIEVEMENTS.filter((a) => saved.achieve && ['ready', 'claimed', 'old'].includes(saved.achieve[a.key])).map((a) => [a.key, saved.achieve[a.key]])),
    achieveShown: saved.achieveShown === true,
    pageTwoSeen: saved.pageTwoSeen === true,
    pageThreeSeen: saved.pageThreeSeen === true,
    readTerms: saved.readTerms && typeof saved.readTerms === 'object' ? Object.fromEntries(Object.keys(saved.readTerms).map((k) => [k, 1])) : {},
    weaver: readWeaver(saved.weaver),
    early: ['pending', 'taken', 'declined', 'none'].includes(saved.early) ? saved.early : 'pending',   // (a save from before the offer: a current player)
    platinum: {
      early: Math.min(wholeNumber(saved.platinum && saved.platinum.early, 0), 3),
      page2: wholeNumber(saved.platinum && saved.platinum.page2, 0)
    },
    hatchedRun: Number.isFinite(saved.hatchedRun) ? saved.hatchedRun : 0,
    flats: { minor: !!(saved.flats && saved.flats.minor), major: !!(saved.flats && saved.flats.major) },
    flights: wholeNumber(saved.flights, readRoyal(saved.royal).jelly > 0 || Object.keys(readRoyal(saved.royal).perks).length > 0 ? 1 : 0),
    flightsEver: Math.max(wholeNumber(saved.flightsEver, 0), flightsShownBefore(saved)),   // (raised to state.flights by flightsEver())
    crumbs: Array.isArray(saved.crumbs) ? saved.crumbs : saved.crumb && typeof saved.crumb === 'object' ? [saved.crumb] : null,
    harvested: Number.isFinite(saved.harvested) && saved.harvested > 0 ? Math.floor(saved.harvested) : 0,
    peacefulHarvested: Number.isFinite(saved.peacefulHarvested) && saved.peacefulHarvested > 0 ? Math.min(saved.peacefulHarvested, Number.isFinite(saved.harvested) ? saved.harvested : 0) : 0,
    aphids: wholeNumber(saved.aphids, 0),
    freeAphids: wholeNumber(saved.freeAphids, 0),
    crumbClicked: saved.crumbClicked === true,
    tutorialAsked: saved.tutorialAsked !== false,   // saves from before the tutorial existed: don't ask
    name: cleanName(saved.name).trim() || DEFAULT_NAME,
    settings: Object.assign(readSettings(saved.settings), saved.music20 === true ? {} : { music: 20 }),   // (the first time after the weaver ant update: music at 20%)
    music20: true,
    royal: readRoyal(saved.royal),
    lastTick: Number.isFinite(saved.lastTick) ? saved.lastTick : fresh.lastTick
  };
}

// Settings, checked: volumes in whole tens from 0 to 100, and Line assist (on unless turned off).
function readSettings(saved) {
  const volume = (value, start = 70) => (Number.isFinite(value) ? Math.min(Math.max(Math.round(value / 10) * 10, 0), 100) : start);
  const settings = saved && typeof saved === 'object' ? saved : {};
  const fungus = Number.isFinite(settings.fungusShare) ? Math.min(Math.max(Math.round(settings.fungusShare / 10) * 10, 0), FUNGUS_SPLIT.most) : FUNGUS_SPLIT.start;
  return { music: volume(settings.music, 0), sfx: volume(settings.sfx), sfxOn: settings.sfxOn !== false, autoHatch: settings.autoHatch !== false, lineAssist: settings.lineAssist !== false, fungusShare: fungus, seedMode: settings.seedMode === 'store' ? 'store' : 'eat', peaceful: settings.peaceful === true };
}

// Royal jelly and nuptial flight upgrades, checked.
function readRoyal(saved) {
  const royal = saved && typeof saved === 'object' ? saved : {};
  const savedPerks = royal.perks && typeof royal.perks === 'object' ? royal.perks : {};
  const perks = {};
  // Saved before Supercolony and Mega colony became one upgrade: Mega colony
  // (saved as polydomy) is its second level.
  if (Number.isFinite(savedPerks.polydomy) && savedPerks.polydomy > 0) savedPerks.megaColony = 2;
  // Guest quarters became Microbial heaters (the same place on perk page II).
  if (Number.isFinite(savedPerks.guestQuarters) && savedPerks.guestQuarters > 0) savedPerks.microbialHeaters = 1;
  // Trap-jaw bite became Marauder raids (the same place on perk page II).
  if (Number.isFinite(savedPerks.trapJaw) && savedPerks.trapJaw > 0) savedPerks.marauders = 1;
  // Mealybug flight became Aphid Farming's second level.
  if (Number.isFinite(savedPerks.mealybug) && savedPerks.mealybug > 0) savedPerks.aphidFarming = 2;
  for (const key in PERKS) {
    const level = Number.isFinite(savedPerks[key]) && savedPerks[key] > 0 ? Math.floor(savedPerks[key]) : 0;
    if (level > 0) perks[key] = Math.min(level, PERKS[key].costs.length);
  }
  const jelly = Number.isFinite(royal.jelly) && royal.jelly > 0 ? Math.floor(royal.jelly) : 0;
  return { jelly, perks };
}

// Earlier versions kept the tunnels inside the main save as a list of 2x2
// squares. Read that list so those tunnels are not lost.
function readOldDugSquares(saved) {
  const squares = [];
  for (const square of saved && Array.isArray(saved.dug) ? saved.dug : []) {
    if (Array.isArray(square) && Number.isInteger(square[0]) && Number.isInteger(square[1])) {
      squares.push([square[0], square[1]]);
    }
  }
  return squares;
}

/* ---------- Side panel ---------- */

// How many characters fit in each kind of number box.
const WIDE_BOX = 9;    // the full-width boxes
const BUY_BOX = 6;     // the price box beside a BUY button
const FOOD_BOX = 7;    // the food box, beside its ? box
const COST_BOX = 4;    // the small box beside a HATCH button
// Room inside a small price box, so 4-digit prices shrink to fit with a margin.
function costRoom(span) {
  return Math.max(0, span.parentElement.clientWidth - 6);
}

/*
 * Write a number so it fits in `maxChars` characters. Numbers too long are
 * shortened with K, M, B or T: 12,345 becomes "12K". Prices round up
 * (`roundUp`) so a price never looks cheaper than it is.
 */
function shortNumber(value, maxChars, roundUp) {
  const plain = String(value);
  if (plain.length <= maxChars) return plain;

  const round = roundUp ? Math.ceil : Math.floor;
  const units = ['K', 'M', 'B', 'T'];
  let text = plain;
  for (let i = 0; i < units.length; i++) {
    const scaled = value / Math.pow(1000, i + 1);
    // Move on to the next unit while this one would still need 4 or more digits.
    if (round(scaled) >= 1000 && i < units.length - 1) continue;
    const tenths = round(scaled * 10) / 10;
    text = tenths.toFixed(1) + units[i];
    if (text.length <= maxChars) return text;
    text = round(scaled) + units[i];
    if (text.length <= maxChars) return text;
  }
  return text;
}

const el = {
  food: document.getElementById('food'),
  screens: {
    main: document.getElementById('screen-main'),
    ants: document.getElementById('screen-ants'),
    dig: document.getElementById('screen-dig'),
    upgrades: document.getElementById('screen-upgrades'),
    flight: document.getElementById('screen-flight'),
    settings: document.getElementById('screen-settings'),
    ency: document.getElementById('screen-ency'),
    achieve: document.getElementById('screen-achieve'),
    build: document.getElementById('screen-build'),
    canopy: document.getElementById('screen-canopy')
  },
  lineAssist: document.getElementById('btn-line-assist'),
  btnEncy: document.getElementById('btn-ency'),
  btnAchieve: document.getElementById('btn-achieve'),
  achieveAlert: document.getElementById('achieve-alert'),
  achieve: document.getElementById('achieve'),
  achieveList: document.getElementById('achieve-list'),
  achieveCount: document.getElementById('achieve-count'),
  achieveRows: {},
  flat: { worker: document.getElementById('btn-flat-worker'), soldier: document.getElementById('btn-flat-soldier') },
  volume: {
    music: { slider: document.getElementById('vol-music'), value: document.getElementById('vol-music-value') }
  },
  ency: document.getElementById('ency'),
  encyList: document.getElementById('ency-list'),
  encyEntry: document.getElementById('ency-entry'),
  encyTerm: document.getElementById('ency-term'),
  encyText: document.getElementById('ency-text'),
  encyBack: document.getElementById('ency-back'),
  btnFlight: document.getElementById('btn-flight'),
  btnAlate: document.getElementById('btn-buy-alate'),
  btnSat: document.getElementById('btn-sat'),
  alateLabel: document.getElementById('buy-label-alate'),
  alateCount: document.getElementById('count-alate'),
  alateCost: document.getElementById('cost-alate'),
  btnTrophic: document.getElementById('btn-buy-trophic'),
  trophicLabel: document.getElementById('buy-label-trophic'),
  trophicCount: document.getElementById('count-trophic'),
  trophicCost: document.getElementById('cost-trophic'),
  trophicReadout: document.getElementById('readout-trophic'),
  jelly: document.getElementById('jelly'),
  tree: document.getElementById('tree'),
  treeBody: document.getElementById('tree-body'),
  treeLines: document.getElementById('tree-lines'),
  perk: {},   // per nuptial flight upgrade: { button, cost, costIcon }
  btnAnts: document.getElementById('btn-ants'),
  btnDig: document.getElementById('btn-dig'),
  btnUpgrade: document.getElementById('btn-upgrade'),
  btnBuild: document.getElementById('btn-build'),
  btnTrail: document.getElementById('btn-build-trail'),
  btnMidden: document.getElementById('btn-build-midden'),
  btnNursery: document.getElementById('btn-build-nursery'),
  btnCaterpillar: document.getElementById('btn-build-caterpillar'),
  nurseryGroup: document.getElementById('group-nursery'),
  nurseryCost: document.getElementById('nursery-cost'),
  middenLock: document.getElementById('midden-lock'),
  middenGroup: document.getElementById('group-midden'),
  middenCost: document.getElementById('midden-cost'),
  middenTip: document.getElementById('midden-tip'),
  trailLock: document.getElementById('trail-lock'),
  trailCostGroup: document.getElementById('group-trail-cost'),
  trailCost: document.getElementById('trail-cost'),
  btnAphid: document.getElementById('btn-build-aphid'),
  btnFungus: document.getElementById('btn-build-fungus'),
  btnReplete: document.getElementById('btn-build-replete'),
  btnDelete: document.getElementById('btn-build-delete'),
  repleteLock: document.getElementById('replete-lock'),
  repleteGroup: document.getElementById('group-replete'),
  repleteCount: document.getElementById('count-replete'),
  repleteCost: document.getElementById('replete-cost'),
  fungusLock: document.getElementById('fungus-lock'),
  fungusGroup: document.getElementById('group-fungus'),
  fungusCount: document.getElementById('count-fungus'),
  fungusCost: document.getElementById('fungus-cost'),
  btnGranary: document.getElementById('btn-build-granary'),
  granaryCount: document.getElementById('count-granary'),
  mergeGroup: document.getElementById('group-merge'),
  placeHint: document.getElementById('place-hint'),
  placeHint1: document.getElementById('place-hint-1'),
  placeHint2: document.getElementById('place-hint-2'),
  mergeCostGroup: document.getElementById('group-merge-cost'),
  mergeCost: document.getElementById('merge-cost'),
  mergeButtons: { vault: document.getElementById('btn-merge-vault'), chamber: document.getElementById('btn-merge-chamber'), honeypot: document.getElementById('btn-merge-honeypot'), herd: document.getElementById('btn-merge-herd') },
  granaryCost: document.getElementById('granary-cost'),
  granaryGroup: document.getElementById('group-granary'),
  aphidLock: document.getElementById('aphid-lock'),
  aphidGroup: document.getElementById('group-aphid'),
  aphidCount: document.getElementById('count-aphid'),
  aphidReadout: document.getElementById('readout-aphid'),
  aphidCost: document.getElementById('aphid-cost'),
  upgrade: {},   // per upgrade: { value, cost, button, label }
  btnReset: document.getElementById('btn-reset'),
  btnSettings: document.getElementById('btn-settings'),
  foodGroup: document.getElementById('food').closest('.group'),
  canopy: document.getElementById('canopy'),
  canopyUp: document.getElementById('btn-canopy-up'),
  canopyDown: document.getElementById('btn-canopy-down'),
  weaverFood: document.getElementById('weaver-food'),
  weaverFoodReadout: document.getElementById('readout-weaver-food'),
  btnWeaverAnt: document.getElementById('btn-weaver-ant'),
  weaverCount: document.getElementById('weaver-count'),
  weaverCost: document.getElementById('weaver-cost'),
  btnWeaverLeaf: document.getElementById('btn-weaver-leaf'),
  leafCost: document.getElementById('leaf-cost'),
  weaverBranch: document.getElementById('weaver-branch'),
  weaverQueen: document.getElementById('btn-weaver-queen'),
  anteaterAsk: document.getElementById('anteater-ask'),
  weaverBranchLabel: document.getElementById('weaver-branch-label'),
  groupExchange: document.getElementById('group-exchange'),
  btnExchange: document.getElementById('btn-exchange'),
  exchangeRate: document.getElementById('exchange-rate'),
  sfx: document.getElementById('btn-sfx'),
  peaceful: document.getElementById('btn-peaceful'),
  autoHatch: document.getElementById('btn-auto-hatch'),
  autoHatchGroup: document.getElementById('group-auto-hatch'),
  btnFloat: document.getElementById('btn-float'),
  resetLabel: document.getElementById('reset-label'),
  ant: {},   // per kind of ant: { count, cost, button, label }
  toolButtons: {
    dig: document.getElementById('btn-tool-dig'),
    fill: document.getElementById('btn-tool-fill')
  },
  shapeButtons: {
    square: document.getElementById('btn-shape-square'),
    round: document.getElementById('btn-shape-round')
  },
  size: document.getElementById('size'),
  splitGroup: document.getElementById('group-split'),
  split: document.getElementById('split'),
  splitCrumb: document.getElementById('split-crumb'),
  splitFungus: document.getElementById('split-fungus'),
  toolCostLabel: document.getElementById('tool-cost-label'),
  toolCost: document.getElementById('tool-cost'),
  zoomIn: document.getElementById('btn-zoom-in'),
  zoomOut: document.getElementById('btn-zoom-out'),
  zoomInLabel: document.getElementById('zoom-in-label'),
  zoomOutLabel: document.getElementById('zoom-out-label'),
  title: document.getElementById('title'),
  titleText: document.getElementById('title-text'),
  titleCaret: document.getElementById('title-caret'),
  dialogTitle: document.getElementById('dialog-title-text'),
  noRoom: document.getElementById('no-room'),
  dialogLines: document.getElementById('dialog-lines'),
  jellyBar: document.getElementById('jelly-bar'),
  jellyNext: document.getElementById('jelly-next'),
  jellyGain: document.getElementById('jelly-gain'),
  btnFly: document.getElementById('btn-fly'),
  flyLabel: document.getElementById('fly-label'),
  noRoomOk: document.getElementById('btn-no-room-ok'),
  noRoomCancel: document.getElementById('btn-no-room-cancel'),
  noRoomLater: document.getElementById('btn-no-room-later'),
  idleBox: document.getElementById('idle-box'),
  autoclickBox: document.getElementById('autoclick-box'),
  treeTabs: document.getElementById('tree-tabs'),
  treeTabStar: document.getElementById('tree-tab-star'),
  titleStars: document.getElementById('title-stars'),
  treeTab1: document.getElementById('tree-tab-1'),
  treeTab2: document.getElementById('tree-tab-2'),
  treeTab3: document.getElementById('tree-tab-3'),
  seedGroup: document.getElementById('group-seed-mode'),
  seedEat: document.getElementById('btn-seed-eat'),
  seedStore: document.getElementById('btn-seed-store'),
  seedFlag: document.getElementById('btn-seed-flag'),
  winterBadge: document.getElementById('winter-badge'),
  winterWarn: document.getElementById('winter-warn'),
  scoutFind: document.getElementById('btn-scout'),
  scoutStatus: document.getElementById('scout-status'),
  scoutStatusText: document.getElementById('scout-status-text'),
  tut: document.getElementById('tut'),
  tutBox: document.getElementById('tut-box'),
  tutLines: document.getElementById('tut-lines'),
  tutYes: document.getElementById('btn-tut-yes'),
  tutYesLabel: document.getElementById('tut-yes-label'),
  tutNo: document.getElementById('btn-tut-no'),
  welcome: document.getElementById('welcome'),
  welcomeBox: document.getElementById('welcome-box'),
  welcomeLines: document.getElementById('welcome-lines'),
  welcomeOk: document.getElementById('btn-welcome-ok'),
  raidIntro: document.getElementById('raid-intro'),
  raidBox: document.getElementById('raid-box'),
  raidLines: document.getElementById('raid-lines'),
  raidOk: document.getElementById('btn-raid-ok'),
  btnAlarm: document.getElementById('btn-alarm'),
  foodHelp: document.getElementById('food-help'),
  raidWarning: document.getElementById('raid-warning')
};
for (const type in ANT_TYPES) {
  el.ant[type] = {
    count: document.getElementById('count-' + type),
    readout: document.getElementById('readout-' + type),
    cost: document.getElementById('cost-' + type),
    button: document.getElementById('btn-hatch-' + type),
    label: document.getElementById('hatch-label-' + type)
  };
}

// The Upgrades menu is built from the UPGRADES list: a name, a box showing
// the value now and after buying, and a BUY button with its price.
for (const key in UPGRADES) {
  const group = document.createElement('div');
  group.className = 'group compact';
  group.innerHTML =
    '<div class="label"><span class="px"></span></div>' +
    '<div class="readout"><span class="px"></span><span class="px"></span></div>' +
    '<div class="buy-row">' +
    '  <button class="btn"><span class="px"></span></button>' +
    '  <div class="readout cost"><span class="px"></span></div>' +
    '</div>';
  const [name, value, value2, label, cost] = group.querySelectorAll('.px');
  const twoLines = Array.isArray(UPGRADES[key].show(UPGRADES[key].values[0]));
  if (twoLines) group.querySelector('.readout').classList.add('two-lines');
  else value2.remove();
  const button = group.querySelector('button');
  name.dataset.text = UPGRADES[key].label;
  button.id = 'btn-up-' + key;
  group.dataset.tip = UPGRADES[key].tip;
  button.setAttribute('aria-label', 'Buy ' + UPGRADES[key].tip.split('|')[0]);
  value.id = 'value-up-' + key;
  cost.id = 'cost-up-' + key;
  el.screens.upgrades.appendChild(group);
  el.upgrade[key] = { value, value2: twoLines ? value2 : null, cost, button, label };
}
el.screens.upgrades.appendChild(document.getElementById('group-trophic'));   // trophic eggs last, under the upgrades

// The nuptial flight tree: one button per upgrade, with its name (in small
// letters, a word or two per line) and its price. Placed by layoutTree().
// The line of story at the top of the honeydew tree.
PixelFont.write(document.getElementById('species-name'), 'Messor barbarus', { small: true });   // the Ants menu
PixelFont.write(document.getElementById('tree-intro-1'), 'Your harvester ants trade honeydew with other ants', { small: true });
PixelFont.write(document.getElementById('tree-intro-2'), 'to learn their secrets.', { small: true });

const PERK_NAME_CHARS = 11;   // most small letters that fit across a box

function nameLines(title) {
  const lines = [];
  for (const word of title.split(' ')) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length <= PERK_NAME_CHARS) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  return lines;
}

for (const key in PERKS) {
  const button = document.createElement('button');
  button.className = 'btn perk' + (PERKS[key].page === 2 ? ' page-2' : PERKS[key].page === 3 ? ' page-3' : '');
  button.id = 'perk-' + key;
  button.setAttribute('aria-label', PERKS[key].title);
  const name = document.createElement('span');
  name.className = 'perk-name';
  const lines = nameLines(PERKS[key].title);
  for (let n = 0; n < lines.length; n++) {
    const span = document.createElement('span');
    span.className = 'px';
    name.appendChild(span);
  }
  const costRow = document.createElement('span');
  costRow.className = 'perk-cost';
  const costIcon = document.createElement('span');
  costIcon.className = 'sprite';
  costIcon.dataset.sprite = 'jelly';
  costIcon.dataset.scale = '1';
  const cost = document.createElement('span');
  cost.className = 'px';
  costRow.append(costIcon, cost);
  button.append(name, costRow);
  button.addEventListener('click', () => buyPerk(key));
  el.treeBody.appendChild(button);
  // Written once the box is on the page, so the letters take its color.
  name.querySelectorAll('.px').forEach((span, n) => PixelFont.write(span, lines[n], { small: true }));
  el.perk[key] = { button, cost, costIcon, name, title: PERKS[key].title };
}

// Size of the tree's boxes and the space around them, in screen pixels.
const TREE = { cols: 4, rows: 4, boxW: 74, boxH: 50, edge: 8 };

// Where each upgrade's box goes: { x, y } of its top-left corner. Worked out
// from the tree window's size, so the boxes spread evenly over it.
let treePage = 1;   // the perk page shown: 1, or 2 once it opens
const perkPage = (key) => PERKS[key].page || 1;

function treeSpots() {
  const w = el.treeBody.clientWidth;
  const h = el.treeBody.clientHeight;
  const rowsShown = TREE.rows;   // (page II has four rows too now)
  const gapX = (w - 2 * TREE.edge - TREE.cols * TREE.boxW) / (TREE.cols - 1);
  const gapY = (h - 2 * TREE.edge - rowsShown * TREE.boxH) / (rowsShown - 1);
  const even = (n) => Math.round(n / 2) * 2;   // keep to whole game pixels
  const spots = {};
  for (const key in PERKS) {
    spots[key] = {
      x: even(TREE.edge + PERKS[key].col * (TREE.boxW + gapX)),
      y: even(TREE.edge + PERKS[key].row * (TREE.boxH + gapY))
    };
  }
  return spots;
}

// Place the boxes and draw an arrow from each upgrade to the ones it leads to.
function layoutTree() {
  const pageOpen = pageTwoOpen();
  const pageThree = pageThreeOpen();
  if (!pageOpen) treePage = 1;
  if (treePage === 3 && !pageThree) treePage = 1;
  el.treeTabs.hidden = !pageOpen;   // (first: the tabs take room, so the boxes are measured after)
  el.treeTab3.hidden = !pageThree;
  const spots = treeSpots();
  el.treeTab2.classList.toggle('tut-point', pageOpen && !state.pageTwoSeen && !state.cheats);   // blinks until first opened (not after C)
  el.treeTab3.classList.toggle('tut-point', pageThree && !state.pageThreeSeen && !state.cheats);
  el.treeTab1.classList.toggle('is-on', treePage === 1);
  el.treeTab2.classList.toggle('is-on', treePage === 2);
  el.treeTab3.classList.toggle('is-on', treePage === 3);
  el.treeTab1.setAttribute('aria-pressed', String(treePage === 1));
  el.treeTab2.setAttribute('aria-pressed', String(treePage === 2));
  el.treeTab3.setAttribute('aria-pressed', String(treePage === 3));
  el.treeTabStar.hidden = !pageTwoDone();
  for (const key in PERKS) {
    el.perk[key].button.hidden = perkPage(key) !== treePage;
    el.perk[key].button.style.left = spots[key].x + 'px';
    el.perk[key].button.style.top = spots[key].y + 'px';
  }

  // The arrows are drawn at game-pixel size (2 screen pixels each).
  const canvas = el.treeLines;
  canvas.width = Math.ceil(el.treeBody.clientWidth / 2);
  canvas.height = Math.ceil(el.treeBody.clientHeight / 2);
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#000000';
  const box = (key) => ({
    left: spots[key].x / 2, top: spots[key].y / 2,
    right: (spots[key].x + TREE.boxW) / 2, bottom: (spots[key].y + TREE.boxH) / 2,
    midX: Math.floor((spots[key].x + TREE.boxW / 2) / 2), midY: Math.floor((spots[key].y + TREE.boxH / 2) / 2)
  });
  for (const key in PERKS) {
    if (!PERKS[key].needs || perkPage(key) !== treePage) continue;
    const from = box(PERKS[key].needs);
    const to = box(key);
    const head = (x, y, dx, dy) => {   // an arrowhead pointing (dx, dy), its tip at (x, y)
      for (let back = 0; back < 3; back++) {
        for (let side = -back; side <= back; side++) {
          g.fillRect(x - dx * back + dy * side, y - dy * back + dx * side, 1, 1);
        }
      }
    };
    if (from.midY === to.midY) {           // side by side
      const leftward = to.midX < from.midX;
      const x0 = leftward ? to.right + 1 : from.right;
      const x1 = leftward ? from.left - 1 : to.left - 1;
      g.fillRect(x0, from.midY, x1 - x0 + 1, 1);
      if (leftward) head(to.right, from.midY, -1, 0);
      else head(to.left - 1, from.midY, 1, 0);
    } else {                               // one above the other
      const upward = to.midY < from.midY;
      const y0 = upward ? to.bottom + 1 : from.bottom;
      const y1 = upward ? from.top - 1 : to.top - 1;
      g.fillRect(from.midX, y0, 1, y1 - y0 + 1);
      if (upward) head(from.midX, to.bottom, 0, -1);
      else head(from.midX, to.top - 1, 0, 1);
    }
  }
}

// Show each upgrade's price and whether it can be bought, and what it does
// when the mouse rests on it.
function renderTree() {
  el.btnFlight.classList.toggle('tut-point', ((pageTwoOpen() && !state.pageTwoSeen) || (pageThreeOpen() && !state.pageThreeSeen)) && !state.cheats && screen !== 'flight' && el.tut.hidden);   // a new perk page: look here (not after C)
  PixelFont.write(el.jelly, shortNumber(state.royal.jelly, WIDE_BOX - 2, false));

  // Progress toward the next royal jelly this run, and what a flight would give now.
  const gain = jellyForFood(state.harvested);
  const from = foodForJelly(gain);
  const to = foodForJelly(gain + 1);
  const part = Math.min(1, (state.harvested - from) / (to - from));
  el.jellyBar.style.width = (Math.floor(part * 32) / 32 * 100) + '%';   // fills in steps, like pixels
  PixelFont.write(el.jellyNext, shortNumber(Math.floor(state.harvested - from), 4, false) + '/' + shortNumber(to - from, 4, true));
  PixelFont.write(el.jellyGain, '+' + flightGain());
  const armed = Date.now() < flyArmedUntil;
  setButton(el.btnFly, el.flyLabel, armed ? 'SURE?' : 'FLY', gain >= 1);

  for (const key in PERKS) {
    const perk = PERKS[key];
    const part = el.perk[key];
    const level = perkLevel(key);
    const status = perkState(key);
    const many = perk.costs.length > 1;
    part.button.classList.toggle('is-owned', status === 'owned');
    part.button.classList.toggle('is-locked', status === 'locked');
    part.button.classList.toggle('is-short', status === 'short' || status === 'locked');
    part.button.setAttribute('aria-disabled', String(status !== 'ready'));
    part.costIcon.hidden = status === 'owned';
    let text;
    if (perk.endless) text = status === 'owned' ? 'Lv ' + level : shortNumber(perk.costs[level], 6, true) + '  Lv ' + level;   // (page III: bought again and again)
    else if (status === 'owned') text = many ? perk.costs.length + '/' + perk.costs.length : 'Owned';
    else text = perk.costs[level] + (many ? '  ' + level + '/' + perk.costs.length : '');
    PixelFont.write(part.cost, text, { small: true });

    let note;
    if (status === 'owned') note = 'Bought';
    else if (status === 'locked') note = lockedNote(key);
    else note = 'Costs ' + perk.costs[level] + ' honeydew';
    if (perk.endless) note = (level > 0 ? 'Now +' + Math.round(PAGE_THREE.share * level * 100) + '%|' : '') + note;
    // An upgrade with a name per level (Repletes, then Honeypot) shows the next one's name and tip.
    const shownLevel = Math.min(level, perk.costs.length - 1);
    const title = perk.levelTitles ? perk.levelTitles[shownLevel] : perk.title;
    if (title !== part.title) {
      part.title = title;
      part.name.replaceChildren();
      for (const line of nameLines(title)) {
        const span = document.createElement('span');
        span.className = 'px';
        part.name.appendChild(span);
        PixelFont.write(span, line, { small: true });
      }
    }
    const tip = perk.levelTips ? perk.levelTips[shownLevel] : perk.tip;
    part.button.dataset.tip = tip + '|~From ' + (perk.levelFrom ? perk.levelFrom[shownLevel] : perk.from) + '|' + note;   // the box already shows the name; ~ marks the red line
  }
}

/*
 * Encyclopedia: a list of terms; clicking one shows what it is in real life
 * (from encyclopedia.js), with a LIST button to go back.
 */
ENCYCLOPEDIA.forEach((entry, n) => {
  const button = document.createElement('button');
  button.className = 'btn ency-item';
  button.id = 'ency-item-' + n;
  button.setAttribute('aria-label', entry.term);
  const label = document.createElement('span');
  label.className = 'px';
  button.appendChild(label);
  el.encyList.appendChild(button);
  PixelFont.write(label, entry.term);
  button.addEventListener('click', () => showEntry(n));
});

// Split text into lines of at most `width` letters, breaking between words.
function wrapText(text, width) {
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + word).length <= width) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  return lines;
}

const LETTER_WIDTH = 14;   // screen pixels from one letter to the next (font.js)

function showEntry(n) {
  const entry = ENCYCLOPEDIA[n];
  state.readTerms[entry.term] = 1;   // for Myrmecologist and Myrmecology
  el.encyList.hidden = true;
  el.encyEntry.hidden = false;
  el.encyEntry.scrollTop = 0;
  PixelFont.write(el.encyTerm, entry.term);
  // As many letters per line as fit beside the scroll bar.
  const room = el.encyEntry.clientWidth - 14 - 8;
  const perLine = Math.floor((room + 3) / LETTER_WIDTH);
  el.encyText.replaceChildren();
  // Sections are split by a blank line; a section may start with a heading line.
  for (const section of entry.text.split('\n\n')) {
    const parts = section.split('\n');
    const body = parts.pop();
    for (const heading of parts) {
      const span = document.createElement('span');
      span.className = 'px ency-head';
      el.encyText.appendChild(span);
      PixelFont.write(span, heading);
    }
    for (const line of wrapText(body, perLine)) {
      const span = document.createElement('span');
      span.className = 'px';
      el.encyText.appendChild(span);
      PixelFont.write(span, line);
    }
  }
}

function showEncyList() {
  el.encyEntry.hidden = true;
  el.encyList.hidden = false;
}

let screen = 'main';

// The one-time support request (see showScreen).
const SUPPORT = { afterFlights: 2, laterFlights: 3, url: 'https://buymeacoffee.com/georgecarson' };

function openSupport() {
  if (window.chrome && chrome.tabs) chrome.tabs.create({ url: SUPPORT.url });
  else window.open(SUPPORT.url, '_blank');
}

function showScreen(name) {
  if (name !== 'canopy' && typeof Canopy !== 'undefined' && Canopy.isOpen()) Canopy.close();   // (leaving the canopy some other way: back down)
  if (screen === 'dig' && name !== 'dig' && Field.repickStoreFlag()) saveCave();   // out of the Dig menu: a store flag the game picked moves to the best spot now
  screen = name;
  el.foodGroup.hidden = name === 'canopy';   // up in the canopy, weaver food shows instead
  el.canopyUp.hidden = !weaverUnlocked() || name === 'canopy';
  // A merge being placed is put down on leaving the Build menu, so the
  // buildings it hid show again and stay shown when the menu opens again.
  if (name !== 'build' && MERGES[buildTool]) chooseBuildTool(null);
  for (const key in el.screens) el.screens[key].hidden = key !== name;
  Field.showStoreFlag(name === 'build');   // the store flag shows only in the Build menu
  if (name !== 'build' && Field.pickingStoreFlag()) Field.pickStoreFlag(null);
  // The tool and its colored band are only active while the dig menu is open.
  Field.setTool(name === 'dig' ? tool : name === 'build' ? buildTool : null);
  Field.setTrailView(name === 'build');   // the trail shows in yellow in the Build menu
  // The nuptial flight tree and the encyclopedia cover the field while their menus are open.
  el.tree.hidden = name !== 'flight';
  if (name === 'flight') layoutTree();
  if (name === 'flight' && !state.flightTutorialDone && !state.cheats && el.tut.hidden) setTimeout(startFlightTutorial, 0);
  // Starting the third colony (after 2 flights), the first time the Ants
  // menu opens: ask once for support. YES opens the support page; LATER
  // asks again SUPPORT.laterFlights flights on.
  const askAgain = state.supportAgainAt > 0 && state.flights >= state.supportAgainAt;
  if (name === 'ants' && state.flights >= SUPPORT.afterFlights && (!state.supportAsked || askAgain) && el.tut.hidden && el.noRoom.hidden) {
    state.supportAsked = true;
    state.supportAgainAt = 0;
    save();
    showConfirm(['Consider Supporting?', "(I won't ask", 'ever again)'], openSupport, ['YES', 'NO'], () => {
      state.supportAgainAt = state.flights + SUPPORT.laterFlights;
      save();
    });
  }
  // The first time the Build menu opens: point out the tooltips.
  if (name === 'build' && !state.hoverTipShown && el.tut.hidden) {
    state.hoverTipShown = true;
    save();
    showMessage(['Hover over anything', 'in the game for', 'more info!']);
  }
  el.ency.hidden = name !== 'ency';
  el.achieve.hidden = name !== 'achieve';
  if (name === 'ency') showEncyList();
  render();
}

/* ---------- Build menu ---------- */

let buildTool = null;   // 'trail' while the pheromone trail button is pressed

// Where each structure can go, shown at the bottom of the field while its
// tool is chosen.
const PLACE_HINTS = {
  granary: ['Can be placed', 'on a floor'],
  nursery: ['Can be placed', 'on a floor'],
  caterpillar: ['Can be placed', 'on a floor'],
  fungus: ['Can be placed', 'on any surface'],
  replete: ['Can be placed', 'on a ceiling'],
  aphid: ['Can be placed', 'in any tunnel'],
  vault: ['Can be placed', 'on a floor'],
  chamber: ['Can be placed', 'on any surface'],
  honeypot: ['Can be placed', 'on a ceiling'],
  herd: ['Can be placed', 'in any tunnel']
};

// The hint fades while the mouse is near it, so what's under it can be seen.
document.getElementById('field').addEventListener('mousemove', (event) => {
  if (el.placeHint.hidden) return;
  const box = el.placeHint.getBoundingClientRect();
  const near = event.clientX < box.right + 16 && event.clientY > box.top - 16;
  el.placeHint.classList.toggle('is-faded', near);
});

function renderPlaceHint() {
  const lines = screen === 'build' && PLACE_HINTS[buildTool];
  el.placeHint.hidden = !lines;
  if (!lines) return;
  PixelFont.write(el.placeHint1, lines[0]);
  PixelFont.write(el.placeHint2, lines[1]);
}

function renderBuild() {
  renderPlaceHint();
  PixelFont.write(el.granaryCost, shortNumber(granaryCost(), WIDE_BOX, true));
  PixelFont.write(el.granaryCount, shortNumber(Field.granaryCount(), WIDE_BOX, false));
  const open = trailUnlocked();
  if (!open && buildTool === 'trail') chooseBuildTool(null);
  const button = el.btnTrail;
  button.classList.toggle('is-locked', !open);
  button.classList.toggle('is-off', !open);
  button.setAttribute('aria-disabled', String(!open));
  el.trailLock.hidden = open;
  button.dataset.tip = open
    ? 'Pheromone Trail|Place on tunnel. Ants|on it walk 60% faster.'
    : 'Pheromone Trail|Needs Pheromone trails|(honeydew upgrade).';
  // Each thing's numbers show only while it is selected.
  el.granaryGroup.hidden = buildTool !== 'granary';
  // The nursery: not shown at all until Brood tending is bought.
  const nursery = perkLevel('broodTending') > 0;
  el.btnNursery.hidden = !nursery;
  if (!nursery && buildTool === 'nursery') chooseBuildTool(null);
  el.nurseryGroup.hidden = buildTool !== 'nursery';
  // The caterpillar (Lycaenid Mutualism): not shown until bought; one only, free.
  const cat = perkLevel('lycaenid') > 0;
  const placed = Field.caterpillarCount() > 0;
  el.btnCaterpillar.hidden = !cat;
  if ((!cat || placed) && buildTool === 'caterpillar') chooseBuildTool(null);
  el.btnCaterpillar.classList.toggle('is-off', placed);
  el.btnCaterpillar.dataset.tip = placed ? 'Caterpillar|Already placed (one|only). The trash can|takes it away.' : 'Caterpillar|Place on a floor: it|needs a space 24 wide.|Free, one only. Every|minute the game is|open an ant milks it:|+1 honeydew.';
  PixelFont.write(el.nurseryCost, shortNumber(nurseryCost(), WIDE_BOX, true));
  el.trailCostGroup.hidden = !open || buildTool !== 'trail';
  PixelFont.write(el.trailCost, shortNumber(trailCost(), WIDE_BOX, true));

  // The midden: shown once page I reaches it (Fungal garden owned), locked until bought.
  const heap = middenUnlocked();
  if (!heap && buildTool === 'midden') chooseBuildTool(null);
  el.btnMidden.hidden = !heap && perkLevel('fungalGarden') === 0;
  el.btnMidden.classList.toggle('is-locked', !heap);
  el.btnMidden.classList.toggle('is-off', !heap);
  el.btnMidden.setAttribute('aria-disabled', String(!heap));
  el.middenLock.hidden = heap;
  el.btnMidden.dataset.tip = heap
    ? 'Midden|Trashpile that slows|down nearby ants, when|full it sprouts into a|sunflower that explodes|into seeds.|Bigger middens hold|more and give more|seeds that are more|valuable'
    : 'Midden|Needs Midden|(honeydew upgrade).';
  el.middenGroup.hidden = !heap || buildTool !== 'midden';
  PixelFont.write(el.middenCost, shortNumber(Math.round(middenBlockCost()), WIDE_BOX, true));

  const farm = aphidsUnlocked();
  if (!farm && buildTool === 'aphid') chooseBuildTool(null);
  el.btnAphid.classList.toggle('is-locked', !farm);
  el.btnAphid.classList.toggle('is-off', !farm);
  el.btnAphid.setAttribute('aria-disabled', String(!farm));
  el.aphidLock.hidden = farm;
  // Aphid, fungus and replete buttons: not shown until after the first nuptial flight (or the C cheat),
  // unless one is already unlocked (a perk bought before any flight, with honeydew from achievements after a platinum restart).
  el.btnAphid.hidden = state.flights === 0 && !state.cheats && !aphidsUnlocked() && !repletesUnlocked() && !fungusUnlocked();
  el.btnAphid.dataset.tip = farm
    ? 'Aphid|Place on any tunnel.|Fills with honeydew|every minute. A worker|milks it for ' + APHIDS.food + ' food.|+' + Math.round(APHIDS.honeydewBoost * 100) + '% honeydew earnings|per aphid.'
    : 'Aphid|Needs Aphid Farming|(honeydew upgrade).';
  el.aphidGroup.hidden = !farm || buildTool !== 'aphid';
  PixelFont.write(el.aphidCount, shortNumber(state.aphids, WIDE_BOX, false));
  el.aphidReadout.dataset.tip = 'Each aphid: ' + APHIDS.food + ' food|a minute, when milked|All ' + state.aphids + ': up to ' +
    shortNumber(APHIDS.food * state.aphids, 12, false) + '/min';
  PixelFont.write(el.aphidCost, state.freeAphids > 0 ? 'FREE' : shortNumber(aphidCost(), WIDE_BOX, true));

  // Fungus gardens: shown with aphids, locked until Fungal garden.
  const garden = fungusUnlocked();
  if (!garden && buildTool === 'fungus') chooseBuildTool(null);
  el.btnFungus.hidden = el.btnAphid.hidden;
  el.btnFungus.classList.toggle('is-locked', !garden);
  el.btnFungus.classList.toggle('is-off', !garden);
  el.btnFungus.setAttribute('aria-disabled', String(!garden));
  el.fungusLock.hidden = garden;
  el.btnFungus.dataset.tip = garden
    ? 'Fungus Garden|Place on any surface.|Workers feed it crumbs|until it is harvested|for food. Grows slowly|on its own, but grows|much faster and more|valuable if fed by ants.'
    : 'Fungus Garden|Needs Fungal garden|(honeydew upgrade).';
  el.fungusGroup.hidden = !garden || buildTool !== 'fungus';
  el.splitGroup.hidden = !garden;
  if (el.split.value !== String(state.settings.fungusShare)) el.split.value = String(state.settings.fungusShare);
  PixelFont.write(el.splitCrumb, (100 - state.settings.fungusShare) + '%');
  PixelFont.write(el.splitFungus, state.settings.fungusShare + '%');
  PixelFont.write(el.fungusCount, shortNumber(Field.fungusCount(), WIDE_BOX, false));
  PixelFont.write(el.fungusCost, shortNumber(fungusCost(), WIDE_BOX, true));

  // Repletes: shown with aphids, locked until Repletes.
  const replete = repletesUnlocked();
  if (!replete && buildTool === 'replete') chooseBuildTool(null);
  el.btnReplete.hidden = el.btnAphid.hidden;
  el.btnReplete.classList.toggle('is-locked', !replete);
  el.btnReplete.classList.toggle('is-off', !replete);
  el.btnReplete.setAttribute('aria-disabled', String(!replete));
  el.repleteLock.hidden = replete;
  el.btnReplete.dataset.tip = replete
    ? 'Replete|Place on a ceiling.|Costs a worker. Holds|20 crumbs, then pays|' + Math.round(fieldRules().repletePays * fieldRules().repleteBoost * 10) / 10 + 'x their food.'
    : 'Replete|Needs Repletes|(honeydew upgrade).';
  el.repleteGroup.hidden = !replete || buildTool !== 'replete';
  PixelFont.write(el.repleteCount, shortNumber(Field.repleteCount(), WIDE_BOX, false));
  PixelFont.write(el.repleteCost, shortNumber(repleteCost(), WIDE_BOX, true));

  // Merging: shown once there is anything that can be merged (or anything
  // merged). Each merge is ready with 10 of its structure.
  el.mergeGroup.hidden = !Object.keys(MERGES).some((kind) => Field.bigCount(kind) > 0 || (mergeUnlocked(kind) && mergeBase(kind) > 0));
  for (const kind in MERGES) {
    const merge = MERGES[kind];
    const button = el.mergeButtons[kind];
    const unlocked = mergeUnlocked(kind);
    const have = mergeBase(kind);
    const ready = unlocked && have >= MERGE_COUNT;
    if (!ready && buildTool === kind) chooseBuildTool(null);
    button.hidden = !unlocked && kind !== 'vault';
    button.classList.toggle('is-off', !ready || state.food < mergeCost(kind));
    button.setAttribute('aria-disabled', String(!ready));
    button.dataset.tip = merge.name + '|' + MERGE_TIPS[kind] + '|Scales ' + MERGE_NAMES[kind] + '|cost back down.|Merges ' + MERGE_COUNT + ' (you have ' + have + ').|Costs ' + shortNumber(mergeCost(kind), 12, true) + ' food.|Each one after costs|more.';
  }
  el.mergeCostGroup.hidden = !MERGES[buildTool];
  if (MERGES[buildTool]) PixelFont.write(el.mergeCost, shortNumber(mergeCost(buildTool), WIDE_BOX, true));
}

// The structure each merge is made of, for its tip.
const MERGE_NAMES = { vault: 'granary', chamber: 'fungus garden', honeypot: 'replete', herd: 'aphid' };

// What each merged structure does, for its tip: one line per "|".
const MERGE_TIPS = {
  vault: 'Needs a clear 24x21|space on a floor. Holds|10 seeds, each worth|20% more. Workers fill|it first, and fire ants|rob it first.',
  chamber: 'Needs a clear 24x24|space on any surface.|Grows on its own every|20 s and pays 5 seeds\'|worth. Fed (6 s apart),|it grows faster.',
  honeypot: 'Needs a clear 24x16|space under a ceiling.|Holds 200 crumbs, pays|1.2x a replete. 6 of the|10 workers come back.',
  herd: 'Needs a clear 24x24|space. Mealybugs make a|honeydew drop every 5 s,|200 food each. With 6|waiting, a worker takes|them all. Counts as 12|aphids for honeydew.'
};

function chooseBuildTool(next) {
  buildTool = next;
  for (const [button, name] of [[el.btnGranary, 'granary'], [el.btnNursery, 'nursery'], [el.btnCaterpillar, 'caterpillar'], [el.btnTrail, 'trail'], [el.btnMidden, 'midden'], [el.btnAphid, 'aphid'], [el.btnFungus, 'fungus'], [el.btnReplete, 'replete'], [el.btnDelete, 'delete']].concat(Object.keys(MERGES).map((kind) => [el.mergeButtons[kind], kind]))) {
    button.classList.toggle('is-on', buildTool === name);
    button.setAttribute('aria-pressed', String(buildTool === name));
  }
  if (screen === 'build') Field.setTool(buildTool);
  renderBuild();
}

function chooseTool(next) {
  tool = next;
  for (const key in el.toolButtons) {
    el.toolButtons[key].classList.toggle('is-on', key === tool);
    el.toolButtons[key].setAttribute('aria-pressed', String(key === tool));
  }
  if (screen === 'dig') Field.setTool(tool);
  render();
}

function chooseShape(next) {
  shape = next;
  for (const key in el.shapeButtons) {
    el.shapeButtons[key].classList.toggle('is-on', key === shape);
    el.shapeButtons[key].setAttribute('aria-pressed', String(key === shape));
  }
  Field.setShape(shape);
  render();
}

// The Line assist box in the Dig menu: straight drags, saved with the settings.
function setLineAssist(on) {
  state.settings.lineAssist = on;
  el.lineAssist.setAttribute('aria-checked', String(on));
  Field.setLineAssist(on);
}

function chooseSize(index) {
  sizeIndex = index;
  Field.setSize(TOOL_SIZES[sizeIndex]);
  render();
}

// Gray out a button and stipple its label when it can't be used right now.
function setButton(button, label, text, usable) {
  button.classList.toggle('is-off', !usable);
  button.setAttribute('aria-disabled', String(!usable));
  PixelFont.write(label, text, { faded: !usable });
}

/*
 * Renaming: click the name on the title bar, type, and press Enter (or
 * click anywhere else) to keep it. Escape puts the old name back.
 */
let typedName = null;   // the name being typed, or null when not renaming

function showName() {
  PixelFont.write(el.titleText, typedName !== null ? typedName : state.name);
  drawStars(el.titleStars, platinumStars());
  el.titleCaret.hidden = typedName === null;
  PixelFont.write(el.dialogTitle, state.name);
  document.title = state.name;
}

function startRenaming() {
  if (typedName !== null) return;
  hideTip();
  typedName = state.name;
  showName();
}

function stopRenaming(keep) {
  if (typedName === null) return;
  if (keep) {
    state.name = typedName.trim() || DEFAULT_NAME;
    save();
  }
  typedName = null;
  showName();
  if (keep && state.name.toLowerCase() === 'jason') jasonBonus();
}

/* Type JASON (or name the farm Jason): 500 food, once. */
const JASON = { word: 'jason', food: 500 };
// Type BRAYDENISDIDDY: three platinum stars (+100%), once, and only with no stars yet.
const STAR_CODE = { word: 'braydenisdiddy', stars: 3 };
let typedLetters = '';
// Type ANGELEE: a note for Angelee, and 40 honeydew (the honeydew once).
const ANGELEE = { word: 'angelee', honeydew: 40, ms: 6000 };
// Type ???!: a party block on the grass. When the ants finish it: a party.
const PARTY_CODE = { word: '???!' };

function angeleeNote() {
  const first = !state.angeleeUsed;
  if (first) {
    state.angeleeUsed = true;
    state.royal.jelly += ANGELEE.honeydew;
    save();
    render();
  }
  Field.popLove('I love you cutie \u2665', first ? '+' + ANGELEE.honeydew + ' Honeydew' : '', ANGELEE.ms);
  Sound.sfx('fanfare');
}

function partyCode() {
  Sound.unlock();   // (a key press lets the song play later)
  if (!Field.dropPartyBlock()) Field.popNote('The party block is out', 2500);
}

function starCode() {
  if (state.starCodeUsed || platinumStars() > 0) return;
  state.starCodeUsed = true;
  state.platinum.early = STAR_CODE.stars;
  if (state.early === 'pending') state.early = 'taken';   // (no early player offer on top)
  save();
  render();
  showMessage(['Code accepted!', STAR_CODE.stars + ' platinum stars:', '+' + PLATINUM.early[STAR_CODE.stars] + '% idle gathering', 'and honeydew.'], null, starsPicture(STAR_CODE.stars));
}

function jasonBonus() {
  if (state.jasonUsed) return;
  catchUp(Date.now());
  state.jasonUsed = true;
  state.food += JASON.food;
  save();
  render();
  showMessage(['Hi Jason!', '+' + JASON.food + ' Food']);
}

function typeName(event) {
  if (typedName === null) return;
  if (event.key === 'Enter') stopRenaming(true);
  else if (event.key === 'Escape') stopRenaming(false);
  else if (event.key === 'Backspace') typedName = typedName.slice(0, -1);
  else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) typedName = cleanName(typedName + event.key);
  else return;
  event.preventDefault();
  showName();
}

function render() {
  renderCanopy();
  const now = Date.now();
  showName();

  PixelFont.write(el.food, shortNumber(state.food, FOOD_BOX, false));
  el.foodHelp.dataset.tip = foodRateTip();
  if (tipTarget === el.foodHelp && !tip.hidden) showTip(el.foodHelp);   // keep it up to date while shown

  for (const type in ANT_TYPES) {
    const part = el.ant[type];
    if (part.count) PixelFont.write(part.count, shortNumber(state.ants[type], WIDE_BOX, false));
    // Shown when the mouse rests on the count: food from one ant, and from all of them.
    const each = foodPerSecond(type);
    const role = type === 'worker' ? 'Backbone of the|economy. Does tasks|to earn you food.|' : type === 'soldier' ? 'Fights raids and|makes some food on|the side.|' : '';
    part.readout.dataset.tip = role + (part.count ? '' : 'Fire ants: ' + shortNumber(state.ants[type], WIDE_BOX, false) + '|') +
      'Each ' + (ANT_TYPES[type].name || type) + ': ' + rateText(each) + ' food/s|' +
      'All ' + shortNumber(state.ants[type], WIDE_BOX, false) + ': ' + rateText(each * state.ants[type]) + ' food/s';
    const kind = ANT_TYPES[type];
    const full = antMax(type) && ownedAnts(type) >= antMax(type);
    PixelFont.write(part.cost, full ? 'MAX' : shortNumber(state.antCost[type], COST_BOX, true), { fit: costRoom(part.cost) });
    setButton(part.button, part.label, 'HATCH', canHatch(type));
    if (kind.needs) part.button.closest('.group').hidden = !antUnlocked(type);
  }
  FireNest.setEggs(state.fireEggs);
  const alates = state.alates || (state.alate ? 1 : 0);
  const alateFull = alates >= alatesMost();
  PixelFont.write(el.alateCount, String(alates));
  PixelFont.write(el.alateCost, alateFull ? 'MAX' : shortNumber(alateCost(), COST_BOX, true), { fit: costRoom(el.alateCost) });
  setButton(el.btnAlate, el.alateLabel, 'BUY', !alateFull && state.food >= alateCost());
  PixelFont.write(el.trophicCount, shortNumber(state.trophicEggs, WIDE_BOX, false));
  PixelFont.write(el.trophicCost, shortNumber(trophicCost(), COST_BOX, true), { fit: costRoom(el.trophicCost) });
  setButton(el.btnTrophic, el.trophicLabel, 'LAY', state.food >= trophicCost());
  el.trophicReadout.dataset.tip = 'Trophic Eggs|+' + TROPHIC.boost * 100 + '% steady food|each. Now: +' + Number((TROPHIC.boost * 100 * state.trophicEggs).toFixed(1)) + '%.|Lost on a flight.';
  Field.setTrophicEggs(state.trophicEggs);
  Field.setAlate(state.alate, state.alates || (state.alate ? 1 : 0));
  renderSatellite();
  renderAchievements();
  renderFlats();
  el.btnAlarm.hidden = !state.fireAntsSeen;
  el.lineAssist.setAttribute('aria-checked', String(state.settings.lineAssist));   // (also when another open copy changed it)
  Field.setLineAssist(state.settings.lineAssist);

  // The price box shows a whole square (or circle) of the chosen size, or,
  // while the mouse is over a spot the tool can use, the price of that spot.
  const size = TOOL_SIZES[sizeIndex];
  const cost = toolCost(tool, hoveredPixels > 0 ? hoveredPixels : Field.areaOf(size));
  PixelFont.write(el.toolCostLabel, tool === 'dig' ? 'Dig Cost' : 'Fill Cost');
  PixelFont.write(el.toolCost, cost === 0 && freeDigging() ? 'Free' : shortNumber(cost, WIDE_BOX, true));
  const buildCost = buildTool === 'delete' ? 0 : MERGES[buildTool] ? mergeCost(buildTool) : buildTool === 'replete' ? (state.ants.worker < 1 ? Infinity : repleteCost()) : buildTool === 'aphid' ? aphidCost() : buildTool === 'fungus' ? fungusCost() : buildTool === 'granary' ? granaryCost() : buildTool === 'nursery' ? nurseryCost() : toolCost(buildTool === 'midden' ? 'midden' : 'trail', hoveredPixels > 0 ? hoveredPixels : TRAIL_PIXELS);
  Field.setAffordable(state.food >= (screen === 'build' ? buildCost : cost));
  renderBuild();

  for (const key in UPGRADES) {
    const part = el.upgrade[key];
    const upgrade = UPGRADES[key];
    const level = state.upgrades[key];
    const maxed = level >= maxLevel(key);
    // One line, or two for upgrades that do two things: "now>next" on each.
    const now = [].concat(upgrade.show(upgrade.values[level]));
    const next = maxed ? null : [].concat(upgrade.show(upgrade.values[level + 1]));
    const line = (i) => (maxed ? now[i] : now[i] + '>' + next[i]);
    // Long numbers (the costly end levels) shrink to fit their box.
    const room = Math.max(0, part.value.parentElement.clientWidth - 6);
    PixelFont.write(part.value, line(0), { fit: room });
    if (part.value2) PixelFont.write(part.value2, line(1), { fit: room });
    // The price box beside BUY holds 6 letters: bigger prices are written short (1.0M, 250.0M).
    PixelFont.write(part.cost, maxed ? 'MAX' : shortNumber(upgradeCost(key, level), BUY_BOX, true), { fit: Math.max(0, part.cost.parentElement.clientWidth - 4) });
    setButton(part.button, part.label, 'BUY', canUpgrade(key));
  }

  renderTree();

  el.sfx.setAttribute('aria-checked', String(state.settings.sfxOn));
  el.peaceful.setAttribute('aria-checked', String(peaceful()));
  el.autoHatchGroup.hidden = perkLevel('autoHatch') === 0;
  el.autoHatch.setAttribute('aria-checked', String(state.settings.autoHatch));
  for (const key in el.volume) {
    const part = el.volume[key];
    if (part.slider.value !== String(state.settings[key])) part.slider.value = String(state.settings[key]);
    PixelFont.write(part.value, state.settings[key] + '%');
  }

  Field.setCrumbRules(fieldRules());
  Field.setHint(!state.crumbClicked);

  Field.setWanderers({
    worker: Math.max(0, walkersFor(state.ants.worker, 'worker') - state.missingShown.worker),   // (fewer, after the anteater, until more hatch)
    soldier: Math.max(0, walkersFor(state.ants.soldier) - state.missingShown.soldier),
    major: Math.min(state.ants.supermajor, 4),   // (at most 4 walk about)
    red: Math.min(state.ants.fireAnt, RULES.maxWalkers),  // fire ant workers: every one walks about (up to the most shown)
    majorShare: state.flats.major ? 0.5 : 0,             // Majors: half the soldiers are major soldiers (13 health)...
    crackers: state.flats.major ? 2 : 0,                 // ...and up to two of them at a time crack seeds
    doorhead: perkLevel('doorHead') > 0 ? 1 : 0           // Door-head soldiers: one extra soldier who plugs the nest hole in a raid
  });

  Field.setBrood(
    state.eggs
      .filter((egg) => egg.spot >= 0)
      .map((egg) => ({
        spot: egg.spot,
        type: egg.type,
        stage: egg.hatchAt - now > PUPA_MS ? 'egg' : 'pupa'
      }))
  );
}

/*
 * Name labels: when the mouse rests on an icon (anything with data-tip="...")
 * for TIP_DELAY milliseconds, a small box shows its name. It sits below the
 * icon, or above it when there's no room below.
 */
const TIP_DELAY = 200;
const tip = document.getElementById('tip');
let tipTimer = 0;
let tipTarget = null;   // what the tip is showing, so a live one (the food ?) can be refreshed

function showTip(target) {
  tipTarget = target;
  // One line of text per "|".
  tip.replaceChildren();
  for (let line of target.dataset.tip.split('|')) {
    const span = document.createElement('span');
    const origin = line.startsWith('~');   // where a honeydew upgrade came from: red, slanted
    span.className = origin ? 'px tip-origin' : 'px';
    let row = span;
    const front = [];   // what goes before the text (food ? box codes: see foodRateTip)
    if (line.startsWith('>')) {   // nested: a branch from the line above
      const branch = document.createElement('span');
      branch.className = 'tip-branch';
      front.push(branch);
      line = line.slice(1);
    }
    if (line.startsWith('@')) {   // "@key@": a picture
      const end = line.indexOf('@', 1);
      const [name, scale] = TIP_ICONS[line.slice(1, end)] || [];
      const box = document.createElement('span');
      box.className = 'tip-icon';
      if (name) {
        const picture = document.createElement('span');
        picture.dataset.sprite = name;
        picture.dataset.scale = String(scale);
        box.appendChild(picture);
        Sprites.fillAll(box);
      }
      front.push(box);
      line = line.slice(end + 1);
    }
    if (line.startsWith('^')) {   // "^#color^": a square of the color (the graph's key)
      const end = line.indexOf('^', 1);
      const square = document.createElement('span');
      square.className = 'tip-swatch';
      square.style.background = line.slice(1, end);
      front.push(square);
      line = line.slice(end + 1);
    }
    if (front.length > 0) {
      row = document.createElement('span');
      row.className = 'tip-key';
      row.append(...front, span);
    }
    tip.appendChild(row);
    PixelFont.write(span, origin ? line.slice(1) : line);
  }
  if (target === el.foodHelp) {   // the food ? box: the graph under the text
    const graph = document.createElement('canvas');
    graph.className = 'tip-graph';
    drawFoodGraph(graph);
    const scale = document.createElement('span');
    scale.className = 'px';
    tip.appendChild(graph);
    if (graph.dataset.top) {
      tip.appendChild(scale);
      PixelFont.write(scale, 'Past 2 min. Top: ' + graph.dataset.top + '/s');
    }
  }
  tip.hidden = false;
  const icon = target.getBoundingClientRect();
  const box = tip.getBoundingClientRect();
  const gap = 4;
  let left = Math.min(icon.left, window.innerWidth - box.width - 2);
  let top = icon.bottom + gap;
  if (top + box.height > window.innerHeight - 2) top = icon.top - gap - box.height;
  tip.style.left = Math.max(2, Math.round(left)) + 'px';
  tip.style.top = Math.max(2, Math.round(top)) + 'px';
}

function hideTip() {
  clearTimeout(tipTimer);
  tip.hidden = true;
  tipTarget = null;
}

// A title (a .label) shows the tip of the box it names: the next thing
// under it with a tip (the Workers title shows the worker count's tip).
for (const label of document.querySelectorAll('.label')) {
  const next = label.nextElementSibling;
  const target = next && (next.hasAttribute('data-tip') ? next : next.querySelector('[data-tip]'));
  if (!target || label.hasAttribute('data-tip') || label.closest('[data-tip]')) continue;
  label.classList.add('has-tip');
  label.addEventListener('mouseenter', () => {
    clearTimeout(tipTimer);
    if (target.hasAttribute('data-tip-now')) showTip(target);
    else tipTimer = setTimeout(() => showTip(target), TIP_DELAY);
  });
  label.addEventListener('mouseleave', hideTip);
  label.addEventListener('mousedown', hideTip);
}

for (const target of document.querySelectorAll('[data-tip], .perk')) {
  target.addEventListener('mouseenter', () => {
    clearTimeout(tipTimer);
    // data-tip-now: shown at once (the food ?), not after the usual wait.
    if (target.hasAttribute('data-tip-now')) showTip(target);
    else tipTimer = setTimeout(() => showTip(target), TIP_DELAY);
  });
  target.addEventListener('mouseleave', hideTip);
  target.addEventListener('mousedown', hideTip);
}

/*
 * A small message window in front of the game: the first line, then the
 * rest. Any click or key closes it.
 */
let messageDone = null;   // called when the message is closed with OK, if set
let messageLater = null;  // LATER button action, if the message has one
let messageCancel = null; // CANCEL button action, if the message has one

// A message with OK and CANCEL: `yes` runs only on OK. `labels` can name
// the two buttons something else, like ['YES', 'NO'].
// `later`, if given, adds a third button, LATER, that runs it.
function showConfirm(lines, yes, labels, later, no, picture) {
  showMessage(lines, yes, picture);
  messageCancel = no || null;
  el.noRoomCancel.hidden = false;
  if (labels) setDialogLabels(labels[0], labels[1]);
  if (later) {
    messageLater = later;
    el.noRoomLater.hidden = false;
  }
}

// The words on the message's two buttons.
function setDialogLabels(ok, cancel) {
  PixelFont.write(el.noRoomOk.querySelector('.px'), ok);
  PixelFont.write(el.noRoomCancel.querySelector('.px'), cancel);
  el.noRoomOk.setAttribute('aria-label', ok);
  el.noRoomCancel.setAttribute('aria-label', cancel);
}

// `picture`, if given, is drawn under the lines: a canvas.
function showMessage(lines, done, picture) {
  hideTip();
  el.noRoomCancel.hidden = true;
  el.noRoomLater.hidden = true;
  messageLater = null;
  messageCancel = null;
  setDialogLabels('OK', 'CANCEL');
  messageDone = done || null;
  el.dialogLines.replaceChildren();
  for (const line of lines) {
    const span = document.createElement('span');
    span.className = 'px' + (line && line.red ? ' is-red' : '');   // { red: 'text' }: a line in red
    el.dialogLines.appendChild(span);
    PixelFont.write(span, line && line.red ? line.red : line);
  }
  if (picture) el.dialogLines.appendChild(picture);
  el.noRoom.hidden = false;
  el.noRoomOk.focus();
}

function showNoRoom() {
  showMessage(['Not enough room!', 'Dig a larger area', 'for the ants to live']);
}

function hideNoRoom() {
  el.noRoom.hidden = true;
  const done = messageDone;
  messageDone = null;
  if (done) done();
}

function cancelMessage() {
  const no = messageCancel;
  messageDone = null;
  messageLater = null;
  messageCancel = null;
  el.noRoom.hidden = true;
  if (no) no();
}

/*
 * First-run tutorial. A new game (or one after RESET) asks "30-second
 * tutorial?". YES steps through TUTORIAL, each step pointing at a button
 * with a blinking frame. Either answer is saved, so it is only asked once.
 */
const TUTORIAL = [
  { target: 'btn-ants', lines: ['Ants', 'Your colony is Messor', 'barbarus, a harvester', 'ant. Spend food to', 'hatch workers and', 'soldiers. They bring', 'in food.'] },
  { target: 'btn-upgrade', lines: ['Upgrades', 'Spend food to make', 'your colony faster.', 'They reset on a', 'nuptial flight.'] },
  { target: 'btn-build', lines: ['Granaries', 'Build a granary with', 'the hammer. Workers', 'store seeds in it,', 'and each one turns', 'into extra food.', 'Get 10 of a building', 'to merge them into', 'one big one.'] },
  { target: 'btn-flight', lines: ['Honeydew', 'Harvested food earns', 'honeydew. Take a', 'nuptial flight to', 'start over with', 'lasting perks.'] },
  { target: 'btn-float', lines: ['Pop Out', 'Click here to open', 'the game in its own', 'window. It stays on', 'top as you browse.'] },
  { target: 'btn-ency', lines: ['That\'s it!', 'You unlock more', 'features as you go.', 'Confused? Read Help', 'in the book.'] }
];
let tutorialStep = -1;   // -1: asking; then the step shown
let tutorialSteps = TUTORIAL;   // the tutorial being shown: TUTORIAL or FLIGHT_TUTORIAL

// The first time the Nuptial Flight menu opens: a short tutorial that can't
// be skipped (unless C was pressed).
const FLIGHT_TUTORIAL = [
  { target: 'jelly-box', lines: ['Honeydew', 'Food your colony brings', 'in this run fills the bar', 'and earns honeydew.'] },
  { target: 'btn-fly', lines: ['Fly', 'With an alate, FLY starts', 'a new colony and turns', 'this run into honeydew.'] },
  { target: 'tree', lines: ['Honeydew upgrades', 'Spend honeydew here.', 'They last through every', 'flight. Rest the mouse', 'on one to see it.'] }
];

// The first time up in the canopy: a short tutorial.
const WEAVER_TUTORIAL = [
  { target: 'readout-weaver-food', lines: ['Weaver Ants', 'Up in the tree, weaver', 'ants gather their own', 'food. More workers,', 'more food.'] },
  { target: 'btn-weaver-ant', lines: ['Weaver Workers', 'Hatch them with', 'weaver food.'] },
  { target: 'btn-weaver-leaf', lines: ['Leaves', 'Place leaves touching', 'a branch or a leaf.', 'Workers climb them', 'only on a slant: build', 'stairs up to the next', 'branch. Higher leaves', 'cost more.'] },
  { target: 'weaver-branch-label', lines: ['Branches', 'Each new branch you', 'reach adds to all', 'your food, and does', 'something new.'] },
  { target: 'btn-canopy-down', lines: ['Back Down', 'This arrow takes you', 'back to the nest. The', 'arrow on the left', 'brings you up again.'] }
];

function startWeaverTutorial() {
  hideTip();
  tutorialSteps = WEAVER_TUTORIAL;
  tutorialStep = -1;
  el.tut.hidden = false;
  nextTutorialStep();
}

function startFlightTutorial() {
  hideTip();
  tutorialSteps = FLIGHT_TUTORIAL;
  tutorialStep = -1;
  el.tut.hidden = false;
  nextTutorialStep();
}

// Each line is a string, or { text, className } for a styled line.
function writeLines(box, lines) {
  box.replaceChildren();
  for (const line of lines) {
    const span = document.createElement('span');
    span.className = 'px' + (line.className ? ' ' + line.className : '');
    box.appendChild(span);
    PixelFont.write(span, line.text || line);
  }
}

// Put a window in the middle of the field, clear of the buttons the tutorial points at.
function placeOverField(element) {
  const field = document.querySelector('.field').getBoundingClientRect();
  const box = element.getBoundingClientRect();
  const left = box.width <= field.width ? field.left + (field.width - box.width) / 2 : (window.innerWidth - box.width) / 2;
  element.style.left = Math.max(2, Math.round(left)) + 'px';
  element.style.top = Math.max(2, Math.round(field.top + (field.height - box.height) / 2)) + 'px';
}

function placeTutorial() {
  placeOverField(el.tutBox);
}

/*
 * Welcome Back: after the game was closed for RULES.welcomeAfterMs or more,
 * a window says how long it was away and what the colony did meanwhile.
 * catchUp() leaves the report in awayReport; tick() shows it.
 */
let awayReport = null;

// A length of time written short: 7m, 3h 20m, 2d 5h.
function durationText(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h' + (minutes % 60 ? ' ' + (minutes % 60) + 'm' : '');
  const days = Math.floor(hours / 24);
  return days + 'd' + (hours % 24 ? ' ' + (hours % 24) + 'h' : '');
}

function welcomeLines(report) {
  const lines = ['Welcome back!', 'You were away ' + durationText(report.ms) + '.'];
  if (report.away.minutes === 0) {
    lines.push(report.satellite > 0 ? 'Your workers earned none.' : 'No food was earned.', 'Buy the Away upgrade', 'to earn food while', 'the game is closed.');
  } else {
    lines.push('Your ants gathered', shortNumber(report.food, 12, false) + ' food.');
    if (report.ms > report.away.minutes * 60000) lines.push('Food counts for the', 'first ' + minutesText(report.away.minutes) + ' away.');
  }
  if (report.structures > 0) lines.push('Granaries, gardens and', 'aphids made ' + shortNumber(report.structures, 12, false) + ' food.');
  if (report.satellite > 0) lines.push(satOwned(SATS[1]) ? 'Your satellite colonies' : 'Your satellite colony', 'made ' + shortNumber(report.satellite, 12, false) + ' food.');
  if (report.hatched > 0) lines.push(report.hatched + (report.hatched === 1 ? ' egg' : ' eggs') + ' hatched.');
  return lines;
}

// Show the waiting report, unless the tutorial is up.
function showWelcome() {
  if (!awayReport || !el.welcome.hidden || !el.tut.hidden) return;
  hideTip();
  writeLines(el.welcomeLines, welcomeLines(awayReport));
  awayReport = null;
  el.welcome.hidden = false;
  Sound.sfx('welcome');
  placeOverField(el.welcomeBox);
  el.welcomeOk.focus();
}

function closeWelcome() {
  el.welcome.hidden = true;
}

function pointAt(id) {
  for (const button of document.querySelectorAll('.tut-point')) button.classList.remove('tut-point');
  if (id) document.getElementById(id).classList.add('tut-point');
}

function askTutorial() {
  hideTip();
  showScreen('main');
  tutorialStep = -1;
  writeLines(el.tutLines, ['30-second tutorial?']);
  PixelFont.write(el.tutYesLabel, 'YES');
  el.tutNo.hidden = false;
  el.tut.hidden = false;
  placeTutorial();
  el.tutYes.focus();
}

function nextTutorialStep() {
  tutorialStep++;
  // Skip a step whose button isn't there (no Pop Out inside the floating window).
  while (tutorialStep < tutorialSteps.length && document.getElementById(tutorialSteps[tutorialStep].target).hidden) tutorialStep++;
  if (tutorialStep >= tutorialSteps.length) {
    endTutorial();
    return;
  }
  const step = tutorialSteps[tutorialStep];
  writeLines(el.tutLines, step.lines);
  PixelFont.write(el.tutYesLabel, tutorialStep === tutorialSteps.length - 1 ? 'OK' : 'NEXT');
  el.tutNo.hidden = true;
  pointAt(step.target);
  placeTutorial();
  el.tutYes.focus();
}

function endTutorial() {
  pointAt(null);
  el.tut.hidden = true;
  tutorialStep = -1;
  if (tutorialSteps === FLIGHT_TUTORIAL) state.flightTutorialDone = true;
  else if (tutorialSteps === WEAVER_TUTORIAL) state.weaver.tutorialDone = true;
  else state.tutorialAsked = true;
  tutorialSteps = TUTORIAL;
  save();
}

function showZoom(zoom, maxZoom) {
  setButton(el.zoomIn, el.zoomInLabel, '+', zoom < maxZoom);
  setButton(el.zoomOut, el.zoomOutLabel, '-', zoom > 1);
}

// Saves often enough that when the game is open in two places, neither
// copy mistakes the other's last save for time the game was closed.
const HEARTBEAT_MS = 2000;

let hatchedSeen = -1;   // eggs hatched so far, for the hatch sound
function tick() {
  const now = Date.now();
  if (hatchedSeen >= 0 && state.stats.hatched > hatchedSeen) Sound.sfx('hatch');
  hatchedSeen = state.stats.hatched;
  // The game stands still while the new queen flies off: no food, hatching,
  // satellite food or raid countdown for that time.
  if (Field.flying()) {
    const gap = Math.max(0, now - state.lastTick);
    state.lastTick = now;
    lastRaidTick = now;
    for (const egg of state.eggs.concat(state.fireEggs)) egg.hatchAt += gap;
    for (const sat of SATS) if (Number.isFinite(state[sat.key].lastAt)) state[sat.key].lastAt = now;
    return;
  }
  if (catchUp(now) || now - savedAt > HEARTBEAT_MS) save();
  // Each part on its own, so a mistake in one (drawing a menu, say) never
  // stops the others: scouts still come home, raids still come.
  safely(render);
  safely(showWelcome);
  safely(notePeacefulHarvest);
  safely(() => raidCountdown(now));
  safely(() => marauderCountdown(now));
  safely(() => beetleCountdown(now));
  safely(() => anteaterCountdown(now));
  safely(() => scoutTick(now));
  safely(() => seasonTick(now));
  safely(() => idleCheck(now));
  safely(() => Sound.music(screen === 'canopy' ? 'weaver' : Field.anteaterHere() || Field.raiders() > 0 || Field.invaders() > 0 || Field.marauders() > 0 ? 'fire' : isRaining() ? 'rain' : isWinter() ? 'winter' : 'main'));   // (up in the trees, then a raid, then the weather, then the nest)
  safely(invasionCheck);
  safely(watchRaid);
  safely(() => { if (checkAchievements()) save(); });
  safely(() => measureTick(now));
  safely(autoHatchTick);
  safely(() => weaverTick(Date.now()));
  safely(() => historyTick(now));
  safely(surfaceCheck);
  safely(() => middenSteady(now));
}

// Digging the top row of dirt (not the nest hole) means fewer seeds
// (field.js). Said once: the first time it is dug, or on opening a game that
// already has some dug.
function surfaceCheck() {
  if (state.surfaceWarned || Field.surfaceDug() <= 0) return;
  if (!el.noRoom.hidden || !el.tut.hidden || !el.welcome.hidden) return;   // after whatever is showing
  state.surfaceWarned = true;
  save();
  const dug = Math.max(1, Math.round(100 * Field.surfaceDug()));
  showMessage(['Careful: the surface!', 'Seeds fall on the grass,', 'and every hole dug in the', 'surface means fewer of', 'them. ' + dug + '% of it is dug,', 'so ' + dug + '% fewer seeds.', 'Fill the holes to get', 'them all back.']);
}

// The ants' and satellites' steady food fills the midden too, while the game is open.
let lastMiddenAt = 0;
function middenSteady(now) {
  const passed = lastMiddenAt ? Math.min(Math.max(0, now - lastMiddenAt), 5000) : 0;
  lastMiddenAt = now;
  if (idle || !middenUnlocked()) return;
  const steady = steadyRates();
  Field.feedMiddens(MIDDEN.harvestShare * (steady.ants + steady.satellite) / Math.max(1, colonyFoodRate()) * passed / 1000);
}

// Run one part of the tick; an error is logged, and the rest carries on.
function safely(part) {
  try {
    part();
  } catch (error) {
    console.error(error);
  }
}

/* ---------- Idle: open but ignored ---------- */

// After afterMs with no click or key press in the game, the colony earns
// only the Away percent (nothing with no Away level), as if the game were
// closed, and a red box says so. The next click (or key) brings back full
// speed and does nothing else.
const IDLE = { afterMs: 20 * 60000 };
let idle = false;
let lastInputAt = Date.now();
let idleCarry = 0;   // the fraction of food left over by the cut, kept for next time

// Food kept of `amount` while idle.
function idleKeep(amount) {
  const away = upgradeValue('away');
  const share = away.minutes > 0 ? away.percent / 100 : 0;
  const total = amount * share + idleCarry;
  const kept = Math.floor(total);
  idleCarry = total - kept;
  return kept;
}

function idleCheck(now) {
  if (autoclicked && now - lastClickAt >= AUTOCLICK.stopMs) return endAutoclick();   // the clicking stopped
  if (idle || now - lastInputAt < IDLE.afterMs) return;
  idle = true;
  idleCarry = 0;
  el.idleBox.hidden = false;
}

/*
 * Autoclickers: a person never clicks at exactly the same gap over and
 * over. When the last AUTOCLICK.clicks clicks all came within
 * AUTOCLICK.spreadMs of the same gap, the colony goes to Away rates (as
 * when idle) and clicks do nothing, until the mouse moves AUTOCLICK.moveCss
 * screen pixels or no click comes for AUTOCLICK.stopMs.
 */
const AUTOCLICK = { clicks: 30, spreadMs: 10, stopMs: 2000, moveCss: 30 };
let clickTimes = [];      // the last clicks' times (event.timeStamp)
let lastClickAt = 0;
let autoclicked = false;
let moved = 0;            // screen pixels the mouse has moved since then
let lastMouse = null;

function noteClick(event) {
  lastClickAt = Date.now();
  clickTimes.push(event.timeStamp);
  if (clickTimes.length > AUTOCLICK.clicks + 1) clickTimes.shift();
  if (clickTimes.length <= AUTOCLICK.clicks) return false;
  let shortest = Infinity, longest = 0;
  for (let n = 1; n < clickTimes.length; n++) {
    const gap = clickTimes[n] - clickTimes[n - 1];
    shortest = Math.min(shortest, gap);
    longest = Math.max(longest, gap);
  }
  return longest - shortest <= AUTOCLICK.spreadMs;
}

function startAutoclick() {
  catchUp(Date.now());
  autoclicked = true;
  idle = true;
  idleCarry = 0;
  moved = 0;
  lastMouse = null;
  hideTip();
  el.autoclickBox.hidden = false;
}

function endAutoclick() {
  catchUp(Date.now());   // food up to now at the Away rate
  autoclicked = false;
  idle = false;
  clickTimes = [];
  lastInputAt = Date.now();
  el.autoclickBox.hidden = true;
  save();
  render();
}

window.addEventListener('mousemove', (event) => {
  if (!autoclicked) return;
  if (lastMouse) moved += Math.hypot(event.screenX - lastMouse.x, event.screenY - lastMouse.y);
  lastMouse = { x: event.screenX, y: event.screenY };
  if (moved >= AUTOCLICK.moveCss) endAutoclick();
}, true);

// Any click or key press counts. While idle it only wakes the game up.
function noteInput(event) {
  if (event.type === 'mousedown') {
    const caught = noteClick(event);
    if (caught && !autoclicked) startAutoclick();
    if (autoclicked) {   // clicks do nothing until the mouse moves or the clicking stops
      event.preventDefault();
      event.stopPropagation();
      const block = (e) => { e.preventDefault(); e.stopPropagation(); };
      window.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', block, true), 1000);
      return;
    }
  }
  lastInputAt = Date.now();
  if (!idle) return;
  catchUp(lastInputAt);   // food up to now at the idle rate
  idle = false;
  el.idleBox.hidden = true;
  if (event.type === 'mousedown') {
    event.preventDefault();
    event.stopPropagation();
    // ...and the click that follows this press does nothing either.
    const block = (e) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('click', block, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', block, true), 1000);
  } else {
    event.preventDefault();
    event.stopPropagation();
  }
  save();
  render();
}
window.addEventListener('mousedown', noteInput, true);
window.addEventListener('keydown', noteInput, true);
window.addEventListener('wheel', () => { if (!idle) lastInputAt = Date.now(); }, { capture: true, passive: true });

/* ---------- Scouting ----------
 * Every few minutes the game is open (with at least minWorkers workers),
 * scouts find something beyond the edge of the screen: a dead insect or a
 * spill of seeds. A pulsing button shows at that edge of the grass for
 * lastsMs. Click it to choose how many workers to send. The find is worth
 * about valueSeconds of the colony's food; it takes `need` ants to bring
 * all of it back, so a smaller party brings back that share. The party is
 * gone for tripMs (less with Step counting, Athleticism and Minor workers,
 * which count half here):
 * meanwhile they earn nothing and do no work. One party at a time. */
const SCOUT = {
  everyMinMs: 3 * 60000, everyMaxMs: 6 * 60000,   // open-game time between finds
  lastsMs: 60000,          // how long a find waits to be claimed
  tripMs: 45000,           // a trip, at normal walking speed
  valueSeconds: 180,       // a find is worth this many seconds of the colony's food...
  minValue: 100,           // ...and at least this much
  needMin: 8, needMax: 30, // ants needed to carry it all
  minWorkers: 10,          // scouting starts once you have this many workers
  shares: [0.25, 0.5, 0.75]   // party sizes offered: these shares of your workers
};
let lastScoutTick = 0;

// How much faster than normal the scouts walk: Step counting, Athleticism,
// Minor workers. A scouting trip gets only SCOUT_SPEED_SHARE of their speed-up
// (half: 2x faster ants make the trip 1.5x faster).
const SCOUT_SPEED_SHARE = 0.5;
function scoutSpeed() {
  const speed = (1 + 0.25 * perkLevel('stepCounting')) * ATHLETICS[upgradeValue('work').athletics].speed * (state.flats.minor ? 1.3 : 1);
  return 1 + (speed - 1) * SCOUT_SPEED_SHARE;
}

// The colony's food a second, steady and brought in (for what a find is worth).
function colonyFoodRate() {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return sum(steadyRates()) + (measured ? sum(measured) : 0);
}

function scoutTick(now) {
  // Scouts coming home.
  if (state.scouts && now >= state.scouts.backAt) {
    const party = state.scouts;
    state.scouts = null;
    state.ants.worker += party.count;
    // Seen coming home with the find (a third of them, as when they left),
    // unless they got back while the game was closed.
    if (party.side && now - party.backAt < 5000) Field.returnScouts(Math.max(1, Math.round(party.count / 3)), party.side, party.kind);
    Field.popAtEntrance('Scouts +' + shortNumber(party.food, 12, false) + ' Food');
    gainFood(party.food, 'scout');
  }
  // A find waiting too long is gone.
  if (state.scoutFind && now >= state.scoutFind.until) state.scoutFind = null;
  // Counting down to the next find (only while open, like raids).
  const passed = lastScoutTick ? Math.min(Math.max(0, now - lastScoutTick), 5000) : 0;
  lastScoutTick = now;
  if (!Number.isFinite(state.scoutIn)) state.scoutIn = SCOUT.everyMinMs + Math.random() * (SCOUT.everyMaxMs - SCOUT.everyMinMs);
  if (peaceful()) return;   // (Peaceful mode: no new finds, the countdown waits)
  if (state.ants.worker + (state.scouts ? state.scouts.count : 0) >= SCOUT.minWorkers) state.scoutIn -= passed;
  if (state.scoutIn <= 0 && !state.scoutFind && !state.scouts && !isWinter()) {   // (no finds in winter)
    state.scoutIn = SCOUT.everyMinMs + Math.random() * (SCOUT.everyMaxMs - SCOUT.everyMinMs);
    state.scoutFind = {
      kind: Math.random() < 0.5 ? 'insect' : 'seeds',
      side: Math.random() < 0.5 ? 'left' : 'right',
      value: Math.max(SCOUT.minValue, Math.round(colonyFoodRate() * SCOUT.valueSeconds)),
      need: SCOUT.needMin + Math.floor(Math.random() * (SCOUT.needMax - SCOUT.needMin + 1)),
      until: now + SCOUT.lastsMs
    };
    Sound.sfx('skitter');
    save();
  }
  showScouting(now);
}

function showScouting(now) {
  const find = state.scoutFind;
  el.scoutFind.hidden = !find;
  if (find) {
    el.scoutFind.classList.toggle('on-left', find.side === 'left');
    el.scoutFind.classList.toggle('on-right', find.side !== 'left');
    const sprite = el.scoutFind.querySelector('[data-sprite]');
    const name = find.kind === 'insect' ? 'scoutInsect' : 'scoutSeeds';
    if (sprite.dataset.sprite !== name) {
      sprite.dataset.sprite = name;
      Sprites.fillAll(el.scoutFind);
    }
    el.scoutFind.dataset.tip = 'Scouts found ' + (find.kind === 'insect' ? 'a|dead insect' : 'a|seed spill') + '! Click to|send workers. Gone in|' + Math.ceil((find.until - now) / 1000) + 's.';
  }
  el.scoutStatus.hidden = !state.scouts;
  if (state.scouts) {
    PixelFont.write(el.scoutStatusText, state.scouts.count + ' scouts: ' + Math.max(0, Math.ceil((state.scouts.backAt - now) / 1000)) + 's', { small: true });
  }
}

// Click the find: choose how many workers to send.
function openScoutFind() {
  const find = state.scoutFind;
  if (!find || state.scouts) return;
  const workers = state.ants.worker;
  const sizes = [...new Set(SCOUT.shares.map((share) => Math.max(1, Math.round(workers * share))))].filter((n) => n <= workers);
  showMessage(['Scouts found a', (find.kind === 'insect' ? 'dead insect!' : 'seed spill!'),
    'Worth up to ' + shortNumber(find.value, 12, false) + ' food.', 'It takes ' + find.need + ' ants to', 'bring it all back.', 'Send how many?']);
  setDialogLabels('NO', 'CANCEL');
  const row = document.createElement('div');
  row.className = 'dialog-choices';
  for (const n of sizes) {
    const button = document.createElement('button');
    button.className = 'btn';
    button.setAttribute('aria-label', 'Send ' + n);
    const label = document.createElement('span');
    label.className = 'px';
    button.appendChild(label);
    PixelFont.write(label, String(n));
    button.addEventListener('click', () => sendScouts(n));
    row.appendChild(button);
  }
  el.dialogLines.appendChild(row);
}

function sendScouts(count) {
  const find = state.scoutFind;
  if (!find || state.scouts) return;
  catchUp(Date.now());
  count = Math.min(count, state.ants.worker);
  if (count < 1) return;
  state.ants.worker -= count;
  Field.sendScouts(Math.max(1, Math.round(count / 3)), find.side);   // a third of them seen walking off that way
  state.scouts = {
    count,
    side: find.side,   // (they come home the way they went)
    kind: find.kind,
    backAt: Date.now() + SCOUT.tripMs / scoutSpeed(),
    food: Math.round(find.value * Math.min(1, count / find.need))
  };
  state.scoutFind = null;
  save();
  render();
  showScouting(Date.now());
}

/* ---------- Peaceful mode (Settings) ----------
 * While it is on, nothing new happens to the colony: the year stands still
 * (summer weather: no winter, no rain), and the countdowns to fire ant and
 * army ant raids, the anteater, rove beetles, falling fruit and scout finds
 * all wait. Whatever is already under way (a raid on the field, say) runs its
 * course. Turned off, every countdown carries on from where it stopped.
 * Food harvested while it is on gives PEACEFUL.cut less honeydew (see
 * peacefulShare). Turning it on asks first. */
const PEACEFUL = { cut: 0.2 };
function peaceful() {
  return state.settings.peaceful === true;
}
// The food harvested while Peaceful mode is on is counted apart
// (state.peacefulHarvested), and a flight's honeydew is cut by PEACEFUL.cut
// of that share: a whole run in Peaceful mode gives 20% less even if it is
// turned off just before the flight, and turning it on just before gives
// nothing less. Each tick adds what `harvested` grew by since the last.
let harvestSeen = null;   // state.harvested at the last look
function notePeacefulHarvest() {
  if (harvestSeen === null || state.harvested < harvestSeen) {   // (just opened, or a new run)
    harvestSeen = state.harvested;
    return;
  }
  const grew = state.harvested - harvestSeen;
  harvestSeen = state.harvested;
  if (grew > 0 && peaceful()) state.peacefulHarvested = Math.min(state.harvested, (state.peacefulHarvested || 0) + grew);
}
// What a flight keeps: 1, down to 1 - PEACEFUL.cut for a run all in Peaceful mode.
function peacefulShare() {
  if (!(state.harvested > 0)) return 1;
  return 1 - PEACEFUL.cut * Math.min(1, (state.peacefulHarvested || 0) / state.harvested);
}
function setPeaceful(on) {
  notePeacefulHarvest();   // (what came in before the switch counts as it was)
  state.settings.peaceful = on;
  Field.setCrumbRules(fieldRules());
  save();
  render();
  Field.popAtEntrance(on ? 'Peaceful mode on' : 'Peaceful mode off');
}
function pressPeaceful() {
  if (peaceful()) { setPeaceful(false); return; }
  showConfirm(['Peaceful mode?', 'Winter, rain, raids,', 'the anteater, rove', 'beetles, fruit and', 'scouts all wait while', 'it is on. Food brought', 'in while it is on gives', '20% less honeydew.', 'Turn it off any time', 'in Settings.'], () => setPeaceful(true), ['ON', 'CANCEL']);
}

/* ---------- Seasons ----------
 * After SEASON.unlockFlights nuptial flights the year turns: summer for
 * summerMs, then winter for winterMs. Summer counts only while the game is
 * open (like raids); winter also goes on while it is closed, 3x slower. Summer is the usual game, with one rain shower somewhere in
 * it (ants on the grass hurry home, crumbs and seeds on the grass wash
 * away, and nobody goes out until it stops). In the last duskMs of summer
 * the sky darkens, and brightens over dawnMs after winter. No fire ant
 * raids come in winter (the countdown waits). In winter no crumbs or seeds come and workers don't go
 * out, but every seed eaten gives winterSeeds times the food. The seed
 * setting in the Build menu (EAT or STORE) lets the colony keep seeds on
 * its tunnel floors through summer to eat in winter. */
const SEASON = {
  unlockFlights: 3,
  summerMs: 20 * 60000,
  winterMs: 5 * 60000,
  duskMs: 3 * 60000,          // the sky darkens over the last 3 minutes of summer...
  dawnMs: 2 * 60000,          // ...and brightens again over the first 2 minutes after winter
  warnMs: 2 * 60000,          // a snowflake with ! for the last 2 minutes of summer
  rainMs: 45000,
  rainEarliest: 3 * 60000, rainLatest: 16 * 60000,   // when in summer the rain comes
  winterSeeds: 4, diapauseSeeds: 6,
  awayWinterShare: 1 / 3      // winter goes on while the game is closed, 3x slower (summer waits)
};
let lastSeasonTick = 0;
let honeypotOwed = 0;   // Honeypot reserves: food not yet paid out

function readSeason(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const year = SEASON.summerMs + SEASON.winterMs;
  return {
    t: Number.isFinite(s.t) ? Math.min(Math.max(s.t, 0), year - 1) : 0,
    year: Number.isInteger(s.year) ? s.year : 0,
    rainAt: Number.isFinite(s.rainAt) ? s.rainAt : null,
    rained: s.rained === true,
    rainUntil: Number.isFinite(s.rainUntil) ? s.rainUntil : 0,
    introSeen: s.introSeen === true,
    winterSeen: s.winterSeen === true,
    forced: s.forced === true   // started early by the W dev key
  };
}

function seasonsOn() {
  return state.flights >= SEASON.unlockFlights || state.season.forced === true;
}
function isWinter() {
  return seasonsOn() && !peaceful() && state.season.t >= SEASON.summerMs;
}
function isRaining() {
  return seasonsOn() && !peaceful() && !isWinter() && state.season.t < state.season.rainUntil;
}
// How dark the sky is, 0 to 1 (winter: 1).
function duskShare() {
  if (!seasonsOn() || peaceful()) return 0;
  const t = state.season.t;
  if (t >= SEASON.summerMs) return 1;
  if (t > SEASON.summerMs - SEASON.duskMs) return (t - (SEASON.summerMs - SEASON.duskMs)) / SEASON.duskMs;
  if (state.season.year > 0 && t < SEASON.dawnMs) return 1 - t / SEASON.dawnMs;
  return 0;
}

function seasonTick(now) {
  const passed = lastSeasonTick ? Math.min(Math.max(0, now - lastSeasonTick), 5000) : 0;
  lastSeasonTick = now;
  showSeason();
  if (!seasonsOn()) return;
  const season = state.season;
  const dialogFree = el.noRoom.hidden && el.tut.hidden && el.welcome.hidden;
  if (!season.introSeen) {
    if (!dialogFree) return;   // the clock starts once this is read
    season.introSeen = true;
    save();
    showMessage(['Seasons have begun!', 'Save up seeds in', 'summer. They are', 'worth much more', 'in winter.', 'Set seeds to STORE', 'in the Build menu.']);
    return;
  }
  if (peaceful()) return;   // Peaceful mode: the year stands still (summer weather) until it is turned off
  const wasWinter = isWinter();
  const year = SEASON.summerMs + SEASON.winterMs;
  season.t += passed;
  if (season.t >= year) {
    season.t -= year;
    season.year += 1;
    season.rained = false;
    season.rainAt = null;
    season.rainUntil = 0;
  }
  if (season.rainAt === null) season.rainAt = SEASON.rainEarliest + Math.random() * (SEASON.rainLatest - SEASON.rainEarliest);
  // The summer shower.
  if (!season.rained && season.t >= season.rainAt && season.t < SEASON.summerMs - SEASON.rainMs) {
    season.rained = true;
    season.rainUntil = season.t + SEASON.rainMs;
    Field.rainWash();
    Field.popAtEntrance('Rain!');
    Sound.sfx('alarm');
  }
  // Winter and summer arriving.
  if (isWinter() !== wasWinter) {
    if (isWinter()) {
      Field.popAtEntrance('Winter: seeds give ' + (perkLevel('diapause') > 0 ? SEASON.diapauseSeeds : SEASON.winterSeeds) + 'x');
      Sound.sfx('welcome');
      if (!season.winterSeen && dialogFree) {
        season.winterSeen = true;
        showMessage(['Winter is here!', 'Set seeds to EAT in', 'the Build menu. Workers', 'carry stored seeds to', 'granaries, where they', 'are worth ' + (perkLevel('diapause') > 0 ? SEASON.diapauseSeeds : SEASON.winterSeeds) + 'x now.']);
      }
    } else {
      Field.popAtEntrance('Summer: crumbs are back');
    }
    save();
  }
  // Honeypot reserves (perk page II): in winter each replete pays a full
  // load every honeypotEveryS seconds, as steady food.
  if (isWinter() && perkLevel('honeypotReserves') > 0 && Field.repleteCount() > 0) {
    const rules = fieldRules();
    const full = 20 * rules.repletePays * rules.repleteBoost * (rules.crumbWorth || 1);
    honeypotOwed += Field.repleteCount() * full / PAGE_TWO.honeypotEveryS * passed / 1000;
    if (honeypotOwed >= 1) {
      const food = Math.floor(honeypotOwed);
      honeypotOwed -= food;
      gainFood(food, 'replete');
    }
  }
}

// Winter time while the game was closed: SEASON.awayWinterShare of it
// counts, up to the end of winter (seasonTick then starts the summer).
function settleAwayWinter(awayMs) {
  if (!seasonsOn() || !state.season.introSeen || !isWinter() || !(awayMs > 0)) return;
  const year = SEASON.summerMs + SEASON.winterMs;
  state.season.t = Math.min(year, state.season.t + awayMs * SEASON.awayWinterShare);
}

// The seed setting (EAT or STORE), in the Build menu once seasons start,
// and the snowflake in the corner of the field in winter.
function showSeason() {
  el.winterBadge.hidden = !isWinter();
  // The last SEASON.warnMs of summer: a snowflake with !, its tip a reminder.
  const warn = seasonsOn() && !peaceful() && state.season.introSeen && !isWinter() && state.season.t >= SEASON.summerMs - SEASON.warnMs;
  el.winterWarn.hidden = !warn;
  if (warn) {
    const times = perkLevel('diapause') > 0 ? SEASON.diapauseSeeds : SEASON.winterSeeds;
    el.winterWarn.dataset.tip = 'Winter is close!|Seeds stored during|summer will have ' + times + 'x|value during winter!|Find the "store seeds"|button in the build menu.';
  } else if (tipTarget === el.winterWarn) {
    hideTip();
  }
  if (isWinter()) {
    const left = Math.max(0, SEASON.summerMs + SEASON.winterMs - state.season.t);
    const minutes = Math.floor(Math.ceil(left / 1000) / 60);
    const seconds = Math.ceil(left / 1000) % 60;
    el.winterBadge.dataset.tip = 'Winter|' + (minutes > 0 ? minutes + 'm ' : '') + seconds + 's until summer|(3x slower while the|game is closed)';
    if (tipTarget === el.winterBadge && !tip.hidden) showTip(el.winterBadge);   // keep it counting while shown
  } else if (tipTarget === el.winterBadge) {
    hideTip();
  }
  // Seeds: before the seasons (the 3rd flight) only the store flag, wide (where
  // seeds go when every granary is full); then EAT, STORE and the flag.
  el.seedGroup.hidden = !seasonsOn() && Field.granaryCount() === 0;
  el.seedEat.hidden = !seasonsOn();
  el.seedStore.hidden = !seasonsOn();
  el.seedFlag.classList.toggle('is-wide', !seasonsOn());
  el.seedFlag.dataset.tip = seasonsOn() ? 'Store spot|Click this, then a|tunnel floor: stored|seeds go there first,|filling outward.' : 'Store spot|With every granary full,|workers set seeds down|by the flag. Click this,|then a tunnel floor.';
  const picking = Field.pickingStoreFlag();
  el.seedFlag.classList.toggle('is-on', picking);
  el.seedFlag.setAttribute('aria-pressed', String(picking));
  if (!seasonsOn()) return;
  const label = el.seedStore.querySelector('.px');
  if (!label.dataset.fitted && el.seedStore.clientWidth > 0) {   // STORE is squeezed a little to fit its button
    label.dataset.fitted = '1';
    PixelFont.write(label, 'STORE', { fit: el.seedStore.clientWidth - 10 });
  }
  const store = state.settings.seedMode === 'store';
  el.seedEat.classList.toggle('is-on', !store);
  el.seedStore.classList.toggle('is-on', store);
  el.seedEat.setAttribute('aria-pressed', String(!store));
  el.seedStore.setAttribute('aria-pressed', String(store));
}

function setSeedMode(mode) {
  const turnedOn = mode === 'store' && state.settings.seedMode !== 'store';
  state.settings.seedMode = mode;
  if (turnedOn) {   // a fresh spot each time STORE is switched on: a tunnel end with room, far from the main tunnel
    Field.autoStoreFlag();
    saveCave();
  }
  save();
  render();
  showSeason();
}

// (Brood tending used to hatch a clicked egg at once; it unlocks the nursery now.)
function tendBrood() {
  return false;
}

/* ---------- The anteater ----------
 * From the ANTEATER_VISIT.flights-th flight on, every everyMinMs to
 * everyMaxMs of open-game time (not in winter, while up in the canopy, or
 * during a raid) an anteater comes over the grass and sends its tongue down
 * the tunnel (field.js). Its tongue eats the ants it catches; clicks and
 * soldiers' bites drive it off, for honeydew. */
const ANTEATER_VISIT = { everyMinMs: 25 * 60000, everyMaxMs: 45 * 60000, flights: 2, honeydew: 5, leastShown: 10 };   // leastShown: it only comes with this many ants walking about
let lastAnteaterTick = 0;
let anteaterComing = false;   // warned, and on its way

function anteaterWait() {
  return ANTEATER_VISIT.everyMinMs + Math.random() * (ANTEATER_VISIT.everyMaxMs - ANTEATER_VISIT.everyMinMs);
}

function anteaterCountdown(now) {
  const passed = lastAnteaterTick ? Math.min(Math.max(0, now - lastAnteaterTick), 5000) : 0;
  lastAnteaterTick = now;
  if (peaceful()) return;   // (Peaceful mode: the countdown waits)
  if (flightsEver() < ANTEATER_VISIT.flights || anteaterComing || Field.anteaterHere() || Field.visualAnts() < ANTEATER_VISIT.leastShown) return;
  if (!Number.isFinite(state.anteaterIn)) state.anteaterIn = anteaterWait();
  if (isWinter() || screen === 'canopy' || Field.flying() || Field.raiders() > 0 || Field.marauders() > 0 || Field.invaders() > 0) return;   // (the time waits)
  state.anteaterIn -= passed;
  if (state.anteaterIn > 0) return;
  state.anteaterIn = anteaterWait();
  startAnteater();
}

// A warning, then the anteater walks in (the first time, a message that says what to do).
// Big yellow words (like CLICK FRENZY!), drawn `scale` times the usual size.
function writeBig(element, text, scale) {
  PixelFont.write(element, text);
  for (const canvas of element.querySelectorAll('canvas')) {
    canvas.style.width = canvas.width * scale + 'px';
    canvas.style.height = canvas.height * scale + 'px';
  }
}
let askWritten = false;
let askTimer = 0;
const ASK_MS = 11000;   // unanswered this long: the question goes, and so does the anteater
// ANTEATER is coming.. FIGHT? YES: it comes. NO: it goes on its way.
function startAnteater() {
  anteaterComing = true;
  if (!askWritten) {
    askWritten = true;
    writeBig(document.getElementById('ask-title'), 'ANTEATER', 3);
    writeBig(document.getElementById('ask-sub'), 'is coming.. FIGHT?', 1.5);
    writeBig(document.querySelector('#ask-yes .px'), 'YES', 2);
    writeBig(document.querySelector('#ask-no .px'), 'NO', 2);
  }
  state.anteaterSeen = true;
  el.anteaterAsk.hidden = false;
  Sound.sfx('alarm');
  clearTimeout(askTimer);
  askTimer = setTimeout(() => answerAnteater(false), ASK_MS);
}
function answerAnteater(fight) {
  clearTimeout(askTimer);
  el.anteaterAsk.hidden = true;
  anteaterComing = false;
  if (fight) Field.anteaterArrive();
  save();
}

// The party block eaten: the song, the confetti and the dancing (field.js, ants.js).
Field.onParty(() => Sound.party());

Field.onAnteater((what, data) => {
  if (what === 'ate') {   // ants it caught and ate
    for (const kind of data) {
      const type = kind === 'soldier' ? 'soldier' : 'worker';
      if (state.ants[type] > 0) state.ants[type] -= 1;
      state.missingShown[type] += 1;   // one fewer walks about until another hatches (and the soldiers' weight goes down with the count)
    }
  } else if (what === 'gone') {
    if (data) {   // driven off
      state.royal.jelly += ANTEATER_VISIT.honeydew;
      state.stats.anteaters += 1;
      Field.popYellow('+' + ANTEATER_VISIT.honeydew + ' Honeydew', 3000);   // (yellow words, like CLICK FRENZY! but smaller)
      Sound.sfx('fanfare');
    } else {
      Field.popAtEntrance('The anteater had its fill');
    }
  }
  save();
  render();
});

/* ---------- Rove beetle ----------
 * Every 10 to 20 minutes the game is open, a small Sceptobius rove beetle
 * sneaks into the nest for about 3 and a half minutes, walking from spot to spot
 * (field.js). Catching it (a click) gives one of three, at random:
 * honeydew; a frenzy (no wait between crumb clicks, each worth frenzyTimes,
 * for frenzyMs, from when its message is closed); or a rush (workers walk
 * 10x as fast with no rests, for rushMs: ants.js). The first time, a
 * message says one is coming. (Not saved: a frenzy or rush ends if the
 * game closes.) */
const BEETLE = { everyMinMs: 10 * 60000 / 1.3 / 1.2, everyMaxMs: 20 * 60000 / 1.3 / 1.2,   // (30% more often than every 10 to 20 minutes, then 20% more often again: about 6.4 to 12.8)
  honeydew: 2, frenzyTimes: 10, frenzyMs: 10000, rushMs: 60000, firstDelayMs: 4000, pictureScale: 6 };
let lastBeetleTick = 0;
let beetleFrenzyUntil = 0;
let beetleRushUntil = 0;

function beetleWait() {
  return BEETLE.everyMinMs + Math.random() * (BEETLE.everyMaxMs - BEETLE.everyMinMs);
}

function beetleCountdown(now) {
  const passed = lastBeetleTick ? Math.min(Math.max(0, now - lastBeetleTick), 5000) : 0;
  lastBeetleTick = now;
  if (state.flights === 0 || peaceful()) return;   // only after the first nuptial flight (and the countdown waits in Peaceful mode)
  if (!Number.isFinite(state.beetleIn)) state.beetleIn = beetleWait();
  state.beetleIn -= passed;
  if (state.beetleIn > 0 || Field.beetleHere() || screen === 'canopy') return;   // (not while up in the trees, where it can't be seen)
  if (!state.beetleSeen) {
    if (!el.noRoom.hidden || !el.tut.hidden || !el.welcome.hidden) return;   // wait until nothing else is showing
    state.beetleSeen = true;
    state.beetleIn = beetleWait();
    save();
    showMessage(['A rove beetle will', 'sneak in soon!', 'Click it for honeydew,', 'a click frenzy or', 'a worker rush.'], () => setTimeout(() => Field.beetleArrive(), BEETLE.firstDelayMs), beetlePicture());
    return;
  }
  state.beetleIn = beetleWait();
  Field.beetleArrive();
}

// The rove beetle drawn big, for the first message: what to look for.
function beetlePicture() {
  const size = Sprites.sizeOf('roveBeetle');
  const canvas = document.createElement('canvas');
  canvas.width = size.cols;
  canvas.height = size.rows;
  canvas.className = 'dialog-picture';
  canvas.style.width = size.cols * BEETLE.pictureScale + 'px';
  canvas.style.height = size.rows * BEETLE.pictureScale + 'px';
  Sprites.paint(canvas.getContext('2d'), 'roveBeetle', 0, 0, Field.beetleColors());
  return canvas;
}

// Returns the words shown where it was caught.
function catchBeetle() {
  Sound.sfx('catch');
  state.stats.beetles += 1;   // for Sceptobius
  const pick = Math.floor(Math.random() * 3);
  let label;
  if (pick === 0) {
    state.royal.jelly += BEETLE.honeydew;
    label = '+' + BEETLE.honeydew + ' Honeydew';
  } else if (pick === 1) {
    label = 'Frenzy!';
    beetleFrenzyUntil = Date.now() + BEETLE.frenzyMs;   // at once (no message to click away)
    Field.popBig('CLICK FRENZY!', '10x clicks, no wait, 10 s', BEETLE.frenzyMs);   // up the whole frenzy
  } else {
    beetleRushUntil = Date.now() + BEETLE.rushMs;
    label = 'Worker rush!';
  }
  save();
  render();
  return label;
}

/* ---------- Sound ---------- */

// Music at its volume; sound effects at theirs, or silent with the
// Sound effects box (Settings) unchecked.
function applyVolumes() {
  Sound.setVolumes(state.settings.music, state.settings.sfxOn ? state.settings.sfx : 0);
}

// Buttons click as they are pressed and released: a duller sound for one
// that can't be used now, and toggle sounds for on/off buttons.
let pressedButton = null;
function buttonDown(event) {
  Sound.unlock();
  const button = event.target.closest && event.target.closest('.btn, button');
  if (!button || idle) return;
  if (button.hasAttribute('aria-pressed')) return;   // toggles sound on click instead
  if (button.getAttribute('aria-disabled') === 'true' || button.disabled || button.classList.contains('is-off') || button.classList.contains('is-locked')) {
    Sound.play('button_disabled');
    return;
  }
  pressedButton = button;
  Sound.press();
}
function buttonUp() {
  if (!pressedButton) return;
  pressedButton = null;
  Sound.release();
}
function buttonToggled(event) {
  const button = event.target.closest && event.target.closest('[aria-pressed]');
  if (!button) return;
  setTimeout(() => Sound.play(button.getAttribute('aria-pressed') === 'true' ? 'toggle_on' : 'toggle_off'), 0);
}
window.addEventListener('mousedown', buttonDown, true);
window.addEventListener('mouseup', buttonUp, true);
window.addEventListener('click', buttonToggled, true);
window.addEventListener('change', (event) => {
  if (event.target.type === 'checkbox') Sound.play(event.target.checked ? 'toggle_on' : 'toggle_off');
}, true);

/* ---------- Fire ant raids ---------- */

// The time until the next raid counts down only while the game is open, and
// is saved, so closing the game pauses it rather than starting it over.
// (A long gap between ticks, such as the computer sleeping, counts as at most 5 seconds.)
let lastRaidTick = 0;

// A raid beaten (every fire ant killed, at least one) with no soldier falling counts for Phragmosis.
let raidFalls = 0;
let raidOn = false;
function watchRaid() {
  const raiders = Field.raiders();
  if (raiders > 0 && !raidOn) {
    raidOn = true;
    raidFalls = 0;
  } else if (raiders === 0 && raidOn) {
    raidOn = false;
    if (raidFalls === 0 && Field.fireDead() > 0 && state.ants.soldier > 0) state.stats.cleanRaids += 1;
  }
}

function raidWait() {
  return RAID.everyMinMs + Math.random() * (RAID.everyMaxMs - RAID.everyMinMs);
}

/*
 * Marauder raids (Marauder raids, perk page II): half as often as fire ant
 * raids, counted only while the game is open, never in winter, and never
 * while another raid is on. Bigger with a bigger colony. When the last
 * marauder is beaten or has left, the raid is over: +honeydew.
 */
const MARAUDER_RAID = { everyMinMs: 2 * RAID.everyMinMs, everyMaxMs: 2 * RAID.everyMaxMs, sizeMin: 4, perSoldiers: 30, extraMin: 1, extraMax: 3, most: 12, honeydew: 5 };   // army ants: sizeMin, plus one for every perSoldiers soldiers you own, plus 1 to 3 more (2 on average), up to most
let lastMarauderTick = 0;
let marauderRaidOn = false;

function marauderWait() {
  return MARAUDER_RAID.everyMinMs + Math.random() * (MARAUDER_RAID.everyMaxMs - MARAUDER_RAID.everyMinMs);
}

function marauderCountdown(now) {
  const passed = lastMarauderTick ? Math.min(Math.max(0, now - lastMarauderTick), 5000) : 0;
  lastMarauderTick = now;
  // A raid on: over once none are left.
  if (Field.marauders() > 0) {
    marauderRaidOn = true;
    return;
  }
  if (marauderRaidOn) {
    marauderRaidOn = false;
    state.stats.armyRaids += 1;   // for Eciton
    state.royal.jelly += MARAUDER_RAID.honeydew;
    Field.popAtEntrance('Army ants gone! +' + MARAUDER_RAID.honeydew + ' Honeydew');
    Sound.sfx('fanfare');
    save();
    render();
  }
  if (perkLevel('marauders') === 0 || isWinter() || peaceful()) return;   // (the countdown waits)
  if (!Number.isFinite(state.marauderIn)) state.marauderIn = marauderWait();
  state.marauderIn -= passed;
  if (state.marauderIn > 0 || Field.raiders() > 0) return;
  state.marauderIn = marauderWait();
  startMarauderRaid();
}

// Marauders come now (the countdown, or dev key M): as many as the colony's size calls for.
function startMarauderRaid() {
  const extra = MARAUDER_RAID.extraMin + Math.floor(Math.random() * (MARAUDER_RAID.extraMax - MARAUDER_RAID.extraMin + 1));
  const count = Math.min(MARAUDER_RAID.most, MARAUDER_RAID.sizeMin + Math.floor(state.ants.soldier / MARAUDER_RAID.perSoldiers) + extra);
  Field.startMarauders(count);
  marauderRaidOn = true;
  Sound.sfx('raid');
  Field.popAtEntrance('Army ants!');
  render();
}

function raidCountdown(now) {
  const passed = lastRaidTick ? Math.min(Math.max(0, now - lastRaidTick), 5000) : 0;
  lastRaidTick = now;
  if (!Number.isFinite(state.raidIn)) state.raidIn = raidWait();
  if (isWinter() || peaceful()) {   // no raids in winter or Peaceful mode: the countdown waits
    el.raidWarning.hidden = true;
    return;
  }
  state.raidIn -= passed;
  // With no soldiers, a flashing warning for the last RAID.warnMs before a raid.
  el.raidWarning.hidden = !(state.ants.soldier === 0 && state.raidIn <= RAID.warnMs && Field.raiders() === 0);
  if (state.raidIn > 0) return;
  state.raidIn = raidWait();
  el.raidWarning.hidden = true;
  if (Field.raiders() === 0) startRaid();
}

function startRaid() {
  const pace = state.fireAntsSeen ? RAID.laterPace : 1;   // after the first raid: the raids grow faster
  const more = (state.flights > 0 ? RAID.afterFlight : 0) + Math.floor(totalAnts() * pace / RAID.perAnts) + Math.floor(state.flights * pace / RAID.perFlights);
  const count = Math.min(RAID.most, RAID.sizeMin + more + Math.floor(Math.random() * (RAID.sizeMax - RAID.sizeMin + 1)));
  Field.startRaid(count);
  Sound.sfx('raid');
  if (!state.fireAntsSeen) {
    state.fireAntsSeen = true;
    save();
    showRaidIntro();
  }
  render();
}

// The first raid: the fire ants wait while this message is up.
function showRaidIntro() {
  hideTip();
  Field.pauseRaid(true);
  writeLines(el.raidLines, RAID_INTRO);
  el.raidIntro.hidden = false;
  render();   // shows the alarm button
  el.btnAlarm.classList.add('tut-point');
  placeOverField(el.raidBox);
  el.raidOk.focus();
}

// The alarm button keeps blinking after the message closes, until it is pressed.
function closeRaidIntro() {
  el.raidIntro.hidden = true;
  Field.pauseRaid(false);
}

// A soldier fell to the fire ants: it costs RAID.fallCost food, never
// taking the food below 0. Returns how much was taken.
function soldierFallCost() {
  catchUp(Date.now());
  const lost = Math.min(state.food, RAID.fallCost);
  state.food -= lost;
  raidFalls += 1;
  Sound.sfx('fall');
  save();
  render();
  return lost;
}

// A fire ant reached the queen: it takes some food. Returns how much.
function foodStolen() {
  catchUp(Date.now());
  const lost = Math.min(state.food, RAID.stealMost, Math.max(1, Math.round(state.food * RAID.stealShare)));
  state.food -= lost;
  save();
  render();
  return lost;
}

function pressAlarm() {
  if (el.btnAlarm.classList.contains('is-on')) {
    Field.cancelAlarm();
    return;
  }
  hideTip();
  el.btnAlarm.classList.remove('tut-point');   // the first raid's highlight
  el.btnAlarm.classList.add('is-on');
  Field.armAlarm((placed) => {
    el.btnAlarm.classList.remove('is-on');
    if (placed) state.stats.alarms += 1;
  });
}

/* ---------- Start ---------- */

el.btnAnts.addEventListener('click', () => showScreen('ants'));
el.btnDig.addEventListener('click', () => showScreen('dig'));
el.btnUpgrade.addEventListener('click', () => showScreen('upgrades'));
el.btnBuild.addEventListener('click', () => showScreen('build'));
el.btnTrail.addEventListener('click', () => {
  if (!trailUnlocked()) return;
  chooseBuildTool(buildTool === 'trail' ? null : 'trail');
});
el.btnGranary.addEventListener('click', () => chooseBuildTool(buildTool === 'granary' ? null : 'granary'));
el.btnNursery.addEventListener('click', () => chooseBuildTool(buildTool === 'nursery' ? null : 'nursery'));
el.btnCaterpillar.addEventListener('click', () => {
  if (Field.caterpillarCount() > 0 && buildTool !== 'caterpillar') return;   // (only one)
  chooseBuildTool(buildTool === 'caterpillar' ? null : 'caterpillar');
});
// Lycaenid Mutualism: an ant milked the caterpillar.
Field.onCaterpillarMilk(() => {
  state.royal.jelly += 1;
  save();
  render();
});
el.btnMidden.addEventListener('click', () => {
  if (!middenUnlocked()) return;
  chooseBuildTool(buildTool === 'midden' ? null : 'midden');
});
el.btnDelete.addEventListener('click', () => chooseBuildTool(buildTool === 'delete' ? null : 'delete'));
el.btnReplete.addEventListener('click', () => {
  if (!repletesUnlocked()) return;
  chooseBuildTool(buildTool === 'replete' ? null : 'replete');
});
el.btnFungus.addEventListener('click', () => {
  if (!fungusUnlocked()) return;
  chooseBuildTool(buildTool === 'fungus' ? null : 'fungus');
});
el.btnAphid.addEventListener('click', () => {
  if (!aphidsUnlocked()) return;
  chooseBuildTool(buildTool === 'aphid' ? null : 'aphid');
});
for (const kind in MERGES) {
  el.mergeButtons[kind].addEventListener('click', () => {
    if (!mergeUnlocked(kind) || mergeBase(kind) < MERGE_COUNT) return;
    chooseBuildTool(buildTool === kind ? null : kind);
  });
}
Field.setMergeCount(MERGE_COUNT);
for (const key in UPGRADES) {
  el.upgrade[key].button.addEventListener('click', () => buyUpgrade(key));
}
el.btnReset.addEventListener('click', reset);
el.btnSettings.addEventListener('click', () => showScreen('settings'));
el.canopyUp.addEventListener('click', () => enterCanopy(state.weaver.visited));   // (the first time: the slow trip up)
el.canopyDown.addEventListener('click', leaveCanopy);
el.btnWeaverAnt.addEventListener('click', hatchWeaver);
el.btnWeaverLeaf.addEventListener('click', () => { Canopy.setLeafTool(!Canopy.leafTool()); render(); });
el.btnExchange.addEventListener('click', tradeWeaverFood);
document.getElementById('ask-yes').addEventListener('click', () => answerAnteater(true));
document.getElementById('ask-no').addEventListener('click', () => answerAnteater(false));
el.weaverQueen.addEventListener('click', () => { state.weaver.showQueen = !state.weaver.showQueen; save(); render(); });
Canopy.init({
  wrap: el.canopy,
  boostText: (count) => '+' + Math.round(weaverBoostAt(count) * 100) + '% food',
  branchInfo: (n) => '+' + Math.round((WEAVER_BRANCH_BOOST[n] || 0) * 100) + '% all food' + ({ 2: ', fruit falls', 3: ', forage in rain', 4: ', food exchange' }[n] || ''),   // (on each branch until it is reached)
  showQueen: () => state.weaver.showQueen,
  canvas: document.getElementById('canopy-canvas'),
  tripCanvas: document.getElementById('canopy-trip'),
  fieldCanvas: document.getElementById('field'),
  leaves: () => state.weaver.leaves,
  workers: () => state.weaver.workers,
  placeLeaf: (c, r) => {
    weaverTick(Date.now());
    const cost = leafCost(Canopy.levelOf(r));
    if (state.weaver.food < cost) { Sound.play('button_disabled'); return false; }
    state.weaver.food -= cost;
    state.weaver.leaves.push([c, r]);
    Sound.play('place', 0.6);
    save();
    render();
    return true;
  },
  reached: (n) => {
    const w = state.weaver;
    const before = w.best;
    w.best = Math.max(w.best, n);
    if (n >= 2 && w.leavesAtBranch2 === null) w.leavesAtBranch2 = w.leaves.length;
    if (before < 2 && n >= 2) Field.dropFruit();   // branch 2 reached for the first time: the first fruit lands on the grass at once
    save();
  }
});
el.autoHatch.addEventListener('click', () => {
  state.settings.autoHatch = !state.settings.autoHatch;
  save();
  render();
});
el.peaceful.addEventListener('click', pressPeaceful);
el.sfx.addEventListener('click', () => {
  state.settings.sfxOn = !state.settings.sfxOn;
  applyVolumes();
  save();
  render();
});
if (IN_FLOATING_WINDOW || !extensionStorage || !chrome.windows) {
  el.btnFloat.hidden = true;   // already floating, or not running as the extension
} else {
  el.btnFloat.addEventListener('click', openFloating);
}
for (const type in ANT_TYPES) {
  el.ant[type].button.addEventListener('click', () => layEgg(type));
}
for (const button of document.querySelectorAll('.btn-back')) {
  button.addEventListener('click', () => showScreen('main'));
}
for (const key in el.toolButtons) {
  el.toolButtons[key].addEventListener('click', () => chooseTool(key));
}
for (const key in el.shapeButtons) {
  el.shapeButtons[key].addEventListener('click', () => chooseShape(key));
}
el.size.addEventListener('input', () => chooseSize(Number(el.size.value)));
el.split.addEventListener('input', () => {
  const share = Math.min(Number(el.split.value), FUNGUS_SPLIT.most);   // past the red line it stays at 80
  if (String(share) !== el.split.value) el.split.value = String(share);
  state.settings.fungusShare = share;
  save();
  render();
});
PixelFont.write(document.getElementById('split-name-crumb'), 'Crumb', { small: true });
PixelFont.write(document.getElementById('split-name-fungus'), 'Fungus', { small: true });
el.zoomIn.addEventListener('click', () => Field.zoomIn());
el.zoomOut.addEventListener('click', () => Field.zoomOut());
el.noRoom.addEventListener('click', (event) => {
  // A plain message closes on any click; one asking OK or CANCEL only on its buttons.
  if (el.noRoomCancel.hidden || el.noRoomOk.contains(event.target)) hideNoRoom();
  else if (el.noRoomCancel.contains(event.target)) cancelMessage();
  else if (el.noRoomLater.contains(event.target)) {
    const later = messageLater;
    cancelMessage();
    if (later) later();
  }
});
el.title.addEventListener('click', startRenaming);
document.addEventListener('keydown', typeName);
// (Developer keys C, R and B are in dev-keys.js.)
document.addEventListener('keydown', (event) => {
  if (typedName !== null || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (event.key.length === 1) {
    typedLetters = (typedLetters + event.key.toLowerCase()).slice(-STAR_CODE.word.length);
    if (typedLetters.endsWith(JASON.word)) jasonBonus();
    if (typedLetters.endsWith(ANGELEE.word)) angeleeNote();
    if (typedLetters.endsWith(PARTY_CODE.word)) partyCode();
    if (typedLetters === STAR_CODE.word) starCode();
  }
  if (event.key === 'Escape') {
    Field.cancelAlarm();
    if (Field.pickingStoreFlag()) { Field.pickStoreFlag(null); showSeason(); }
  }
});
el.btnAlarm.addEventListener('click', pressAlarm);
PixelFont.write(document.getElementById('raid-warning-1'), 'Fire ants are coming!');
PixelFont.write(document.getElementById('raid-warning-2'), 'You have no soldiers.', { small: true });
el.raidOk.addEventListener('click', closeRaidIntro);
Field.onRaid(foodStolen);
Field.onSoldierFall(soldierFallCost);
document.addEventListener('mousedown', (event) => {
  if (typedName !== null && !el.title.contains(event.target)) stopRenaming(true);
});
el.noRoom.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!el.noRoomCancel.hidden && (event.key === 'Escape' || document.activeElement === el.noRoomCancel)) cancelMessage();
    else hideNoRoom();
  }
});
el.btnFlight.addEventListener('click', () => {
  // Before the first flight the menu needs an alate; after that it can be looked at any time.
  if (state.alate || state.flights > 0 || state.cheats) showScreen('flight');
  else showMessage(['You need a', 'reproductive alate', 'before you can fly!']);
});
el.btnAlate.addEventListener('click', buyAlate);
el.btnTrophic.addEventListener('click', buyTrophic);
el.btnSat.addEventListener('click', toggleSatellites);
for (const sat of SATS) {
  const id = (name) => document.getElementById(name + sat.suffix);
  sat.el = { win: id('sat-window'), canvas: id('sat-canvas'), up: id('btn-sat-up') };
  id('btn-sat-close').addEventListener('click', () => closeSatellite(sat));
  sat.el.up.addEventListener('click', () => buySatelliteUpgrade(sat));
  PixelFont.write(id('sat-title'), sat.title, { small: true });
  PixelFont.write(id('sat-close-label'), 'X', { small: true });
  sat.el.win.querySelector('.titlebar').addEventListener('mousedown', (event) => {
    if (event.target.closest('button')) return;
    satDrag = { sat, x: event.clientX, y: event.clientY, left: sat.el.win.offsetLeft, top: sat.el.win.offsetTop };
    event.preventDefault();
  });
}
window.addEventListener('mousemove', (event) => {
  if (satDrag) placeSatellite(satDrag.sat, satDrag.left + event.clientX - satDrag.x, satDrag.top + event.clientY - satDrag.y);
});
window.addEventListener('mouseup', () => { satDrag = null; });
el.tutYes.addEventListener('click', nextTutorialStep);
el.tutNo.addEventListener('click', endTutorial);
el.tut.addEventListener('keydown', (event) => {
  // (The flight tutorial can't be skipped, unless C was pressed.)
  if (event.key === 'Escape' && (tutorialSteps !== FLIGHT_TUTORIAL || state.cheats)) { event.preventDefault(); endTutorial(); }
});
window.addEventListener('resize', () => {
  if (!el.tut.hidden) placeTutorial();
  if (!el.welcome.hidden) placeOverField(el.welcomeBox);
});
el.welcomeOk.addEventListener('click', closeWelcome);
el.welcome.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeWelcome(); });
el.btnFly.addEventListener('click', takeFlight);
el.lineAssist.addEventListener('click', () => {
  setLineAssist(!state.settings.lineAssist);
  save();
});
el.btnEncy.addEventListener('click', () => showScreen('ency'));
el.btnAchieve.addEventListener('click', () => showScreen('achieve'));
for (const type in FLATS) el.flat[type].addEventListener('click', () => buyFlat(type));
Field.onEvent(noteEvent);
for (const a of ACHIEVEMENTS) {
  const button = document.createElement('button');
  button.className = 'btn ency-item ach-item';
  button.setAttribute('aria-label', a.hidden ? 'Hidden achievement' : a.name);
  const name = document.createElement('span');
  name.className = 'px';
  const note = document.createElement('span');
  note.className = 'px';
  const alert = document.createElement('span');
  alert.className = 'sprite ach-alert';
  alert.dataset.sprite = 'alert';
  button.append(name, note, alert);
  el.achieveList.appendChild(button);
  Sprites.fillAll(button);
  el.achieveRows[a.key] = { button, name, note, alert };
  button.addEventListener('click', () => claimAchievement(a.key));
}
el.encyBack.addEventListener('click', showEncyList);
el.treeTab1.addEventListener('click', () => { treePage = 1; layoutTree(); renderTree(); });
el.treeTab3.addEventListener('click', () => {
  treePage = 3;
  if (!state.pageThreeSeen) {
    state.pageThreeSeen = true;
    save();
  }
  layoutTree();
  renderTree();
});
el.treeTabStar.addEventListener('click', offerPageTwoStar);
drawStars(document.getElementById('tree-star'), 1, 1);
el.treeTab2.addEventListener('click', () => {
  treePage = 2;
  if (!state.pageTwoSeen) {
    state.pageTwoSeen = true;
    save();
  }
  layoutTree();
  renderTree();
});
el.seedEat.addEventListener('click', () => setSeedMode('eat'));
el.seedStore.addEventListener('click', () => setSeedMode('store'));
// The flag: the next click on the nest puts it down (click it again, or Escape, to stop).
el.seedFlag.addEventListener('click', () => {
  if (Field.pickingStoreFlag()) {
    Field.pickStoreFlag(null);
  } else {
    Field.pickStoreFlag(() => { saveCave(); showSeason(); });
  }
  showSeason();
});
Field.onBroodClick(tendBrood);
el.scoutFind.addEventListener('click', openScoutFind);
Field.onBeetle(catchBeetle);
Field.onBloom(middenBloomed);
Field.onMiddenHover(showMiddenTip);
for (const key in el.volume) {
  el.volume[key].slider.addEventListener('input', () => {
    state.settings[key] = Number(el.volume[key].slider.value);
    applyVolumes();
    save();
    render();
  });
}

PixelFont.writeAll(document);
PixelFont.write(el.resetLabel, 'RESET');
Sprites.fillAll(document);
Field.init(document.getElementById('field'));
FireNest.start(document.getElementById('fire-nest'));
Field.onUse(useTool);
Field.onStrokeEnd(finishStroke);
Field.onCaveChange(saveCave);   // a seed stored in, or eaten from, a granary
Field.onHover((pixels) => {
  hoveredPixels = pixels;
  render();
});
Field.onZoom(showZoom);
Field.onFood(gainFood);
Field.onCrumbChange(save);
showZoom(Field.view().zoom, Field.view().maxZoom);
el.size.value = String(sizeIndex);

// Sync saves were taken out: clear what they left in Chrome's sync storage.
try { if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) chrome.storage.sync.clear(); } catch (error) { /* nothing to clear */ }

Promise.all([load(SAVE_KEY), load(CAVE_KEY)]).then(([saved, cave]) => {
  state = readSave(saved);
  harvestSeen = state.harvested;   // (food earned while closed counts toward Peaceful mode's share if it is on)
  Field.loadDowned(state.downedSoldiers);   // (before anything saves: soldiers down when the game closed stay down)
  Field.setFit(perkLevel('supercolony') >= 2 ? POLYDOMY_2.fit : 1);   // Polydomy's second level: a bigger world (before the cave loads)
  applyVolumes();
  Sound.setOn(true);   // always on; the volumes are in Settings (it starts on the first click: browsers ask for one)
  const closedAt = state.lastTick;
  const wasClosed = Date.now() - closedAt > RULES.awayAfterMs;
  catchUp(Date.now());   // eggs hatched and food earned while the game was closed
  // Set the rules first, so the right number of crumbs is loaded. (Setting
  // them can put out a crumb and save, so keep the saved crumbs aside first.)
  const savedCrumbs = state.crumbs;
  Field.setCrumbRules(fieldRules());
  Field.loadCrumbs(savedCrumbs);

  if (cave && Array.isArray(cave.runs)) {
    if (Field.loadCave(cave)) saveCave();   // saved again if it was brought up to date
    refundDroppedFungi();
  } else {
    // First run of this version: rebuild the tunnels from the old list of
    // dug squares (if any) and save them in the new form.
    Field.loadCave({ dug: readOldDugSquares(saved) });
    saveCave();
  }
  // Aphids live in pens on the field. An aphid with no pen (Mealybug flight
  // in older versions) can be placed for free instead.
  const pens = Field.aphidCount();
  if (state.aphids > pens) state.freeAphids += state.aphids - pens;
  state.aphids = pens;
  // Granaries, fungus gardens and aphids that came due while the game was
  // closed pay only the Away percent (nothing with no Away level).
  if (wasClosed) {
    const away = upgradeValue('away');
    const paid = Math.floor(Field.settleAway(closedAt, away.minutes > 0 ? away.percent : 0) * weaverBoost());
    state.food += paid;
    addHarvest(paid);
    if (awayReport) awayReport.structures = (awayReport.structures || 0) + paid;
  }
  // Winter goes on while the game is closed, at a third of the speed
  // (summer waits). It ends at the start of summer at most.
  settleAwayWinter(Date.now() - closedAt);
  // A raid that was on when the game closed carries on.
  Field.loadRaid(state.raidAnts);

  save();
  setLineAssist(state.settings.lineAssist);
  chooseShape(shape);       // the field starts with the same, but set both to be sure
  chooseSize(sizeIndex);
  chooseTool(tool);
  render();
  setInterval(tick, 250);
  if (extensionStorage) chrome.storage.onChanged.addListener(followOtherCopy);
  // Save as the game closes, so the time until the next raid (and everything
  // else) is kept to the moment, not to the last heartbeat.
  window.addEventListener('pagehide', () => { raidCountdown(Date.now()); save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { raidCountdown(Date.now()); save(); } });
  if (!state.tutorialAsked) askTutorial();
  else showWelcome();
  offerWhenFree();
});
