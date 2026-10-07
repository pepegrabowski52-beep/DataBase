/* Overload (insanedemon): electric cyan on black – 3x/4x wave corridors, mini and dual wave, 4x ship, 3x swing, teleport route changes. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const { col, pulse, enter, exit, stack, spd } = GD.LH;

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
      if (x === '.' || y === '.') return '.';
      return x === '#' ? y : x;
    })));
  };
  const width = (s) => toG(s)[0].length;
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
  const path = (from, to) => (to > from ? 'u' + (to - from) : to < from ? 'd' + (from - to) : 'f1');
  // "zapper": 2-wide flat channel at rows F..F+1 with one-row teeth alternating top / bottom every `pitch` columns
  const zapper = (F, n, pitch, lead) => {
    let s = chan(F, 2, `o2 f${n}`);
    const cells = [];
    for (let c = lead || 3, top = true; c < n - 1; c += pitch, top = !top) cells.push([c + 2, top ? F + 1 : F, '#']);
    return put(s, cells);
  };

  // speed portals are only 44 units high: a column of them every 37.5 units covers the whole corridor
  const sstack = (ch, rows) => {
    const H = (rows || 10) * 30, n = Math.ceil(H / 40), out = [];
    for (let i = 0; i < n; i++) out.push({ t: GD.ASCII[ch].t, at: 0, y: ((i + 0.5) * H) / n / 30 - 0.5 });
    out.push(1);
    return out;
  };
  // mirror a lower half to the top for dual sections (like GD.sym, but slopes are flipped too)
  const FLIP = { '^': 'v', v: '^', '/': ']', ']': '/', '&': '[', '[': '&' };
  const vsym = (lower) => {
    const L = lower.split('\n');
    return L.slice().reverse().map((l) => l.split('').map((c) => FLIP[c] || c).join('')).concat(L).join('\n');
  };

  // ---------------------------------------------------------------- [2] wave 3x pieces
  const w1 = walled(GD.slopeWave({ len: 46, seed: 1772, width: 2, start: 1, minSeg: 2, maxSeg: 4 }));
  // teleport trap: the channel climbs to the roof, the blue portal drops the wave into a toothed tunnel below
  const tpA = (() => {
    const F = endF(w1);
    const climb = path(F, 7);
    const K = 3 + (+climb.slice(1) || 1) + 3; // column of the blue portal: end of the climb + 3 flat columns
    const n = K + 1 + 20;
    // the upper channel runs on for 7 more columns (a dead end you never reach)
    const upper = chan(F, 2, `o1 f2 ${climb} f10 x${n - K - 7}`);
    const lower = chan(1, 2, `x${K + 1} f15 u3 f2`);
    return put(merge(upper, lower), [
      [K, 8, 'K'], [K + 2, 2, 'W'],
      [K + 5, 2, '#'], [K + 8, 1, '#'], [K + 11, 2, '#'], [K + 14, 1, '#'],
    ]);
  })();
  const w2 = walled(GD.waveRun({ len: 44, seed: 1773, width: 2, open: 3, fill: true, start: 4 }));
  const z1 = zapper(endF(w2), 30, 2, 3);
  const w3 = walled(GD.slopeWave({ len: 44, seed: 1775, width: 2, start: endF(z1) }));

  // ---------------------------------------------------------------- [7] dual wave (lower half, mirrored by vsym)
  const teeth = (c0, c1, F, pitch, top) => {
    const out = [];
    for (let c = c0; c < c1; c += pitch, top = !top) out.push([c, top ? F + 1 : F, '#']);
    return out;
  };
  const dual1 = vsym(put(chan(1, 2, 'o4 f20 D1 U1 U1 D1 D1 U1 f9 U1 D1 D1 U1 U1 D1 f13 D1 U1 U1 D1 f4 o2', 5),
    [...teeth(7, 23, 1, 2, true), ...teeth(34, 40, 1, 3, false), ...teeth(48, 57, 1, 2, true)]));

  // ---------------------------------------------------------------- [8] wave 4x finale
  const w4 = walled(GD.slopeWave({ len: 36, seed: 1804, width: 2, start: 3 }));
  // fork: the lower lane is the easy way, the upper lane hides coin 2
  const fork = (() => {
    const F = endF(w4);
    const main = chan(F, 2, `o2 ${path(F, 2)} f17 o1`);
    const n = width(main);
    const up = n - 1 - 2 - (+path(F, 2).slice(1) || 1) - 17;
    const lane = chan(F, 2, `o2 ${path(F, 2)} f${3 + up} u3 f5 d3 f${17 - 3 - up - 11} o1`);
    const c0 = 2 + (+path(F, 2).slice(1) || 1) + 3 + up; // first column of the climb
    return put(merge(main, lane), [[c0 + 5, 6, '$'], [c0 + 4, 3, '#'], [c0 + 6, 2, '#'], [c0 + 8, 3, '#']]);
  })();
  // teleport wall: the channel ends in a blue portal, the wave comes out at the roof in a row of teeth
  const tpB = (() => {
    const s = chan(2, 2, 'o2 u2 f5 x4 j7 f22 d5 f2');
    const K = 2 + 2 + 5 - 1;
    const cells = [[K, 5, 'K'], [K + 6, 8, 'W']];
    for (let c = K + 9, top = true; c < K + 26; c += 2, top = !top) cells.push([c, top ? 8 : 7, '#']);
    return put(s, cells);
  })();
  const w5 = walled(GD.waveRun({ len: 36, seed: 1782, width: 2, open: 3, fill: true, start: endF(tpB) }));

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
      // [1] cube 3x: pillar climb, pink orb chain, a teleport onto a high rail (coin 1: yellow orb above the rail)
      [
        6, '^^^', 9,
        `
        .................###.............
        ..........###....###....###......
        ..^^^^....###^^^^###^^^^###^^^^...
        `,
        6,
        `
        ....p....p....p....p.....
        ..^^^^^^^^^^^^^^^^^^^^...
        `,
        6,
        `
        ...................................
        ......................$............
        ...................................
        ..........W.......o................
        ...............^.......^...........
        ........####################.......
        ..K................................
        .....^^^^^^^^^^^^^^^^^^^^^^^^^^^...
        `,
        8,
      ],
      // [2] wave 3x: slope corridor, the teleport trap, block zig-zag – then 4x: zapper teeth and a slope run
      [
        shift('#00222e', '#000c12', '#ffffff'),
        enter('V'),
        w1,
        tpA,
        w2,
        shift('#002a3a', '#000e16', '#00f0ff'),
        sstack('4'),
        z1,
        w3,
      ],
      // [3] ship 4x: gates, a wall of electricity with a teleport, then 3x gap-3 gates
      [
        shift('#00102e', '#000616', '#40a0ff'),
        stack('S'),
        GD.gates({ len: 52, seed: 1792, gap: 4, every: 8, maxStep: 2, lead: 8 }),
        5,
        // the only way through the wall is the blue portal, it throws you to the bottom
        `
        ...##########........
        ...##########........
        ...##########........
        ....#########........
        ...K#########........
        ....#########........
        ...##########........
        ...##########.W......
        ...##########........
        ...##########........
        `,
        GD.gates({ len: 40, seed: 1793, gap: 4, every: 8, maxStep: 2 }),
        sstack('3'),
        GD.gates({ len: 44, seed: 1794, gap: 3, every: 7, maxStep: 2 }),
        // circuit trace: a stepped 3-high tunnel with sparks at the corners
        put(chan(3, 3, 'o3 f4 U1 f2 U1 f2 U1 f3 D1 f2 D1 f2 D1 f2 D1 f3 U1 f2 U1 f3 D1 f2 D1 f4 o2'),
          [[5, 3, '^'], [15, 8, 'v'], [21, 6, 'v'], [28, 2, '^'], [35, 6, 'v'], [42, 2, '^']]),
      ],
      // [4] mini wave 3x, then 4x
      [
        shift('#1a0030', '#0a0014', '#ff40ff'),
        stack('V'), stack('m'),
        GD.waveRun({ len: 44, seed: 1776, width: 4, slope: 2, open: 3, fill: true }),
        sstack('4'),
        GD.waveRun({ len: 40, seed: 1777, width: 4, slope: 2, open: 3, fill: true }),
        stack('M'),
        exit('C'),
      ],
      // [5] cube 4x, then 3x: block runs and a pillar staircase, a teleport drop off the high road
      [
        shift('#001c28', '#000a10'),
        8, '^^^', 12,
        `
        ...##.......##.......##.......
        ...##^^^^^^^##^^^^^^^##^^^^...
        `,
        8,
        `
        .........................................
        ..........#.......#.......#..............
        .....#....#...#...#...#...#....#.........
        ..^^^#^^^^#^^^#^^^#^^^#^^^#^^^^#^^^......
        `,
        spd('3'),
        8,
        `
        .............K..............................
        ................................................
        .......#########................................
        .......#########................................
        ...##..#########...................W............
        ^^.##^^#########^^^^^^^^^^^^^^^^^^..............
        `,
        8, '^^^', 10,
      ],
      // [6] swing 3x: gap-3 gates, pylons (coin 3 low between two pylons), then 4x
      [
        shift('#002a20', '#000e0a', '#40ffc0'),
        enter('J'),
        GD.gates({ len: 50, seed: 1801, gap: 3, every: 5, maxStep: 2, lead: 8 }),
        8,
        `
        ##########################################################
        ......#...........#...........#...........#...............
        ......#...........#...........#...........#...............
        ......#...........#...........#...........#...............
        ......#...........v...........#...........v...............
        ......v.......................v...........................
        ............^...........^...........^.........$...........
        ............#...........#...........#.....................
        ............#...........#...........#.....................
        ##########################################################
        `,
        sstack('4'),
        GD.gates({ len: 50, seed: 1802, gap: 4, every: 8, maxStep: 2, lead: 8 }),
      ],
      // [7] dual wave 3x
      [
        shift('#1c0a30', '#0a0414', '#c080ff'),
        sstack('3'), stack('N'), stack('V'), stack('Y'),
        dual1,
        stack('I'),
      ],
      // [8] wave 4x finale: slopes, the fork, a teleport wall, slopes
      [
        shift('#00222e', '#000c12', '#ffffff'),
        sstack('4'),
        w4,
        fork,
        tpB,
        w5,
        6,
        exit('C'),
      ],
      // [9] cube 4x sprint, then 3x
      [
        shift('#001c28', '#000a10'),
        8, '^^^', 12, '^^^', 10,
        '..^^^^......###^^^^^^^###......',
        10, '^^^^', 6,
        8,
        spd('3'),
        8,
        `
        .....o.....p.....o.......
        .........................
        ..^^^^^^^^^^^^^^^^^^^....
        `,
        8,
        `
        .........................
        .....r...................
        .........................
        ..^^^^^^^^^^^............
        `,
        8, '^^^', 10,
      ],
      // [10] outro (cube 1x)
      [
        spd('1'),
        shift('#00141c', '#00060a', '#ffffff'),
        8, '^', 9, '^', 12,
      ],
    ],
  }, 'nightmare');
})(typeof window !== 'undefined' ? window : globalThis);
