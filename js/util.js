/* Geometry Dash Web – shared helpers (works in the browser and in Node for the level solver) */
(function (root) {
  'use strict';
  const GD = (root.GD = root.GD || {});
  const U = (GD.U = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sign = (v) => (v < 0 ? -1 : 1);

  U.ease = {
    linear: (t) => t,
    in: (t) => t * t,
    out: (t) => 1 - (1 - t) * (1 - t),
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    elastic: (t) =>
      t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
    bounce: (t) => {
      const n = 7.5625, d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  // ---- colours -------------------------------------------------------------
  U.hexToRgb = (hex) => {
    if (Array.isArray(hex)) return hex.slice();
    let h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbToHex = (c) =>
    '#' + c.map((v) => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  U.rgba = (c, a) =>
    'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')';
  U.mix = (a, b, t) => [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)];
  U.shade = (c, f) => (f < 0 ? U.mix(c, [0, 0, 0], -f) : U.mix(c, [255, 255, 255], f));
  U.hsv = (h, s, v) => {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  };

  // ---- deterministic RNG -----------------------------------------------------
  U.rng = (seed) => {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.hashStr = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  // ---- storage (localStorage can throw in private mode) ---------------------
  U.store = {
    get(key, def) {
      try {
        const v = root.localStorage && root.localStorage.getItem(key);
        return v == null ? def : JSON.parse(v);
      } catch (e) {
        return def;
      }
    },
    set(key, val) {
      try {
        root.localStorage && root.localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch (e) {
        return false;
      }
    },
    del(key) {
      try {
        root.localStorage && root.localStorage.removeItem(key);
      } catch (e) { /* ignore */ }
    },
  };

  // ---- text encoding for level share codes ----------------------------------
  U.b64enc = (str) => {
    if (typeof Buffer !== 'undefined' && !root.btoa) return Buffer.from(str, 'utf8').toString('base64');
    return root.btoa(unescape(encodeURIComponent(str)));
  };
  U.b64dec = (b64) => {
    if (typeof Buffer !== 'undefined' && !root.atob) return Buffer.from(b64, 'base64').toString('utf8');
    return decodeURIComponent(escape(root.atob(b64)));
  };

  // ---- compressed share codes (deflate + base64url); pack resolves to null where unsupported
  const toB64url = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return root.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromB64url = (str) => {
    const b = root.atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  };
  U.pack = async (str) => {
    if (!root.CompressionStream || !root.Response || !root.Blob) return null;
    try {
      const s = new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return toB64url(new Uint8Array(await new Response(s).arrayBuffer()));
    } catch (e) {
      return null;
    }
  };
  U.unpack = async (b64) => {
    if (!root.DecompressionStream) throw new Error('compressed level codes are not supported by this browser');
    const s = new Blob([fromB64url(b64)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(s).text();
  };

  /** Escape text for use in HTML (element content and quoted attribute values). */
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  };
})(typeof window !== 'undefined' ? window : globalThis);
