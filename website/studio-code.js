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
  function materialKey(shape) {
    if (shape.material === 'air') return 'air';
    if (shape.meepLibrary) return 'meep:' + shape.meepLibrary;
    if (shape.material !== 'custom') return 'lib:' + shape.material;
    if (shape.customCode) return 'code:' + shape.customName + '\n' + shape.customCode;
    return 'n:' + shape.customName + ':' + (shape.customN > 0 ? shape.customN : '');
  }
  /* The name of each shape's material in code. Two different materials never share a name:
     a user's Si with n = 2 and the library's silicon become Si and Si_2, so neither replaces the other. */
  function materialNames(shapes) {
    var byKey = {}, used = {};
    return shapes.map(function (shape) {
      var key = materialKey(shape);
      if (byKey[key]) return byKey[key];
      if (key === 'air') return (byKey[key] = materialCode(shape));
      var base = shape.meepLibrary ? safeName(shape.meepLibrary) : materialCode(shape), name = base, k = 2;
      while (used[name]) name = base + '_' + k++;
      used[name] = true; byKey[key] = name;
      return name;
    });
  }

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
  function prismPoints(shape) {
    if (shape.points && shape.points.length >= 3) return shape.points;
    var points = [], sides = Math.max(3, Math.min(64, Math.round(shape.sides || 3)));
    for (var i = 0; i < sides; i++) {
      var angle = Math.PI / 2 + 2 * Math.PI * i / sides;
      points.push([shape.radius * Math.cos(angle), shape.radius * Math.sin(angle)]);
    }
    return points;
  }

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
    var layers = [], lines = [], names = materialNames(shapes);
    function layerOf(shape, i) {
      var key = names[i], index = layers.map(function (l) { return l.key; }).indexOf(key);
      if (index < 0) { layers.push({ key: key, label: key + (shape.material === 'custom' && shape.customN ? ' n=' + shape.customN : '') }); index = layers.length - 1; }
      return '(' + (index + 1) + ', 0)';
    }
    shapes.forEach(function (shape, i) {
      var name = 's' + (i + 1), half = halfExtent(shape);
      if (!finite(shape)) { lines.push('# ' + name + ': ' + shape.type + ' with an infinite size is not a layout shape (skipped)'); return; }
      var o = outline(shape), layer = layerOf(shape, i);
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

  function toLayout(shapes) {
    var layers = [], polygons = [], skipped = [], STEPS = 144;
    var names = materialNames(shapes);
    shapes.forEach(function (shape, i) {
      if (!finite(shape)) { skipped.push(i); return; }
      var key = names[i], index = layers.map(function (l) { return l.key; }).indexOf(key);
      if (index < 0) { layers.push({ key: key, layer: layers.length + 1, datatype: 0, label: key + (shape.material === 'custom' && shape.customN ? ' n=' + shape.customN : '') }); index = layers.length - 1; }
      var o = outline(shape), x = shape.x, y = shape.y, points = [], k, t;
      if (o.kind === 'poly') points = o.points;
      else if (o.kind === 'ring') {
        var outer = o.r + o.w / 2, inner = o.r - o.w / 2;
        for (k = 0; k <= STEPS; k++) { t = 2 * Math.PI * k / STEPS; points.push([x + outer * Math.cos(t), y + outer * Math.sin(t)]); }
        for (k = STEPS; k >= 0; k--) { t = 2 * Math.PI * k / STEPS; points.push([x + inner * Math.cos(t), y + inner * Math.sin(t)]); }
      } else {
        var a = o.kind === 'circle' ? o.r : o.a, b = o.kind === 'circle' ? o.r : o.b;
        for (k = 0; k < STEPS; k++) { t = 2 * Math.PI * k / STEPS; points.push([x + a * Math.cos(t), y + b * Math.sin(t)]); }
      }
      polygons.push({ layer: index + 1, datatype: 0, points: points, shape: i });
    });
    return { layers: layers, polygons: polygons, skipped: skipped };
  }

  var MEEP_RANGES = {"Ag": [0.248, 12.398], "Ag_visible": [0.4, 0.8], "Al": [0.2066, 12.398], "Al2O3": [0.21, 2.07], "Al2O3_aniso": [0.2, 5.0], "AlAs": [0.56, 2.2], "AlN": [0.26, 1.65], "AlN_aniso": [0.22, 5.0], "Al_drude": [0.19, 0.83], "Al_visible": [0.4, 0.8], "Au": [0.248, 6.1992], "Au_JC_visible": [0.4, 0.8], "Au_visible": [0.4, 0.8], "BK7": [0.3, 2.5], "BaB2O4": [0.188, 5.2], "Be": [0.2066, 12.398], "CLS": [0.437, 1.052], "CaCO3": [0.204, 2.172], "CaWO4": [0.45, 4.0], "CdTe": [0.86, 2.5], "Co": [0.26, 1.65], "Cr": [0.2066, 12.398], "Cr_visible": [0.4, 0.8], "Cu": [0.2066, 12.398], "GaAs": [0.97, 17.0], "GaN": [0.35, 10.0], "Ge": [2.5, 12.0], "ITO": [0.21, 0.83], "InP": [0.95, 10.0], "LiNbO3": [0.4, 5.0], "Mo": [0.25, 0.83], "Ni": [0.2066, 12.398], "NiCr": [0.25, 0.83], "NiFe": [0.25, 0.83], "PC": [0.437, 1.052], "PMMA": [0.437, 1.052], "PS": [0.437, 1.052], "Pd": [0.2066, 12.398], "Pt": [0.2066, 12.398], "Si": [1.36, 11.0], "Si3N4": [0.23, 0.83], "Si3N4_NIR": [0.31, 5.504], "Si3N4_VISNIR": [0.207, 1.24], "SiN": [0.21, 2.07], "SiO2": [0.25, 1.77], "SiO2_aniso": [0.198, 2.0531], "Ti": [0.2066, 12.398], "Ti_drude": [0.21, 1.24], "Ti_visible": [0.4, 0.8], "W": [0.2066, 12.398], "Y2O3": [0.25, 9.6], "YAG": [0.4, 5.0], "aSi": [0.21, 0.83], "aSi_H": [0.21, 0.83], "cSi": [0.4, 1.0], "fused_quartz": [0.21, 6.7]};
  var MEEP_SAME = { Si: ['cSi'], cSi: ['Si'] };
  function rangeText(range) { return range[0] + '-' + (range[1] === null ? '' : range[1]) + ' um'; }
  function meepRange(name, wavelengthNm) {
    var range = MEEP_RANGES[name], um = wavelengthNm / 1000;
    if (!range || !(um > 0) || (um >= range[0] && (range[1] === null || um <= range[1]))) return null;
    var base = name.split('_')[0], same = MEEP_SAME[name] || [];
    var others = Object.keys(MEEP_RANGES).filter(function (key) {
      var r = MEEP_RANGES[key];
      return key !== name && (key.split('_')[0] === base || same.indexOf(key) >= 0) && um >= r[0] && (r[1] === null || um <= r[1]);
    });
    return { range: range, others: others };
  }
  /* A sentence for the page, or '' when there is nothing to warn about. */
  function meepRangeWarning(name, wavelengthNm) {
    var outside = meepRange(name, wavelengthNm);
    if (!outside) return '';
    return "Meep's model meep.materials." + name + ' was fitted for ' + rangeText(outside.range).replace('um', 'µm') + ': at ' + wavelengthNm + ' nm it may be far from the real material.' +
      (outside.others.length ? ' For this wavelength Meep also has ' + outside.others.map(function (k) { return k + ' (' + rangeText(MEEP_RANGES[k]).replace('um', 'µm') + ')'; }).join(', ') + '.' : '');
  }

  function outsideNames(code) {
    var found = [], skip = ['mp', 'meep', 'np', 'numpy', 'math', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'for', 'if', 'else', 'lambda'];
    String(code).replace(/(['"])(?:\\.|(?!\1).)*\1/g, '""').replace(/(^|[^.\w])([A-Za-z_]\w*)\b(?!\s*=(?!=))/g, function (all, before, name) {
      if (skip.indexOf(name) < 0 && found.indexOf(name) < 0) found.push(name);
      return all;
    });
    return found;
  }

  function meepScale(options) {
    var s = options && Number(options.scale);
    return s > 0 && isFinite(s) ? s : 1;
  }
  function meepScaleIn(text) {
    var m = /^#.*\bLength unit:\s*1\s*=\s*([0-9.]+(?:[eE][-+]?\d+)?)\s*(micrometres?|µm|um|nanometres?|nm)\b/m.exec(String(text));
    if (!m) return null;
    var s = Number(m[1]) / (/^n/.test(m[2]) ? 1000 : 1);
    return s > 0 && isFinite(s) ? s : null;
  }
  function withoutRescale(text) {
    return String(text)
      .replace(/^# Meep's library assumes 1 = 1 micrometre\.[^\n]*\n(?:#[^\n]*\n)*import copy\n(?:def rescale\(medium, s\):\n(?:    [^\n]*\n)*)/m, function (block) { return block.replace(/[^\n]/g, ' '); })
      .replace(/^([A-Za-z_]\w*) = rescale\(\1, [0-9.eE+-]+\)[ \t]*$/gm, function (line) { return line.replace(/./g, ' '); });
  }
  var RESCALE = [
    'import copy',
    'def rescale(medium, s):',
    '    m = copy.deepcopy(medium)',
    '    for sus in m.E_susceptibilities + m.H_susceptibilities:',
    '        sus.frequency *= s',
    '        sus.gamma *= s',
    '    m.D_conductivity_diag *= s',
    '    m.B_conductivity_diag *= s',
    '    m.valid_freq_range = mp.FreqRange(min=m.valid_freq_range.min * s, max=m.valid_freq_range.max * s)',
    '    return m'
  ];

  function toMeep(shapes, options) {
    options = options || {};
    var scale = meepScale(options);
    // Lengths in this script are in units of `scale` micrometres.
    function um(nm) { return nm === Infinity ? 'mp.inf' : nm === -Infinity ? '-mp.inf' : number(nm / (1000 * scale)); }
    var defined = [], imports = [], rescaled = [], definitions = [], objects = [], names = materialNames(shapes);
    function vec(a, b, c) { return 'mp.Vector3(' + um(a) + ', ' + um(b) + ', ' + um(c) + ')'; }
    function axisVec(axis) { return axis === 'x' ? 'mp.Vector3(1, 0, 0)' : axis === 'y' ? 'mp.Vector3(0, 1, 0)' : 'mp.Vector3(0, 0, 1)'; }
    function useMaterial(shape, i) {
      var code = names[i];
      if (shape.material === 'air' || defined.indexOf(code) >= 0) return code;
      defined.push(code);
      if (shape.meepLibrary) {
        var outside = meepRange(shape.meepLibrary, options.wavelength);
        imports.push('from meep.materials import ' + shape.meepLibrary + (code !== shape.meepLibrary ? ' as ' + code : '') +
          (outside ? '  # fitted for ' + rangeText(outside.range) + ': ' + options.wavelength + ' nm is outside' + (outside.others.length ? ' (Meep also has ' + outside.others.map(function (k) { return k + ', ' + rangeText(MEEP_RANGES[k]); }).join('; ') + ')' : '') : ''));
        if (scale !== 1) rescaled.push(code + ' = rescale(' + code + ', ' + number(scale) + ')');
        return code;
      }
      if (shape.material === 'custom' && shape.customCode) {
        var needs = outsideNames(shape.customCode);
        definitions.push('# ' + code + ': copied unchanged from your code (more than one constant index)' + (needs.length ? '; it also needs ' + needs.join(', ') + ' from your script' : ''));
        definitions.push(code + ' = ' + shape.customCode);
        return code;
      }
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
    shapes.forEach(function (shape, i) {
      var m = useMaterial(shape, i), centre = 'center=' + vec(shape.x, shape.y, shape.z), t = shape.type;
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
    var unitText = number(scale) + ' micrometre';
    if (rescaled.length) rescaled = [
      '',
      "# Meep's library assumes 1 = 1 micrometre. Here 1 = " + unitText + ', so each library model is rescaled:',
      '# its frequencies, damping rates and conductivities are multiplied by ' + number(scale) + ' (frequencies are a/wavelength).'
    ].concat(RESCALE, rescaled);
    return [
      '# Elyvris Studio: Meep geometry. Length unit: 1 = ' + unitText + '.',
      '# Shapes only. Add your own cell, sources, boundaries and run commands.',
      'import meep as mp'
    ].concat(imports, rescaled, [''], definitions, definitions.length ? [''] : [], [
      'geometry = ['
    ], objects.map(function (line) { var cut = line.indexOf('  #'); return cut < 0 ? '    ' + line + ',' : '    ' + line.slice(0, cut) + ',' + line.slice(cut); }), [
      ']',
      ''
    ]).join('\n');
  }

  var U = 1000;

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
    if (mediums[name] !== undefined) return { material: 'custom', customName: name, customN: mediums[name] };
    var key = name.replace(/^(mp|meep)\./, '').toLowerCase();
    if (KNOWN[key]) return { material: KNOWN[key] };
    return { material: 'custom', customName: name, customN: null };
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

  function fromMeepBasic(text, options) {
    var U = 1000 * meepScale(options);   // nanometres per Meep unit, in this script
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
    mergeRings(shapes);
    return { shapes: shapes, skipped: unique(skipped), notes: unique(notes), problems: [] };
  }
  /* Two cylinders, the second one of air and thinner: that is a ring. */
  function mergeRings(shapes) {
    for (var i = 0; i < shapes.length - 1; i++) {
      var o = shapes[i], h = shapes[i + 1];
      if (o.type === 'cylinder' && h.type === 'cylinder' && h.material === 'air' && o.axis === 'z' && h.axis === 'z' && o.x === h.x && o.y === h.y && o.z === h.z && o.height === h.height && h.radius < o.radius) {
        o.type = 'ring'; o.width = o.radius - h.radius; delete o.axis;
        if (o.origins) o.origins = {};
        if (o.line !== undefined && h.endLine !== undefined) o.endLine = Math.max(o.endLine, h.endLine);
        shapes.splice(i + 1, 1);
      }
    }
  }
  /* The code lines that made a shape ride along with it, without becoming part of the design. */
  function tag(shape, line, endLine) {
    Object.defineProperty(shape, 'line', { value: line, enumerable: false, writable: true });
    Object.defineProperty(shape, 'endLine', { value: endLine === undefined ? line : endLine, enumerable: false, writable: true });
    return shape;
  }

  function studioLibraryLines(text, options) {
    var found = {}, pattern = /^[ \t]*([A-Za-z_]\w*)[ \t]*=[ \t]*mp\.Medium\(index=([-+\d.eE]+)\)[ \t]*#[ \t]*n at ([\d.]+) nm/gm, m;
    if (!options || !(options.wavelength > 0)) return found;
    while ((m = pattern.exec(String(text)))) {
      var id = KNOWN[m[1].toLowerCase()], n = Number(m[2]);
      if (!id || id === 'air' || m[1] !== materialById(id).code || Number(m[3]) !== Number(options.wavelength)) continue;
      var nk = options.index ? options.index(materialById(id).lib) : null;
      if (nk && Number(nk.n.toPrecision(4)) !== n) continue;
      found[m[1]] = { material: id, n: n };
    }
    return found;
  }

  var OUTSIDE = [
    ['cell', /\bcell_size\s*=/],
    ['boundary layers (PML)', /\bmp\.(?:PML|Absorber)\s*\(|\bboundary_layers\s*=/],
    ['sources', /\bmp\.(?:Source|EigenModeSource|GaussianBeamSource|IndexedSource)\s*\(/],
    ['monitors', /\.add_(?:flux|mode_monitor|dft_fields|near2far|energy|force|eigenmode)\s*\(|\bmp\.(?:Harminv|FluxRegion|ModeRegion|Near2FarRegion|EnergyRegion|ForceRegion)\s*\(/],
    ['symmetries', /\bmp\.(?:Mirror|Rotate2|Rotate4)\s*\(/],
    ['resolution', /\bresolution\s*=/],
    ['run commands', /\.run\s*\(/]
  ];
  function meepOutside(text) {
    var lines = String(text).split('\n'), found = [];
    OUTSIDE.forEach(function (part) {
      var at = [];
      lines.forEach(function (line, i) { if (part[1].test(line.replace(/#.*$/, ''))) at.push(i + 1); });
      if (at.length) found.push({ label: part[0], lines: at });
    });
    return found;
  }

  function fromMeep(text, options) {
    var U = 1000 * meepScale(options);   // nanometres per Meep unit, in this script
    var Py = root.ElyvrisPy;
    text = withoutRescale(text);
    if (!Py) return fromMeepBasic(text, options);
    var result = Py.readMeep(text), shapes = [], notes = result.notes.slice(), problems = [], skipped = [], studio = studioLibraryLines(text, options);
    result.diagnostics.forEach(function (d) { skipped.push(d.line); problems.push('Line ' + d.line + ': ' + d.message + '.'); });
    result.objects.forEach(function (o) {
      try {
        var shape = { x: o.center[0] * U, y: o.center[1] * U, z: o.center[2] * U }, m = o.medium, mat, kind = o.kind;
        var approx = [];   // how this shape's drawing differs from Meep's object
        var own = m.name || 'material' + (shapes.length + 1);
        if (!m.given || m.air) mat = { material: 'air' };
        else if (m.library) { mat = materialFromName(m.library, {}); mat.meepLibrary = m.library; }
        else if (m.code) mat = { material: 'custom', customName: own, customN: null, customCode: m.code };
        else if (m.n > 0 && m.name && studio[m.name] && studio[m.name].n === m.n) mat = { material: studio[m.name].material };
        // A constant index written in the script always wins over a familiar name.
        else if (m.n > 0) mat = { material: 'custom', customName: own, customN: m.n };
        else if (m.name) mat = materialFromName(m.name, {});
        else mat = { material: 'custom', customName: own, customN: null };
        shape.material = mat.material; if (mat.material === 'custom') { shape.customName = mat.customName; shape.customN = mat.customN; }
        if (mat.customCode) shape.customCode = mat.customCode;
        if (mat.meepLibrary) shape.meepLibrary = mat.meepLibrary;
        if (m.complex && m.code) notes.push('Material ' + own + ' is more than one constant index: the 3D view shows its shape only, and its definition is copied unchanged when the Studio rewrites the code.');
        else if (m.complex) notes.push('Material ' + own + ' is more than one constant index: only its name is kept.');
        if (m.needs && m.needs.length) notes.push('Material ' + own + ' uses ' + m.needs.join(', ') + ' from elsewhere in your script: if the Studio rewrites the code, copy ' + (m.needs.length > 1 ? 'their definitions' : 'its definition') + ' too.');
        if (kind === 'Sphere') { shape.type = 'sphere'; shape.radius = o.radius * U; }
        else if (kind === 'Cylinder' || kind === 'Cone') {
          shape.type = kind === 'Cone' ? 'cone' : 'cylinder'; shape.radius = o.radius * U; shape.height = o.height * U;
          shape.axis = axisName(o.axis, approx);
          if (kind === 'Cone') shape.radius2 = o.radius2 * U;
        } else if (kind === 'Block' || kind === 'Ellipsoid') {
          var size = o.size.map(function (v) { return v * U; });
          if (kind === 'Block' && size.some(function (v) { return v === 0; })) {
            size = size.map(function (v) { return v === 0 ? Infinity : v; });
            approx.push('A block with size 0 along an axis (a 2D simulation) is drawn as endless along that axis.');
          }
          shape.type = kind === 'Block' ? 'box' : 'ellipsoid'; shape.sx = size[0]; shape.sy = size[1]; shape.sz = size[2];
          if (o.rotated) approx.push('A rotated ' + (kind === 'Block' ? 'block' : 'ellipsoid') + ' is drawn without its rotation.');
        } else {
          if (axisName(o.axis, []) !== 'z') throw new Error('a prism whose axis is not z is not drawn yet');
          var points = o.vertices.map(function (v) { return [v[0] * U, v[1] * U]; }), mid = centreOf(points);
          shape.type = 'prism'; shape.height = o.height * U;
          shape.points = points.map(function (p) { return [p[0] - mid[0], p[1] - mid[1]]; });
          if (!o.centerGiven) { shape.x = mid[0]; shape.y = mid[1]; shape.z = Number.isFinite(shape.height) ? o.vertices[0][2] * U + shape.height / 2 : o.vertices[0][2] * U; }
          else approx.push('A prism with "center" is placed by the middle of its outline.');
          if (o.slanted) approx.push('A prism with slanted side walls is drawn with straight walls.');
          shape.radius = Math.max.apply(null, shape.points.map(function (p) { return Math.hypot(p[0], p[1]); })); shape.sides = points.length;
        }
        var sizes = ['radius', 'radius2', 'height', 'sx', 'sy', 'sz'].map(function (key) { return shape[key]; }).filter(function (v) { return v !== undefined; });
        if (sizes.some(function (v) { return !(v >= 0); }) || !(shape.radius === undefined || shape.radius > 0)) throw new Error('a size is negative or missing');
        // Which form fields are a plain number in the text (see `origins` in studio-py.js).
        var origins = {}, from = o.origins || {}, centre = from.center || [], sizeFrom = from.size || [];
        if (shape.type !== 'prism') ['x', 'y', 'z'].forEach(function (key, i) { if (centre[i]) origins[key] = centre[i]; });
        if (shape.type === 'box' || shape.type === 'ellipsoid') ['sx', 'sy', 'sz'].forEach(function (key, i) { if (sizeFrom[i]) origins[key] = sizeFrom[i]; });
        ['radius', 'radius2', 'height'].forEach(function (key) { if (from[key] && shape[key] !== undefined && shape.type !== 'prism') origins[key] = from[key]; });
        if (shape.type === 'prism' && from.height && !o.centerGiven) origins.height = from.height;
        tag(shape, o.line, o.endLine);
        Object.defineProperty(shape, 'origins', { value: origins, enumerable: false, writable: true });
        approx = unique(approx); notes.push.apply(notes, approx);
        Object.defineProperty(shape, 'approx', { value: approx, enumerable: false, writable: true });
        shapes.push(shape);
      } catch (error) { skipped.push(o.line); problems.push('Line ' + o.line + ': ' + error.message + '.'); }
    });
    mergeRings(shapes);
    return { shapes: shapes, skipped: unique(skipped), notes: unique(notes), problems: problems, setup: setupInNm(result.setup, U) };
  }
  function setupInNm(setup, U) {
    if (!setup) return null;
    return {
      line: setup.line, dimensions: setup.dimensions, resolution: setup.resolution, walls: setup.walls, kPoint: setup.kPoint,
      cell: setup.cell ? { size: setup.cell.size.map(function (v) { return v * U; }), line: setup.cell.line } : null,
      center: setup.center.map(function (v) { return v * U; }),
      layers: setup.layers.map(function (l) { return { kind: l.kind, thickness: l.thickness * U, direction: l.direction, side: l.side, line: l.line }; }),
      sources: (setup.sources || []).map(function (s) {
        return { kind: s.kind, line: s.line, center: s.center.map(function (v) { return v * U; }), size: s.size.map(function (v) { return v * U; }),
          component: s.component, polarization: s.polarization, travel: s.travel, note: s.note };
      }),
      monitors: (setup.monitors || []).map(function (m) {
        return { kind: m.kind, line: m.line, addLine: m.addLine, center: m.center.map(function (v) { return v * U; }), size: m.size.map(function (v) { return v * U; }),
          normal: m.normal, weight: m.weight };
      })
    };
  }
  function layerSlabs(setup) {
    var out = [];
    if (!setup || !setup.cell) return out;
    var size = setup.cell.size, c = setup.center, dims = setup.dimensions === 2 ? [0, 1] : setup.dimensions === 1 ? [2] : [0, 1, 2];
    setup.layers.forEach(function (layer, index) {
      if (!(layer.thickness > 0)) return;
      (layer.direction === -1 ? dims : dims.filter(function (k) { return k === layer.direction; })).forEach(function (k) {
        var d = Math.min(layer.thickness, size[k]);
        // Meep's numbers: side mp.Low = 1 (the wall at the smaller coordinate), mp.High = 0.
        [[1, -1], [0, 1]].forEach(function (pair) {
          if (layer.side !== -1 && layer.side !== pair[0]) return;
          var centre = c.slice(), extent = size.slice();
          centre[k] = c[k] + pair[1] * (size[k] / 2 - d / 2); extent[k] = d;
          out.push({ center: centre, size: extent, layer: index, axis: k, side: pair[1] });
        });
      });
    });
    return out;
  }

  function fromGds(text) {
    var vars = {}, layerMaterial = {}, defs = {}, refs = {}, shapes = [], skipped = [], notes = [];
    // Our own header keeps the material of each layer: "# Layers: (1, 0) Si | (2, 0) SiO2".
    var header = /#\s*Layers:(.*)/.exec(text);
    if (header) header[1].split('|').forEach(function (part) {
      var m = /\((\d+)\s*,\s*(\d+)\)\s*([A-Za-z_][\w.]*)(?:\s+n=([\d.]+))?/.exec(part);
      if (!m) return;
      var given = {}; if (m[4]) given[m[3]] = Number(m[4]);   // "Si n=2" is the user's own n = 2, not the library's silicon
      var mat = materialFromName(m[3], given);
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
      var source = statement.text, m, lastLine = statement.marks.length ? statement.marks[statement.marks.length - 1][1] : statement.line;
      try {
        if (/^(import|from)\b|\.activate\(|\.write_gds\(|\.show\(|^print\(|gf\.Component\(/.test(source)) return;
        if ((m = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/.exec(source)) && factory(m[2].trim())) { defs[m[1]] = factory(m[2].trim()); return; }
        if ((m = /^(?:([A-Za-z_]\w*)\s*=\s*)?[A-Za-z_]\w*\s*(?:\.add_ref\s*\(([\s\S]+)\)|<<\s*([\s\S]+))$/.exec(source))) {
          var def = resolve(m[2] || m[3]);
          if (!def) throw new Error('unknown component');
          var shape = build(def, statement.comment, 0, 0);
          tag(shape, statement.line, lastLine); shapes.push(shape); if (m[1]) refs[m[1]] = shape;
          return;
        }
        if ((m = /^([A-Za-z_]\w*)\.d?(move|movex|movey)\s*\(([\s\S]+)\)$/.exec(source)) && refs[m[1]]) {
          var target = refs[m[1]];
          if (m[2] === 'move') { var d = tuple(m[3], vars); target.x += d[0] * U; target.y += d[1] * U; }
          else if (m[2] === 'movex') target.x += evaluate(m[3], vars) * U;
          else target.y += evaluate(m[3], vars) * U;
          target.endLine = Math.max(target.endLine, lastLine);
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
          shapes.push(tag(poly, statement.line, lastLine));
          return;
        }
        if ((m = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/.exec(source))) { vars[m[1]] = evaluate(m[2], vars); return; }
        throw new Error('not understood');
      } catch (error) { skipped.push(statement.line); }
    });
    return { shapes: shapes, skipped: unique(skipped), notes: unique(notes), problems: [] };
  }
  function unique(list) { return list.filter(function (item, index) { return list.indexOf(item) === index; }).sort(function (a, b) { return typeof a === 'number' ? a - b : 0; }); }

  var api = Object.freeze({
    MATERIALS: MATERIALS, TYPES: TYPES, materialById: materialById, materialLabel: materialLabel, materialColor: materialColor,
    newShape: newShape, prismPoints: prismPoints, halfExtent: halfExtent,
    toGds: toGds, toLayout: toLayout, toMeep: toMeep, fromGds: fromGds, fromMeep: fromMeep, fromMeepBasic: fromMeepBasic,
    meepRangeWarning: meepRangeWarning,
    meepScaleIn: meepScaleIn,
    meepOutside: meepOutside,
    layerSlabs: layerSlabs
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ElyvrisStudioCode = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
