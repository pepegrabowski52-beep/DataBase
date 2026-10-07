/* Player icons for every game mode, colour palette and difficulty faces.
 * Everything is drawn procedurally in "units" (a cube is 30x30), centred on 0,0, canvas y-down. */
(function (root) {
  'use strict';
  const GD = root.GD;

  const K = '#000';

  function R(g, x, y, w, h, fill, lw) {
    g.beginPath();
    g.rect(x, y, w, h);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (lw !== 0) { g.lineWidth = lw || 2; g.strokeStyle = K; g.lineJoin = 'miter'; g.stroke(); }
  }
  function P(g, pts, fill, lw) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (lw !== 0) { g.lineWidth = lw || 2; g.strokeStyle = K; g.lineJoin = 'round'; g.stroke(); }
  }
  function C(g, x, y, r, fill, lw) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (lw !== 0) { g.lineWidth = lw || 2; g.strokeStyle = K; g.stroke(); }
  }
  function E(g, x, y, rx, ry, fill, lw) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (lw !== 0) { g.lineWidth = lw || 2; g.strokeStyle = K; g.stroke(); }
  }
  function base(g, a) { R(g, -15, -15, 30, 30, a); }
  function clipBox(g, fn) {
    g.save();
    g.beginPath();
    g.rect(-14, -14, 28, 28);
    g.clip();
    fn();
    g.restore();
    g.lineWidth = 2; g.strokeStyle = K; g.strokeRect(-15, -15, 30, 30);
  }
  function star(g, x, y, r1, r2, n, fill, lw) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n - Math.PI / 2, r = i % 2 ? r2 : r1;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    P(g, pts, fill, lw);
  }

  // ------------------------------------------------------------------ cubes
  const CUBES = [
    (g, a, b) => { base(g, a); R(g, -9, -9, 18, 18, b, 1.6); R(g, -6.5, -6, 5, 5, a, 1.3); R(g, 1.5, -6, 5, 5, a, 1.3); R(g, -6.5, 2.5, 13, 3.5, a, 1.3); },
    (g, a, b) => { base(g, a); C(g, 0, 0, 10.5, b, 1.6); C(g, -4, -3, 2, K, 0); C(g, 4, -3, 2, K, 0); g.beginPath(); g.arc(0, 0.5, 5.5, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 2; g.strokeStyle = K; g.stroke(); },
    (g, a, b) => { base(g, a); P(g, [-11, -8, -2, -4, -2, 1, -11, -2], b, 1.4); P(g, [11, -8, 2, -4, 2, 1, 11, -2], b, 1.4); R(g, -7, 6, 14, 3, K, 0); },
    (g, a, b) => { base(g, a); P(g, [0, -12, 12, 0, 0, 12, -12, 0], b, 1.6); P(g, [0, -5, 5, 0, 0, 5, -5, 0], a, 1.3); },
    (g, a, b) => { base(g, a); C(g, 0, -2, 8.5, b, 1.6); C(g, 0, -2, 3.8, K, 0); C(g, 1.4, -3.4, 1.3, '#fff', 0); R(g, -8, 9, 16, 2.5, K, 0); },
    (g, a, b) => { R(g, -15, -15, 30, 30, a, 0); clipBox(g, () => { for (let i = -30; i < 30; i += 10) P(g, [i, -15, i + 5, -15, i + 20, 15, i + 15, 15], b, 1); }); },
    (g, a, b) => { R(g, -15, -15, 30, 30, a, 0); R(g, -15, -15, 15, 15, b, 0); R(g, 0, 0, 15, 15, b, 0); g.lineWidth = 1.2; g.strokeStyle = K; g.strokeRect(-15, -15, 15, 15); g.strokeRect(0, 0, 15, 15); R(g, -15, -15, 30, 30, null); C(g, -7.5, -7.5, 2.5, K, 0); C(g, 7.5, -7.5, 2.5, K, 0); },
    (g, a, b) => { base(g, a); R(g, -10, -10, 20, 20, b, 1.6); R(g, -5, -5, 10, 10, a, 1.4); R(g, -2, -2, 4, 4, K, 0); },
    (g, a, b) => { base(g, a); R(g, -12, -7, 24, 9, b, 1.6); R(g, -9, -4, 18, 2.5, K, 0); R(g, -6, 7, 12, 3.5, b, 1.2); },
    (g, a, b) => { base(g, a); const x = (cx) => { g.beginPath(); g.moveTo(cx - 4, -8); g.lineTo(cx + 4, 0); g.moveTo(cx + 4, -8); g.lineTo(cx - 4, 0); g.lineWidth = 3; g.strokeStyle = b; g.stroke(); }; x(-6); x(6); R(g, -8, 5, 16, 3, b, 1.2); },
    (g, a, b) => { base(g, a); P(g, [-4, -12, 4, -12, 4, -4, 12, -4, 12, 4, 4, 4, 4, 12, -4, 12, -4, 4, -12, 4, -12, -4, -4, -4], b, 1.5); },
    (g, a, b) => { base(g, a); P(g, [-12, -2, -12, -8, -8, -12, 8, -12, 12, -8, 12, -2], b, 1.4); C(g, -5, -5, 2.2, K, 0); C(g, 5, -5, 2.2, K, 0); P(g, [-12, 3, 12, 3, 12, 12, 8, 8, 4, 12, 0, 8, -4, 12, -8, 8, -12, 12], b, 1.4); },
    (g, a, b) => { base(g, a); star(g, 0, 1, 12, 5, 5, b, 1.5); C(g, 0, 1, 2.5, a, 1); },
    (g, a, b) => { base(g, a); P(g, [-15, -15, -8, -15, -15, -8], b, 1.2); P(g, [15, -15, 8, -15, 15, -8], b, 1.2); E(g, -6, -2, 3.5, 4.5, b, 1.4); E(g, 6, -2, 3.5, 4.5, b, 1.4); R(g, -6.5, -3, 1.5, 3, K, 0); R(g, 5.5, -3, 1.5, 3, K, 0); P(g, [-2, 5, 2, 5, 0, 7], K, 0); },
    (g, a, b) => { base(g, a); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) R(g, i * 8 - 2.5, j * 8 - 2.5, 5, 5, (i + j) % 2 ? a : b, 1.2); },
    (g, a, b) => { base(g, a); P(g, [-9, -10, 5, 0, -9, 10, -9, 4, -3, 0, -9, -4], b, 1.5); P(g, [1, -10, 13, 0, 1, 10, 1, 5, 6, 0, 1, -5], b, 1.5); },
    (g, a, b) => { base(g, a); C(g, -5.5, -3, 4.5, b, 1.5); C(g, 5.5, -3, 4.5, b, 1.5); C(g, -5.5, -3, 2, K, 0); C(g, 5.5, -3, 2, K, 0); P(g, [-8, 6, 8, 6, 6, 11, -6, 11], b, 1.4); g.beginPath(); for (let i = -4; i <= 4; i += 4) { g.moveTo(i, 6); g.lineTo(i, 11); } g.lineWidth = 1.2; g.strokeStyle = K; g.stroke(); },
    (g, a, b) => { R(g, -15, -15, 30, 30, b); R(g, -11, -11, 22, 22, a, 1.5); R(g, -7, -7, 14, 14, b, 1.5); R(g, -3, -3, 6, 6, a, 1.3); },
    (g, a, b) => { base(g, a); g.beginPath(); g.moveTo(0, 10); g.bezierCurveTo(-14, 0, -8, -12, 0, -5); g.bezierCurveTo(8, -12, 14, 0, 0, 10); g.fillStyle = b; g.fill(); g.lineWidth = 1.6; g.strokeStyle = K; g.stroke(); },
    (g, a, b) => { base(g, a); P(g, [3, -13, -8, 2, -1, 2, -4, 13, 8, -3, 1, -3], b, 1.5); },
    (g, a, b) => { base(g, a); R(g, -15, -15, 30, 9, b, 1.5); R(g, -15, 6, 30, 9, b, 1.5); R(g, -6, -3, 4, 4, K, 0); R(g, 2, -3, 4, 4, K, 0); },
    (g, a, b) => { base(g, a); C(g, 0, 0, 11, b, 1.5); C(g, 0, 0, 7, a, 1.3); C(g, 0, 0, 3, b, 1.2); },
    (g, a, b) => { base(g, a); P(g, [-12, -12, -4, -12, -12, -4], b, 1.2); P(g, [12, 12, 4, 12, 12, 4], b, 1.2); P(g, [12, -12, 12, -4, 4, -12], b, 1.2); P(g, [-12, 12, -12, 4, -4, 12], b, 1.2); R(g, -5, -5, 10, 10, b, 1.4); C(g, 0, 0, 2, K, 0); },
    (g, a, b) => { base(g, a); P(g, [-11, -4, -3, -10, -3, -4], b, 1.3); P(g, [11, -4, 3, -10, 3, -4], b, 1.3); g.beginPath(); g.moveTo(-9, 5); g.quadraticCurveTo(0, 13, 9, 5); g.lineTo(-9, 5); g.fillStyle = b; g.fill(); g.lineWidth = 1.4; g.strokeStyle = K; g.stroke(); },
  ];

  // ------------------------------------------------------------------ ships (mini cube drawn separately)
  const SHIPS = [
    (g, a, b) => { P(g, [-19, -2, -13, -6, 10, -6, 19, 2, 12, 8, -15, 8], a); P(g, [-13, 1, 6, 1, 0, 8, -15, 8], b, 1.5); R(g, 9, -3, 4, 3, b, 1.2); },
    (g, a, b) => { P(g, [-20, -6, -6, -6, 20, 3, 4, 9, -18, 9], a); P(g, [-16, 2, 2, 2, -4, 9, -18, 9], b, 1.5); P(g, [-20, -6, -14, -12, -10, -6], b, 1.5); },
    (g, a, b) => { E(g, 0, 2, 19, 7.5, a); E(g, 0, 4, 12, 3.5, b, 1.4); P(g, [-19, 2, -24, -6, -15, -3], b, 1.4); P(g, [-19, 2, -24, 10, -15, 7], b, 1.4); },
    (g, a, b) => { P(g, [-18, -6, 18, 0, -18, 9, -12, 1.5], a); P(g, [-10, -1, 10, 1, -10, 5, -7, 2], b, 1.3); },
    (g, a, b) => { P(g, [-19, -6, 12, -6, 20, 0, 12, 8, -19, 8, -15, 1], a); R(g, -12, -1, 22, 4, b, 1.3); P(g, [-6, 8, 2, 8, -4, 13, -10, 13], b, 1.3); P(g, [-6, -6, 2, -6, -4, -11, -10, -11], b, 1.3); },
    (g, a, b) => { P(g, [-20, 0, -12, -7, 14, -7, 20, 0, 14, 8, -12, 8], a); C(g, -7, 1, 3, b, 1.3); C(g, 2, 1, 3, b, 1.3); C(g, 11, 1, 3, b, 1.3); },
    (g, a, b) => { P(g, [-19, 8, -19, -2, -8, -7, 16, -4, 20, 3, 16, 8], a); P(g, [-19, 8, -19, 2, 0, 2, 6, 8], b, 1.4); P(g, [-19, -2, -24, -9, -12, -5], b, 1.3); },
    (g, a, b) => { P(g, [-20, -5, 0, -8, 20, 0, 0, 9, -20, 6, -14, 0], a); P(g, [-8, -4, 8, 0, -8, 5, -4, 0], b, 1.3); },
  ];

  // ------------------------------------------------------------------ balls
  const BALLS = [
    (g, a, b) => { C(g, 0, 0, 14.5, a); P(g, [0, -14, 4, -4, 14, 0, 4, 4, 0, 14, -4, 4, -14, 0, -4, -4], b, 1.4); C(g, 0, 0, 3, a, 1.2); },
    (g, a, b) => { C(g, 0, 0, 14.5, a); g.save(); g.beginPath(); g.arc(0, 0, 13.5, 0, Math.PI * 2); g.clip(); R(g, -15, -15, 15, 30, b, 0); g.restore(); C(g, 0, 0, 14.5, null); g.beginPath(); g.moveTo(0, -14.5); g.lineTo(0, 14.5); g.lineWidth = 1.5; g.strokeStyle = K; g.stroke(); C(g, 0, 0, 5, a, 1.4); },
    (g, a, b) => { C(g, 0, 0, 14.5, a); C(g, 0, 0, 10, b, 1.5); C(g, 0, 0, 5.5, a, 1.4); C(g, 0, 0, 2, K, 0); },
    (g, a, b) => { C(g, 0, 0, 14.5, a); for (let i = 0; i < 6; i++) { g.save(); g.rotate((i * Math.PI) / 3); P(g, [-2.5, -13.5, 2.5, -13.5, 1.5, -4, -1.5, -4], b, 1.1); g.restore(); } C(g, 0, 0, 4, b, 1.3); },
    (g, a, b) => { C(g, 0, 0, 14.5, a); star(g, 0, 0, 12.5, 5.5, 5, b, 1.4); },
    (g, a, b) => { C(g, 0, 0, 14.5, a); g.save(); g.beginPath(); g.arc(0, 0, 13.5, 0, Math.PI * 2); g.clip(); for (let i = -20; i < 20; i += 9) R(g, i, -15, 4.5, 30, b, 0); g.restore(); C(g, 0, 0, 14.5, null); },
    (g, a, b) => { C(g, 0, 0, 14.5, a); C(g, -5, -4, 3.5, b, 1.3); C(g, 5, -4, 3.5, b, 1.3); C(g, -5, -4, 1.5, K, 0); C(g, 5, -4, 1.5, K, 0); g.beginPath(); g.arc(0, 2, 6, 0.1 * Math.PI, 0.9 * Math.PI); g.lineWidth = 2; g.strokeStyle = K; g.stroke(); },
    (g, a, b) => { C(g, 0, 0, 14.5, a); for (let i = 0; i < 4; i++) { g.save(); g.rotate((i * Math.PI) / 2); P(g, [0, -14, 6, -6, 0, 0], b, 1.2); g.restore(); } },
  ];

  // ------------------------------------------------------------------ ufos (mini cube in dome)
  const UFOS = [
    (g, a, b) => { E(g, 0, 5, 19, 6.5, a); E(g, 0, 7.5, 11, 3, b, 1.3); C(g, -12, 5, 1.6, '#fff', 0.8); C(g, 12, 5, 1.6, '#fff', 0.8); },
    (g, a, b) => { P(g, [-20, 5, -12, -1, 12, -1, 20, 5, 12, 11, -12, 11], a); R(g, -10, 4, 20, 3, b, 1.2); },
    (g, a, b) => { E(g, 0, 5, 18, 6, a); P(g, [-9, 9, 9, 9, 6, 14, -6, 14], b, 1.3); E(g, 0, 3, 14, 2, b, 1); },
    (g, a, b) => { E(g, 0, 5, 20, 5.5, a); for (let i = -12; i <= 12; i += 8) C(g, i, 5, 2, b, 1); P(g, [-14, 9, -8, 9, -12, 15], b, 1.2); P(g, [14, 9, 8, 9, 12, 15], b, 1.2); },
  ];

  // ------------------------------------------------------------------ waves
  const WAVES = [
    (g, a, b) => { P(g, [-12, -11, 13, 0, -12, 11, -6, 0], a); P(g, [-6, -4, 5, 0, -6, 4, -3, 0], b, 1.2); },
    (g, a, b) => { P(g, [-13, -9, 3, -9, 13, 0, 3, 9, -13, 9, -8, 0], a); P(g, [-6, -4, 2, -4, 6, 0, 2, 4, -6, 4], b, 1.2); },
    (g, a, b) => { P(g, [-12, -12, 13, 0, -12, 12], a); P(g, [-12, -12, 0, -6, -12, 0], b, 1.2); P(g, [-12, 12, 0, 6, -12, 0], b, 1.2); },
    (g, a, b) => { P(g, [-13, -10, 14, 0, -13, 10, -13, 4, -4, 0, -13, -4], a); C(g, 2, 0, 2.5, b, 1); },
  ];

  // ------------------------------------------------------------------ swing
  const SWINGS = [
    (g, a, b) => { P(g, [-17, -10, -6, -3, -6, 3, -17, 10, -12, 0], b); P(g, [17, -10, 6, -3, 6, 3, 17, 10, 12, 0], b); R(g, -8, -8, 16, 16, a); R(g, -4, -4, 8, 8, b, 1.3); },
    (g, a, b) => { E(g, 0, -11, 15, 3.5, b, 1.5); R(g, -1, -9, 2, 3, K, 0); C(g, 0, 2, 9, a); C(g, 0, 2, 4, b, 1.3); },
    (g, a, b) => { P(g, [-16, 0, -4, -9, 4, -9, 16, 0, 4, 9, -4, 9], a); P(g, [-8, 0, 0, -5, 8, 0, 0, 5], b, 1.3); },
  ];

  const ROBOTS = 3, SPIDERS = 3;

  function cubeIcon(g, id, a, b) { CUBES[((id % CUBES.length) + CUBES.length) % CUBES.length](g, a, b); }

  function drawRobot(g, id, a, b, phase, air) {
    // legs
    const legs = (off, col) => {
      const s = air ? 0 : Math.sin(phase + off);
      const kx = s * 4, fy = air ? 2 : Math.max(0, -Math.cos(phase + off)) * -3;
      g.beginPath();
      g.moveTo(off ? 3 : -3, 4);
      g.lineTo(off ? 4 + kx : -2 + kx, 9 + (air ? -1 : 0));
      g.lineTo(off ? 2 + kx * 1.4 : -4 + kx * 1.4, 14 + fy);
      g.lineWidth = 5.5; g.strokeStyle = K; g.lineCap = 'round'; g.stroke();
      g.lineWidth = 3; g.strokeStyle = col; g.stroke();
      R(g, (off ? -1 : -7) + kx * 1.4, 12.5 + fy, 9, 3.5, col, 1.4);
    };
    legs(Math.PI, b);
    const v = id % ROBOTS;
    if (v === 0) { R(g, -11, -14, 22, 18, a); R(g, -7, -10, 14, 6, b, 1.4); R(g, -4, -8.5, 3, 3, K, 0); R(g, 2, -8.5, 3, 3, K, 0); }
    else if (v === 1) { P(g, [-12, -6, -6, -14, 6, -14, 12, -6, 10, 4, -10, 4], a); C(g, 0, -6, 4.5, b, 1.4); C(g, 0, -6, 2, K, 0); }
    else { R(g, -12, -13, 24, 17, a); P(g, [-8, -9, 8, -9, 5, -3, -5, -3], b, 1.3); R(g, -14, -6, 4, 7, b, 1.2); R(g, 10, -6, 4, 7, b, 1.2); }
    legs(0, a);
  }

  function drawSpider(g, id, a, b, phase, air) {
    const v = id % SPIDERS;
    const leg = (x0, dir, ph, col) => {
      const s = air ? 0.3 : Math.sin(phase * 1.4 + ph);
      g.beginPath();
      g.moveTo(x0, 2);
      g.lineTo(x0 + dir * (8 + s * 2), -3 + Math.abs(s) * 2);
      g.lineTo(x0 + dir * (12 + s * 3), 14 - Math.max(0, s) * 3);
      g.lineWidth = 4.5; g.strokeStyle = K; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
      g.lineWidth = 2.2; g.strokeStyle = col; g.stroke();
    };
    leg(-4, -1, 0, b); leg(4, 1, Math.PI, b);
    if (v === 0) { E(g, 0, 0, 13, 9, a); E(g, 0, -1, 7, 4, b, 1.3); C(g, -3, -1, 1.5, K, 0); C(g, 3, -1, 1.5, K, 0); }
    else if (v === 1) { P(g, [-14, 4, -8, -8, 8, -8, 14, 4, 8, 8, -8, 8], a); R(g, -6, -4, 12, 4, b, 1.3); }
    else { C(g, 0, 0, 11, a); C(g, -4, -2, 3, b, 1.2); C(g, 4, -2, 3, b, 1.2); C(g, 0, 5, 2, b, 1); }
    leg(-7, -1, Math.PI / 2, a); leg(7, 1, Math.PI * 1.5, a);
  }

  GD.Icons = {
    count: { cube: CUBES.length, ship: SHIPS.length, ball: BALLS.length, ufo: UFOS.length, wave: WAVES.length, robot: ROBOTS, spider: SPIDERS, swing: SWINGS.length },

    /** Draw a player icon centred on 0,0. opts: {cubeId, phase, air} */
    draw(g, mode, id, a, b, opts) {
      opts = opts || {};
      const cubeId = opts.cubeId || 0;
      g.lineCap = 'butt';
      switch (mode) {
        case 'cube': cubeIcon(g, id, a, b); break;
        case 'ship':
          g.save(); g.translate(-1, -8); g.scale(0.55, 0.55); cubeIcon(g, cubeId, a, b); g.restore();
          SHIPS[id % SHIPS.length](g, a, b);
          break;
        case 'ball': BALLS[id % BALLS.length](g, a, b); break;
        case 'ufo':
          g.save(); g.translate(0, -4); g.scale(0.5, 0.5);
          g.beginPath(); g.arc(0, 0, 21, Math.PI, 0); g.closePath(); g.fillStyle = 'rgba(180,240,255,0.35)'; g.fill(); g.lineWidth = 3; g.strokeStyle = K; g.stroke();
          g.translate(0, -4); cubeIcon(g, cubeId, a, b);
          g.restore();
          UFOS[id % UFOS.length](g, a, b);
          break;
        case 'wave': WAVES[id % WAVES.length](g, a, b); break;
        case 'robot': drawRobot(g, id, a, b, opts.phase || 0, opts.air); break;
        case 'spider': drawSpider(g, id, a, b, opts.phase || 0, opts.air); break;
        case 'swing': SWINGS[id % SWINGS.length](g, a, b); break;
      }
    },

    /** Difficulty face for the level select (size = diameter in px). */
    face(g, diff, size) {
      const s = size / 40;
      g.save();
      g.scale(s, s);
      g.translate(20, 20);
      const cols = { auto: '#ffcc33', easy: '#3fb7ff', normal: '#4fe04f', hard: '#ffb92e', harder: '#ff4d3a', insane: '#ff4dd8', demon: '#c41f3a' };
      const c = cols[diff] || '#999';
      if (diff === 'demon') {
        P(g, [-15, -8, -19, -19, -8, -13], '#ff5a3a', 2);
        P(g, [15, -8, 19, -19, 8, -13], '#ff5a3a', 2);
      }
      C(g, 0, 1, 15, c, 2.5);
      const glow = g.createRadialGradient(-4, -4, 2, 0, 0, 15);
      glow.addColorStop(0, 'rgba(255,255,255,0.45)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      C(g, 0, 1, 14, glow, 0);
      g.lineWidth = 2.2; g.strokeStyle = K; g.lineCap = 'round';
      const eye = (x, y, angry) => {
        if (angry) P(g, [x - 4, y - 3, x + 4, y - 1 * (x < 0 ? -1 : 1) - 1, x + 3, y + 3, x - 3, y + 3], '#fff', 1.6);
        else { E(g, x, y, 3, 3.6, '#fff', 1.6); C(g, x, y + 0.6, 1.4, K, 0); }
      };
      if (diff === 'easy' || diff === 'auto') {
        eye(-5, -2); eye(5, -2);
        g.beginPath(); g.arc(0, 4, 6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      } else if (diff === 'normal') {
        eye(-5, -2); eye(5, -2);
        g.beginPath(); g.moveTo(-5, 8); g.lineTo(5, 8); g.stroke();
      } else if (diff === 'hard') {
        eye(-5, -2, true); eye(5, -2, true);
        g.beginPath(); g.arc(0, 11, 5, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
      } else if (diff === 'harder') {
        eye(-5, -2, true); eye(5, -2, true);
        P(g, [-6, 6, 6, 6, 4, 10, -4, 10], '#fff', 1.6);
      } else {
        eye(-5, -3, true); eye(5, -3, true);
        P(g, [-8, 5, 8, 5, 6, 11, -6, 11], K, 0);
        P(g, [-6, 5, -4, 8, -2, 5], '#fff', 0); P(g, [2, 5, 4, 8, 6, 5], '#fff', 0);
      }
      g.restore();
    },
  };

  // GD-like colour palette
  const PAL = [];
  const hues = [0, 20, 40, 55, 75, 100, 130, 160, 180, 200, 220, 245, 270, 290, 310, 335];
  for (const v of [[1, 1], [0.55, 1], [1, 0.6]]) for (const h of hues) PAL.push(GD.U.rgbToHex(GD.U.hsv(h, v[0], v[1])));
  PAL.push('#ffffff', '#c8c8c8', '#8c8c8c', '#505050', '#252525', '#000000');
  GD.PALETTE = PAL;
})(typeof window !== 'undefined' ? window : globalThis);
