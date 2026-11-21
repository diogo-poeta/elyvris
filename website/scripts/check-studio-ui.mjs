const STORES = ['elyvris-studio-project-v1', 'elyvris-studio-design-v2', 'elyvris-studio-start-hidden'];
const clearSaves = () => STORES.forEach(key => localStorage.removeItem(key));
let checks = 0;
function same(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}: got ${a}, expected ${e}`);
  checks++;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openStudio() {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;';
  frame.src = new URL(`../studio.html?check=${Date.now()}`, import.meta.url).href;   // a new address, so the browser cache cannot serve an old page
  const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
  document.body.appendChild(frame);
  await loaded;
  const win = frame.contentWindow;
  for (let i = 0; i < 100 && !win.document.querySelector('#shape-list li'); i++) await pause(50);
  return frame;
}

async function scenario(win, own, other, makeText) {
  const $ = id => win.document.getElementById(id);
  const tabIs = name => $(`tab-${name}`).getAttribute('aria-selected') === 'true';
  const count = () => $('shape-list').querySelectorAll('li').length;
  const area = $('code-area');

  $(`tab-${own}`).click();
  const text = makeText(win.ElyvrisStudioCode);
  area.focus();                                       // as a user would; the page does not rewrite a focused box
  area.value = text;
  area.dispatchEvent(new win.Event('input', { bubbles: true }));
  await pause(400);                                   // the page reads typed code after 250 ms
  const shapes = count();
  same(shapes > 0, true, `${own}: the pasted code gives shapes`);

  $(`tab-${other}`).click();
  same(tabIs(other), true, `${own}->${other}: the other tab is selected`);
  same(area.value === text, false, `${own}->${other}: the Studio rewrote the code`);
  same($('code-restore').hidden, true, `${own}->${other}: no "Bring back" for ${own} text under the ${other} tab`);

  $(`tab-${own}`).click();
  same($('code-restore').hidden, false, `back to ${own}: "Bring back my code" is offered`);
  $('code-restore').click();
  same(tabIs(own), true, `restore: the ${own} tab is selected`);
  same(area.value, text, `restore: the exact ${own} text comes back`);
  same(count(), shapes, `restore: the preview shows the same ${shapes} shape(s)`);
  same($('code-restore').hidden, true, 'restore: the button is hidden again');
}

/* Type a value in a field of the page, as a user would. */
async function typeIn(win, id, value) {
  const field = win.document.getElementById(id);
  field.focus(); field.value = String(value);
  field.dispatchEvent(new win.Event('input', { bubbles: true }));
  field.blur();
  await pause(50);
}
async function until(test, label, ms = 5000) {
  for (let t = 0; t < ms && !test(); t += 50) await pause(50);
  same(!!test(), true, label);
}

async function settings() {
  const radius = text => Number(/radius=([\d.eE+-]+)/.exec(text)[1]);
  let frame = await openStudio(), win = frame.contentWindow, $ = id => win.document.getElementById(id);
  $('tab-meep').click();
  same($('scale-label').hidden, false, 'the Meep tab shows the length unit field');
  // 5. Wavelength: kept by a reload, and by Undo.
  await typeIn(win, 'index-wavelength', 1550);
  await until(() => /n at 1550 nm/.test($('code-area').value), 'the code uses n at 1550 nm');
  frame.remove(); frame = await openStudio(); win = frame.contentWindow;
  same($('index-wavelength').value, '1550', 'reload: the wavelength is still 1550 nm');
  await until(() => /n at 1550 nm/.test($('code-area').value), 'reload: the code still uses n at 1550 nm (materials loaded)');
  await typeIn(win, 'index-wavelength', 900);
  $('undo').click();
  same($('index-wavelength').value, '1550', 'undo: the wavelength is back to 1550 nm');
  same(/n at 1550 nm/.test($('code-area').value), true, 'undo: the code is back to n at 1550 nm');

  // 6a. The Studio's own code: the shapes keep their size, the numbers change.
  const before = JSON.stringify(win.ElyvrisStudio.shapes()), r1 = radius($('code-area').value);
  await typeIn(win, 'meep-scale', 0.5);
  same(JSON.stringify(win.ElyvrisStudio.shapes()), before, 'unit 0.5 µm, Studio code: the shapes keep their size');
  same(/Length unit: 1 = 0\.5 micrometre/.test($('code-area').value), true, 'unit 0.5 µm: the first line states it');
  same(radius($('code-area').value), r1 * 2, 'unit 0.5 µm: the numbers in the code double');
  $('undo').click();
  same($('meep-scale').value, '1', 'undo: the length unit is back to 1 µm');
  same(radius($('code-area').value), r1, 'undo: the code numbers are back');

  // 6b. The user's own code: the text stays, the shapes change size.
  const area = $('code-area'), own = 'import meep as mp\ngeometry = [mp.Sphere(radius=0.1, center=mp.Vector3(), material=mp.Medium(index=2))]\n';
  area.focus(); area.value = own; area.dispatchEvent(new win.Event('input', { bubbles: true })); await pause(400); area.blur();
  same(win.ElyvrisStudio.shapes()[0].radius, 100, 'own code, 1 µm: radius 0.1 is 100 nm');
  await typeIn(win, 'meep-scale', 0.5);
  same(area.value, own, 'own code, unit 0.5 µm: the text is unchanged');
  same(win.ElyvrisStudio.shapes()[0].radius, 50, 'own code, unit 0.5 µm: radius 0.1 is now 50 nm');

  // 7. A stated length unit wins when code is pasted, and survives a reload.
  const stated = '# Elyvris Studio: Meep geometry. Length unit: 1 = 2 micrometre.\n' + own;
  area.focus(); area.value = stated; area.dispatchEvent(new win.Event('input', { bubbles: true })); await pause(400); area.blur();
  same($('meep-scale').value, '2', 'stated unit: the field follows the first line (2 µm)');
  same(win.ElyvrisStudio.shapes()[0].radius, 200, 'stated unit: radius 0.1 is 200 nm');
  frame.remove(); frame = await openStudio(); win = frame.contentWindow;
  same([$('meep-scale').value, $('code-area').value, win.ElyvrisStudio.shapes()[0].radius], ['2', stated, 200], 'reload: unit, own text and size are kept');
  same(win.ElyvrisStudioCode.meepScaleIn('# Length unit: 1 = 250 nm'), 0.25, 'a unit stated in nm is converted to µm');

  // 8. Library models: rescaled when written, still library models when read back.
  const C = win.ElyvrisStudioCode, si = Object.assign(C.newShape('sphere', 'si'), { radius: 300, meepLibrary: 'Si' });
  const written = C.toMeep([si], { wavelength: 1550, scale: 0.5 });
  same(/^from meep\.materials import Si$/m.test(written) && /^Si = rescale\(Si, 0\.5\)$/m.test(written), true, 'library at 0.5 µm: imported, then rescaled');
  same(/radius=0\.6\b/.test(written), true, 'library at 0.5 µm: radius 300 nm is written 0.6');
  const back = C.fromMeep(written, { wavelength: 1550, scale: 0.5 });
  same([back.shapes.length, back.shapes[0].meepLibrary, back.shapes[0].radius, back.problems.length], [1, 'Si', 300, 0], 'library at 0.5 µm: read back as Si, 300 nm, no problems');
  same(/rescale/.test(C.toMeep([si], { wavelength: 1550, scale: 1 })), false, 'library at 1 µm: nothing is rescaled');
  frame.remove();
}

async function previewCoverage() {
  let frame = await openStudio(), win = frame.contentWindow;
  const $ = id => win.document.getElementById(id);
  const paste = async text => { const area = $('code-area'); area.focus(); area.value = text; area.dispatchEvent(new win.Event('input', { bubbles: true })); await pause(400); area.blur(); };
  const box = () => $('code-coverage');
  const state = () => box().hidden ? 'hidden' : box().dataset.state;
  const marks = () => [...$('shape-list').querySelectorAll('li')].map(li => !!li.querySelector('.approx-mark'));
  const script = [
    'import meep as mp',
    'cell = mp.Vector3(4, 4, 0)',
    'pml_layers = [mp.PML(1.0)]',
    'sources = [mp.Source(mp.ContinuousSource(frequency=0.15), component=mp.Ez, center=mp.Vector3(-1, 0))]',
    '# sources += [mp.EigenModeSource(...)]  a comment is not a source',
    'geometry = [',
    '    mp.Block(size=mp.Vector3(1, 0.2, mp.inf), center=mp.Vector3(), e1=mp.Vector3(1, 1, 0), material=mp.Medium(epsilon=12)),',
    '    mp.Prism(vertices=[mp.Vector3(0, 0), mp.Vector3(0.5, 0), mp.Vector3(0, 0.5)], height=0.3, sidewall_angle=0.1, material=mp.Medium(index=2)),',
    '    mp.Wedge(radius=0.5, wedge_angle=1.0, material=mp.Medium(index=2)),',
    '    mp.Sphere(radius=0.2, center=mp.Vector3(1, 1, 0), material=mp.Medium(index=1.5)),',
    ']',
    'sim = mp.Simulation(cell_size=cell, boundary_layers=pml_layers, geometry=geometry, sources=sources, resolution=10)',
    ''
  ].join('\n');
  $('tab-meep').click();
  same(state(), 'hidden', 'Studio code: no coverage box');
  await paste(script);
  same(state(), 'partly', 'mixed script: "Partly drawn"');
  same(marks(), [true, true, false], 'mixed script: shapes 1 and 2 are marked ≈, the sphere is not');
  const text = box().textContent;
  same(['Line 9', 'shape 1 (line 7)', 'rotation', 'shape 2 (line 8)', 'slanted'].filter(part => !text.includes(part)), [],
    'mixed script: the box names the missing line and both approximations');
  same(['Setup drawn as outlines', 'Cell 4000 × 4000 × 0 nm: 2D', 'PML 1000 nm thick, inside the cell on both x and y walls', 'metal', 'one pixel is 100 nm'].filter(part => !text.includes(part)), [],
    'mixed script: the box lists the cell (2D), the PML, the walls and the pixel size');
  same([/Not shown/.test(text), $('view-setup').hidden, $('view-setup').getAttribute('aria-pressed')], [false, false, 'true'],
    'mixed script: cell, PML, resolution and the source are no longer "not shown"; the Setup button is on');
  same(text.includes('Current source, point at (-1000, 0): a current along z (Ez). It radiates to both sides, so it has no travel arrow'), true,
    'mixed script: the point source is listed as a current along z that radiates to both sides');
  const links = [...box().querySelectorAll('.line-link')];
  same(links.map(link => link.textContent), ['line 12', 'line 3', 'line 12', 'line 12', 'line 4'], 'setup items link to the lines of cell_size, the PML, the walls, the resolution and the source');
  links[1].click();
  const area = $('code-area');
  same(area.value.slice(area.selectionStart, area.selectionEnd), 'pml_layers = [mp.PML(1.0)]', 'a setup link selects its line of code');
  $('view-setup').click();
  same([$('view-setup').getAttribute('aria-pressed'), /hidden: “Setup” under the view shows it/.test(box().textContent)], ['false', true], 'Setup off: the box says the setup is hidden');
  $('view-setup').click();
  same($('view-setup').getAttribute('aria-pressed'), 'true', 'Setup on again');
  same(win.ElyvrisStudioCode.meepOutside(script).find(part => part.label === 'sources').lines, [4], 'a commented-out source is not counted');
  await paste(await fetch(new URL('meep-setup-cases/dir_eig_direction.py', import.meta.url)).then(r => r.text()));
  const eig = box().textContent, viewLabels = () => [...win.document.querySelectorAll('.view-label')].filter(l => !l.hidden).map(l => l.textContent);
  same(['launches its mode toward +x', 'at (-3000, 0): positive flux = power crossing toward +x.', 'at (3000, 0): positive flux = power crossing toward −x (the weight is negative'].filter(part => !eig.includes(part)), [],
    'mode source and flux planes: the launch direction and the "+ flux" sign of each plane');
  await until(() => ['mode source → +x', '+ flux +x', '+ flux −x'].every(label => viewLabels().includes(label)), 'mode source and flux planes: their labels in the 3D view');
  same([[...box().querySelectorAll('.line-link')].map(link => link.textContent).slice(4), /Not shown: run commands \(line 15\)\./.test(eig)], [['line 10', 'line 13', 'line 14'], true],
    'mode source and flux planes: links to their lines; only the run command is "not shown"');
  $('view-setup').click();
  await until(() => !viewLabels().some(label => /flux|mode source/.test(label)), 'Setup off: no source or flux labels in the view');
  $('view-setup').click();
  await paste(script);
  $('code-copy').click(); await pause(50);
  same(state(), 'partly', 'Copy keeps the box');
  $('tab-gds').click();
  same([state(), /Bring back my code/.test(box().textContent), marks()], ['partly', true, [false, false, false]], 'other tab: the box reports the kept code; the Studio code has no ≈ marks');
  $('tab-meep').click(); $('code-restore').click();
  same([state(), marks()], ['partly', [true, true, false]], 'Bring back my code: box and marks return');
  frame.remove(); frame = await openStudio(); win = frame.contentWindow;
  same([state(), marks()], ['partly', [true, true, false]], 'reload: box and marks are still there');
  await paste('import meep as mp\ngeometry = [mp.Sphere(radius=0.1, center=mp.Vector3(), material=mp.Medium(index=2))');
  same([state(), $('shape-list').querySelectorAll('li').length], ['stale', 3], 'unreadable code: "Out of date", the last 3 shapes stay');
  same(/Wedge/.test(box().textContent), false, 'out of date: no details of the older code');
  await paste('import meep as mp\ngeometry = [mp.Sphere(radius=0.1, center=mp.Vector3(), material=mp.Medium(index=2))]\n');
  same([state(), marks()], ['all', [false]], 'exact code: "All drawn", no ≈ mark');
  frame.remove();
}

async function projectFile() {
  const strip = p => { const copy = JSON.parse(JSON.stringify(p)); delete copy.saved; return copy; };
  let frame = await openStudio(), win = frame.contentWindow;
  const $ = id => win.document.getElementById(id);
  const paste = async text => { const area = $('code-area'); area.focus(); area.value = text; area.dispatchEvent(new win.Event('input', { bubbles: true })); await pause(400); area.blur(); };
  // 11. Build a project with every kind of state, save it, open it in a fresh Studio.
  $('tab-meep').click();
  await typeIn(win, 'index-wavelength', 1550);
  await typeIn(win, 'meep-scale', 0.5);
  $('unit').value = 'um'; $('unit').dispatchEvent(new win.Event('change', { bubbles: true }));
  await paste('# kept: my first draft\nimport meep as mp\ngeometry = [mp.Sphere(radius=0.3, center=mp.Vector3(), material=mp.Medium(index=1.5))]\n');
  $('tab-gds').click(); $('tab-meep').click();
  const own = 'import meep as mp\ngeometry = [mp.Block(size=mp.Vector3(1, 0.2, mp.inf), center=mp.Vector3(0.5, 0, 0), material=mp.Medium(index=3.48)),\n            mp.Wedge(radius=0.5, material=mp.Medium(index=2))]\n';
  await paste(own);
  const project = win.ElyvrisStudio.project(), text = JSON.stringify(project, null, 1);
  same([project.format, project.version, project.settings], ['elyvris-studio-project', 1, { wavelength_nm: 1550, meep_unit_um: 0.5, display_unit: 'um', language: 'meep' }], 'project: format, version and settings');
  same([project.code.text, /my first draft/.test(project.keptCode.text), project.shapes[0].sz, project.diagnostics.state], [own, true, 'inf', 'Partly drawn'], 'project: own code, kept code, endless size, diagnostics');
  frame.remove(); clearSaves();
  frame = await openStudio(); win = frame.contentWindow;            // a second browser: nothing saved
  same(win.ElyvrisStudio.openProjectText('test.elyvris.json', text), true, 'second Studio: the file opens');
  same(strip(win.ElyvrisStudio.project()), strip(project), 'second Studio: the same project (shapes, code, kept code, settings, diagnostics)');
  same([$('code-area').value, $('index-wavelength').value, $('meep-scale').value, $('unit').value, $('code-restore').hidden], [own, '1550', '0.5', 'um', false], 'second Studio: the page shows it all');

  // 12. Bad parts, newer formats and other text.
  const before = JSON.stringify(win.ElyvrisStudio.shapes());
  const bad = { format: 'elyvris-studio-project', version: 1, shapes: [{ type: 'sphere', material: 'si', x: 0, y: 0, z: 0, radius: 100 }, { type: 'torus', x: 0, y: 0, z: 0 }, { type: 'sphere', material: 'si', x: 0, y: 0, z: 0, radius: -5 }], settings: { wavelength_nm: -1 } };
  same(win.ElyvrisStudio.openProjectText('bad.elyvris.json', JSON.stringify(bad)), true, 'bad parts: the file still opens');
  same(win.ElyvrisStudio.shapes().length, 1, 'bad parts: the valid shape is opened');
  const status = $('project-status').textContent;
  same(['Shape 2 (torus)', 'Shape 3 (sphere)', '633 nm is used', 'Undo'].filter(part => !status.includes(part)), [], 'bad parts: each left-out part is named');
  same($('project-status').classList.contains('warning'), true, 'bad parts: shown as a warning');
  $('undo').click();
  same(JSON.stringify(win.ElyvrisStudio.shapes()), before, 'Undo returns to the design before opening');
  const newer = Object.assign({}, bad, { version: 2 });
  same([win.ElyvrisStudio.openProjectText('new.elyvris.json', JSON.stringify(newer)), JSON.stringify(win.ElyvrisStudio.shapes())], [false, before], 'a newer format is refused and changes nothing');
  same(/newer Studio/.test($('project-status').textContent), true, 'newer format: the reason is given');
  same([win.ElyvrisStudio.openProjectText('notes.txt', 'hello'), /not valid JSON/.test($('project-status').textContent)], [false, true], 'text that is not JSON is refused');
  same(win.ElyvrisStudio.openProjectText('other.json', '{"a": 1}'), false, 'other JSON is refused');
  frame.remove();

  // 13. The older browser save is converted once, and kept.
  clearSaves();
  const old = { design: JSON.stringify({ shapes: [{ type: 'sphere', material: 'si', x: 0, y: 0, z: 0, radius: 120 }], selected: 0, code: { text: 'import meep as mp\ngeometry = [mp.Sphere(radius=0.12, center=mp.Vector3(), material=mp.Medium(index=2))]\n', tab: 'meep' }, settings: { wavelength: 900, scale: 1 } }), unit: 'um', tab: 'meep' };
  localStorage.setItem(STORES[1], JSON.stringify(old));
  frame = await openStudio(); win = frame.contentWindow;
  same([win.ElyvrisStudio.shapes().length, win.ElyvrisStudio.shapes()[0].radius, $('index-wavelength').value, $('unit').value, /radius=0\.12/.test($('code-area').value)], [1, 120, '900', 'um', true], 'old save: shapes, wavelength, unit and own code are opened');
  const converted = JSON.parse(localStorage.getItem(STORES[0]) || 'null');
  same([converted && converted.format, converted && converted.settings.wavelength_nm, localStorage.getItem(STORES[1]) !== null], ['elyvris-studio-project', 900, true], 'old save: converted to the project format, the old save kept');
  frame.remove();
}

async function firstVisit() {
  let frame = await openStudio(), win = frame.contentWindow;
  const $ = id => win.document.getElementById(id);
  const intro = () => win.document.querySelector('.si-backdrop');
  same([$('start-card').hidden, intro().hidden], [false, true], 'first visit: the start card is shown, the fabrication note is not');
  $('start-fab').click();
  same(intro().hidden, false, '"Read this first" opens the fabrication note');
  win.document.querySelector('.si-start').click();
  same(intro().hidden, true, 'the note closes');

  // 14. Try an example: one shared radius.
  $('start-example').click();
  same([$('start-card').hidden, $('tab-meep').getAttribute('aria-selected'), win.ElyvrisStudio.shapes().length], [true, 'true', 3], 'Try an example: three pillars on the Meep tab, card hidden');
  same(/^r = 0\.15 /m.test($('code-area').value), true, 'Try an example: the script defines r = 0.15');
  const radius = [...$('shape-form').querySelectorAll('label.field')].find(label => /^Radius/.test(label.textContent)).querySelector('input');
  radius.value = '200'; radius.dispatchEvent(new win.Event('input', { bubbles: true })); await pause(50);
  same(/^r = 0\.2 /m.test($('code-area').value), true, 'one pillar\'s radius 200 nm: r = 0.2 in the code');
  same(win.ElyvrisStudio.shapes().map(s => s.radius), [200, 200, 200], 'all three pillars change');
  same(/3 shapes use it/.test($('code-status').textContent), true, 'the page says that 3 shapes use r');
  // 14b. The four-step walkthrough ticks itself.
  const tour = $('tour'), ticks = () => [...tour.querySelectorAll('.tour-steps li')].map(li => li.classList.contains('done'));
  same([tour.hidden, tour.dataset.step, ticks()], [false, '3', [true, true, false, false]], 'walkthrough: shown; changing the radius ticks steps 1 and 2');
  same(/r = 0\.2/.test($('tour-r').textContent), true, 'walkthrough step 3 shows the new r = 0.2');
  const anchorClick = win.HTMLAnchorElement.prototype.click;
  win.HTMLAnchorElement.prototype.click = () => {};                                 // no real download in the check
  $('project-save').click();
  same(tour.dataset.step, '3', 'walkthrough: saving before step 4 does not skip step 3');
  $('code-area').click();
  same([tour.dataset.step, ticks()], ['4', [true, true, true, false]], 'walkthrough: a click in the code ticks step 3');
  $('project-save').click();
  win.HTMLAnchorElement.prototype.click = anchorClick;
  same([tour.dataset.step, ticks(), /^Done\./.test($('tour-now').textContent), $('tour-skip').hidden], ['5', [true, true, true, true], true, true], 'walkthrough: Save project ticks step 4 and says it is done');
  $('tour-close').click();
  same(tour.hidden, true, 'walkthrough: Close hides it');
  $('start-again').click(); $('start-example').click();
  same([tour.hidden, tour.dataset.step], [false, '1'], 'walkthrough: Try an example again starts it from step 1');
  $('tour-skip').click();
  same(tour.dataset.step, '2', 'walkthrough: Skip this step moves on');
  $('example').value = 'disk'; $('example').dispatchEvent(new win.Event('change'));
  same(tour.hidden, true, 'walkthrough: loading another example ends it');
  // 14c. Each download says what it is.
  same(/has not run Meep/.test($('tab-hint').textContent), true, 'Meep tab hint: geometry only, no simulation');
  same([$('code-download').textContent, $('gds-download').hidden], ['Download geometry (.py)', true], 'Meep tab: one download, named geometry');
  $('tab-gds').click();
  same(/flat outlines/.test($('tab-hint').textContent), true, 'gdsfactory tab hint: flat outlines, heights as comments');
  same([$('code-download').textContent, $('gds-download').textContent, $('gds-download').hidden], ['Download layout script (.py)', 'Download layout (.gds)', false], 'gdsfactory tab: layout script and layout file, named apart');

  // 15. The card stays hidden; the other two ways in.
  frame.remove(); frame = await openStudio(); win = frame.contentWindow;
  same($('start-card').hidden, true, 'reload: the card stays hidden after a choice');
  $('start-again').click();
  same($('start-card').hidden, false, '"Show the start options again" brings it back');
  $('start-paste').click();
  const area = $('code-area');
  same([$('tab-meep').getAttribute('aria-selected'), win.document.activeElement === area, area.selectionEnd - area.selectionStart === area.value.length], ['true', true, true], 'Paste Meep code: the Meep box is focused and its text selected');
  const before = win.ElyvrisStudio.shapes().length;
  $('start-again').click(); $('start-new').click();
  same([before > 0, win.ElyvrisStudio.shapes().length, win.document.activeElement === $('say-input')], [true, 0, true], 'Start a structure: the design is empty, the sentence box is ready');
  $('undo').click();
  same(win.ElyvrisStudio.shapes().length, before, 'Undo brings the design back');
  $('start-again').click(); $('start-new').click();
  frame.remove(); frame = await openStudio(); win = frame.contentWindow;
  same(win.ElyvrisStudio.shapes().length, 0, 'reload: an empty design stays empty');
  frame.remove();
}

const saved = STORES.map(key => localStorage.getItem(key));
let frame;
try {
  clearSaves();                                       // start from the default design
  frame = await openStudio();
  const win = frame.contentWindow;
  // Meep text written by hand, as a user would paste it.
  await scenario(win, 'meep', 'gds', () => [
    'import meep as mp',
    '',
    '# my own script',
    'r = 0.12',
    'geometry = [mp.Cylinder(radius=r, height=0.2, center=mp.Vector3(x, 0, 0), material=mp.Medium(index=2.4))',
    '            for x in (-0.4, 0, 0.4)]',
    ''
  ].join('\n'));
  // gdsfactory text: the Studio's own output for two shapes, plus a line of the user's.
  await scenario(win, 'gds', 'meep', C => '# my own layout\n' + C.toGds([
    Object.assign(C.newShape('cylinder', 'si'), { radius: 150, height: 200 }),
    Object.assign(C.newShape('box', 'sio2'), { sx: 400, sy: 300, sz: 100, x: 600 })
  ]));
  frame.remove(); frame = null;
  clearSaves();
  await settings();
  clearSaves();
  await previewCoverage();
  clearSaves();
  await projectFile();
  clearSaves();
  await firstVisit();
} finally {
  if (frame) frame.remove();
  STORES.forEach((key, i) => { if (saved[i] === null) localStorage.removeItem(key); else localStorage.setItem(key, saved[i]); });
}
console.log(`check-studio-ui: ${checks} checks passed`);
export default checks;
