/* A play session: steps the World, drives the camera, effects, music, practice checkpoints. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const U = GD.U;
  const DT = GD.PH.DT;

  class Game {
    /**
     * info: { id, name, level:{settings,objects}, builtin, song }
     * opts: { practice, test (editor playtest), startPos, onExit, onComplete }
     */
    constructor(app, info, opts) {
      this.app = app;
      this.r = app.renderer;
      this.info = info;
      this.opts = opts || {};
      this.practice = !!this.opts.practice;
      this.world = new GD.World(info.level, { fx: true, startPos: this.opts.startPos });
      this.startSnap = this.world.snap();
      this.cam = { x: 0, y: -90 };
      this.vis = { floor: 0, ceil: null };
      this.state = 'play';
      this.acc = 0;
      this.time = 0;
      this.attempt = 1;
      this.sessionJumps = 0;
      this.playTime = 0;
      this.checkpoints = [];
      this.trail = [];
      this.streak = [];
      this.paused = false;
      this.prev = { x: 0, y: 0 };
      this.prev2 = { x: 0, y: 0 };
      this.trail2 = [];
      this.lastCP = 0;
      this.fpsT = 0;
      this.fpsN = 0;
      this.fps = 60;
      const rec = this.record();
      if (rec) this.attempt = (rec.att || 0) + 1;
      this.startAttempt(true);
    }

    record() {
      if (!this.info.builtin && !this.info.user) return null;
      return this.app.levelRecord(this.info.id);
    }

    get settings() {
      return this.app.save.settings;
    }

    // ------------------------------------------------------------------ attempts
    startAttempt(first) {
      const w = this.world;
      if (this.practice && this.checkpoints.length) {
        const cp = this.checkpoints[this.checkpoints.length - 1];
        w.restore(cp.snap);
      } else {
        w.restore(this.startSnap);
        if (!first || !this.practice) this.attemptX = w.p.x;
        if (!this.practice || first) this.playMusic(first);
      }
      if (first) this.attemptX = w.p.x;
      w.setHold(this.app.input.hold);
      w.pressQ = false;
      this.state = 'play';
      this.deadT = 0;
      this.trail.length = 0;
      this.trail2.length = 0;
      this.streak.length = 0;
      this.prev.x = w.p.x;
      this.prev.y = w.p.y;
      if (w.p2) { this.prev2.x = w.p2.x; this.prev2.y = w.p2.y; }
      this.r.m = w.mirror ? -1 : 1;
      this.snapCamera();
      this.lastCP = w.t;
    }

    playMusic() {
      const A = GD.Audio;
      if (this.practice) A.play('practice', { fadeIn: 0.3 });
      else A.play(this.info.level.settings.song || 'neon');
    }

    snapCamera() {
      const w = this.world, p = w.p;
      this.cam.x = p.x - this.camOffset();
      this.vis.floor = w.bnd.floor;
      this.vis.ceil = w.bnd.ceil;
      if (w.bnd.ceil != null) this.cam.y = (w.bnd.floor + w.bnd.ceil) / 2 - this.r.VH / 2;
      else this.cam.y = Math.max(this.r.groundCam(), p.y - 140);
    }

    camOffset() {
      return U.clamp(this.r.VW * 0.3, 110, 230);
    }

    // ------------------------------------------------------------------ input
    press() {
      if (this.state === 'play' && !this.paused) this.world.setHold(true);
    }
    release() {
      this.world.setHold(false);
    }

    placeCheckpoint() {
      if (!this.practice || this.state !== 'play') return;
      const w = this.world;
      this.checkpoints.push({ snap: w.snap(), x: w.p.x, y: w.p.y });
      this.lastCP = w.t;
      this.r.ring(w.p.x, w.p.y, 4, 26, 0.35, 'rgba(120,255,120,0.9)', 2);
    }
    removeCheckpoint() {
      if (!this.practice) return;
      this.checkpoints.pop();
    }

    setPractice(on) {
      if (this.opts.test) return;
      this.practice = on;
      this.checkpoints = [];
      this.attempt++;
      this.startAttempt(true);
    }

    restart() {
      this.checkpoints = [];
      this.attempt++;
      this.saveAttempt();
      this.startAttempt(false);
      if (this.practice) this.playMusic();
    }

    saveAttempt() {
      const rec = this.record();
      if (rec) {
        rec.att = (rec.att || 0) + 1;
        this.app.persist();
      }
      this.app.save.stats.attempts++;
    }

    // ------------------------------------------------------------------ update
    update(dt) {
      this.fpsT += dt;
      this.fpsN++;
      if (this.fpsT >= 0.5) { this.fps = Math.round(this.fpsN / this.fpsT); this.fpsT = 0; this.fpsN = 0; }
      if (this.paused) return;
      dt = Math.min(dt, 0.1);
      this.time += dt;
      const w = this.world;
      if (this.state === 'play') {
        this.playTime += dt;
        this.acc += dt;
        while (this.acc >= DT) {
          this.acc -= DT;
          this.prev.x = w.p.x;
          this.prev.y = w.p.y;
          const had2 = !!w.p2;
          if (w.p2) { this.prev2.x = w.p2.x; this.prev2.y = w.p2.y; }
          w.step();
          if (w.p2 && !had2) { this.prev2.x = w.p2.x; this.prev2.y = w.p2.y; this.trail2.length = 0; }
          this.handleEvents();
          if (w.p.dead) { this.onDeath(); break; }
          if (w.p.done) { this.onComplete(); break; }
        }
        if (this.state === 'play') {
          this.emitTrails(dt);
          if (this.practice && this.settings.autoCP && w.t - this.lastCP > 3 && this.safeForCP()) this.placeCheckpoint();
        }
      } else if (this.state === 'dead') {
        this.deadT += dt;
        if (this.deadT >= 1.0) {
          this.attempt++;
          this.startAttempt(false);
        }
      } else if (this.state === 'complete') {
        this.doneT += dt;
        this.completeFx(dt);
        if (!this.shownComplete && this.doneT > 1.6) {
          this.shownComplete = true;
          this.app.showComplete(this);
        }
      }
      // mirror portal: squeeze the screen through 0 to -1 like the original
      const mt = w.mirror ? -1 : 1;
      if (this.r.m !== mt) {
        const d = mt - this.r.m;
        this.r.m += Math.sign(d) * Math.min(Math.abs(d), dt * 4);
      }
      this.updateCamera(dt);
      this.r.updateParticles(dt);
    }

    safeForCP() {
      const p = this.world.p;
      if (p.mode === 'cube' || p.mode === 'robot') return p.onGround;
      if (p.mode === 'ball' || p.mode === 'spider') return p.onGround;
      return true;
    }

    updateCamera(dt) {
      const w = this.world, p = w.p, r = this.r;
      const alpha = this.state === 'play' ? this.acc / DT : 1;
      const px = U.lerp(this.prev.x, p.x, alpha);
      this.rx = px;
      this.ry = U.lerp(this.prev.y, p.y, alpha);
      if (w.p2) this.ry2 = U.lerp(this.prev2.y, w.p2.y, alpha);
      let cx = px - this.camOffset();
      const stopX = w.endX - r.VW * 0.72;
      if (cx > stopX) cx = stopX;
      if (this.state !== 'dead') this.cam.x = cx;
      const k = Math.min(1, dt * 5);
      if (w.bnd.ceil != null) {
        const ty = (w.bnd.floor + w.bnd.ceil) / 2 - r.VH / 2;
        this.cam.y += (ty - this.cam.y) * k;
      } else if (this.state === 'play') {
        let ty = this.cam.y;
        const mTop = Math.max(110, r.VH * 0.3), mBot = Math.max(120, r.VH * 0.36);
        const top = this.cam.y + r.VH - mTop, bot = this.cam.y + mBot;
        if (p.y > top) ty = p.y - (r.VH - mTop);
        else if (p.y < bot) ty = p.y - mBot;
        ty = Math.max(r.groundCam(), ty);
        this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 7);
      }
      const ceilT = w.bnd.ceil != null ? w.bnd.ceil : this.cam.y + r.VH + 80;
      this.vis.floor += (w.bnd.floor - this.vis.floor) * k;
      if (this.vis.ceil == null) this.vis.ceil = this.cam.y + r.VH + 80;
      this.vis.ceil += (ceilT - this.vis.ceil) * k;
    }

    // ------------------------------------------------------------------ effects
    iconCols() {
      return this.app.save.icons;
    }

    handleEvents() {
      const w = this.world, ev = w.events;
      if (!ev.length) return;
      const r = this.r;
      const ic = this.iconCols();
      for (const e of ev) {
        switch (e.type) {
          case 'jump':
            this.sessionJumps++;
            this.app.save.stats.jumps++;
            break;
          case 'orb': {
            const o = w.objs[e.obj];
            r.ring(o.x + o.ox, o.y + o.oy, 10, 34, 0.35, o.def.c, 2.5);
            r.burst(o.x + o.ox, o.y + o.oy, 8, o.def.c, 140, 0.4, 3, { shape: 'ci', add: true });
            this.streakT = 0.45;
            break;
          }
          case 'pad': {
            const o = w.objs[e.obj];
            for (let i = 0; i < 10; i++) r.spawn(o.x + (Math.random() - 0.5) * 22, o.y - 12 * (o.r === 180 ? -1 : 1), (Math.random() - 0.5) * 40, (o.r === 180 ? -1 : 1) * (120 + Math.random() * 120), 0.45, 3, o.def.c, { shape: 'ci', add: true });
            this.streakT = 0.45;
            break;
          }
          case 'portal':
          case 'gravity': {
            const o = w.objs[e.obj];
            r.ring(o.x + o.ox, o.y + o.oy, 10, 60, 0.4, o.def.c || '#fff', 3);
            if (e.mode) this.trail.length = 0;
            break;
          }
          case 'coin': {
            const o = w.objs[e.obj];
            GD.Audio.sfx('coin');
            r.ring(o.x, o.y, 8, 40, 0.5, '#ffd84a', 3);
            r.burst(o.x, o.y, 16, '#ffe680', 180, 0.6, 4, { shape: 'ci', add: true });
            for (let i = 0; i < 6; i++) r.spawn(o.x, o.y, (Math.random() - 0.5) * 30, 160 + i * 20, 0.8, 7 - i, '#ffd23a', { shape: 'ci' });
            break;
          }
          case 'teleport':
            for (let y = Math.min(e.from, e.to); y < Math.max(e.from, e.to); y += 8) {
              r.spawn(e.x, y, -40, 0, 0.35, 5, ic.c2, { add: true });
            }
            break;
          case 'death':
            this.deathFx();
            break;
        }
      }
      ev.length = 0;
    }

    deathFx() {
      const p = this.world.p, r = this.r, ic = this.iconCols();
      r.ring(p.x, p.y, 6, 70, 0.5, ic.c1, 0, true);
      r.ring(p.x, p.y, 10, 90, 0.6, '#ffffff', 3);
      r.burst(p.x, p.y, 26, ic.c1, 420, 0.8, 7, { drag: 2.2 });
      r.burst(p.x, p.y, 14, ic.c2, 300, 0.7, 5, { drag: 2 });
      r.burst(p.x, p.y, 12, '#ffffff', 520, 0.4, 3, { shape: 'ci', add: true, drag: 3 });
    }

    emitTrails(dt) {
      const w = this.world, ic = this.iconCols();
      this.partT = (this.partT || 0) + dt;
      const emit = this.partT > 0.025;
      if (emit) this.partT = 0;
      this.emitFor(w.p, this.trail, emit, ic.c1);
      if (w.p2) this.emitFor(w.p2, this.trail2, emit, ic.c2);
      else if (this.trail2.length) this.trail2.length = 0;
      const p = w.p;
      if (this.streakT > 0) {
        this.streakT -= dt;
        this.streak.push([p.x, p.y, this.time]);
      }
      while (this.streak.length && this.time - this.streak[0][2] > 0.25) this.streak.shift();
    }

    emitFor(p, trail, emit, color) {
      const r = this.r;
      const hw = p.mode === 'wave' ? (p.mini ? 3.5 : 5) : p.mini ? 9 : 15;
      const s = p.mini ? 0.6 : 1;
      if (emit) {
        if (p.onGround && (p.mode === 'cube' || p.mode === 'robot' || p.mode === 'ball' || p.mode === 'spider')) {
          const fy = p.y - p.gr * hw;
          r.spawn(p.x - hw * 0.8, fy + p.gr * 2, -60 - Math.random() * 60, p.gr * (20 + Math.random() * 60), 0.35, 3.2 * s, color);
        }
        if (p.mode === 'ship' || p.mode === 'ufo' || p.mode === 'swing') {
          const a = (p.rot * Math.PI) / 180;
          const bx = p.x - Math.cos(a) * 18 * s, by = p.y + Math.sin(a) * 18 * s - (p.mode === 'ufo' ? 8 * p.gr * s : 0);
          const hold = this.app.input.hold;
          const n = hold ? 2 : 1;
          for (let i = 0; i < n; i++) {
            r.spawn(bx, by + (Math.random() - 0.5) * 6 * s, -120 - Math.random() * 60, (Math.random() - 0.5) * 40, 0.3, (hold ? 6 : 4) * s, hold ? '#ffcc44' : '#ff7a2e', { shape: 'ci', add: true, drag: 3 });
          }
        }
      }
      if (p.mode === 'wave') {
        trail.push([p.x, p.y]);
        while (trail.length > 2 && trail[0][0] < this.cam.x - 60) trail.shift();
        if (trail.length > 600) trail.shift();
      } else if (trail.length) {
        trail.length = 0;
      }
    }

    onDeath() {
      const w = this.world;
      this.state = 'dead';
      this.deadT = 0;
      GD.Audio.sfx('death');
      if (!this.practice) GD.Audio.stop(0.05);
      if (!this.opts.test) this.app.save.stats.deaths++;
      const pct = Math.floor(w.progress() * 100);
      const rec = this.record();
      if (rec && !this.opts.test) {
        rec.att = (rec.att || 0) + 1;
        rec.jumps = (rec.jumps || 0) + this.sessionJumps;
        this.sessionJumps = 0;
        if (this.practice) {
          if (pct > (rec.pbest || 0)) rec.pbest = pct;
        } else if (pct > (rec.best || 0)) {
          rec.best = pct;
          this.newBest = pct;
          this.newBestT = this.time;
        }
      }
      if (!this.opts.test) this.app.save.stats.attempts++;
      this.app.persist();
    }

    onComplete() {
      const w = this.world;
      this.state = 'complete';
      this.doneT = 0;
      this.shownComplete = false;
      GD.Audio.sfx('complete');
      const r = this.r;
      const ex = w.endX, ey = w.p.y;
      r.ring(ex, ey, 10, 140, 0.9, '#ffffff', 5);
      r.ring(ex, ey, 10, 90, 0.7, this.iconCols().c1, 0, true);
      r.burst(ex, ey, 40, this.iconCols().c1, 500, 1.2, 6, { drag: 1.5 });
      r.burst(ex, ey, 30, '#ffffff', 600, 0.8, 4, { shape: 'ci', add: true, drag: 2 });
      const rec = this.record();
      this.result = { newBest: false, stars: 0, coins: w.coinsGot.slice(), newCoins: 0, practice: this.practice };
      if (rec && !this.opts.test) {
        rec.jumps = (rec.jumps || 0) + this.sessionJumps;
        this.sessionJumps = 0;
        if (this.practice) rec.pbest = 100;
        else {
          if ((rec.best || 0) < 100) this.result.newBest = true;
          rec.best = 100;
          if (!rec.done) {
            rec.done = true;
            this.result.stars = this.info.stars || 0;
            this.app.save.stats.completed++;
          }
          rec.coins = rec.coins || [false, false, false];
          w.coinsGot.forEach((c, i) => {
            if (c && !rec.coins[i]) { rec.coins[i] = true; this.result.newCoins++; }
          });
        }
        this.app.persist();
      }
    }

    completeFx(dt) {
      const r = this.r;
      this.fxT = (this.fxT || 0) + dt;
      if (this.fxT > 0.18 && this.doneT < 2.5) {
        this.fxT = 0;
        const x = this.cam.x + r.VW * (0.45 + Math.random() * 0.5), y = this.cam.y + r.VH * (0.35 + Math.random() * 0.5);
        const cols = ['#ff4a8d', '#46e3ff', '#ffd23f', '#8cff5a', '#ffffff'];
        const c = cols[Math.floor(Math.random() * cols.length)];
        r.burst(x, y, 18, c, 260, 0.9, 3.5, { shape: 'ci', add: true, g: -150, drag: 1 });
        r.ring(x, y, 4, 40, 0.5, c, 2);
      }
    }

    // ------------------------------------------------------------------ render
    render() {
      const r = this.r, w = this.world, p = w.p;
      const cam = { x: this.cam.x, y: this.cam.y };
      if (w.shakeFx) {
        const k = 1 - w.shakeFx.t / w.shakeFx.d;
        cam.x += (Math.random() - 0.5) * w.shakeFx.s * k;
        cam.y += (Math.random() - 0.5) * w.shakeFx.s * k;
      }
      r.cam = cam;
      const cols = r.colors(w);
      const pulse = GD.Audio.pulse();
      const t = this.time;
      r.drawBg(cols, cam);
      // attempt label floats in the world
      if (this.attemptX != null && this.attemptX < cam.x + r.VW + 400) {
        r.worldText('Attempt ' + this.attempt, this.attemptX + 210, (w.bnd.ceil != null ? (w.bnd.floor + w.bnd.ceil) / 2 : 130) + 25, 24, {});
      }
      r.drawWorldObjects(w, cols, t, pulse);
      this.drawEnd(cols);
      if (this.practice) {
        for (const cp of this.checkpoints) {
          const sp = r.sprite('cp', 24, (g) => {
            g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 0); g.lineTo(0, 9); g.lineTo(-7, 0); g.closePath();
            g.fillStyle = '#5dff5d'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#063'; g.stroke();
          });
          r.blit(sp, cp.x, cp.y, 0, 1, 1, 0.9);
        }
      }
      const ic = this.iconCols();
      if (this.trail.length > 1) {
        const pts = this.trail.concat(this.state === 'play' ? [[this.rx, this.ry]] : []);
        r.drawTrail(pts, ic.c1, p.mini ? 5 : 8, 0.95);
      }
      if (this.streak.length > 1) r.drawTrail(this.streak, 'rgba(255,255,255,0.5)', 6, 0.5);
      const p2 = w.p2;
      if (this.trail2.length > 1 && p2) {
        const pts = this.trail2.concat(this.state === 'play' ? [[this.rx, this.ry2]] : []);
        r.drawTrail(pts, ic.c2, p2.mini ? 5 : 8, 0.95);
      }
      if (this.state === 'play') {
        if (p2) {
          const ic2 = Object.assign({}, ic, { c1: ic.c2, c2: ic.c1 });
          r.drawPlayer({ x: this.rx, y: this.ry2, mode: p2.mode, mini: p2.mini, gr: p2.gr, rot: p2.rot, onGround: p2.onGround }, ic2, t, 1);
        }
        r.drawPlayer({ x: this.rx, y: this.ry, mode: p.mode, mini: p.mini, gr: p.gr, rot: p.rot, onGround: p.onGround }, ic, t, 1);
        if (this.practice && this.settings.hitboxes) this.drawHitbox();
      }
      r.drawFront(w, cols, t, pulse);
      r.drawGround(cols, cam, this.vis.floor, false, pulse);
      if (this.vis.ceil != null && this.vis.ceil < cam.y + r.VH + 40) r.drawGround(cols, cam, this.vis.ceil, true, pulse);
      r.drawParticles();
      if (this.state === 'complete') {
        const k = U.clamp(this.doneT / 0.5, 0, 1);
        const sc = U.ease.elastic(k);
        r.text(this.practice ? 'PRACTICE COMPLETE!' : 'LEVEL COMPLETE!', r.W / 2, r.H * 0.38, r.hs * 34 * sc, { gold: true });
      }
      if (this.newBest != null && this.time - this.newBestT < 1.2 && this.state === 'dead') {
        r.text(this.newBest + '%', r.W / 2, r.H * 0.42, r.hs * 34, { gold: true, alpha: 1 - (this.time - this.newBestT) / 1.4 });
        r.text('NEW BEST!', r.W / 2, r.H * 0.42 - r.hs * 30, r.hs * 18, { alpha: 1 - (this.time - this.newBestT) / 1.4 });
      }
      r.progressBar(w.progress(), this.settings.showBar, this.settings.showPct);
      if (this.settings.showFps) r.text(this.fps + ' FPS', 8 * r.dpr, r.H - 12 * r.dpr, 12 * r.dpr, { align: 'left' });
    }

    drawEnd(cols) {
      const r = this.r, w = this.world;
      const x = (w.endX - r.cam.x) * r.S;
      if (x > r.W + 40 || x < -200) return;
      const ctx = r.ctx;
      r.mirrorOn();
      const gr = ctx.createLinearGradient(x - 120 * r.S, 0, x, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - 120 * r.S, 0, 120 * r.S, r.H);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(x - 1.5 * r.S, 0, 3 * r.S, r.H);
      ctx.fillStyle = U.rgba(cols.bg, 0.6);
      ctx.fillRect(x + 1.5 * r.S, 0, r.W, r.H);
      r.mirrorOff();
    }

    drawHitbox() {
      const r = this.r, w = this.world, p = w.p, ctx = r.ctx;
      const hw = w.hw();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ff3030';
      ctx.strokeRect(r.sx(this.rx - hw), r.sy(this.ry + hw), hw * 2 * r.S, hw * 2 * r.S);
      ctx.strokeStyle = '#3080ff';
      const ih = hw * 0.3;
      ctx.strokeRect(r.sx(this.rx - ih), r.sy(this.ry + ih), ih * 2 * r.S, ih * 2 * r.S);
      const [a, b] = r.visibleRange(w.rlist, r.cam, 60);
      for (let i = a; i < b; i++) {
        const o = w.rlist[i];
        if (!o.lh) continue;
        ctx.strokeStyle = o.kind === 'hazard' ? '#ff3030' : o.kind === 'solid' ? '#3080ff' : '#30ff60';
        if (o.lh.k === 'r') ctx.strokeRect(r.sx(o.x0), r.sy(o.y1), (o.x1 - o.x0) * r.S, (o.y1 - o.y0) * r.S);
        else { ctx.beginPath(); ctx.arc(r.sx(o.cx), r.sy(o.cy), o.cr * r.S, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
  }

  GD.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
