/* Procedural music + sound effects with the Web Audio API.
 * Every level has its own song: drums, bass, pad, arpeggio and a generated lead melody. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const U = GD.U;

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  };

  // Section template shorthands
  const ARR = {
    std: [
      { bars: 4, parts: 'pad hat arp' },
      { bars: 4, parts: 'pad hat kick bass arp roll rise' },
      { bars: 16, parts: 'kick snare hat bass lead pad arp crash fill' },
      { bars: 8, parts: 'pad arp lead2 hat bass rise' },
      { bars: 16, parts: 'kick snare hat bass lead2 pad arp crash ohat fill harm' },
      { bars: 8, parts: 'kick snare hat bass arp pad crash' },
    ],
    fast: [
      { bars: 2, parts: 'pad arp' },
      { bars: 4, parts: 'pad arp kick hat roll bass rise' },
      { bars: 16, parts: 'kick snare hat bass lead pad arp crash fill' },
      { bars: 4, parts: 'pad arp bass hat rise' },
      { bars: 16, parts: 'kick snare hat ohat bass lead2 pad arp crash fill harm' },
      { bars: 8, parts: 'kick snare hat bass lead pad crash fill' },
    ],
    chill: [
      { bars: 4, parts: 'pad arp' },
      { bars: 8, parts: 'pad arp lead' },
      { bars: 8, parts: 'pad arp lead2 bass' },
    ],
    menu: [
      { bars: 4, parts: 'pad arp hat' },
      { bars: 8, parts: 'kick snare hat bass lead pad arp' },
      { bars: 8, parts: 'kick snare hat bass lead2 pad arp' },
    ],
  };

  const SONGS = {
    neon: { name: 'Neon Steps', bpm: 140, root: 57, scale: 'minor', prog: [0, 5, 2, 6], seed: 11, lead: 'saw', bass: 'offbeat', drums: 'four', arr: 'std', loopFrom: 2 },
    back: { name: 'Back Beat', bpm: 128, root: 60, scale: 'major', prog: [0, 4, 5, 3], seed: 23, lead: 'square', bass: 'octave', drums: 'four', arr: 'std', loopFrom: 2 },
    polar: { name: 'Polar Pulse', bpm: 136, root: 52, scale: 'minor', prog: [0, 3, 6, 2], seed: 37, lead: 'chip', bass: 'driving', drums: 'four', arr: 'std', loopFrom: 2 },
    dry: { name: 'Dry Circuit', bpm: 150, root: 50, scale: 'dorian', prog: [0, 3, 0, 6], seed: 41, lead: 'saw', bass: 'syncop', drums: 'half', arr: 'std', loopFrom: 2 },
    base: { name: 'Base Line', bpm: 145, root: 55, scale: 'minor', prog: [0, 5, 6, 4], seed: 53, lead: 'square', bass: 'offbeat', drums: 'four', arr: 'std', loopFrom: 2 },
    rolling: { name: 'Rolling Thunder', bpm: 160, root: 54, scale: 'minor', prog: [0, 5, 3, 4], seed: 67, lead: 'saw', bass: 'driving', drums: 'break', arr: 'fast', loopFrom: 2 },
    hover: { name: 'Hover Drive', bpm: 132, root: 58, scale: 'major', prog: [0, 2, 3, 4], seed: 71, lead: 'chip', bass: 'octave', drums: 'four', arr: 'std', loopFrom: 2 },
    wave: { name: 'Time Bender', bpm: 140, root: 49, scale: 'minor', prog: [0, 5, 6, 4], seed: 83, lead: 'saw', bass: 'wobble', drums: 'half', arr: 'std', loopFrom: 2 },
    cycle: { name: 'Cycle Core', bpm: 150, root: 52, scale: 'phrygian', prog: [0, 1, 0, 6], seed: 97, lead: 'square', bass: 'syncop', drums: 'break', arr: 'fast', loopFrom: 2 },
    hyper: { name: 'Hyper Drive', bpm: 170, root: 57, scale: 'minor', prog: [0, 5, 3, 4], seed: 101, lead: 'saw', bass: 'driving', drums: 'break', arr: 'fast', loopFrom: 2 },
    slope: { name: 'Slope Rush', bpm: 142, root: 53, scale: 'dorian', prog: [0, 6, 3, 4], seed: 131, lead: 'chip', bass: 'syncop', drums: 'four', arr: 'std', loopFrom: 2 },
    twin: { name: 'Twin Peaks', bpm: 150, root: 56, scale: 'minor', prog: [0, 3, 4, 5], seed: 139, lead: 'square', bass: 'octave', drums: 'break', arr: 'std', loopFrom: 2 },
    glass: { name: 'Looking Glass', bpm: 138, root: 61, scale: 'harmonic', prog: [0, 5, 3, 4], seed: 149, lead: 'pluck', bass: 'driving', drums: 'half', arr: 'std', loopFrom: 2 },
    velocity: { name: 'Velocity', bpm: 180, root: 52, scale: 'minor', prog: [0, 6, 5, 4], seed: 157, lead: 'saw', bass: 'driving', drums: 'break', arr: 'fast', loopFrom: 2 },
    demon: { name: 'Demon Gate', bpm: 175, root: 50, scale: 'harmonic', prog: [0, 5, 1, 4], seed: 113, lead: 'square', bass: 'wobble', drums: 'break', arr: 'fast', loopFrom: 2 },
    endless: { name: 'Endless', bpm: 160, root: 55, scale: 'minor', prog: [0, 5, 3, 6], seed: 199, lead: 'saw', bass: 'driving', drums: 'break', arr: 'fast', loopFrom: 2 },
    menu: { name: 'Menu Loop', bpm: 122, root: 53, scale: 'major', prog: [0, 5, 3, 4], seed: 7, lead: 'chip', bass: 'octave', drums: 'four', arr: 'menu', loopFrom: 1 },
    practice: { name: 'Practice', bpm: 96, root: 60, scale: 'major', prog: [0, 3, 5, 4], seed: 5, lead: 'pluck', bass: 'long', drums: 'none', arr: 'chill', loopFrom: 0 },
    editor: { name: 'Editor', bpm: 110, root: 57, scale: 'dorian', prog: [0, 3, 6, 4], seed: 3, lead: 'pluck', bass: 'long', drums: 'none', arr: 'chill', loopFrom: 0 },
  };
  GD.SONGS = SONGS;
  // levels in js/levels/ bring their own song definition (def.songDef)
  for (const def of GD.LEVELS || []) if (def.songDef && !SONGS[def.song]) SONGS[def.song] = def.songDef;
  GD.SONG_LIST = (GD.LEVELS || []).map((l) => l.song).filter((id, i, a) => SONGS[id] && a.indexOf(id) === i);

  const DRUMS = {
    four: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', ohat: '......x.......x.' },
    half: { kick: 'x.........x.....', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' },
    break: { kick: 'x.........x..x..', snare: '....x.......x...', hat: 'x.xxx.x.x.xxx.x.', ohat: '......x.........' },
    none: { kick: '', snare: '', hat: '', ohat: '' },
  };

  const RHYTHMS = [
    // [step, length] pairs over 2 bars (32 steps)
    [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2], [16, 3], [19, 3], [22, 2], [24, 6]],
    [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4], [16, 2], [18, 2], [20, 4], [24, 4], [28, 4]],
    [[0, 4], [4, 2], [6, 2], [8, 3], [11, 3], [14, 2], [16, 4], [20, 4], [24, 2], [26, 2], [28, 4]],
    [[0, 3], [3, 1], [4, 2], [6, 2], [8, 6], [16, 3], [19, 1], [20, 2], [22, 2], [24, 8]],
    [[0, 2], [3, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2], [16, 2], [19, 2], [22, 2], [24, 4], [28, 2], [30, 2]],
  ];

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /** Build the note material for a song (chords, melody, arpeggio) from its seed. */
  function compose(def) {
    const rnd = U.rng(def.seed * 7919 + 13);
    const sc = SCALES[def.scale] || SCALES.minor;
    const deg = (d) => {
      const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
      return def.root + sc[i] + o * 12;
    };
    const chords = def.prog.map((d) => [deg(d), deg(d + 2), deg(d + 4)]);
    const mkMelody = (variant) => {
      const rhythm = RHYTHMS[Math.floor(rnd() * RHYTHMS.length)];
      // motif as scale-degree offsets relative to chord root degree
      let cur = 4 + Math.floor(rnd() * 3);
      const motif = rhythm.map(([st, len], i) => {
        const strong = st % 4 === 0;
        if (strong) cur = [0, 2, 4, 7][Math.floor(rnd() * 4)] + (rnd() < 0.3 ? 2 : 0);
        else cur += rnd() < 0.5 ? (rnd() < 0.5 ? -1 : 1) : rnd() < 0.5 ? -2 : 2;
        cur = U.clamp(cur, -1, 9);
        return { st, len, d: cur, i };
      });
      const bars = [];
      for (let b = 0; b < 8; b++) {
        const half = b % 2;
        const chordDeg = def.prog[b % def.prog.length];
        const notes = [];
        for (const n of motif) {
          if ((n.st >= 16) !== !!half) continue;
          let d = n.d;
          if (variant && b >= 6 && n.i >= motif.length - 3) d += variant;
          if (b === 7 && n.i === motif.length - 1) d = 7;
          notes.push({ st: n.st % 16, len: n.len, m: deg(chordDeg + d) + 12, dg: chordDeg + d });
        }
        bars.push(notes);
      }
      return bars;
    };
    return { chords, mel: mkMelody(0), mel2: mkMelody(2), deg };
  }

  const A = {
    ctx: null,
    musicVol: 0.8,
    sfxVol: 0.8,
    cur: null,
    kicks: [],

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      }
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
      } catch (e) {
        return false;
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(c.destination);
      this.musicGain = c.createGain();
      this.sfxGain = c.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.setVolumes(this.musicVol, this.sfxVol);
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const irLen = Math.floor(c.sampleRate * 1.8);
      this.ir = c.createBuffer(2, irLen, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const b = this.ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
      }
      this.timer = setInterval(() => this.tick(), 25);
      return true;
    },

    setVolumes(m, s) {
      this.musicVol = m;
      this.sfxVol = s;
      if (!this.ctx) return;
      this.musicGain.gain.setTargetAtTime(m * m * 0.7, this.ctx.currentTime, 0.02);
      this.sfxGain.gain.setTargetAtTime(s * s, this.ctx.currentTime, 0.02);
    },

    // ------------------------------------------------------------------ playback
    play(id, opts) {
      if (!this.ctx) return;
      opts = opts || {};
      this.stop(opts.fade);
      const def = Object.prototype.hasOwnProperty.call(SONGS, id) ? SONGS[id] : SONGS.neon;
      if (!def._c) def._c = compose(def);
      const c = this.ctx;
      const bus = c.createGain();
      bus.gain.value = 0;
      bus.gain.setTargetAtTime(1, c.currentTime, opts.fadeIn || 0.01);
      bus.connect(this.musicGain);
      const pump = c.createGain();
      pump.connect(bus);
      // one shared reverb: building a ConvolverNode with a long impulse response stalls the main thread,
      // and this runs on every attempt; each song only gets its own send into it
      if (!this.revNode) {
        this.revNode = c.createConvolver();
        this.revNode.buffer = this.ir;
        const out = c.createGain();
        out.gain.value = 0.22;
        this.revNode.connect(out).connect(this.musicGain);
      }
      const rev = c.createGain();
      rev.connect(this.revNode);
      const dly = c.createDelay(1);
      dly.delayTime.value = (60 / def.bpm) * 0.75;
      const fb = c.createGain();
      fb.gain.value = 0.28;
      const dlyG = c.createGain();
      dlyG.gain.value = 0.22;
      dly.connect(fb).connect(dly);
      dly.connect(dlyG).connect(bus);
      const start = c.currentTime + 0.06;
      this.cur = { id, def, bus, pump, rev, dly, start, step: 0, next: start, spb: 60 / def.bpm / 4 };
      this.kicks = [];
      if (opts.offset) {
        const steps = Math.floor(opts.offset / this.cur.spb);
        this.cur.step = steps;
        this.cur.start = start - steps * this.cur.spb;
      }
      this.tick();
    },

    stop(fade) {
      if (!this.cur || !this.ctx) return;
      const bus = this.cur.bus, rev = this.cur.rev;
      const t = this.ctx.currentTime;
      // close this song's reverb send (the tail already in the shared reverb fades out naturally)
      rev.gain.cancelScheduledValues(t);
      rev.gain.setValueAtTime(rev.gain.value, t);
      rev.gain.linearRampToValueAtTime(0, t + (fade || 0.04));
      setTimeout(() => { try { rev.disconnect(); } catch (e) { /* ignore */ } }, ((fade || 0.04) + 0.3) * 1000);
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + (fade || 0.04));
      setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, ((fade || 0.04) + 0.3) * 1000);
      this.cur = null;
      this.kicks = [];
    },

    time() {
      if (!this.cur || !this.ctx) return 0;
      return this.ctx.currentTime - this.cur.start;
    },

    pulse() {
      if (!this.ctx || !this.cur) return 0;
      const now = this.ctx.currentTime;
      let last = -1;
      for (const k of this.kicks) if (k <= now && k > last) last = k;
      if (this.kicks.length > 16) this.kicks = this.kicks.filter((k) => k > now - 1);
      if (last < 0) return 0;
      return Math.exp(-(now - last) * 7);
    },

    tick() {
      const cur = this.cur;
      if (!cur || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (cur.next < now - 0.05) {
        // timers were throttled (background tab): skip missed steps instead of playing them all at once
        cur.step = Math.ceil((now - cur.start) / cur.spb);
        cur.next = cur.start + cur.step * cur.spb;
      }
      const ahead = now + 0.14;
      while (cur.next < ahead) {
        this.schedule(cur, cur.step, Math.max(cur.next, this.ctx.currentTime));
        cur.step++;
        cur.next = cur.start + cur.step * cur.spb;
      }
    },

    section(def, bar) {
      const arr = ARR[def.arr] || ARR.std;
      let total = 0;
      for (const s of arr) total += s.bars;
      let b = bar;
      if (b >= total) {
        let loopStart = 0;
        for (let i = 0; i < def.loopFrom; i++) loopStart += arr[i].bars;
        const loopLen = total - loopStart;
        b = loopStart + ((b - loopStart) % loopLen);
      }
      let acc = 0;
      for (const s of arr) {
        if (b < acc + s.bars) return { parts: s.parts, first: b === acc, barIn: b - acc, bars: s.bars };
        acc += s.bars;
      }
      return { parts: '', first: false, barIn: 0, bars: 1 };
    },

    schedule(cur, step, t) {
      const def = cur.def, C = def._c;
      const bar = Math.floor(step / 16), st = step % 16;
      const sec = this.section(def, bar);
      const has = (p) => sec.parts.indexOf(p) !== -1;
      const dr = DRUMS[def.drums] || DRUMS.four;
      const chord = C.chords[bar % C.chords.length];
      const beat = cur.spb;

      if (has('kick') && dr.kick[st] === 'x') {
        this.kick(cur.bus, t, 0.95);
        this.kicks.push(t);
        cur.pump.gain.cancelScheduledValues(t);
        cur.pump.gain.setValueAtTime(0.35, t);
        cur.pump.gain.linearRampToValueAtTime(1, t + beat * 2.6);
      }
      if (has('roll') && sec.barIn === sec.bars - 1 && st >= 8 && st % 2 === 0) this.snare(cur.bus, t, 0.25 + st * 0.03);
      if (has('snare') && dr.snare[st] === 'x') this.snare(cur.bus, t, 0.6);
      if (has('hat') && dr.hat[st] === 'x') this.hat(cur.bus, t, st % 4 === 2 ? 0.22 : 0.13, false);
      if (has('ohat') && dr.ohat[st] === 'x') this.hat(cur.bus, t, 0.16, true);
      if (has('crash') && sec.first && st === 0) { this.crash(cur.bus, t); if (bar > 0) this.boom(cur.bus, t); }
      // noise riser over the last bar before a drop
      if (has('rise') && sec.barIn === sec.bars - 1 && st === 0) this.riser(cur.bus, t, beat * 16);
      // snare fill at the end of every 8 bars
      if (has('fill') && sec.barIn % 8 === 7 && st >= 12) this.snare(cur.bus, t, 0.3 + (st - 12) * 0.1);
      if (!has('kick') && def.drums !== 'none' && st % 4 === 0) this.kicks.push(t);

      if (has('bass')) {
        const r = chord[0] - 24;
        const bp = def.bass;
        if (bp === 'offbeat' && st % 4 === 2) this.bass(cur.pump, t, mtof(r), beat * 1.6, 0.5);
        else if (bp === 'octave' && st % 2 === 0) this.bass(cur.pump, t, mtof(st % 4 === 0 ? r : r + 12), beat * 1.6, 0.45);
        else if (bp === 'driving' && st % 2 === 0) this.bass(cur.pump, t, mtof(r), beat * 1.5, 0.45);
        else if (bp === 'syncop' && 'x..x..x...x..x..'[st] === 'x') this.bass(cur.pump, t, mtof(st === 10 ? r + 7 : r), beat * 2.4, 0.5);
        else if (bp === 'wobble' && st % 4 === 0) this.bass(cur.pump, t, mtof(r), beat * 3.8, 0.55, true);
        else if (bp === 'long' && st === 0) this.bass(cur.pump, t, mtof(r), beat * 15, 0.35);
      }
      if (has('pad') && st === 0) this.pad(cur.pump, cur.rev, t, chord.map((m) => mtof(m)), beat * 16);
      if (has('arp')) {
        const seq = [0, 1, 2, 1, 0, 2, 1, 2];
        const n = chord[seq[(step >> 1) % seq.length]] + 12 + (st >= 8 && st < 12 ? 12 : 0);
        if (st % 2 === 0) this.pluck(cur.pump, cur.dly, t, mtof(n), beat * 1.6, def.drums === 'none' ? 0.2 : 0.12);
      }
      const leadPart = has('lead2') ? 'mel2' : has('lead') ? 'mel' : null;
      if (leadPart) {
        const notes = C[leadPart][bar % 8];
        for (const nt of notes) {
          if (nt.st !== st) continue;
          this.lead(cur.bus, cur.rev, cur.dly, t, mtof(nt.m), nt.len * beat * 0.92, def.lead);
          // second voice a third below in the big sections
          if (has('harm')) this.lead(cur.bus, cur.rev, cur.dly, t, mtof(C.deg(nt.dg - 2) + 12), nt.len * beat * 0.92, def.lead, 0.45);
        }
      }
    },

    // ------------------------------------------------------------------ instruments
    env(g, t, a, peak, dur, rel) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + Math.max(a, dur));
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
    },

    noiseSrc(t, dur) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise;
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur);
      return s;
    },

    kick(bus, t, v) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.45);
      const n = this.noiseSrc(t, 0.02), ng = c.createGain(), f = c.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 3000;
      ng.gain.setValueAtTime(v * 0.25, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      n.connect(f).connect(ng).connect(bus);
    },

    snare(bus, t, v) {
      const c = this.ctx;
      const n = this.noiseSrc(t, 0.25), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.6;
      g.gain.setValueAtTime(v * 0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      n.connect(f).connect(g).connect(bus);
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      og.gain.setValueAtTime(v * 0.5, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(og).connect(bus);
      o.start(t);
      o.stop(t + 0.12);
    },

    hat(bus, t, v, open) {
      const c = this.ctx;
      const d = open ? 0.22 : 0.045;
      const n = this.noiseSrc(t, d + 0.02), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'highpass'; f.frequency.value = 7500;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      n.connect(f).connect(g).connect(bus);
    },

    /** Rising filtered noise (build-up before a drop). */
    riser(bus, t, dur) {
      const c = this.ctx;
      const n = this.noiseSrc(t, dur), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.Q.value = 2.5;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(7000, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.97);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      n.connect(f).connect(g).connect(bus);
    },

    /** Deep sub hit on the first beat of a drop. */
    boom(bus, t) {
      const c = this.ctx;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.9);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 1.15);
    },

    crash(bus, t) {
      const c = this.ctx;
      const n = this.noiseSrc(t, 1.4), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'highpass'; f.frequency.value = 4500;
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      n.connect(f).connect(g).connect(bus);
    },

    bass(bus, t, f0, dur, v, wobble) {
      const c = this.ctx;
      const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = f0;
      o2.type = 'square'; o2.frequency.value = f0 / 2;
      f.type = 'lowpass'; f.Q.value = 7;
      f.frequency.setValueAtTime(2200, t);
      f.frequency.exponentialRampToValueAtTime(260, t + Math.min(dur, 0.25));
      if (wobble) {
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = 1 / (this.cur ? this.cur.spb * 2 : 0.2);
        lg.gain.value = 700;
        l.connect(lg).connect(f.frequency);
        f.frequency.setValueAtTime(900, t);
        l.start(t); l.stop(t + dur + 0.1);
      }
      const sg = c.createGain(); sg.gain.value = 0.5;
      this.env(g, t, 0.005, v * 0.55, dur * 0.85, 0.08);
      o.connect(f); o2.connect(sg).connect(f);
      f.connect(g).connect(bus);
      o.start(t); o2.start(t);
      o.stop(t + dur + 0.15); o2.stop(t + dur + 0.15);
    },

    pad(bus, rev, t, freqs, dur) {
      const c = this.ctx;
      const f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 0.5;
      this.env(g, t, 0.35, 0.09, dur - 0.4, 0.5);
      f.connect(g);
      g.connect(bus);
      g.connect(rev);
      for (const fr of freqs) {
        for (const det of [-9, 9]) {
          const o = c.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = fr;
          o.detune.value = det;
          o.connect(f);
          o.start(t);
          o.stop(t + dur + 0.6);
        }
      }
    },

    pluck(bus, dly, t, fr, dur, v) {
      const c = this.ctx;
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'square'; o.frequency.value = fr;
      f.type = 'lowpass';
      f.frequency.setValueAtTime(4200, t);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.15);
      this.env(g, t, 0.003, v, 0.02, Math.min(0.3, dur));
      o.connect(f).connect(g);
      g.connect(bus);
      g.connect(dly);
      o.start(t);
      o.stop(t + dur + 0.35);
    },

    lead(bus, rev, dly, t, fr, dur, type, level) {
      const c = this.ctx;
      const f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass';
      f.Q.value = 2;
      f.frequency.setValueAtTime(type === 'chip' ? 9000 : 5200, t);
      f.frequency.exponentialRampToValueAtTime(type === 'pluck' ? 900 : 2200, t + 0.3);
      const vol = (type === 'pluck' ? 0.16 : type === 'chip' ? 0.075 : 0.085) * (level || 1);
      this.env(g, t, 0.006, vol, Math.max(0.03, dur - 0.05), type === 'pluck' ? 0.35 : 0.12);
      f.connect(g);
      g.connect(bus);
      g.connect(rev);
      g.connect(dly);
      const types = type === 'saw' ? ['sawtooth', 'sawtooth'] : type === 'pluck' ? ['triangle', 'square'] : ['square', 'square'];
      const dets = type === 'chip' ? [0, 1200] : [-11, 11];
      for (let i = 0; i < 2; i++) {
        const o = c.createOscillator();
        o.type = types[i];
        o.frequency.value = fr;
        o.detune.value = dets[i];
        if (type === 'chip' && i === 1) { const og = c.createGain(); og.gain.value = 0.3; o.connect(og).connect(f); }
        else o.connect(f);
        const vib = c.createOscillator(), vg = c.createGain();
        vib.frequency.value = 5.5; vg.gain.value = dur > 0.3 ? 9 : 0;
        vib.connect(vg).connect(o.detune);
        vib.start(t + 0.12); vib.stop(t + dur + 0.2);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    },

    // ------------------------------------------------------------------ sfx
    sfx(name) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime + 0.005, out = this.sfxGain;
      const tone = (type, f0, f1, dur, v, at) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t + (at || 0));
        if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (at || 0) + dur);
        g.gain.setValueAtTime(v, t + (at || 0));
        g.gain.exponentialRampToValueAtTime(0.0008, t + (at || 0) + dur);
        o.connect(g).connect(out);
        o.start(t + (at || 0));
        o.stop(t + (at || 0) + dur + 0.02);
      };
      const noise = (dur, v, f0, f1, type, at) => {
        const n = this.noiseSrc(t + (at || 0), dur + 0.05), f = c.createBiquadFilter(), g = c.createGain();
        f.type = type || 'lowpass';
        f.frequency.setValueAtTime(f0, t + (at || 0));
        if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + (at || 0) + dur);
        g.gain.setValueAtTime(v, t + (at || 0));
        g.gain.exponentialRampToValueAtTime(0.0008, t + (at || 0) + dur);
        n.connect(f).connect(g).connect(out);
      };
      switch (name) {
        case 'death':
          noise(0.55, 0.9, 5000, 120);
          tone('sine', 140, 38, 0.35, 0.8);
          tone('square', 300, 60, 0.18, 0.12);
          break;
        case 'coin':
          tone('square', 988, null, 0.08, 0.16);
          tone('square', 1319, null, 0.32, 0.16, 0.08);
          tone('sine', 2637, null, 0.25, 0.08, 0.08);
          break;
        case 'click':
          tone('triangle', 520, 880, 0.07, 0.35);
          break;
        case 'back':
          tone('triangle', 700, 380, 0.08, 0.3);
          break;
        case 'checkpoint':
          tone('sine', 880, 1320, 0.12, 0.25);
          break;
        case 'complete': {
          const notes = [523, 659, 784, 1047, 1319];
          notes.forEach((f, i) => tone('square', f, null, 0.35, 0.12, i * 0.08));
          tone('sawtooth', 1047, null, 0.9, 0.08, 0.42);
          noise(1.4, 0.25, 9000, 3000, 'highpass', 0.4);
          break;
        }
        case 'star':
          [784, 988, 1175, 1568].forEach((f, i) => tone('triangle', f, null, 0.3, 0.2, i * 0.07));
          break;
        case 'play':
          tone('square', 392, 784, 0.18, 0.15);
          tone('triangle', 784, 1568, 0.3, 0.2, 0.06);
          break;
        case 'unlock':
          [523, 784, 1047].forEach((f, i) => tone('square', f, null, 0.25, 0.12, i * 0.09));
          break;
      }
    },
  };

  GD.Audio = A;
})(typeof window !== 'undefined' ? window : globalThis);
