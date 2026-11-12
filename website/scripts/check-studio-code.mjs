/* Checks for website/studio-code.js (shapes <-> gdsfactory and Meep text).
 *
 * Node:     node website/scripts/check-studio-code.mjs
 * Browser:  open studio.html from a local server, then in the console run
 *           (await import('./scripts/check-studio-code.mjs')).default
 *
 * These checks only cover the text the page writes and reads. Whether Meep
 * and gdsfactory understand that text the same way is checked separately by
 * check_studio_meep.py (run with Meep) and by running the layout script.
 */
const inNode = typeof process !== 'undefined' && !!process.versions?.node;
let C;
if (inNode) { const { createRequire } = await import('node:module'); C = createRequire(import.meta.url)('../studio-code.js'); }
else C = globalThis.ElyvrisStudioCode;

let checks = 0;
function same(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: got ${a}, expected ${e}`);
  checks++;
}
const shape = (type, material, values) => Object.assign(C.newShape(type, material), values);
const design = [
  shape('box', 'sio2', { sx: Infinity, sy: Infinity, sz: 500, z: -250 }),
  shape('sphere', 'si', { radius: 90, x: -300, y: 120, z: 90 }),
  shape('cylinder', 'tio2', { radius: 150, height: 200, x: 400, z: 100 }),
  shape('cylinder', 'au', { radius: 40, height: 600, axis: 'x', y: -500, z: 40 }),
  shape('cone', 'al', { radius: 120, radius2: 30, height: 250, y: 500, z: 125 }),
  shape('ellipsoid', 'mgf2', { sx: 300, sy: 200, sz: 150, x: 700, y: 400, z: 75 }),
  shape('ring', 'si', { radius: 400, width: 100, height: 150, x: -900, z: 75 }),
  shape('prism', 'custom', { sides: 6, radius: 150, height: 120, x: 900, y: -400, z: 60, customName: 'my_glass', customN: 1.9 }),
  shape('prism', 'bk7', { height: 40, x: 115, y: 900, z: 20, points: [[-100, 0], [100, -115], [100, 115]] })
];
// Compare shapes after rounding to a thousandth of a nanometre.
const tidy = list => list.map(s => {
  const out = {};
  for (const key of Object.keys(s).sort()) {
    if (s.type === 'prism' && (key === 'sides' || key === 'radius')) continue;
    let value = key === 'points' ? null : s[key];
    if (typeof value === 'number') value = value === Infinity ? 'inf' : Math.round(value * 1000) / 1000;
    if (value !== null) out[key] = value;
  }
  if (s.type === 'prism') out.points = C.prismPoints(s).map(p => p.map(v => Math.round(v * 1000) / 1000));
  return out;
});

// 1. Meep text written by the page reads back as the same design.
const meepBack = C.fromMeep(C.toMeep(design, { wavelength: 633, index: () => ({ n: 2, k: 0 }) }));
same(meepBack.skipped, [], 'Meep round trip: no skipped lines');
same(tidy(meepBack.shapes), tidy(design), 'Meep round trip: same shapes');

// 2. Layout text keeps what a flat layout can keep (type, place, sizes, material).
const gdsBack = C.fromGds(C.toGds(design));
same(gdsBack.skipped, [], 'gdsfactory round trip: no skipped lines');
same(gdsBack.shapes.map(s => [s.type, s.material, Math.round(s.x), Math.round(s.y), Math.round(s.z)]), [
  ['sphere', 'si', -300, 120, 90], ['cylinder', 'tio2', 400, 0, 100], ['box', 'au', 0, -500, 40], ['cone', 'al', 0, 500, 125],
  ['ellipsoid', 'mgf2', 700, 400, 75], ['ring', 'si', -900, 0, 75], ['prism', 'custom', 900, -400, 60], ['prism', 'bk7', 115, 900, 20]
], 'gdsfactory round trip: shapes');
same([gdsBack.shapes[5].radius, gdsBack.shapes[5].width, gdsBack.shapes[3].radius2, gdsBack.shapes[6].customName, gdsBack.shapes[6].customN], [400, 100, 30, 'my_glass', 1.9], 'gdsfactory round trip: details');

// 3. Hand-written Meep: variables, arithmetic, mp.inf, inline media, bad lines reported by line number.
const hand = C.fromMeep(['import meep as mp', 'r = 0.1', 'h = 2*r', 'glass = mp.Medium(index=1.5)', 'geometry = [',
  '    mp.Block(size=mp.Vector3(mp.inf, mp.inf, 1), center=mp.Vector3(z=-0.5), material=glass),',
  '    mp.Cylinder(radius=r, height=h, center=mp.Vector3(0, 0, h/2), material=mp.Medium(epsilon=4)),',
  '    mp.Wedge(radius=1),', '    mp.Sphere(center=mp.Vector3()),', ']'].join('\n'));
same(hand.skipped, [8, 9], 'hand-written Meep: skipped lines');
same(hand.shapes.map(s => [s.type, s.material, s.customName, s.customN, s.z]), [['box', 'custom', 'glass', 1.5, -500], ['cylinder', 'custom', 'material2', 2, 100]], 'hand-written Meep: shapes');
same([hand.shapes[0].sx, hand.shapes[0].sz, hand.shapes[1].radius, hand.shapes[1].height], [Infinity, 1000, 100, 200], 'hand-written Meep: sizes');

// 4. Hand-written gdsfactory: references, moves, corner-anchored rectangle, polygon.
const layout = C.fromGds(['import gdsfactory as gf', 'c = gf.Component()', 'wg = c << gf.components.straight(length=4, width=0.5)',
  'ring = c.add_ref(gf.components.ring(radius=1.5, width=0.45, layer=(1, 0)))', 'ring.movey(2.175)', 'ring.movex(2)',
  'pad = gf.components.rectangle(size=(1, 0.6), layer=(2, 0))', 'p1 = c << pad', 'p1.move((5, -0.3))',
  'c.add_polygon([(0, 2), (4, 2), (4, 4)], layer=(3, 0))', 'x = c << gf.components.bend_euler(radius=5)'].join('\n'));
same(layout.skipped, [11], 'hand-written gdsfactory: skipped lines');
same(layout.shapes.map(s => [s.type, Math.round(s.x), Math.round(s.y)]), [['box', 2000, 0], ['ring', 2000, 2175], ['box', 5500, 0], ['prism', 2000, 3000]], 'hand-written gdsfactory: shapes');
same([layout.shapes[0].sx, layout.shapes[0].sy, layout.shapes[1].radius, layout.shapes[2].sx], [4000, 500, 1725, 1000], 'hand-written gdsfactory: sizes');

const result = { status: 'passed', checks };
console.log(JSON.stringify(result));
export default result;
