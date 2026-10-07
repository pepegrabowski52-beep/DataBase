/* Deterministic game simulation (player physics, collisions, triggers).
 * No rendering in here – it also runs headless in Node (tools/solve.js). */
(function (root) {
  'use strict';
  const GD = root.GD;
  const U = GD.U;
  const OBJ = GD.OBJ;

  // Geometry Dash physics constants converted from 60fps-tick units to units/second.
  const SPEEDS = [251.16, 311.58, 387.42, 468.0, 576.0]; // 0.5x 1x 2x 3x 4x
  const G = 3449.5; // 0.958199 * 60²
  const JUMP = 670.8; // 11.180032 * 60
  const MAXFALL = 900;
  const DT = 1 / 240;
  const CORRIDOR = { ship: 10, ufo: 10, wave: 10, swing: 10, ball: 8, spider: 9 };
  const CEIL = { ship: 1, ufo: 1, ball: 1, spider: 1, swing: 1 };
  const IM = { cube: 1, robot: 1, ship: 0.7, ufo: 0.7, ball: 0.7, spider: 0.7, swing: 0.7, wave: 0 };
  const ROBOT_V = 420, ROBOT_T = 0.2, UFO_V = 420;
  const BW = 120; // collision bucket width (units)
  const CLS = { solid: 'solid', hazard: 'hazard', orb: 'inter', pad: 'inter', portal: 'inter', coin: 'inter' };

  GD.PH = { SPEEDS, G, JUMP, DT, CORRIDOR };

  function copyOff(off) {
    const o = {};
    for (const k in off) o[k] = off[k].slice();
    return o;
  }

  function hit(o, x0, y0, x1, y1) {
    if (o.lh.k === 'r') return x1 > o.x0 && x0 < o.x1 && y1 > o.y0 && y0 < o.y1;
    const cx = o.cx < x0 ? x0 : o.cx > x1 ? x1 : o.cx;
    const cy = o.cy < y0 ? y0 : o.cy > y1 ? y1 : o.cy;
    const dx = o.cx - cx, dy = o.cy - cy;
    return dx * dx + dy * dy < o.cr * o.cr;
  }

  class World {
    constructor(level, opts) {
      this.opts = opts || {};
      this.fx = !!this.opts.fx;
      this.settings = Object.assign({}, GD.DEFAULT_SETTINGS, (level && level.settings) || {});
      this.qs = 0;
      this._q = [];
      this.load((level && level.objects) || []);
      this.reset();
    }

    // ------------------------------------------------------------ level setup
    load(list) {
      const objs = (this.objs = []);
      const trig = (this.triggers = []);
      this.starts = [];
      const moveG = new Set();
      for (const src of list) {
        const d = OBJ[src.t];
        if (!d) continue;
        if (d.kind === 'trigger') {
          const t = Object.assign({}, d.props || {}, src);
          trig.push(t);
          if (t.t === 'tMove') moveG.add(+t.grp);
          continue;
        }
        if (d.kind === 'start') {
          this.starts.push(Object.assign({}, d.props || {}, src));
          continue;
        }
        const o = {
          id: objs.length, t: src.t, def: d, kind: d.kind, x: src.x, y: src.y,
          r: src.r || 0, fx: !!src.fx, fy: !!src.fy, g: +src.g || 0, s: src.s || 1,
          c: src.c || null, z: src.z || 0, ox: 0, oy: 0,
        };
        o.lh = GD.localHitbox(o, d);
        o.vr = (d.vr || 30) * o.s;
        objs.push(o);
      }
      trig.sort((a, b) => a.x - b.x);
      this.starts.sort((a, b) => a.x - b.x);

      this.groups = new Map();
      for (const o of objs) {
        o.dyn = !!(o.g && moveG.has(o.g));
        if (o.g) {
          if (!this.groups.has(o.g)) this.groups.set(o.g, []);
          this.groups.get(o.g).push(o);
        }
        if (o.lh) this.updAbs(o, 0, 0);
      }

      this.bk = new Map();
      this.dynList = [];
      for (const o of objs) {
        if (!o.lh || !CLS[o.kind]) continue;
        if (o.dyn) { this.dynList.push(o); continue; }
        const x0 = o.lh.k === 'r' ? o.x0 : o.cx - o.cr;
        const x1 = o.lh.k === 'r' ? o.x1 : o.cx + o.cr;
        for (let c = Math.floor(x0 / BW); c <= Math.floor(x1 / BW); c++) {
          let b = this.bk.get(c);
          if (!b) { b = { solid: [], hazard: [], inter: [] }; this.bk.set(c, b); }
          b[CLS[o.kind]].push(o);
        }
      }

      this.dynAll = objs.filter((o) => o.dyn);
      this.rlist = objs.slice().sort((a, b) => a.x - b.x);
      this.maxVR = 60;
      for (const o of objs) this.maxVR = Math.max(this.maxVR, o.vr);

      this.coins = objs.filter((o) => o.kind === 'coin').sort((a, b) => a.x - b.x).slice(0, 3);
      this.coins.forEach((o, i) => (o.ci = i));

      let mx = 0;
      for (const o of objs) mx = Math.max(mx, o.x);
      for (const t of trig) mx = Math.max(mx, t.x);
      this.endX = Math.max(mx + 330, 900);
    }

    updAbs(o, ox, oy) {
      o.ox = ox; o.oy = oy;
      const lh = o.lh;
      if (!lh) return;
      if (lh.k === 'r') {
        o.x0 = o.x + ox + lh.x - lh.w / 2;
        o.x1 = o.x0 + lh.w;
        o.y0 = o.y + oy + lh.y - lh.h / 2;
        o.y1 = o.y0 + lh.h;
      } else {
        o.cx = o.x + ox + lh.x;
        o.cy = o.y + oy + lh.y;
        o.cr = lh.r;
      }
    }

    reset(startPos) {
      const s = this.settings;
      const sp = startPos || this.opts.startPos || null;
      this.t = 0;
      const p = (this.p = {
        x: 0, y: 15, vy: 0, gr: s.flip ? -1 : 1, mode: s.mode || 'cube', mini: !!s.mini,
        spd: s.spd == null ? 1 : s.spd, onGround: false, onCeil: false, gobj: null, buffer: false,
        dead: false, done: false, rot: 0, rbOn: false, rb: 0, jumps: 0, tp: null,
      });
      if (sp) {
        p.x = sp.x; p.y = sp.y; p.mode = sp.mode || 'cube'; p.spd = sp.spd == null ? 1 : +sp.spd;
        p.mini = !!sp.mini; p.gr = sp.flip ? -1 : 1;
      }
      this.bnd = { floor: 0, ceil: null };
      if (CORRIDOR[p.mode]) this.setCorridor(p.mode, Math.max(p.y, CORRIDOR[p.mode] * 15));
      if (!sp) p.y = this.bnd.floor + this.hw();
      this.hold = false;
      this.pressQ = false;
      this.ti = 0;
      this.col = {};
      for (const ch of GD.CHANNELS) this.col[ch] = U.hexToRgb(s[ch] || '#ffffff');
      this.colTr = [];
      this.moves = [];
      this.off = {};
      this.alpha = {};
      this.alphaTr = [];
      this.hidden = {};
      this.pulses = [];
      this.shakeFx = null;
      this.used = [];
      this.used2 = [];
      this.p2 = null;
      this.mirror = false;
      this.coinsGot = [false, false, false];
      this.events = [];
      for (const o of this.dynList) this.updAbs(o, 0, 0);
      if (sp) {
        const T = this.triggers;
        while (this.ti < T.length && T[this.ti].x <= p.x) this.fire(T[this.ti++], true);
      }
    }

    // ------------------------------------------------------------ state copy
    snap() {
      // colour arrays are replaced, never mutated, so shallow copies are enough
      return {
        p: Object.assign({}, this.p), bnd: Object.assign({}, this.bnd), t: this.t, ti: this.ti,
        col: Object.assign({}, this.col),
        colTr: this.colTr.length ? this.colTr.map((c) => Object.assign({}, c)) : [],
        moves: this.moves.length ? this.moves.map((m) => Object.assign({}, m)) : [],
        off: copyOff(this.off),
        alpha: Object.assign({}, this.alpha),
        alphaTr: this.alphaTr.length ? this.alphaTr.map((a) => Object.assign({}, a)) : [],
        hidden: Object.assign({}, this.hidden),
        pulses: this.pulses.length ? this.pulses.map((a) => Object.assign({}, a)) : [],
        used: this.used.slice(),
        used2: this.used2.slice(),
        p2: this.p2 ? Object.assign({}, this.p2) : null,
        mirror: this.mirror,
        coins: this.coinsGot.slice(),
      };
    }

    restore(s) {
      this.p = Object.assign({}, s.p);
      this.bnd = Object.assign({}, s.bnd);
      this.t = s.t;
      this.ti = s.ti;
      this.col = Object.assign({}, s.col);
      this.colTr = s.colTr.map((c) => Object.assign({}, c));
      this.moves = s.moves.map((m) => Object.assign({}, m));
      this.off = copyOff(s.off);
      this.alpha = Object.assign({}, s.alpha);
      this.alphaTr = s.alphaTr.map((a) => Object.assign({}, a));
      this.hidden = Object.assign({}, s.hidden);
      this.pulses = s.pulses.map((a) => Object.assign({}, a));
      this.used = s.used.slice();
      this.used2 = s.used2 ? s.used2.slice() : [];
      this.p2 = s.p2 ? Object.assign({}, s.p2) : null;
      this.mirror = !!s.mirror;
      this.coinsGot = s.coins.slice();
      if (this.dynList.length || this.dynAll.length) {
        for (const o of this.dynAll) {
          const f = this.off[o.g];
          this.updAbs(o, f ? f[0] : 0, f ? f[1] : 0);
        }
      }
      this.hold = false;
      this.pressQ = false;
      this.events.length = 0;
    }

    // ------------------------------------------------------------ input
    setHold(v) {
      if (v && !this.hold) this.pressQ = true;
      this.hold = !!v;
    }

    // ------------------------------------------------------------ helpers
    hw() {
      const p = this.p;
      if (p.mode === 'wave') return p.mini ? 3.5 : 5;
      return p.mini ? 9 : 15;
    }

    ev(type, extra) {
      if (!this.fx) return;
      const e = { type, x: this.p.x, y: this.p.y };
      if (extra) Object.assign(e, extra);
      this.events.push(e);
    }

    query(x0, x1, cls) {
      const out = this._q;
      out.length = 0;
      const stamp = ++this.qs;
      const c1 = Math.floor(x1 / BW);
      for (let c = Math.floor(x0 / BW); c <= c1; c++) {
        const b = this.bk.get(c);
        if (!b) continue;
        const arr = b[cls];
        for (let i = 0; i < arr.length; i++) {
          const o = arr[i];
          if (o.qs === stamp) continue;
          o.qs = stamp;
          if (o.g && this.hidden[o.g]) continue;
          out.push(o);
        }
      }
      for (const o of this.dynList) {
        if (CLS[o.kind] === cls && !(o.g && this.hidden[o.g])) out.push(o);
      }
      return out;
    }

    isUsed(o) {
      return this.used.indexOf(o.id) !== -1;
    }

    use(o) {
      this.used.push(o.id);
      if (this.used.length > 12) {
        const px = this.p.x;
        this.used = this.used.filter((id) => this.objs[id].x > px - 90);
      }
    }

    setCorridor(mode, cy) {
      const H = CORRIDOR[mode] * 30;
      let fl = Math.max(0, Math.round((cy - H / 2) / 30) * 30);
      if (cy - H / 2 < 45) fl = 0;
      this.bnd.floor = fl;
      this.bnd.ceil = fl + H;
    }

    die(by) {
      if (this.p.dead) return;
      this.killer = by || null;
      this.p.dead = true;
      this.ev('death');
    }

    // ------------------------------------------------------------ triggers
    fire(tr, instant) {
      switch (tr.t) {
        case 'tColor': {
          const to = U.hexToRgb(tr.col);
          this.colTr = this.colTr.filter((c) => c.ch !== tr.ch);
          if (instant || !(tr.d > 0)) this.col[tr.ch] = to;
          else this.colTr.push({ ch: tr.ch, from: this.col[tr.ch].slice(), to, t: 0, d: +tr.d });
          break;
        }
        case 'tMove': {
          const g = +tr.grp, dx = (+tr.dx || 0) * 30, dy = (+tr.dy || 0) * 30;
          if (instant || !(tr.d > 0)) this.moveGroup(g, dx, dy);
          else this.moves.push({ g, dx, dy, d: +tr.d, t: 0, e: tr.e || 'inOut', ax: 0, ay: 0 });
          break;
        }
        case 'tAlpha': {
          const g = +tr.grp;
          const cur = this.alpha[g] == null ? 1 : this.alpha[g];
          this.alphaTr = this.alphaTr.filter((a) => a.g !== g);
          if (instant || !(tr.d > 0)) this.alpha[g] = +tr.a;
          else this.alphaTr.push({ g, from: cur, to: +tr.a, t: 0, d: +tr.d });
          break;
        }
        case 'tToggle':
          this.hidden[+tr.grp] = !tr.on;
          break;
        case 'tPulse':
          if (!instant) this.pulses.push({ ch: tr.ch, col: U.hexToRgb(tr.col), fi: +tr.fi || 0, h: +tr.h || 0, fo: +tr.fo || 0, t: 0 });
          break;
        case 'tShake':
          if (!instant) this.shakeFx = { s: +tr.s || 4, d: +tr.d || 0.5, t: 0 };
          break;
      }
    }

    moveGroup(g, dx, dy) {
      const f = this.off[g] || (this.off[g] = [0, 0]);
      f[0] += dx;
      f[1] += dy;
      const list = this.groups.get(g);
      if (list) for (const o of list) this.updAbs(o, f[0], f[1]);
    }

    effects(dt) {
      if (this.colTr.length) {
        for (const c of this.colTr) {
          c.t += dt;
          this.col[c.ch] = U.mix(c.from, c.to, Math.min(1, c.t / c.d));
        }
        this.colTr = this.colTr.filter((c) => c.t < c.d);
      }
      this.carry = 0;
      if (this.moves.length) {
        const p = this.p;
        const gobj = p.onGround && p.gobj != null ? this.objs[p.gobj] : null;
        for (const m of this.moves) {
          m.t += dt;
          const k = (U.ease[m.e] || U.ease.inOut)(Math.min(1, m.t / m.d));
          const tx = m.dx * k, ty = m.dy * k;
          const ddx = tx - m.ax, ddy = ty - m.ay;
          m.ax = tx;
          m.ay = ty;
          this.moveGroup(m.g, ddx, ddy);
          if (gobj && gobj.g === m.g) this.carry += ddy;
        }
        this.moves = this.moves.filter((m) => m.t < m.d);
      }
      if (this.alphaTr.length) {
        for (const a of this.alphaTr) {
          a.t += dt;
          this.alpha[a.g] = U.lerp(a.from, a.to, Math.min(1, a.t / a.d));
        }
        this.alphaTr = this.alphaTr.filter((a) => a.t < a.d);
      }
      if (this.pulses.length) {
        for (const pl of this.pulses) pl.t += dt;
        this.pulses = this.pulses.filter((pl) => pl.t < pl.fi + pl.h + pl.fo);
      }
      if (this.shakeFx) {
        this.shakeFx.t += dt;
        if (this.shakeFx.t > this.shakeFx.d) this.shakeFx = null;
      }
    }

    // ------------------------------------------------------------ main step
    step() {
      const p = this.p;
      if (p.dead || p.done) return;
      this.main = p;
      const dt = DT;
      this.t += dt;
      let pressed = false;
      if (this.pressQ) {
        this.pressQ = false;
        p.buffer = true;
        if (this.p2) this.p2.buffer = true;
        pressed = true;
      }
      const hold = this.hold || pressed;

      const T = this.triggers;
      while (this.ti < T.length && T[this.ti].x <= p.x) this.fire(T[this.ti++], false);
      this.effects(dt);
      if (this.carry) p.y += this.carry;

      this.stepPlayer(hold, dt);
      if (this.p2 && !p.dead) {
        // second player (dual mode): same physics, own state, swapped in temporarily
        const p2 = this.p2;
        p2.x = p.x - SPEEDS[p.spd] * dt;
        const u = this.used;
        this.p = p2;
        this.used = this.used2;
        this.stepPlayer(hold, dt);
        this.used2 = this.used;
        this.used = u;
        this.p = p;
        if (p2.dead) p.dead = true;
        if (this.p2 && this.p2 !== p2) this.p2.x = p.x; // dual portal touched by player 2
      }
      if (!p.dead && p.x >= this.endX) {
        p.done = true;
        this.ev('complete');
      }
    }

    stepPlayer(hold, dt) {
      const p = this.p;
      p.tp = null;
      let hw = this.hw();
      if (p.buffer) this.orbs(hw);
      this.move(hold, dt, hw);

      const speed = SPEEDS[p.spd];
      p.x += speed * dt;
      p.y += p.vy * dt;

      hw = this.hw();
      if (p.mode === 'wave') this.collideWave(hw, dt);
      else this.collide(hw);
      if (p.dead) return;
      this.hazards(hw);
      if (p.dead) return;
      this.interact(hw);
      if (!hold) p.buffer = false;
      this.visual(dt, speed);
      if (p.y > 4000 || p.y < -600) this.die('out of bounds');
    }

    move(hold, dt, hw) {
      const p = this.p;
      const ms = p.mini ? 0.8 : 1;
      switch (p.mode) {
        case 'cube':
          if (p.onGround && hold) {
            p.vy = p.gr * JUMP * ms;
            p.onGround = false;
            p.buffer = false;
            p.jumps++;
            this.ev('jump');
          } else {
            p.vy -= p.gr * G * dt;
            if (p.vy * p.gr < -MAXFALL) p.vy = -p.gr * MAXFALL;
          }
          break;
        case 'robot':
          if (p.onGround && hold) {
            p.vy = p.gr * ROBOT_V * ms;
            p.rbOn = true;
            p.rb = 0;
            p.onGround = false;
            p.buffer = false;
            p.jumps++;
            this.ev('jump');
          } else if (p.rbOn && hold && p.rb < ROBOT_T) {
            p.rb += dt;
            p.vy = p.gr * ROBOT_V * ms;
          } else {
            p.rbOn = false;
            p.vy -= p.gr * G * 0.9 * dt;
            if (p.vy * p.gr < -MAXFALL) p.vy = -p.gr * MAXFALL;
          }
          break;
        case 'ship': {
          const falling = p.vy * p.gr < 0;
          let a;
          if (hold) a = falling ? 0.5 : 0.4;
          else a = falling ? -0.32 : -0.48;
          if (p.mini) a *= 1.15;
          p.vy += p.gr * a * G * dt;
          const up = p.mini ? 440 : 480, down = p.mini ? 400 : 384;
          if (p.vy * p.gr > up) p.vy = p.gr * up;
          if (p.vy * p.gr < -down) p.vy = -p.gr * down;
          break;
        }
        case 'ufo':
          if (p.buffer) {
            p.vy = p.gr * UFO_V * ms;
            p.buffer = false;
            p.onGround = false;
            p.jumps++;
            this.ev('jump');
          } else {
            p.vy -= p.gr * G * 0.55 * dt;
            if (p.vy * p.gr < -480) p.vy = -p.gr * 480;
          }
          break;
        case 'ball':
          if (p.onGround && p.buffer) {
            p.gr = -p.gr;
            p.vy = -p.gr * 200;
            p.onGround = false;
            p.buffer = false;
            p.jumps++;
            this.ev('jump');
          } else {
            p.vy -= p.gr * G * 0.6 * dt;
            if (p.vy * p.gr < -MAXFALL) p.vy = -p.gr * MAXFALL;
          }
          break;
        case 'spider':
          if (p.onGround && p.buffer) {
            this.teleport(hw);
          } else {
            p.vy -= p.gr * G * 0.6 * dt;
            if (p.vy * p.gr < -MAXFALL) p.vy = -p.gr * MAXFALL;
          }
          break;
        case 'wave':
          p.vy = (hold ? 1 : -1) * p.gr * SPEEDS[p.spd] * (p.mini ? 2 : 1);
          break;
        case 'swing':
          if (p.buffer) {
            p.gr = -p.gr;
            p.vy *= 0.55;
            p.buffer = false;
            p.onGround = false;
            p.jumps++;
            this.ev('jump');
          }
          p.vy -= p.gr * G * 0.4 * dt;
          if (p.vy * p.gr < -420) p.vy = -p.gr * 420;
          if (p.vy * p.gr > 420) p.vy = p.gr * 420;
          break;
      }
    }

    teleport(hw) {
      const p = this.p, b = this.bnd;
      const up = p.gr > 0;
      let target = up ? (b.ceil != null ? b.ceil : Infinity) : b.floor;
      const x0 = p.x - hw + 1, x1 = p.x + hw - 1;
      const list = this.query(x0, x1, 'solid');
      for (const o of list) {
        if (o.lh.k !== 'r' || o.x1 <= x0 || o.x0 >= x1) continue;
        if (up) {
          if (o.y0 >= p.y + hw - 2 && o.y0 < target) target = o.y0;
        } else if (o.y1 <= p.y - hw + 2 && o.y1 > target) target = o.y1;
      }
      const from = p.y;
      p.gr = -p.gr;
      p.vy = 0;
      p.buffer = false;
      p.jumps++;
      if (target !== Infinity) {
        p.y = up ? target - hw : target + hw;
        p.onGround = true;
      } else {
        p.onGround = false;
      }
      p.tp = [from, p.y];
      this.ev('teleport', { from, to: p.y });
    }

    // ------------------------------------------------------------ collisions
    collide(hw) {
      const p = this.p, b = this.bnd;
      p.onGround = false;
      p.onCeil = false;
      p.gobj = null;
      if (p.y - hw < b.floor) {
        p.y = b.floor + hw;
        if (p.gr > 0) {
          if (p.vy <= 0) { p.vy = 0; p.onGround = true; }
        } else {
          if (p.vy < 0) p.vy = 0;
          p.onCeil = true;
        }
      }
      if (b.ceil != null && p.y + hw > b.ceil) {
        p.y = b.ceil - hw;
        if (p.gr < 0) {
          if (p.vy >= 0) { p.vy = 0; p.onGround = true; }
        } else {
          if (p.vy > 0) p.vy = 0;
          p.onCeil = true;
        }
      }
      const tol = p.mini ? 6 : 10;
      const list = this.query(p.x - hw, p.x + hw, 'solid');
      if (!list.length) return;
      let x0 = p.x - hw, x1 = p.x + hw, y0 = p.y - hw, y1 = p.y + hw;
      let best = null, by = 0;
      for (const o of list) {
        if (!hit(o, x0, y0, x1, y1)) continue;
        if (p.gr > 0) {
          if (p.vy <= 0 && y0 >= o.y1 - tol && (best === null || o.y1 > by)) { best = o; by = o.y1; }
        } else if (p.vy >= 0 && y1 <= o.y0 + tol && (best === null || o.y0 < by)) { best = o; by = o.y0; }
      }
      if (best) {
        p.y = p.gr > 0 ? by + hw : by - hw;
        p.vy = 0;
        p.onGround = true;
        p.gobj = best.id;
        y0 = p.y - hw;
        y1 = p.y + hw;
      }
      if (CEIL[p.mode]) {
        for (const o of list) {
          if (o === best || !hit(o, x0, y0, x1, y1)) continue;
          if (p.gr > 0) {
            if (p.vy >= 0 && y1 <= o.y0 + tol) {
              p.y = o.y0 - hw;
              p.vy = 0;
              p.onCeil = true;
              y0 = p.y - hw;
              y1 = p.y + hw;
            }
          } else if (p.vy <= 0 && y0 >= o.y1 - tol) {
            p.y = o.y1 + hw;
            p.vy = 0;
            p.onCeil = true;
            y0 = p.y - hw;
            y1 = p.y + hw;
          }
        }
      }
      const ih = hw * 0.3;
      for (const o of list) {
        if (hit(o, p.x - ih, p.y - ih, p.x + ih, p.y + ih)) {
          this.die(o);
          return;
        }
      }
    }

    collideWave(hw, dt) {
      const p = this.p, b = this.bnd;
      p.onGround = false;
      p.onCeil = false;
      if (p.y - hw < b.floor) { p.y = b.floor + hw; p.onGround = p.gr > 0; p.onCeil = p.gr < 0; }
      if (b.ceil != null && p.y + hw > b.ceil) { p.y = b.ceil - hw; p.onGround = p.gr < 0; p.onCeil = p.gr > 0; }
      const list = this.query(p.x - hw, p.x + hw, 'solid');
      if (!list.length) return;
      const tol = Math.abs(p.vy) * dt + 1.5;
      for (const o of list) {
        const x0 = p.x - hw, x1 = p.x + hw, y0 = p.y - hw, y1 = p.y + hw;
        if (!hit(o, x0, y0, x1, y1)) continue;
        if (o.lh.k === 'r' && p.vy <= 0 && y0 >= o.y1 - tol) {
          p.y = o.y1 + hw;
          if (p.gr > 0) p.onGround = true; else p.onCeil = true;
        } else if (o.lh.k === 'r' && p.vy >= 0 && y1 <= o.y0 + tol) {
          p.y = o.y0 - hw;
          if (p.gr < 0) p.onGround = true; else p.onCeil = true;
        } else {
          this.die(o);
          return;
        }
      }
    }

    hazards(hw) {
      const p = this.p;
      const list = this.query(p.x - hw, p.x + hw, 'hazard');
      const x0 = p.x - hw, x1 = p.x + hw, y0 = p.y - hw, y1 = p.y + hw;
      for (const o of list) {
        if (hit(o, x0, y0, x1, y1)) {
          this.die(o);
          return;
        }
      }
    }

    orbs(hw) {
      const p = this.p;
      const list = this.query(p.x - hw, p.x + hw, 'inter');
      const x0 = p.x - hw, x1 = p.x + hw, y0 = p.y - hw, y1 = p.y + hw;
      for (const o of list) {
        if (o.kind !== 'orb' || this.isUsed(o) || !hit(o, x0, y0, x1, y1)) continue;
        if (p.mode === 'wave' && o.t !== 'orbB' && o.t !== 'orbG') continue;
        this.applyOrb(o);
        this.use(o);
        p.buffer = false;
        this.ev('orb', { obj: o.id });
        return;
      }
    }

    applyOrb(o) {
      const p = this.p;
      const m = IM[p.mode] * (p.mini ? 0.8 : 1);
      switch (o.t) {
        case 'orbY': p.vy = p.gr * 670.8 * m; break;
        case 'orbP': p.vy = p.gr * 480 * m; break;
        case 'orbR': p.vy = p.gr * 925 * m; break;
        case 'orbB': p.gr = -p.gr; p.vy = -p.gr * 300 * m; break;
        case 'orbG': p.gr = -p.gr; p.vy = -p.gr * 670.8 * m; break;
        case 'orbK': p.vy = -p.gr * 900 * Math.max(m, 0.5); break;
      }
      p.rbOn = false;
      p.onGround = false;
    }

    interact(hw) {
      const p = this.p;
      const list = this.query(p.x - hw, p.x + hw, 'inter');
      if (!list.length) return;
      const x0 = p.x - hw, x1 = p.x + hw, y0 = p.y - hw, y1 = p.y + hw;
      for (const o of list) {
        if (o.kind === 'orb' || this.isUsed(o) || !hit(o, x0, y0, x1, y1)) continue;
        if (o.kind === 'coin') {
          if (!this.coinsGot[o.ci]) {
            this.coinsGot[o.ci] = true;
            this.ev('coin', { obj: o.id });
          }
          this.use(o);
          continue;
        }
        if (o.kind === 'pad') {
          if (p.mode === 'wave' && o.t !== 'padB') continue;
          this.use(o);
          const m = IM[p.mode] * (p.mini ? 0.8 : 1);
          if (o.t === 'padY') p.vy = p.gr * 960 * m;
          else if (o.t === 'padP') p.vy = p.gr * 600 * m;
          else if (o.t === 'padR') p.vy = p.gr * 1200 * m;
          else if (o.t === 'padB') { p.gr = -p.gr; p.vy = -p.gr * 520 * Math.max(m, 0.5); }
          p.onGround = false;
          p.rbOn = false;
          this.ev('pad', { obj: o.id });
          continue;
        }
        if (o.kind === 'portal') {
          this.use(o);
          this.portal(o);
        }
      }
    }

    /** Is the player currently the second (dual) player? */
    isP2() {
      return this.p2 != null && this.p === this.p2;
    }

    setMode(pl, mode) {
      if (pl.mode !== mode) {
        pl.mode = mode;
        pl.vy *= 0.5;
        pl.rbOn = false;
        pl.rot = 0;
      }
    }

    dualCorridor(cy) {
      if (this.bnd.ceil != null) return; // keep the corridor of a flying section
      const H = (CORRIDOR[this.p.mode] || 10) * 30;
      let fl = Math.max(0, Math.round((cy - H / 2) / 30) * 30);
      if (cy - H / 2 < 45) fl = 0;
      this.bnd.floor = fl;
      this.bnd.ceil = fl + H;
    }

    portal(o) {
      const p = this.p, d = o.def;
      const oy = o.y + o.oy;
      const main = this.main || p;
      if (d.mode) {
        // in dual mode a gamemode portal switches both players
        this.setMode(main, d.mode);
        if (this.p2) {
          this.setMode(this.p2, d.mode);
          if (CORRIDOR[d.mode]) this.setCorridor(d.mode, oy);
          else this.dualCorridor(oy);
        } else if (CORRIDOR[d.mode]) this.setCorridor(d.mode, oy);
        else { this.bnd.floor = 0; this.bnd.ceil = null; }
        this.ev('portal', { obj: o.id, mode: d.mode });
        return;
      }
      switch (o.t) {
        case 'pDual':
          if (!this.p2) {
            const p2 = Object.assign({}, p);
            this.dualCorridor(oy);
            // the second player appears mirrored across the middle of the corridor
            p2.y = this.bnd.floor + this.bnd.ceil - p.y;
            p2.gr = -p.gr;
            p2.vy = -p.vy;
            p2.onGround = false;
            p2.buffer = false;
            p2.rbOn = false;
            this.p2 = p2;
            this.used2 = [o.id];
            this.ev('portal', { obj: o.id });
          }
          break;
        case 'pSingle':
          if (this.p2) {
            this.p2 = null;
            this.used2 = [];
            if (!CORRIDOR[p.mode]) { this.bnd.floor = 0; this.bnd.ceil = null; }
            this.ev('portal', { obj: o.id });
          }
          break;
        case 'pMirror':
          if (!this.mirror) { this.mirror = true; this.ev('portal', { obj: o.id }); }
          break;
        case 'pUnmirror':
          if (this.mirror) { this.mirror = false; this.ev('portal', { obj: o.id }); }
          break;
        case 'pGravU':
          if (p.gr > 0) { p.gr = -1; p.vy *= 0.5; p.onGround = false; this.ev('gravity', { obj: o.id }); }
          break;
        case 'pGravD':
          if (p.gr < 0) { p.gr = 1; p.vy *= 0.5; p.onGround = false; this.ev('gravity', { obj: o.id }); }
          break;
        case 'pMini':
          if (!p.mini) {
            p.mini = true;
            if (this.p2) { main.mini = true; this.p2.mini = true; }
            this.ev('portal', { obj: o.id });
          }
          break;
        case 'pBig':
          if (p.mini) {
            for (const pl of this.p2 ? [main, this.p2] : [p]) {
              if (!pl.mini) continue;
              pl.mini = false;
              if (pl.onGround) pl.y += pl.gr * (pl.mode === 'wave' ? 1.5 : 6);
            }
            this.ev('portal', { obj: o.id });
          }
          break;
        default:
          if (d.spd != null && p.spd !== d.spd) {
            main.spd = d.spd;
            if (this.p2) this.p2.spd = d.spd;
            p.spd = d.spd;
            this.ev('speed', { obj: o.id });
          }
      }
    }

    visual(dt, speed) {
      const p = this.p;
      switch (p.mode) {
        case 'cube':
          if (!p.onGround) p.rot += p.gr * (p.mini ? 520 : 462) * dt;
          else {
            const tgt = Math.round(p.rot / 90) * 90;
            p.rot += (tgt - p.rot) * Math.min(1, dt * 28);
          }
          break;
        case 'ball':
          p.rot += p.gr * (speed / (p.mini ? 9 : 15)) * 57.2958 * dt;
          break;
        case 'ship':
        case 'swing':
        case 'wave': {
          const tgt = (-Math.atan2(p.vy, speed) * 180) / Math.PI;
          p.rot = p.mode === 'wave' ? tgt : p.rot + (tgt - p.rot) * Math.min(1, dt * 18);
          break;
        }
        default:
          p.rot = 0;
      }
    }

    progress() {
      return U.clamp(this.p.x / this.endX, 0, 1);
    }
  }

  GD.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
