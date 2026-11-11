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
  const unit = document.getElementById('geometry-unit');
  const tool = document.getElementById('geometry-tool');
  const materialSelect = document.getElementById('geometry-material');
  const materialInfo = document.getElementById('geometry-material-info');
  const materialSource = document.getElementById('geometry-material-source');
  const materials = window.ELYVRIS_GEOMETRY_MATERIALS || [];
  const materialById = id => materials.find(item => item.id === id) || materials[0];
  materials.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; materialSelect.append(option); });
  const ns = 'http://www.w3.org/2000/svg';
  let shapes = [], selected = -1, drag = null;
  const names = { rectangle: 'Rectangle', circle: 'Circle', ring: 'Ring', ellipse: 'Ellipse', triangle: 'Triangle' };
  const defaults = { rectangle: { width: 10, height: 0.5 }, circle: { radius: 2 }, ring: { radius: 4, thickness: 0.5 }, ellipse: { width: 6, height: 3 }, triangle: { width: 5, height: 4 } };
  const attrs = { x: 'Centre x', y: 'Centre y', width: 'Width', height: 'Height', radius: 'Outer radius', thickness: 'Ring width' };
  const units = { nm: { factor: 1000, name: 'nm' }, um: { factor: 1, name: 'µm' }, mm: { factor: 0.001, name: 'mm' } };
  const announce = text => { status.textContent = text; };
  function number(value) { return Math.round(value * 1000) / 1000; }
  function displayNumber(value) { return Math.round(value * 1e9) / 1e9; }
  function valid(s) {
    if (!s || !Object.hasOwn(names, s.type)) return false;
    const keys = ['x', 'y', ...Object.keys(defaults[s.type])];
    if (!keys.every(k => typeof s[k] === 'number' && Number.isFinite(s[k]) && Math.abs(s[k]) <= 100)) return false;
    if (!Object.keys(defaults[s.type]).every(k => s[k] >= 0.001)) return false;
    return s.type !== 'ring' || s.radius - s.thickness >= 0.001;
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
      const el = document.createElementNS(ns, ({rectangle:'rect', circle:'circle', ring:'circle', ellipse:'ellipse', triangle:'polygon'})[s.type]);
      const x = 400 + s.x * 20, y = 240 - s.y * 20;
      if (s.type === 'rectangle') {
        el.setAttribute('x', x - s.width * 10); el.setAttribute('y', y - s.height * 10);
        el.setAttribute('width', s.width * 20); el.setAttribute('height', s.height * 20);
      } else if (s.type === 'ellipse') {
        el.setAttribute('cx', x); el.setAttribute('cy', y); el.setAttribute('rx', s.width * 10); el.setAttribute('ry', s.height * 10);
      } else if (s.type === 'triangle') {
        el.setAttribute('points', `${x},${y-s.height*10} ${x-s.width*10},${y+s.height*10} ${x+s.width*10},${y+s.height*10}`);
      } else {
        el.setAttribute('cx', x); el.setAttribute('cy', y);
        el.setAttribute('r', (s.type === 'ring' ? s.radius - s.thickness / 2 : s.radius) * 20);
      }
      const color = materialById(s.material)?.color || '#7f66a7';
      el.setAttribute('fill', s.type === 'ring' ? 'none' : color);
      el.setAttribute('stroke', s.type === 'ring' ? color : '#4d3d65');
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
    materialSelect.disabled = selected < 0 || !materials.length;
    const material = selected >= 0 ? materialById(shapes[selected].material) : null;
    materialSelect.value = material?.id || 'unassigned';
    materialInfo.textContent = material?.citation ? `${material.note} ${material.citation} Labels do not apply optical properties.` : 'Material labels are for organisation and colour only; they do not add optical properties to a simulation.';
    materialSource.hidden = !material?.url;
    if (material?.url) materialSource.href = material.url;
    fields.replaceChildren();
    if (selected < 0) return;
    const s = shapes[selected];
    ['x', 'y', ...Object.keys(defaults[s.type])].forEach(key => {
      const activeUnit = units[unit.value];
      const label = document.createElement('label'); label.textContent = `${attrs[key]} (${activeUnit.name})`;
      const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.value = displayNumber(s[key] * activeUnit.factor);
      input.addEventListener('change', () => {
        const next = { ...shapes[selected], [key]: Number(input.value) / activeUnit.factor };
        if (input.value.trim() === '' || !valid(next)) { input.value = displayNumber(shapes[selected][key] * activeUnit.factor); announce('Use dimensions of at least 1 nm; a ring needs an inner radius of at least 1 nm.'); return; }
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
  materialSelect.addEventListener('change', () => { if (selected < 0) return; shapes[selected].material = materialSelect.value; render(); announce('Material label updated; no optical properties applied.'); });
  unit.addEventListener('change', () => {
    const activeUnit = units[unit.value];
    const format = value => new Intl.NumberFormat('en', { maximumFractionDigits: 6 }).format(value * activeUnit.factor);
    document.getElementById('geometry-ruler-top').textContent = `+${format(12)}`;
    document.getElementById('geometry-ruler-bottom').textContent = `−${format(12)}`;
    document.getElementById('geometry-ruler-unit').textContent = activeUnit.name;
    document.getElementById('geometry-grid-label').textContent = `1 grid square = ${format(1)} ${activeUnit.name}`;
    render(); announce(`Dimensions shown in ${activeUnit.name}.`);
  });
  tool.addEventListener('change', () => {
    svg.classList.toggle('drawing', tool.value !== 'select');
    announce(tool.value === 'select' ? 'Select and drag a shape to move it.' : `Click and drag on the canvas to draw a ${names[tool.value].toLowerCase()}.`);
  });
  remove.addEventListener('click', () => { if (selected < 0) return; shapes.splice(selected, 1); selected = shapes.length ? Math.min(selected, shapes.length - 1) : -1; render(); announce('Shape removed from this design.'); });
  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const p = point(event);
    if (tool.value !== 'select') {
      if (shapes.length >= 100) { announce('The editor supports up to 100 shapes.'); return; }
      drag = { mode: 'draw', type: tool.value, start: p, initialSelected: selected, index: shapes.length };
      svg.setPointerCapture(event.pointerId); return;
    }
    const target = event.target.closest('[data-index]'); if (!target) return;
    selected = Number(target.dataset.index); const s = shapes[selected];
    drag = { mode: 'move', dx: s.x - p.x, dy: s.y - p.y }; svg.setPointerCapture(event.pointerId); render();
  });
  svg.addEventListener('pointermove', event => {
    if (!drag) return; const p = point(event);
    if (drag.mode === 'draw') {
      const start = drag.start, dx = p.x - start.x, dy = p.y - start.y;
      let item;
      if (['rectangle', 'ellipse', 'triangle'].includes(drag.type)) {
        item = { type: drag.type, x: number((p.x + start.x) / 2), y: number((p.y + start.y) / 2), width: number(Math.abs(dx)), height: number(Math.abs(dy)) };
      } else {
        const radius = number(Math.hypot(dx, dy));
        item = { type: drag.type, x: number(start.x), y: number(start.y), radius };
        if (drag.type === 'ring') item.thickness = number(Math.min(0.5, radius / 4));
      }
      if (valid(item)) { shapes[drag.index] = item; selected = drag.index; renderShapes(); }
      return;
    }
    if (selected < 0) return;
    shapes[selected].x = number(Math.max(-100, Math.min(100, p.x + drag.dx)));
    shapes[selected].y = number(Math.max(-100, Math.min(100, p.y + drag.dy))); renderShapes();
  });
  function endDrag(event) {
    if (!drag) return;
    const drawing = drag.mode === 'draw', created = drawing && !!shapes[drag.index];
    if (event.type === 'pointercancel' && created) { shapes.splice(drag.index, 1); selected = drag.initialSelected; }
    drag = null; render();
    announce(drawing ? (created && event.type !== 'pointercancel' ? 'Shape drawn. Select / move lets you reposition it.' : 'Drag farther to draw a shape.') : 'Shape position updated.');
  }
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);
  document.getElementById('geometry-load-preset').addEventListener('click', () => {
    const preset = document.getElementById('geometry-preset').value;
    if (!preset) { announce('Choose an example first.'); return; }
    if (shapes.length && !window.confirm('Replace the current design with this example? Save it first if you want to keep it.')) return;
    if (preset === 'waveguide') replace([shape('rectangle')]);
    if (preset === 'ring') replace([{ ...shape('ring'), y: 2.75 }, { ...shape('rectangle'), width: 20, y: -1.75 }]);
    if (preset === 'array') replace([-6, 0, 6].flatMap(x => [-4, 0, 4].map(y => ({ ...shape('circle', x, y), radius: 1 }))));
    if (preset === 'ellipses') replace([-8, -4, 0, 4, 8].map(x => ({ ...shape('ellipse', x, 0), width: 2, height: 5 })));
    if (preset === 'triangles') replace([-4, 4].map(x => ({ ...shape('triangle', x, 0), width: 5, height: 6 })));
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
      replace(data.shapes.map(s => ({ type: s.type, x: s.x, y: s.y, material: materialById(s.material)?.id || 'unassigned', ...Object.fromEntries(Object.keys(defaults[s.type]).map(k => [k, s[k]])) })));
      announce('Saved design opened.');
    } catch { announce('Could not open that file. Choose a valid Elyvris design JSON file.'); }
    finally { event.target.value = ''; }
  });
  document.getElementById('geometry-svg').addEventListener('click', () => {
    const elements = shapes.map(s => {
      const color = materialById(s.material)?.color || '#7f66a7';
      if (s.type === 'rectangle') return `<rect x="${s.x-s.width/2}" y="${-s.y-s.height/2}" width="${s.width}" height="${s.height}" fill="${color}"/>`;
      if (s.type === 'ellipse') return `<ellipse cx="${s.x}" cy="${-s.y}" rx="${s.width/2}" ry="${s.height/2}" fill="${color}"/>`;
      if (s.type === 'triangle') return `<polygon points="${s.x},${-s.y-s.height/2} ${s.x-s.width/2},${-s.y+s.height/2} ${s.x+s.width/2},${-s.y+s.height/2}" fill="${color}"/>`;
      return `<circle cx="${s.x}" cy="${-s.y}" r="${s.type === 'ring' ? s.radius-s.thickness/2 : s.radius}" fill="${s.type === 'ring' ? 'none' : color}"${s.type === 'ring' ? ` stroke="${color}" stroke-width="${s.thickness}"` : ''}/>`;
    }).join('\n');
    download('elyvris-layout.svg', `<svg xmlns="${ns}" viewBox="-20 -12 40 24">\n${elements}\n</svg>\n`, 'image/svg+xml'); announce('SVG drawing downloaded.');
  });
  document.getElementById('geometry-python').addEventListener('click', () => {
    if (!shapes.length) { announce('Add a shape before downloading Python.'); return; }
    const lines = ['# Elyvris geometry designer: dimensions in micrometres.', '# Requires gdsfactory. This is a layout, not an optical simulation.', 'import gdsfactory as gf', '', 'gf.gpdk.PDK.activate()', 'layout = gf.Component()', ''];
    shapes.forEach((s, i) => {
      lines.push(`# ${i+1}: ${names[s.type]} — material label: ${materialById(s.material)?.label || 'Unassigned'} (annotation only)`);
      if (s.type === 'rectangle') lines.push(`layout.add_polygon([(${s.x-s.width/2}, ${s.y-s.height/2}), (${s.x+s.width/2}, ${s.y-s.height/2}), (${s.x+s.width/2}, ${s.y+s.height/2}), (${s.x-s.width/2}, ${s.y+s.height/2})], layer=(1, 0))`);
      else if (s.type === 'triangle') lines.push(`layout.add_polygon([(${s.x}, ${s.y+s.height/2}), (${s.x-s.width/2}, ${s.y-s.height/2}), (${s.x+s.width/2}, ${s.y-s.height/2})], layer=(1, 0))`);
      else if (s.type === 'ellipse') lines.push(`element = gf.components.ellipse(radii=(${s.width/2}, ${s.height/2}), layer=(1, 0))`, 'ref = layout.add_ref(element)', `ref.movex(${s.x})`, `ref.movey(${s.y})`);
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
