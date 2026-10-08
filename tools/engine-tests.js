#!/usr/bin/env node
/* Regression tests for engine edge cases (run: node tools/engine-tests.js).
 * Each test builds a tiny level, drives the World directly and checks the outcome. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
for (const f of ['js/util.js', 'js/objects.js', 'js/levelfmt.js', 'js/engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const GD = globalThis.GD;

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' — ' + detail}`);
  if (!ok) failed++;
}
const cell = (col, row) => ({ x: col * 30 + 15, y: row * 30 + 15 });
const obj = (t, col, row, extra) => Object.assign({ t }, cell(col, row), extra || {});

// ---------------------------------------------------------------- slopes
// Jumping (or starting to fly up) right before a ramp must not kill: the ramp catches the player.
{
  const ramp = ['..../#####', '.../######', '../#######', './########', '/#########'].join('\n');
  const deaths = [];
  for (const mode of ['cube', 'ship', 'robot', 'ball']) {
    for (const mini of [false, true]) {
      for (let spd = 0; spd <= 4; spd++) {
        const lvl = { objects: GD.parseMap([20, ramp, 20]), settings: { mode, spd, mini } };
        for (let px = 450; px <= 600; px += 6) {
          const w = new GD.World(lvl, {});
          let pressed = false;
          for (let i = 0; i < 20000 && !w.p.dead && w.p.x < 1000; i++) {
            if (!pressed && w.p.x >= px) { w.setHold(true); pressed = true; }
            if (pressed && mode !== 'ship' && w.p.x >= px + 1) w.setHold(false);
            w.step();
          }
          if (w.p.dead) deaths.push(`${mode}${mini ? '(mini)' : ''} ${spd} press@${px}`);
        }
      }
    }
  }
  check('pressing near a ramp never kills', !deaths.length, deaths.length + ' deaths, e.g. ' + deaths.slice(0, 3).join(', '));
}
// A ship pressed against the ceiling survives releasing where the ceiling slopes down.
{
  const ceil = ['.....]####################', '......]###################', '.......]##################',
    '........]#################', '.........]################', '..........................', '..........................',
    '..........................', '..........................', '..........................'].join('\n');
  const bad = [];
  for (let spd = 0; spd <= 4; spd++) {
    const lvl = { objects: GD.parseMap([{ t: 'pShip', at: 0, y: 2 }, 15, ceil, 20]), settings: { mode: 'cube', spd } };
    const w = new GD.World(lvl, {});
    w.setHold(true);
    let released = false;
    while (!w.p.dead && w.p.x < 1100) {
      if (!released && w.p.x >= 600) { w.setHold(false); released = true; }
      w.step();
    }
    if (w.p.dead) bad.push(spd);
  }
  check('releasing under a descending ceiling slope is safe', !bad.length, 'died at speeds ' + bad.join(','));
}

// ---------------------------------------------------------------- teleports
for (const mode of ['ship', 'ufo', 'wave', 'ball', 'swing']) {
  const objs = [obj('p' + mode[0].toUpperCase() + mode.slice(1), 3, 1), obj('pTele', 10, 1), obj('pTeleO', 14, 17)];
  const w = new GD.World({ objects: objs, settings: { mode: 'cube', spd: 1 } }, { fx: true });
  let ty = null, later = null;
  for (let i = 0; i < 400 && !w.p.dead; i++) {
    w.events.length = 0;
    w.step();
    const e = w.events.find((x) => x.type === 'tele');
    if (e) ty = e.ty;
    if (ty != null && later == null && i > 0) later = { y: w.p.y, ceil: w.bnd.ceil };
  }
  const ok = ty != null && later && Math.abs(later.y - ty) < 60 && later.ceil > ty;
  check(`teleport out of a ${mode} corridor keeps the player at the exit`, ok, JSON.stringify({ ty, later }));
}
{
  const objs = [obj('pTele', 5, 0), obj('pTeleO', 9, 8)];
  const w = new GD.World({ objects: objs, settings: { mode: 'cube', spd: 1 } }, { fx: true });
  let after = null;
  for (let i = 0; i < 200 && !after; i++) {
    w.events.length = 0;
    w.step();
    if (w.events.some((x) => x.type === 'tele')) after = { onGround: w.p.onGround };
  }
  check('a teleport leaves the player in the air (no mid-air jump)', after && !after.onGround, JSON.stringify(after));
}
{
  // dual: each player has its own teleport in the same column
  const objs = [obj('pDual', 3, 1), obj('pTele', 12, 1), obj('pTele', 12, 8), obj('pTeleO', 22, 2), obj('pTeleO', 22, 7)];
  const w = new GD.World({ objects: objs, settings: { mode: 'cube', spd: 1 } }, { fx: true });
  let n = 0;
  for (let i = 0; i < 600 && !w.p.dead && w.p.x < 22 * 30 + 60; i++) {
    w.events.length = 0;
    w.step();
    n += w.events.filter((x) => x.type === 'tele').length;
  }
  check('dual: both players use their own teleport', n === 2 && w.p2 && Math.abs(w.p.x - w.p2.x) < 1, `teleports=${n}`);
}

// ---------------------------------------------------------------- dash orbs
{
  const a = GD.dashAngle;
  const cases = [[0, 0], [45, 45], [315, -45], [90, 70], [270, -70], [180, 0], [135, 45], [225, -45]];
  const bad = cases.filter(([r, want]) => a(r) !== want);
  check('dash orb aim (backward arrows mirror forward, max 70°)', !bad.length, JSON.stringify(bad.map(([r]) => [r, a(r)])));
}
{
  // a dash ends on release: the player falls again
  const objs = GD.parseMap([4, ['.....', '.....', '..d..', '.....', '.....'].join('\n'), 40]);
  const w = new GD.World({ objects: objs, settings: { mode: 'cube', spd: 1 } }, {});
  let dashed = false, fell = false;
  for (let i = 0; i < 2000 && !w.p.dead && w.p.x < 1200; i++) {
    w.setHold((w.p.x > 90 && w.p.x < 110) || (w.p.x > 175 && w.p.x < 400)); // jump, then click the orb
    w.step();
    if (w.p.dash) dashed = true;
    if (dashed && !w.p.dash && w.p.onGround) fell = true;
  }
  check('dash orb: dash while held, fall after release', dashed && fell && !w.p.dead);
}

// ---------------------------------------------------------------- world.append (endless mode)
{
  // a level built in two halves (second half appended while playing) must play exactly like the whole level
  const map = [8, '..^...##....^^..', 6, '.....o....\n..........\n..^^^^^^^.', 6, { t: 'pShip', at: 0, y: 1 }, 30, { t: 'pCube', at: 0, y: 1 }, 10, '..^...', 20];
  const all = GD.parseMap(map);
  const cut = 40 * 30;
  const a = all.filter((o) => o.x < cut), b = all.filter((o) => o.x >= cut);
  const run = (split) => {
    const w = new GD.World({ objects: split ? a.map((o) => Object.assign({}, o)) : all.map((o) => Object.assign({}, o)), settings: { mode: 'cube', spd: 1 } }, {});
    w.die = () => {}; // invincible, so the run crosses the cut
    w.endX = Infinity; // like endless mode
    let appended = !split;
    const trace = [];
    for (let i = 0; i < 6000 && !w.p.dead && w.p.x < 2600; i++) {
      if (!appended && w.p.x > cut - 600) { w.append(b.map((o) => Object.assign({}, o))); appended = true; }
      w.setHold(Math.floor(i / 37) % 3 === 0);
      w.step();
      if (i % 50 === 0) trace.push(w.p.x.toFixed(2) + ',' + w.p.y.toFixed(2) + ',' + w.p.mode);
    }
    return { trace: trace.join(' '), x: w.p.x, modes: new Set(trace.map((t) => t.split(',')[2])).size };
  };
  const whole = run(false), split = run(true);
  check('appending objects while playing equals building the level at once',
    whole.trace === split.trace && whole.x >= 2600 && whole.modes > 1, `same=${whole.trace === split.trace} x=${whole.x} modes=${whole.modes}`);
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall engine tests passed');
process.exit(failed ? 1 : 0);
