/* Object catalogue: every placeable thing, its hitbox and editor category.
 * Units: 1 block = 30 units. Hitboxes are relative to the object centre (y up). */
(function (root) {
  'use strict';
  const GD = root.GD;
  const OBJ = (GD.OBJ = {});
  const ORDER = (GD.OBJ_ORDER = []);

  function def(key, o) {
    OBJ[key] = Object.assign({ key, vr: 30, col: 'obj' }, o);
    ORDER.push(key);
  }

  // ---------------------------------------------------------------- blocks
  const full = { x: 0, y: 0, w: 30, h: 30 };
  def('block', { kind: 'solid', cat: 'block', name: 'Block', hb: full, art: 'outline' });
  def('block2', { kind: 'solid', cat: 'block', name: 'Grid Block', hb: full, art: 'grid' });
  def('block3', { kind: 'solid', cat: 'block', name: 'Solid Block', hb: full, art: 'filled' });
  def('block4', { kind: 'solid', cat: 'block', name: 'Brick Block', hb: full, art: 'brick' });
  def('block5', { kind: 'solid', cat: 'block', name: 'Tech Block', hb: full, art: 'tech' });
  def('block6', { kind: 'solid', cat: 'block', name: 'Glass Block', hb: full, art: 'glass' });
  def('block7', { kind: 'solid', cat: 'block', name: 'Checker Block', hb: full, art: 'checker' });
  def('slab', { kind: 'solid', cat: 'block', name: 'Slab', hb: { x: 0, y: 7.5, w: 30, h: 15 }, art: 'slab' });
  def('slab2', { kind: 'solid', cat: 'block', name: 'Grid Slab', hb: { x: 0, y: 7.5, w: 30, h: 15 }, art: 'slabgrid' });

  // ---------------------------------------------------------------- hazards
  def('spike', { kind: 'hazard', cat: 'hazard', name: 'Spike', hb: { x: 0, y: -2, w: 6, h: 12 }, art: 'spike' });
  def('spikeS', { kind: 'hazard', cat: 'hazard', name: 'Small Spike', hb: { x: 0, y: -10, w: 6, h: 5.6 }, art: 'spikeS' });
  def('spikeT', { kind: 'hazard', cat: 'hazard', name: 'Ground Spikes', hb: { x: 0, y: -12, w: 22, h: 4 }, art: 'spikeT' });
  def('sawB', { kind: 'hazard', cat: 'hazard', name: 'Big Saw', hb: { x: 0, y: 0, r: 31 }, art: 'saw', sr: 44, vr: 46 });
  def('sawM', { kind: 'hazard', cat: 'hazard', name: 'Saw', hb: { x: 0, y: 0, r: 20 }, art: 'saw', sr: 29, vr: 31 });
  def('sawS', { kind: 'hazard', cat: 'hazard', name: 'Small Saw', hb: { x: 0, y: 0, r: 11 }, art: 'saw', sr: 16, vr: 18 });

  // ---------------------------------------------------------------- orbs
  const orbHB = { x: 0, y: 0, w: 36, h: 36 };
  def('orbY', { kind: 'orb', cat: 'orb', name: 'Yellow Orb', hb: orbHB, art: 'orb', c: '#ffde00', col: 'none' });
  def('orbP', { kind: 'orb', cat: 'orb', name: 'Pink Orb', hb: orbHB, art: 'orb', c: '#ff5cf0', col: 'none' });
  def('orbR', { kind: 'orb', cat: 'orb', name: 'Red Orb', hb: orbHB, art: 'orb', c: '#ff3a3a', col: 'none' });
  def('orbB', { kind: 'orb', cat: 'orb', name: 'Blue Orb', hb: orbHB, art: 'orb', c: '#38c8ff', col: 'none' });
  def('orbG', { kind: 'orb', cat: 'orb', name: 'Green Orb', hb: orbHB, art: 'orb', c: '#3dff5a', col: 'none' });
  def('orbK', { kind: 'orb', cat: 'orb', name: 'Black Orb', hb: orbHB, art: 'orb', c: '#202020', col: 'none' });

  // ---------------------------------------------------------------- pads
  const padHB = { x: 0, y: -13, w: 25, h: 4 };
  def('padY', { kind: 'pad', cat: 'pad', name: 'Yellow Pad', hb: padHB, art: 'pad', c: '#ffde00', col: 'none' });
  def('padP', { kind: 'pad', cat: 'pad', name: 'Pink Pad', hb: padHB, art: 'pad', c: '#ff5cf0', col: 'none' });
  def('padR', { kind: 'pad', cat: 'pad', name: 'Red Pad', hb: padHB, art: 'pad', c: '#ff3a3a', col: 'none' });
  def('padB', { kind: 'pad', cat: 'pad', name: 'Blue Pad', hb: padHB, art: 'pad', c: '#38c8ff', col: 'none' });

  // ---------------------------------------------------------------- portals
  const modeHB = { x: 0, y: 0, w: 34, h: 86 };
  const P = (key, name, mode, c) =>
    def(key, { kind: 'portal', cat: 'portal', name, hb: modeHB, art: 'portal', mode, c, col: 'none', vr: 50 });
  P('pCube', 'Cube Portal', 'cube', '#5cff6a');
  P('pShip', 'Ship Portal', 'ship', '#ff6ae0');
  P('pBall', 'Ball Portal', 'ball', '#ff8a24');
  P('pUfo', 'UFO Portal', 'ufo', '#ffd228');
  P('pWave', 'Wave Portal', 'wave', '#3ab6ff');
  P('pRobot', 'Robot Portal', 'robot', '#f0f0f0');
  P('pSpider', 'Spider Portal', 'spider', '#b04cff');
  P('pSwing', 'Swing Portal', 'swing', '#ffe95a');
  def('pGravD', { kind: 'portal', cat: 'portal', name: 'Normal Gravity', hb: { x: 0, y: 0, w: 25, h: 75 }, art: 'gportal', c: '#3ab6ff', col: 'none', vr: 45 });
  def('pGravU', { kind: 'portal', cat: 'portal', name: 'Flip Gravity', hb: { x: 0, y: 0, w: 25, h: 75 }, art: 'gportal', c: '#ffd228', col: 'none', vr: 45 });
  def('pMini', { kind: 'portal', cat: 'portal', name: 'Mini Portal', hb: { x: 0, y: 0, w: 31, h: 90 }, art: 'sportal', c: '#ff5cf0', col: 'none', vr: 50 });
  def('pBig', { kind: 'portal', cat: 'portal', name: 'Normal Size', hb: { x: 0, y: 0, w: 31, h: 90 }, art: 'sportal', c: '#5cff6a', col: 'none', vr: 50 });

  const spHB = { x: 0, y: 0, w: 35, h: 44 };
  def('sp0', { kind: 'portal', cat: 'speed', name: 'Speed 0.5x', hb: spHB, art: 'speed', spd: 0, c: '#ffb43a', col: 'none', vr: 35 });
  def('sp1', { kind: 'portal', cat: 'speed', name: 'Speed 1x', hb: spHB, art: 'speed', spd: 1, c: '#47c8ff', col: 'none', vr: 35 });
  def('sp2', { kind: 'portal', cat: 'speed', name: 'Speed 2x', hb: spHB, art: 'speed', spd: 2, c: '#5cff6a', col: 'none', vr: 35 });
  def('sp3', { kind: 'portal', cat: 'speed', name: 'Speed 3x', hb: spHB, art: 'speed', spd: 3, c: '#ff5cf0', col: 'none', vr: 35 });
  def('sp4', { kind: 'portal', cat: 'speed', name: 'Speed 4x', hb: spHB, art: 'speed', spd: 4, c: '#ff3a3a', col: 'none', vr: 35 });

  // ---------------------------------------------------------------- collectables / misc
  def('coin', { kind: 'coin', cat: 'misc', name: 'Secret Coin', hb: { x: 0, y: 0, r: 16 }, art: 'coin', col: 'none', vr: 24 });
  def('startPos', { kind: 'start', cat: 'misc', name: 'Start Position', art: 'startpos', col: 'none',
    props: { mode: 'cube', spd: 1, mini: false, flip: false } });

  // ---------------------------------------------------------------- decoration
  def('dGrass', { kind: 'deco', cat: 'deco', name: 'Grass', art: 'grass' });
  def('dRing', { kind: 'deco', cat: 'deco', name: 'Pulse Ring', art: 'ring', vr: 30 });
  def('dArrow', { kind: 'deco', cat: 'deco', name: 'Arrow', art: 'arrow' });
  def('dChain', { kind: 'deco', cat: 'deco', name: 'Chain', art: 'chain' });
  def('dDots', { kind: 'deco', cat: 'deco', name: 'Light Dots', art: 'dots' });
  def('dGlow', { kind: 'deco', cat: 'deco', name: 'Glow', art: 'glow', vr: 45 });
  def('dFake', { kind: 'deco', cat: 'deco', name: 'Fake Spike', art: 'fakespike' });
  def('dCloud', { kind: 'deco', cat: 'deco', name: 'Cloud', art: 'cloud', vr: 45 });
  def('dPillar', { kind: 'deco', cat: 'deco', name: 'Back Pillar', art: 'pillar' });
  def('dDiamond', { kind: 'deco', cat: 'deco', name: 'Diamond', art: 'diamond' });

  // ---------------------------------------------------------------- triggers
  def('tColor', { kind: 'trigger', cat: 'trigger', name: 'Color', art: 'trigger', label: 'COL', col: 'none',
    props: { ch: 'bg', col: '#ff3a8c', d: 0.5 } });
  def('tMove', { kind: 'trigger', cat: 'trigger', name: 'Move', art: 'trigger', label: 'MOVE', col: 'none',
    props: { grp: 1, dx: 0, dy: 2, d: 0.5, e: 'inOut' } });
  def('tAlpha', { kind: 'trigger', cat: 'trigger', name: 'Alpha', art: 'trigger', label: 'ALPHA', col: 'none',
    props: { grp: 1, a: 0, d: 0.5 } });
  def('tToggle', { kind: 'trigger', cat: 'trigger', name: 'Toggle', art: 'trigger', label: 'TGL', col: 'none',
    props: { grp: 1, on: false } });
  def('tPulse', { kind: 'trigger', cat: 'trigger', name: 'Pulse', art: 'trigger', label: 'PULSE', col: 'none',
    props: { ch: 'bg', col: '#ffffff', fi: 0.05, h: 0.05, fo: 0.4 } });
  def('tShake', { kind: 'trigger', cat: 'trigger', name: 'Shake', art: 'trigger', label: 'SHAKE', col: 'none',
    props: { s: 4, d: 0.5 } });

  GD.CATS = [
    { id: 'block', name: 'Blocks' },
    { id: 'hazard', name: 'Hazards' },
    { id: 'orb', name: 'Orbs' },
    { id: 'pad', name: 'Pads' },
    { id: 'portal', name: 'Portals' },
    { id: 'speed', name: 'Speed' },
    { id: 'deco', name: 'Deco' },
    { id: 'trigger', name: 'Triggers' },
    { id: 'misc', name: 'Misc' },
  ];

  GD.MODES = ['cube', 'ship', 'ball', 'ufo', 'wave', 'robot', 'spider', 'swing'];
  GD.CHANNELS = ['bg', 'g', 'line', 'obj', 'c1', 'c2', 'c3', 'c4'];
  GD.CHANNEL_NAMES = { bg: 'Background', g: 'Ground', line: 'Line', obj: 'Objects', c1: 'Color 1', c2: 'Color 2', c3: 'Color 3', c4: 'Color 4' };

  GD.DEFAULT_SETTINGS = {
    bg: '#287dff', g: '#0066ff', line: '#ffffff', obj: '#ffffff',
    c1: '#ff4a8d', c2: '#46e3ff', c3: '#ffd23f', c4: '#8cff5a',
    mode: 'cube', spd: 1, mini: false, flip: false, song: 'neon',
  };

  /** Rotate/flip an object's hitbox definition. Returns null, a rect or a circle relative to centre. */
  GD.localHitbox = function (o, d) {
    d = d || OBJ[o.t];
    const hb = d && d.hb;
    if (!hb) return null;
    let hx = hb.x || 0, hy = hb.y || 0;
    if (o.fx) hx = -hx;
    if (o.fy) hy = -hy;
    const r = ((Math.round((o.r || 0) / 90) * 90) % 360 + 360) % 360;
    let x = hx, y = hy, w = hb.w, h = hb.h;
    if (r === 90) { x = hy; y = -hx; w = hb.h; h = hb.w; }
    else if (r === 180) { x = -hx; y = -hy; }
    else if (r === 270) { x = -hy; y = hx; w = hb.h; h = hb.w; }
    const s = o.s || 1;
    if (hb.r) return { k: 'c', x: x * s, y: y * s, r: hb.r * s };
    return { k: 'r', x: x * s, y: y * s, w: w * s, h: h * s };
  };
})(typeof window !== 'undefined' ? window : globalThis);
