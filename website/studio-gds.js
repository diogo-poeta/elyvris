(function (root) {
  'use strict';

  var HEADER = 0x0002, BGNLIB = 0x0102, LIBNAME = 0x0206, UNITS = 0x0305, ENDLIB = 0x0400, BGNSTR = 0x0502, STRNAME = 0x0606,
    ENDSTR = 0x0700, BOUNDARY = 0x0800, LAYER = 0x0D02, DATATYPE = 0x0E02, XY = 0x1003, ENDEL = 0x1100;
  var MAX_POINTS = 8000;        // one XY record holds at most 8191 corners

  function int16(values) { var out = []; values.forEach(function (v) { out.push((v >> 8) & 255, v & 255); }); return out; }
  function int32(values) { var out = []; values.forEach(function (v) { out.push((v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255); }); return out; }
  function ascii(text) { var out = []; for (var i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 127); if (out.length % 2) out.push(0); return out; }
  /* GDSII's own 8-byte number: sign bit, exponent of 16 (plus 64), 56-bit fraction. */
  function real8(value) {
    if (value === 0) return [0, 0, 0, 0, 0, 0, 0, 0];
    var sign = value < 0 ? 128 : 0, v = Math.abs(value), exponent = 64, out;
    while (v >= 1) { v /= 16; exponent++; }
    while (v < 1 / 16) { v *= 16; exponent--; }
    out = [sign | exponent];
    for (var i = 0; i < 7; i++) { v *= 256; var byte = Math.floor(v); out.push(byte); v -= byte; }
    return out;
  }
  function record(type, payload) { payload = payload || []; var length = payload.length + 4; return [(length >> 8) & 255, length & 255, (type >> 8) & 255, type & 255].concat(payload); }
  function stamp(date) { var d = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()]; return int16(d.concat(d)); }
  function cellName(name) { return (String(name || 'elyvris_studio').replace(/[^A-Za-z0-9_?$]/g, '_').slice(0, 32)) || 'elyvris_studio'; }

  function write(layout, options) {
    options = options || {};
    var date = options.date || new Date(), name = cellName(options.name), bytes = [], written = 0, dropped = 0;
    function add(part) { for (var i = 0; i < part.length; i++) bytes.push(part[i]); }
    add(record(HEADER, int16([600])));
    add(record(BGNLIB, stamp(date)));
    add(record(LIBNAME, ascii('ELYVRIS')));
    add(record(UNITS, [0x3E, 0x41, 0x89, 0x37, 0x4B, 0xC6, 0xA7, 0xEF, 0x39, 0x44, 0xB8, 0x2F, 0xA0, 0x9B, 0x5A, 0x51]));
    add(record(BGNSTR, stamp(date)));
    add(record(STRNAME, ascii(name)));
    (layout.polygons || []).forEach(function (polygon) {
      var points = [];
      polygon.points.forEach(function (p) {
        var x = Math.round(p[0]), y = Math.round(p[1]), last = points[points.length - 1];
        if (!last || last[0] !== x || last[1] !== y) points.push([x, y]);
      });
      if (points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) points.pop();
      var inRange = points.every(function (p) { return Math.abs(p[0]) < 2147483647 && Math.abs(p[1]) < 2147483647; });
      if (points.length < 3 || points.length > MAX_POINTS || !inRange) { dropped++; return; }
      var flat = [];
      points.concat([points[0]]).forEach(function (p) { flat.push(p[0], p[1]); });      // a boundary repeats its first corner at the end
      add(record(BOUNDARY)); add(record(LAYER, int16([polygon.layer]))); add(record(DATATYPE, int16([polygon.datatype || 0])));
      add(record(XY, int32(flat))); add(record(ENDEL));
      written++;
    });
    add(record(ENDSTR)); add(record(ENDLIB));
    return { bytes: new Uint8Array(bytes), polygons: written, dropped: dropped, name: name };
  }

  var api = Object.freeze({ write: write, real8: real8 });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ElyvrisGds = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
