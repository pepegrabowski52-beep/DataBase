/* Level editor: build / edit / delete modes, object palette, selection, triggers, playtest. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const U = GD.U;
  const OBJ = GD.OBJ;

  // ---------------------------------------------------------------- share codes
  GD.encodeLevel = function (ul) {
    const objs = ul.objects.map((o) => {
      const c = Object.assign({}, o);
      for (const k of Object.keys(c)) if (c[k] === 0 && k !== 'x' && k !== 'y' && k !== 'a' && k !== 'dx' && k !== 'dy') delete c[k];
      return c;
    });
    return 'GDW1:' + U.b64enc(JSON.stringify({ name: ul.name, settings: ul.settings, objects: objs }));
  };
  GD.decodeLevel = function (txt) {
    try {
      txt = String(txt || '').trim();
      const json = txt.startsWith('GDW1:') ? U.b64dec(txt.slice(5).replace(/\s+/g, '')) : txt;
      const o = JSON.parse(json);
      if (!o || !Array.isArray(o.objects)) return null;
      o.objects = o.objects.filter((x) => x && OBJ[x.t] && isFinite(x.x) && isFinite(x.y));
      return o;
    } catch (e) {
      return null;
    }
  };

  const ZOOMS = [0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.6, 2];
  const SVG = {
    menu: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="3" rx="1"/><rect x="4" y="10.5" width="16" height="3" rx="1"/><rect x="4" y="16" width="16" height="3" rx="1"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 7V3L2 9l7 6v-4c5 0 8 1.5 10 6-0.5-6-4-10-10-10z"/></svg>',
    redo: '<svg viewBox="0 0 24 24"><path d="M15 7V3l7 6-7 6v-4c-5 0-8 1.5-10 6 0.5-6 4-10 10-10z"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.2h-4l-.4 2.7c-.6.3-1.2.6-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.7h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>',
    play: '<svg viewBox="0 0 24 24"><polygon points="7,4 20,12 7,20"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="4" rx="1"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="4" rx="1"/><rect x="10" y="4" width="4" height="16" rx="1"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M4 3h13l4 4v14H4zM7 4v5h9V4zM7 13v7h10v-7z"/></svg>',
  };

  function paletteIcon(key) {
    const d = OBJ[key];
    const c = document.createElement('canvas');
    c.width = c.height = 72;
    const g = c.getContext('2d');
    const size = GD.SPRITE_SIZE[d.art] ? GD.SPRITE_SIZE[d.art](d) : 36;
    const sc = (72 / Math.max(size, 34)) * (d.kind === 'portal' ? 1.15 : 0.92);
    g.translate(36, 36);
    g.scale(sc, sc);
    try { GD.ART[d.art](g, [255, 255, 255], d); } catch (e) { /* ignore */ }
    return c;
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  class Editor {
    constructor(app, ul) {
      this.app = app;
      this.r = app.renderer;
      this.ul = ul;
      this.objs = ul.objects.map((o) => Object.assign({}, o));
      this.settings = Object.assign({}, GD.DEFAULT_SETTINGS, ul.settings || {});
      this.mode = 'build';
      this.cat = 'block';
      this.tool = 'block';
      this.buildRot = 0;
      this.sel = new Set();
      this.zi = 4;
      this.cam = { x: -90, y: -100 };
      this.undoStack = [];
      this.redoStack = [];
      this.dirty = false;
      this.swipe = false;
      this.panMode = false;
      this.pointers = new Map();
      this.keys = new Set();
      this.path = null;
      this.time = 0;
      this.root = document.getElementById('s-editor');
      this.buildUI();
      this.applyZoom();
      if (this.objs.length) this.cam.x = Math.max(-90, Math.min(...this.objs.map((o) => o.x)) - 120);
    }

    destroy() {
      this.root.innerHTML = '';
      this.r.setZoom(1);
    }

    // ------------------------------------------------------------- UI
    buildUI() {
      const R = this.root;
      R.innerHTML = '';
      const top = el('div', 'ed-top');
      const left = el('div');
      const right = el('div');
      const btn = (parent, html, title, fn, cls) => {
        const b = el('button', 'ebtn ' + (cls || ''), html);
        b.title = title;
        b.addEventListener('click', (e) => { e.stopPropagation(); GD.Audio.sfx('click'); fn(); });
        parent.appendChild(b);
        return b;
      };
      btn(left, SVG.menu, 'Menu (save / exit)', () => this.exitMenu(), 'pink');
      this.bUndo = btn(left, SVG.undo, 'Undo (Ctrl+Z)', () => this.undo());
      this.bRedo = btn(left, SVG.redo, 'Redo (Ctrl+Y)', () => this.redo());
      btn(left, SVG.gear + ' Level', 'Level settings', () => this.levelSettings());
      btn(right, SVG.minus, 'Zoom out (-)', () => this.zoom(-1));
      btn(right, SVG.plus, 'Zoom in (+)', () => this.zoom(1));
      btn(right, SVG.save, 'Save (Ctrl+S)', () => this.save());
      btn(right, SVG.play + ' Test', 'Playtest (Enter)', () => this.startTest(), 'green');
      top.appendChild(left);
      top.appendChild(right);
      R.appendChild(top);
      this.topEl = top;
      this.info = el('div', 'ed-info');
      R.appendChild(this.info);

      const bottom = el('div', 'ed-bottom');
      const modes = el('div', 'ed-modes');
      this.modeBtns = {};
      for (const [m, label] of [['build', 'Build'], ['edit', 'Edit'], ['delete', 'Delete']]) {
        this.modeBtns[m] = btn(modes, label, label + ' mode (' + (m === 'build' ? 1 : m === 'edit' ? 2 : 3) + ')', () => this.setMode(m), m === 'delete' ? 'red' : '');
      }
      bottom.appendChild(modes);
      const main = el('div', 'ed-main');
      this.catsEl = el('div', 'ed-cats');
      this.palEl = el('div', 'ed-pal');
      this.editEl = el('div', 'ed-edit');
      main.appendChild(this.catsEl);
      main.appendChild(this.palEl);
      main.appendChild(this.editEl);
      bottom.appendChild(main);
      const side = el('div', 'ed-side');
      this.bSwipe = btn(side, 'Swipe', 'Swipe: drag to place / delete continuously', () => { this.swipe = !this.swipe; this.refreshSide(); });
      this.bPan = btn(side, 'Pan', 'Pan mode: drag to move the camera (or use right mouse / Space+drag)', () => { this.panMode = !this.panMode; this.refreshSide(); });
      this.bRot = btn(side, '⟳ 0°', 'Build rotation (Q / E)', () => { this.buildRot = (this.buildRot + 90) % 360; this.refreshSide(); });
      bottom.appendChild(side);
      R.appendChild(bottom);
      this.bottomEl = bottom;

      // categories
      for (const c of GD.CATS) {
        const b = el('button', 'ed-cat', c.name);
        b.addEventListener('click', () => {
          this.cat = c.id;
          if (OBJ[this.tool].cat !== c.id) this.tool = GD.OBJ_ORDER.find((k) => OBJ[k].cat === c.id) || this.tool;
          this.refreshPalette();
        });
        b.dataset.cat = c.id;
        this.catsEl.appendChild(b);
      }
      // edit tools
      const tools = [
        ['←', 'Move left (←)', () => this.moveSel(-1, 0)],
        ['→', 'Move right (→)', () => this.moveSel(1, 0)],
        ['↑', 'Move up (↑)', () => this.moveSel(0, 1)],
        ['↓', 'Move down (↓)', () => this.moveSel(0, -1)],
        ['⟲', 'Rotate left (Q)', () => this.rotateSel(-90)],
        ['⟳', 'Rotate right (E)', () => this.rotateSel(90)],
        ['Flip X', 'Flip horizontally', () => this.flipSel('fx')],
        ['Flip Y', 'Flip vertically', () => this.flipSel('fy')],
        ['Copy', 'Copy (Ctrl+C)', () => this.copy()],
        ['Paste', 'Paste (Ctrl+V)', () => this.paste()],
        ['Duplicate', 'Duplicate (Ctrl+D)', () => this.duplicate()],
        ['Edit Object', 'Edit group / color / trigger settings', () => this.editProps()],
        ['Select All', 'Select all (Ctrl+A)', () => { this.sel = new Set(this.objs); this.refreshInfo(); }],
        ['Deselect', 'Deselect (Esc)', () => { this.sel.clear(); this.refreshInfo(); }],
        ['Delete', 'Delete selection (Del)', () => this.deleteSel()],
      ];
      for (const [label, title, fn] of tools) btn(this.editEl, label, title, fn, label === 'Delete' ? 'red' : '');

      this.stopBtn = el('button', 'ebtn red ed-test-stop', SVG.stop + ' Stop');
      this.stopBtn.title = 'Stop playtest (Esc)';
      this.stopBtn.addEventListener('click', (e) => { e.stopPropagation(); this.stopTest(false); });
      this.stopBtn.classList.add('hidden');
      R.appendChild(this.stopBtn);

      this.setMode('build');
      this.refreshSide();
    }

    refreshSide() {
      this.bSwipe.classList.toggle('on', this.swipe);
      this.bPan.classList.toggle('on', this.panMode);
      this.bRot.textContent = '⟳ ' + this.buildRot + '°';
      this.bUndo.disabled = !this.undoStack.length;
      this.bRedo.disabled = !this.redoStack.length;
    }

    setMode(m) {
      this.mode = m;
      for (const k in this.modeBtns) this.modeBtns[k].classList.toggle('on', k === m);
      this.catsEl.classList.toggle('hidden', m !== 'build');
      this.palEl.classList.toggle('hidden', m !== 'build');
      this.editEl.classList.toggle('hidden', m !== 'edit');
      if (m === 'build') this.refreshPalette();
      if (m === 'delete') this.sel.clear();
      this.refreshInfo();
    }

    refreshPalette() {
      for (const b of this.catsEl.children) b.classList.toggle('on', b.dataset.cat === this.cat);
      this.palEl.innerHTML = '';
      for (const key of GD.OBJ_ORDER) {
        const d = OBJ[key];
        if (d.cat !== this.cat) continue;
        const b = el('button', 'ed-obj' + (key === this.tool ? ' on' : ''));
        b.title = d.name;
        b.appendChild(paletteIcon(key));
        b.addEventListener('click', () => {
          this.tool = key;
          for (const x of this.palEl.children) x.classList.remove('on');
          b.classList.add('on');
        });
        this.palEl.appendChild(b);
      }
    }

    refreshInfo() {
      const n = this.objs.length;
      const s = this.sel.size;
      const x = Math.max(0, Math.round((this.cam.x + this.r.VW / 2) / 30));
      this.info.textContent = `${this.ul.name} · ${n} objects${s ? ' · ' + s + ' selected' : ''} · x ${x}${this.ul.verified ? ' · ✔ verified' : ''}`;
      this.refreshSide();
    }

    // ------------------------------------------------------------- camera
    applyZoom() {
      const cx = this.cam.x + this.r.VW / 2, cy = this.cam.y + this.r.VH / 2;
      this.r.setZoom(ZOOMS[this.zi]);
      this.cam.x = cx - this.r.VW / 2;
      this.cam.y = cy - this.r.VH / 2;
      this.clampCam();
    }
    zoom(d) {
      this.zi = U.clamp(this.zi + d, 0, ZOOMS.length - 1);
      this.applyZoom();
    }
    clampCam() {
      this.cam.x = Math.max(-300, this.cam.x);
      this.cam.y = U.clamp(this.cam.y, -this.r.VH * 0.6, 3000);
    }

    // ------------------------------------------------------------- undo
    pushUndo() {
      this.undoStack.push(JSON.stringify(this.objs));
      if (this.undoStack.length > 120) this.undoStack.shift();
      this.redoStack.length = 0;
      this.dirty = true;
      this.modSinceVerify = true;
      this.refreshSide();
    }
    undo() {
      if (!this.undoStack.length) return;
      this.redoStack.push(JSON.stringify(this.objs));
      this.objs = JSON.parse(this.undoStack.pop());
      this.sel.clear();
      this.dirty = true;
      this.refreshInfo();
    }
    redo() {
      if (!this.redoStack.length) return;
      this.undoStack.push(JSON.stringify(this.objs));
      this.objs = JSON.parse(this.redoStack.pop());
      this.sel.clear();
      this.dirty = true;
      this.refreshInfo();
    }

    // ------------------------------------------------------------- object ops
    toWorld(e) {
      const r = this.r, rect = r.cv.getBoundingClientRect();
      const px = (e.clientX - rect.left) * r.dpr, py = (e.clientY - rect.top) * r.dpr;
      return { px, py, wx: this.cam.x + px / r.S, wy: this.cam.y + (r.H - py) / r.S };
    }

    place(wx, wy) {
      const gx = Math.floor(wx / 30), gy = Math.floor(wy / 30);
      if (gy < 0 || gy > 300) return false;
      const x = gx * 30 + 15, y = gy * 30 + 15;
      if (this.objs.some((o) => o.t === this.tool && o.x === x && o.y === y && (o.r || 0) === this.buildRot)) return false;
      const d = OBJ[this.tool];
      const o = { t: this.tool, x, y };
      if (d.slope) {
        const i = (this.buildRot / 90) | 0;
        if (i === 1 || i === 2) o.fx = true;
        if (i === 2 || i === 3) o.fy = true;
        if (d.slope.w > 30) o.x += 15;
      } else if (this.buildRot) o.r = this.buildRot;
      if (d.props) Object.assign(o, JSON.parse(JSON.stringify(d.props)));
      this.objs.push(o);
      this.sel = new Set([o]);
      this.dirty = true;
      this.modSinceVerify = true;
      return true;
    }

    pick(wx, wy) {
      for (let i = this.objs.length - 1; i >= 0; i--) {
        const o = this.objs[i];
        const d = OBJ[o.t];
        const hb = d.kind === 'portal' ? { w: 30, h: 90 } : d.art === 'saw' ? { w: d.sr * 2, h: d.sr * 2 } : d.slope ? { w: d.slope.w, h: 30 } : { w: 30, h: 30 };
        const rot = (o.r || 0) % 180 !== 0;
        const w = (rot ? hb.h : hb.w) / 2, h = (rot ? hb.w : hb.h) / 2;
        if (Math.abs(wx - o.x) <= w && Math.abs(wy - o.y) <= h) return o;
      }
      return null;
    }

    deleteAt(wx, wy) {
      const o = this.pick(wx, wy);
      if (!o) return false;
      this.objs.splice(this.objs.indexOf(o), 1);
      this.sel.delete(o);
      this.dirty = true;
      this.modSinceVerify = true;
      return true;
    }

    deleteSel() {
      if (!this.sel.size) return;
      this.pushUndo();
      this.objs = this.objs.filter((o) => !this.sel.has(o));
      this.sel.clear();
      this.refreshInfo();
    }

    moveSel(dx, dy, noUndo) {
      if (!this.sel.size) return;
      let minY = Infinity;
      for (const o of this.sel) minY = Math.min(minY, o.y);
      if (minY + dy * 30 < 15) dy = Math.round((15 - minY) / 30);
      if (!dx && !dy) return;
      if (!noUndo) this.pushUndo();
      for (const o of this.sel) { o.x += dx * 30; o.y += dy * 30; }
      this.dirty = true;
    }

    rotateSel(a) {
      if (this.mode === 'build' && !this.sel.size) { this.buildRot = (this.buildRot + a + 360) % 360; this.refreshSide(); return; }
      if (!this.sel.size) return;
      this.pushUndo();
      if (this.sel.size > 1) {
        // rotate the whole group around its centre (snapped)
        let sx = 0, sy = 0;
        for (const o of this.sel) { sx += o.x; sy += o.y; }
        const cx = Math.round(sx / this.sel.size / 30) * 30 + 15, cy = Math.round(sy / this.sel.size / 30) * 30 + 15;
        for (const o of this.sel) {
          const dx = o.x - cx, dy = o.y - cy;
          if (a > 0) { o.x = cx + dy; o.y = cy - dx; } else { o.x = cx - dy; o.y = cy + dx; }
          o.y = Math.max(15, o.y);
        }
      }
      for (const o of this.sel) {
        if (OBJ[o.t].slope) {
          // slopes cycle through their four orientations instead of rotating
          const states = [[false, false], [true, false], [true, true], [false, true]];
          let i = states.findIndex(([fx, fy]) => !!o.fx === fx && !!o.fy === fy);
          i = (i + (a > 0 ? 1 : 3)) % 4;
          o.fx = states[i][0];
          o.fy = states[i][1];
          delete o.r;
          continue;
        }
        o.r = (((o.r || 0) + a) % 360 + 360) % 360;
      }
    }

    flipSel(k) {
      if (!this.sel.size) return;
      this.pushUndo();
      for (const o of this.sel) o[k] = !o[k];
    }

    copy() {
      if (!this.sel.size) return;
      this.app.edClip = [...this.sel].map((o) => Object.assign({}, o));
      GD.UI.toast('Copied ' + this.sel.size + ' object(s)');
    }

    paste() {
      const clip = this.app.edClip;
      if (!clip || !clip.length) return;
      this.pushUndo();
      const minX = Math.min(...clip.map((o) => o.x));
      const minY = Math.min(...clip.map((o) => o.y));
      const tx = Math.floor((this.cam.x + this.r.VW / 2) / 30) * 30 + 15;
      const ty = Math.max(15, minY);
      const added = clip.map((o) => Object.assign({}, o, { x: o.x - minX + tx, y: o.y - minY + ty }));
      this.objs.push(...added);
      this.sel = new Set(added);
      this.setMode('edit');
    }

    duplicate() {
      if (!this.sel.size) return;
      this.pushUndo();
      const list = [...this.sel];
      const minX = Math.min(...list.map((o) => o.x)), maxX = Math.max(...list.map((o) => o.x));
      const off = maxX - minX + 30;
      const added = list.map((o) => Object.assign({}, o, { x: o.x + off }));
      this.objs.push(...added);
      this.sel = new Set(added);
    }

    // ------------------------------------------------------------- dialogs
    editProps() {
      if (!this.sel.size) { GD.UI.toast('Select objects first (Edit mode)'); return; }
      const list = [...this.sel];
      const first = list[0];
      const d = OBJ[first.t];
      const single = list.length === 1;
      const chOpts = (cur) => GD.CHANNELS.map((c) => `<option value="${c}" ${c === cur ? 'selected' : ''}>${GD.CHANNEL_NAMES[c]}</option>`).join('');
      let html = '<div class="form-grid">';
      html += `<label>Group ID</label><input type="number" id="ep-g" min="0" max="999" value="${first.g || 0}">`;
      if (d.col !== 'none' || first.c) html += `<label>Color channel</label><select id="ep-c">${chOpts(first.c || d.col)}</select>`;
      html += `<label>Front layer</label><input type="checkbox" id="ep-z" ${first.z > 0 ? 'checked' : ''} style="width:24px;height:24px">`;
      const tr = single && d.kind === 'trigger' ? first.t : null;
      const num = (id, label, v, step) => `<label>${label}</label><input type="number" id="${id}" step="${step || 0.1}" value="${v}">`;
      if (tr === 'tColor' || tr === 'tPulse') {
        html += `<label>Target channel</label><select id="ep-ch">${chOpts(first.ch)}</select>`;
        html += `<label>Color</label><input type="color" id="ep-col" value="${first.col}">`;
      }
      if (tr === 'tColor') html += num('ep-d', 'Fade time (s)', first.d);
      if (tr === 'tPulse') html += num('ep-fi', 'Fade in (s)', first.fi, 0.05) + num('ep-h', 'Hold (s)', first.h, 0.05) + num('ep-fo', 'Fade out (s)', first.fo, 0.05);
      if (tr === 'tMove' || tr === 'tAlpha' || tr === 'tToggle') html += num('ep-grp', 'Target group', first.grp, 1);
      if (tr === 'tMove') {
        html += num('ep-dx', 'Move X (blocks)', first.dx, 0.5) + num('ep-dy', 'Move Y (blocks)', first.dy, 0.5) + num('ep-d', 'Time (s)', first.d);
        html += `<label>Easing</label><select id="ep-e">${['linear', 'inOut', 'in', 'out', 'elastic', 'bounce'].map((e) => `<option ${e === first.e ? 'selected' : ''}>${e}</option>`).join('')}</select>`;
      }
      if (tr === 'tAlpha') html += num('ep-a', 'Opacity (0-1)', first.a) + num('ep-d', 'Time (s)', first.d);
      if (tr === 'tToggle') html += `<label>Turn group</label><select id="ep-on"><option value="1" ${first.on ? 'selected' : ''}>On</option><option value="0" ${!first.on ? 'selected' : ''}>Off</option></select>`;
      if (tr === 'tShake') html += num('ep-s', 'Strength', first.s, 1) + num('ep-d', 'Time (s)', first.d);
      if (single && first.t === 'startPos') {
        html += `<label>Game mode</label><select id="ep-mode">${GD.MODES.map((m) => `<option ${m === first.mode ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
        html += `<label>Speed</label><select id="ep-spd">${['0.5x', '1x', '2x', '3x', '4x'].map((m, i) => `<option value="${i}" ${i === +first.spd ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
        html += `<label>Mini</label><input type="checkbox" id="ep-mini" ${first.mini ? 'checked' : ''} style="width:24px;height:24px">`;
        html += `<label>Upside down</label><input type="checkbox" id="ep-flip" ${first.flip ? 'checked' : ''} style="width:24px;height:24px">`;
      }
      html += '</div>';
      if (!single) html += `<p>Editing ${list.length} objects (group / color / layer apply to all).</p>`;
      if (tr === 'tMove' || tr === 'tAlpha' || tr === 'tToggle') html += '<p>Give the objects you want to control the same Group ID.</p>';
      const $ = (id) => document.getElementById(id);
      GD.UI.dialog(single ? d.name : 'Edit Objects', html, [
        { label: 'Apply', fn: () => {
          this.pushUndo();
          const g = parseInt($('ep-g').value, 10) || 0;
          for (const o of list) {
            if (g) o.g = g; else delete o.g;
            if ($('ep-c')) { const c = $('ep-c').value; if (c !== OBJ[o.t].col) o.c = c; else delete o.c; }
            if ($('ep-z').checked) o.z = 1; else delete o.z;
          }
          const v = (id) => parseFloat($(id).value) || 0;
          if (tr) {
            if ($('ep-ch')) first.ch = $('ep-ch').value;
            if ($('ep-col')) first.col = $('ep-col').value;
            if ($('ep-d')) first.d = Math.max(0, v('ep-d'));
            if ($('ep-fi')) { first.fi = v('ep-fi'); first.h = v('ep-h'); first.fo = v('ep-fo'); }
            if ($('ep-grp')) first.grp = Math.max(1, Math.round(v('ep-grp')));
            if ($('ep-dx')) { first.dx = v('ep-dx'); first.dy = v('ep-dy'); first.e = $('ep-e').value; }
            if ($('ep-a')) first.a = U.clamp(v('ep-a'), 0, 1);
            if ($('ep-on')) first.on = $('ep-on').value === '1';
            if ($('ep-s')) first.s = v('ep-s');
          }
          if (single && first.t === 'startPos') {
            first.mode = $('ep-mode').value;
            first.spd = +$('ep-spd').value;
            first.mini = $('ep-mini').checked;
            first.flip = $('ep-flip').checked;
          }
        } },
        { label: 'Cancel', cls: 'gray' },
      ]);
    }

    levelSettings() {
      const s = this.settings;
      const cols = GD.CHANNELS.map((c) => `<label>${GD.CHANNEL_NAMES[c]}</label><input type="color" id="ls-${c}" value="${s[c]}">`).join('');
      const songs = GD.SONG_LIST.map((id) => `<option value="${id}" ${id === s.song ? 'selected' : ''}>${GD.SONGS[id].name}</option>`).join('');
      const html = `<div class="form-grid">
        <label>Name</label><input type="text" id="ls-name" maxlength="40" value="${String(this.ul.name).replace(/"/g, '&quot;')}">
        <label>Song</label><div style="display:flex;gap:8px"><select id="ls-song">${songs}</select><button class="gbtn small blue" id="ls-prev" type="button">▶</button></div>
        <label>Background</label><select id="ls-bg">${GD.BG_STYLES.map((b) => `<option ${b === (s.bgStyle || 'squares') ? 'selected' : ''}>${b}</option>`).join('')}</select>
        <label>Ground</label><select id="ls-gs">${GD.G_STYLES.map((b) => `<option ${b === (s.gStyle || 'squares') ? 'selected' : ''}>${b}</option>`).join('')}</select>
        <label>Start mode</label><select id="ls-mode">${GD.MODES.map((m) => `<option ${m === s.mode ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <label>Start speed</label><select id="ls-spd">${['0.5x', '1x', '2x', '3x', '4x'].map((m, i) => `<option value="${i}" ${i === +s.spd ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <label>Mini</label><input type="checkbox" id="ls-mini" ${s.mini ? 'checked' : ''} style="width:24px;height:24px">
        <label>Upside down</label><input type="checkbox" id="ls-flip" ${s.flip ? 'checked' : ''} style="width:24px;height:24px">
        ${cols}
      </div>`;
      const $ = (id) => document.getElementById(id);
      GD.UI.onDialogClose = () => { if (this.previewing) { GD.Audio.stop(0.2); this.previewing = false; } };
      GD.UI.dialog('Level Settings', html, [
        { label: 'Apply', fn: () => {
          this.ul.name = ($('ls-name').value.trim() || this.ul.name).slice(0, 40);
          s.song = $('ls-song').value;
          s.bgStyle = $('ls-bg').value;
          s.gStyle = $('ls-gs').value;
          s.mode = $('ls-mode').value;
          s.spd = +$('ls-spd').value;
          s.mini = $('ls-mini').checked;
          s.flip = $('ls-flip').checked;
          for (const c of GD.CHANNELS) s[c] = $('ls-' + c).value;
          this.dirty = true;
          this.modSinceVerify = true;
          this.refreshInfo();
        } },
        { label: 'Cancel', cls: 'gray' },
      ]);
      $('ls-prev').addEventListener('click', () => {
        if (this.previewing) { GD.Audio.stop(0.2); this.previewing = false; $('ls-prev').textContent = '▶'; return; }
        GD.Audio.play($('ls-song').value, { offset: 13 });
        this.previewing = true;
        $('ls-prev').textContent = '■';
      });
    }

    save(silent) {
      this.ul.objects = this.objs.map((o) => Object.assign({}, o));
      this.ul.settings = Object.assign({}, this.settings);
      this.ul.updated = Date.now();
      if (this.modSinceVerify) this.ul.verified = false;
      this.app.persistUser();
      this.dirty = false;
      if (!silent) GD.UI.toast('Saved!');
    }

    exitMenu() {
      GD.UI.dialog('Exit Editor', '<p>Save your level before leaving?</p>', [
        { label: 'Save & Exit', fn: () => { this.save(true); this.app.closeEditor(); } },
        { label: 'Exit', cls: 'red', fn: () => this.app.closeEditor() },
        { label: 'Cancel', cls: 'gray' },
      ]);
    }

    // ------------------------------------------------------------- playtest
    startTest() {
      if (this.test) return;
      const objs = this.objs.map((o) => Object.assign({}, o));
      const level = { settings: Object.assign({}, this.settings), objects: objs };
      // start from the right-most start position left of the screen centre (if any)
      const cx = this.cam.x + this.r.VW / 2;
      let sp = null;
      for (const o of objs) if (o.t === 'startPos' && o.x <= cx && (!sp || o.x > sp.x)) sp = o;
      this.r.setZoom(1);
      this.app.input.keys.clear();
      this.app.input.pointers.clear();
      this.app.input.hold = false;
      this.usedStart = !!sp;
      this.test = new GD.Game(this.app, { id: 'edtest', name: this.ul.name, level }, {
        test: true,
        startPos: sp ? { x: sp.x, y: sp.y, mode: sp.mode, spd: sp.spd, mini: sp.mini, flip: sp.flip } : null,
      });
      this.testPath = [];
      this.topEl.classList.add('hidden');
      this.bottomEl.classList.add('hidden');
      this.info.classList.add('hidden');
      this.stopBtn.classList.remove('hidden');
    }

    stopTest(completed) {
      if (!this.test) return;
      GD.Audio.stop(0.1);
      this.path = this.testPath;
      this.test = null;
      this.r.m = 1;
      this.applyZoom();
      this.topEl.classList.remove('hidden');
      this.bottomEl.classList.remove('hidden');
      this.info.classList.remove('hidden');
      this.stopBtn.classList.add('hidden');
      if (completed) {
        if (!this.usedStart) {
          this.ul.verified = true;
          this.modSinceVerify = false;
          this.save(true);
          GD.UI.toast('Level verified! ✔');
        } else GD.UI.toast('Completed (from a start position — not verified)');
      }
      this.refreshInfo();
    }

    // ------------------------------------------------------------- input
    onKey(e) {
      if (this.test) {
        if (e.code === 'Escape') this.stopTest(false);
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      this.keys.add(e.code);
      if (ctrl && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
      if (ctrl && e.code === 'KeyY') { e.preventDefault(); this.redo(); return; }
      if (ctrl && e.code === 'KeyC') { this.copy(); return; }
      if (ctrl && e.code === 'KeyV') { this.paste(); return; }
      if (ctrl && e.code === 'KeyD') { e.preventDefault(); this.duplicate(); return; }
      if (ctrl && e.code === 'KeyA') { e.preventDefault(); this.setMode('edit'); this.sel = new Set(this.objs); this.refreshInfo(); return; }
      if (ctrl && e.code === 'KeyS') { e.preventDefault(); this.save(); return; }
      switch (e.code) {
        case 'Digit1': this.setMode('build'); break;
        case 'Digit2': this.setMode('edit'); break;
        case 'Digit3': this.setMode('delete'); break;
        case 'Delete':
        case 'Backspace': this.deleteSel(); break;
        case 'Escape': if (this.sel.size) { this.sel.clear(); this.refreshInfo(); } else this.exitMenu(); break;
        case 'Enter': this.startTest(); break;
        case 'KeyQ': this.rotateSel(-90); break;
        case 'KeyE': this.rotateSel(90); break;
        case 'Equal': case 'NumpadAdd': this.zoom(1); break;
        case 'Minus': case 'NumpadSubtract': this.zoom(-1); break;
        case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
          e.preventDefault();
          const dx = e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowRight' ? 1 : 0;
          const dy = e.code === 'ArrowUp' ? 1 : e.code === 'ArrowDown' ? -1 : 0;
          const step = e.shiftKey ? 5 : 1;
          if (this.sel.size && this.mode === 'edit') this.moveSel(dx * step, dy * step);
          else { this.cam.x += dx * 30 * step * 2; this.cam.y += dy * 30 * step * 2; this.clampCam(); }
          break;
        }
        case 'KeyA': this.cam.x -= 90; this.clampCam(); break;
        case 'KeyD': this.cam.x += 90; this.clampCam(); break;
        case 'KeyW': this.cam.y += 60; this.clampCam(); break;
        case 'KeyS': this.cam.y -= 60; this.clampCam(); break;
      }
      this.refreshInfo();
    }

    onKeyUp(e) {
      this.keys.delete(e.code);
    }

    onWheel(e) {
      if (e.ctrlKey || e.metaKey) { this.zoom(e.deltaY < 0 ? 1 : -1); return; }
      const k = 1 / this.r.S * this.r.dpr;
      if (e.shiftKey) this.cam.y -= (e.deltaY || e.deltaX) * k;
      else this.cam.x += (e.deltaY + e.deltaX) * k;
      this.clampCam();
      this.refreshInfo();
    }

    onPointer(type, e) {
      const r = this.r;
      const p = this.toWorld(e);
      if (type === 'down') {
        try { r.cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        this.pointers.set(e.pointerId, p);
        if (this.pointers.size === 2) {
          if (this.drag && this.drag.undoPushed && this.drag.kind !== 'pan') this.undo();
          const [a, b] = [...this.pointers.values()];
          this.drag = { kind: 'pinch', dist: Math.hypot(a.px - b.px, a.py - b.py), mx: (a.px + b.px) / 2, my: (a.py + b.py) / 2, cx: this.cam.x, cy: this.cam.y, zi: this.zi };
          return;
        }
        if (this.pointers.size > 2) return;
        if (e.button === 1 || e.button === 2 || this.panMode || this.keys.has('Space')) {
          this.drag = { kind: 'pan', px: p.px, py: p.py, cx: this.cam.x, cy: this.cam.y };
          return;
        }
        if (this.mode === 'build') {
          const before = JSON.stringify(this.objs);
          if (this.place(p.wx, p.wy)) {
            this.undoStack.push(before);
            this.redoStack.length = 0;
          }
          this.drag = { kind: 'build', cell: Math.floor(p.wx / 30) + ',' + Math.floor(p.wy / 30), sx: p.px, sy: p.py, panned: false, cx: this.cam.x, cy: this.cam.y };
        } else if (this.mode === 'delete') {
          const before = JSON.stringify(this.objs);
          if (this.deleteAt(p.wx, p.wy)) { this.undoStack.push(before); this.redoStack.length = 0; }
          this.drag = { kind: 'delete', sx: p.px, sy: p.py, cx: this.cam.x, cy: this.cam.y };
        } else {
          const o = this.pick(p.wx, p.wy);
          if (o) {
            if (e.shiftKey) { if (this.sel.has(o)) this.sel.delete(o); else this.sel.add(o); }
            else if (!this.sel.has(o)) this.sel = new Set([o]);
            this.drag = { kind: 'move', sx: p.wx, sy: p.wy, ax: 0, ay: 0, undoPushed: false };
          } else {
            if (!e.shiftKey) this.sel.clear();
            this.drag = { kind: 'box', x0: p.wx, y0: p.wy, x1: p.wx, y1: p.wy };
          }
        }
        this.refreshInfo();
      } else if (type === 'move') {
        this.hover = p;
        if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
        const d = this.drag;
        if (!d) return;
        if (d.kind === 'pinch' && this.pointers.size >= 2) {
          const [a, b] = [...this.pointers.values()];
          const dist = Math.hypot(a.px - b.px, a.py - b.py);
          const ratio = dist / Math.max(1, d.dist);
          const target = U.clamp(d.zi + Math.round(Math.log(ratio) / Math.log(1.3)), 0, ZOOMS.length - 1);
          if (target !== this.zi) { this.zi = target; this.applyZoom(); }
          const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
          this.cam.x -= (mx - d.mx) / r.S;
          this.cam.y += (my - d.my) / r.S;
          d.mx = mx; d.my = my;
          this.clampCam();
          return;
        }
        if (d.kind === 'pan') {
          this.cam.x = d.cx - (p.px - d.px) / r.S;
          this.cam.y = d.cy + (p.py - d.py) / r.S;
          this.clampCam();
          this.refreshInfo();
          return;
        }
        if (d.kind === 'build' || d.kind === 'delete') {
          if (!this.swipe) {
            // without swipe, dragging on touch pans the camera
            if (e.pointerType !== 'mouse' && (Math.abs(p.px - d.sx) > 12 || Math.abs(p.py - d.sy) > 12)) {
              d.panned = true;
              this.cam.x = d.cx - (p.px - d.sx) / r.S;
              this.cam.y = d.cy + (p.py - d.sy) / r.S;
              this.clampCam();
            }
            return;
          }
          const before = JSON.stringify(this.objs);
          const ok = d.kind === 'build' ? this.place(p.wx, p.wy) : this.deleteAt(p.wx, p.wy);
          if (ok) { this.undoStack.push(before); this.redoStack.length = 0; this.refreshInfo(); }
          return;
        }
        if (d.kind === 'move') {
          const gx = Math.round((p.wx - d.sx) / 30), gy = Math.round((p.wy - d.sy) / 30);
          if (gx !== d.ax || gy !== d.ay) {
            if (!d.undoPushed) { this.pushUndo(); d.undoPushed = true; }
            this.moveSel(gx - d.ax, gy - d.ay, true);
            d.ax = gx;
            d.ay = gy;
          }
          return;
        }
        if (d.kind === 'box') { d.x1 = p.wx; d.y1 = p.wy; }
      } else if (type === 'up') {
        this.pointers.delete(e.pointerId);
        const d = this.drag;
        if (d && d.kind === 'box') {
          const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
          if (x1 - x0 > 4 || y1 - y0 > 4) for (const o of this.objs) if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) this.sel.add(o);
        }
        if (this.pointers.size === 0) this.drag = null;
        this.refreshInfo();
      }
    }

    // ------------------------------------------------------------- loop
    update(dt) {
      this.time += dt;
      if (this.test) {
        this.test.update(dt);
        const t = this.test;
        if (t.state === 'play') {
          const last = this.testPath[this.testPath.length - 1];
          if (!last || t.world.p.x - last[0] > 6) this.testPath.push([t.world.p.x, t.world.p.y]);
        } else if (t.state === 'dead' && t.deadT < dt * 1.5) this.testPath.push(null);
        return;
      }
      // keyboard panning while held
      const sp = 600 * dt;
      if (this.keys.has('KeyA') && !this.keys.has('ControlLeft')) this.cam.x -= sp;
      if (this.keys.has('KeyD') && !this.keys.has('ControlLeft')) this.cam.x += sp;
      this.clampCam();
    }

    render() {
      if (this.test) { this.test.render(); return; }
      const r = this.r, ctx = r.ctx, cam = this.cam;
      r.cam = cam;
      const cols = {};
      for (const c of GD.CHANNELS) cols[c] = U.hexToRgb(this.settings[c]);
      r.drawBg(cols, cam, 0, this.settings.bgStyle);
      // grid
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      const gx0 = Math.floor(cam.x / 30) * 30, gy0 = Math.max(0, Math.floor(cam.y / 30) * 30);
      for (let x = gx0; x < cam.x + r.VW + 30; x += 30) { const X = Math.round(r.sx(x)) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, r.sy(0)); }
      for (let y = gy0; y < cam.y + r.VH + 30; y += 30) { const Y = Math.round(r.sy(y)) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(r.W, Y); }
      ctx.stroke();
      // start line & end line
      ctx.fillStyle = 'rgba(120,255,120,0.6)';
      ctx.fillRect(r.sx(0) - 1, 0, 2, r.sy(0));
      let maxX = 0;
      for (const o of this.objs) maxX = Math.max(maxX, o.x);
      const endX = Math.max(maxX + 330, 900);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(r.sx(endX) - 1, 0, 2, r.sy(0));
      // objects
      const x0 = cam.x - 60, x1 = cam.x + r.VW + 60;
      const sel = this.sel;
      const fronts = [];
      for (const o of this.objs) {
        if (o.x < x0 || o.x > x1) continue;
        const d = OBJ[o.t];
        if (o.z > 0) { fronts.push(o); continue; }
        r.drawObject(o, d, cols, this.time, 0, 1, false);
      }
      for (const o of fronts) r.drawObject(o, OBJ[o.t], cols, this.time, 0, 1, false);
      r.drawGround(cols, cam, 0, false, 0, this.settings.gStyle);
      // group labels / selection
      ctx.lineWidth = 2;
      for (const o of this.objs) {
        if (o.x < x0 || o.x > x1) continue;
        if (sel.has(o)) {
          ctx.strokeStyle = '#5dff5d';
          ctx.fillStyle = 'rgba(93,255,93,0.18)';
          const h = OBJ[o.t].kind === 'portal' ? 45 : 15;
          const w = 15;
          const rot = (o.r || 0) % 180 !== 0;
          const ww = rot ? h : w, hh = rot ? w : h;
          ctx.fillRect(r.sx(o.x - ww), r.sy(o.y + hh), ww * 2 * r.S, hh * 2 * r.S);
          ctx.strokeRect(r.sx(o.x - ww), r.sy(o.y + hh), ww * 2 * r.S, hh * 2 * r.S);
        }
        if (o.g && r.S > 1.2) r.text(String(o.g), r.sx(o.x + 10), r.sy(o.y - 10), 8 * r.S * 0.5, { color: '#ffe680' });
      }
      // box selection
      const d = this.drag;
      if (d && d.kind === 'box') {
        ctx.strokeStyle = '#5dff5d';
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(r.sx(Math.min(d.x0, d.x1)), r.sy(Math.max(d.y0, d.y1)), Math.abs(d.x1 - d.x0) * r.S, Math.abs(d.y1 - d.y0) * r.S);
        ctx.setLineDash([]);
      }
      // last playtest path
      if (this.path && this.path.length > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let pen = false;
        for (const pt of this.path) {
          if (!pt) { pen = false; continue; }
          if (!pen) { ctx.moveTo(r.sx(pt[0]), r.sy(pt[1])); pen = true; } else ctx.lineTo(r.sx(pt[0]), r.sy(pt[1]));
        }
        ctx.stroke();
      }
      // ghost of the tool under the mouse
      const h = this.hover;
      if (this.mode === 'build' && h && !this.drag && h.wy >= 0) {
        const o = { t: this.tool, x: Math.floor(h.wx / 30) * 30 + 15, y: Math.floor(h.wy / 30) * 30 + 15, r: this.buildRot };
        if (OBJ[this.tool].slope) {
          const i = (this.buildRot / 90) | 0;
          o.r = 0;
          o.fx = i === 1 || i === 2;
          o.fy = i === 2 || i === 3;
          if (OBJ[this.tool].slope.w > 30) o.x += 15;
        }
        r.drawObject(o, OBJ[this.tool], cols, this.time, 0, 0.45, false);
      }
      if (this.mode === 'delete' && h) {
        const o = this.pick(h.wx, h.wy);
        if (o) {
          ctx.strokeStyle = '#ff4040';
          ctx.lineWidth = 3;
          ctx.strokeRect(r.sx(o.x - 15), r.sy(o.y + 15), 30 * r.S, 30 * r.S);
        }
      }
    }
  }

  GD.Editor = Editor;
})(window);
