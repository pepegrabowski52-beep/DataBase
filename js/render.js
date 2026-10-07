/* Canvas renderer: backgrounds, ground, object art (cached sprites), player, particles and HUD. */
(function (root) {
  'use strict';
  const GD = root.GD;
  const U = GD.U;
  const OBJ = GD.OBJ;
  const FONT = "'Lilita One', 'Arial Black', Impact, sans-serif";
  GD.FONT = FONT;

  function makeCanvas(w, h) {
    if (root.document) {
      const c = root.document.createElement('canvas');
      c.width = Math.max(1, w);
      c.height = Math.max(1, h);
      return c;
    }
    return new root.OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  }
  GD.makeCanvas = makeCanvas;

  const rgba = U.rgba;
  const css = (c) => rgba(c, 1);

  // --------------------------------------------------------------------------- object art
  // Every art function draws in units, centred on (0,0), canvas y-down. rgb = channel colour.
  function darkBody(g, x, y, w, h) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#161616');
    gr.addColorStop(1, '#000');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }
  function innerGlow(g, rgb, x, y, w, h, a) {
    const ig = g.createLinearGradient(0, y, 0, y + h);
    ig.addColorStop(0, rgba(rgb, a));
    ig.addColorStop(0.55, rgba(rgb, a * 0.12));
    ig.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = ig;
    g.fillRect(x + 1, y + 1, w - 2, h - 2);
  }
  function edge(g, rgb, x, y, w, h, lw, a) {
    g.lineWidth = lw || 1.6;
    g.strokeStyle = rgba(rgb, a == null ? 1 : a);
    g.strokeRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6);
  }
  function tri(g, x0, y0, x1, y1, x2, y2) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.lineTo(x2, y2);
    g.closePath();
  }
  function hexRgb(h) { return U.hexToRgb(h); }

  const ART = {
    outline(g, rgb) {
      darkBody(g, -15, -15, 30, 30);
      innerGlow(g, rgb, -15, -15, 30, 30, 0.3);
      edge(g, rgb, -15, -15, 30, 30);
    },
    grid(g, rgb) {
      darkBody(g, -15, -15, 30, 30);
      innerGlow(g, rgb, -15, -15, 30, 30, 0.22);
      g.lineWidth = 1;
      g.strokeStyle = rgba(rgb, 0.45);
      g.strokeRect(-9.5, -9.5, 19, 19);
      g.beginPath();
      g.moveTo(0, -9.5); g.lineTo(0, 9.5); g.moveTo(-9.5, 0); g.lineTo(9.5, 0);
      g.stroke();
      edge(g, rgb, -15, -15, 30, 30);
    },
    filled(g, rgb) {
      const gr = g.createLinearGradient(0, -15, 0, 15);
      gr.addColorStop(0, css(U.shade(rgb, 0.25)));
      gr.addColorStop(1, css(U.shade(rgb, -0.25)));
      g.fillStyle = gr;
      g.fillRect(-15, -15, 30, 30);
      edge(g, U.shade(rgb, -0.6), -15, -15, 30, 30, 1.6);
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.strokeRect(-11.5, -11.5, 23, 23);
    },
    brick(g, rgb) {
      darkBody(g, -15, -15, 30, 30);
      g.lineWidth = 1.1;
      g.strokeStyle = rgba(rgb, 0.55);
      g.beginPath();
      for (let r = 0; r < 3; r++) {
        const y = -15 + r * 10;
        g.moveTo(-15, y); g.lineTo(15, y);
        const off = r % 2 ? 7.5 : 0;
        for (let x = -15 + off; x < 15; x += 15) { g.moveTo(x, y); g.lineTo(x, y + 10); }
      }
      g.stroke();
      edge(g, rgb, -15, -15, 30, 30);
    },
    tech(g, rgb) {
      darkBody(g, -15, -15, 30, 30);
      innerGlow(g, rgb, -15, -15, 30, 30, 0.18);
      g.fillStyle = rgba(rgb, 0.55);
      tri(g, -13, -13, -6, -13, -13, -6); g.fill();
      tri(g, 13, 13, 6, 13, 13, 6); g.fill();
      g.lineWidth = 1;
      g.strokeStyle = rgba(rgb, 0.4);
      g.strokeRect(-8, -8, 16, 16);
      g.fillStyle = rgba(rgb, 0.7);
      g.fillRect(-2, -2, 4, 4);
      edge(g, rgb, -15, -15, 30, 30);
    },
    glass(g, rgb) {
      g.fillStyle = rgba(rgb, 0.16);
      g.fillRect(-15, -15, 30, 30);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      tri(g, -14, -14, 4, -14, -14, 4); g.fill();
      edge(g, rgb, -15, -15, 30, 30, 1.6, 0.9);
    },
    checker(g, rgb) {
      darkBody(g, -15, -15, 30, 30);
      g.fillStyle = rgba(rgb, 0.28);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) g.fillRect(-15 + i * 10, -15 + j * 10, 10, 10);
      edge(g, rgb, -15, -15, 30, 30);
    },
    slope(g, rgb) {
      ART.slopeShape(g, rgb, 15);
    },
    slopeL(g, rgb) {
      ART.slopeShape(g, rgb, 30);
    },
    slopeShape(g, rgb, hw) {
      // solid below a line rising to the right (flips / rotation give the other orientations)
      g.beginPath();
      g.moveTo(-hw, 15);
      g.lineTo(hw, 15);
      g.lineTo(hw, -15);
      g.closePath();
      const gr = g.createLinearGradient(0, -15, 0, 15);
      gr.addColorStop(0, '#161616');
      gr.addColorStop(1, '#000');
      g.fillStyle = gr;
      g.fill();
      g.save();
      g.clip();
      const ig = g.createLinearGradient(-hw * 0.3, -15 * 0.3, hw * 0.3, 15 * 0.3);
      ig.addColorStop(0, rgba(rgb, 0.3));
      ig.addColorStop(0.5, rgba(rgb, 0.04));
      ig.addColorStop(1, rgba(rgb, 0));
      g.fillStyle = ig;
      g.fillRect(-hw, -15, hw * 2, 30);
      g.restore();
      g.beginPath();
      g.moveTo(-hw + 1.5, 14.2);
      g.lineTo(hw - 0.8, 14.2);
      g.lineTo(hw - 0.8, -14.2);
      g.closePath();
      g.lineWidth = 1.6;
      g.lineJoin = 'miter';
      g.strokeStyle = css(rgb);
      g.stroke();
    },
    slab(g, rgb) {
      darkBody(g, -15, -15, 30, 15);
      innerGlow(g, rgb, -15, -15, 30, 15, 0.3);
      edge(g, rgb, -15, -15, 30, 15);
    },
    slabgrid(g, rgb) {
      darkBody(g, -15, -15, 30, 15);
      g.lineWidth = 1;
      g.strokeStyle = rgba(rgb, 0.45);
      g.beginPath();
      g.moveTo(0, -12); g.lineTo(0, -3);
      g.stroke();
      edge(g, rgb, -15, -15, 30, 15);
    },
    spike(g, rgb) {
      tri(g, -14, 15, 0, -14.5, 14, 15);
      const gr = g.createLinearGradient(0, -14, 0, 15);
      gr.addColorStop(0, '#2a2a2a');
      gr.addColorStop(1, '#000');
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = 1.6;
      g.lineJoin = 'miter';
      g.strokeStyle = css(rgb);
      g.stroke();
      tri(g, -7.5, 13.5, 0, -2, 7.5, 13.5);
      g.lineWidth = 1;
      g.strokeStyle = rgba(rgb, 0.22);
      g.stroke();
    },
    spikeS(g, rgb) {
      tri(g, -10, 15, 0, 1, 10, 15);
      g.fillStyle = '#080808';
      g.fill();
      g.lineWidth = 1.5;
      g.lineJoin = 'miter';
      g.strokeStyle = css(rgb);
      g.stroke();
    },
    spikeT(g, rgb) {
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const x = -14 + i * 7;
        g.moveTo(x, 15); g.lineTo(x + 3.5, 6.5); g.lineTo(x + 7, 15);
      }
      g.fillStyle = '#080808';
      g.fill();
      g.lineWidth = 1.2;
      g.lineJoin = 'miter';
      g.strokeStyle = css(rgb);
      g.stroke();
    },
    saw(g, rgb, d) {
      const sr = d.sr || 28;
      const n = Math.max(10, Math.round(sr / 2.4));
      g.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i * Math.PI) / n;
        const r = i % 2 ? sr * 0.8 : sr;
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      const gr = g.createRadialGradient(0, 0, sr * 0.2, 0, 0, sr);
      gr.addColorStop(0, '#2b2b2b');
      gr.addColorStop(1, '#050505');
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = 1.6;
      g.lineJoin = 'miter';
      g.strokeStyle = css(rgb);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, sr * 0.5, 0, Math.PI * 2);
      g.lineWidth = 1.3;
      g.strokeStyle = rgba(rgb, 0.6);
      g.stroke();
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        g.moveTo(0, 0);
        g.lineTo(Math.cos(a) * sr * 0.5, Math.sin(a) * sr * 0.5);
      }
      g.stroke();
      g.beginPath();
      g.arc(0, 0, sr * 0.12, 0, Math.PI * 2);
      g.fillStyle = css(rgb);
      g.fill();
    },
    orb(g, rgb, d) {
      const c = hexRgb(d.c);
      const gl = g.createRadialGradient(0, 0, 6, 0, 0, 25);
      gl.addColorStop(0, rgba(c, 0.6));
      gl.addColorStop(1, rgba(c, 0));
      g.fillStyle = gl;
      g.beginPath(); g.arc(0, 0, 25, 0, Math.PI * 2); g.fill();
      const f = g.createRadialGradient(-3, -3, 1, 0, 0, 13);
      f.addColorStop(0, d.key === 'orbK' ? '#666' : css(U.shade(c, 0.6)));
      f.addColorStop(1, css(c));
      g.beginPath(); g.arc(0, 0, 12.5, 0, Math.PI * 2);
      g.fillStyle = f; g.fill();
      g.lineWidth = 2.8; g.strokeStyle = '#fff'; g.stroke();
      g.beginPath(); g.arc(0, 0, 14.4, 0, Math.PI * 2);
      g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.stroke();
      g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2);
      g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.stroke();
      g.beginPath(); g.arc(-3.5, -3.5, 3, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
    },
    orbring(g) {
      g.lineWidth = 1.8;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        const a = (i * Math.PI * 2) / 3;
        g.arc(0, 0, 18.5, a, a + 1.25);
        g.stroke();
      }
    },
    pad(g, rgb, d) {
      const c = hexRgb(d.c);
      const gl = g.createLinearGradient(0, 15, 0, -10);
      gl.addColorStop(0, rgba(c, 0.55));
      gl.addColorStop(1, rgba(c, 0));
      g.fillStyle = gl;
      g.fillRect(-12, -10, 24, 25);
      g.beginPath();
      g.moveTo(-14, 15);
      g.bezierCurveTo(-11, 7, 11, 7, 14, 15);
      g.closePath();
      g.fillStyle = css(c);
      g.fill();
      g.lineWidth = 1.2;
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.stroke();
    },
    portal(g, rgb, d) {
      const c = hexRgb(d.c);
      g.save();
      g.scale(1, 3.4);
      const gl = g.createRadialGradient(0, 0, 2, 0, 0, 14);
      gl.addColorStop(0, rgba(c, 0.5));
      gl.addColorStop(1, rgba(c, 0));
      g.fillStyle = gl;
      g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
      g.restore();
      // spiky frame
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const t = -0.85 + (i / 8) * 1.7;
        const y = Math.sin(t) * 46, x = Math.cos(t) * 12;
        g.moveTo(x + 1, y - 4); g.lineTo(x + 9, y); g.lineTo(x + 1, y + 4);
      }
      g.fillStyle = css(U.shade(c, -0.2));
      g.fill();
      g.lineWidth = 1; g.strokeStyle = '#000'; g.stroke();
      g.beginPath(); g.ellipse(0, 0, 11, 42, 0, 0, Math.PI * 2);
      g.lineWidth = 9; g.strokeStyle = 'rgba(0,0,0,0.65)'; g.stroke();
      g.lineWidth = 6; g.strokeStyle = css(c); g.stroke();
      g.lineWidth = 1.6; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.stroke();
      g.beginPath(); g.ellipse(0, 0, 7, 37, 0, 0, Math.PI * 2);
      g.lineWidth = 1; g.strokeStyle = rgba(c, 0.6); g.stroke();
      if (d.mode) {
        g.save();
        g.globalAlpha = 0.55;
        g.scale(0.42, 0.42);
        GD.Icons.draw(g, d.mode, 0, '#fff', css(c), { phase: 0 });
        g.restore();
      }
    },
    xportal(g, rgb, d) {
      ART.portal(g, rgb, Object.assign({}, d, { mode: null }));
      g.fillStyle = '#fff';
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 1.2;
      const circ = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); };
      if (d.glyph === 'dual') { circ(0, -6, 3.2); circ(0, 6, 3.2); }
      else if (d.glyph === 'single') circ(0, 0, 3.6);
      else if (d.glyph === 'tele' || d.glyph === 'teleO') {
        // a ring with an arrow: into the ring (entrance) or out of it (exit)
        g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2);
        g.lineWidth = 3.4; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
        g.lineWidth = 1.8; g.strokeStyle = '#fff'; g.stroke();
        const s = d.glyph === 'tele' ? 1 : -1;
        g.beginPath();
        g.moveTo(-3 * s, -3.5); g.lineTo(2 * s, 0); g.lineTo(-3 * s, 3.5); g.closePath();
        g.lineWidth = 1.2; g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.fill(); g.stroke();
      } else {
        g.beginPath();
        g.moveTo(-5, -6); g.lineTo(-1, -9); g.lineTo(-1, -3); g.closePath();
        g.moveTo(5, 6); g.lineTo(1, 3); g.lineTo(1, 9); g.closePath();
        g.fill(); g.stroke();
        g.fillRect(-1, -7, 6, 2); g.fillRect(-5, 5, 6, 2);
      }
    },
    gportal(g, rgb, d) {
      const c = hexRgb(d.c);
      const up = d.key === 'pGravU';
      g.save(); g.scale(1, 3.2);
      const gl = g.createRadialGradient(0, 0, 2, 0, 0, 11);
      gl.addColorStop(0, rgba(c, 0.55)); gl.addColorStop(1, rgba(c, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
      g.restore();
      g.beginPath(); g.ellipse(0, 0, 8, 36, 0, 0, Math.PI * 2);
      g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
      g.lineWidth = 4.5; g.strokeStyle = css(c); g.stroke();
      g.lineWidth = 1.3; g.strokeStyle = '#fff'; g.stroke();
      g.fillStyle = css(c);
      for (const yy of [-14, 0, 14]) {
        g.beginPath();
        if (up) { g.moveTo(-4, yy + 3); g.lineTo(0, yy - 3); g.lineTo(4, yy + 3); }
        else { g.moveTo(-4, yy - 3); g.lineTo(0, yy + 3); g.lineTo(4, yy - 3); }
        g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
      }
    },
    sportal(g, rgb, d) {
      const c = hexRgb(d.c);
      const mini = d.key === 'pMini';
      g.save(); g.scale(1, 3.2);
      const gl = g.createRadialGradient(0, 0, 2, 0, 0, 13);
      gl.addColorStop(0, rgba(c, 0.5)); gl.addColorStop(1, rgba(c, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
      g.restore();
      g.beginPath(); g.ellipse(0, 0, 12, 44, 0, 0, Math.PI * 2);
      g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.stroke();
      g.lineWidth = 5; g.strokeStyle = css(c); g.stroke();
      g.lineWidth = 1.4; g.strokeStyle = '#fff'; g.stroke();
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.85)';
      const s = mini ? 4 : 8;
      g.strokeRect(-s / 2, -s / 2, s, s);
    },
    speed(g, rgb, d) {
      const c = hexRgb(d.c);
      const n = d.spd + 1;
      const gl = g.createRadialGradient(0, 0, 2, 0, 0, 22);
      gl.addColorStop(0, rgba(c, 0.45)); gl.addColorStop(1, rgba(c, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
      const w = 7, gap = 4.5;
      const total = n * w + (n - 1) * (gap - w * 0.4);
      let x = -total / 2;
      for (let i = 0; i < n; i++) {
        g.beginPath();
        g.moveTo(x, -16); g.lineTo(x + w, -16); g.lineTo(x + w * 2, 0); g.lineTo(x + w, 16); g.lineTo(x, 16); g.lineTo(x + w, 0);
        g.closePath();
        g.fillStyle = css(c); g.fill();
        g.lineWidth = 1.4; g.strokeStyle = '#000'; g.stroke();
        g.lineWidth = 0.8; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.stroke();
        x += gap + w * 0.6;
      }
    },
    coin(g) {
      const gl = g.createRadialGradient(0, 0, 8, 0, 0, 22);
      gl.addColorStop(0, 'rgba(255,220,80,0.5)'); gl.addColorStop(1, 'rgba(255,220,80,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.fill();
      const f = g.createRadialGradient(-4, -4, 1, 0, 0, 14);
      f.addColorStop(0, '#fff8b0'); f.addColorStop(0.5, '#ffcf1f'); f.addColorStop(1, '#c98400');
      g.beginPath(); g.arc(0, 0, 13.5, 0, Math.PI * 2);
      g.fillStyle = f; g.fill();
      g.lineWidth = 1.8; g.strokeStyle = '#6b4300'; g.stroke();
      g.beginPath(); g.arc(0, 0, 9.5, 0, Math.PI * 2);
      g.lineWidth = 1.3; g.strokeStyle = 'rgba(120,70,0,0.7)'; g.stroke();
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2, r = i % 2 ? 2.8 : 6.5;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.beginPath(); g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.closePath(); g.fillStyle = '#fff4a0'; g.fill();
      g.lineWidth = 1; g.strokeStyle = '#8a5a00'; g.stroke();
    },
    grass(g, rgb) {
      g.fillStyle = rgba(rgb, 0.45);
      g.beginPath();
      const blades = [[-12, 6], [-8, 10], [-4, 5], [0, 12], [4, 7], [8, 11], [12, 5]];
      for (const [x, h] of blades) { g.moveTo(x - 2.2, 15); g.lineTo(x, 15 - h); g.lineTo(x + 2.2, 15); }
      g.fill();
    },
    ring(g, rgb) {
      g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2);
      g.lineWidth = 2.2; g.strokeStyle = rgba(rgb, 0.7); g.stroke();
      g.beginPath(); g.arc(0, 0, 5.5, 0, Math.PI * 2);
      g.lineWidth = 1.4; g.strokeStyle = rgba(rgb, 0.4); g.stroke();
    },
    arrow(g, rgb) {
      g.beginPath();
      g.moveTo(-8, -9); g.lineTo(4, 0); g.lineTo(-8, 9); g.lineTo(-8, 4); g.lineTo(-2, 0); g.lineTo(-8, -4);
      g.closePath();
      g.fillStyle = rgba(rgb, 0.55); g.fill();
      g.beginPath();
      g.moveTo(2, -9); g.lineTo(14, 0); g.lineTo(2, 9); g.lineTo(2, 4); g.lineTo(8, 0); g.lineTo(2, -4);
      g.closePath(); g.fill();
    },
    chain(g, rgb) {
      g.lineWidth = 2; g.strokeStyle = rgba(rgb, 0.5);
      for (let y = -15; y < 15; y += 10) {
        g.beginPath(); g.ellipse(0, y + 5, 3, 5.5, 0, 0, Math.PI * 2); g.stroke();
      }
    },
    dots(g, rgb) {
      for (const [x, y, r] of [[-8, 3, 2.5], [0, -4, 3.2], [8, 4, 2.2]]) {
        const gl = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
        gl.addColorStop(0, rgba(rgb, 0.9)); gl.addColorStop(1, rgba(rgb, 0));
        g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 2.4, 0, Math.PI * 2); g.fill();
      }
    },
    glow(g, rgb) {
      const gl = g.createRadialGradient(0, 0, 0, 0, 0, 42);
      gl.addColorStop(0, rgba(rgb, 0.4)); gl.addColorStop(1, rgba(rgb, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 42, 0, Math.PI * 2); g.fill();
    },
    fakespike(g, rgb) {
      tri(g, -14, 15, 0, -14, 14, 15);
      g.fillStyle = rgba([0, 0, 0], 0.35); g.fill();
      g.lineWidth = 1.3; g.strokeStyle = rgba(rgb, 0.4); g.stroke();
    },
    cloud(g, rgb) {
      g.fillStyle = rgba(rgb, 0.22);
      g.beginPath();
      g.arc(-14, 6, 10, 0, Math.PI * 2); g.arc(0, -2, 15, 0, Math.PI * 2); g.arc(15, 6, 10, 0, Math.PI * 2);
      g.rect(-14, 6, 29, 10);
      g.fill();
    },
    pillar(g, rgb) {
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.fillRect(-9, -15, 18, 30);
      g.fillStyle = rgba(rgb, 0.18);
      g.fillRect(-9, -15, 2, 30); g.fillRect(7, -15, 2, 30);
    },
    diamond(g, rgb) {
      g.beginPath(); g.moveTo(0, -11); g.lineTo(11, 0); g.lineTo(0, 11); g.lineTo(-11, 0); g.closePath();
      g.fillStyle = rgba(rgb, 0.15); g.fill();
      g.lineWidth = 1.8; g.strokeStyle = rgba(rgb, 0.65); g.stroke();
    },
    startpos(g) {
      g.setLineDash([3, 2]);
      g.lineWidth = 1.5; g.strokeStyle = '#7dff5a';
      g.strokeRect(-13, -13, 26, 26);
      g.setLineDash([]);
      g.beginPath(); g.moveTo(-5, -8); g.lineTo(8, 0); g.lineTo(-5, 8); g.closePath();
      g.fillStyle = '#7dff5a'; g.fill();
    },
    trigger(g, rgb, d) {
      g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2);
      g.fillStyle = 'rgba(20,20,30,0.85)'; g.fill();
      g.lineWidth = 1.6; g.strokeStyle = '#9fe8ff'; g.stroke();
      g.fillStyle = '#fff';
      g.font = '7px ' + FONT;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(d.label || 'T', 0, 0.5);
    },
  };

  const SPRITE_SIZE = {
    saw: (d) => (d.sr || 28) * 2 + 6, slopeL: () => 66, orb: () => 54, orbring: () => 42, portal: () => 104, gportal: () => 84,
    sportal: () => 100, xportal: () => 104, speed: () => 52, coin: () => 48, glow: () => 88, cloud: () => 56,
  };

  // --------------------------------------------------------------------------- renderer
  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.sprites = new Map();
      this.parts = [];
      this.rings = [];
      this.cam = { x: 0, y: -90 };
      this.zoom = 1;
      this.m = 1; // horizontal mirror factor (-1 = mirrored), animated by the game
      this.resize();
    }

    resize(w, h) {
      // low detail mode renders at CSS resolution (much cheaper on high-density phone screens)
      const dpr = Math.min(root.devicePixelRatio || 1, this.lowDetail ? 1 : 2);
      const cw = w || root.innerWidth || 960, ch = h || root.innerHeight || 540;
      this.cv.width = Math.round(cw * dpr);
      this.cv.height = Math.round(ch * dpr);
      if (this.cv.style) { this.cv.style.width = cw + 'px'; this.cv.style.height = ch + 'px'; }
      this.W = this.cv.width;
      this.H = this.cv.height;
      this.dpr = dpr;
      this.setZoom(this.zoom);
    }

    setZoom(z) {
      this.zoom = z;
      // fit 320 units vertically, but never show less than ~15 blocks horizontally (portrait phones)
      this.hs = Math.min(this.H / 320, this.W / 440);
      this.S = this.hs * z;
      this.VW = this.W / this.S;
      this.VH = this.H / this.S;
      if (this.S !== this.lastS) {
        this.sprites.clear();
        this.lastS = this.S;
        this.bgTiles = null;
        this.gTiles = null;
      }
    }

    /** Lowest camera y for ground-based modes (more ground visible on tall screens). */
    groundCam() { return this.VH > 400 ? -this.VH * 0.3 : -90; }

    sx(x) {
      const X = (x - this.cam.x) * this.S;
      return this.m === 1 ? X : this.W / 2 + (X - this.W / 2) * this.m;
    }
    /** Apply the mirror transform for screen-space drawing (background, ground). */
    mirrorOn() {
      if (this.m === 1) return;
      const m = Math.abs(this.m) < 0.04 ? (this.m < 0 ? -0.04 : 0.04) : this.m; // avoid a degenerate transform mid-flip
      this.ctx.setTransform(m, 0, 0, 1, (this.W / 2) * (1 - m), 0);
    }
    mirrorOff() {
      if (this.m !== 1) this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    /** Horizontal range (in mirrored local coordinates) that covers the whole screen. */
    mirrorSpan() {
      const k = Math.max(0.04, Math.abs(this.m));
      return k >= 1 ? [0, this.W] : [this.W / 2 - this.W / 2 / k, this.W / 2 + this.W / 2 / k];
    }
    sy(y) { return this.H - (y - this.cam.y) * this.S; }

    sprite(key, size, fn) {
      let sp = this.sprites.get(key);
      if (sp) return sp;
      const px = Math.ceil(size * this.S) + 2;
      const c = makeCanvas(px, px);
      const g = c.getContext('2d');
      g.translate(px / 2, px / 2);
      g.scale(this.S, this.S);
      fn(g);
      sp = { c, half: px / 2 };
      if (this.sprites.size > 900) {
        let n = 0;
        for (const k of this.sprites.keys()) { this.sprites.delete(k); if (++n > 200) break; }
      }
      this.sprites.set(key, sp);
      return sp;
    }

    blit(sp, x, y, rot, sx, sy, alpha) {
      const ctx = this.ctx;
      const m = this.m;
      let X = (x - this.cam.x) * this.S;
      const Y = this.H - (y - this.cam.y) * this.S;
      if (m !== 1) X = this.W / 2 + (X - this.W / 2) * m;
      if (alpha != null && alpha < 1) ctx.globalAlpha = alpha;
      if (!rot && m === 1 && (sx == null || sx === 1) && (sy == null || sy === 1)) {
        ctx.drawImage(sp.c, X - sp.half, Y - sp.half);
      } else {
        const a = ((rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        sx = sx == null ? 1 : sx;
        sy = sy == null ? 1 : sy;
        ctx.setTransform(m * c * sx, s * sx, -m * s * sy, c * sy, X, Y);
        ctx.drawImage(sp.c, -sp.half, -sp.half);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (alpha != null && alpha < 1) ctx.globalAlpha = 1;
    }

    objSprite(d, rgb) {
      const key = d.art + '|' + d.key + '|' + (rgb ? (rgb[0] | 0) + ',' + (rgb[1] | 0) + ',' + (rgb[2] | 0) : '');
      const size = SPRITE_SIZE[d.art] ? SPRITE_SIZE[d.art](d) : 36;
      return this.sprite(key, size, (g) => ART[d.art](g, rgb || [255, 255, 255], d));
    }

    // ------------------------------------------------------------------- colours
    /** Resolve channel colours (with pulse triggers) for a frame. */
    colors(world) {
      const out = {};
      for (const ch of GD.CHANNELS) out[ch] = world.col[ch];
      if (world.pulses && world.pulses.length) {
        for (const pl of world.pulses) {
          let k;
          if (pl.t < pl.fi) k = pl.fi > 0 ? pl.t / pl.fi : 1;
          else if (pl.t < pl.fi + pl.h) k = 1;
          else k = pl.fo > 0 ? 1 - (pl.t - pl.fi - pl.h) / pl.fo : 0;
          if (out[pl.ch]) out[pl.ch] = U.mix(out[pl.ch], pl.col, U.clamp(k, 0, 1));
        }
      }
      for (const ch of GD.CHANNELS) out[ch] = out[ch].map((v) => Math.round(v / 3) * 3);
      return out;
    }

    // ------------------------------------------------------------------- background
    /** Background tile (256 units, grey-scale alpha, tinted by the bg colour underneath). */
    makeBgTile(style) {
      const res = Math.min(this.S, 2.5);
      const T = 256;
      const px = Math.round(T * res);
      const c = makeCanvas(px, px);
      const g = c.getContext('2d');
      g.scale(res, res);
      const rnd = U.rng(U.hashStr(style || 'squares'));
      const W = 'rgba(255,255,255,', B = 'rgba(0,0,0,';
      switch (style) {
        case 'stripes': {
          g.save();
          g.beginPath(); g.rect(0, 0, T, T); g.clip();
          for (let i = -T; i < T * 2; i += 64) {
            g.fillStyle = W + '0.06)';
            g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 32 - T, T); g.lineTo(i - T, T); g.closePath(); g.fill();
            g.strokeStyle = B + '0.12)'; g.lineWidth = 3;
            g.beginPath(); g.moveTo(i + 32, 0); g.lineTo(i + 32 - T, T); g.stroke();
          }
          g.restore();
          const gr = g.createLinearGradient(0, 0, 0, T);
          gr.addColorStop(0, W + '0.06)'); gr.addColorStop(1, B + '0.10)');
          g.fillStyle = gr; g.fillRect(0, 0, T, T);
          break;
        }
        case 'circles': {
          const gr = g.createLinearGradient(0, 0, 0, T);
          gr.addColorStop(0, W + '0.05)'); gr.addColorStop(1, B + '0.12)');
          g.fillStyle = gr; g.fillRect(0, 0, T, T);
          for (let i = 0; i < 7; i++) {
            const x = rnd() * T, y = rnd() * T, r = 20 + rnd() * 60;
            for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
              g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
              g.fillStyle = (i % 2 ? W + '0.05)' : B + '0.07)'); g.fill();
              g.lineWidth = 3; g.strokeStyle = (i % 2 ? W + '0.08)' : B + '0.1)'); g.stroke();
            }
          }
          break;
        }
        case 'grid': {
          const gr = g.createLinearGradient(0, 0, 0, T);
          gr.addColorStop(0, W + '0.07)'); gr.addColorStop(1, B + '0.12)');
          g.fillStyle = gr; g.fillRect(0, 0, T, T);
          for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
            const v = rnd();
            if (v < 0.18) { g.fillStyle = W + '0.06)'; g.fillRect(i * 32 + 2, j * 32 + 2, 28, 28); }
            else if (v < 0.3) { g.fillStyle = B + '0.08)'; g.fillRect(i * 32 + 2, j * 32 + 2, 28, 28); }
          }
          g.strokeStyle = B + '0.13)'; g.lineWidth = 2;
          g.beginPath();
          for (let i = 0; i <= T; i += 32) { g.moveTo(i, 0); g.lineTo(i, T); g.moveTo(0, i); g.lineTo(T, i); }
          g.stroke();
          break;
        }
        case 'tri': {
          const gr = g.createLinearGradient(0, 0, 0, T);
          gr.addColorStop(0, W + '0.06)'); gr.addColorStop(1, B + '0.12)');
          g.fillStyle = gr; g.fillRect(0, 0, T, T);
          const n = 4, w = T / n;
          for (let row = 0; row < n; row++) {
            for (let i = 0; i <= n; i++) {
              const x = i * w - (row % 2 ? w / 2 : 0), y = row * w;
              g.beginPath(); g.moveTo(x, y + w); g.lineTo(x + w / 2, y); g.lineTo(x + w, y + w); g.closePath();
              g.fillStyle = (i + row) % 2 ? W + '0.05)' : B + '0.06)'; g.fill();
              g.lineWidth = 2; g.strokeStyle = B + '0.1)'; g.stroke();
            }
          }
          break;
        }
        default: {
          const sq = 128;
          for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
              const x = i * sq, y = j * sq;
              const gr = g.createLinearGradient(0, y, 0, y + sq);
              gr.addColorStop(0, W + '0.10)');
              gr.addColorStop(0.5, W + '0.02)');
              gr.addColorStop(1, B + '0.16)');
              g.fillStyle = gr;
              g.fillRect(x, y, sq, sq);
              g.lineWidth = 3;
              g.strokeStyle = B + '0.16)';
              g.strokeRect(x + 1.5, y + 1.5, sq - 3, sq - 3);
              g.lineWidth = 1.5;
              g.strokeStyle = W + '0.07)';
              g.strokeRect(x + 6, y + 6, sq - 12, sq - 12);
            }
          }
          g.fillStyle = B + '0.08)';
          g.fillRect(16, 144, 48, 48);
          g.fillRect(176, 24, 56, 56);
          g.fillStyle = W + '0.05)';
          g.fillRect(150, 160, 70, 70);
          g.fillRect(30, 30, 40, 40);
        }
      }
      return { c, T, res };
    }

    drawBg(cols, cam, layerShift, style) {
      const ctx = this.ctx;
      ctx.fillStyle = css(cols.bg);
      ctx.fillRect(0, 0, this.W, this.H);
      if (this.lowDetail) return;
      this.mirrorOn();
      const key = style || 'squares';
      if (!this.bgTiles) this.bgTiles = {};
      const t = this.bgTiles[key] || (this.bgTiles[key] = this.makeBgTile(key));
      const tw = Math.max(8, Math.round(t.T * this.S * 1.25));
      const ox = -Math.round(((cam.x * 0.12 + (layerShift || 0)) * this.S) % tw);
      const oy = Math.round(((cam.y + 90) * 0.06 * this.S) % tw);
      const [xa, xb] = this.mirrorSpan();
      // (while the flip squeezes the screen to a sliver, the plain colour is enough)
      if (Math.abs(this.m) >= 0.15) for (let x = ox - tw - Math.ceil(Math.max(0, -xa) / tw) * tw; x < xb; x += tw) {
        for (let y = this.H - tw + oy; y > -tw; y -= tw) {
          ctx.drawImage(t.c, x, y, tw, tw);
        }
      }
      this.mirrorOff();
    }

    makeGroundTile(style) {
      const res = Math.min(this.S, 3);
      const T = 120;
      const px = Math.round(T * res);
      const c = makeCanvas(px, px);
      const g = c.getContext('2d');
      g.scale(res, res);
      if (style === 'tiles') {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const x = i * 30, y = j * 30;
            const gr = g.createLinearGradient(0, y, 0, y + 30);
            gr.addColorStop(0, (i + j) % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)');
            gr.addColorStop(1, 'rgba(0,0,0,0.16)');
            g.fillStyle = gr;
            g.fillRect(x, y, 30, 30);
            g.lineWidth = 1.5;
            g.strokeStyle = 'rgba(0,0,0,0.25)';
            g.strokeRect(x + 0.75, y + 0.75, 28.5, 28.5);
          }
        }
      } else if (style === 'stripes') {
        const gr = g.createLinearGradient(0, 0, 0, T);
        gr.addColorStop(0, 'rgba(255,255,255,0.08)');
        gr.addColorStop(1, 'rgba(0,0,0,0.2)');
        g.fillStyle = gr;
        g.fillRect(0, 0, T, T);
        g.save();
        g.beginPath(); g.rect(0, 0, T, T); g.clip();
        g.fillStyle = 'rgba(0,0,0,0.14)';
        for (let i = -T; i < T * 2; i += 40) {
          g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 20, 0); g.lineTo(i + 20 - T, T); g.lineTo(i - T, T); g.closePath(); g.fill();
        }
        g.restore();
      } else {
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            const x = i * 60, y = j * 60;
            const gr = g.createLinearGradient(0, y, 0, y + 60);
            gr.addColorStop(0, 'rgba(255,255,255,0.10)');
            gr.addColorStop(1, 'rgba(0,0,0,0.18)');
            g.fillStyle = gr;
            g.fillRect(x, y, 60, 60);
            g.lineWidth = 2;
            g.strokeStyle = 'rgba(0,0,0,0.22)';
            g.strokeRect(x + 1, y + 1, 58, 58);
            g.lineWidth = 1;
            g.strokeStyle = 'rgba(255,255,255,0.08)';
            g.strokeRect(x + 4, y + 4, 52, 52);
          }
        }
      }
      return { c, T, res };
    }

    /** Draws ground band below y=floor (or ceiling band above y=ceil if top=true). */
    drawGround(cols, cam, y, top, pulse, style) {
      const ctx = this.ctx;
      const lineY = this.H - (y - cam.y) * this.S;
      if (!top && lineY > this.H + 2) return;
      if (top && lineY < -2) return;
      const key = style || 'squares';
      if (!this.gTiles) this.gTiles = {};
      const t = this.gTiles[key] || (this.gTiles[key] = this.makeGroundTile(key));
      const tw = Math.max(8, Math.round(t.T * this.S));
      const y0 = top ? Math.min(lineY, this.H) : Math.max(lineY, 0);
      ctx.save();
      this.mirrorOn();
      // during the mirror flip animation the transform squeezes the screen: cover the full width anyway
      const [xa, xb] = this.mirrorSpan();
      ctx.beginPath();
      if (top) ctx.rect(xa, 0, xb - xa, y0);
      else ctx.rect(xa, y0, xb - xa, this.H - y0);
      ctx.clip();
      ctx.fillStyle = css(cols.g);
      ctx.fillRect(xa, 0, xb - xa, this.H);
      const ox = -Math.round((cam.x * this.S) % tw);
      const x0 = ox - tw - Math.ceil(Math.max(0, -xa) / tw) * tw;
      const ly = Math.round(lineY);
      if (Math.abs(this.m) < 0.15) {
        // squeezed to a sliver mid-flip: plain colour only
      } else if (top) {
        for (let x = x0; x < xb; x += tw) for (let yy = ly - tw; yy > -tw; yy -= tw) ctx.drawImage(t.c, x, yy, tw, tw);
      } else {
        for (let x = x0; x < xb; x += tw) for (let yy = ly; yy < this.H; yy += tw) ctx.drawImage(t.c, x, yy, tw, tw);
      }
      const sh = ctx.createLinearGradient(0, lineY, 0, lineY + (top ? -1 : 1) * 40 * this.S);
      sh.addColorStop(0, 'rgba(0,0,0,0.35)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(xa, top ? lineY - 40 * this.S : lineY, xb - xa, 40 * this.S);
      ctx.restore();
      // line with faded ends
      const lc = cols.line;
      const a = 0.85 + (pulse || 0) * 0.15;
      const gr = ctx.createLinearGradient(0, 0, this.W, 0);
      gr.addColorStop(0, rgba(lc, 0));
      gr.addColorStop(0.2, rgba(lc, a));
      gr.addColorStop(0.8, rgba(lc, a));
      gr.addColorStop(1, rgba(lc, 0));
      ctx.fillStyle = gr;
      const lw = Math.max(1, 1.3 * this.S);
      ctx.fillRect(0, lineY - lw / 2, this.W, lw);
      const glow = ctx.createLinearGradient(0, lineY, 0, lineY + (top ? 1 : -1) * 6 * this.S);
      glow.addColorStop(0, rgba(lc, 0.25 + (pulse || 0) * 0.2));
      glow.addColorStop(1, rgba(lc, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, top ? lineY : lineY - 6 * this.S, this.W, 6 * this.S);
    }

    // ------------------------------------------------------------------- objects
    visibleRange(list, cam, margin) {
      const x0 = cam.x - margin, x1 = cam.x + this.VW + margin;
      let lo = 0, hi = list.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (list[m].x < x0) lo = m + 1; else hi = m;
      }
      let end = lo;
      while (end < list.length && list[end].x <= x1) end++;
      return [lo, end];
    }

    drawObject(o, d, cols, time, pulse, alpha, used) {
      const ch = o.c || d.col;
      const rgb = ch === 'none' ? null : cols[ch] || cols.obj;
      const x = o.x + (o.ox || 0), y = o.y + (o.oy || 0);
      const s = o.s || 1;
      const sx = (o.fx ? -1 : 1) * s, sy = (o.fy ? -1 : 1) * s;
      switch (d.art) {
        case 'saw': {
          const sp = this.objSprite(d, rgb);
          this.blit(sp, x, y, (o.r || 0) + time * 360 * (d.key === 'sawS' ? 1.6 : 1), sx, sy, alpha);
          break;
        }
        case 'orb': {
          const sp = this.objSprite(d, null);
          const k = 1 + pulse * 0.12;
          this.blit(sp, x, y, 0, k * s, k * s, alpha);
          const ring = this.sprite('orbring', 42, ART.orbring);
          this.blit(ring, x, y, time * 120, s, s, alpha * (used ? 0.4 : 0.85));
          break;
        }
        case 'coin': {
          const sp = this.objSprite(d, null);
          const k = Math.cos(time * 3.2 + o.x * 0.01);
          this.blit(sp, x, y + Math.sin(time * 2.4) * 1.5, 0, Math.max(0.12, Math.abs(k)) * s, s, alpha);
          break;
        }
        case 'ring':
        case 'dots': {
          const sp = this.objSprite(d, rgb);
          const k = 1 + pulse * 0.35;
          this.blit(sp, x, y, o.r || 0, sx * k, sy * k, alpha);
          break;
        }
        case 'portal':
        case 'gportal':
        case 'sportal':
        case 'xportal':
        case 'speed': {
          const sp = this.objSprite(d, null);
          this.blit(sp, x, y, o.r || 0, sx, sy, alpha);
          break;
        }
        default: {
          const sp = this.objSprite(d, rgb);
          this.blit(sp, x, y, o.r || 0, sx, sy, alpha);
        }
      }
    }

    drawWorldObjects(world, cols, time, pulse) {
      const [a, b] = this.visibleRange(world.rlist, this.cam, world.maxVR + 10);
      const layers = [[], [], [], []];
      const pushObj = (o) => {
        if (o.g && world.hidden[o.g]) return;
        const k = o.kind;
        if (k === 'deco') layers[o.z > 0 ? 3 : 0].push(o);
        else if (k === 'portal' || k === 'orb' || k === 'pad' || k === 'coin') layers[2].push(o);
        else layers[1].push(o);
      };
      for (let i = a; i < b; i++) {
        const o = world.rlist[i];
        if (!o.dyn) pushObj(o);
      }
      for (const o of world.dynAll) {
        const x = o.x + o.ox;
        if (x > this.cam.x - o.vr - 20 && x < this.cam.x + this.VW + o.vr + 20) pushObj(o);
      }
      const usedSet = world.used;
      for (let li = 0; li < 3; li++) {
        for (const o of layers[li]) {
          if (o.kind === 'coin' && world.coinsGot[o.ci]) continue;
          const al = o.g && world.alpha[o.g] != null ? world.alpha[o.g] : 1;
          if (al <= 0.01) continue;
          this.drawObject(o, o.def, cols, time, pulse, al, usedSet.indexOf(o.id) !== -1);
        }
      }
      this._front = layers[3];
    }

    drawFront(world, cols, time, pulse) {
      if (!this._front) return;
      for (const o of this._front) {
        const al = o.g && world.alpha[o.g] != null ? world.alpha[o.g] : 1;
        this.drawObject(o, o.def, cols, time, pulse, al, false);
      }
    }

    // ------------------------------------------------------------------- player
    iconSprite(mode, id, c1, c2, glow, cubeId) {
      const key = 'ic|' + mode + '|' + id + '|' + c1 + '|' + c2 + '|' + (glow ? 1 : 0) + '|' + cubeId;
      const size = mode === 'ship' || mode === 'ufo' ? 60 : 44;
      return this.sprite(key, size, (g) => {
        if (glow) {
          g.save();
          g.shadowColor = c2;
          g.shadowBlur = 6 * this.S;
          GD.Icons.draw(g, mode, id, c1, c2, { cubeId });
          g.restore();
        }
        GD.Icons.draw(g, mode, id, c1, c2, { cubeId });
      });
    }

    drawPlayer(p, ic, time, alpha) {
      const mode = p.mode;
      const id = ic[mode] || 0;
      const scale = p.mini ? 0.6 : 1;
      const flip = p.gr < 0;
      if (mode === 'robot' || mode === 'spider') {
        const ctx = this.ctx;
        const X = this.sx(p.x), Y = this.sy(p.y);
        ctx.save();
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.translate(X, Y);
        ctx.scale(this.S * scale * this.m, this.S * scale * (flip ? -1 : 1));
        if (ic.glow) { ctx.shadowColor = ic.c2; ctx.shadowBlur = 5 * this.S; }
        GD.Icons.draw(ctx, mode, id, ic.c1, ic.c2, { phase: p.x / 9, air: !p.onGround });
        ctx.restore();
        return;
      }
      const sp = this.iconSprite(mode, id, ic.c1, ic.c2, ic.glow, ic.cube || 0);
      let rot = p.rot || 0;
      let sy = scale * (flip && mode !== 'cube' && mode !== 'ball' ? -1 : 1);
      if (mode === 'ufo') rot = 0;
      this.blit(sp, p.x, p.y, rot, scale, sy, alpha);
    }

    drawTrail(trail, color, width, alpha) {
      if (!trail || trail.length < 2) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.sx(trail[0][0]), this.sy(trail[0][1]));
      for (let i = 1; i < trail.length; i++) ctx.lineTo(this.sx(trail[i][0]), this.sy(trail[i][1]));
      ctx.globalAlpha = alpha == null ? 1 : alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * this.S;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = width * 0.35 * this.S;
      ctx.stroke();
      ctx.restore();
    }

    // ------------------------------------------------------------------- particles
    spawn(x, y, vx, vy, life, size, color, opts) {
      if (this.parts.length > 1200) return;
      if (this.lowDetail && Math.random() < 0.7) return;
      const o = opts || {};
      this.parts.push({
        x, y, vx, vy, life, t: 0, size, color, g: o.g || 0, shape: o.shape || 'sq',
        rot: o.rot || Math.random() * 360, vr: o.vr || 0, add: !!o.add, drag: o.drag || 0, grow: o.grow || 0,
      });
    }

    ring(x, y, r0, r1, dur, color, lw, fill) {
      this.rings.push({ x, y, r0, r1, d: dur, t: 0, color, lw: lw || 2, fill: !!fill });
    }

    burst(x, y, n, color, speed, life, size, opts) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
        this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), color, opts);
      }
    }

    updateParticles(dt) {
      const ps = this.parts;
      let j = 0;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.t += dt;
        if (p.t >= p.life) continue;
        p.vy += p.g * dt;
        if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ps[j++] = p;
      }
      ps.length = j;
      const rs = this.rings;
      j = 0;
      for (let i = 0; i < rs.length; i++) {
        rs[i].t += dt;
        if (rs[i].t < rs[i].d) rs[j++] = rs[i];
      }
      rs.length = j;
    }

    drawParticles() {
      const ctx = this.ctx;
      for (const r of this.rings) {
        const k = r.t / r.d;
        const rad = U.lerp(r.r0, r.r1, U.ease.out(k)) * this.S;
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(this.sx(r.x), this.sy(r.y), Math.max(0.5, rad), 0, Math.PI * 2);
        if (r.fill) { ctx.fillStyle = r.color; ctx.fill(); }
        else { ctx.lineWidth = r.lw * this.S * (1 - k * 0.5); ctx.strokeStyle = r.color; ctx.stroke(); }
      }
      let add = false;
      for (const p of this.parts) {
        const k = p.t / p.life;
        if (p.add !== add) { ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over'; add = p.add; }
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = p.color;
        const s = Math.max(0.3, p.size * (1 - k * 0.6 + p.grow * k)) * this.S;
        const X = this.sx(p.x), Y = this.sy(p.y);
        if (p.shape === 'ci') {
          ctx.beginPath();
          ctx.arc(X, Y, s / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const a = (p.rot * Math.PI) / 180;
          const c = Math.cos(a), si = Math.sin(a);
          ctx.setTransform(c, si, -si, c, X, Y);
          ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------------- text + hud
    text(str, x, y, size, opts) {
      const ctx = this.ctx;
      const o = opts || {};
      ctx.font = (o.weight || '') + ' ' + Math.round(size) + 'px ' + FONT;
      ctx.textAlign = o.align || 'center';
      ctx.textBaseline = o.base || 'middle';
      ctx.lineJoin = 'round';
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      if (o.stroke !== false) {
        ctx.lineWidth = Math.max(2, size * 0.16);
        ctx.strokeStyle = o.stroke || '#000';
        ctx.strokeText(str, x, y);
      }
      if (o.gold) {
        const gr = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
        gr.addColorStop(0, '#fff9b5');
        gr.addColorStop(0.45, '#ffd23a');
        gr.addColorStop(1, '#ff9a1a');
        ctx.fillStyle = gr;
      } else ctx.fillStyle = o.color || '#fff';
      ctx.fillText(str, x, y);
      ctx.globalAlpha = 1;
    }

    worldText(str, x, y, size, opts) {
      this.text(str, this.sx(x), this.sy(y), size * this.S, opts);
    }

    progressBar(pct, showBar, showPct) {
      const ctx = this.ctx;
      const s = this.hs;
      const bw = Math.min(this.W * 0.42, 260 * s);
      const bh = 8 * s;
      const x = (this.W - bw) / 2, y = 7 * s;
      if (showBar) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, x, y, bw, bh, bh / 2);
        ctx.fill();
        if (pct > 0) {
          const gr = ctx.createLinearGradient(0, y, 0, y + bh);
          gr.addColorStop(0, '#b6ff8a');
          gr.addColorStop(1, '#3fd42a');
          ctx.fillStyle = gr;
          roundRect(ctx, x + 1.5 * s, y + 1.5 * s, Math.max(bh - 3 * s, (bw - 3 * s) * pct), bh - 3 * s, (bh - 3 * s) / 2);
          ctx.fill();
        }
        ctx.lineWidth = 1.5 * s;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        roundRect(ctx, x, y, bw, bh, bh / 2);
        ctx.stroke();
      }
      if (showPct) {
        const txt = Math.floor(pct * 100) + '%';
        if (showBar) this.text(txt, x + bw + 8 * s, y + bh / 2 + 0.5 * s, 13 * s, { align: 'left' });
        else this.text(txt, this.W / 2, y + bh / 2 + 1 * s, 14 * s);
      }
    }

    clear(color) {
      this.ctx.fillStyle = color || '#000';
      this.ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  GD.roundRect = roundRect;
  GD.ART = ART;
  GD.SPRITE_SIZE = SPRITE_SIZE;
  GD.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
