/* Endless mode: an infinite level stitched together from small chunks.
 * Every chunk (at every speed and seed it is used with) was proven beatable by tools/endless-check.js,
 * which writes the list of verified variants to js/endless-verified.js. Chunks start and end on the
 * ground in cube mode with a runway in between, so any order of them is beatable too. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const U = GD.U;
  const L = GD.LH;

  const spdCol = (n) => ['.' + n + '..', '.' + n + '..'].join('\n');
  const SEEDS = Array.from({ length: 16 }, (_, i) => 1000 + i * 37);

  // ---------------------------------------------------------------- chunk catalogue
  // tiers: [first, last] difficulty tier; speeds: speeds the chunk is tried at; seeded: generator chunk
  const CHUNKS = [
    // cube
    { id: 'spike1', tiers: [0, 4], speeds: [1, 2, 3, 4], make: () => ['^'] },
    { id: 'spike2', tiers: [0, 4], speeds: [1, 2, 3, 4], make: () => ['^^'] },
    { id: 'spike3', tiers: [2, 4], speeds: [2, 3, 4], make: () => ['^^^'] },
    { id: 'spike21', tiers: [1, 4], speeds: [1, 2, 3, 4], make: () => ['^^', 7, '^'] },
    { id: 'pillars', tiers: [0, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.pillars] },
    { id: 'platform', tiers: [0, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.platform] },
    { id: 'stairs', tiers: [0, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.stairs] },
    { id: 'gaps', tiers: [1, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.gaps] },
    { id: 'padspikes', tiers: [0, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.padspikes] },
    { id: 'padhigh', tiers: [1, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.padhigh, '..^^...\n.......\n.......\n.......'] },
    { id: 'orbpit', tiers: [1, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.orbpit] },
    { id: 'pinkorbs', tiers: [1, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.pinkorbs] },
    { id: 'ramp1', tiers: [0, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.ramp1] },
    { id: 'ramp2', tiers: [1, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.ramp2] },
    { id: 'ramp3', tiers: [1, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.ramp3] },
    { id: 'ramp4', tiers: [2, 4], speeds: [1, 2, 3, 4], make: () => [L.PAT.ramp4] },
    { id: 'hill', tiers: [0, 4], speeds: [1, 2, 3, 4], make: () => ['........^.........\n....(-######-)....'] },
    { id: 'towers', tiers: [2, 4], speeds: [1, 2, 3, 4], make: () => ['.....##......##....\n..^^^##^^^^^^##^^^.'] },
    { id: 'dashpit', tiers: [1, 4], speeds: [1, 2, 3, 4], make: () => ['.......................\n.......................\n..d....................\n.................####..\n..^^^^^^^^^^^^^^^^^^^^^'] },
    { id: 'mini', tiers: [1, 4], speeds: [1, 2], make: () => ['.m.\n...', 8, ',', 7, ',,', 7, '..^##^^...^##^...', 8, '.M.\n...'] },
    // flying and other modes
    { id: 'ship', tiers: [0, 1], speeds: [1], seeded: true,
      make: (seed) => [L.enter('S'), GD.gates({ len: 50, seed, gap: 5, every: 9, maxStep: 2, lead: 6 }), L.exit('C')] },
    { id: 'ship2', tiers: [1, 4], speeds: [1, 2, 3], seeded: true,
      make: (seed) => [L.enter('S'), GD.gates({ len: 50, seed, gap: 4, every: 8, maxStep: 2, lead: 6 }), L.exit('C')] },
    { id: 'ship4', tiers: [3, 4], speeds: [3, 4], seeded: true,
      make: (seed) => [L.enter('S'), GD.gates({ len: 60, seed, gap: 5, every: 10, maxStep: 2, lead: 8 }), L.exit('C')] },
    { id: 'ufo', tiers: [1, 4], speeds: [1, 2], seeded: true,
      make: (seed) => [L.enter('U'), GD.gates({ len: 50, seed, gap: 5, every: 8, maxStep: 2, lead: 6 }), L.exit('C')] },
    { id: 'wave', tiers: [1, 2], speeds: [1, 2], seeded: true,
      make: (seed) => [L.enter('V'), GD.waveRun({ len: 44, seed, width: 4, open: 4, teeth: true }), L.exit('C')] },
    { id: 'wave3', tiers: [2, 4], speeds: [1, 2, 3], seeded: true,
      make: (seed) => [L.enter('V'), GD.waveRun({ len: 44, seed, width: 3, open: 4, teeth: true }), L.exit('C')] },
    { id: 'slopewave', tiers: [2, 4], speeds: [1, 2, 3], seeded: true,
      make: (seed) => [L.enter('V'), GD.slopeWave({ len: 44, seed, width: 3, teeth: true }), L.exit('C')] },
    { id: 'ball', tiers: [1, 4], speeds: [1, 2], seeded: true,
      make: (seed) => [L.enter('A'), 6, L.ball(46, seed), L.exit('C', 3, 8)] },
    { id: 'spider', tiers: [2, 4], speeds: [1, 2, 3], seeded: true,
      make: (seed) => [L.enter('D'), 6, L.spiderAlt(6, 3, 9, seed), L.exit('C', 1, 9)] },
    { id: 'swing', tiers: [2, 4], speeds: [1, 2, 3], seeded: true,
      make: (seed) => [L.enter('J'), GD.gates({ len: 44, seed, gap: 4, every: 7, maxStep: 2, lead: 8 }), L.exit('C')] },
    { id: 'robot', tiers: [2, 4], speeds: [1, 2], make: () => [L.enter('T'), 8, '..........#.........\n......#...#.........\n..#...#...#.........', 8, '^^^^', 9, L.enter('C')] },
  ];
  // chunks that are allowed in endless runs: `${id}@${speed}` -> verified seeds ([0] for unseeded chunks)
  const okList = () => GD.ENDLESS_OK || {};

  // ---------------------------------------------------------------- tiers
  const TIERS = [
    { from: 0, speeds: [1], bg: '#287dff', g: '#0066ff' },
    { from: 250, speeds: [1], bg: '#7a2cff', g: '#4a12c8' },
    { from: 650, speeds: [1, 2], bg: '#13a86a', g: '#065a38' },
    { from: 1200, speeds: [2, 3], bg: '#e05a14', g: '#7a2a06' },
    { from: 2000, speeds: [3, 4], bg: '#c41f3a', g: '#4a0610' },
  ];
  GD.ENDLESS_TIERS = TIERS;
  const tierAt = (blocks) => { let t = 0; while (t + 1 < TIERS.length && blocks >= TIERS[t + 1].from) t++; return t; };
  const RUNWAY = [6, 6, 7, 8, 10];

  class Endless {
    constructor(seed) {
      this.rng = U.rng(seed >>> 0 || 1);
      this.col = 14; // empty start
      this.speed = 1;
      this.tier = 0;
      this.left = 0; // chunks until the next speed change
      this.last = null;
      this.count = 0;
    }

    /** Pick and lay out the next chunk; returns parsed objects (absolute positions). */
    next() {
      const ok = okList();
      const tier = tierAt(this.col);
      const T = TIERS[tier];
      const entries = [];
      if (tier !== this.tier) {
        entries.push(L.col('bg', T.bg), L.col('g', T.g), L.pulse());
        this.tier = tier;
        this.left = 0;
      }
      if (this.left <= 0 || !T.speeds.includes(this.speed)) {
        const sp = T.speeds[Math.floor(this.rng() * T.speeds.length)];
        if (sp !== this.speed) { entries.push(4, spdCol(sp), 4); this.speed = sp; }
        this.left = 3 + Math.floor(this.rng() * 4);
      }
      this.left--;
      let pool = CHUNKS.filter((c) => tier >= c.tiers[0] && tier <= c.tiers[1] && ok[c.id + '@' + this.speed] && ok[c.id + '@' + this.speed].length);
      if (pool.length > 1) pool = pool.filter((c) => c.id !== this.last);
      // modes other than cube a bit less often than cube patterns, but regularly
      const modes = pool.filter((c) => c.seeded || c.id === 'robot' || c.id === 'mini');
      const cubes = pool.filter((c) => !modes.includes(c));
      const useMode = modes.length && (!cubes.length || this.rng() < 0.38);
      const list = useMode ? modes : cubes;
      const c = list[Math.floor(this.rng() * list.length)] || CHUNKS[0];
      const seeds = ok[c.id + '@' + this.speed] || [0];
      const seed = seeds[Math.floor(this.rng() * seeds.length)];
      entries.push(...c.make(seed), RUNWAY[this.speed]);
      this.last = c.id;
      this.count++;
      const objs = GD.parseMap(entries);
      const ox = this.col * 30;
      for (const o of objs) o.x += ox;
      this.col += GD.mapWidth(entries);
      return objs;
    }

    tierAt(blocks) {
      return tierAt(blocks);
    }

    /** Objects needed so that the level reaches at least column `toCol`. */
    until(toCol) {
      const out = [];
      while (this.col < toCol) out.push(...this.next());
      return out;
    }
  }

  GD.ENDLESS_CHUNKS = CHUNKS;
  GD.ENDLESS_SEEDS = SEEDS;
  GD.Endless = Endless;
  GD.endlessChunkMap = (id, speed, seed) => {
    const c = CHUNKS.find((x) => x.id === id);
    return c.make(seed);
  };
})(typeof window !== 'undefined' ? window : globalThis);
