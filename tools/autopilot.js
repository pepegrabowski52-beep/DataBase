#!/usr/bin/env node
/* Finds "autopilot" stretches: parts of flying sections that survive with constant input
 * (never pressing, or holding all the time) for a long time – usually a design flaw, e.g. a wave
 * that can slide along the slopes of its whole corridor.
 *
 *   node tools/autopilot.js wave demon         -> check levels
 *   node tools/autopilot.js wave --secs 1.5    -> report stretches from 1.5 s (default 2 s)
 *
 * Method: replay the solver's solution; every quarter second inside a flying mode, continue from that
 * state with constant input. Windows that survive `secs` seconds without changing the game mode count. */
'use strict';
const { solve, GD } = require('./solve.js');

const SUB = 4;
const FLY = { ship: 1, wave: 1, ufo: 1, swing: 1, ball: 1, spider: 1 };
const args = process.argv.slice(2);
const si = args.indexOf('--secs');
const secs = si >= 0 ? +args.splice(si, 2)[1] : 2;
const W = Math.round(secs * 60);

let bad = 0;
for (const id of args) {
  const def = GD.LEVELS.find((l) => l.id === id);
  if (!def) { console.log(`? unknown level ${id}`); continue; }
  const lvl = GD.buildLevel(def);
  const r = solve(lvl, {});
  if (!r.ok) { console.log(`✗ ${def.name}: not solvable`); bad++; continue; }
  const w = new GD.World(lvl, {});
  const starts = [];
  for (let f = 0; f < r.inputs.length; f++) {
    if (f % 15 === 0 && FLY[w.p.mode]) starts.push({ f, snap: w.snap(), hold: w.hold, mode: w.p.mode, x: w.p.x });
    w.setHold(!!r.inputs[f]);
    for (let k = 0; k < SUB; k++) w.step();
  }
  const hits = [];
  const t = new GD.World(lvl, {});
  for (const s of starts) {
    for (const h of [0, 1]) {
      t.restore(s.snap);
      t.hold = s.hold;
      let ok = true;
      for (let f = 0; f < W; f++) {
        t.setHold(!!h);
        for (let k = 0; k < SUB; k++) t.step();
        if (t.p.dead || t.p.mode !== s.mode) { ok = false; break; }
        if (t.p.done) break;
      }
      if (ok) hits.push({ x0: s.x / 30, x1: t.p.x / 30, h, mode: s.mode });
    }
  }
  // merge overlapping windows of the same kind
  const merged = [];
  for (const hgt of hits.sort((a, b) => a.h - b.h || a.x0 - b.x0)) {
    const m = merged[merged.length - 1];
    if (m && m.h === hgt.h && hgt.x0 <= m.x1) m.x1 = Math.max(m.x1, hgt.x1);
    else merged.push(Object.assign({}, hgt));
  }
  if (!merged.length) { console.log(`✓ ${def.name}: no autopilot stretch of ${secs}s or more`); continue; }
  bad++;
  console.log(`✗ ${def.name}: ${merged.length} autopilot stretch(es)`);
  for (const m of merged.sort((a, b) => a.x0 - b.x0)) {
    console.log(`   ${m.mode} blocks ${m.x0.toFixed(0)}-${m.x1.toFixed(0)} survive by ${m.h ? 'holding' : 'never pressing'}`);
  }
}
process.exit(bad ? 1 : 0);
