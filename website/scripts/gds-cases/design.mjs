/* The test design for the layout file, and the file the page writes for it.
 * Used by check-studio-gds.mjs; gds-cases/design.gds and design_layout.py were saved from here. */
const C = globalThis.ElyvrisStudioCode, Gds = globalThis.ElyvrisGds;
const shape = (type, material, values) => Object.assign(C.newShape(type, material), values);

export const design = [
  shape('box', 'sio2', { sx: Infinity, sy: Infinity, sz: 500, z: -250 }),                        // endless: not in a layout
  shape('sphere', 'si', { radius: 90, x: -300, y: 120, z: 90 }),
  shape('cylinder', 'tio2', { radius: 150, height: 200, x: 400, z: 100 }),
  shape('cylinder', 'au', { radius: 40, height: 600, axis: 'x', y: -500, z: 40 }),
  shape('cone', 'al', { radius: 120, radius2: 30, height: 250, y: 500, z: 125 }),
  shape('ellipsoid', 'mgf2', { sx: 300, sy: 200, sz: 150, x: 700, y: 400, z: 75 }),
  shape('ring', 'si', { radius: 400, width: 100, height: 150, x: -900, z: 75 }),
  shape('prism', 'custom', { sides: 6, radius: 150, height: 120, x: 900, y: -400, z: 60, customName: 'my_glass', customN: 1.9 }),
  shape('prism', 'bk7', { height: 40, x: 115, y: 900, z: 20, points: [[-100, 0], [100, -115], [100, 115]] })
];
export const layout = C.toLayout(design);
export const file = Gds.write(layout, { name: 'elyvris_studio', date: new Date(2026, 10, 15, 12, 0, 0) });
export const script = C.toGds(design);
export const base64 = btoa(String.fromCharCode(...file.bytes));
