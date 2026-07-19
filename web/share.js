/* =========================================================================
   Hi-Lo Royale — share / ghost layer (W4)
   window.HiLoShare  (browser)  +  module.exports (node, for tests)

   Ghost payload binary format v1 (then base64url, no padding):
     [0]      version byte        = 0x01
     [1]      flags               bit0 = fixtureId is numeric
     fixture  varint              if numeric (value <= 2^28-1)
              OR len byte + ascii if not (charset [A-Za-z0-9_-], max 32)
     name     len byte (1..16) + ascii bytes (charset [A-Za-z0-9_-])
     streak   varint
     outlived varint
     count    varint (max 64 picks)
     per pick:
       n      varint (round number, 0..16383)
       v      varint = bucket*4 + code
              bucket = round(msLeft / 50), clamped 0..16383  (50 ms grid)
              code   = 0 null | 1 'hi' | 2 'lo'   (3 = invalid -> reject)
   Round-trips exactly modulo the 50 ms msLeft quantisation (values already
   on the 50 ms grid round-trip bit-exactly). Typical 12-round run with a
   16-char name encodes to ~84 chars, well under the 120-char budget.
   ========================================================================= */
(function (global) {
  'use strict';

  var VERSION = 1;
  var DEFAULT_BASE = 'https://hilo-royale.vercel.app';
  var NAME_RE = /[^A-Za-z0-9_-]/g;
  var NAME_OK = /^[A-Za-z0-9_-]+$/;
  var MAX_PICKS = 64;
  var MAX_N = 16383;
  var MAX_BUCKET = 16383;
  var MAX_VARINT = 268435455; // 2^28 - 1 (encode-side cap)

  /* ---------------- base64url (dependency-free, browser + node) --------- */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var B64REV = (function () {
    var m = {};
    for (var i = 0; i < 64; i++) m[B64.charCodeAt(i)] = i;
    return m;
  })();

  function bytesToB64u(bytes) {
    var out = '', i, n;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rem = bytes.length - i;
    if (rem === 1) {
      n = bytes[i] << 16;
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    } else if (rem === 2) {
      n = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63];
    }
    return out;
  }

  function b64uToBytes(s) {
    if (typeof s !== 'string') return null;
    s = s.replace(/=+$/, '');
    if (s.length < 2 || s.length > 4096) return null;
    var out = [], buffer = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64REV[s.charCodeAt(i)];
      if (v === undefined) return null;
      buffer = (buffer << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buffer >> bits) & 0xff);
      }
    }
    return out;
  }

  /* ---------------- varint (LEB128, unsigned) --------------------------- */
  function pushVarint(bytes, value) {
    var v = Math.floor(Number(value));
    if (!isFinite(v) || v < 0) v = 0;
    if (v > MAX_VARINT) v = MAX_VARINT;
    do {
      var b = v & 0x7f;
      v = Math.floor(v / 128);
      if (v > 0) b |= 0x80;
      bytes.push(b);
    } while (v > 0);
  }

  function readVarint(bytes, pos) {
    var v = 0, shift = 0, b;
    for (;;) {
      if (pos >= bytes.length) throw new Error('varint: truncated');
      b = bytes[pos++];
      if (shift === 28 && (b & 0xf0) !== 0) throw new Error('varint: overflow');
      v += (b & 0x7f) * Math.pow(2, shift);
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 28) throw new Error('varint: too long');
    }
    return { v: v, pos: pos };
  }

  /* ---------------- helpers --------------------------------------------- */
  function sanitizeName(name) {
    var s = String(name == null ? '' : name).replace(NAME_RE, '').slice(0, 16);
    return s.length ? s : 'FAN';
  }

  function pickCode(p) {
    if (p === 'hi') return 1;
    if (p === 'lo') return 2;
    return 0; // null / anything else
  }

  function codePick(c) {
    if (c === 1) return 'hi';
    if (c === 2) return 'lo';
    return null;
  }

  function msBucket(ms) {
    var v = Math.round(Number(ms) / 50);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > MAX_BUCKET) v = MAX_BUCKET;
    return v;
  }

  function pushAscii(bytes, str) {
    for (var i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) & 0x7f);
  }

  /* ---------------- encodeGhost ----------------------------------------- */
  function encodeGhost(run) {
    run = run || {};
    var bytes = [VERSION];

    var fixRaw = String(run.fixtureId == null ? '' : run.fixtureId);
    var fixNum = /^\d{1,9}$/.test(fixRaw) && Number(fixRaw) <= MAX_VARINT;
    var flags = fixNum ? 1 : 0;
    bytes.push(flags);

    if (fixNum) {
      pushVarint(bytes, Number(fixRaw));
    } else {
      var fixStr = fixRaw.replace(NAME_RE, '').slice(0, 32);
      bytes.push(fixStr.length);
      pushAscii(bytes, fixStr);
    }

    var name = sanitizeName(run.name);
    bytes.push(name.length);
    pushAscii(bytes, name);

    pushVarint(bytes, run.streak);
    pushVarint(bytes, run.outlived);

    var picks = Array.isArray(run.picks) ? run.picks.slice(0, MAX_PICKS) : [];
    pushVarint(bytes, picks.length);
    for (var i = 0; i < picks.length; i++) {
      var p = picks[i] || {};
      var n = Math.floor(Number(p.n));
      if (!isFinite(n) || n < 0) n = 0;
      if (n > MAX_N) n = MAX_N;
      pushVarint(bytes, n);
      pushVarint(bytes, msBucket(p.msLeft) * 4 + pickCode(p.pick));
    }

    return bytesToB64u(bytes);
  }

  /* ---------------- decode (strict, throw -> null at callers) ----------- */
  function decodePayload(payload) {
    try {
      var bytes = b64uToBytes(payload);
      if (!bytes || bytes.length < 6) return null;
      var pos = 0;

      if (bytes[pos++] !== VERSION) return null;
      var flags = bytes[pos++];
      if (flags !== 0 && flags !== 1) return null;

      var fixtureId, r, i;
      if (flags === 1) {
        r = readVarint(bytes, pos); pos = r.pos;
        fixtureId = String(r.v);
      } else {
        if (pos >= bytes.length) return null;
        var flen = bytes[pos++];
        if (flen > 32 || pos + flen > bytes.length) return null;
        fixtureId = '';
        for (i = 0; i < flen; i++) fixtureId += String.fromCharCode(bytes[pos++]);
        if (flen > 0 && !NAME_OK.test(fixtureId)) return null;
      }

      if (pos >= bytes.length) return null;
      var nlen = bytes[pos++];
      if (nlen < 1 || nlen > 16 || pos + nlen > bytes.length) return null;
      var name = '';
      for (i = 0; i < nlen; i++) name += String.fromCharCode(bytes[pos++]);
      if (!NAME_OK.test(name)) return null;

      r = readVarint(bytes, pos); pos = r.pos;
      var streak = Math.min(r.v, MAX_VARINT);
      r = readVarint(bytes, pos); pos = r.pos;
      var outlived = Math.min(r.v, MAX_VARINT);

      r = readVarint(bytes, pos); pos = r.pos;
      var count = r.v;
      if (count > MAX_PICKS) return null;

      var picks = [];
      for (i = 0; i < count; i++) {
        r = readVarint(bytes, pos); pos = r.pos;
        var n = r.v;
        if (n > MAX_N) return null;
        r = readVarint(bytes, pos); pos = r.pos;
        var code = r.v % 4;
        var bucket = Math.floor(r.v / 4);
        if (code === 3 || bucket > MAX_BUCKET) return null;
        picks.push({ n: n, pick: codePick(code), msLeft: bucket * 50 });
      }

      if (pos !== bytes.length) return null; // trailing garbage -> reject

      return { fixtureId: fixtureId, name: name, picks: picks, streak: streak, outlived: outlived };
    } catch (e) {
      return null;
    }
  }

  /* ---------------- ghostUrl -------------------------------------------- */
  function ghostUrl(payload, base) {
    var origin = DEFAULT_BASE;
    if (base) {
      if (typeof base === 'string') origin = base;
      else if (base.origin) origin = base.origin + (base.pathname && base.pathname !== '/' ? base.pathname : '');
      else if (base.href) origin = String(base.href);
    } else if (typeof location !== 'undefined' && location && location.origin && location.origin !== 'null') {
      origin = location.origin;
    }
    origin = String(origin).replace(/[?#].*$/, '').replace(/\/+$/, '');

    var p = String(payload == null ? '' : payload);
    var decoded = decodePayload(p);
    var q = '';
    if (decoded && decoded.fixtureId) {
      q += 'fixture=' + encodeURIComponent(decoded.fixtureId) + '&';
      /* Dual-format bridge: web prefers the compact binary ghost payload;
         iOS can replay the same run from the readable h/l/x fallback. */
      q += 'p=' + decoded.picks.map(function (r) { return r.pick === 'hi' ? 'h' : r.pick === 'lo' ? 'l' : 'x'; }).join('') + '&';
      q += 'streak=' + decoded.streak + '&outlived=' + decoded.outlived + '&challenger=' + encodeURIComponent(decoded.name) + '&';
    }
    q += 'ghost=' + p;
    // Land directly in the arena. /play preserves the payload through the
    // guest-login redirect; the landing page previously dropped it.
    return origin + '/play?' + q;
  }

  /* ---------------- parseGhost (hostile-input tolerant) ------------------ */
  function parseGhost(searchString) {
    try {
      if (typeof searchString !== 'string' || !searchString.length) return null;
      var s = searchString.length > 8192 ? searchString.slice(0, 8192) : searchString;
      var qi = s.indexOf('?');
      if (qi >= 0) s = s.slice(qi + 1);
      var hi = s.indexOf('#');
      if (hi >= 0) s = s.slice(0, hi);

      var value = null;
      var parts = s.split('&');
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].slice(0, 6) === 'ghost=') { value = parts[i].slice(6); break; }
      }
      if (value === null && /^[A-Za-z0-9_-]{8,}$/.test(s)) value = s; // bare payload
      if (value === null || value.length === 0 || value.length > 4096) return null;

      try { value = decodeURIComponent(value); } catch (e) { /* keep raw */ }
      return decodePayload(value);
    } catch (e) {
      return null;
    }
  }

  /* ---------------- caption bank (deterministic, no emojis) ------------- */
  var WIN_BANK = [
    'Last fan standing in {lobby}. {o} fans fell and the crown landed on me.',
    'Streak {s}, {o} eliminated, one crown. The stats never touched me.',
    'The crowd kept dying and I kept calling it. Crown secured in {lobby}.',
    '100 fans entered {lobby}. One walked out wearing the crown. It was me.'
  ];
  var NEAR_BANK = [
    'Locked with {nd} on the clock, survived, then died the very next round. This game is evil.',
    'Died on a corner count with {nd} left. Streak {s}. I want revenge.',
    '{nd} on the clock when I locked my last call. Outlived {o} of 99 fans anyway.'
  ];
  var LOSS_BANK = [
    'Outlived {o} of 99 fans in {lobby} and still lost. Running it back.',
    'The crowd was wrong. So was I. Gone at streak {s}.',
    'Survived {s} straight windows, then one cursed stat count ended me.',
    'Dead at streak {s} in {lobby}. {o} fans fell before me and it still stings.'
  ];
  var HOOKS = [
    'Can you outlive me?',
    'Think you can outlive me?',
    'Your move: outlive me.',
    'Outlive me if you can.'
  ];

  function fnv(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = ((h * 16777619) >>> 0);
    }
    return h >>> 0;
  }

  function fmtNearDeath(x) {
    var sec = 0.8;
    if (typeof x === 'number' && isFinite(x) && x > 0) sec = x < 10 ? x : x / 1000;
    return (Math.round(sec * 10) / 10).toFixed(1) + 's';
  }

  function caption(opts, seedArg) {
    opts = opts || {};
    var seed = seedArg != null ? seedArg
      : (opts.seed != null ? opts.seed
        : String(opts.won) + '|' + opts.streak + '|' + opts.outlived + '|' + opts.lobbyId);
    var h = fnv('hilo:' + String(seed));

    var bank = opts.won ? WIN_BANK : (opts.nearDeath ? NEAR_BANK : LOSS_BANK);
    var line = bank[h % bank.length];
    var hook = HOOKS[fnv('hook:' + String(seed)) % HOOKS.length];

    var s = Math.max(0, Math.floor(Number(opts.streak)) || 0);
    var o = Math.max(0, Math.floor(Number(opts.outlived)) || 0);
    var lobby = opts.lobbyId != null && String(opts.lobbyId).length
      ? 'lobby ' + String(opts.lobbyId) : 'the arena';

    line = line
      .replace(/\{s\}/g, String(s))
      .replace(/\{o\}/g, String(o))
      .replace(/\{lobby\}/g, lobby)
      .replace(/\{nd\}/g, fmtNearDeath(opts.nearDeath));

    return line + ' ' + hook;
  }

  /* ---------------- share ------------------------------------------------ */
  function share(opts) {
    opts = opts || {};
    var text = String(opts.text || '');
    var url = opts.url ? String(opts.url) : '';

    if (typeof navigator === 'undefined' || !navigator) return Promise.resolve('unsupported');

    var run = function () {
      var data = { title: 'Hi-Lo Royale', text: text };
      if (url) data.url = url;

      var tryNativeText = function () {
        if (typeof navigator.share === 'function') {
          return navigator.share(data).then(
            function () { return 'share'; },
            function (e) {
              if (e && e.name === 'AbortError') return 'cancelled';
              return tryClipboard();
            }
          );
        }
        return tryClipboard();
      };

      var tryClipboard = function () {
        var clip = (text + (url ? ' ' + url : '')).trim();
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          return navigator.clipboard.writeText(clip).then(
            function () { return 'clipboard'; },
            function () { return legacyCopy(clip); }
          );
        }
        return Promise.resolve(legacyCopy(clip));
      };

      var legacyCopy = function (clip) {
        try {
          if (typeof document === 'undefined' || !document.execCommand || !document.body) return 'unsupported';
          var ta = document.createElement('textarea');
          ta.value = clip;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok ? 'clipboard-legacy' : 'unsupported';
        } catch (e) {
          return 'unsupported';
        }
      };

      if (opts.file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
        /* Some mobile share sheets omit the separate URL field when files are
           attached, so keep the challenge clickable by including it in text. */
        var withFiles = { files: [opts.file], title: 'Hi-Lo Royale', text: (text + (url ? ' ' + url : '')).trim() };
        var can = false;
        try { can = navigator.canShare(withFiles); } catch (e) { can = false; }
        if (can) {
          return navigator.share(withFiles).then(
            function () { return 'share-files'; },
            function (e) {
              if (e && e.name === 'AbortError') return 'cancelled';
              return tryNativeText();
            }
          );
        }
      }
      return tryNativeText();
    };

    try {
      return Promise.resolve(run());
    } catch (e) {
      return Promise.resolve('unsupported');
    }
  }

  /* ---------------- export ----------------------------------------------- */
  var HiLoShare = {
    VERSION: VERSION,
    encodeGhost: encodeGhost,
    decodeGhost: decodePayload, // helper: raw payload string -> object|null
    ghostUrl: ghostUrl,
    parseGhost: parseGhost,
    caption: caption,
    share: share,
    _sanitizeName: sanitizeName  // exposed for tests
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HiLoShare;
  if (typeof window !== 'undefined') window.HiLoShare = HiLoShare;
  else if (global && !global.HiLoShare) global.HiLoShare = HiLoShare;
})(typeof globalThis !== 'undefined' ? globalThis : this);
