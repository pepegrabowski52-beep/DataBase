/* DOM user interface: menus, level select, icon kit, creator list, overlays and dialogs. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const U = GD.U;
  const $ = (id) => document.getElementById(id);

  const DIFF_NAMES = {
    auto: 'Auto', easy: 'Easy', normal: 'Normal', hard: 'Hard', harder: 'Harder', insane: 'Insane',
    demon: 'Demon', harddemon: 'Hard Demon', insanedemon: 'Insane Demon', extremedemon: 'Extreme Demon',
  };
  const TIPS = [
    'Tip: Hold the jump button to keep jumping when you land.',
    'Tip: Practice mode lets you place checkpoints with Z (remove with X).',
    'Tip: Yellow orbs only work when you click while touching them.',
    'Tip: Collect all 3 secret coins in a level to show off.',
    'Tip: Press R to restart instantly, Esc to pause.',
    'Tip: Build and share your own levels in the editor!',
    'Tip: The wave goes up while you hold and down when you release.',
    'Tip: Stars, secret coins and finished levels unlock new icons in the icon kit.',
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fxCanvas(kind, id, c1, c2, px) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.translate(px / 2, px / 2);
    g.scale(px / 44, px / 44);
    GD.FX.preview(g, kind, id, c1, c2);
    return c;
  }
  function iconCanvas(mode, id, c1, c2, px, glow) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    const s = px / (mode === 'ship' || mode === 'ufo' ? 52 : 38);
    g.translate(px / 2, px / 2 + (mode === 'ship' || mode === 'ufo' ? px * 0.08 : 0));
    g.scale(s, s);
    if (glow) { g.shadowColor = c2; g.shadowBlur = 6 * s; }
    GD.Icons.draw(g, mode, id, c1, c2, { phase: 1.2, cubeId: GD.App.save.icons.cube });
    return c;
  }

  // Gauntlets: themed sets of levels; finishing all of them unlocks a special icon
  GD.GAUNTLETS = [
    { id: 'speed', name: 'Speed Gauntlet', color: '#ff7a1a', levels: ['slope', 'base', 'hyper', 'velocity'] },
    { id: 'gravity', name: 'Gravity Gauntlet', color: '#2a9bff', levels: ['dry', 'rolling', 'cycle', 'clockwork'] },
    { id: 'twin', name: 'Twin Gauntlet', color: '#b46aff', levels: ['wave', 'twin', 'glass', 'hover'] },
    { id: 'demon', name: 'Demon Gauntlet', color: '#c41f3a', levels: ['demon', 'nightmare', 'overload', 'horizon'] },
  ];
  const gauntletDone = (app, gt) => gt.levels.every((id) => !GD.LEVELS.some((l) => l.id === id) || (app.save.levels[id] && app.save.levels[id].done));

  // Icon unlocks, like in GD: some need stars, some secret coins, some a specific level.
  const CUBE_REQ = [
    { stars: 4 }, { coins: 3 }, { stars: 10 }, { level: 'base' }, { stars: 16 }, { coins: 9 }, { stars: 24 }, { level: 'twin' },
    { stars: 32 }, { coins: 15 }, { stars: 42 }, { level: 'glass' }, { stars: 54 }, { coins: 24 }, { stars: 70 }, { level: 'demon' },
  ];
  const MODE_LEVEL = { ship: 'neon', ball: 'rolling', ufo: 'hover', wave: 'wave', robot: 'cycle', spider: 'cycle', swing: 'hyper' };
  const FX_REQ = {
    trail: [null, null, { stars: 15 }, { coins: 12 }, { ach: 'practice' }, { level: 'velocity' }],
    death: [null, { stars: 8 }, { coins: 6 }, { ach: 'att100' }, { stars: 45 }, { coins: 30 }],
  };
  function lockReq(mode, i) {
    if (FX_REQ[mode]) return FX_REQ[mode][i] || null;
    if (mode === 'cube' && i >= 8 + CUBE_REQ.length) {
      const gt = Object.keys(GD.GAUNTLET_CUBES).find((k) => GD.GAUNTLET_CUBES[k] === i);
      if (gt) return { gauntlet: gt };
      const code = Object.keys(GD.VAULT_CUBES).find((k) => GD.VAULT_CUBES[k] === i);
      return { vault: code || '?' };
    }
    if (mode === 'cube') return i < 8 ? null : CUBE_REQ[i - 8];
    if (i < 2) return null;
    if (i === 2) return { level: MODE_LEVEL[mode] };
    return i % 2 ? { coins: (i - 2) * 5 } : { stars: (i - 2) * 12 };
  }
  function reqMet(app, req) {
    if (!req) return true;
    const t = app.totals();
    if (req.stars) return t.stars >= req.stars;
    if (req.coins) return t.coins >= req.coins;
    if (req.ach) return !!(app.save.achievements && app.save.achievements[req.ach]);
    if (req.vault) return !!(app.save.vault && app.save.vault[req.vault]);
    if (req.gauntlet) return gauntletDone(app, GD.GAUNTLETS.find((g) => g.id === req.gauntlet));
    const r = app.save.levels[req.level];
    return !!(r && r.done);
  }
  function reqLabel(req) {
    if (req.stars) return `${req.stars}★`;
    if (req.coins) return `${req.coins}<span class="lock-coin"></span>`;
    if (req.ach) return '🏆';
    if (req.vault) return '🔑';
    if (req.gauntlet) return '⚔';
    return 'Lv ' + (GD.LEVELS.findIndex((l) => l.id === req.level) + 1);
  }
  function reqText(req) {
    if (req.stars) return `Collect ${req.stars} stars to unlock this icon`;
    if (req.coins) return `Collect ${req.coins} secret coins to unlock this icon`;
    if (req.vault) return 'Find the secret code for this icon in the Vault';
    if (req.gauntlet) return `Complete the ${GD.GAUNTLETS.find((g) => g.id === req.gauntlet).name} to unlock this icon`;
    if (req.ach) {
      const a = GD.ACHIEVEMENTS.find((x) => x.id === req.ach);
      return `Get the achievement "${a ? a.name : req.ach}" to unlock this`;
    }
    const d = GD.LEVELS.find((l) => l.id === req.level);
    return `Complete ${d ? d.name : req.level} to unlock this icon`;
  }

  const UI = (GD.UI = {
    cur: 'loading',
    page: 0,
    kitMode: 'cube',

    init(app) {
      this.app = app;
      // buttons should not keep keyboard focus (Space/Enter are game controls)
      document.addEventListener('click', (e) => {
        const b = e.target && e.target.closest && e.target.closest('button');
        if (b) b.blur();
      });
      document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { this.click('back'); this.show(b.dataset.back); }));
      $('b-play').addEventListener('click', () => { this.click(); this.show('levels'); });
      $('b-icons').addEventListener('click', () => { this.click(); this.show('icons'); });
      $('b-create').addEventListener('click', () => { this.click(); this.show('creator'); });
      $('b-settings').addEventListener('click', () => { this.click(); this.settings(); });
      $('b-stats').addEventListener('click', () => { this.click(); this.stats(); });
      $('b-vault').addEventListener('click', () => { this.click(); this.vault(); });
      $('lv-gauntlets').addEventListener('click', () => { this.click(); this.show('gauntlets'); });
      $('b-help').addEventListener('click', () => { this.click(); this.help(); });
      $('b-full').addEventListener('click', () => { this.click(); this.fullscreen(); });
      $('lv-prev').addEventListener('click', () => this.turn(-1));
      $('lv-next').addEventListener('click', () => this.turn(1));
      $('lv-card').addEventListener('click', () => this.playPage());
      // pause
      $('h-pause').addEventListener('click', (e) => { e.stopPropagation(); app.pause(true); });
      $('p-resume').addEventListener('click', () => app.pause(false));
      $('p-restart').addEventListener('click', () => { app.pause(false); app.game.restart(); });
      $('p-exit').addEventListener('click', () => { this.click('back'); this.showPause(false); app.exitGame(); });
      $('p-practice').addEventListener('click', () => {
        const g = app.game;
        if (!g || g.opts.test) return;
        app.pause(false);
        g.setPractice(!g.practice);
        this.updateHud(g);
      });
      $('h-cp').addEventListener('pointerdown', (e) => { e.stopPropagation(); app.game && app.game.placeCheckpoint(); });
      $('h-uncp').addEventListener('pointerdown', (e) => { e.stopPropagation(); app.game && app.game.removeCheckpoint(); });
      const vol = (id, key) => {
        const el = $(id);
        el.addEventListener('input', () => {
          app.save.settings[key] = el.value / 100;
          GD.Audio.setVolumes(app.save.settings.music, app.save.settings.sfx);
          app.persist();
        });
      };
      vol('p-music', 'music');
      vol('p-sfx', 'sfx');
      document.querySelectorAll('[data-set]').forEach((el) => {
        el.addEventListener('change', () => { app.save.settings[el.dataset.set] = el.checked; app.persist(); });
      });
      // complete
      $('c-replay').addEventListener('click', () => {
        $('o-complete').classList.add('hidden');
        const g = app.game;
        g.state = 'play';
        g.restart();
      });
      $('c-menu').addEventListener('click', () => { $('o-complete').classList.add('hidden'); app.exitGame(); });
      // creator
      $('cr-new').addEventListener('click', () => { this.click(); this.newLevel(); });
      $('cr-import').addEventListener('click', () => { this.click(); this.importLevel(); });
      // icon kit
      $('kit-glow').addEventListener('change', () => { app.save.icons.glow = $('kit-glow').checked; app.persist(); this.renderKit(); });
      $('o-dialog').addEventListener('pointerdown', (e) => { if (e.target === $('o-dialog') && this.dlgCancelable) this.closeDialog(); });
      this.page = U.store.get('gdweb.page', 0) || 0;
    },

    click(kind) {
      GD.Audio.sfx(kind === 'back' ? 'back' : 'click');
    },

    // -------------------------------------------------------------- loading
    loading() {
      $('tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
      const fill = $('loadfill');
      let p = 0;
      const steps = () => {
        p = Math.min(100, p + 18 + Math.random() * 25);
        fill.style.width = p + '%';
        if (p < 100) setTimeout(steps, 120);
        else {
          const go = () => {
            $('tapstart').classList.remove('hidden');
            const start = (e) => {
              if (e && e.type === 'keydown' && e.repeat) return;
              if (e) { e.preventDefault(); e.stopPropagation(); }
              root.removeEventListener('click', start, true);
              root.removeEventListener('keydown', start, true);
              GD.Audio.init();
              GD.Audio.setVolumes(this.app.save.settings.music, this.app.save.settings.sfx);
              // show the menu after this click has finished so it cannot fall through onto a button
              setTimeout(() => { this.show('menu'); this.app.menuMusic(); this.app.checkShared(); }, 30);
            };
            root.addEventListener('click', start, true);
            root.addEventListener('keydown', start, true);
          };
          if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
          else go();
        }
      };
      setTimeout(steps, 150);
    },

    // -------------------------------------------------------------- navigation
    show(name) {
      for (const s of ['loading', 'menu', 'levels', 'icons', 'creator', 'editor', 'gauntlets']) $('s-' + s).classList.toggle('hidden', s !== name);
      this.cur = name;
      if (name === 'menu') this.renderMenu();
      if (name === 'levels') this.renderLevels();
      if (name === 'icons') this.renderKit();
      if (name === 'creator') this.renderCreator();
      if (name === 'gauntlets') this.renderGauntlets();
      if (this.app.scene !== 'game' && this.app.scene !== 'editor') this.app.scene = name;
    },

    back() {
      if (this.dialogOpen()) { this.closeDialog(); return; }
      if (this.cur === 'gauntlets') { this.click('back'); this.show('levels'); }
      else if (this.cur === 'levels' || this.cur === 'icons' || this.cur === 'creator') { this.click('back'); this.show('menu'); }
    },

    onResize() {},

    fullscreen() {
      const d = document;
      try {
        if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen).call(d.documentElement);
        else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      } catch (e) { this.toast('Fullscreen not available'); }
    },

    // -------------------------------------------------------------- main menu
    renderMenu() {
      const ic = this.app.save.icons;
      const c = $('c-iconbtn');
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.save();
      g.translate(c.width / 2, c.height / 2);
      g.scale(c.width / 36, c.width / 36);
      GD.Icons.draw(g, 'cube', ic.cube, ic.c1, ic.c2);
      g.restore();
      const t = this.app.totals();
      $('menu-stars').innerHTML = `<span class="star">★</span> ${t.stars}/${t.maxStars} &nbsp; <span class="coin">●</span> ${t.coins}/${t.maxCoins}`;
    },

    // -------------------------------------------------------------- level select
    pages() {
      return this.app.levelList().length + 1;
    },

    turn(d) {
      this.click();
      const n = this.pages();
      this.page = (this.page + d + n) % n;
      U.store.set('gdweb.page', this.page);
      this.renderLevels(d);
    },

    renderLevels(dir) {
      const card = $('lv-card');
      const bars = $('lv-bars');
      const n = this.pages();
      if (this.page >= n) this.page = 0;
      card.style.animation = 'none';
      void card.offsetWidth;
      card.style.animation = dir ? `popin 0.25s cubic-bezier(.3,1.6,.5,1)` : '';
      const levels = this.app.levelList();
      if (this.page === levels.length) {
        card.className = 'lv-card special';
        card.style.background = 'linear-gradient(180deg, #8a5cff, #4a26c9)';
        card.innerHTML = `<div class="lv-name">Your Levels<div style="font-size:0.42em;margin-top:0.4em">Build & play custom levels</div></div>`;
        bars.innerHTML = '';
      } else {
        const def = levels[this.page];
        const rec = this.app.save.levels[def.id] || {};
        card.className = 'lv-card';
        card.style.background = `linear-gradient(180deg, ${def.color}, ${U.rgbToHex(U.shade(U.hexToRgb(def.color), -0.35))})`;
        const coins = [0, 1, 2].map((i) => `<div class="coin-ic ${rec.coins && rec.coins[i] ? '' : 'off'}"></div>`).join('');
        card.innerHTML = `
          ${rec.done ? '<div class="done-badge">✔ Completed</div>' : ''}
          <div><canvas class="face" width="160" height="160"></canvas><div class="lv-diff">${DIFF_NAMES[def.diff]}</div></div>
          <div class="lv-name">${esc(def.name)}</div>
          <div class="lv-meta"><div class="lv-stars">${def.stars} <b>★</b></div><div class="coins">${coins}</div></div>
          ${rec.att ? `<div class="lv-att">Attempts: ${rec.att}</div>` : ''}`;
        const fc = card.querySelector('canvas');
        GD.Icons.face(fc.getContext('2d'), def.diff, 160);
        bars.innerHTML = this.barHTML('Normal Mode', rec.best || 0, false) + this.barHTML('Practice Mode', rec.pbest || 0, true);
      }
      $('lv-dots').innerHTML = Array.from({ length: n }, (_, i) => `<span class="${i === this.page ? 'on' : ''}" data-i="${i}"></span>`).join('');
      $('lv-dots').querySelectorAll('span').forEach((s) => s.addEventListener('click', () => { this.page = +s.dataset.i; this.renderLevels(1); }));
    },

    renderGauntlets() {
      const app = this.app, ic = app.save.icons;
      const list = $('gt-list');
      list.innerHTML = '';
      for (const gt of GD.GAUNTLETS) {
        const done = gauntletDone(app, gt);
        const el = document.createElement('div');
        el.className = 'gt-panel' + (done ? ' done' : '');
        el.style.background = `linear-gradient(180deg, ${gt.color}, ${U.rgbToHex(U.shade(U.hexToRgb(gt.color), -0.45))})`;
        el.innerHTML = `<div class="gt-name">${esc(gt.name)}</div><div class="gt-levels"></div><div class="gt-reward"><span>${done ? 'Unlocked!' : 'Reward'}</span></div>`;
        const lv = el.querySelector('.gt-levels');
        for (const id of gt.levels) {
          const def = GD.LEVELS.find((l) => l.id === id);
          if (!def) continue;
          const rec = app.save.levels[id] || {};
          const b = document.createElement('button');
          b.className = 'gt-level' + (rec.done ? ' done' : '');
          b.title = def.name;
          const c = document.createElement('canvas');
          c.width = c.height = 96;
          GD.Icons.face(c.getContext('2d'), def.diff, 96);
          b.appendChild(c);
          const n = document.createElement('div');
          n.className = 'gt-lname';
          n.textContent = def.name;
          b.appendChild(n);
          if (rec.done) b.insertAdjacentHTML('beforeend', '<div class="gt-check">✔</div>');
          else if (rec.best) b.insertAdjacentHTML('beforeend', `<div class="gt-pct">${rec.best}%</div>`);
          b.addEventListener('click', () => {
            this.click();
            $('s-gauntlets').classList.add('hidden');
            app.startLevel(app.builtinInfo(def), { returnTo: 'gauntlets' });
          });
          lv.appendChild(b);
        }
        const rw = el.querySelector('.gt-reward');
        const cv = iconCanvas('cube', GD.GAUNTLET_CUBES[gt.id], ic.c1, ic.c2, 96, false);
        if (!done) cv.classList.add('locked');
        rw.appendChild(cv);
        list.appendChild(el);
      }
    },

    barHTML(label, pct, practice) {
      return `<div><div class="pbar-label">${label}</div><div class="pbar ${practice ? 'practice' : ''}"><div class="fill" style="width:${pct}%"></div><div class="pct">${pct}%</div></div></div>`;
    },

    playPage() {
      const levels = this.app.levelList();
      if (this.page === levels.length) { this.click(); this.show('creator'); return; }
      const def = levels[this.page];
      $('s-levels').classList.add('hidden');
      this.app.startLevel(this.app.builtinInfo(def), { returnTo: 'levels' });
    },

    onKey(e) {
      if (this.cur === 'levels' && !this.dialogOpen()) {
        if (e.code === 'ArrowLeft') this.turn(-1);
        else if (e.code === 'ArrowRight') this.turn(1);
        else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.playPage(); }
      }
    },

    // -------------------------------------------------------------- game hud & overlays
    enterGame(game) {
      for (const s of ['loading', 'menu', 'levels', 'icons', 'creator']) $('s-' + s).classList.add('hidden');
      $('hud').classList.remove('hidden');
      this.updateHud(game);
    },

    updateHud(game) {
      $('h-practice').classList.toggle('hidden', !game.practice);
      $('h-pause').classList.toggle('hidden', !!game.opts.test);
    },

    exitGame(returnTo, game) {
      $('hud').classList.add('hidden');
      $('o-pause').classList.add('hidden');
      $('o-complete').classList.add('hidden');
      this.show(returnTo || 'levels');
    },

    showPause(on, game) {
      $('o-pause').classList.toggle('hidden', !on);
      if (!on) return;
      const s = this.app.save.settings;
      $('p-title').textContent = game.info.name;
      const rec = this.app.save.levels[game.info.id] || {};
      $('p-bars').innerHTML = game.opts.test ? '' : this.barHTML('Normal Mode', rec.best || 0, false) + this.barHTML('Practice Mode', rec.pbest || 0, true);
      $('p-music').value = Math.round(s.music * 100);
      $('p-sfx').value = Math.round(s.sfx * 100);
      document.querySelectorAll('[data-set]').forEach((el) => (el.checked = !!s[el.dataset.set]));
      $('p-practice').classList.toggle('on', game.practice);
      $('p-practice').classList.toggle('hidden', !!game.opts.test);
    },

    showComplete(game) {
      if (game.opts.test) {
        if (this.app.editor) this.app.editor.stopTest(true);
        return;
      }
      const r = game.result || {};
      $('c-title').textContent = game.practice ? 'PRACTICE COMPLETE!' : 'LEVEL COMPLETE!';
      $('c-stats').innerHTML = `Attempts: ${game.attempt}<br>Jumps: ${(this.app.save.levels[game.info.id] || {}).jumps || 0}<br>Time: ${U.fmtTime(game.playTime)}`;
      let rew = '';
      if (r.stars) rew += `<span>+${r.stars} <span class="star">★</span></span>`;
      const coinsGot = r.coins ? r.coins.filter(Boolean).length : 0;
      if (coinsGot && !game.practice) rew += `<span>${'<span class="coin-ic" style="display:inline-block;vertical-align:middle"></span>'.repeat(coinsGot)}</span>`;
      if (r.newBest && !r.stars) rew += '<span>New Best!</span>';
      $('c-reward').innerHTML = rew;
      $('o-complete').classList.remove('hidden');
      if (r.stars) setTimeout(() => GD.Audio.sfx('star'), 350);
    },

    // -------------------------------------------------------------- icon kit
    renderKit() {
      const app = this.app, ic = app.save.icons;
      const modes = GD.MODES;
      const tabs = $('kit-tabs');
      tabs.innerHTML = '';
      const fxNames = { trail: GD.FX.trails, death: GD.FX.deaths };
      for (const m of modes.concat(['trail', 'death'])) {
        const b = document.createElement('button');
        b.className = 'kit-tab' + (m === this.kitMode ? ' on' : '') + (fxNames[m] ? ' fx' : '');
        b.title = fxNames[m] ? (m === 'trail' ? 'Trails' : 'Death effects') : m;
        b.appendChild(fxNames[m] ? fxCanvas(m, ic[m] || 0, ic.c1, ic.c2, 80) : iconCanvas(m, ic[m] || 0, ic.c1, ic.c2, 80, false));
        b.addEventListener('click', () => { this.click(); this.kitMode = m; this.renderKit(); });
        tabs.appendChild(b);
      }
      const grid = $('kit-grid');
      grid.innerHTML = '';
      const isFx = !!fxNames[this.kitMode];
      const n = isFx ? fxNames[this.kitMode].length : GD.Icons.count[this.kitMode];
      for (let i = 0; i < n; i++) {
        const req = lockReq(this.kitMode, i);
        const locked = !reqMet(app, req);
        const b = document.createElement('button');
        b.className = 'kit-item' + ((ic[this.kitMode] || 0) === i ? ' on' : '') + (locked ? ' locked' : '');
        b.appendChild(isFx ? fxCanvas(this.kitMode, i, ic.c1, ic.c2, 96) : iconCanvas(this.kitMode, i, ic.c1, ic.c2, 96, ic.glow));
        if (isFx) b.title = fxNames[this.kitMode][i];
        if (locked) {
          const l = document.createElement('div');
          l.className = 'lock';
          l.innerHTML = `🔒<br>${reqLabel(req)}`;
          b.appendChild(l);
        }
        b.addEventListener('click', () => {
          if (locked) { this.toast(reqText(req)); GD.Audio.sfx('back'); return; }
          this.click();
          ic[this.kitMode] = i;
          if (isFx) this.toast(`${this.kitMode === 'trail' ? 'Trail' : 'Death effect'}: ${fxNames[this.kitMode][i]}`);
          app.persist();
          this.renderKit();
        });
        grid.appendChild(b);
      }
      const sw = (el, key) => {
        el.innerHTML = '';
        for (const col of GD.PALETTE) {
          const s = document.createElement('div');
          s.className = 'sw' + (ic[key].toLowerCase() === col.toLowerCase() ? ' on' : '');
          s.style.background = col;
          s.addEventListener('click', () => { this.click(); ic[key] = col; app.persist(); this.renderKit(); });
          el.appendChild(s);
        }
      };
      sw($('kit-c1'), 'c1');
      sw($('kit-c2'), 'c2');
      $('kit-glow').checked = !!ic.glow;
      // preview row
      const pv = $('kit-preview');
      const g = pv.getContext('2d');
      g.clearRect(0, 0, pv.width, pv.height);
      const step = pv.width / modes.length;
      modes.forEach((m, i) => {
        g.save();
        g.translate(step * (i + 0.5), pv.height / 2 + 6);
        const sel = m === this.kitMode;
        const s = (sel ? 1.65 : 1.3) * (m === 'ship' || m === 'ufo' ? 0.85 : 1);
        g.scale(s, s);
        if (ic.glow) { g.shadowColor = ic.c2; g.shadowBlur = 8; }
        GD.Icons.draw(g, m, ic[m] || 0, ic.c1, ic.c2, { phase: performance.now() / 200, cubeId: ic.cube });
        g.restore();
      });
    },

    // -------------------------------------------------------------- creator
    renderCreator() {
      const list = $('cr-list');
      const levels = this.app.userLevels;
      if (!levels.length) {
        list.innerHTML = `<div class="cr-empty">No levels yet.<br>Press <b>+ New Level</b> to start building,<br>or import a level code from a friend.</div>`;
        return;
      }
      list.innerHTML = '';
      const sorted = levels.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
      for (const ul of sorted) {
        const rec = this.app.save.levels[ul.id] || {};
        const row = document.createElement('div');
        row.className = 'cr-item';
        row.innerHTML = `<div style="flex:1;min-width:0"><div class="cr-name">${esc(ul.name)}</div><div class="cr-info">${ul.objects.length} objects · best ${rec.best || 0}% · ${ul.verified ? '✔ verified' : 'not verified'}</div></div>`;
        const mk = (label, cls, fn) => {
          const b = document.createElement('button');
          b.className = 'gbtn small ' + cls;
          b.textContent = label;
          b.addEventListener('click', () => { this.click(); fn(); });
          row.appendChild(b);
          return b;
        };
        mk('Play', '', () => { $('s-creator').classList.add('hidden'); this.app.startLevel(this.app.userInfo(ul), { returnTo: 'creator' }); });
        mk('Edit', 'blue', () => this.app.openEditor(ul));
        mk('Share', 'pink', () => this.shareLevel(ul));
        mk('✖', 'red', () => this.confirm('Delete level', `Delete "<b>${esc(ul.name)}</b>"? This cannot be undone.`, () => {
          this.app.userLevels = this.app.userLevels.filter((x) => x !== ul);
          delete this.app.save.levels[ul.id];
          this.app.persistUser();
          this.app.persist();
          this.renderCreator();
        }));
        list.appendChild(row);
      }
    },

    newLevel() {
      const n = this.app.userLevels.length + 1;
      this.prompt('New Level', 'Level name', 'My Level ' + n, (name) => {
        const ul = {
          id: 'u_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
          name: (name || 'Unnamed').slice(0, 40),
          settings: Object.assign({}, GD.DEFAULT_SETTINGS),
          objects: [],
          created: Date.now(),
          updated: Date.now(),
          verified: false,
        };
        this.app.userLevels.push(ul);
        this.app.persistUser();
        this.app.openEditor(ul);
      });
    },

    copyText(text, what) {
      const ta = $('share-code');
      if (ta) { ta.value = text; ta.select(); }
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => this.toast(what + ' copied!'), () => this.toast(ok ? what + ' copied!' : 'Select the text and copy it'));
      else this.toast(ok ? what + ' copied!' : 'Select the text and copy it');
    },

    async shareLevel(ul) {
      const code = await GD.encodeLevelPacked(ul);
      const link = location.href.split('#')[0] + '#lvl=' + code;
      this.dialog('Share Level', `<p>Send the link to a friend – it opens the level right in the browser. Or copy the code; it can be pasted with <b>Import Code</b>.</p><textarea id="share-code" readonly>${esc(link)}</textarea>`, [
        { label: 'Copy Link', cls: '', fn: () => { this.copyText(link, 'Link'); return false; } },
        { label: 'Copy Code', cls: 'pink', fn: () => { this.copyText(code, 'Code'); return false; } },
        { label: 'Download', cls: 'blue', fn: () => {
          const blob = new Blob([JSON.stringify({ name: ul.name, settings: ul.settings, objects: ul.objects })], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = ul.name.replace(/[^\w-]+/g, '_') + '.gdlevel.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          return false;
        } },
        { label: 'Close', cls: 'gray' },
      ]);
    },

    /** Add a decoded level to "Your Levels" (or return the copy imported earlier from the same code). */
    addImported(lvl) {
      const src = U.hashStr(JSON.stringify([lvl.name || '', lvl.objects || []]));
      const old = this.app.userLevels.find((l) => l.src === src);
      if (old) return old;
      const ul = {
        id: 'u_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        name: (lvl.name || 'Imported').slice(0, 40), settings: Object.assign({}, GD.DEFAULT_SETTINGS, lvl.settings || {}),
        objects: lvl.objects || [], created: Date.now(), updated: Date.now(), verified: false,
      };
      ul.src = src;
      this.app.userLevels.push(ul);
      this.app.persistUser();
      return ul;
    },

    importLevel() {
      this.dialog('Import Level', `<p>Paste a level code, a level link or the content of a .gdlevel.json file:</p><textarea id="imp-code" placeholder="Level code..."></textarea>`, [
        { label: 'Import', cls: '', fn: () => {
          let txt = $('imp-code').value.trim();
          const m = txt.match(/#lvl=(.+)$/);
          if (m) txt = decodeURIComponent(m[1]);
          GD.decodeLevelAsync(txt).then((lvl) => {
            if (!lvl) { this.toast('Invalid level code'); return; }
            this.closeDialog();
            const ul = this.addImported(lvl);
            this.renderCreator();
            this.toast('Imported "' + ul.name + '"');
          });
          return false;
        } },
        { label: 'Cancel', cls: 'gray' },
      ]);
      setTimeout(() => $('imp-code') && $('imp-code').focus(), 50);
    },

    /** A level opened from a share link: play it or save it to "Your Levels". */
    sharedLevel(lvl) {
      const n = (lvl.objects || []).length;
      this.dialog('Shared Level', `<p>Someone shared a level with you:</p><p style="font-size:1.4em"><b>${esc(lvl.name || 'Unnamed')}</b></p><p>${n} objects</p>`, [
        { label: 'Play', cls: '', fn: () => {
          const ul = this.addImported(lvl);
          $('s-' + this.cur).classList.add('hidden');
          this.app.startLevel(this.app.userInfo(ul), { returnTo: 'creator' });
        } },
        { label: 'Save', cls: 'blue', fn: () => {
          const ul = this.addImported(lvl);
          this.toast('Saved "' + ul.name + '" to Your Levels');
          if (this.cur === 'creator') this.renderCreator();
        } },
        { label: 'Cancel', cls: 'gray' },
      ]);
    },

    // -------------------------------------------------------------- dialogs
    dialog(title, html, buttons, cancelable) {
      $('d-title').textContent = title;
      const body = $('d-body');
      if (typeof html === 'string') body.innerHTML = html;
      else { body.innerHTML = ''; body.appendChild(html); }
      const btns = $('d-btns');
      btns.innerHTML = '';
      for (const b of buttons || [{ label: 'OK' }]) {
        const el = document.createElement('button');
        el.className = 'gbtn ' + (b.cls || '');
        el.textContent = b.label;
        el.addEventListener('click', () => {
          this.click(b.cls === 'gray' ? 'back' : '');
          const r = b.fn ? b.fn() : undefined;
          if (r !== false) this.closeDialog();
        });
        btns.appendChild(el);
      }
      this.dlgCancelable = cancelable !== false;
      $('o-dialog').classList.remove('hidden');
    },
    dialogOpen() {
      return !$('o-dialog').classList.contains('hidden');
    },
    closeDialog() {
      $('o-dialog').classList.add('hidden');
      if (this.onDialogClose) { const f = this.onDialogClose; this.onDialogClose = null; f(); }
    },
    confirm(title, html, fn) {
      this.dialog(title, `<p>${html}</p>`, [{ label: 'Yes', cls: 'red', fn }, { label: 'No', cls: 'gray' }]);
    },
    prompt(title, label, def, fn) {
      this.dialog(title, `<p>${esc(label)}</p><input type="text" id="prompt-in" maxlength="40" value="${esc(def || '')}">`, [
        { label: 'OK', fn: () => fn($('prompt-in').value.trim()) },
        { label: 'Cancel', cls: 'gray' },
      ]);
      setTimeout(() => {
        const el = $('prompt-in');
        if (!el) return;
        el.focus();
        el.select();
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { fn(el.value.trim()); this.closeDialog(); } });
      }, 50);
    },
    toast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.remove('hidden');
      t.style.animation = 'none';
      void t.offsetWidth;
      t.style.animation = '';
      clearTimeout(this.toastT);
      this.toastT = setTimeout(() => t.classList.add('hidden'), 2200);
    },

    settings() {
      const s = this.app.save.settings;
      const chk = (key, label) => `<label class="check"><input type="checkbox" data-k="${key}" ${s[key] ? 'checked' : ''}><span></span>${label}</label>`;
      const html = `
        <div class="form-grid">
          <label>Music</label><input type="range" min="0" max="100" value="${Math.round(s.music * 100)}" id="st-music">
          <label>SFX</label><input type="range" min="0" max="100" value="${Math.round(s.sfx * 100)}" id="st-sfx">
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:14px 24px;margin-top:16px">
          ${chk('showPct', 'Show Percentage')}${chk('showBar', 'Progress Bar')}${chk('autoCP', 'Auto Checkpoints')}${chk('showFps', 'Show FPS')}${chk('hitboxes', 'Show Hitboxes in Practice')}${chk('fastReset', 'Fast Respawn')}${chk('lowDetail', 'Low Detail Mode')}
        </div>`;
      this.dialog('Settings', html, [
        { label: 'Reset Progress', cls: 'red', fn: () => {
          setTimeout(() => this.confirm('Reset Progress', 'Delete all stars, coins, records and stats? (Your custom levels are kept.)', () => {
            this.app.resetSave();
            GD.Audio.setVolumes(this.app.save.settings.music, this.app.save.settings.sfx);
            this.renderMenu();
            this.toast('Progress reset');
          }), 10);
        } },
        { label: 'OK' },
      ]);
      const body = $('d-body');
      body.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => {
        s[el.dataset.k] = el.checked;
        if (this.app.renderer.lowDetail !== !!s.lowDetail) {
          this.app.renderer.lowDetail = !!s.lowDetail;
          this.app.onResize();
        }
        this.app.persist();
      }));
      const vol = () => {
        s.music = $('st-music').value / 100;
        s.sfx = $('st-sfx').value / 100;
        GD.Audio.setVolumes(s.music, s.sfx);
        this.app.persist();
      };
      $('st-music').addEventListener('input', vol);
      $('st-sfx').addEventListener('input', vol);
    },

    /** The Vault: secret codes unlock hidden icons (and more). */
    vault() {
      const app = this.app;
      const need = 10;
      if (app.totals().stars < need) {
        this.dialog('The Vault', `<p class="vault-msg">🔒 The Vault is locked.</p><p>Come back when you have collected ${need} stars.</p>`, [{ label: 'OK' }], true);
        return;
      }
      app.save.vault = app.save.vault || {};
      const CODES = {
        lenny: { msg: '( ͡° ͜ʖ ͡°)  ...fine, take it.', unlock: 'lenny' },
        spooky: { msg: 'Boo! Something spooky crawls out of the dark...', unlock: 'spooky' },
        royal: { msg: 'Kneel. A crown fit for a cube.', unlock: 'royal' },
        glitch: { msg: 'Th-th-that w-wasn\'t s-supposed to h-happen...', unlock: 'glitch' },
      };
      for (const l of GD.LEVELS) {
        if (l.secret) CODES[l.secretCode || l.secret] = { msg: l.secretMsg || 'A secret level has appeared in the level list...', unlock: l.secret };
      }
      const HINTS = [
        'Speak the words and the Vault shall open...',
        'Someone keeps smirking at me. ( ͡° ͜ʖ ͡°)',
        'Something spooky lives down here.',
        'Only royalty may pass.',
        'I s-s-see a gl-gl-glitch...',
        'Nope.', 'Try again.', 'Are you even trying?', 'That is not it.', 'Wrong!',
      ];
      const found = () => Object.keys(CODES).filter((k) => app.save.vault[k]).length;
      let tries = 0;
      this.dialog('The Vault', `<p class="vault-msg" id="vault-msg">${HINTS[0]}</p>
        <input type="text" id="vault-in" maxlength="30" placeholder="Enter a code..." autocomplete="off" />
        <p class="vault-found" id="vault-found">Secrets found: ${found()} / ${Object.keys(CODES).length}</p>`, [
        { label: 'Enter', fn: () => {
          const inp = $('vault-in');
          const code = inp.value.trim().toLowerCase().replace(/\s+/g, ' ');
          const msg = $('vault-msg');
          const c = CODES[code];
          if (c) {
            if (app.save.vault[c.unlock]) msg.textContent = 'You already have that one.';
            else {
              app.save.vault[c.unlock] = true;
              msg.textContent = c.msg;
              GD.Audio.sfx('unlock');
              this.toast('New icon unlocked in the Icon Kit!');
              app.persist();
            }
          } else {
            tries++;
            msg.textContent = HINTS[(tries % (HINTS.length - 1)) + 1];
            GD.Audio.sfx('back');
          }
          $('vault-found').textContent = `Secrets found: ${found()} / ${Object.keys(CODES).length}`;
          inp.value = '';
          inp.focus();
          return false;
        } },
        { label: 'Close', cls: 'gray' },
      ], true);
      setTimeout(() => {
        const inp = $('vault-in');
        if (!inp) return;
        inp.focus();
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('d-btns').querySelector('button').click(); } });
      }, 50);
    },

    stats() {
      const st = this.app.save.stats, t = this.app.totals();
      const row = (k, v) => `<span>${k}</span><b>${v}</b>`;
      this.dialog('Stats', `<div class="stats-grid">
        ${row('Total Jumps', st.jumps)}${row('Total Attempts', st.attempts)}${row('Deaths', st.deaths)}
        ${row('Completed Levels', st.completed)}${row('Stars', t.stars + ' / ' + t.maxStars)}${row('Secret Coins', t.coins + ' / ' + t.maxCoins)}
        ${row('Created Levels', this.app.userLevels.length)}</div>`, [
        { label: 'Achievements', cls: 'blue', fn: () => { setTimeout(() => this.achievements(), 10); } },
        { label: 'OK' },
      ]);
    },

    achievements() {
      const got = this.app.save.achievements || {};
      const n = GD.ACHIEVEMENTS.filter((a) => got[a.id]).length;
      const rows = GD.ACHIEVEMENTS.map((a) => `<div class="ach ${got[a.id] ? 'on' : ''}"><span class="ach-ic">${got[a.id] ? '🏆' : '🔒'}</span><div><b>${a.name}</b><br><small>${a.desc}</small></div></div>`).join('');
      this.dialog(`Achievements ${n}/${GD.ACHIEVEMENTS.length}`, `<div class="ach-list">${rows}</div>`, [{ label: 'OK' }]);
    },

    help() {
      this.dialog('How to Play', `<div class="help-keys">
        <kbd>Space / ↑ / W / Click / Tap</kbd><span>Jump / fly / flip (hold to keep going)</span>
        <kbd>Esc / P</kbd><span>Pause</span>
        <kbd>R</kbd><span>Restart level</span>
        <kbd>Z / X</kbd><span>Place / remove checkpoint (practice mode)</span>
        <kbd>← / →</kbd><span>Browse levels</span>
        </div>
        <p style="margin-top:14px"><b>Cube</b> jumps · <b>Ship</b> flies while holding · <b>Ball</b> flips gravity · <b>UFO</b> jumps in mid-air ·
        <b>Wave</b> goes diagonally · <b>Robot</b> jumps higher the longer you hold · <b>Spider</b> teleports to the other side ·
        <b>Swing</b> flips gravity in mid-air.</p>
        <p><b>Dual portals</b> split you into two mirrored players controlled by the same button – both must survive.
        <b>Mirror portals</b> flip the screen.</p>
        <p>Orbs work when you click while touching them; pads launch you automatically. Collect the 3 secret coins in each level!</p>`, [{ label: 'OK' }]);
    },
  });
})(window);
