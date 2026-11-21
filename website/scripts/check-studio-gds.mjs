const C = globalThis.ElyvrisStudioCode, Gds = globalThis.ElyvrisGds;
let checks = 0;
function same(actual, expected, label) { const a = JSON.stringify(actual), e = JSON.stringify(expected); if (a !== e) throw new Error(`${label}: got ${a}, expected ${e}`); checks++; }
function ok(condition, label) { if (!condition) throw new Error(label); checks++; }
const shape = (type, material, values) => Object.assign(C.newShape(type, material), values);
const { layout, file, script } = await import('./gds-cases/design.mjs');

// 1. Layers are the same as in the gdsfactory script.
same(layout.layers.map(l => `(${l.layer}, 0) ${l.label}`).join(' | '), /# Layers: (.*)/.exec(script)[1], 'same layers as the script');
same([layout.polygons.length, layout.skipped, file.polygons, file.dropped], [8, [0], 8, 0], 'eight outlines; the endless substrate is left out and said so');

// 2. The GDSII number format, on values with a known encoding.
const hex = v => Gds.real8(v).map(b => b.toString(16).padStart(2, '0')).join('');
same([hex(1), hex(0), hex(-2), hex(0.5), hex(1024)], ['4110000000000000', '0000000000000000', 'c120000000000000', '4080000000000000', '4340000000000000'], 'real8 encoding');
same(Array.from(file.bytes.slice(50, 66)).map(b => b.toString(16).padStart(2, '0')).join(''), '3e4189374bc6a7ef3944b82fa09b5a51', 'units: 1 nm grid, 1 um user unit');

// 3. The file is still, byte for byte, the one that was checked with KLayout.
const reference = new Uint8Array(await (await fetch(new URL('./gds-cases/design.gds', import.meta.url))).arrayBuffer());
ok(reference.length === file.bytes.length && reference.every((b, i) => b === file.bytes[i]), 'the page writes the same bytes as gds-cases/design.gds');

// 4. Too small for the 1 nm grid: dropped and counted, not written as a broken outline.
const tiny = Gds.write({ polygons: [{ layer: 1, points: [[0, 0], [0.2, 0], [0.2, 0.3]] }, { layer: 1, points: [[0, 0], [10, 0], [10, 10]] }] });
same([tiny.polygons, tiny.dropped], [1, 1], 'an outline smaller than the grid is dropped and counted');

// 5. Ruler: catch points lie exactly on the shapes, and the distance follows the design.
const view = globalThis.ElyvrisStudioView;
if (view && globalThis.ElyvrisStudio) {
  const S = globalThis.ElyvrisStudio, before = S.shapes();
  S.load([shape('box', 'si', { sx: 400, sy: 300, sz: 200, x: 0, y: 0, z: 100 }), shape('cylinder', 'tio2', { radius: 100, height: 200, x: 500, y: 0, z: 100 })]);
  same(view.keyPoints(0).length, 15, 'a box offers its centre, 6 face centres and 8 corners');
  same(view.keyPoints(1), [[500, 0, 100], [500, 0, 0], [500, 0, 200], [400, 0, 100], [600, 0, 100], [500, -100, 100], [500, 100, 100]], 'a cylinder offers its centre, the two end centres and four wall points');
  const m = view.setRuler({ part: 0, key: 2 }, { part: 1, key: 3 });
  same([m.a, m.b, m.distance], [[200, 0, 100], [400, 0, 100], 200], 'the gap between box and cylinder is 200 nm');
  S.load([shape('box', 'si', { sx: 400, sy: 300, sz: 200, x: 0, y: 0, z: 100 }), shape('cylinder', 'tio2', { radius: 100, height: 200, x: 650, y: 0, z: 100 })]);
  same(view.setRuler({ part: 0, key: 2 }, { part: 1, key: 3 }).distance, 350, 'after moving the cylinder the same ruler reads 350 nm');
  S.load([shape('box', 'sio2', { sx: Infinity, sy: Infinity, sz: 500, z: -250 })]);
  same(view.keyPoints(0), [[0, 0, -250], [0, 0, -500], [0, 0, 0]], 'an endless slab offers only its centre and its two real faces');
  view.setRuler(null); S.load(before);
}

const summary = `studio-gds.js: ${checks} checks passed.`;
console.log(summary);
export default summary;
