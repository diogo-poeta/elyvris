/* Elyvris Studio assistant — turns a sentence into a design.
 *
 * This is a rule-based reader, not a language model. It looks for known
 * words (shapes, materials, sizes, units) and asks for whatever is missing.
 * It runs in the browser and sends nothing anywhere.
 *
 * interpret(text, state, context) returns
 *   { state, reply: [sentences], chips: [{label, send}], ready, reset }
 * All lengths in the state are in nanometres (nm).
 *
 * To connect a real language model later, replace interpret() with a call
 * that returns the same object. The rest of the page does not need to change.
 */
(function (root) {
  'use strict';

  /* Materials the assistant can name. `id` points to a record in
   * materials-data.json; `id: null` means "recognised, but no referenced
   * optical constants are included yet". Longer names are tried first. */
  var MATERIALS = [
    { name: 'crystalline silicon', formula: 'Si', id: 'silicon-green', words: ['crystalline silicon', 'c-si', 'silicon', 'si'] },
    { name: 'titanium dioxide', formula: 'TiO₂', id: 'tio2-siefke', words: ['titanium dioxide', 'titanium oxide', 'titania', 'tio2'] },
    { name: 'fused silica', formula: 'SiO₂', id: 'silica-malitson', words: ['fused silica', 'silicon dioxide', 'silica', 'sio2'] },
    { name: 'magnesium fluoride', formula: 'MgF₂', id: 'mgf2-rodriguez', words: ['magnesium fluoride', 'mgf2'] },
    { name: 'gold', formula: 'Au', id: 'gold-johnson', words: ['gold', 'au'] },
    { name: 'aluminium', formula: 'Al', id: 'aluminum-rakic', words: ['aluminium', 'aluminum', 'al'] },
    { name: 'N-BK7 optical glass', formula: 'N-BK7', id: 'bk7-schott', words: ['n-bk7', 'bk7', 'borosilicate glass', 'glass'] },
    { name: 'amorphous silicon', formula: 'a-Si', id: null, words: ['amorphous silicon', 'a-si'] },
    { name: 'silicon nitride', formula: 'Si₃N₄', id: null, words: ['silicon nitride', 'si3n4', 'sin'] },
    { name: 'silicon carbide', formula: 'SiC', id: null, words: ['silicon carbide', 'sic'] },
    { name: 'silver', formula: 'Ag', id: null, words: ['silver', 'ag'] },
    { name: 'copper', formula: 'Cu', id: null, words: ['copper', 'cu'] },
    { name: 'platinum', formula: 'Pt', id: null, words: ['platinum'] },
    { name: 'chromium', formula: 'Cr', id: null, words: ['chromium'] },
    { name: 'titanium', formula: 'Ti', id: null, words: ['titanium'] },
    { name: 'titanium nitride', formula: 'TiN', id: null, words: ['titanium nitride'] },
    { name: 'germanium', formula: 'Ge', id: null, words: ['germanium', 'ge'] },
    { name: 'gallium arsenide', formula: 'GaAs', id: null, words: ['gallium arsenide', 'gaas'] },
    { name: 'gallium phosphide', formula: 'GaP', id: null, words: ['gallium phosphide'] },
    { name: 'gallium nitride', formula: 'GaN', id: null, words: ['gallium nitride', 'gan'] },
    { name: 'indium phosphide', formula: 'InP', id: null, words: ['indium phosphide', 'inp'] },
    { name: 'aluminium oxide', formula: 'Al₂O₃', id: null, words: ['aluminium oxide', 'aluminum oxide', 'alumina', 'sapphire', 'al2o3'] },
    { name: 'aluminium nitride', formula: 'AlN', id: null, words: ['aluminium nitride', 'aluminum nitride', 'aln'] },
    { name: 'hafnium dioxide', formula: 'HfO₂', id: null, words: ['hafnium dioxide', 'hafnium oxide', 'hafnia', 'hfo2'] },
    { name: 'zirconium dioxide', formula: 'ZrO₂', id: null, words: ['zirconium dioxide', 'zirconia', 'zro2'] },
    { name: 'zinc oxide', formula: 'ZnO', id: null, words: ['zinc oxide', 'zno'] },
    { name: 'tantalum pentoxide', formula: 'Ta₂O₅', id: null, words: ['tantalum pentoxide', 'tantalum oxide', 'ta2o5'] },
    { name: 'niobium pentoxide', formula: 'Nb₂O₅', id: null, words: ['niobium pentoxide', 'niobium oxide', 'nb2o5'] },
    { name: 'lithium niobate', formula: 'LiNbO₃', id: null, words: ['lithium niobate', 'linbo3'] },
    { name: 'barium titanate', formula: 'BaTiO₃', id: null, words: ['barium titanate', 'batio3'] },
    { name: 'indium tin oxide', formula: 'ITO', id: null, words: ['indium tin oxide', 'ito'] },
    { name: 'calcium fluoride', formula: 'CaF₂', id: null, words: ['calcium fluoride', 'caf2'] },
    { name: 'diamond', formula: 'C', id: null, words: ['diamond'] },
    { name: 'crystalline quartz', formula: 'SiO₂', id: null, words: ['crystalline quartz', 'quartz'] },
    { name: 'PMMA', formula: 'PMMA', id: null, words: ['pmma', 'acrylic'] },
    { name: 'polystyrene', formula: 'PS', id: null, words: ['polystyrene', 'latex'] },
    { name: 'water', formula: 'H₂O', id: null, words: ['water', 'h2o'] }
  ];
  var MATERIAL_WORDS = [];
  MATERIALS.forEach(function (material) { material.words.forEach(function (word) { MATERIAL_WORDS.push({ word: word, material: material }); }); });
  MATERIAL_WORDS.sort(function (a, b) { return b.word.length - a.word.length; });

  /* Surrounding media: a constant, real refractive index (no dispersion). */
  var MEDIA = {
    air: { n: 1, label: 'air' }, vacuum: { n: 1, label: 'vacuum' },
    water: { n: 1.33, label: 'water' }, glass: { n: 1.5, label: 'glass' },
    silica: { n: 1.45, label: 'silica' }, oil: { n: 1.515, label: 'immersion oil' }
  };

  var SHAPES = [
    { shape: 'sphere', words: ['nanosphere', 'spherical', 'sphere', 'ball', 'bead'] },
    { shape: 'cylinder', flat: true, words: ['circular', 'circle'] },
    { shape: 'cylinder', words: ['nanopillar', 'nanodisk', 'nanodisc', 'nanowire', 'nanorod', 'cylindrical', 'cylinder', 'pillar', 'disk', 'disc', 'wire', 'rod'] },
    { shape: 'box', flat: true, words: ['rectangular', 'rectangle', 'square'] },
    { shape: 'box', cube: true, words: ['cube', 'cubic'] },
    { shape: 'box', words: ['cuboid', 'block', 'brick', 'box', 'slab'] }
  ];
  var UNSUPPORTED = ['ellipsoid', 'ellipse', 'cone', 'pyramid', 'triangle', 'torus', 'ring', 'hexagon', 'star', 'waveguide', 'grating', 'bowtie', 'dimer', 'array', 'core-shell', 'shell'];

  var NUM = '(\\d+(?:\\.\\d+)?|\\.\\d+)';
  var UNIT = '(nm|nanomet(?:er|re)s?|um|microns?|micromet(?:er|re)s?|mm|millimet(?:er|re)s?)';
  var EQUALS = '\\s*(?:of|is|to|=|:)?\\s*';
  var SIZE_LIMIT_NM = 1e6; // 1 mm

  function unitFactor(unit) {
    if (!unit) return null;
    if (unit[0] === 'n') return 1;
    if (unit[0] === 'u' || unit.indexOf('micro') === 0) return 1000;
    return 1e6;
  }
  function blank(text, match) { return text.replace(match, function (m) { return ' '.repeat(m.length); }); }
  function hasWord(text, word) {
    var escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + escaped + '(?![a-z0-9])').test(text);
  }
  function tidy(value) { return Number(value.toPrecision(6)); }
  function formatLength(nm) {
    if (nm >= 1e6) return tidy(nm / 1e6) + ' mm';
    if (nm >= 10000) return tidy(nm / 1000) + ' µm';
    return tidy(nm) + ' nm';
  }

  function emptyState() {
    return {
      dim: null, shape: null, material: null,
      radius: null, height: null, sx: null, sy: null, sz: null,
      medium: { n: 1, label: 'air' }, range: null, polarization: 'parallel', asking: null
    };
  }
  function copy(state) { return JSON.parse(JSON.stringify(state)); }

  function materialName(material) {
    if (!material) return 'no material';
    if (material.kind === 'file') return 'your uploaded material';
    if (material.kind === 'constant') return 'a material with n = ' + material.n + (material.k ? ', k = ' + material.k : '');
    return material.name + ' (' + material.formula + ')';
  }

  /* Which parts of the design are still missing, in the order we ask. */
  function missing(state) {
    if (!state.shape) return 'shape';
    if (state.shape === 'cylinder' && !state.dim) return 'dim';
    if (!state.material) return 'material';
    if (state.shape === 'sphere' || state.shape === 'cylinder') {
      if (!state.radius) return 'radius';
      if (state.shape === 'cylinder' && state.dim === '3d' && !state.height) return 'height';
      return null;
    }
    if (!state.sx) return 'sx';
    if (!state.sy) return 'sy';
    if (state.dim !== '2d' && !state.sz) return 'sz';
    return null;
  }

  /* 'exact'    : sphere or 2D (infinitely long) cylinder — Mie theory.
   * 'geometry' : everything else — drawn and exported, not calculated. */
  function mode(state) {
    if (state.shape === 'sphere') return 'exact';
    if (state.shape === 'cylinder' && state.dim === '2d') return 'exact';
    return 'geometry';
  }

  function describe(state) {
    var where = ' in ' + state.medium.label + ' (n = ' + state.medium.n + ')';
    var what = materialName(state.material);
    if (state.shape === 'sphere') return 'a 3D sphere of ' + what + ', radius ' + formatLength(state.radius) + ',' + where;
    if (state.shape === 'cylinder' && state.dim === '2d') return 'a 2D cylinder (infinitely long) of ' + what + ', radius ' + formatLength(state.radius) + ',' + where;
    if (state.shape === 'cylinder') return 'a 3D cylinder of ' + what + ', radius ' + formatLength(state.radius) + ', height ' + formatLength(state.height) + ',' + where;
    if (state.dim === '2d') return 'a 2D rectangle of ' + what + ', ' + formatLength(state.sx) + ' × ' + formatLength(state.sy) + ',' + where;
    return 'a 3D box of ' + what + ', ' + formatLength(state.sx) + ' × ' + formatLength(state.sy) + ' × ' + formatLength(state.sz) + ',' + where;
  }

  var QUESTIONS = {
    shape: { text: 'Which shape would you like?', chips: [['Sphere', 'a sphere'], ['Cylinder', 'a cylinder'], ['Box', 'a box']] },
    dim: { text: 'Should the cylinder be 2D or 3D? A 2D cylinder is infinitely long and has an exact calculation. A 3D cylinder has a finite height; I can draw and export it, but not calculate its spectrum yet.', chips: [['2D, infinitely long', '2D'], ['3D, finite height', '3D']] },
    material: { text: 'Which material? You can write a name or formula (Si, TiO2, gold…), give a constant index such as "n = 2.4", or upload a .txt file with your own n and k.', chips: [['Si', 'Si'], ['TiO₂', 'TiO2'], ['Gold', 'gold'], ['Upload .txt', '@upload']] },
    radius: { text: 'What radius? (You can also give a diameter.)', chips: [['60 nm', 'radius 60 nm'], ['90 nm', 'radius 90 nm'], ['120 nm', 'radius 120 nm']] },
    height: { text: 'What height?', chips: [['100 nm', 'height 100 nm'], ['200 nm', 'height 200 nm'], ['400 nm', 'height 400 nm']] },
    sx: { text: 'What size along x?', chips: [['200 nm', 'x = 200 nm'], ['400 nm', 'x = 400 nm']] },
    sy: { text: 'What size along y?', chips: [['200 nm', 'y = 200 nm'], ['400 nm', 'y = 400 nm']] },
    sz: { text: 'What size along z (the height)?', chips: [['100 nm', 'z = 100 nm'], ['200 nm', 'z = 200 nm']] },
    ambiguous: { text: 'radius-or-diameter', chips: [] }
  };

  function interpret(input, previous, context) {
    context = context || {};
    var reply = [], state = previous ? copy(previous) : emptyState();
    var original = String(input || '').slice(0, 400);
    // Normalise: subscript digits, micro signs, multiplication signs, lower case.
    var text = original.replace(/[₀-₉]/g, function (c) { return String(c.charCodeAt(0) - 0x2080); })
      .replace(/[µμ]\s*m\b/g, 'um').replace(/[×✕]/g, ' x ').replace(/[–—]/g, '-').replace(/,(?=\s)/g, ' ').toLowerCase();

    if (!text.trim()) return { state: state, reply: ['Please type what you would like to design.'], chips: [], ready: false };
    if (/^\s*(help|\?|what can you do|examples?)\b/.test(text)) {
      return { state: state, ready: false, chips: [['Si sphere', 'Design a 3D sphere of Si, radius 90 nm'], ['TiO₂ 2D cylinder', 'Design a 2D cylinder of TiO2, radius 100 nm'], ['Gold in water', 'Design a gold sphere, radius 40 nm, in water']].map(toChip),
        reply: ['I read a sentence and build a design from it. Tell me a shape (sphere, cylinder, box), a material (Si, TiO2, gold, "n = 2.4", or your uploaded file), and sizes with units (nm, µm, mm).', 'You can then change one thing at a time: "radius 120 nm", "make it TiO2", "in water", "from 400 to 900 nm".'] };
    }
    if (/^\s*(reset|start over|start again|clear|new design|restart)\b/.test(text)) {
      return { state: emptyState(), reply: ['Starting again. What would you like to design?'], chips: QUESTIONS.shape.chips.map(toChip), ready: false, reset: true };
    }

    var asking = state.asking; state.asking = null;
    var m;

    // A new "design a <shape>" request starts from an empty design.
    var shapeFound = null, flat = false, cube = false;
    SHAPES.forEach(function (entry) {
      if (shapeFound) return;
      entry.words.forEach(function (word) { if (!shapeFound && hasWord(text, word)) { shapeFound = entry.shape; flat = !!entry.flat; cube = !!entry.cube; } });
    });
    if (shapeFound && /\b(design|create|build|draw|new|generate|simulate|add)\b/.test(text)) { state = emptyState(); asking = null; }

    // --- Wavelength range: "from 300 to 800 nm", "between 400 and 900 nm". ---
    var rangePattern = new RegExp('(?:from|between|wavelengths?|spectrum|range)\\D{0,14}?' + NUM + '\\s*' + UNIT + '?\\s*(?:to|and|-)\\s*' + NUM + '\\s*' + UNIT + '?');
    if ((m = text.match(rangePattern))) {
      var factorB = unitFactor(m[4]) || 1, factorA = unitFactor(m[2]) || factorB;
      var low = Number(m[1]) * factorA, high = Number(m[3]) * factorB;
      if (low > 0 && high > low) { state.range = { min: low, max: high }; reply.push('Wavelength range: ' + tidy(low) + ' to ' + tidy(high) + ' nm.'); }
      text = blank(text, m[0]);
    }

    // --- Surrounding medium. ---
    if ((m = text.match(/\b(?:in|inside|within|immersed in|embedded in|surrounded by|under)\s+(?:a |an |the )?(air|vacuum|water|glass|silica|oil)\b/))) {
      state.medium = { n: MEDIA[m[1]].n, label: MEDIA[m[1]].label };
      text = blank(text, m[0]);
    }
    if ((m = text.match(new RegExp('(?:medium|surrounding|background|host)(?:\\s+(?:refractive\\s+)?index)?\\s*(?:n\\s*)?(?:of|is|=|:)?\\s*' + NUM)))) {
      var nMedium = Number(m[1]);
      if (nMedium >= 1 && nMedium <= 5) state.medium = { n: nMedium, label: 'a medium' };
      else reply.push('I kept the previous medium: its index must be between 1 and 5.');
      text = blank(text, m[0]);
    }

    // --- Constant refractive index: "n = 2.4", "k = 0.01", "index 2.4". ---
    var nMatch = text.match(new RegExp('(?:\\bn|refractive index|index)\\s*(?:of|is|=|:)?\\s*' + NUM + '(?!\\s*' + UNIT + ')'));
    var kMatch = text.match(new RegExp('\\bk\\s*(?:of|is|=|:)?\\s*' + NUM + '(?!\\s*' + UNIT + ')'));
    if (nMatch) {
      var nValue = Number(nMatch[1]), kValue = kMatch ? Number(kMatch[1]) : 0;
      if (nValue > 0 && nValue <= 20 && kValue >= 0 && kValue <= 20) state.material = { kind: 'constant', n: nValue, k: kValue };
      else reply.push('I could not use that index: n must be between 0 and 20, and k between 0 and 20.');
      text = blank(text, nMatch[0]); if (kMatch) text = blank(text, kMatch[0]);
    } else if (kMatch && state.material && state.material.kind === 'constant') {
      state.material.k = Number(kMatch[1]); text = blank(text, kMatch[0]);
    }

    // --- 2D or 3D. ---
    if ((m = text.match(/\b([23])\s*-?\s*d\b|\b(two|three)[\s-]dimensional\b/))) {
      state.dim = (m[1] === '2' || m[2] === 'two') ? '2d' : '3d';
      text = blank(text, m[0]);
    }

    // --- Polarisation (used by the 2D cylinder). ---
    if (/\bunpolari[sz]ed\b/.test(text)) state.polarization = 'unpolarized';
    else if (/\bperpendicular\b/.test(text) || hasWord(text, 'te')) state.polarization = 'perpendicular';
    else if (/\bparallel\b/.test(text) || hasWord(text, 'tm')) state.polarization = 'parallel';
    if (hasWord(text, 'te') || hasWord(text, 'tm')) reply.push('I read TM as "electric field along the cylinder axis" and TE as "electric field perpendicular to it". Some books use the opposite names, so check the label under the plot.');

    // --- Shape. ---
    if (shapeFound) {
      if (state.shape && state.shape !== shapeFound) { state.radius = state.height = state.sx = state.sy = state.sz = null; }
      state.shape = shapeFound;
      if (flat && !state.dim) state.dim = '2d';
      if (shapeFound === 'sphere' && state.dim === '2d') {
        state.shape = 'cylinder';
        reply.push('A sphere is a 3D shape. Its 2D counterpart is a circle, which stands for an infinitely long cylinder, so I used a 2D cylinder.');
      }
      if (state.shape === 'sphere') state.dim = '3d';
    } else {
      var unsupported = UNSUPPORTED.filter(function (word) { return hasWord(text, word); })[0];
      if (unsupported) reply.push('The shape "' + unsupported + '" is not available yet. You can choose a sphere, a cylinder or a box.');
    }

    // --- Material. ---
    if (/\b(my|uploaded|inserted|custom|own)\s+(file|material|data|index|txt)\b|\.txt\b|\b(the|that) file\b|\buploaded\b|\binserted\b/.test(text)) {
      if (context.hasFile) state.material = { kind: 'file' };
      else reply.push('No material file is loaded yet. Use "Upload .txt" and I will use it.');
    } else if (!nMatch) {
      var found = null;
      for (var w = 0; w < MATERIAL_WORDS.length && !found; w++) if (hasWord(text, MATERIAL_WORDS[w].word)) found = MATERIAL_WORDS[w];
      if (found) {
        var material = found.material;
        if (material.id) {
          state.material = { kind: 'library', id: material.id, name: material.name, formula: material.formula };
          if (found.word === 'glass') reply.push('"Glass" can mean many materials; I used N-BK7 optical glass.');
        } else {
          reply.push('I recognise ' + material.formula + ' as ' + material.name + ', but Elyvris has no referenced optical constants for it yet. You can upload a .txt file with wavelength, n and k, or give a constant index such as "n = 2.0".');
        }
      }
    }

    // --- Sizes. Every number becomes nanometres. ---
    var assumedUnit = false;
    function length(value, unit, fallbackUnit) {
      var factor = unitFactor(unit) || unitFactor(fallbackUnit);
      if (!factor) { factor = 1; assumedUnit = true; }
      return Number(value) * factor;
    }
    var sep = '\\s*(?:x|by|\\*)\\s*';
    var triple = text.match(new RegExp(NUM + '\\s*' + UNIT + '?' + sep + NUM + '\\s*' + UNIT + '?' + sep + NUM + '\\s*' + UNIT + '?'));
    var pair = triple ? null : text.match(new RegExp(NUM + '\\s*' + UNIT + '?' + sep + NUM + '\\s*' + UNIT + '?'));
    var listed = null;
    if (triple) { listed = [length(triple[1], triple[2], triple[6] || triple[4]), length(triple[3], triple[4], triple[6]), length(triple[5], triple[6], triple[4] || triple[2])]; text = blank(text, triple[0]); }
    if (pair) { listed = [length(pair[1], pair[2], pair[4]), length(pair[3], pair[4], pair[2])]; text = blank(text, pair[0]); }

    function keyed(names, trailing) {
      var before = new RegExp('(?:' + names + ')' + EQUALS + NUM + '\\s*' + UNIT + '?');
      var after = trailing ? new RegExp(NUM + '\\s*' + UNIT + '?\\s*(?:in\\s+)?(?:' + trailing + ')\\b') : null;
      var hit = text.match(before) || (after && text.match(after));
      if (!hit) return null;
      text = blank(text, hit[0]);
      return length(hit[1], hit[2]);
    }
    var diameter = keyed('\\bdiameter|\\bdia\\b|\\bd\\s*=', 'diameter|across');
    var radius = keyed('\\bradius|\\bradii|\\br\\s*=', 'radius');
    var height = keyed('\\bheight|\\bthickness|\\bh\\s*=', 'height|tall|high|thick');
    var lengthValue = keyed('\\blength|\\bl\\s*=', 'long');
    var width = keyed('\\bwidth|\\bw\\s*=', 'wide');
    var side = keyed('\\bside(?:\\s+length)?|\\bedge(?:\\s+length)?', 'side|sides');
    var xValue = keyed('\\bx\\s*[=:]'), yValue = keyed('\\by\\s*[=:]'), zValue = keyed('\\bz\\s*[=:]');
    var loose = text.match(new RegExp(NUM + '\\s*' + UNIT)) || (asking ? text.match(new RegExp('(?:^|\\s)' + NUM + '(?=\\s|$)')) : null);
    var looseValue = loose ? length(loose[1], loose[2]) : null;

    var isRound = state.shape === 'sphere' || state.shape === 'cylinder';
    if (radius) state.radius = radius;
    if (diameter) state.radius = diameter / 2;
    if (height) { if (state.shape === 'box') state.sz = height; else state.height = height; }
    if (lengthValue) { if (state.shape === 'box') state.sx = lengthValue; else if (state.shape === 'cylinder') state.height = lengthValue; }
    if (width) { if (state.shape === 'box') state.sy = width; else if (isRound) state.radius = width / 2; }
    if (side) { state.sx = state.sy = side; if (state.dim !== '2d') state.sz = side; }
    if (xValue) state.sx = xValue;
    if (yValue) state.sy = yValue;
    if (zValue) { if (state.shape === 'cylinder') state.height = zValue; else state.sz = zValue; }
    if (isRound && (xValue || yValue) && !radius && !diameter) {
      var across = xValue || yValue;
      if (xValue && yValue && Math.abs(xValue - yValue) > 1e-9 * xValue) reply.push('A circular cross-section needs x = y. I used x (' + formatLength(xValue) + ') as the diameter; ellipses are not available yet.');
      state.radius = across / 2;
    }

    if (listed) {
      if (state.shape === 'box' || !state.shape) {
        state.sx = listed[0]; state.sy = listed[1];
        if (listed.length === 3) { state.sz = listed[2]; if (!state.dim) state.dim = '3d'; }
        else if (!state.dim && state.shape === 'box') state.dim = '2d';
      } else if (state.shape === 'cylinder') {
        if (listed.length === 3 || state.dim === '2d') {
          if (Math.abs(listed[0] - listed[1]) > 1e-9 * listed[0]) reply.push('A circular cylinder needs x = y. I used x (' + formatLength(listed[0]) + ') as the diameter; elliptical cross-sections are not available yet.');
          state.radius = listed[0] / 2;
          if (listed.length === 3) { state.height = listed[2]; if (!state.dim) state.dim = '3d'; }
        } else {
          state.radius = listed[0] / 2; state.height = listed[1]; if (!state.dim) state.dim = '3d';
          reply.push('I read ' + formatLength(listed[0]) + ' as the diameter and ' + formatLength(listed[1]) + ' as the height.');
        }
      } else if (state.shape === 'sphere') {
        state.radius = listed[0] / 2;
        reply.push('A sphere has a single size. I used ' + formatLength(listed[0]) + ' as its diameter.');
      }
    }

    // A number with no label: use it for the question just asked, or ask what it is.
    var ambiguous = null;
    if (looseValue && !listed) {
      if (asking && asking !== 'material' && asking !== 'shape' && asking !== 'dim') {
        if (asking === 'diameter') state.radius = looseValue / 2;
        else state[asking] = looseValue;
      } else if (isRound && !radius && !diameter && !width && !xValue && !yValue) {
        if (state.shape === 'cylinder' && state.dim === '3d' && state.radius && !state.height && !height) state.height = looseValue;
        else ambiguous = looseValue;
      } else if (state.shape === 'box' && cube) {
        state.sx = state.sy = state.sz = looseValue; if (!state.dim) state.dim = '3d';
      }
    }
    if (state.shape === 'box' && state.sz && !state.dim) state.dim = '3d';
    if (state.shape === 'box' && !state.dim && (state.sx || state.sy)) state.dim = '3d';
    if (assumedUnit) reply.push('You gave a size without a unit, so I assumed nanometres (nm).');

    // Reject sizes outside a sensible range instead of guessing.
    ['radius', 'height', 'sx', 'sy', 'sz'].forEach(function (key) {
      var value = state[key];
      if (value !== null && !(value >= 1 && value <= SIZE_LIMIT_NM)) {
        reply.push('I ignored a size of ' + formatLength(value || 0) + ': sizes must be between 1 nm and 1 mm.');
        state[key] = previous && previous[key] ? previous[key] : null;
      }
    });

    // --- What is still missing? ---
    var chips = [];
    if (ambiguous && state.shape) {
      state.asking = 'radius';
      reply.push('Is ' + formatLength(ambiguous) + ' the radius or the diameter?');
      chips = [['Radius', 'radius ' + formatLength(ambiguous).replace('µ', 'u')], ['Diameter', 'diameter ' + formatLength(ambiguous).replace('µ', 'u')]].map(toChip);
      return { state: state, reply: reply, chips: chips, ready: false };
    }
    var need = missing(state);
    if (need) {
      state.asking = need;
      var known = [];
      if (state.shape) known.push((state.dim && state.shape !== 'sphere' ? state.dim.toUpperCase() + ' ' : '') + (state.shape === 'box' && state.dim === '2d' ? 'rectangle' : state.shape));
      if (state.material) known.push(materialName(state.material));
      if (known.length) reply.push('So far: ' + known.join(' of ') + '.');
      reply.push(QUESTIONS[need].text);
      return { state: state, reply: reply, chips: QUESTIONS[need].chips.map(toChip), ready: false };
    }
    if (state.shape === 'box' && state.dim === '2d') state.sz = null;
    reply.push('Understood: ' + describe(state) + '.');
    return { state: state, reply: reply, chips: [], ready: true };
  }

  function toChip(pair) { return { label: pair[0], send: pair[1] }; }

  var api = Object.freeze({ interpret: interpret, emptyState: emptyState, missing: missing, mode: mode, describe: describe, materialName: materialName, formatLength: formatLength, materials: MATERIALS });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ElyvrisAssistant = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
