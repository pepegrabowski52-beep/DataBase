/* ASCII level format -> object list.
 *
 * A level "map" is a list of entries laid out left to right:
 *   - number  : that many empty columns
 *   - string  : an ASCII segment, bottom row = ground level (y = 0)
 *   - object  : an object/trigger placed at the current column ({t:'tColor', at: 0, ...})
 *   - array   : nested entries (flattened)
 *
 * Characters (one per 30x30 cell):
 *   # main block   H alt block   X solid block   = slab (top half)   _ slab (bottom half)
 *   / slope up   & slope down   [ ] ceiling slopes (solid top-left / top-right)
 *   (- long (22.5°) slope up   -) long slope down   (two cells: the '-' is part of the slope)
 *   ^ spike  v ceiling spike  < > side spikes  , small spike  ` small ceiling spike  ; ground spikes  : ceiling ground spikes
 *   o p r b g k        yellow / pink / red / blue / green / black orb
 *   O P R B            yellow / pink / red / blue pad      Q E F  yellow / blue / pink pad on a ceiling
 *   C S A U V T D J    cube / ship / ball / ufo / wave / robot / spider / swing portal
 *   G N                gravity flip (upside down) / normal gravity portal
 *   m M                mini / normal size portal
 *   Y I                dual / single portal       Z z   mirror / unmirror portal
 *   K W                teleport entrance (blue) / exit (orange): K moves the player to the nearest W ahead
 *   0 1 2 3 4          speed portal 0.5x 1x 2x 3x 4x
 *   $ coin   * saw   @ big saw   % small saw
 *   + ring deco   | chain deco   " grass deco   ! arrow deco   ' light dots   ~ fake spike
 */
(function (root) {
  'use strict';
  const GD = root.GD;

  const CH = {
    '#': { t: '@main' }, H: { t: '@alt' }, X: { t: 'block3' },
    '/': { t: 'slope' }, '&': { t: 'slope', fx: true }, '[': { t: 'slope', fx: true, fy: true }, ']': { t: 'slope', fy: true },
    '(': { t: 'slopeL', w2: 1 }, ')': { t: 'slopeL', fx: true, w2: -1 }, '-': null,
    '=': { t: '@slab' }, _: { t: '@slab', r: 180 },
    '^': { t: 'spike' }, v: { t: 'spike', r: 180 }, '<': { t: 'spike', r: 270 }, '>': { t: 'spike', r: 90 },
    ',': { t: 'spikeS' }, '`': { t: 'spikeS', r: 180 }, ';': { t: 'spikeT' }, ':': { t: 'spikeT', r: 180 },
    o: { t: 'orbY' }, p: { t: 'orbP' }, r: { t: 'orbR' }, b: { t: 'orbB' }, g: { t: 'orbG' }, k: { t: 'orbK' },
    O: { t: 'padY' }, P: { t: 'padP' }, R: { t: 'padR' }, B: { t: 'padB' },
    Q: { t: 'padY', r: 180 }, E: { t: 'padB', r: 180 }, F: { t: 'padP', r: 180 },
    C: { t: 'pCube' }, S: { t: 'pShip' }, A: { t: 'pBall' }, U: { t: 'pUfo' }, V: { t: 'pWave' },
    T: { t: 'pRobot' }, D: { t: 'pSpider' }, J: { t: 'pSwing' },
    G: { t: 'pGravU' }, N: { t: 'pGravD' }, m: { t: 'pMini' }, M: { t: 'pBig' },
    Y: { t: 'pDual' }, I: { t: 'pSingle' }, Z: { t: 'pMirror' }, z: { t: 'pUnmirror' }, K: { t: 'pTele' }, W: { t: 'pTeleO' },
    0: { t: 'sp0' }, 1: { t: 'sp1' }, 2: { t: 'sp2' }, 3: { t: 'sp3' }, 4: { t: 'sp4' },
    $: { t: 'coin' }, '*': { t: 'sawM' }, '@': { t: 'sawB' }, '%': { t: 'sawS' },
    '+': { t: 'dRing' }, '|': { t: 'dChain' }, '"': { t: 'dGrass' }, '!': { t: 'dArrow' },
    "'": { t: 'dDots' }, '~': { t: 'dFake' },
  };
  GD.ASCII = CH;

  function flatten(map, out) {
    for (const e of map) {
      if (Array.isArray(e)) flatten(e, out);
      else if (e != null) out.push(e);
    }
    return out;
  }

  function dedent(str) {
    const lines = str.split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    let ind = Infinity;
    for (const l of lines) if (l.trim()) ind = Math.min(ind, l.match(/^ */)[0].length);
    return lines.map((l) => l.slice(ind === Infinity ? 0 : ind).replace(/\s+$/, ''));
  }

  GD.parseMap = function (map, style) {
    style = Object.assign({ main: 'block', alt: 'block2', slab: 'slab' }, style || {});
    const out = [];
    let cx = 0;
    for (const e of flatten(map, [])) {
      if (typeof e === 'number') { cx += e; continue; }
      if (typeof e === 'object') {
        const o = Object.assign({}, e);
        o.x = (cx + (e.at || 0)) * 30 + 15;
        o.y = (e.y || 0) * 30 + 15;
        delete o.at;
        out.push(o);
        continue;
      }
      const lines = dedent(e);
      const rows = lines.length;
      let width = 0;
      for (let i = 0; i < rows; i++) {
        const line = lines[i];
        width = Math.max(width, line.length);
        for (let j = 0; j < line.length; j++) {
          const c = line[j];
          if (c === '.' || c === ' ') continue;
          const m = CH[c];
          if (m === null) continue; // filler cell of a two-cell object
          if (!m) throw new Error('Unknown map char "' + c + '"');
          let t = m.t;
          if (t[0] === '@') t = style[t.slice(1)];
          const o = { t, x: (cx + j) * 30 + 15 + (m.w2 || 0) * 15, y: (rows - 1 - i) * 30 + 15 };
          if (m.r) o.r = m.r;
          if (m.fx) o.fx = true;
          if (m.fy) o.fy = true;
          out.push(o);
        }
      }
      cx += width;
    }
    return out;
  };

  /** For debugging: where does each map entry start? */
  GD.mapSegments = function (map) {
    const segs = [];
    let cx = 0;
    for (const e of flatten(map, [])) {
      if (typeof e === 'number') { cx += e; continue; }
      if (typeof e !== 'string') continue;
      const lines = dedent(e);
      const width = Math.max(...lines.map((l) => l.length));
      segs.push({ start: cx, end: cx + width, lines });
      cx += width;
    }
    return segs;
  };

  /** Mirror a lower-half section to the top half (for dual mode): rows are flipped, spikes inverted. */
  const FLIP = { '^': 'v', v: '^', ',': '`', '`': ',', ';': ':', ':': ';', O: 'Q', Q: 'O', B: 'E', E: 'B', P: 'F', F: 'P', '=': '_', _: '=' };
  GD.sym = function (lower) {
    const lines = dedent(lower);
    const w = Math.max(...lines.map((l) => l.length));
    const pad = lines.map((l) => l + '.'.repeat(w - l.length));
    const upper = pad.slice().reverse().map((l) => l.split('').map((c) => FLIP[c] || c).join(''));
    return upper.concat(pad).join('\n');
  };

  GD.rep = function (n, ...segs) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(...segs);
    return a;
  };

  // ------------------------------------------------------------------ generators
  function gridToStr(grid) {
    const out = [];
    for (let r = grid.length - 1; r >= 0; r--) out.push(grid[r].join(''));
    return out.join('\n');
  }
  function newGrid(rows, len) {
    return Array.from({ length: rows }, () => Array(len).fill('.'));
  }

  /** Flying section made of pillars / gates. o: {len, rows, gap, every, seed, width, spikes, maxStep, lead} */
  GD.gates = function (o) {
    const rnd = GD.U.rng(o.seed || 1);
    const rows = o.rows || 10, gap = o.gap || 4, every = o.every || 6, wdt = o.width || 1;
    const grid = newGrid(rows, o.len);
    let lo = Math.floor((rows - gap) / 2);
    const obs = [];
    let k = 0;
    for (let c = o.lead == null ? 4 : o.lead; c + wdt <= o.len - (o.tail == null ? 2 : o.tail); c += every) {
      const step = Math.round((rnd() * 2 - 1) * (o.maxStep || 2.5));
      lo = Math.max(0, Math.min(rows - gap, lo + step));
      const type = o.types ? o.types[k % o.types.length] : rnd() < 0.4 ? 'gate' : k % 2 ? 'top' : 'bottom';
      let a = lo, b = lo + gap;
      if (type === 'bottom') b = rows;
      if (type === 'top') a = 0;
      const spikes = o.spikes !== false && b - a > 3;
      // rows the player can safely pass through (spike cells excluded)
      const safeLo = a + (spikes && a > 0 ? 1 : 0), safeHi = b - 1 - (spikes && b < rows ? 1 : 0);
      obs.push({ c, a, b, spikes, safeLo, safeHi, skip: a <= 0 && b >= rows });
      k++;
    }
    for (const ob of obs) {
      if (ob.skip) continue;
      for (let x = ob.c; x < ob.c + wdt; x++) {
        for (let r = 0; r < rows; r++) if (r < ob.a || r >= ob.b) grid[r][x] = o.wall || '#';
        if (ob.spikes) {
          if (ob.a > 0) grid[ob.a][x] = '^';
          if (ob.b < rows) grid[ob.b - 1][x] = 'v';
        }
      }
    }
    if (o.coinAt != null && obs[o.coinAt]) {
      // between two consecutive gates, in a row that is open in both
      const A = obs[o.coinAt], B = obs[o.coinAt + 1] || A;
      const l = Math.max(A.safeLo, B.safeLo), h = Math.min(A.safeHi, B.safeHi);
      const row = l <= h ? (o.coinAt % 2 ? l : h) : Math.round((A.safeLo + A.safeHi + B.safeLo + B.safeHi) / 4);
      const col = Math.min(o.len - 1, Math.round((A.c + wdt + B.c) / 2));
      grid[Math.max(0, Math.min(rows - 1, row))][col] = '$';
    }
    return gridToStr(grid);
  };

  /** Zig-zag wave channel. o: {len, rows, width, seed, minSeg, maxSeg, slope, spikes} */
  GD.waveRun = function (o) {
    const rnd = GD.U.rng(o.seed || 1);
    const rows = o.rows || 10, w = o.width || 3, slope = o.slope || 1;
    const grid = newGrid(rows, o.len);
    let b = o.start == null ? Math.floor((rows - w) / 2) : o.start;
    let dir = 1, seg = 0;
    const flat = o.flat || 0;
    for (let c = 0; c < o.len; c++) {
      if (c >= (o.lead || 3) && c < o.len - (o.tail || 3)) {
        if (seg <= 0) {
          seg = (o.minSeg || 2) + Math.floor(rnd() * ((o.maxSeg || 5) - (o.minSeg || 2) + 1));
          dir = rnd() < flat ? 0 : b <= 1 ? 1 : b + w >= rows - 1 ? -1 : -dir || 1;
        }
        const nb = b + dir * slope;
        if (nb < 1 || nb + w > rows - 1) { seg = 0; dir = -dir; } else b = nb;
        seg--;
      }
      if (c < (o.open == null ? 2 : o.open) || c >= o.len - (o.openEnd == null ? 2 : o.openEnd)) continue;
      for (let r = 0; r < rows; r++) {
        if (r === b - 1 || (r < b - 1 && o.fill)) grid[r][c] = '#';
        if (r === b + w || (r > b + w && o.fill)) grid[r][c] = '#';
      }
      for (let s = 1; s < slope; s++) {
        if (dir > 0 && b - 1 - s >= 0) grid[b - 1 - s][c] = '#';
        if (dir < 0 && b + w + s < rows) grid[b + w + s][c] = '#';
      }
    }
    return gridToStr(grid);
  };

  /** Wave corridor made of 45° slopes: floor and ceiling run parallel, `width` rows apart. */
  GD.slopeWave = function (o) {
    const rnd = GD.U.rng(o.seed || 1);
    const rows = o.rows || 10, w = o.width || 3;
    const grid = newGrid(rows, o.len);
    let F = o.start == null ? Math.floor((rows - w) / 2) : o.start;
    let d = 0, seg = 0;
    const open = o.open == null ? 3 : o.open, openEnd = o.openEnd == null ? 2 : o.openEnd;
    const put = (r, c, ch) => { if (r >= 0 && r < rows) grid[r][c] = ch; };
    for (let c = 0; c < o.len; c++) {
      if (c < open || c >= o.len - openEnd) continue;
      if (seg <= 0) {
        seg = (o.minSeg || 2) + Math.floor(rnd() * ((o.maxSeg || 4) - (o.minSeg || 2) + 1));
        const opts = [];
        if (F + w + 1 < rows) opts.push(1);
        if (F - 1 >= 1) opts.push(-1);
        if (rnd() < (o.flat || 0)) opts.length = 0;
        d = opts.length ? (opts.includes(-d) && rnd() < 0.8 ? -d : opts[Math.floor(rnd() * opts.length)]) : 0;
        if (d === 0) seg = Math.min(seg, 2);
      }
      if ((d > 0 && F + w + 1 >= rows) || (d < 0 && F - 1 < 1)) { d = 0; seg = 0; }
      const C = F + w;
      if (d > 0) {
        put(F, c, '/'); put(F - 1, c, '#');
        put(C, c, '['); put(C + 1, c, '#');
      } else if (d < 0) {
        put(F - 1, c, '&'); put(F - 2, c, '#');
        put(C - 1, c, ']'); put(C, c, '#');
      } else {
        put(F - 1, c, '#');
        put(C, c, '#');
      }
      F += d;
      seg--;
    }
    return gridToStr(grid);
  };

  const cache = {};
  GD.buildLevel = function (def) {
    if (cache[def.id]) return cache[def.id];
    const objects = GD.parseMap(def.map, def.style);
    if (def.extra) for (const o of def.extra) objects.push(Object.assign({}, o));
    const lvl = { settings: Object.assign({}, GD.DEFAULT_SETTINGS, def.settings || {}, { song: def.song }), objects };
    cache[def.id] = lvl;
    return lvl;
  };
})(typeof window !== 'undefined' ? window : globalThis);
