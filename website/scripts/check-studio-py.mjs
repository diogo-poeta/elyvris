/* Checks studio-py.js against real Meep 1.30 results (meep-cases/, meep-setup-cases/).
 * Browser console on studio.html: (await import('./scripts/check-studio-py.mjs')).default */
const Py = globalThis.ElyvrisPy, C = globalThis.ElyvrisStudioCode;
let checks = 0;
function ok(condition, label) { if (!condition) throw new Error(label); checks++; }
function same(actual, expected, label) { const a = JSON.stringify(actual), e = JSON.stringify(expected); if (a !== e) throw new Error(`${label}: got ${a}, expected ${e}`); checks++; }
const text = async path => { const response = await fetch(new URL(path, import.meta.url)); if (!response.ok) throw new Error('cannot load ' + path); return response.text(); };
const close = (a, b) => (a === 'inf' || b === 'inf' || a === Infinity || b === Infinity) ? ((a === 'inf' || a === Infinity) && (b === 'inf' || b === Infinity)) : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const closeVec = (a, b) => a.length === b.length && a.every((v, i) => close(v, b[i]));
const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };

/* ---- 1. The same geometry as the real Meep ---- */
const expected = JSON.parse(await text('./meep-cases/expected.json'));
const report = [];
for (const [name, objects] of Object.entries(expected.cases)) {
  const source = await text('./meep-cases/' + name), result = Py.readMeep(source);
  same(result.diagnostics, [], `${name}: no problems reported`);
  same(result.objects.length, objects.length, `${name}: number of objects`);
  objects.forEach((want, i) => {
    const got = result.objects[i], where = `${name} object ${i + 1} (line ${got.line})`;
    same(got.kind, want.kind, `${where}: kind`);
    ok(got.medium.n !== null && close(got.medium.n, want.n), `${where}: index ${got.medium.n} vs ${want.n}`);
    if (want.center) ok(closeVec(got.center, want.center), `${where}: center ${got.center} vs ${want.center}`);
    for (const key of ['radius', 'radius2', 'height']) if (want[key] !== undefined) ok(close(got[key], want[key]), `${where}: ${key} ${got[key]} vs ${want[key]}`);
    if (want.axis) ok(closeVec(unit(got.axis), unit(want.axis)), `${where}: axis`);
    if (want.size) ok(closeVec(got.size, want.size), `${where}: size ${got.size} vs ${want.size}`);
    if (want.vertices) ok(got.vertices.length === want.vertices.length && got.vertices.every((v, k) => closeVec(v, want.vertices[k])), `${where}: vertices`);
    ok(got.line >= 1 && got.endLine >= got.line && got.endLine <= source.split('\n').length, `${where}: line numbers`);
  });
  report.push(`${name}: ${objects.length} objects match Meep ${expected.meep}`);
}

const setups = JSON.parse(await text('./meep-setup-cases/setup.json'));
for (const [name, want] of Object.entries(setups.cases)) {
  const source = await text((name === 'ring_simulation.py' ? './meep-cases/' : './meep-setup-cases/') + name), got = Py.readMeep(source).setup;
  ok(got && got.cell, `${name}: a cell is read`);
  ok(closeVec(got.cell.size, want.cell), `${name}: cell ${got.cell.size} vs ${want.cell}`);
  ok(closeVec(got.center, want.center), `${name}: centre ${got.center} vs ${want.center}`);
  same([got.dimensions, got.resolution, got.walls], [want.dimensions, want.resolution, want.walls], `${name}: dimensions, resolution, walls`);
  ok(want.kPoint === null ? got.kPoint === null : closeVec(got.kPoint, want.kPoint), `${name}: k_point`);
  same(got.layers.map(l => [l.kind, l.direction, l.side]), want.layers.map(l => [l.kind, l.direction, l.side]), `${name}: layer kinds, directions, sides`);
  ok(got.layers.every((l, i) => close(l.thickness, want.layers[i].thickness)), `${name}: layer thicknesses`);
  ok([got.line, got.cell.line, ...got.layers.map(l => l.line), ...got.sources.map(s => s.line), ...got.monitors.map(m => m.line)].every(line => line >= 1 && line <= source.split('\n').length), `${name}: line numbers`);
  // Sources and monitor regions: what Meep holds for each.
  same(got.sources.map(s => s.kind), want.sources.map(s => s.kind), `${name}: source kinds`);
  got.sources.forEach((s, i) => {
    const w = want.sources[i], where = `${name} source ${i + 1}`;
    ok(closeVec(s.center, w.center) && closeVec(s.size, w.size), `${where}: centre and size`);
    if (w.component) same(s.component, w.component, `${where}: component`);
    if (w.beam_kdir) ok(closeVec(s.travel, unit(w.beam_kdir)) && closeVec(s.polarization, unit(w.beam_E0)), `${where}: beam direction and field`);
    if (w.eig_kpoint) same(s.travel && s.travel.findIndex(x => x !== 0), w.direction >= 0 ? w.direction : s.size.findIndex((x, k) => x === 0 && k < got.dimensions), `${where}: launch axis`);
  });
  same(got.monitors.map(m => m.kind), want.monitors.map(m => m.kind), `${name}: monitor kinds`);
  got.monitors.forEach((m, i) => {
    const w = want.monitors[i], where = `${name} monitor ${i + 1}`;
    ok(closeVec(m.center, w.center) && closeVec(m.size, w.size), `${where}: centre and size`);
    ok(Math.sign(m.weight) === Math.sign(w.weight), `${where}: weight sign`);
  });
  report.push(`${name}: setup matches Meep ${setups.meep}`);
}

const directions = JSON.parse(await text('./meep-setup-cases/directions.json'));
for (const [name, measured] of Object.entries(directions.cases)) {
  const got = Py.readMeep(await text('./meep-setup-cases/' + name)).setup, [f0, f1] = measured.fluxes, [m0, m1] = got.monitors, src = got.sources[0];
  [[m0, f0], [m1, f1]].forEach(([m, f], i) => {
    if (Math.abs(f) < 0.01 * Math.max(Math.abs(f0), Math.abs(f1))) return;   // too little power to give a sign
    const outward = Math.sign(m.center[0] - src.center[0]);
    same(Math.sign(f), Math.sign(m.normal[0] * outward), `${name} monitor ${i + 1}: the "+ flux" arrow agrees with the measured sign`);
  });
  const right = f1 * m1.normal[0], left = -f0 * m0.normal[0];   // power sent to +x and to -x
  const drawn = src.travel ? (src.travel[0] > 0 ? '+x' : '-x') : 'both';
  const seen = right > 20 * left ? '+x' : left > 20 * right ? '-x' : right / left > 0.5 && right / left < 2 ? 'both' : 'unclear';
  same(drawn, seen, `${name}: the source arrow (power to +x ${right.toPrecision(3)}, to -x ${left.toPrecision(3)})`);
  report.push(`${name}: arrows match Meep ${directions.meep} runs`);
}
const slabs = name => C.layerSlabs(C.fromMeep(name).setup).map(s => [s.center, s.size]);
same(slabs(await text('./meep-setup-cases/pml_sides_3d.py')), [[[1000, 1250, 0], [4000, 500, 2000]], [[-500, 0, 0], [1000, 3000, 2000]], [[2500, 0, 0], [1000, 3000, 2000]]], 'pml_sides_3d: layer boxes');
same(slabs(await text('./meep-setup-cases/slab_2d.py')), [[[-2500, 0, 0], [1000, 4000, 0]], [[2500, 0, 0], [1000, 4000, 0]]], 'slab_2d: layer boxes (x walls only, no z in 2D)');
same(slabs(await text('./meep-cases/ring_simulation.py')).length, 4, 'ring_simulation: PML on the four walls of a 2D cell');

/* ---- 2. Lines of code belong to shapes ---- */
const pillars = await text('./meep-cases/pillar_array.py'), pillarLines = pillars.split('\n');
const read = C.fromMeep(pillars);
same(read.shapes.length, 13, 'pillar array: 13 shapes');
same([read.shapes[0].line, read.shapes[0].endLine], [12, 14], 'pillar array: the substrate spans lines 12 to 14');
ok(/mp\.Cylinder/.test(pillarLines[read.shapes[5].line - 1]) && read.shapes[5].endLine === read.shapes[5].line + 2, 'pillar array: a pillar points at its mp.Cylinder call');
same(Object.keys(read.shapes[1]).includes('line'), false, 'line numbers are not part of the saved design');
same([read.shapes[1].type, read.shapes[1].material, read.shapes[1].radius, read.shapes[1].height, read.shapes[1].customName, read.shapes[1].customN, read.shapes[0].customName, read.shapes[0].customN], ['cylinder', 'custom', 110, 250, 'TiO2', 2.4, 'glass', 1.45], 'pillar array: sizes in nanometres; TiO2 = mp.Medium(index=2.4) keeps n = 2.4');
const ring = C.fromMeep(await text('./meep-cases/ring_simulation.py'));
same(ring.shapes.map(s => s.type), ['ring', 'box'], 'ring: two cylinders become one ring; the unused sphere is not part of the simulation');
same([ring.shapes[0].radius, ring.shapes[0].width, ring.shapes[0].height], [2000, 1000, Infinity], 'ring: sizes in nanometres');

/* ---- 3. What cannot be read is reported, with its line ---- */
const lines = result => result.diagnostics.map(d => d.line);
let r = Py.readMeep('import meep as mp\ngeometry = []\nwhile True:\n    geometry.append(mp.Sphere(radius=1))\ngeometry.append(mp.Sphere(radius=0.2))\n');
same([lines(r), r.objects.length], [[3], 1], 'a while loop is reported and skipped; the rest is read');
r = Py.readMeep('import meep as mp\ngeometry = [mp.Sphere(radius=rr), mp.Sphere(radius=0.1)]\n');
same([lines(r), r.objects.length], [[2], 0], 'an unknown name is reported; nothing is guessed');
r = Py.readMeep('import meep as mp\ngeometry = [mp.Wedge(radius=1, wedge_angle=1), mp.Sphere(radius=0.1)]\n');
same([lines(r), r.objects.length], [[2], 1], 'mp.Wedge is reported as not drawn');
r = Py.readMeep('import meep as mp\nclass A:\n    x = 1\n    def f(self):\n        return 2\ngeometry = [mp.Sphere(radius=0.1)]\n');
same([lines(r), r.objects.length], [[2], 1], 'a class is reported and its whole block skipped');
r = Py.readMeep('import meep as mp\nr = 1 / 0\ngeometry = [mp.Sphere(radius="big")]\n');
same(lines(r), [2, 3], 'division by zero and a radius that is not a number are both reported');
r = Py.readMeep('import meep as mp\nx = 0\nfor i in range(10**9):\n    x += 1\n');
same(lines(r), [3], 'a very long loop is refused instead of freezing the page');
r = Py.readMeep('import meep as mp\ns = "it is\ngeometry = []\n');
same(lines(r), [2], 'an unclosed text string is reported');
r = Py.readMeep('import os\nimport meep as mp\nos.system("anything")\nopen("file.txt")\ngeometry = [mp.Sphere(radius=0.1)]\n');
same([lines(r), r.objects.length], [[4], 1], 'nothing outside the reader can be called: os.system does nothing and open() does not exist');
r = C.fromMeep('import meep as mp\ngeometry = [mp.Block(size=mp.Vector3(1, 2, 0), material=Ag)]\n');
same([r.shapes.length, r.shapes[0].sz, r.shapes[0].customName, r.problems.length, r.notes.length], [1, Infinity, 'Ag', 0, 2], 'a 2D block and an undefined material are drawn, each with a note');
// Python details that are easy to get wrong.
r = Py.readMeep('import meep as mp\na = 7 // 2\nb = -7 // 2\nc = -7 % 3\nd = 2 ** 3 ** 2\ne = -2 ** 2\nf = round(2.5) + round(3.5)\ng = [1, 2] * 2 + [3]\nh = 10 if not g else len(g)\ngeometry = [mp.Sphere(radius=v) for v in [a, -b, c, d, -e, f, h]]\n');
same([r.diagnostics, r.objects.map(o => o.radius)], [[], [3, 4, 2, 512, 4, 6, 5]], 'integer division, modulo, powers and rounding follow Python');

const at = (source, o) => o ? source.slice(o.pos, o.end) : null;
const pillarShapes = read.shapes, substrate = pillarShapes[0].origins, pillar = pillarShapes[3].origins;
same([at(pillars, substrate.sz), at(pillars, substrate.z), substrate.sx, at(pillars, substrate.x)], ['0.5', '-0.25', undefined, '0'], 'substrate: thickness and height are plain numbers; an mp.inf size is not');
same([at(pillars, pillar.radius), pillar.radius.via, pillar.radius.line, at(pillars, pillar.height), pillar.height.via], ['0.11', 'radius', 5, '0.25', 'height'], 'pillar: radius and height lead to the variables that set them');
same([pillar.x, pillar.y, pillar.z], [undefined, undefined, undefined], 'pillar: a position computed in a loop has no origin, so it is never rewritten');
const src4 = 'import meep as mp\nr = 0.1\nr = 0.2\nk = 3\nfor i in range(2):\n    k = 0.3\ndef make(h):\n    return mp.Cylinder(radius=0.5, height=h)\nc = mp.Vector3(1, -2)\ngeometry = [mp.Sphere(radius=r, center=c), mp.Sphere(radius=k), make(0.7), mp.Block(size=mp.Vector3(1, 2, 3) * 2)]\n';
const four = C.fromMeep(src4).shapes.map(s => s.origins);
same([four[0].radius, at(src4, four[0].x), at(src4, four[0].y), four[0].z], [undefined, '1', '-2', undefined], 'a variable set twice has no origin; a Vector3 variable gives its written components');
same([four[1].radius, at(src4, four[2].radius), four[2].height, four[3].sx], [undefined, '0.5', undefined, undefined], 'loop variables, function parameters and formulas have no origin; a number inside a function has');

const lib = { wavelength: 633, index: () => ({ n: 3.874, k: 0.016 }) };   // a stand-in library value
const meep = body => 'import meep as mp\n' + body + '\n';
const reread = source => { const r = C.fromMeep(source, lib); return { r, code: C.toMeep(r.shapes, lib) }; };
const mat = s => [s.material, s.customName ?? null, s.customN ?? null];
{
  const glass = reread(meep('glass = mp.Medium(index=2)\ngeometry = [mp.Sphere(radius=0.1, material=glass)]'));
  const si = reread(meep('Si = mp.Medium(index=2)\ngeometry = [mp.Sphere(radius=0.1, material=Si)]'));
  same([mat(glass.r.shapes[0]), mat(si.r.shapes[0])], [['custom', 'glass', 2], ['custom', 'Si', 2]], 'renaming glass to Si does not change n = 2');
  ok(/^Si = mp\.Medium\(index=2\)$/m.test(si.code) && !/3\.874/.test(si.code), 'Si = mp.Medium(index=2) is written back with n = 2, not the library value');
  same(mat(C.fromMeep(meep('Si = mp.Medium(epsilon=4)\ngeometry = [mp.Sphere(radius=0.1, material=Si)]'), lib).shapes[0]), ['custom', 'Si', 2], 'epsilon=4 is n = 2 (lossless, non-magnetic)');

  const model = 'mp.Medium(epsilon=11.7,\n    E_susceptibilities=[mp.LorentzianSusceptibility(frequency=f0, gamma=0.1, sigma=1)])';
  const disp = reread(meep('f0 = 1 / 0.3\nSi = ' + model + '\ngeometry = [mp.Sphere(radius=0.1, material=Si)]'));
  same([disp.r.shapes[0].material, disp.r.shapes[0].customCode], ['custom', model], 'a dispersive model is kept as its exact text');
  ok(disp.code.includes('Si = ' + model) && /needs f0/.test(disp.code) && disp.r.notes.some(n => /uses f0/.test(n)), 'the dispersive model is copied back unchanged, and f0 is named in the code and in a note');
  const alone = 'mp.Medium(epsilon=2.1, D_conductivity=0.05)';
  const lossy = reread(meep('loss = ' + alone + '\ngeometry = [mp.Sphere(radius=0.1, material=loss)]'));
  same(C.fromMeep(lossy.code, lib).shapes[0].customCode, alone, 'a model that needs nothing else survives two rewrites');

  const fromMeepLib = reread(meep('from meep.materials import Si\ngeometry = [mp.Sphere(radius=0.1, material=Si)]'));
  same([fromMeepLib.r.shapes[0].material, fromMeepLib.r.shapes[0].meepLibrary], ['si', 'Si'], "meep.materials.Si is shown as silicon and remembered as Meep's own");
  ok(/^from meep\.materials import Si( {2}#.*)?$/m.test(fromMeepLib.code) && !/Si = mp\.Medium/.test(fromMeepLib.code), "Meep's own Si is written back as Meep's import, not as one index");
  ok(/^from meep\.materials import Si  # fitted for 1\.36-11 um: 633 nm is outside \(Meep also has cSi, 0\.4-1 um\)$/m.test(fromMeepLib.code), 'meep.materials.Si at 633 nm: the import line says the wavelength is outside its range and names cSi');
  ok(!/fitted for/.test(C.toMeep(fromMeepLib.r.shapes, { wavelength: 1550, index: lib.index })), 'meep.materials.Si at 1550 nm: inside its range, no warning');
  same([C.meepRangeWarning('Si', 1550), C.meepRangeWarning('cSi', 633), C.meepRangeWarning('NoSuchMaterial', 633)], ['', '', ''], 'no warning inside the range or for a material without a known range');
  ok(/Au_JC_visible \(0\.4-0\.8 µm\)/.test(C.meepRangeWarning('Au', 7000)) === false && /fitted for 0\.248-6\.1992 µm/.test(C.meepRangeWarning('Au', 7000)), 'Au at 7 um: outside, and no visible-light variant is offered for an infrared wavelength');
  ok(/^metal = mp\.metal$/m.test(reread(meep('geometry = [mp.Sphere(radius=0.1, material=mp.metal)]')).code), 'mp.metal stays a perfect conductor');

  const both = reread(meep('from meep.materials import Si as cSi\nSi = mp.Medium(index=2)\ngeometry = [mp.Sphere(radius=0.1, material=Si), mp.Sphere(radius=0.2, material=cSi)]'));
  ok(/^Si = mp\.Medium\(index=2\)$/m.test(both.code) && /^from meep\.materials import Si as Si_2( {2}#.*)?$/m.test(both.code) && /material=Si_2\)/.test(both.code), 'two different materials named Si get two names: neither replaces the other');

  const own = C.toMeep([Object.assign(C.newShape('sphere', 'si'), { radius: 100 })], lib);
  same(C.fromMeep(own, lib).shapes[0].material, 'si', "the Studio's own library line reads back as the library material");
  same(mat(C.fromMeep(own.replace('index=3.874', 'index=3.5'), lib).shapes[0]), ['custom', 'Si', 3.5], "a library line whose number the user changed is the user's own value");
  same(C.fromMeep(meep('geometry = [mp.Sphere(radius=0.1, material=Au)]'), lib).shapes[0].material, 'au', 'a familiar name the script does not define is taken as the library material');
  same(mat(C.fromGds(C.toGds([Object.assign(C.newShape('cylinder', 'custom'), { customName: 'Si', customN: 2, radius: 100, height: 200 })])).shapes[0]), ['custom', 'Si', 2], 'a layout layer "Si n=2" reads back as the user\'s n = 2');
}

const summary =`studio-py.js: ${checks} checks passed. ` + report.join('; ') + '.';
console.log(summary);
export default summary;
