/* Event Horizon (extremedemon): the final boss – a black hole of red-orange fire. All 8 modes, mostly at 3x / 4x,
 * with dual, mirror, teleport, mini, gravity and dash orbs, narrow corridors, fast mode switches and a 4x finale. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const { col, pulse, enter, exit, stack, spiderAlt, spd } = GD.LH;

  // colour change + flash at every section change
  const shift = (bg, g, p) => [col('bg', bg), col('g', g), pulse(p || '#ff6a1a')];

  // ---- grid toolkit (rows are stored bottom-up: g[row][col])
  const toG = (s) => {
    const L = s.split('\n').map((l) => l.trim()).filter((l) => l.length);
    const w = Math.max(...L.map((l) => l.length));
    return L.reverse().map((l) => (l + '.'.repeat(w - l.length)).split(''));
  };
  const toS = (g) => g.slice().reverse().map((r) => r.join('')).join('\n');
  // fill everything above the top-most and below the bottom-most solid cell of every column
  // (a wave cannot slip past a channel along the ground or the top of the corridor)
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
  // Wave channel (`rows` high). F = lowest free row, w = width.
  // tokens: uN / dN = N columns of 45° slopes up / down, fN = flat, UN / DN = block step up / down,
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
        if (F < 0 || F + w > rows) throw new Error('chan: out of corridor at ' + tok);
        cols.push(c);
      }
    }
    const g = [];
    for (let r = 0; r < rows; r++) g.push(cols.map((c) => c[r]));
    return toS(g);
  };
  // Block tunnel for ship / UFO / swing (`rows` high): tokens "n:lo:gap[:pattern]" = n columns with free rows
  // lo..lo+gap-1; pattern (one char per column): ^ spike on the floor of the gap, v spike under its roof, x both
  const tunnel = (spec, rows) => {
    rows = rows || 10;
    const cols = [];
    for (const tok of spec.trim().split(/\s+/)) {
      const [a, b, c, pat] = tok.split(':');
      const n = +a, lo = +b, gap = +c;
      for (let i = 0; i < n; i++) {
        const cl = Array(rows).fill('#');
        for (let r = lo; r < lo + gap && r < rows; r++) cl[r] = '.';
        const k = pat && pat[i];
        if (k === '^' || k === 'x') cl[lo] = '^';
        if (k === 'v' || k === 'x') cl[lo + gap - 1] = 'v';
        cols.push(cl);
      }
    }
    const g = [];
    for (let r = 0; r < rows; r++) g.push(cols.map((c) => c[r]));
    return toS(g);
  };
  // add solid rows below and above a section (a flying band inside the 10-high corridor); the open lead-in and
  // run-out columns stay open
  const framed = (s, below, above) => {
    const g = toG(s);
    const W = g[0].length;
    const solid = (c) => g.some((row) => row[c] !== '.');
    let c0 = 0, c1 = W - 1;
    while (c0 < W && !solid(c0)) c0++;
    while (c1 > 0 && !solid(c1)) c1--;
    const row = () => Array.from({ length: W }, (_, c) => (c >= c0 && c <= c1 ? '#' : '.'));
    for (let i = 0; i < below; i++) g.unshift(row());
    for (let i = 0; i < above; i++) g.push(row());
    return toS(g);
  };
  // speed portals are only 44 units high: a column of them every 37.5 units covers a whole corridor
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

  // ---------------------------------------------------------------- [3] wave 4x pieces
  const wv1 = walled(GD.slopeWave({ len: 46, seed: 1813, width: 2, start: 3 }));
  const wv2 = walled(GD.slopeWave({ len: 44, seed: 1814, width: 2, start: endF(wv1) }));

  // ---------------------------------------------------------------- [9] dual wave 4x (lower half, mirrored by vsym)
  const teeth = (c0, c1, F, pitch, top) => {
    const out = [];
    for (let c = c0; c < c1; c += pitch, top = !top) out.push([c, top ? F + 1 : F, '#']);
    return out;
  };
  // channel: o3 f10 (cols 3-12, F=1) U1 f6 (14-19, F=2) D1 f10 (21-30, F=1) U1 f8 (32-39, F=2) D1 f10 (41-50, F=1) o2
  const dualW = vsym(put(chan(1, 2, 'o3 f10 U1 f6 D1 f10 U1 f8 D1 f10 o2', 5),
    [...teeth(5, 12, 1, 3, true), ...teeth(15, 19, 2, 3, false), ...teeth(22, 30, 1, 2, true),
      ...teeth(33, 39, 2, 3, false), ...teeth(42, 50, 1, 3, true)]));

  // ---------------------------------------------------------------- [11] finale pieces (4x)
  // wave: slopes, ends at floor row 3 so the ship tunnel lines up
  // (flat stretches at cols 5-6 / 20-21 / 25-26 / 35-37 carry one-block teeth, so holding or idling all the way dies)
  const fw1 = put(walled(chan(3, 2, 'o2 u3 f2 d4 f1 u2 d2 u4 f2 d3 f2 u1 d1 u3 d3 f3 o1')),
    [[6, 7, '#'], [21, 6, '#'], [26, 3, '#'], [37, 4, '#']]);
  // ship: gap-3 tunnel (coin 3 in a pocket in the roof)
  const fs1 = put(tunnel('3:0:10 3:2:5 4:3:3 3:4:3:..v 4:5:3 3:4:3:.^. 4:3:3 3:2:3 3:3:3:..v 4:4:3 3:5:3 4:6:3 3:5:3:.^. 4:4:3 3:3:4 2:0:10'),
    [[34, 8, '.'], [35, 8, '$'], [36, 8, '.']]);

  // finale wave: slopes into a dead end, the blue portal throws the wave to the roof, toothed run, slopes down
  const ftp = (() => {
    const s = chan(3, 2, 'o2 u2 f4 x3 j7 f18 d4 u1 d2 f3 o1');
    const K = 2 + 2 + 4 - 1;
    const cells = [[K, 5, 'K'], [K + 5, 7, 'W']];
    for (let c = K + 8, top = true; c < K + 22; c += 3, top = !top) cells.push([c, top ? 8 : 7, '#']);
    return put(s, cells);
  })();
  const fw2 = walled(GD.slopeWave({ len: 30, seed: 1826, width: 2, start: endF(ftp) }));

  GD.addLevel({
    id: 'horizon', name: 'Event Horizon', diff: 'extremedemon', stars: 15, color: '#ff3a1a', song: 'horizon',
    songDef: {
      name: 'Event Horizon', bpm: 190, root: 50, scale: 'harmonic', prog: [0, 5, 3, 4], seed: 181,
      lead: 'saw', bass: 'wobble', drums: 'break', arr: 'fast', loopFrom: 2,
    },
    settings: { bgStyle: 'circles', gStyle: 'stripes', bg: '#0a0100', g: '#020000', line: '#ff5a14', obj: '#ffc8a0', spd: 2 },
    style: { main: 'block5', alt: 'block3' },
    map: [
      // [0] intro (cube 2x): the pull of the black hole
      [
        12, '^', 7, '^^', 7,
        `
        ........##........
        ..^^....##....^^^.
        `,
        5,
      ],
      // [1] cube 3x: a spike run, a pillar climb, then dash orbs: a 45° dash up onto a ledge under a roof, a straight
      //     dash under spikes, a 45° dash down under a wall, a gravity dash onto the ceiling (coin 1: jump down off the ceiling)
      [
        shift('#140300', '#040000'),
        spd('3'),
        4, '^^^^', 7,
        `
        .............###.......
        ........###..###..###..
        ...###..###..###..###..
        ^^^###^^###^^###^^###^^
        `,
        3,
        `
        ##############################################
        .....................#########################
        .....................vvvvvvvvvvv##############
        ......############..............##############
        .....................d.......f...#############
        ..............................................
        ..e...........................................
        ..............................................
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^......^^^^.....
        `,
        2,
        `
        #########################################.......
        ............vv.......vvv........vvv.....N.......
        ................................................
        ...........................$....................
        ................................................
        ................................................
        ..q.............................................
        ................................................
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^.......
        `,
        4,
      ],
      // [2] ship 3x: gap-3 snake tunnel, mirror, gap-3 gates, a wall with a teleport, then 4x gates
      [
        shift('#180200', '#050000', '#ff9030'),
        enter('S'),
        tunnel('4:0:10 3:1:6 3:2:4 3:3:3 3:4:3:..v 3:5:3 3:6:3:.^ 3:5:3 3:4:3:..^ 3:3:3 3:2:3:.v 3:3:3 3:4:3 3:3:4 2:0:10'),
        stack('Z'),
        GD.gates({ len: 36, seed: 1811, gap: 3, every: 6, maxStep: 2, lead: 3 }),
        3,
        // the only way through the wall is the blue portal
        `
        ...##########..........
        ...##########..........
        ...##########..........
        ...##########..........
        ...K#########..........
        ....#########..........
        ...##########..........
        ...##########..W.......
        ...##########..........
        ...##########..........
        `,
        sstack('4'),
        GD.gates({ len: 34, seed: 1812, gap: 4, every: 7, maxStep: 2, lead: 4 }),
      ],
      // [3] wave 4x (mirrored): a width-2 slope corridor, then the same as a mini wave
      [
        shift('#160004', '#050001', '#ff3a1a'),
        stack('V'),
        wv1,
        stack('m'),
        wv2,
        stack('M'),
        stack('z'),
        sstack('3'),
        exit('A', 4, 10),
      ],
      // [4] ball 3x: a narrow spiked channel, a dash across a field of spikes
      [
        shift('#1a0500', '#060100', '#ffb030'),
        `
        ......]#########################################[.......
        .......]#######################################[........
        ...........vv.....vv.....vvv.....vv.....vv..............
        ........................................................
        ........................................................
        ..............^^.....^^.......^^.....^^^....^^..........
        ......./#######################################&........
        ....../#########################################&.......
        `,
        `
        ......vvvvvvvvvvvvvvvvvvvvvvvvvvv.............
        ..............................................
        ..............................................
        ........d.....................................
        ..............................................
        ..............................................
        ..............................................
        ......^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^.........
        `,
        exit('U', 4, 8),
      ],
      // [5] UFO 3x: dense gap-4 gates
      [
        shift('#160200', '#050000', '#ff7030'),
        GD.gates({ len: 62, seed: 1825, gap: 4, every: 6, maxStep: 2, lead: 3, tail: 8 }),
        exit('T', 3, 10),
      ],
      // [6] robot 3x (mirrored): pillars of every height, a dash over a pit, a dash up onto a ledge (coin 2 on top
      //     of the tallest pillar)
      [
        shift('#140008', '#050002', '#ff3050'),
        stack('Z', 6),
        3,
        `
        ..............................................
        ......................$.......................
        ..............................................
        ......................#.......................
        ...........###........#.......................
        ...##......###........#.......##..............
        ^^^##^^^^^^###^^^^^^^^#^^^^^^^##^^^^^^^#^^^...
        `,
        3,
        `
        ##############################################........
        ......................................vvvvvvv.........
        ......................................................
        ...........................#########..................
        ...........................#########..................
        ...........................#########..................
        ...d..................e....#########..................
        ...........................#########..................
        ...............####........#########..................
        ^^^^^^^^^^^^^^^####^^^^^^^^#########^^^^^.............
        `,
        3,
        enter('D'),
      ],
      // [7] spider 4x (mirrored): alternating spikes, then the corridor closes in
      [
        shift('#100000', '#040000', '#ff2010'),
        4,
        sstack('4', 9),
        spiderAlt(8, 3, 9, 1816),
        `
        .........vvv.............##################.....................
        .........................##################.....................
        .........................##################.....................
        ...................................vv...........................
        ................................................................
        ..............................^^........^^......................
        ...................############################.................
        ...................############################.................
        ..^^^..............############################...^^^^..........
        `,
        exit('J', 1, 9),
      ],
      // [8] swing 3x: gap-3 gates, then 4x (unmirror on the way)
      [
        shift('#1a0800', '#060200', '#ff9a30'),
        sstack('3'),
        GD.gates({ len: 44, seed: 1817, gap: 3, every: 6, maxStep: 2, lead: 6 }),
        stack('z'),
        sstack('4'),
        GD.gates({ len: 40, seed: 1818, gap: 4, every: 7, maxStep: 2, lead: 4 }),
      ],
      // [9] dual ship 3x (mirrored gap-3 tunnel), then dual wave 4x (width 2, teeth)
      [
        shift('#16020c', '#060004', '#ff5090'),
        sstack('3'), stack('S'), stack('N'), stack('Y'),
        GD.sym(tunnel('3:0:5 4:1:3 4:2:3 4:1:3:..^. 4:0:3 4:1:3 4:2:3:.v.. 4:1:3 4:0:3 4:1:3:..^. 4:2:3 4:1:3 3:0:5', 5)),
        sstack('4'), stack('V'),
        dualW,
        stack('I'),
        exit('C'),
      ],
      // [10] mini cube 4x: spikes, a teleport onto a spiked rail, a dash over a pit
      [
        shift('#1c0300', '#060100', '#ff8020'),
        6,
        stack('m', 6),
        3,
        '..^^^.........^^^^.........^^^...^^^.....',
        `
        ......................................
        ......................................
        ...........W..........................
        .............^.....^^.....^...........
        .........######################.......
        ......................................
        ..K...................................
        ....^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^..
        `,
        `
        ................................
        ..d.............................
        ^^^^^^^^^^^^^^^^^^^^^^.....^^^..
        `,
        4,
        enter('M'),
        4,
      ],
      // [11] finale part 1 (4x): wave, ship, UFO, ball, spider – a new mode every two seconds
      [
        shift('#000000', '#000000', '#ffffff'),
        enter('V'),
        fw1,
        shift('#0c0000', '#000000', '#ff2000'),
        stack('S'),
        fs1,
        shift('#100300', '#000000', '#ff6a00'),
        stack('U'),
        framed(GD.gates({ len: 40, rows: 6, seed: 1872, gap: 4, every: 7, maxStep: 1, lead: 4, tail: 6 }), 2, 2),
        exit('A', 4, 10),
        shift('#160600', '#000000', '#ffa000'),
        `
        ........vvv........vvvv..........vvv......
        ..........................................
        ..........................................
        ..........................................
        ..........................................
        ..........................................
        ..........................................
        ..^^^.........^^^..........^^^^...........
        `,
        exit('D', 2, 8),
        spiderAlt(6, 3, 9, 1823),
      ],
      // [12] finale part 2 (4x): swing, robot (dash orb), wave with a teleport, the last cube run
      [
        exit('J', 1, 9),
        shift('#1c0c00', '#000000', '#ffd060'),
        GD.gates({ len: 40, seed: 1824, gap: 4, every: 7, maxStep: 2, lead: 6, tail: 6 }),
        exit('T', 2, 10),
        shift('#220500', '#000000', '#ff4000'),
        4,
        `
        ..............................................
        ..........................d...................
        .........###..................................
        .........###......###.........................
        ..^^^^^^^###^^^^^^###^^^^^^^^^^^^^^^^^^^^^^^...
        `,
        4,
        enter('V'),
        shift('#300a00', '#000000', '#ffffff'),
        ftp,
        fw2,
        exit('C'),
        shift('#140000', '#000000', '#ff2000'),
        6, '^^^', 10,
        '..^^^^......###^^^^^^^###.......^^^^^.....###^^^^^^###......',
        10,
      ],
      // [13] outro (cube 1x): out of the black hole
      [
        spd('1'),
        shift('#0a0100', '#020000', '#ffffff'),
        6, '^', 9, '^', 14,
      ],
    ],
  }, 'overload');
})(typeof window !== 'undefined' ? window : globalThis);
