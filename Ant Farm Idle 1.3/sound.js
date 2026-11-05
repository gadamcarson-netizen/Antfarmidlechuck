/*
 * Sound: the music tracks and the sound effects (sounds/ folder).
 *
 * Sound is always on, at the volumes in Settings (popup.js). Browsers only
 * let a page start sound after a click, so the audio starts on the first
 * click after the game opens.
 *
 * Music: 'boot' plays once when the game opens on the
 * main nest, then 'main' carries on; 'winter', 'rain' and 'fire' (a raid)
 * take over while they last. A change fades one track out as the next fades
 * in (MUSIC_FADE seconds). The tracks stream from <audio> elements, so they
 * are never held in memory whole. The looping tracks were cut so their end
 * runs straight into their start (the old fade-out blended into the opening).
 */

'use strict';

const Sound = (() => {
  const TRACKS = {
    boot: { file: 'sounds/music/bootup.ogg', loop: false, fromStart: true },   // once, as the game opens, then main
    main: { file: 'sounds/music/main_nest.ogg', loop: true },
    winter: { file: 'sounds/music/winter.ogg', loop: true },
    rain: { file: 'sounds/music/raining.ogg', loop: true },
    fire: { file: 'sounds/music/fire_ants.ogg', loop: true, fromStart: true },   // a raid: from the top each time
    weaver: { file: 'sounds/music/weaver.ogg', loop: true },   // up in the canopy with the weaver ants
    party: { file: 'sounds/music/party.ogg', loop: false, fromStart: true }   // the party block: once, at 100% whatever the Music setting
  };
  const MUSIC_FADE = 4;     // seconds of fading from one track into the next (equal power: no dip in the middle)
  const BOOT_LEAD = 5.5;    // the opening track hands over to the next this long before it ends
  const FILES = {
    button_down: 'sounds/sfx/button_down.ogg',
    button_up: 'sounds/sfx/button_up.ogg',
    button_click: 'sounds/sfx/button_click.ogg',
    button_click_alt1: 'sounds/sfx/button_click_alt1.ogg',
    button_click_alt2: 'sounds/sfx/button_click_alt2.ogg',
    button_disabled: 'sounds/sfx/button_disabled.ogg',
    toggle_on: 'sounds/sfx/toggle_on.ogg',
    toggle_off: 'sounds/sfx/toggle_off.ogg',
    dig: 'sounds/sfx/dig.ogg',
    dig_alt1: 'sounds/sfx/dig_alt1.ogg',
    dig_alt2: 'sounds/sfx/dig_alt2.ogg',
    upgrade_subtle: 'sounds/sfx/upgrade_subtle.ogg',
    place: 'sounds/sfx/place.ogg',
    wings: 'sounds/sfx/wings.ogg',
    wings_short: 'sounds/sfx/wings_short.ogg'
  };
  // Loudness at 100% on the volume settings (the settings default to 70%).
  const LEVEL = { music: 0.45, sfx: 0.8 };
  const DIG_GAP_MS = 450;   // a dig sound at most this often while dragging

  let ctx = null;
  let musicGain = null;
  let sfxGain = null;
  const buffers = {};
  let on = false;
  let wanted = 'main';      // the track that should be playing
  let current = null;       // the track playing (or fading in)
  let booted = false;       // the opening track has started
  let bootDone = false;     // ...and is handing over
  const tracks = {};        // name: { audio, gain }, made when first played
  let lastDigAt = 0;
  let partying = false;     // the party song is playing (the other music waits)
  const volume = { music: 70, sfx: 70 };   // the settings, 0 to 100

  // The audio graph and the files, made on first use (after a click).
  function wake() {
    if (!ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      ctx = new Context();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
      applyVolumes();
      for (const name in FILES) load(name);
    }
    if (ctx.state === 'suspended') ctx.resume().then(updateMusic).catch(() => {});
    return true;
  }

  function load(name) {
    fetch(FILES[name])
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        buffers[name] = buffer;
        if (name === wanted) updateMusic();
      })
      .catch(() => {});   // a missing file just stays quiet
  }

  // Turn all sound on or off.
  function setOn(value, fromClick = false) {
    on = Boolean(value);
    if (on) {
      if (!fromClick) return;   // waits for unlock(): a click
      if (!wake()) return;
      updateMusic();
    } else {
      stopMusic();
    }
  }

  // Volumes from the settings, 0 to 100.
  function setVolumes(music, sfx) {
    volume.music = music;
    volume.sfx = sfx;
    applyVolumes();
  }
  function applyVolumes() {
    if (!ctx) return;   // (nothing is made until sound is turned on)
    musicGain.gain.value = LEVEL.music * volume.music / 100;
    sfxGain.gain.value = LEVEL.sfx * volume.sfx / 100;
  }

  // A click anywhere: lets sound start if it is on (browsers ask for a click first).
  function unlock() {
    if (on) {
      wake();
      updateMusic();
    }
  }

  // `rate` changes speed and pitch together (1: as recorded).
  function play(name, volume = 1, rate = 1) {
    if (!on || !ctx || !buffers[name]) return;
    const source = ctx.createBufferSource();
    source.buffer = buffers[name];
    source.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(sfxGain);
    source.start();
  }

  // One of `names` at random.
  function playAny(names, volume, rate) {
    play(names[Math.floor(Math.random() * names.length)], volume, rate);
  }

  // A button press: one of the three press sounds, pitched a little up or
  // down at random, so repeated clicks never sound quite the same.
  function press() {
    playAny(['button_down', 'button_click_alt1', 'button_click_alt2'], 1, 0.93 + Math.random() * 0.14);
  }
  function release() {
    play('button_up', 1, 0.95 + Math.random() * 0.1);
  }

  /*
   * Small sounds made on the spot (no files): sfx(name). Each is quiet, and
   * the ones that happen all the time are quieter still. `gap` is the least
   * time between two of the same, in milliseconds.
   */
  const SYNTH = {
    crumb:   { volume: 0.05, gap: 80 },    // clicking the bread crumb: a soft crunch and a plip
    queen:   { volume: 0.035, gap: 120 },  // crumb delivered to the queen: a wet tick
    hatch:   { volume: 0.04, gap: 150 },   // an egg hatching: a tiny pop
    seed:    { volume: 0.05, gap: 150 },   // a seed stored: a dry rattle into straw
    munch:   { volume: 0.04, gap: 200 },   // ant bread eaten: a soft munch
    fungus:  { volume: 0.06, gap: 200 },   // a fungus garden harvested: a squish
    milk:    { volume: 0.06, gap: 200 },   // an aphid milked: a sticky drip
    replete: { volume: 0.12, gap: 300 },   // a full replete pays: a slosh
    raid:    { volume: 0.25, gap: 2000 },  // fire ants arrive: two low drum hits
    bite:    { volume: 0.03, gap: 90 },    // a bite in a fight: a light click
    fall:    { volume: 0.12, gap: 300 },   // a soldier falls: a thud
    alarm:   { volume: 0.12, gap: 400 },   // alarm pheromone placed: a soft rising hiss
    skitter: { volume: 0.08, gap: 1000 },  // a rove beetle sneaks in
    catch:   { volume: 0.12, gap: 300 },   // the rove beetle caught: a bright chime
    fanfare: { volume: 0.12, gap: 500 },   // an achievement claimed
    rumble:  { volume: 0.25, gap: 1000 },  // ten buildings merged into one
    fill:    { volume: 0.06, gap: DIG_GAP_MS },   // the fill tool: dirt patted down
    welcome: { volume: 0.1, gap: 1000 }    // the Welcome Back window
  };
  const lastSynthAt = {};
  let noise = null;   // a second of white noise, shared

  function sfx(name) {
    const spec = SYNTH[name];
    if (!on || !ctx || ctx.state !== 'running' || !spec) return;
    const nowMs = performance.now();
    if (nowMs - (lastSynthAt[name] || 0) < spec.gap) return;
    lastSynthAt[name] = nowMs;
    const out = ctx.createGain();
    out.gain.value = spec.volume;
    out.connect(sfxGain);
    MAKERS[name](ctx.currentTime, out);
  }

  // A tone from `f0` to `f1` Hz over `length` seconds, starting at `t`, fading out.
  function tone(t, out, { f0, f1 = f0, length, type = 'sine', peak = 1, attack = 0.003 }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  // A burst of filtered noise: `filter` 'lowpass', 'highpass' or 'bandpass'
  // at `f0` Hz (sliding to `f1`), lasting `length` seconds from `t`.
  function hiss(t, out, { filter = 'bandpass', f0, f1 = f0, q = 1, length, peak = 1, attack = 0.002 }) {
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const shape = ctx.createBiquadFilter();
    shape.type = filter;
    shape.Q.value = q;
    shape.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) shape.frequency.exponentialRampToValueAtTime(f1, t + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    source.connect(shape);
    shape.connect(gain);
    gain.connect(out);
    source.start(t, Math.random() * 0.5);
    source.stop(t + length + 0.02);
  }

  const MAKERS = {
    crumb: (t, out) => {
      hiss(t, out, { filter: 'bandpass', f0: 2500, q: 0.8, length: 0.04 });
      tone(t + 0.03, out, { f0: 900, f1: 1300, length: 0.05, peak: 0.6 });
    },
    queen: (t, out) => {
      tone(t, out, { f0: 700, f1: 380, length: 0.04 });
      hiss(t, out, { filter: 'lowpass', f0: 1200, length: 0.03, peak: 0.5 });
    },
    hatch: (t, out) => tone(t, out, { f0: 420, f1: 900, length: 0.04 }),
    seed: (t, out) => {
      for (let n = 0; n < 4; n++) hiss(t + n * 0.03 + Math.random() * 0.01, out, { filter: 'bandpass', f0: 3200 + Math.random() * 800, q: 3, length: 0.02 });
    },
    munch: (t, out) => {
      hiss(t, out, { filter: 'lowpass', f0: 900, length: 0.07 });
      hiss(t + 0.11, out, { filter: 'lowpass', f0: 800, length: 0.07 });
    },
    fungus: (t, out) => hiss(t, out, { filter: 'lowpass', f0: 1800, f1: 250, q: 4, length: 0.16, attack: 0.01 }),
    milk: (t, out) => tone(t, out, { f0: 1300, f1: 480, length: 0.09 }),
    replete: (t, out) => {
      hiss(t, out, { filter: 'lowpass', f0: 500, f1: 900, q: 6, length: 0.14, attack: 0.02 });
      hiss(t + 0.12, out, { filter: 'lowpass', f0: 900, f1: 400, q: 6, length: 0.18, attack: 0.02 });
    },
    raid: (t, out) => {
      tone(t, out, { f0: 95, f1: 50, length: 0.35 });
      tone(t + 0.3, out, { f0: 90, f1: 48, length: 0.45 });
    },
    bite: (t, out) => hiss(t, out, { filter: 'highpass', f0: 4000, length: 0.012 }),
    fall: (t, out) => {
      tone(t, out, { f0: 140, f1: 60, length: 0.14 });
      hiss(t, out, { filter: 'lowpass', f0: 400, length: 0.08, peak: 0.6 });
    },
    alarm: (t, out) => hiss(t, out, { filter: 'bandpass', f0: 700, f1: 2600, q: 2, length: 0.45, attack: 0.15 }),
    skitter: (t, out) => {
      for (let n = 0; n < 8; n++) hiss(t + n * 0.035 + Math.random() * 0.012, out, { filter: 'highpass', f0: 3500, length: 0.01 });
    },
    catch: (t, out) => {
      tone(t, out, { f0: 1319, length: 0.25, type: 'triangle' });
      tone(t + 0.08, out, { f0: 1760, length: 0.35, type: 'triangle' });
    },
    fanfare: (t, out) => {
      [523, 659, 784, 1047].forEach((f, n) => tone(t + n * 0.1, out, { f0: f, length: n === 3 ? 0.4 : 0.15, type: 'triangle' }));
    },
    rumble: (t, out) => {
      hiss(t, out, { filter: 'lowpass', f0: 160, f1: 70, q: 1, length: 1.0, attack: 0.15 });
      tone(t, out, { f0: 55, f1: 40, length: 0.9, attack: 0.1, peak: 0.6 });
    },
    fill: (t, out) => {
      hiss(t, out, { filter: 'lowpass', f0: 500, length: 0.05 });
      hiss(t + 0.09, out, { filter: 'lowpass', f0: 450, length: 0.05 });
    },
    welcome: (t, out) => {
      tone(t, out, { f0: 784, length: 0.3, type: 'triangle' });
      tone(t + 0.14, out, { f0: 1047, length: 0.45, type: 'triangle' });
    }
  };

  // A dig sound, not too often while the mouse drags.
  function dig() {
    const now = performance.now();
    if (now - lastDigAt < DIG_GAP_MS) return;
    lastDigAt = now;
    playAny(['dig', 'dig_alt1', 'dig_alt2'], 0.8);
  }

  // Which track should play: 'main', 'winter', 'rain' or 'fire'.
  function music(name) {
    if (name === wanted) return;
    wanted = name;
    updateMusic();
  }

  function track(name) {
    if (!tracks[name]) {
      const audio = new Audio(TRACKS[name].file);
      audio.loop = TRACKS[name].loop;
      audio.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(audio).connect(gain);
      gain.connect(name === 'party' ? ctx.destination : musicGain);   // (the party song skips the Music volume)
      if (name === 'boot') {
        // (hands over a little before it ends, so the two overlap)
        const handOver = () => { if (current === 'boot' && (audio.ended || audio.duration - audio.currentTime < BOOT_LEAD)) { bootDone = true; updateMusic(); } };
        audio.addEventListener('timeupdate', handOver);
        audio.addEventListener('ended', handOver);
      }
      tracks[name] = { audio, gain };
    }
    return tracks[name];
  }

  function updateMusic() {
    if (!on || !ctx || ctx.state !== 'running' || partying) return;
    let target = wanted;
    if (!booted) {
      booted = true;
      if (wanted === 'main') target = 'boot';   // opening on the main nest: the bootup track first
    }
    if (current === 'boot' && target === 'main' && !bootDone) return;   // (it leads into main as it ends)
    if (target === current) return;
    fadeTo(target);
  }

  // Fade the playing track out and `name` in.
  function fadeTo(name) {
    const now = ctx.currentTime;
    const fade = current ? MUSIC_FADE : 0.5;
    if (current) {
      const old = tracks[current];
      const was = current;
      ramp(old.gain.gain, 0, now, fade);
      setTimeout(() => { if (current !== was) old.audio.pause(); }, fade * 1000 + 150);
    }
    const next = track(name);
    if (TRACKS[name].fromStart) next.audio.currentTime = 0;   // (the others carry on from where they were)
    ramp(next.gain.gain, 1, now, fade);
    next.audio.play().catch(() => {});
    current = name;
  }

  // Move `param` from where it is now to `to` over `seconds`, along a quarter
  // sine (an equal-power fade: two tracks crossing stay as loud as one).
  function ramp(param, to, now, seconds) {
    const from = param.value;
    const steps = 32;
    const curve = new Float32Array(steps);
    for (let n = 0; n < steps; n++) {
      const t = n / (steps - 1);
      curve[n] = to > from ? from + (to - from) * Math.sin(t * Math.PI / 2) : to + (from - to) * Math.cos(t * Math.PI / 2);
    }
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);   // (stops a fade still going, where it is)
    else { param.cancelScheduledValues(0); param.setValueAtTime(from, now); }
    param.setValueCurveAtTime(curve, now + 0.001, seconds);
  }

  // The party song: the music fades out, the song plays once at the Music
  // volume's 100%, then the music comes back.
  function party() {
    if (!on || !wake() || ctx.state !== 'running') return;
    partying = true;
    if (current) {
      const old = tracks[current];
      ramp(old.gain.gain, 0, ctx.currentTime, 0.6);
      setTimeout(() => { if (partying) old.audio.pause(); }, 750);
      current = null;
    }
    const song = track('party');
    if (!song.done) {
      song.done = true;
      song.audio.addEventListener('ended', () => { partying = false; updateMusic(); });
    }
    song.audio.currentTime = 0;
    song.gain.gain.cancelScheduledValues(0);
    song.gain.gain.value = LEVEL.music;
    song.audio.play().catch(() => { partying = false; updateMusic(); });
  }

  function stopMusic() {
    for (const name in tracks) {
      tracks[name].audio.pause();
      tracks[name].gain.gain.cancelScheduledValues(0);
      tracks[name].gain.gain.value = 0;
    }
    current = null;
    partying = false;
  }

  return { setOn, setVolumes, unlock, play, playAny, press, release, dig, sfx, music, party, partying: () => partying, isOn: () => on, nowPlaying: () => current, musicTracks: () => tracks };   // (the last two for checking)
})();
