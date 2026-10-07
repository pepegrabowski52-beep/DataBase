/* Overload (insanedemon): electric cyan on black – 3x/4x wave corridors, mini and dual wave, 4x ship, 3x swing, teleport route changes. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const { col, pulse, enter, exit, stack, PAT, mirror, spd } = GD.LH;

  // colour change + flash at every section change
  const shift = (bg, g, p) => [col('bg', bg), col('g', g), pulse(p || '#00f0ff')];

  // ---- small grid toolkit (rows are stored bottom-up: g[row][col])
  const toG = (s) => {
    const L = s.split('\n').map((l) => l.trim()).filter((l) => l.length);
    const w = Math.max(...L.map((l) => l.length));
    return L.reverse().map((l) => (l + '.'.repeat(w - l.length)).split(''));
  };
  const toS = (g) => g.slice().reverse().map((r) => r.join('')).join('\n');
  // fill everything above the top-most and below the bottom-most solid cell of every column,
  // so a wave cannot slip past a channel along the ground or the top of the corridor
  const walled = (s) => {
    const g = toG(s);
    const H = g.length, W = g[0].length;
    for (let c = 0; c < W; c++) {
      let lo = 0, hi = H - 1;
      while (lo < H && g[lo][c] === '.') lo++;
      if (lo === H) continue;
      while (g[hi][c] === '.') hi--;
      for (let r = 0; r < lo; r++) g[r][c] = '#';
      for (let r = hi + 1; r < H; r++) g[r][c] = '#';
    }
    return toS(g);
  };
  // overlay single cells: [col, row (from the bottom), char]
  const put = (s, list) => {
    const g = toG(s);
    for (const [c, r, ch] of list) g[r][c] = ch;
    return toS(g);
  };
  // union of the free space of two channels of equal size
  const merge = (a, b) => {
    const A = toG(a), B = toG(b);
    return toS(A.map((row, r) => row.map((x, c) => {
      const y = B[r][c];
      if (x === '#') return y;
      if (y === '#') return x;
      return x === '.' ? y : x;
    })));
  };
  // floor row the channel of a walled wave segment ends at (lowest free row after its last walled column)
  const endF = (s) => {
    const g = toG(s);
    for (let c = g[0].length - 1; c >= 0; c--) {
      if (g.every((row) => row[c] === '.')) continue;
      let r = 0;
      while (g[r][c] === '#') r++;
      return r + (g[r][c] === '/' ? 1 : 0);
    }
    return 1;
  };
  // Wave channel builder (walled, `rows` high). F = lowest free row, w = width.
  // tokens: uN / dN = N columns of 45° slopes up / down, fN = flat, UN / DN = block staircase up / down,
  //         oN = open columns, xN = solid columns, wN = set width, jN = jump to floor row N
  const chan = (F, w, path, rows) => {
    rows = rows || 10;
    const cols = [];
    for (const tok of path.trim().split(/\s+/)) {
      const k = tok[0], n = tok.length > 1 ? +tok.slice(1) : 1;
      if (k === 'w') { w = n; continue; }
      if (k === 'j') { F = n; continue; }
      for (let i = 0; i < n; i++) {
        const c = Array(rows).fill('#');
        if (k === 'o') c.fill('.');
        else if (k === 'u') {
          for (let r = F; r <= F + w; r++) c[r] = '.';
          c[F] = '/'; c[F + w] = '[';
          F++;
        } else if (k === 'd') {
          for (let r = F - 1; r <= F + w - 1; r++) c[r] = '.';
          c[F - 1] = '&'; c[F + w - 1] = ']';
          F--;
        } else if (k === 'f') {
          for (let r = F; r < F + w; r++) c[r] = '.';
        } else if (k === 'U' || k === 'D') {
          F += k === 'U' ? 1 : -1;
          for (let r = F; r < F + w; r++) c[r] = '.';
        } else if (k !== 'x') throw new Error('chan: bad token ' + tok);
        if (F < 0 || F + w > rows || c.length !== rows) throw new Error('chan: out of corridor at ' + tok);
        cols.push(c);
      }
    }
    const g = [];
    for (let r = 0; r < rows; r++) g.push(cols.map((c) => c[r]));
    return toS(g);
  };

  // ---------------------------------------------------------------- wave 3x pieces
  const w1 = walled(GD.slopeWave({ len: 46, seed: 1772, width: 2, start: 1, minSeg: 2, maxSeg: 4 }));
  const F1 = endF(w1);
  // teleport trap: the channel climbs to the top, the blue portal drops the wave into a spiked tunnel below
  const tpA = (() => {
    const up = 7 - F1;
    const lead = `o1 f2 ${up > 0 ? 'u' + up : up < 0 ? 'd' + -up : ''} f3`;
    const upper = chan(F1, 2, `${lead} f7 x12`);
    const n = upper.split('\n')[0].length;
    const K = n - 17; // column of the blue portal (end of the climb + 3 flat)
    const lower = chan(1, 2, `x${K + 1} f3 u2 d2 U2 D2 f${n - K - 1 - 11}`);
    return put(merge(upper, lower), [[K, 8, 'K'], [K + 2, 2, 'W'], [K + 5, 1, '^'], [K + 12, 1, '^']]);
  })();

  GD.addLevel({
    id: 'overload', name: 'Overload', diff: 'insanedemon', stars: 14, color: '#00d0ff', song: 'overload',
    songDef: {
      name: 'Overload', bpm: 178, root: 54, scale: 'minor', prog: [0, 5, 3, 4], seed: 177,
      lead: 'saw', bass: 'driving', drums: 'four', arr: 'fast', loopFrom: 2,
    },
    settings: { bgStyle: 'grid', gStyle: 'tiles', bg: '#00141c', g: '#00060a', line: '#00e5ff', obj: '#e0fbff', spd: 2 },
    style: { main: 'block2', alt: 'block5' },
    map: [
      // [0] intro (cube 2x)
      [
        14, '^', 8, '^^', 8,
        `
        .......##.......
        ..^^...##...^^..
        `,
        6, '^^^', 6,
        shift('#001c28', '#000a10'),
        spd('3'),
      ],
      // [1] cube 3x: pillar climb, orb chain, a teleport onto a high rail
      [
        6, '^^^', 9,
        `
        ...............###..........
        ..........###..###..###.....
        ..^^^^....###^^###^^###^^^^.
        `,
        6,
        `
        ...o.....o.....o.......
        .......................
        ^^^^^^^^^^^^^^^^^^^^...
        `,
        6,
        `
        ...................................
        ..........W........................
        ..................^....^...........
        ........###################........
        ..K................................
        .....^^^^^^^^^^^^^^^^^^^^^^^^^^^...
        `,
        8,
      ],
      // [2] wave 3x: slope corridor, the teleport trap, block zig-zag
      [
        shift('#00222e', '#000c12', '#ffffff'),
        enter('V'),
        w1,
        tpA,
        walled(GD.waveRun({ len: 44, seed: 1773, width: 2, open: 3, fill: true })),
        exit('C'),
      ],
      // [9] outro (cube 1x)
      [
        6,
        spd('1'),
        shift('#00141c', '#00060a', '#ffffff'),
        8, '^', 9, '^', 12,
      ],
    ],
  }, 'nightmare');
})(typeof window !== 'undefined' ? window : globalThis);
