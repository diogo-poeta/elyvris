(() => {
  'use strict';
  const editor = document.getElementById('geometry-editor');
  if (!editor) return;
  const svg = document.getElementById('geometry-canvas');
  const layer = document.getElementById('geometry-shapes');
  const select = document.getElementById('geometry-selection');
  const fields = document.getElementById('geometry-fields');
  const status = document.getElementById('geometry-status');
  const remove = document.getElementById('geometry-remove');
  const ns = 'http://www.w3.org/2000/svg';
  let shapes = [], selected = -1, drag = null;
  const names = { rectangle: 'Rectangle', circle: 'Circle', ring: 'Ring' };
  const defaults = { rectangle: { width: 10, height: 0.5 }, circle: { radius: 2 }, ring: { radius: 4, thickness: 0.5 } };
  const attrs = { x: 'Centre x (µm)', y: 'Centre y (µm)', width: 'Width (µm)', height: 'Height (µm)', radius: 'Outer radius (µm)', thickness: 'Ring width (µm)' };
  const announce = text => { status.textContent = text; };
  function number(value) { return Math.round(value * 1000) / 1000; }
  function valid(s) {
    if (!s || !Object.hasOwn(names, s.type)) return false;
    const keys = ['x', 'y', ...Object.keys(defaults[s.type])];
    if (!keys.every(k => typeof s[k] === 'number' && Number.isFinite(s[k]) && Math.abs(s[k]) <= 100)) return false;
    if (!Object.keys(defaults[s.type]).every(k => s[k] >= 0.001)) return false;
    return s.type !== 'ring' || s.thickness < s.radius;
  }
  function shape(type, x = 0, y = 0) { return { type, x, y, ...defaults[type] }; }
  function point(event) {
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const result = p.matrixTransform(svg.getScreenCTM().inverse());
    return { x: (result.x - 400) / 20, y: (240 - result.y) / 20 };
  }
  function renderShapes() {
    layer.replaceChildren();
    shapes.forEach((s, i) => {
      const el = document.createElementNS(ns, s.type === 'rectangle' ? 'rect' : 'circle');
      const x = 400 + s.x * 20, y = 240 - s.y * 20;
      if (s.type === 'rectangle') {
        el.setAttribute('x', x - s.width * 10); el.setAttribute('y', y - s.height * 10);
        el.setAttribute('width', s.width * 20); el.setAttribute('height', s.height * 20);
      } else {
        el.setAttribute('cx', x); el.setAttribute('cy', y);
        el.setAttribute('r', (s.type === 'ring' ? s.radius - s.thickness / 2 : s.radius) * 20);
      }
      el.setAttribute('fill', s.type === 'ring' ? 'none' : '#7f66a7');
      el.setAttribute('stroke', s.type === 'ring' ? '#7f66a7' : '#4d3d65');
      el.setAttribute('stroke-width', s.type === 'ring' ? s.thickness * 20 : 1.5);
      if (i === selected) {
        if (s.type === 'ring') { el.setAttribute('stroke', '#bd6e04'); }
        else el.classList.add('selected');
      }
      el.dataset.index = String(i);
      layer.append(el);
    });
  }
  function render() {
    renderShapes(); select.replaceChildren();
    if (!shapes.length) { const o = document.createElement('option'); o.textContent = 'No shape selected'; select.append(o); }
    shapes.forEach((s, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `${i + 1}. ${names[s.type]}`; select.append(o); });
    if (selected >= 0) select.value = String(selected);
    select.disabled = selected < 0; remove.disabled = selected < 0;
    fields.replaceChildren();
    if (selected < 0) return;
    const s = shapes[selected];
    ['x', 'y', ...Object.keys(defaults[s.type])].forEach(key => {
      const label = document.createElement('label'); label.textContent = attrs[key];
      const input = document.createElement('input'); input.type = 'number'; input.step = '0.1'; input.value = s[key];
      input.addEventListener('change', () => {
        const next = { ...shapes[selected], [key]: Number(input.value) };
        if (input.value.trim() === '' || !valid(next)) { input.value = shapes[selected][key]; announce('Use valid dimensions greater than zero; ring width must be smaller than its radius.'); return; }
        shapes[selected] = next; renderShapes(); announce(`${names[next.type]} updated.`);
      });
      label.append(input); fields.append(label);
    });
  }
  function replace(list) { shapes = list; selected = list.length ? 0 : -1; render(); }
  editor.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
    if (shapes.length >= 100) { announce('The editor supports up to 100 shapes.'); return; }
    shapes.push(shape(button.dataset.add)); selected = shapes.length - 1; render(); announce(`${names[button.dataset.add]} added.`);
  }));
  select.addEventListener('change', () => { selected = Number(select.value); render(); });
  remove.addEventListener('click', () => { if (selected < 0) return; shapes.splice(selected, 1); selected = shapes.length ? Math.min(selected, shapes.length - 1) : -1; render(); announce('Shape removed from this design.'); });
  svg.addEventListener('pointerdown', event => {
    const target = event.target.closest('[data-index]'); if (!target) return;
    selected = Number(target.dataset.index); const p = point(event), s = shapes[selected];
    drag = { dx: s.x - p.x, dy: s.y - p.y }; svg.setPointerCapture(event.pointerId); render();
  });
  svg.addEventListener('pointermove', event => {
    if (!drag || selected < 0) return; const p = point(event);
    shapes[selected].x = number(Math.max(-100, Math.min(100, p.x + drag.dx)));
    shapes[selected].y = number(Math.max(-100, Math.min(100, p.y + drag.dy))); renderShapes();
  });
  function endDrag() { if (!drag) return; drag = null; render(); announce('Shape position updated.'); }
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  document.getElementById('geometry-load-preset').addEventListener('click', () => {
    const preset = document.getElementById('geometry-preset').value;
    if (!preset) { announce('Choose an example first.'); return; }
    if (shapes.length && !window.confirm('Replace the current design with this example? Save it first if you want to keep it.')) return;
    if (preset === 'waveguide') replace([shape('rectangle')]);
    if (preset === 'ring') replace([{ ...shape('ring'), y: 2.75 }, { ...shape('rectangle'), width: 20, y: -1.75 }]);
    if (preset === 'array') replace([-6, 0, 6].flatMap(x => [-4, 0, 4].map(y => ({ ...shape('circle', x, y), radius: 1 }))));
    announce('Example loaded. Select a shape to change its dimensions.');
  });
  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.getElementById('geometry-json').addEventListener('click', () => {
    download('elyvris-layout.json', JSON.stringify({ format: 'elyvris-geometry-v1', units: 'um', shapes }, null, 2), 'application/json'); announce('Design saved as JSON.');
  });
  document.getElementById('geometry-import').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 100000) throw new Error('File too large');
      const data = JSON.parse(await file.text());
      if (data.format !== 'elyvris-geometry-v1' || data.units !== 'um' || !Array.isArray(data.shapes) || data.shapes.length > 100 || !data.shapes.every(valid)) throw new Error('Invalid design');
      if (shapes.length && !window.confirm('Replace the current design with the saved file?')) return;
      replace(data.shapes.map(s => ({ type: s.type, x: s.x, y: s.y, ...Object.fromEntries(Object.keys(defaults[s.type]).map(k => [k, s[k]])) })));
      announce('Saved design opened.');
    } catch { announce('Could not open that file. Choose a valid Elyvris design JSON file.'); }
    finally { event.target.value = ''; }
  });
  document.getElementById('geometry-svg').addEventListener('click', () => {
    const elements = shapes.map(s => s.type === 'rectangle'
      ? `<rect x="${s.x - s.width/2}" y="${-s.y - s.height/2}" width="${s.width}" height="${s.height}" fill="#7f66a7"/>`
      : `<circle cx="${s.x}" cy="${-s.y}" r="${s.type === 'ring' ? s.radius-s.thickness/2 : s.radius}" fill="${s.type === 'ring' ? 'none' : '#7f66a7'}"${s.type === 'ring' ? ` stroke="#7f66a7" stroke-width="${s.thickness}"` : ''}/>`).join('\n');
    download('elyvris-layout.svg', `<svg xmlns="${ns}" viewBox="-20 -12 40 24">\n${elements}\n</svg>\n`, 'image/svg+xml'); announce('SVG drawing downloaded.');
  });
  document.getElementById('geometry-python').addEventListener('click', () => {
    if (!shapes.length) { announce('Add a shape before downloading Python.'); return; }
    const lines = ['# Elyvris geometry designer: dimensions in micrometres.', '# Requires gdsfactory. This is a layout, not an optical simulation.', 'import gdsfactory as gf', '', 'gf.gpdk.PDK.activate()', 'layout = gf.Component()', ''];
    shapes.forEach((s, i) => {
      lines.push(`# ${i+1}: ${names[s.type]}`);
      if (s.type === 'rectangle') lines.push(`layout.add_polygon([(${s.x-s.width/2}, ${s.y-s.height/2}), (${s.x+s.width/2}, ${s.y-s.height/2}), (${s.x+s.width/2}, ${s.y+s.height/2}), (${s.x-s.width/2}, ${s.y+s.height/2})], layer=(1, 0))`);
      else {
        lines.push(`outer = gf.components.circle(radius=${s.radius}, layer=(1, 0))`);
        if (s.type === 'ring') { lines.push(`inner = gf.components.circle(radius=${number(s.radius-s.thickness)}, layer=(1, 0))`); lines.push('element = gf.boolean(A=outer, B=inner, operation="not", layer=(1, 0))'); }
        else lines.push('element = outer');
        lines.push('ref = layout.add_ref(element)', `ref.movex(${s.x})`, `ref.movey(${s.y})`);
      }
      lines.push('');
    });
    lines.push('layout.write_gds("elyvris_layout.gds")', 'print("Saved elyvris_layout.gds")', '');
    download('elyvris-layout.py', lines.join('\n'), 'text/x-python'); announce('Python script downloaded. Run it with gdsfactory to create a GDS file.');
  });
  render();
})();
