/*
 * Developer keys, for testing. To remove them all, delete this file and its
 * <script src="dev-keys.js"> line in popup.html. Nothing else uses it.
 *
 *   C  1,000,000 food (counts as harvested) and 100 honeydew, and opens
 *      perk page II; from then on eggs in that save hatch at once.
 *      Held down: the same 20 times a second; held for 6 seconds: every
 *      honeydew upgrade on both pages too
 *   R  a fire ant raid right now
 *   M  a marauder raid right now (with or without Marauder raids, even in
 *      winter; not while another raid is on)
 *   B  a rove beetle sneaks in right now
 *   S  scouts find something right now
 *   W  seasons: starts them before the third flight, then skips to the
 *      next season (summer to winter, winter to summer)
 *   G  every midden fills a quarter more (four presses: full, and it blooms)
 *   O  shows the early player offer (platinum stars) again
 *   H  turns instant hatching (from C) off, or back on
 *   L  1,000 weaver food (the canopy)
 *
 * The list is also shown at the bottom of the side panel (main screen only).
 */

'use strict';

const DEV_KEYS = { cheatFood: 1000000, cheatHoneydew: 100, weaverFood: 1000, holdEveryMs: 50, holdAllMs: 6000 };

// C held down: again every holdEveryMs, and after holdAllMs every honeydew upgrade.
let cHold = null;   // { repeat, all } timers while C is down
function stopCHold() {
  if (!cHold) return;
  clearInterval(cHold.repeat);
  clearTimeout(cHold.all);
  cHold = null;
}
document.addEventListener('keyup', (event) => { if (event.key.toLowerCase() === 'c') stopCHold(); });
window.addEventListener('blur', stopCHold);

// Every honeydew upgrade on both pages, at its last level (no honeydew spent).
function unlockAllPerks() {
  stopCHold();
  const grows = perkLevel('supercolony') < 2;   // (Polydomy's second level: a bigger nest, after a reload)
  for (const key of Object.keys(PERKS)) if (!PERKS[key].endless) state.royal.perks[key] = PERKS[key].costs.length;   // (not page III: bought level by level)
  if (state.invasion !== 'won') state.invasion = 'won';   // (Fire ant slavemaking: no invasion to fight first)
  state.fireAntsSeen = true;
  save();
  if (grows) {
    saveCave();
    showMessage(['All honeydew upgrades!', 'The nest grows: the', 'game opens again.'], () => setTimeout(() => location.reload(), 300));
    return;
  }
  render();
  if (screen === 'flight') layoutTree();
  showMessage(['All honeydew upgrades!']);
}

document.addEventListener('keydown', (event) => {
  if (typedName !== null || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'c') {
    stopCHold();
    cHold = { repeat: setInterval(cheatOnce, DEV_KEYS.holdEveryMs), all: setTimeout(unlockAllPerks, DEV_KEYS.holdAllMs) };
    cheatOnce();
    return;
  }
  devKey(key);
});

function cheatOnce() {
  {
    catchUp(Date.now());
    state.cheats = true;   // also: fly without an alate, show the aphid button, open perk page II, and eggs hatch at once
    if (!state.slowHatch) for (const egg of state.eggs.concat(state.fireEggs)) egg.hatchAt = Math.min(egg.hatchAt, Date.now());
    state.food += DEV_KEYS.cheatFood;
    addHarvest(DEV_KEYS.cheatFood);
    state.royal.jelly += DEV_KEYS.cheatHoneydew;
    save();
    render();
    if (screen === 'flight') layoutTree();   // the page II tab shows at once
  }
}

function devKey(key) {
  if (key === 'r') {
    startRaid();
  } else if (key === 'm') {
    if (Field.raiders() === 0) startMarauderRaid();   // at once: bought or not, winter or not (not on top of another raid)
  } else if (key === 'b') {
    Field.beetleArrive();
  } else if (key === 's') {
    state.scoutFind = null;
    state.scoutIn = 0;
    scoutTick(Date.now());
  } else if (key === 'l') {
    weaverTick(Date.now());
    state.weaver.food += DEV_KEYS.weaverFood;   // weaver food, for the canopy
    save();
    render();
  } else if (key === 'a') {
    if (!Field.anteaterHere()) startAnteater();   // an anteater now (any flight, any season)
  } else if (key === 'f') {
    Field.dropFruit();   // a fruit falls now (weaver branch 2 or not)
  } else if (key === 'h') {
    state.slowHatch = !state.slowHatch;   // instant hatching off (or on again)
    save();
    showMessage(['Instant hatch ' + (state.slowHatch ? 'OFF' : 'ON')]);
  } else if (key === 'o') {
    state.early = 'pending';   // the early player offer again (none if this save has no star to offer)
    offerEarly();
  } else if (key === 'g') {
    const pixels = Field.middens().reduce((sum, pile) => sum + pile.size, 0);
    Field.feedMiddens(0.25 * pixels);   // (shared by size: each pile a quarter of what it holds)
  } else if (key === 'w') {
    const season = state.season;
    if (!seasonsOn()) {
      season.forced = true;   // the intro message shows on the next tick
    } else if (!season.introSeen) {
      return;
    } else if (isWinter()) {
      season.t = SEASON.summerMs + SEASON.winterMs - 1;   // summer comes on the next tick
    } else {
      season.t = SEASON.summerMs - 1;   // winter comes on the next tick
      season.rained = true;
      season.rainUntil = 0;
    }
    save();
  }
}

// The list of developer keys and typed codes, at the bottom of the side panel.
const DEV_LIST = [
  'DEV KEYS',
  'C food, fast eggs',
  'hold C: fast, 6s perks',
  'H instant hatch on/off',
  'R fire  M army raid',
  'B beetle  S scouts',
  'W season  G midden',
  'O offer  L weaver food',
  'F fruit  A anteater',
  'CODES: jason,',
  'braydenisdiddy, ???!'
];
(() => {
  const box = document.createElement('div');
  box.className = 'dev-list';
  for (const line of DEV_LIST) {
    const span = document.createElement('span');
    span.className = 'px';
    box.appendChild(span);
    PixelFont.write(span, line, { small: true });
  }
  document.querySelector('.panel').appendChild(box);
  setInterval(() => { box.hidden = screen !== 'main'; }, 300);
})();
