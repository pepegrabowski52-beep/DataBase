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
      settings: { music: 0.8, sfx: 0.8, showPct: true, showBar: true, autoCP: true, showFps: false, hitboxes: false },
      icons: { c1: '#7dff00', c2: '#00ffff', glow: false, sel: 'cube', cube: 0, ship: 0, ball: 0, ufo: 0, wave: 0, robot: 0, spider: 0, swing: 0 },
      levels: {},
      stats: { jumps: 0, attempts: 0, deaths: 0, completed: 0 },
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
      this.menuBg = new MenuBg(this);
      this.bindInput();
      root.addEventListener('resize', () => this.onResize());
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
      this.userLevels = U.store.get(USER_KEY, []) || [];
      GD.Audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    },
    persist() {
      U.store.set(SAVE_KEY, this.save);
    },
    persistUser() {
      if (!U.store.set(USER_KEY, this.userLevels)) GD.UI.toast('Could not save (storage full or blocked)');
    },
    resetSave() {
      this.save = defaultSave();
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

    // ---------------------------------------------------------------- loop
    loop(t) {
      const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
      this.last = t;
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
