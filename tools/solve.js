#!/usr/bin/env node
/* Level solver: proves that a level can be completed and reports timing windows.
 *
 *   node tools/solve.js            -> solve all built-in levels
 *   node tools/solve.js neon -v    -> one level, verbose
 *   node tools/solve.js --file my.json   (level exported from the editor as JSON)
 *   node tools/solve.js neon --modes     -> also list game mode / speed / corridor changes along the solution
 *   node tools/solve.js neon --min 2     -> only report clicks with a timing window under 2 frames
 *
 * Search: breadth-first over 60 Hz input frames (hold / release), 4 physics sub-steps
 * per frame, states de-duplicated on quantised (y, vy, mode, ...) and capped per frame. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// the engine and every level file, in the order index.html loads them (rendering / UI scripts are skipped)
const SCRIPTS = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((f) => /^js\/(util|objects|levelfmt|engine|levels)\.js$/.test(f) || /^js\/levels\//.test(f));
for (const f of SCRIPTS) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const GD = globalThis.GD;
const SUB = 4;

function keyOf(w, h) {
  const p = w.p;
  const fly = p.mode === 'ship' || p.mode === 'wave' || p.mode === 'swing' || p.mode === 'ufo';
  const yq = fly ? Math.round(p.y) : Math.round(p.y * 2);
  const vq = fly ? Math.round(p.vy / 10) : Math.round(p.vy / 4);
  return (
    p.mode + (p.gr > 0 ? '+' : '-') + (p.mini ? 'm' : '') + p.spd + '|' + Math.round(p.x) + '|' +
    yq + '|' + vq + '|' + (p.onGround ? 1 : 0) + (h ? 1 : 0) +
    (p.buffer ? 1 : 0) + '|' + (p.rbOn ? Math.round(p.rb * 240) : '') + '|' + w.used.join(',') + '|' +
    w.bnd.floor + ',' + w.bnd.ceil + '|' + (w.p2 ? Math.round(w.p2.y) + ',' + Math.round(w.p2.vy / 10) + ',' + w.p2.gr + (w.p2.onGround ? 'g' : '') + w.used2.join(',') : '') + '|' + (w.coinsGot[0] ? 1 : 0) + (w.coinsGot[1] ? 1 : 0) + (w.coinsGot[2] ? 1 : 0)
  );
}

function thin(arr, cap) {
  const buckets = new Map();
  for (const n of arr) {
    let b = buckets.get(n.bk);
    if (!b) buckets.set(n.bk, (b = []));
    b.push(n);
  }
  const lists = [...buckets.values()];
  const out = [];
  for (let i = 0; out.length < cap; i++) {
    let any = false;
    for (const l of lists) {
      if (i < l.length) {
        out.push(l[i]);
        any = true;
        if (out.length >= cap) break;
      }
    }
    if (!any) break;
  }
  return out;
}

function solve(level, opts) {
  const cap = opts.cap || 700;
  const w = new GD.World(level, {});
  const maxFrames = Math.ceil((w.endX / GD.PH.SPEEDS[0]) * 60) + 120;
  let frontier = [{ s: w.snap(), hold: 0 }];
  const frames = [{ parents: new Int32Array([-1]), inp: new Uint8Array([0]), ph: new Uint8Array([0]), x: w.p.x }];
  const dones = [];
  const killers = new Map();
  let firstDone = -1;
  let bestX = 0, bestMode = w.p.mode;
  const killRing = [];
  for (let f = 1; f <= maxFrames; f++) {
    const next = new Map();
    const frameKill = new Map();
    killRing.push(frameKill);
    if (killRing.length > 45) killRing.shift();
    for (let i = 0; i < frontier.length; i++) {
      const node = frontier[i];
      for (let h = 0; h < 2; h++) {
        w.restore(node.s);
        w.hold = !!node.hold;
        w.setHold(!!h);
        for (let k = 0; k < SUB; k++) {
          w.step();
          if (w.p.dead || w.p.done) break;
        }
        if (w.p.dead) {
          const k = w.killer && w.killer.t ? `${w.killer.t}@(${(w.killer.x / 30 - 0.5).toFixed(0)},${(w.killer.y / 30 - 0.5).toFixed(0)}) as ${w.p.mode}${w.p.gr < 0 ? ' (flipped)' : ''}` : String(w.killer) + ' as ' + w.p.mode;
          frameKill.set(k, (frameKill.get(k) || 0) + 1);
          continue;
        }
        if (opts.coins) {
          let miss = false;
          for (const c of w.coins) if (!w.coinsGot[c.ci] && w.p.x > c.x + 45) miss = true;
          if (miss) continue;
        }
        if (w.p.x > bestX) { bestX = w.p.x; bestMode = w.p.mode; }
        if (w.p.done) {
          if (opts.coins && w.coinsGot.filter(Boolean).length < w.coins.length) continue;
          dones.push({ f, parent: i, h, ph: node.hold });
          if (firstDone < 0) firstDone = dones.length - 1;
          continue;
        }
        const key = keyOf(w, h);
        if (!next.has(key)) {
          next.set(key, { s: w.snap(), hold: h, ph: node.hold, parent: i, bk: w.p.mode + w.p.gr + '|' + Math.round(w.p.y / 3) });
        }
      }
    }
    if (!next.size || dones.length) break;
    let arr = [...next.values()];
    if (arr.length > cap) arr = thin(arr, cap);
    frames.push({
      parents: Int32Array.from(arr, (n) => n.parent), inp: Uint8Array.from(arr, (n) => n.hold),
      ph: Uint8Array.from(arr, (n) => n.ph), x: 0,
    });
    w.restore(arr[0].s);
    frames[frames.length - 1].x = w.p.x;
    frontier = arr;
  }
  if (!dones.length) {
    for (const fk of killRing) for (const [k, n] of fk) killers.set(k, (killers.get(k) || 0) + n);
    const top = [...killers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + ' x' + n);
    // reconstruct the path of the furthest surviving state in the last frame
    const last = frames.length - 1;
    let bi = 0, bx = -1;
    for (let i = 0; i < frontier.length; i++) {
      w.restore(frontier[i].s);
      if (w.p.x > bx) { bx = w.p.x; bi = i; }
    }
    const inputs = new Array(last);
    let idx = bi;
    for (let ff = last; ff >= 1; ff--) { inputs[ff - 1] = frames[ff].inp[idx]; idx = frames[ff].parents[idx]; }
    return { ok: false, bestX, bestMode, endX: w.endX, killers: top, inputs };
  }
  // path of the first success
  const d0 = dones[0];
  const inputs = new Array(d0.f);
  inputs[d0.f - 1] = d0.h;
  let idx = d0.parent;
  for (let ff = d0.f - 1; ff >= 1; ff--) {
    inputs[ff - 1] = frames[ff].inp[idx];
    idx = frames[ff].parents[idx];
  }
  return { ok: true, frames: d0.f, inputs, endX: w.endX };
}

/** Replays inputs; returns per-frame snapshots so presses can be perturbed. */
function replay(level, inputs, fromSnap, fromFrame, toFrame) {
  const w = new GD.World(level, {});
  if (fromSnap) { w.restore(fromSnap.s); w.hold = fromSnap.hold; }
  for (let f = fromFrame || 0; f < (toFrame == null ? inputs.length : toFrame); f++) {
    w.setHold(!!inputs[f]);
    for (let k = 0; k < SUB; k++) {
      w.step();
      if (w.p.dead) return { dead: true, frame: f, x: w.p.x };
      if (w.p.done) return { done: true, frame: f };
    }
  }
  return { alive: true };
}

/** Can the player survive `frames` more frames from this state with some input? (small beam search) */
function survive(w, startSnap, hold, frames) {
  let frontier = [{ s: startSnap, hold }];
  for (let f = 0; f < frames; f++) {
    const next = new Map();
    for (const node of frontier) {
      for (let h = 0; h < 2; h++) {
        w.restore(node.s);
        w.hold = !!node.hold;
        w.setHold(!!h);
        for (let k = 0; k < SUB; k++) { w.step(); if (w.p.dead || w.p.done) break; }
        if (w.p.dead) continue;
        if (w.p.done) return true;
        const key = keyOf(w, h);
        if (!next.has(key)) next.set(key, { s: w.snap(), hold: h, bk: w.p.mode + w.p.gr + '|' + Math.round(w.p.y / 3) });
      }
    }
    if (!next.size) return false;
    frontier = [...next.values()];
    if (frontier.length > 120) frontier = thin(frontier, 120);
  }
  return true;
}

const PRESS_MODES = { cube: 1, robot: 1, ball: 1, spider: 1, ufo: 1, swing: 1 };

/** For every click of the solution: how many frames earlier/later could it be and still survive? */
function windows(level, inputs) {
  const w = new GD.World(level, {});
  const snaps = [];
  const info = [];
  for (let f = 0; f < inputs.length; f++) {
    snaps.push({ s: w.snap(), hold: w.hold ? 1 : 0 });
    info.push({ x: w.p.x, mode: w.p.mode, g: w.p.onGround });
    w.setHold(!!inputs[f]);
    for (let k = 0; k < SUB; k++) w.step();
  }
  const res = [];
  for (let f = 1; f < inputs.length; f++) {
    if (!inputs[f] || inputs[f - 1] || !PRESS_MODES[info[f].mode]) continue;
    let lo = 0, hi = 0;
    for (const dir of [-1, 1]) {
      for (let d = 1; d <= 8; d++) {
        const pf = f + dir * d;
        if (pf < 1) break;
        const from = Math.min(f, pf);
        const sn = snaps[from];
        w.restore(sn.s);
        w.hold = !!sn.hold;
        let dead = false;
        for (let k = from; k <= pf && !dead; k++) {
          w.setHold(k === pf);
          for (let q = 0; q < SUB; q++) { w.step(); if (w.p.dead) { dead = true; break; } }
        }
        if (dead || !survive(w, w.snap(), 1, 48)) break;
        if (dir < 0) lo = d; else hi = d;
      }
    }
    res.push({ frame: f, x: info[f].x / 30, mode: info[f].mode, win: lo + hi + 1, lo, hi });
  }
  return res;
}

/** Replay a solution and list portal columns it never touched (a skipped section). */
function portalAudit(level, inputs) {
  const w = new GD.World(level, {});
  const touched = new Set();
  const orig = w.portal.bind(w);
  w.portal = (o) => { touched.add(Math.round(o.x)); return orig(o); };
  for (let f = 0; f < inputs.length && !w.p.done && !w.p.dead; f++) {
    w.setHold(!!inputs[f]);
    for (let k = 0; k < SUB; k++) { w.step(); if (w.p.done || w.p.dead) break; }
  }
  const cols = new Map();
  for (const o of w.objs) {
    if (o.kind !== 'portal') continue;
    const k = Math.round(o.x);
    cols.set(k, cols.get(k) || touched.has(k));
  }
  return [...cols].filter(([, v]) => !v).map(([k]) => +(k / 30).toFixed(1)).sort((a, b) => a - b);
}

function showSeg(def, x) {
  const segs = GD.mapSegments(def.map);
  for (const sg of segs) {
    if (x >= sg.start - 4 && x < sg.end + 1) {
      console.log(`   segment cols ${sg.start}-${sg.end - 1}, local col ${(x - sg.start).toFixed(1)}:`);
      for (const l of sg.lines) console.log('     ' + l);
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('-v');
  const capArg = args.indexOf('--cap');
  const cap = capArg >= 0 ? +args[capArg + 1] : undefined;
  let targets = [];
  const segArg = args.indexOf('--seg');
  if (segArg >= 0) {
    // quick pattern test: --seg "<ascii lines separated by />" [--speed N] [--mode m]
    const seg = args[segArg + 1].trim().split(/\s+/).join('\n');
    const sp = args.includes('--speed') ? +args[args.indexOf('--speed') + 1] : 1;
    const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'cube';
    const def = { id: 'seg', name: 'segment', map: [10, seg, 6], settings: { spd: sp, mode } };
    targets.push({ id: 'seg', name: 'segment', level: GD.buildLevel(def), def });
    args.push('-v');
  }
  const fileArg = args.indexOf('--file');
  if (fileArg >= 0) {
    const data = JSON.parse(fs.readFileSync(args[fileArg + 1], 'utf8'));
    targets.push({ id: data.name || 'file', name: data.name || 'file', level: data });
  } else {
    const ids = args.filter((a) => !a.startsWith('-') && (capArg < 0 || a !== args[capArg + 1]));
    for (const def of segArg >= 0 ? [] : GD.LEVELS) {
      if (ids.length && !ids.includes(def.id)) continue;
      targets.push({ id: def.id, name: def.name, level: GD.buildLevel(def), def });
    }
  }
  let allOk = true;
  for (const t of targets) {
    const t0 = Date.now();
    const r = solve(t.level, { cap });
    let coinRes = null;
    if (r.ok && !args.includes('--nocoins')) {
      const nCoins = t.level.objects.filter((o) => o.t === 'coin').length;
      if (nCoins) coinRes = solve(t.level, { cap, coins: true });
      if (coinRes && !coinRes.ok) { allOk = false; console.log(`   ✗ coins: cannot collect all coins in one run, stuck at x=${(coinRes.bestX / 30).toFixed(1)} (${coinRes.bestMode})`); if (t.def) showSeg(t.def, coinRes.bestX / 30); }
      else if (coinRes) console.log(`   ✓ all ${nCoins} coins collectable`);
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!r.ok) {
      allOk = false;
      console.log(`✗ ${t.name}: FAILED at x=${(r.bestX / 30).toFixed(1)} blocks (${r.bestMode}) of ${(r.endX / 30).toFixed(0)}${r.timeout ? ' (timeout)' : ''} [${secs}s]`);
      if (r.killers) console.log('   killed by: ' + r.killers.join(', '));
      if (args.includes('--trace') && r.inputs) {
        const tw = new GD.World(t.level, {});
        const rows = [];
        for (let f = 0; f < r.inputs.length; f++) {
          tw.setHold(!!r.inputs[f]);
          for (let k = 0; k < SUB; k++) tw.step();
          const p = tw.p;
          rows.push(`   f${f} x=${(p.x / 30).toFixed(2)} y=${p.y.toFixed(1)} vy=${p.vy.toFixed(0)} ${p.mode}${p.mini ? '(mini)' : ''} gr=${p.gr} ground=${p.onGround ? 1 : 0} in=${r.inputs[f]} floor=${tw.bnd.floor} ceil=${tw.bnd.ceil}`);
        }
        const sel = args.includes("--changes") ? rows.filter((r, i) => i === 0 || r.split(" ").slice(4, 6).join() !== rows[i - 1].split(" ").slice(4, 6).join()) : rows.slice(-50);
        console.log(sel.join("\n"));
      }
      if (t.def) showSeg(t.def, r.bestX / 30);
      continue;
    }
    if (args.includes('--modes')) {
      // mode / speed / gravity / corridor changes along the solution
      const w = new GD.World(t.level, {});
      let last = '';
      for (let f = 0; f < r.inputs.length && !w.p.done; f++) {
        w.setHold(!!r.inputs[f]);
        for (let k = 0; k < SUB; k++) w.step();
        const p = w.p;
        const m = `${p.mode}${p.mini ? '(mini)' : ''} gr=${p.gr}${w.p2 ? ' DUAL' : ''}${w.mirror ? ' MIRROR' : ''} speed=${['0.5x', '1x', '2x', '3x', '4x'][p.spd]} corridor=${w.bnd.ceil == null ? 'none' : w.bnd.floor / 30 + '..' + w.bnd.ceil / 30}`;
        if (m !== last) { console.log(`   ${(f / 60).toFixed(1).padStart(5)}s block ${(p.x / 30).toFixed(1).padStart(6)}  ${m}`); last = m; }
      }
    }
    const missed = portalAudit(t.level, r.inputs);
    if (missed.length) {
      // built-in levels must not let the player skip portals (e.g. by flying over a section)
      if (t.def && t.id !== 'seg') allOk = false;
      console.log(`   ${t.def && t.id !== 'seg' ? '✗' : '⚠'} portals never touched at block ${missed.join(', ')}`);
    }
    const dur = (r.frames / 60).toFixed(1);
    const minWin = args.includes('--min') ? +args[args.indexOf('--min') + 1] : 3;
    const wins = args.includes('--nowin') ? [] : windows(t.level, r.inputs);
    const tight = wins.filter((x) => x.win < minWin);
    const secs2 = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`✓ ${t.name}: ${dur}s, length ${(r.endX / 30).toFixed(0)} blocks, objects=${t.level.objects.length}, clicks=${wins.length}, tight(<${minWin}f)=${tight.length} [${secs2}s]`);
    for (const x of verbose ? wins : tight) console.log(`   click @ block ${x.x.toFixed(1)} (${x.mode}): window ${x.win} frames (-${x.lo}/+${x.hi})`);
  }
  process.exit(allOk ? 0 : 1);
}

if (require.main === module) main();
module.exports = { solve, windows, portalAudit, GD };
