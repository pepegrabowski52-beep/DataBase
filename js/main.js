/* App bootstrap: save data, input, main loop, scene switching. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const U = GD.U;
  const SAVE_KEY = 'gdweb.save.v1';
  const USER_KEY = 'gdweb.levels.v1';

  function defaultSave() {
    return {
      v: 1,
      settings: { music: 0.8, sfx: 0.8, showPct: true, showBar: true, autoCP: true, showFps: false, hitboxes: false, lowDetail: false },
      icons: { c1: '#7dff00', c2: '#00ffff', glow: false, sel: 'cube', cube: 0, ship: 0, ball: 0, ufo: 0, wave: 0, robot: 0, spider: 0, swing: 0 },
      levels: {},
      stats: { jumps: 0, attempts: 0, deaths: 0, completed: 0 },
      achievements: {},
    };
  }

  // ------------------------------------------------------------------ menu background
  class MenuBg {
    constructor(app) {
      this.app = app;
      this.world = new GD.World({ settings: { bg: '#287dff', g: '#0066ff' }, objects: [] }, {});
      this.world.endX = 1e9;
      this.t = 0;
      this.hue = 220;
      this.acc = 0;
      this.nextAct = 1;
      this.modeT = 0;
      this.modes = ['cube', 'cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing'];
      this.mi = 0;
    }
    update(dt) {
      dt = Math.min(dt, 0.1);
      this.t += dt;
      this.hue = (this.hue + dt * 6) % 360;
      const w = this.world, p = w.p;
      this.acc += dt;
      this.modeT += dt;
      if (this.modeT > 7) {
        this.modeT = 0;
        this.mi = (this.mi + 1) % this.modes.length;
        p.mode = this.modes[this.mi];
        p.gr = 1;
        p.rot = 0;
        if (GD.PH.CORRIDOR[p.mode]) { w.bnd.floor = 0; w.bnd.ceil = 220; } else { w.bnd.floor = 0; w.bnd.ceil = null; }
        this.app.renderer.ring(p.x, p.y, 10, 60, 0.4, '#fff', 3);
      }
      this.nextAct -= dt;
      if (this.nextAct <= 0) {
        const hold = !w.hold;
        w.setHold(hold);
        const fly = p.mode === 'ship' || p.mode === 'wave' || p.mode === 'swing' || p.mode === 'ufo';
        this.nextAct = hold ? (fly ? 0.12 + Math.random() * 0.35 : 0.08 + Math.random() * 0.25) : 0.2 + Math.random() * (fly ? 0.4 : 1.3);
      }
      while (this.acc >= GD.PH.DT) {
        this.acc -= GD.PH.DT;
        w.step();
        if (p.dead) { p.dead = false; p.y = 15; p.vy = 0; }
      }
      const r = this.app.renderer;
      r.cam.x = p.x - Math.min(r.VW * 0.3, 220);
      r.cam.y = r.groundCam();
      r.updateParticles(dt);
      if (p.onGround && (p.mode === 'cube' || p.mode === 'robot' || p.mode === 'ball' || p.mode === 'spider') && Math.random() < 0.5) {
        r.spawn(p.x - 12, p.y - 13 * p.gr, -80, 30 * p.gr, 0.3, 3, this.app.save.icons.c1);
      }
    }
    render() {
      const r = this.app.renderer, w = this.world;
      const bg = U.hsv(this.hue, 0.78, 0.95);
      const g = U.hsv(this.hue + 10, 0.9, 0.85);
      const cols = { bg, g, line: [255, 255, 255], obj: [255, 255, 255] };
      r.drawBg(cols, r.cam);
      if (this.app.scene === 'menu' || this.app.scene === 'loading') {
        const p = w.p;
        r.drawPlayer({ x: p.x, y: p.y, mode: p.mode, mini: false, gr: p.gr, rot: p.rot, onGround: p.onGround }, this.app.save.icons, this.t, 1);
      }
      r.drawGround(cols, r.cam, 0, false, GD.Audio.pulse());
      r.drawParticles();
      const ctx = r.ctx;
      const vg = ctx.createRadialGradient(r.W / 2, r.H / 2, r.H * 0.3, r.W / 2, r.H / 2, r.W * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, r.W, r.H);
    }
  }

  // ------------------------------------------------------------------ achievements
  const lvlDone = (save, id) => !!(save.levels[id] && save.levels[id].done);
  GD.ACHIEVEMENTS = [
    { id: 'first', name: 'Getting Started', desc: 'Complete your first level', test: (s) => s.stats.completed >= 1 },
    { id: 'easy', name: 'Easy Does It', desc: 'Complete both Easy levels', test: (s) => lvlDone(s, 'neon') && lvlDone(s, 'back') },
    { id: 'hard', name: 'Getting Harder', desc: 'Complete a Hard level', test: (s) => lvlDone(s, 'base') || lvlDone(s, 'rolling') },
    { id: 'insane', name: 'Insane!', desc: 'Complete an Insane level', test: (s) => lvlDone(s, 'cycle') || lvlDone(s, 'hyper') },
    { id: 'demon', name: 'Demon Slayer', desc: 'Complete Demon Gate', test: (s) => lvlDone(s, 'demon') },
    { id: 'stars10', name: 'Star Collector', desc: 'Collect 10 stars', test: (s, t) => t.stars >= 10 },
    { id: 'stars30', name: 'Star Hoarder', desc: 'Collect 30 stars', test: (s, t) => t.stars >= 30 },
    { id: 'starsAll', name: 'Superstar', desc: 'Collect every star', test: (s, t) => t.stars >= t.maxStars },
    { id: 'coins5', name: 'Coin Hunter', desc: 'Collect 5 secret coins', test: (s, t) => t.coins >= 5 },
    { id: 'coins15', name: 'Treasure Seeker', desc: 'Collect 15 secret coins', test: (s, t) => t.coins >= 15 },
    { id: 'coinsAll', name: 'Coin Master', desc: 'Collect every secret coin', test: (s, t) => t.coins >= t.maxCoins },
    { id: 'jumps500', name: 'Jumper', desc: 'Jump 500 times', test: (s) => s.stats.jumps >= 500 },
    { id: 'jumps5000', name: 'Kangaroo', desc: 'Jump 5000 times', test: (s) => s.stats.jumps >= 5000 },
    { id: 'att100', name: 'Persistent', desc: 'Make 100 attempts', test: (s) => s.stats.attempts >= 100 },
    { id: 'att1000', name: 'Never Give Up', desc: 'Make 1000 attempts', test: (s) => s.stats.attempts >= 1000 },
    { id: 'practice', name: 'Practice Makes Perfect', desc: 'Finish a level in practice mode', test: (s) => !!s.stats.practiceDone },
    { id: 'creator', name: 'Architect', desc: 'Create your own level', test: (s, t, app) => app.userLevels.length >= 1 },
    { id: 'verified', name: 'Verified', desc: 'Verify one of your levels', test: (s, t, app) => app.userLevels.some((l) => l.verified) },
  ];

  // ------------------------------------------------------------------ app
  const App = (GD.App = {
    scene: 'loading',
    input: { hold: false, keys: new Set(), pointers: new Set() },
    game: null,
    editor: null,

    init() {
      this.cv = document.getElementById('cv');
      this.renderer = new GD.Renderer(this.cv);
      this.loadSave();
      this.renderer.lowDetail = !!this.save.settings.lowDetail;
      this.menuBg = new MenuBg(this);
      this.bindInput();
      root.addEventListener('resize', () => this.onResize());
      root.addEventListener('gamepadconnected', () => { this.hasPad = true; GD.UI.toast('Controller connected'); });
      if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }
      root.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.scene === 'game' && this.game && this.game.state === 'play' && !this.game.paused && !this.game.opts.test) this.pause(true);
      });
      GD.UI.init(this);
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
      GD.UI.loading();
    },

    // ---------------------------------------------------------------- save
    loadSave() {
      const s = U.store.get(SAVE_KEY, null);
      const d = defaultSave();
      this.save = s && s.v === 1 ? s : d;
      for (const k of ['settings', 'icons', 'stats']) this.save[k] = Object.assign({}, d[k], this.save[k] || {});
      this.save.levels = this.save.levels || {};
      this.save.achievements = this.save.achievements || {};
      this.userLevels = U.store.get(USER_KEY, []) || [];
      GD.Audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    },
    persist() {
      U.store.set(SAVE_KEY, this.save);
      if (this.scene !== 'game' || !this.game || this.game.state !== 'play') this.checkAchievements();
    },
    checkAchievements() {
      const s = this.save;
      s.achievements = s.achievements || {};
      const t = this.totals();
      const fresh = [];
      for (const a of GD.ACHIEVEMENTS) {
        if (s.achievements[a.id]) continue;
        let ok = false;
        try { ok = a.test(s, t, this); } catch (e) { ok = false; }
        if (ok) { s.achievements[a.id] = Date.now(); fresh.push(a); }
      }
      if (fresh.length) {
        U.store.set(SAVE_KEY, s);
        fresh.forEach((a, i) => setTimeout(() => {
          GD.UI.toast('🏆 Achievement: ' + a.name);
          GD.Audio.sfx('unlock');
        }, 600 + i * 2400));
      }
    },
    persistUser() {
      if (!U.store.set(USER_KEY, this.userLevels)) GD.UI.toast('Could not save (storage full or blocked)');
      this.checkAchievements();
    },
    resetSave() {
      this.save = defaultSave();
      this.renderer.lowDetail = false;
      this.persist();
    },
    levelRecord(id) {
      if (!this.save.levels[id]) this.save.levels[id] = { best: 0, pbest: 0, att: 0, jumps: 0, done: false, coins: [false, false, false] };
      return this.save.levels[id];
    },
    totals() {
      let stars = 0, coins = 0, maxStars = 0, maxCoins = 0;
      for (const def of GD.LEVELS) {
        const r = this.save.levels[def.id];
        maxStars += def.stars;
        maxCoins += 3;
        if (r && r.done) stars += def.stars;
        if (r && r.coins) coins += r.coins.filter(Boolean).length;
      }
      return { stars, coins, maxStars, maxCoins };
    },

    // ---------------------------------------------------------------- input
    isGameInput() {
      if (this.scene === 'game' && this.game && !this.game.paused) return this.game;
      if (this.scene === 'editor' && this.editor && this.editor.test && !this.editor.test.paused) return this.editor.test;
      return null;
    },
    updateHold() {
      const hold = this.input.keys.size > 0 || this.input.pointers.size > 0;
      this.input.hold = hold;
      const g = this.isGameInput();
      if (g) { if (hold) g.press(); else g.release(); }
    },
    bindInput() {
      const JUMP = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter']);
      root.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
        if (GD.UI.dialogOpen()) {
          if (e.code === 'Escape') GD.UI.closeDialog();
          return;
        }
        const g = this.isGameInput();
        if (JUMP.has(e.code) && (g || (this.scene === 'game' && this.game))) {
          e.preventDefault();
          if (!e.repeat && g) { this.input.keys.add(e.code); this.updateHold(); }
          return;
        }
        if (this.scene === 'game' && this.game) {
          if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); this.pause(!this.game.paused); }
          else if (e.code === 'KeyR' && !e.repeat && !this.game.paused && this.game.state !== 'complete') this.game.restart();
          else if (e.code === 'KeyZ' && !e.repeat) this.game.placeCheckpoint();
          else if (e.code === 'KeyX' && !e.repeat) this.game.removeCheckpoint();
          return;
        }
        if (this.scene === 'editor' && this.editor) { this.editor.onKey(e); return; }
        if (e.code === 'Escape') GD.UI.back();
        else GD.UI.onKey(e);
      });
      root.addEventListener('keyup', (e) => {
        if (this.input.keys.delete(e.code)) this.updateHold();
        if (this.scene === 'editor' && this.editor) this.editor.onKeyUp(e);
      });
      root.addEventListener('blur', () => {
        this.input.keys.clear();
        this.input.pointers.clear();
        this.updateHold();
      });
      const cv = this.cv;
      cv.addEventListener('pointerdown', (e) => {
        if (this.scene === 'editor' && this.editor && !this.editor.test) { this.editor.onPointer('down', e); return; }
        if (!this.isGameInput()) return;
        e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        this.input.pointers.add(e.pointerId);
        this.updateHold();
      });
      const up = (e) => {
        if (this.scene === 'editor' && this.editor && !this.editor.test) { this.editor.onPointer('up', e); return; }
        if (this.input.pointers.delete(e.pointerId)) this.updateHold();
      };
      cv.addEventListener('pointerup', up);
      cv.addEventListener('pointercancel', up);
      cv.addEventListener('pointermove', (e) => {
        if (this.scene === 'editor' && this.editor && !this.editor.test) this.editor.onPointer('move', e);
      });
      cv.addEventListener('wheel', (e) => {
        if (this.scene === 'editor' && this.editor && !this.editor.test) { e.preventDefault(); this.editor.onWheel(e); }
      }, { passive: false });
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    onResize() {
      this.renderer.resize();
      if (this.game) this.game.snapCamera && this.game.state === 'play' && this.game.updateCamera(0);
      GD.UI.onResize();
    },

    /** Gamepad: face buttons / d-pad up = jump, start = pause, B/back = back in menus. */
    pollGamepad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let jump = false, start = false, back = false;
      for (const gp of pads) {
        if (!gp) continue;
        const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
        if (b(0) || b(2) || b(3) || b(12) || b(7) || b(6)) jump = true;
        if (b(9)) start = true;
        if (b(1) || b(8)) back = true;
      }
      const prev = this.padPrev || {};
      this.padPrev = { jump, start, back };
      const g = this.isGameInput();
      if (jump !== !!prev.jump) {
        if (jump) this.input.keys.add('pad'); else this.input.keys.delete('pad');
        if (g || !jump) this.updateHold();
        else if (jump && this.scene === 'levels') GD.UI.playPage();
      }
      if (start && !prev.start && this.scene === 'game' && this.game) this.pause(!this.game.paused);
      if (back && !prev.back && this.scene !== 'game' && this.scene !== 'editor') GD.UI.back();
    },

    // ---------------------------------------------------------------- loop
    loop(t) {
      const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      if (this.hasPad) this.pollGamepad();
      try {
        if (this.scene === 'game' && this.game) {
          this.game.update(dt);
          this.game.render();
        } else if (this.scene === 'editor' && this.editor) {
          this.editor.update(dt);
          this.editor.render();
        } else {
          this.menuBg.update(dt);
          this.menuBg.render();
        }
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame((tt) => this.loop(tt));
    },

    // ---------------------------------------------------------------- scenes
    menuMusic() {
      const A = GD.Audio;
      if (!A.cur || A.cur.id !== 'menu') A.play('menu', { fadeIn: 0.5 });
    },

    startLevel(info, opts) {
      opts = opts || {};
      GD.Audio.init();
      GD.Audio.sfx('play');
      this.input.pointers.clear();
      this.input.keys.clear();
      this.input.hold = false;
      this.returnTo = opts.returnTo || 'levels';
      this.game = new GD.Game(this, info, opts);
      this.scene = 'game';
      GD.UI.enterGame(this.game);
    },

    pause(on) {
      const g = this.game;
      if (!g || g.state === 'complete') return;
      g.paused = on;
      this.input.keys.clear();
      this.input.pointers.clear();
      this.input.hold = false;
      g.release();
      const A = GD.Audio;
      if (A.ctx) { if (on) A.ctx.suspend(); else A.ctx.resume(); }
      GD.UI.showPause(on, g);
    },

    exitGame() {
      const g = this.game;
      if (GD.Audio.ctx && GD.Audio.ctx.state === 'suspended') GD.Audio.ctx.resume();
      GD.Audio.stop(0.1);
      this.game = null;
      this.renderer.m = 1;
      this.scene = 'menu';
      GD.UI.exitGame(this.returnTo, g);
      this.menuMusic();
    },

    showComplete(game) {
      GD.UI.showComplete(game);
    },

    openEditor(levelRef) {
      GD.Audio.init();
      this.scene = 'editor';
      this.editor = new GD.Editor(this, levelRef);
      GD.UI.show('editor');
    },

    closeEditor() {
      if (this.editor) this.editor.destroy();
      this.editor = null;
      this.scene = 'menu';
      GD.UI.show('creator');
      this.menuMusic();
    },

    builtinInfo(def) {
      return { id: def.id, name: def.name, level: GD.buildLevel(def), builtin: true, stars: def.stars, def };
    },

    userInfo(ul) {
      return { id: ul.id, name: ul.name, level: { settings: ul.settings, objects: ul.objects }, user: true, stars: 0 };
    },
  });

  root.addEventListener('DOMContentLoaded', () => App.init());
})(window);
