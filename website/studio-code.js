/* Elyvris Studio — shapes <-> code.
 *
 * A design is a list of shapes. Every length is stored in nanometres (nm);
 * x, y, z is the centre of the shape and z points up.
 *
 *   toGds(shapes)        -> gdsfactory script (top view, micrometres)
 *   toMeep(shapes, opt)  -> Meep geometry list (1 Meep unit = 1 micrometre)
 *   fromGds(text)        -> shapes read from basic gdsfactory commands
 *   fromMeep(text)       -> shapes read from basic Meep geometry objects
 *
 * The readers do not run Python. They recognise a fixed set of commands
 * and report the lines they could not use.
 */
(function (root) {
  'use strict';

  var MATERIALS = [
    { id: 'si', label: 'Si', code: 'Si', lib: 'silicon-green', color: '#6f8fc4' },
    { id: 'tio2', label: 'TiO₂', code: 'TiO2', lib: 'tio2-siefke', color: '#c9a06a' },
    { id: 'sio2', label: 'SiO₂', code: 'SiO2', lib: 'silica-malitson', color: '#7fb4c9' },
    { id: 'mgf2', label: 'MgF₂', code: 'MgF2', lib: 'mgf2-rodriguez', color: '#79bfa8' },
    { id: 'au', label: 'Au', code: 'Au', lib: 'gold-johnson', color: '#e0a83c' },
    { id: 'al', label: 'Al', code: 'Al', lib: 'aluminum-rakic', color: '#aab0c0' },
    { id: 'bk7', label: 'N-BK7', code: 'BK7', lib: 'bk7-schott', color: '#9fb0d6' },
    { id: 'air', label: 'Air', code: 'mp.air', color: '#dfe5ec' },
    { id: 'custom', label: 'Custom', code: '', color: '#a38cd9' }
  ];
  var TYPES = {
    sphere: 'Sphere', cylinder: 'Cylinder', box: 'Box', cone: 'Cone',
    ellipsoid: 'Ellipsoid', ring: 'Ring', prism: 'Prism'
  };
  var DEFAULTS = {
    sphere: { radius: 100 },
    cylinder: { radius: 100, height: 200, axis: 'z' },
    box: { sx: 400, sy: 300, sz: 200 },
    cone: { radius: 120, radius2: 0, height: 250, axis: 'z' },
    ellipsoid: { sx: 300, sy: 200, sz: 150 },
    ring: { radius: 400, width: 100, height: 150 },
    prism: { sides: 3, radius: 150, height: 150 }
  };

  function materialById(id) { return MATERIALS.filter(function (m) { return m.id === id; })[0] || MATERIALS[0]; }
  function safeName(name) { var clean = String(name || '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1'); return clean || 'material1'; }
  /* Name used for the material in code, for example Si or my_glass. */
  function materialCode(shape) { return shape.material === 'custom' ? safeName(shape.customName) : materialById(shape.material).code; }
  function materialLabel(shape) { return shape.material === 'custom' ? (shape.customName || 'Custom') : materialById(shape.material).label; }
  function materialColor(shape) { return materialById(shape.material).color; }

  /* Half of the shape's size along z: used to rest a shape on the plane z = 0. */
  function halfExtent(shape) {
    var t = shape.type, axis = shape.axis || 'z';
    function pick(alongAxis, across) { return [axis === 'x' ? alongAxis : across, axis === 'y' ? alongAxis : across, axis === 'z' ? alongAxis : across]; }
    if (t === 'sphere') return [shape.radius, shape.radius, shape.radius];
    if (t === 'cylinder') return pick(shape.height / 2, shape.radius);
    if (t === 'cone') return pick(shape.height / 2, Math.max(shape.radius, shape.radius2 || 0));
    if (t === 'ring') return [shape.radius, shape.radius, shape.height / 2];
    if (t === 'prism') {
      var mx = 0, my = 0;
      prismPoints(shape).forEach(function (p) { mx = Math.max(mx, Math.abs(p[0])); my = Math.max(my, Math.abs(p[1])); });
      return [mx, my, shape.height / 2];
    }
    return [shape.sx / 2, shape.sy / 2, shape.sz / 2];
  }
  function newShape(type, materialId) {
    var shape = { type: type, material: materialId || 'si', x: 0, y: 0, z: 0 }, defaults = DEFAULTS[type];
    Object.keys(defaults).forEach(function (key) { shape[key] = defaults[key]; });
    shape.z = halfExtent(shape)[2];
    return shape;
  }
  /* Outline of a prism, relative to its centre: either the points read from
   * code, or a regular polygon with `sides` corners on a circle of `radius`. */
  function prismPoints(shape) {
    if (shape.points && shape.points.length >= 3) return shape.points;
    var points = [], sides = Math.max(3, Math.min(64, Math.round(shape.sides || 3)));
    for (var i = 0; i < sides; i++) {
      var angle = Math.PI / 2 + 2 * Math.PI * i / sides;
      points.push([shape.radius * Math.cos(angle), shape.radius * Math.sin(angle)]);
    }
    return points;
  }

  /* ---------------------------------------------------------------- *
   * Writing code
   * ---------------------------------------------------------------- */
  function number(value) { return String(Number(value.toPrecision(10))); }
  function um(nm) { return nm === Infinity ? 'mp.inf' : nm === -Infinity ? '-mp.inf' : number(nm / 1000); }
  function nmText(nm) { return number(nm) + 'nm'; }

  /* Flat outline of a shape seen from above (along z), for a layout. */
  function outline(shape) {
    var t = shape.type, axis = shape.axis || 'z', x = shape.x, y = shape.y;
    function rect(w, h) { return { kind: 'poly', points: [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]] }; }
    if (t === 'sphere') return { kind: 'circle', r: shape.radius };
    if (t === 'cylinder' || t === 'cone') {
      var r = t === 'cone' ? Math.max(shape.radius, shape.radius2 || 0) : shape.radius;
      if (axis === 'z') return { kind: 'circle', r: r };
      if (t === 'cone') {
        var a = shape.radius, b = shape.radius2 || 0, h = shape.height / 2;
        return { kind: 'poly', points: axis === 'x' ? [[x - h, y - a], [x + h, y - b], [x + h, y + b], [x - h, y + a]] : [[x - a, y - h], [x + a, y - h], [x + b, y + h], [x - b, y + h]] };
      }
      return axis === 'x' ? rect(shape.height, 2 * r) : rect(2 * r, shape.height);
    }
    if (t === 'box') return rect(shape.sx, shape.sy);
    if (t === 'ellipsoid') return { kind: 'ellipse', a: shape.sx / 2, b: shape.sy / 2 };
    if (t === 'ring') return { kind: 'ring', r: shape.radius - shape.width / 2, w: shape.width };
    return { kind: 'poly', points: prismPoints(shape).map(function (p) { return [x + p[0], y + p[1]]; }) };
  }
  function finite(shape) { return halfExtent(shape).every(Number.isFinite) && [shape.x, shape.y, shape.z].every(Number.isFinite); }

  function toGds(shapes) {
    var layers = [], lines = [];
    function layerOf(shape) {
      var key = materialCode(shape), index = layers.map(function (l) { return l.key; }).indexOf(key);
      if (index < 0) { layers.push({ key: key, label: key + (shape.material === 'custom' && shape.customN ? ' n=' + shape.customN : '') }); index = layers.length - 1; }
      return '(' + (index + 1) + ', 0)';
    }
    shapes.forEach(function (shape, i) {
      var name = 's' + (i + 1), half = halfExtent(shape);
      if (!finite(shape)) { lines.push('# ' + name + ': ' + shape.type + ' with an infinite size is not a layout shape (skipped)'); return; }
      var o = outline(shape), layer = layerOf(shape);
      var note = '  # ' + shape.type + ' h=' + nmText(2 * half[2]) + ' z=' + nmText(shape.z);
      if (shape.type === 'cone') note += ' r2=' + nmText(shape.radius2 || 0);
      if (o.kind === 'poly') {
        lines.push('c.add_polygon([' + o.points.map(function (p) { return '(' + um(p[0]) + ', ' + um(p[1]) + ')'; }).join(', ') + '], layer=' + layer + ')' + note);
        return;
      }
      var call = o.kind === 'circle' ? 'circle(radius=' + um(o.r)
        : o.kind === 'ellipse' ? 'ellipse(radii=(' + um(o.a) + ', ' + um(o.b) + ')'
        : 'ring(radius=' + um(o.r) + ', width=' + um(o.w);
      lines.push(name + ' = c.add_ref(gf.components.' + call + ', layer=' + layer + '))' + note);
      if (shape.x || shape.y) lines.push(name + '.move((' + um(shape.x) + ', ' + um(shape.y) + '))');
    });
    return [
      '# Elyvris Studio: gdsfactory layout, seen from above. Units: micrometres.',
      '# Layers: ' + (layers.length ? layers.map(function (l, i) { return '(' + (i + 1) + ', 0) ' + l.label; }).join(' | ') : 'none'),
      'import gdsfactory as gf',
      '',
      'gf.gpdk.PDK.activate()',
      'c = gf.Component(name="elyvris_studio")',
      ''
    ].concat(lines, [
      '',
      'c.write_gds("elyvris_studio.gds")  # open this file in KLayout',
      ''
    ]).join('\n');
  }

  /* options.index(libraryId) -> { n, k } or null; options.wavelength in nm. */
  function toMeep(shapes, options) {
    options = options || {};
    var defined = [], definitions = [], objects = [];
    function vec(a, b, c) { return 'mp.Vector3(' + um(a) + ', ' + um(b) + ', ' + um(c) + ')'; }
    function axisVec(axis) { return axis === 'x' ? 'mp.Vector3(1, 0, 0)' : axis === 'y' ? 'mp.Vector3(0, 1, 0)' : 'mp.Vector3(0, 0, 1)'; }
    function useMaterial(shape) {
      var code = materialCode(shape);
      if (shape.material === 'air' || defined.indexOf(code) >= 0) return code;
      defined.push(code);
      if (shape.material === 'custom') {
        definitions.push(shape.customN > 0 ? code + ' = mp.Medium(index=' + number(Number(shape.customN)) + ')' : '# ' + code + ' = mp.Medium(index=...)  # define this material');
        return code;
      }
      var nk = options.index ? options.index(materialById(shape.material).lib) : null;
      if (!nk) definitions.push('# ' + code + ' = mp.Medium(index=...)  # define this material');
      else if (nk.k > 0.5) definitions.push('# ' + code + ' absorbs strongly (n=' + number(Number(nk.n.toPrecision(3))) + ', k=' + number(Number(nk.k.toPrecision(3))) + ' at ' + options.wavelength + ' nm): define a dispersive model');
      else definitions.push(code + ' = mp.Medium(index=' + number(Number(nk.n.toPrecision(4))) + ')  # n at ' + options.wavelength + ' nm' + (nk.k > 0.001 ? ', absorption left out' : ''));
      return code;
    }
    shapes.forEach(function (shape) {
      var m = useMaterial(shape), centre = 'center=' + vec(shape.x, shape.y, shape.z), t = shape.type;
      if (t === 'sphere') objects.push('mp.Sphere(radius=' + um(shape.radius) + ', ' + centre + ', material=' + m + ')');
      else if (t === 'cylinder') objects.push('mp.Cylinder(radius=' + um(shape.radius) + ', height=' + um(shape.height) + ', axis=' + axisVec(shape.axis) + ', ' + centre + ', material=' + m + ')');
      else if (t === 'cone') objects.push('mp.Cone(radius=' + um(shape.radius) + ', radius2=' + um(shape.radius2 || 0) + ', height=' + um(shape.height) + ', axis=' + axisVec(shape.axis) + ', ' + centre + ', material=' + m + ')');
      else if (t === 'box') objects.push('mp.Block(size=' + vec(shape.sx, shape.sy, shape.sz) + ', ' + centre + ', material=' + m + ')');
      else if (t === 'ellipsoid') objects.push('mp.Ellipsoid(size=' + vec(shape.sx, shape.sy, shape.sz) + ', ' + centre + ', material=' + m + ')');
      else if (t === 'ring') {
        var tail = ', height=' + um(shape.height) + ', axis=mp.Vector3(0, 0, 1), ' + centre + ', material=';
        objects.push('mp.Cylinder(radius=' + um(shape.radius) + tail + m + ')');
        objects.push('mp.Cylinder(radius=' + um(shape.radius - shape.width) + tail + 'mp.air)  # hole of the ring');
      } else {
        var bottom = Number.isFinite(shape.height) ? shape.z - shape.height / 2 : shape.z;
        objects.push('mp.Prism(vertices=[' + prismPoints(shape).map(function (p) { return vec(shape.x + p[0], shape.y + p[1], bottom); }).join(', ') + '], height=' + um(shape.height) + ', axis=mp.Vector3(0, 0, 1), material=' + m + ')');
      }
    });
    return [
      '# Elyvris Studio: Meep geometry. Length unit: 1 = 1 micrometre.',
      '# Shapes only. Add your own cell, sources, boundaries and run commands.',
      'import meep as mp',
      ''
    ].concat(definitions, definitions.length ? [''] : [], [
      'geometry = ['
    ], objects.map(function (line) { var cut = line.indexOf('  #'); return cut < 0 ? '    ' + line + ',' : '    ' + line.slice(0, cut) + ',' + line.slice(cut); }), [
      ']',
      ''
    ]).join('\n');
  }

  /* ---------------------------------------------------------------- *
   * Reading code
   * ---------------------------------------------------------------- */
  var U = 1000; // nanometres per code unit (micrometre)

  /* Arithmetic only: numbers, names already defined, + - * / ** and brackets. */
  function evaluate(source, vars) {
    var s = String(source).replace(/\s+/g, ''), i = 0;
    function expr() { var v = term(); while (s[i] === '+' || s[i] === '-') { var op = s[i++], t = term(); v = op === '+' ? v + t : v - t; } return v; }
    function term() { var v = unary(); while ((s[i] === '*' && s[i + 1] !== '*') || s[i] === '/') { var op = s[i++], t = unary(); v = op === '*' ? v * t : v / t; } return v; }
    function unary() { if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return power(); }
    function power() { var base = atom(); if (s[i] === '*' && s[i + 1] === '*') { i += 2; return Math.pow(base, unary()); } return base; }
    function atom() {
      if (s[i] === '(') { i++; var inner = expr(); if (s[i] !== ')') throw new Error('bracket'); i++; return inner; }
      var rest = s.slice(i), m = /^(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)/i.exec(rest);
      if (m) { i += m[0].length; return Number(m[0]); }
      m = /^[A-Za-z_][\w.]*/.exec(rest);
      if (!m) throw new Error('cannot read');
      i += m[0].length;
      if (/^(mp|meep|np|numpy|math)\.inf$/.test(m[0])) return Infinity;
      if (/^(np|numpy|math)\.pi$/.test(m[0])) return Math.PI;
      if (Object.prototype.hasOwnProperty.call(vars, m[0]) && typeof vars[m[0]] === 'number') return vars[m[0]];
      throw new Error('unknown name ' + m[0]);
    }
    if (!s) throw new Error('empty');
    var value = expr();
    if (i !== s.length || Number.isNaN(value)) throw new Error('cannot read');
    return value;
  }
  /* Split on a separator, ignoring separators inside brackets. */
  function splitTop(text, separator) {
    var parts = [], depth = 0, start = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === separator && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    parts.push(text.slice(start));
    return parts.map(function (p) { return p.trim(); }).filter(Boolean);
  }
  /* Text between the bracket at `open` and its matching closing bracket. */
  function inside(text, open) {
    var depth = 0;
    for (var i = open; i < text.length; i++) {
      if ('([{'.indexOf(text[i]) >= 0) depth++;
      else if (')]}'.indexOf(text[i]) >= 0) { depth--; if (depth === 0) return { body: text.slice(open + 1, i), end: i }; }
    }
    return null;
  }
  function parseArgs(body) {
    var out = { positional: [], named: {} };
    splitTop(body, ',').forEach(function (piece) {
      var m = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/.exec(piece);
      if (m) out.named[m[1]] = m[2].trim(); else out.positional.push(piece);
    });
    return out;
  }
  function tuple(text, vars) {
    var t = text.trim();
    if (!/^[(\[][\s\S]*[)\]]$/.test(t)) throw new Error('not a pair');
    return splitTop(t.slice(1, -1), ',').map(function (p) { return evaluate(p, vars); });
  }
  function vector(text, vars) {
    var t = text.trim(), m = /^(?:mp\.|meep\.)?Vector3\s*\(([\s\S]*)\)$/.exec(t);
    if (!m) { if (Array.isArray(vars[t])) return vars[t].slice(); throw new Error('not a vector'); }
    var args = parseArgs(m[1]), v = [0, 0, 0];
    args.positional.forEach(function (p, i) { if (i < 3) v[i] = evaluate(p, vars); });
    ['x', 'y', 'z'].forEach(function (key, i) { if (args.named[key] !== undefined) v[i] = evaluate(args.named[key], vars); });
    return v;
  }
  /* Join lines that belong to one command and keep their comments. */
  function statements(text) {
    var out = [], buffer = '', comment = '', depth = 0, start = 1, marks = [];
    function push() { if (buffer.trim()) out.push({ text: buffer, line: start, comment: comment, marks: marks }); buffer = ''; comment = ''; depth = 0; marks = []; }
    String(text).split(/\r?\n/).forEach(function (line, index) {
      var hash = line.indexOf('#'), code = (hash < 0 ? line : line.slice(0, hash)).trim();
      if (!buffer) start = index + 1;
      if (buffer && code) buffer += ' ';
      marks.push([buffer.length, index + 1]);       // this source line starts here in the joined text
      buffer += code; if (hash >= 0) comment += ' ' + line.slice(hash + 1);
      for (var i = 0; i < code.length; i++) { if ('([{'.indexOf(code[i]) >= 0) depth++; else if (')]}'.indexOf(code[i]) >= 0) depth--; }
      if (depth <= 0) push();
    });
    push();
    return out;
  }
  /* Source line of a position inside a joined statement. */
  function lineAt(statement, offset) {
    var line = statement.line;
    statement.marks.forEach(function (mark) { if (mark[0] <= offset) line = mark[1]; });
    return line;
  }
  var KNOWN = { si: 'si', csi: 'si', silicon: 'si', tio2: 'tio2', sio2: 'sio2', silica: 'sio2', fused_quartz: 'sio2', mgf2: 'mgf2', au: 'au', gold: 'au', al: 'al', aluminium: 'al', aluminum: 'al', bk7: 'bk7', air: 'air', vacuum: 'air' };
  function materialFromName(name, mediums) {
    var key = name.replace(/^(mp|meep)\./, '').toLowerCase();
    if (KNOWN[key]) return { material: KNOWN[key] };
    return { material: 'custom', customName: name, customN: mediums[name] === undefined ? null : mediums[name] };
  }
  function mediumIndex(text, vars) {
    var m = /^(?:mp\.|meep\.)?Medium\s*\(([\s\S]*)\)$/.exec(text.trim());
    if (!m) return undefined;
    var args = parseArgs(m[1]).named;
    try {
      if (args.index !== undefined) return evaluate(args.index, vars);
      if (args.epsilon !== undefined) return Number(Math.sqrt(evaluate(args.epsilon, vars)).toPrecision(8));
    } catch (error) { return null; }
    return 1;
  }
  function axisName(v, notes) {
    var a = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])], top = Math.max(a[0], a[1], a[2]);
    if (a.filter(function (c) { return c > 1e-9 * top; }).length > 1) notes.push('A tilted axis is drawn along its main direction.');
    return a[0] === top ? 'x' : a[1] === top ? 'y' : 'z';
  }
  function centreOf(points) {
    var xs = points.map(function (p) { return p[0]; }), ys = points.map(function (p) { return p[1]; });
    return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
  }

  function fromMeep(text) {
    var vars = {}, mediums = {}, shapes = [], skipped = [], notes = [];
    statements(text).forEach(function (statement) {
      var source = statement.text, assign = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/.exec(source), found = 0;
      if (assign) {
        var index = mediumIndex(assign[2], vars);
        if (index !== undefined) { mediums[assign[1]] = index; return; }
        try { vars[assign[1]] = vector(assign[2], vars); return; } catch (error) { /* not a vector */ }
        try { vars[assign[1]] = evaluate(assign[2], vars); return; } catch (error) { /* not a number */ }
      }
      var pattern = /\b(?:mp|meep)\.(Sphere|Cylinder|Block|Cone|Ellipsoid|Prism)\s*\(/g, match;
      while ((match = pattern.exec(source))) {
        var call = inside(source, pattern.lastIndex - 1), where = lineAt(statement, match.index);
        if (!call) { skipped.push(where); break; }
        pattern.lastIndex = call.end;
        try {
          var a = parseArgs(call.body).named, kind = match[1];
          var c = a.center ? vector(a.center, vars) : [0, 0, 0];
          var shape = { x: c[0] * U, y: c[1] * U, z: c[2] * U };
          var mat = { material: 'air' };
          if (a.material) {
            var inline = mediumIndex(a.material, vars);
            mat = inline !== undefined ? { material: 'custom', customName: 'material' + (shapes.length + 1), customN: inline } : materialFromName(a.material.trim(), mediums);
          }
          shape.material = mat.material; if (mat.material === 'custom') { shape.customName = mat.customName; shape.customN = mat.customN; }
          var need = function (key) { if (a[key] === undefined) throw new Error(key + ' is missing'); return evaluate(a[key], vars) * U; };
          if (kind === 'Sphere') { shape.type = 'sphere'; shape.radius = need('radius'); }
          else if (kind === 'Cylinder' || kind === 'Cone') {
            shape.type = kind === 'Cone' ? 'cone' : 'cylinder'; shape.radius = need('radius');
            shape.height = a.height === undefined ? Infinity : need('height');
            shape.axis = a.axis ? axisName(vector(a.axis, vars), notes) : 'z';
            if (kind === 'Cone') shape.radius2 = a.radius2 === undefined ? 0 : need('radius2');
          } else if (kind === 'Block' || kind === 'Ellipsoid') {
            if (a.size === undefined) throw new Error('size is missing');
            var size = vector(a.size, vars);
            shape.type = kind === 'Block' ? 'box' : 'ellipsoid'; shape.sx = size[0] * U; shape.sy = size[1] * U; shape.sz = size[2] * U;
            if (a.e1 || a.e2 || a.e3) notes.push('A rotated block is drawn without its rotation.');
          } else {
            if (a.vertices === undefined) throw new Error('vertices are missing');
            var list = splitTop(a.vertices.trim().replace(/^\[|\]$/g, ''), ',').map(function (v) { return vector(v, vars); });
            if (list.length < 3) throw new Error('a prism needs three vertices');
            var points = list.map(function (v) { return [v[0] * U, v[1] * U]; }), mid = centreOf(points);
            shape.type = 'prism'; shape.height = a.height === undefined ? Infinity : need('height');
            shape.points = points.map(function (p) { return [p[0] - mid[0], p[1] - mid[1]]; });
            if (!a.center) { shape.x = mid[0]; shape.y = mid[1]; shape.z = Number.isFinite(shape.height) ? list[0][2] * U + shape.height / 2 : list[0][2] * U; }
            shape.radius = Math.max.apply(null, shape.points.map(function (p) { return Math.hypot(p[0], p[1]); })); shape.sides = points.length;
          }
          var sizes = ['radius', 'radius2', 'height', 'sx', 'sy', 'sz'].map(function (key) { return shape[key]; }).filter(function (v) { return v !== undefined; });
          if (sizes.some(function (v) { return !(v >= 0); }) || !(shape.radius === undefined || shape.radius > 0)) throw new Error('size');
          shapes.push(shape); found++;
        } catch (error) { skipped.push(where); }
      }
      var other = /\b(?:mp|meep)\.(?:Wedge|GeometricObject)\s*\(/g, miss;
      while ((miss = other.exec(source))) skipped.push(lineAt(statement, miss.index));
    });
    // Two cylinders, the second one of air and thinner: that is a ring.
    for (var i = 0; i < shapes.length - 1; i++) {
      var o = shapes[i], h = shapes[i + 1];
      if (o.type === 'cylinder' && h.type === 'cylinder' && h.material === 'air' && o.axis === 'z' && h.axis === 'z' && o.x === h.x && o.y === h.y && o.z === h.z && o.height === h.height && h.radius < o.radius) {
        o.type = 'ring'; o.width = o.radius - h.radius; delete o.axis; shapes.splice(i + 1, 1);
      }
    }
    return { shapes: shapes, skipped: unique(skipped), notes: unique(notes) };
  }

  function fromGds(text) {
    var vars = {}, layerMaterial = {}, defs = {}, refs = {}, shapes = [], skipped = [], notes = [];
    // Our own header keeps the material of each layer: "# Layers: (1, 0) Si | (2, 0) SiO2".
    var header = /#\s*Layers:(.*)/.exec(text);
    if (header) header[1].split('|').forEach(function (part) {
      var m = /\((\d+)\s*,\s*(\d+)\)\s*([A-Za-z_][\w.]*)(?:\s+n=([\d.]+))?/.exec(part);
      if (!m) return;
      var mat = materialFromName(m[3], {}); if (mat.material === 'custom') mat.customN = m[4] ? Number(m[4]) : null;
      layerMaterial[m[1] + '/' + m[2]] = mat;
    });
    function materialOf(args) {
      var key = '1/0', layer = args.named.layer;
      if (layer) { try { var pair = tuple(layer, vars); key = pair[0] + '/' + (pair[1] || 0); } catch (error) { key = layer.replace(/['"]/g, ''); } }
      return layerMaterial[key] || { material: 'custom', customName: 'layer_' + key.replace(/\W/g, '_'), customN: null };
    }
    function factory(source) {
      var m = /^gf\.(?:components|c)\.(circle|rectangle|ellipse|ring|straight)\s*\(/.exec(source);
      if (!m) return null;
      var call = inside(source, m[0].length - 1);
      if (!call || source.slice(call.end + 1).trim()) return null;
      return { kind: m[1], args: parseArgs(call.body) };
    }
    function resolve(source) { var s = source.trim(); return defs[s] || factory(s); }
    function build(def, comment, dx, dy) {
      var a = def.args.named, p = def.args.positional, mat = materialOf(def.args);
      var hm = /\bh=(-?[\d.]+)nm/.exec(comment), zm = /\bz=(-?[\d.]+)nm/.exec(comment), r2 = /\br2=([\d.]+)nm/.exec(comment);
      var height = hm ? Number(hm[1]) : 200, z = zm ? Number(zm[1]) : height / 2;
      var shape = { x: dx, y: dy, z: z, material: mat.material };
      if (mat.material === 'custom') { shape.customName = mat.customName; shape.customN = mat.customN; }
      var value = function (key, position, fallback) { var src = a[key] !== undefined ? a[key] : p[position]; return src === undefined ? fallback : evaluate(src, vars) * U; };
      if (def.kind === 'circle') {
        var r = value('radius', 0, 10 * U);
        if (/\bsphere\b/.test(comment)) { shape.type = 'sphere'; shape.radius = r; }
        else if (/\bcone\b/.test(comment)) { shape.type = 'cone'; shape.radius = r; shape.radius2 = r2 ? Number(r2[1]) : 0; shape.height = height; shape.axis = 'z'; }
        else { shape.type = 'cylinder'; shape.radius = r; shape.height = height; shape.axis = 'z'; }
      } else if (def.kind === 'ring') {
        var mid = value('radius', 0, 10 * U), w = value('width', 1, 0.5 * U);
        shape.type = 'ring'; shape.radius = mid + w / 2; shape.width = w; shape.height = height;
      } else if (def.kind === 'ellipse') {
        var radii = tuple(a.radii !== undefined ? a.radii : (p[0] || '(10, 5)'), vars);
        if (/\bellipsoid\b/.test(comment)) { shape.type = 'ellipsoid'; shape.sx = 2 * radii[0] * U; shape.sy = 2 * radii[1] * U; shape.sz = height; }
        else {
          shape.type = 'prism'; shape.height = height; shape.points = [];
          for (var i = 0; i < 48; i++) shape.points.push([radii[0] * U * Math.cos(2 * Math.PI * i / 48), radii[1] * U * Math.sin(2 * Math.PI * i / 48)]);
          shape.radius = Math.max(radii[0], radii[1]) * U; shape.sides = 48;
        }
      } else {
        var size = def.kind === 'straight' ? [value('length', 0, 10 * U), value('width', -1, 0.5 * U)] : tuple(a.size !== undefined ? a.size : (p[0] || '(4, 2)'), vars).map(function (v) { return v * U; });
        var centred = def.kind === 'rectangle' && /^True$/.test(a.centered || '');
        shape.type = 'box'; shape.sx = size[0]; shape.sy = size[1]; shape.sz = height;
        if (def.kind === 'straight') shape.x += size[0] / 2; else if (!centred) { shape.x += size[0] / 2; shape.y += size[1] / 2; }
      }
      return shape;
    }
    statements(text).forEach(function (statement) {
      var source = statement.text, m;
      try {
        if (/^(import|from)\b|\.activate\(|\.write_gds\(|\.show\(|^print\(|gf\.Component\(/.test(source)) return;
        if ((m = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/.exec(source)) && factory(m[2].trim())) { defs[m[1]] = factory(m[2].trim()); return; }
        if ((m = /^(?:([A-Za-z_]\w*)\s*=\s*)?[A-Za-z_]\w*\s*(?:\.add_ref\s*\(([\s\S]+)\)|<<\s*([\s\S]+))$/.exec(source))) {
          var def = resolve(m[2] || m[3]);
          if (!def) throw new Error('unknown component');
          var shape = build(def, statement.comment, 0, 0);
          shapes.push(shape); if (m[1]) refs[m[1]] = shape;
          return;
        }
        if ((m = /^([A-Za-z_]\w*)\.d?(move|movex|movey)\s*\(([\s\S]+)\)$/.exec(source)) && refs[m[1]]) {
          var target = refs[m[1]];
          if (m[2] === 'move') { var d = tuple(m[3], vars); target.x += d[0] * U; target.y += d[1] * U; }
          else if (m[2] === 'movex') target.x += evaluate(m[3], vars) * U;
          else target.y += evaluate(m[3], vars) * U;
          return;
        }
        if ((m = /^[A-Za-z_]\w*\.add_polygon\s*\(([\s\S]+)\)$/.exec(source))) {
          var args = parseArgs(m[1]), raw = args.named.points !== undefined ? args.named.points : args.positional[0];
          var points = splitTop(raw.trim().replace(/^\[|\]$/g, ''), ',').map(function (pair) { var t = tuple(pair, vars); return [t[0] * U, t[1] * U]; });
          if (points.length < 3) throw new Error('polygon');
          var centre = centreOf(points), hm = /\bh=(-?[\d.]+)nm/.exec(statement.comment), zm = /\bz=(-?[\d.]+)nm/.exec(statement.comment);
          var height = hm ? Number(hm[1]) : 200, mat = materialOf(args);
          var poly = { x: centre[0], y: centre[1], z: zm ? Number(zm[1]) : height / 2, material: mat.material };
          if (mat.material === 'custom') { poly.customName = mat.customName; poly.customN = mat.customN; }
          var xs = points.map(function (q) { return q[0]; }), ys = points.map(function (q) { return q[1]; });
          var isRect = points.length === 4 && points.every(function (q) { return (q[0] === Math.min.apply(null, xs) || q[0] === Math.max.apply(null, xs)) && (q[1] === Math.min.apply(null, ys) || q[1] === Math.max.apply(null, ys)); });
          if (isRect) { poly.type = 'box'; poly.sx = Math.max.apply(null, xs) - Math.min.apply(null, xs); poly.sy = Math.max.apply(null, ys) - Math.min.apply(null, ys); poly.sz = height; }
          else { poly.type = 'prism'; poly.height = height; poly.points = points.map(function (q) { return [q[0] - centre[0], q[1] - centre[1]]; }); poly.sides = points.length; poly.radius = Math.max.apply(null, poly.points.map(function (q) { return Math.hypot(q[0], q[1]); })); }
          shapes.push(poly);
          return;
        }
        if ((m = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/.exec(source))) { vars[m[1]] = evaluate(m[2], vars); return; }
        throw new Error('not understood');
      } catch (error) { skipped.push(statement.line); }
    });
    return { shapes: shapes, skipped: unique(skipped), notes: unique(notes) };
  }
  function unique(list) { return list.filter(function (item, index) { return list.indexOf(item) === index; }).sort(function (a, b) { return typeof a === 'number' ? a - b : 0; }); }

  var api = Object.freeze({
    MATERIALS: MATERIALS, TYPES: TYPES, materialById: materialById, materialLabel: materialLabel, materialColor: materialColor,
    newShape: newShape, prismPoints: prismPoints, halfExtent: halfExtent,
    toGds: toGds, toMeep: toMeep, fromGds: fromGds, fromMeep: fromMeep
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ElyvrisStudioCode = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
