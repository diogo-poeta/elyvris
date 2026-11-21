(function (root) {
  'use strict';

  var VERTEX = [
    'attribute vec3 aPos; attribute vec3 aNor;',
    'uniform mat4 uVP; uniform mat3 uRot; uniform mat3 uViewRot; uniform vec3 uScale; uniform vec3 uTrans;',
    'varying vec3 vN;',
    'void main() {',
    '  vec3 world = uRot * (aPos * uScale) + uTrans;',
    '  vN = uViewRot * (uRot * normalize(aNor / uScale));',
    '  gl_Position = uVP * vec4(world, 1.0);',
    '}'].join('\n');
  var FRAGMENT = [
    'precision mediump float;',
    'uniform vec3 uColor; uniform float uFlat; uniform float uSelect;',
    'varying vec3 vN;',
    'void main() {',
    '  vec3 n = normalize(vN);',
    '  if (!gl_FrontFacing) n = -n;',
    '  float d = max(dot(n, normalize(vec3(0.35, 0.5, 0.8))), 0.0);',
    '  float rim = pow(1.0 - max(n.z, 0.0), 3.0);',
    '  vec3 c = uColor * (0.45 + 0.6 * d) + vec3(0.18) * pow(d, 24.0);',
    '  c = mix(c, uColor * 0.55, rim * 0.3);',
    '  c = mix(c, vec3(1.0, 0.78, 0.36), uSelect * (0.22 + 0.6 * rim));',
    '  c = mix(c, uColor, uFlat);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'].join('\n');

  // ---- Meshes. Unit meshes fit in a box of side 1 centred on the origin. ----
  function sphereMesh(rows, columns) {
    var p = [], n = [], idx = [];
    for (var i = 0; i <= rows; i++) {
      var theta = Math.PI * i / rows;
      for (var j = 0; j <= columns; j++) {
        var phi = 2 * Math.PI * j / columns;
        var x = Math.sin(theta) * Math.cos(phi), y = Math.sin(theta) * Math.sin(phi), z = Math.cos(theta);
        p.push(x / 2, y / 2, z / 2); n.push(x, y, z);
      }
    }
    for (i = 0; i < rows; i++) for (j = 0; j < columns; j++) {
      var a = i * (columns + 1) + j, b = a + columns + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    return { p: p, n: n, idx: idx };
  }
  /* Cylinder, cone or cut cone along z, from z = -0.5 to z = 0.5. */
  function roundMesh(segments, bottom, top) {
    var p = [], n = [], idx = [], slope = bottom - top;
    for (var j = 0; j <= segments; j++) {
      var phi = 2 * Math.PI * j / segments, c = Math.cos(phi), s = Math.sin(phi);
      p.push(c * bottom, s * bottom, -0.5, c * top, s * top, 0.5);
      n.push(c, s, slope, c, s, slope);
    }
    for (j = 0; j < segments; j++) { var a = 2 * j; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    function cap(z, radius, nz) {
      if (!(radius > 0)) return;
      var centre = p.length / 3; p.push(0, 0, z); n.push(0, 0, nz);
      for (var q = 0; q <= segments; q++) { var f = 2 * Math.PI * q / segments; p.push(Math.cos(f) * radius, Math.sin(f) * radius, z); n.push(0, 0, nz); }
      for (q = 0; q < segments; q++) { if (nz > 0) idx.push(centre, centre + 1 + q, centre + 2 + q); else idx.push(centre, centre + 2 + q, centre + 1 + q); }   // anticlockwise seen from outside
    }
    cap(-0.5, bottom, -1); cap(0.5, top, 1);
    return { p: p, n: n, idx: idx };
  }
  /* Ring (tube): outer radius 0.5, inner radius 0.5 * ratio. */
  function ringMesh(segments, ratio) {
    var p = [], n = [], idx = [], inner = 0.5 * ratio;
    function wall(radius, sign) {
      var start = p.length / 3;
      for (var j = 0; j <= segments; j++) { var f = 2 * Math.PI * j / segments, c = Math.cos(f), s = Math.sin(f); p.push(c * radius, s * radius, -0.5, c * radius, s * radius, 0.5); n.push(sign * c, sign * s, 0, sign * c, sign * s, 0); }
      for (j = 0; j < segments; j++) { var a = start + 2 * j; if (sign > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    function face(z, nz) {
      var start = p.length / 3;
      for (var j = 0; j <= segments; j++) { var f = 2 * Math.PI * j / segments, c = Math.cos(f), s = Math.sin(f); p.push(c * inner, s * inner, z, c * 0.5, s * 0.5, z); n.push(0, 0, nz, 0, 0, nz); }
      for (j = 0; j < segments; j++) { var a = start + 2 * j; if (nz > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    wall(0.5, 1); wall(inner, -1); face(-0.5, -1); face(0.5, 1);
    return { p: p, n: n, idx: idx };
  }
  function boxMesh() {
    var p = [], n = [], idx = [];
    [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].forEach(function (normal) {
      var u = [normal[1], normal[2], normal[0]], v = [normal[2], normal[0], normal[1]], start = p.length / 3;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (corner) {
        for (var k = 0; k < 3; k++) p.push((normal[k] + corner[0] * u[k] + corner[1] * v[k]) / 2);
        n.push(normal[0], normal[1], normal[2]);
      });
      if (normal[0] + normal[1] + normal[2] > 0) idx.push(start, start + 2, start + 1, start, start + 3, start + 2);
      else idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    });
    return { p: p, n: n, idx: idx };
  }
  function triangulate(points) {
    var area = 0, count = points.length, order = [], triangles = [];
    for (var i = 0; i < count; i++) { var a = points[i], b = points[(i + 1) % count]; area += a[0] * b[1] - b[0] * a[1]; order.push(i); }
    if (area < 0) order.reverse();
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    function contains(a, b, c, q) { return cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0; }
    var guard = 0;
    while (order.length > 3 && guard++ < 5000) {
      var clipped = false;
      for (i = 0; i < order.length; i++) {
        var i0 = order[(i + order.length - 1) % order.length], i1 = order[i], i2 = order[(i + 1) % order.length];
        if (cross(points[i0], points[i1], points[i2]) <= 0) continue;
        var ear = true;
        for (var k = 0; k < order.length && ear; k++) { var q = order[k]; if (q !== i0 && q !== i1 && q !== i2 && contains(points[i0], points[i1], points[i2], points[q])) ear = false; }
        if (ear) { triangles.push(i0, i1, i2); order.splice(i, 1); clipped = true; break; }
      }
      if (!clipped) order.splice(0, 1);   // degenerate outline: drop a corner and carry on
    }
    if (order.length === 3) triangles.push(order[0], order[1], order[2]);
    return triangles;
  }
  /* Prism: polygon outline in nanometres (x, y), z from -0.5 to 0.5. */
  function prismMesh(points) {
    var p = [], n = [], idx = [], count = points.length, tris = triangulate(points);
    [[-0.5, -1], [0.5, 1]].forEach(function (cap) {
      var start = p.length / 3;
      points.forEach(function (q) { p.push(q[0], q[1], cap[0]); n.push(0, 0, cap[1]); });
      (cap[1] > 0 ? tris : tris.slice().reverse()).forEach(function (t) { idx.push(start + t); });   // the bottom cap is seen from below
    });
    for (var i = 0; i < count; i++) {
      var a = points[i], b = points[(i + 1) % count], nx = b[1] - a[1], ny = a[0] - b[0], start = p.length / 3;
      p.push(a[0], a[1], -0.5, b[0], b[1], -0.5, b[0], b[1], 0.5, a[0], a[1], 0.5);
      for (var k = 0; k < 4; k++) n.push(nx, ny, 0);
      idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    return { p: p, n: n, idx: idx };
  }
  function gridMesh(divisions) {
    var p = [], n = [], idx = [];
    for (var i = 0; i <= divisions; i++) {
      var t = i / divisions - 0.5;
      p.push(t, -0.5, 0, t, 0.5, 0, -0.5, t, 0, 0.5, t, 0);
      n.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    }
    for (i = 0; i < p.length / 3; i++) idx.push(i);
    return { p: p, n: n, idx: idx, lines: true };
  }

  function edgesMesh() {
    var p = [], n = [], idx = [], c = [-0.5, 0.5];
    c.forEach(function (a) { c.forEach(function (b) {
      p.push(-0.5, a, b, 0.5, a, b);   // along x
      p.push(a, -0.5, b, a, 0.5, b);   // along y
      p.push(a, b, -0.5, a, b, 0.5);   // along z
    }); });
    for (var i = 0; i < p.length / 3; i++) { n.push(0, 0, 1); idx.push(i); }
    return { p: p, n: n, idx: idx, lines: true };
  }

  // ---- Small vector and matrix helpers (column-major, as WebGL expects). ----
  function normalize(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function along(origin, direction, distance) { return [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance]; }
  // A rotation (column-major 3 × 3) that turns the z axis of a mesh into the unit vector d.
  function rotationTo(d) {
    var helper = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    var u = normalize(cross(helper, d)), v = cross(d, u);
    return [u[0], u[1], u[2], v[0], v[1], v[2], d[0], d[1], d[2]];
  }
  var ROTATION = {   // turns a shape built along z so that it lies along x or y
    z: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    x: [0, 1, 0, 0, 0, 1, 1, 0, 0],
    y: [0, 0, 1, 1, 0, 0, 0, 1, 0]
  };
  function multiply(a, b) {
    var out = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return out;
  }
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0];
  }
  function orthographic(halfWidth, halfHeight, near, far) {
    return [1 / halfWidth, 0, 0, 0, 0, 1 / halfHeight, 0, 0, 0, 0, -2 / (far - near), 0, 0, 0, -(far + near) / (far - near), 1];
  }
  function lookAt(eye, target) {
    var zAxis = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    var xAxis = normalize(cross([0, 0, 1], zAxis)), yAxis = cross(zAxis, xAxis);
    return [xAxis[0], yAxis[0], zAxis[0], 0, xAxis[1], yAxis[1], zAxis[1], 0, xAxis[2], yAxis[2], zAxis[2], 0, -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1];
  }
  function hex(color) { var v = parseInt(color.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }

  var FOV = 32 * Math.PI / 180;
  var FIT_MARGIN = 1.25;
  var GRID = hex('#373c50'), GRID_AXIS = hex('#565d77');
  var PAPER = [1, 1, 1];          // background of an exported figure
  var MAX_FIGURE = 4096;          // largest figure side in pixels
  var AXIS_COLORS = [hex('#E0786C'), hex('#7FC08A'), hex('#7AA7E8')];
  var VIEWS = { '3d': [-0.9, 0.48], top: [-Math.PI / 2, 1.5607], front: [-Math.PI / 2, 0], side: [0, 0] };

  function create(canvas, overlay, handlers) {
    handlers = handlers || {};
    var gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!gl) return null;
    var program = gl.createProgram();
    [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]].forEach(function (source) {
      var shader = gl.createShader(source[0]); gl.shaderSource(shader, source[1]); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    var loc = {};
    ['uVP', 'uRot', 'uViewRot', 'uScale', 'uTrans', 'uColor', 'uFlat', 'uSelect'].forEach(function (name) { loc[name] = gl.getUniformLocation(program, name); });
    var aPos = gl.getAttribLocation(program, 'aPos'), aNor = gl.getAttribLocation(program, 'aNor');
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNor);
    function upload(mesh) {
      var buffers = { count: mesh.idx.length, lines: !!mesh.lines, p: gl.createBuffer(), n: gl.createBuffer(), i: gl.createBuffer() };
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.p); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.p), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.n); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.n), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
      return buffers;
    }
    var meshes = { sphere: upload(sphereMesh(28, 44)), cylinder: upload(roundMesh(56, 0.5, 0.5)), arrowhead: upload(roundMesh(24, 0.5, 0)), box: upload(boxMesh()), grid: upload(gridMesh(20)), edges: upload(edgesMesh()) };
    // Shapes whose mesh depends on their numbers (cones, rings, prisms) are built on demand.
    var custom = {}, customCount = 0;
    function customMesh(key, build) {
      if (custom[key]) return custom[key];
      if (customCount > 80) { Object.keys(custom).forEach(function (k) { gl.deleteBuffer(custom[k].p); gl.deleteBuffer(custom[k].n); gl.deleteBuffer(custom[k].i); }); custom = {}; customCount = 0; }
      customCount++; return (custom[key] = upload(build()));
    }
    gl.enable(gl.DEPTH_TEST);

    var scene = { parts: [], center: [0, 0, 0], radius: 300, grid: 100 };
    var camera = { azimuth: VIEWS['3d'][0], elevation: VIEWS['3d'][1], distance: 1, target: [0, 0, 0], fit: 1, ortho: false };
    var labels = {}, frame = 0, mode = 'orbit', currentView = '3d';
    var ruler = { a: null, b: null, hover: null }, lastVP = null, rulerNodes = null;

    function drawBuffers(buffers, options) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.p); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.n); gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.i);
      gl.uniformMatrix3fv(loc.uRot, false, options.rot || ROTATION.z);
      gl.uniform3fv(loc.uScale, options.scale); gl.uniform3fv(loc.uTrans, options.at);
      gl.uniform3fv(loc.uColor, options.color); gl.uniform1f(loc.uFlat, options.flat ? 1 : 0); gl.uniform1f(loc.uSelect, options.selected ? 1 : 0);
      gl.drawElements(buffers.lines ? gl.LINES : gl.TRIANGLES, buffers.count, gl.UNSIGNED_SHORT, 0);
    }
    function buffersFor(part) {
      if (part.mesh === 'cone') { var b = Math.round(part.bottom * 500) / 1000, t = Math.round(part.top * 500) / 1000; return customMesh('cone:' + b + ':' + t, function () { return roundMesh(56, b, t); }); }
      if (part.mesh === 'ring') { var ratio = Math.round(part.inner * 1000) / 1000; return customMesh('ring:' + ratio, function () { return ringMesh(64, ratio); }); }
      if (part.mesh === 'prism') return customMesh('prism:' + part.points.map(function (q) { return Math.round(q[0] * 10) + ',' + Math.round(q[1] * 10); }).join(';'), function () { return prismMesh(part.points); });
      return meshes[part.mesh];
    }
    function direction() { var ce = Math.cos(camera.elevation); return [ce * Math.cos(camera.azimuth), ce * Math.sin(camera.azimuth), Math.sin(camera.elevation)]; }
    function setCamera(view, projection) {
      gl.uniformMatrix4fv(loc.uVP, false, multiply(projection, view));
      gl.uniformMatrix3fv(loc.uViewRot, false, [view[0], view[1], view[2], view[4], view[5], view[6], view[8], view[9], view[10]]);
      return multiply(projection, view);
    }
    function place(name, text, point, vp, box, shot) {
      var w = vp[3] * point[0] + vp[7] * point[1] + vp[11] * point[2] + vp[15];
      var x = (vp[0] * point[0] + vp[4] * point[1] + vp[8] * point[2] + vp[12]) / w;
      var y = (vp[1] * point[0] + vp[5] * point[1] + vp[9] * point[2] + vp[13]) / w;
      if (shot) { if (w > 0) shot.labels.push({ text: text, x: (box.x + (x + 1) / 2 * box.w) * shot.ratio, y: (box.y + (1 - y) / 2 * box.h) * shot.ratio }); return; }
      var label = labels[name];
      if (!label) { label = labels[name] = document.createElement('span'); label.className = 'view-label'; overlay.append(label); }
      if (w <= 0) { label.hidden = true; return; }
      label.hidden = false; label.textContent = text;
      label.style.left = (box.x + (x + 1) / 2 * box.w) + 'px';
      label.style.top = (box.y + (1 - y) / 2 * box.h) + 'px';
    }

    function halfHeight() { return camera.distance * Math.tan(FOV / 2); }

    function render(shot) {
      if (!shot) frame = 0;
      var width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      var ratio = shot ? shot.ratio : Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, canvas.width, canvas.height);
      // The viewport background comes from CSS. A figure on paper gets opaque white;
      // a figure "as on screen" or transparent keeps the see-through clear (the figure maker paints behind it).
      var paper = shot && shot.background === 'paper', withGrid = !shot || shot.background === 'screen';
      if (paper) gl.clearColor(PAPER[0], PAPER[1], PAPER[2], 1);
      else gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var eye = along(camera.target, direction(), camera.distance), reach = scene.radius * 40;
      var mainVP = setCamera(lookAt(eye, camera.target), camera.ortho
        ? orthographic(halfHeight() * width / height, halfHeight(), -reach, camera.distance + reach)
        : perspective(FOV, width / height, camera.distance * 0.02, camera.distance + reach));
      if (!shot) lastVP = mainVP;
      else shot.vp = mainVP;
      if (withGrid) {
        // Reference grid on the plane z = 0: 20 squares across, one square = scene.grid nm.
        var span = 20 * scene.grid;
        // Leave the depth buffer clear for geometry, including faces that lie exactly on z = 0.
        gl.depthMask(false);
        drawBuffers(meshes.grid, { at: [0, 0, 0], scale: [span, span, 1], color: GRID, flat: true });
        drawBuffers(meshes.box, { at: [0, 0, 0], scale: [span, scene.grid * 0.02, scene.grid * 0.02], color: GRID_AXIS, flat: true });
        drawBuffers(meshes.box, { at: [0, 0, 0], scale: [scene.grid * 0.02, span, scene.grid * 0.02], color: GRID_AXIS, flat: true });
        gl.depthMask(true);
      }
      scene.parts.forEach(function (part) {
        drawBuffers(buffersFor(part), { at: part.at, scale: part.size, rot: ROTATION[part.axis || 'z'], color: part.rgb, selected: !shot && part.selected });
      });
      // The simulation setup (cell, boundary layers) as thin outlines, so it never hides a shape. Its labels are on the page only.
      var setup = scene.setup || { boxes: [], labels: [] }, mainBox = { x: 0, y: 0, w: width, h: height };
      setup.boxes.forEach(function (box) { if (!box.front) drawBuffers(meshes.edges, { at: box.center, scale: box.size, color: box.rgb, flat: true }); });
      gl.disable(gl.DEPTH_TEST);
      setup.boxes.forEach(function (box) { if (box.front) drawBuffers(meshes.edges, { at: box.center, scale: box.size, color: box.rgb, flat: true }); });
      (setup.dots || []).forEach(function (dot) { drawBuffers(meshes.sphere, { at: dot.center, scale: [dot.size, dot.size, dot.size], color: dot.rgb, flat: true }); });
      (setup.arrows || []).forEach(function (arrow) {
        var d = arrow.dir, L = arrow.length, w = L * 0.05, head = L * 0.22, start = arrow.both ? along(arrow.from, d, -L / 2) : arrow.from;
        var rot = rotationTo(d), back = rotationTo([-d[0], -d[1], -d[2]]);
        var shaft = L - head * (arrow.both ? 2 : 1);
        drawBuffers(meshes.cylinder, { at: along(start, d, (arrow.both ? head : 0) + shaft / 2), scale: [w, w, shaft], rot: rot, color: arrow.rgb, flat: true });
        drawBuffers(meshes.arrowhead, { at: along(start, d, L - head / 2), scale: [w * 3, w * 3, head], rot: rot, color: arrow.rgb, flat: true });
        if (arrow.both) drawBuffers(meshes.arrowhead, { at: along(start, d, head / 2), scale: [w * 3, w * 3, head], rot: back, color: arrow.rgb, flat: true });
      });
      gl.enable(gl.DEPTH_TEST);
      if (!shot) {
        setup.labels.forEach(function (label, i) { place('setup' + i, label.text, label.at, mainVP, mainBox); });
        Object.keys(labels).forEach(function (name) { if (/^setup\d+$/.test(name) && Number(name.slice(5)) >= setup.labels.length) labels[name].hidden = true; });
      }

      // Orientation axes in the bottom-left corner.
      var corner = Math.round(Math.min(92, width * 0.22)), px = Math.round(corner * ratio);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, px, px); gl.viewport(0, 0, px, px);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      var vpAxes = setCamera(lookAt(along([0, 0, 0], direction(), 5.2), [0, 0, 0]), perspective(FOV, 1, 0.5, 20));
      var cornerBox = { x: 0, y: height - corner, w: corner, h: corner };
      ['x', 'y', 'z'].forEach(function (name, index) {
        var axis = [index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0];
        drawBuffers(meshes.cylinder, { at: along([0, 0, 0], axis, 0.35), scale: [0.07, 0.07, 0.7], rot: ROTATION[name], color: AXIS_COLORS[index], flat: true });
        drawBuffers(meshes.arrowhead, { at: along([0, 0, 0], axis, 0.83), scale: [0.2, 0.2, 0.28], rot: ROTATION[name], color: AXIS_COLORS[index], flat: true });
        place(name, name, along([0, 0, 0], axis, 1.25), vpAxes, cornerBox, shot);
      });
      gl.disable(gl.SCISSOR_TEST);
      if (!shot) drawRuler();
    }
    function invalidate() { if (!frame) frame = requestAnimationFrame(function () { render(); }); }

    function clampCamera() {
      camera.elevation = Math.max(-1.5607, Math.min(1.5607, camera.elevation));
      camera.distance = Math.max(camera.fit * 0.05, Math.min(camera.fit * 20, camera.distance));
    }
    function setProjection(name) {
      camera.ortho = name !== '3d';
      if (name === currentView) return;
      currentView = name;
      if (handlers.onViewChange) handlers.onViewChange(name);
    }
    function fit(keepAngles) {
      camera.fit = scene.radius / Math.sin(FOV / 2) * FIT_MARGIN;
      camera.distance = camera.fit; camera.target = scene.center.slice();
      if (!keepAngles) { camera.azimuth = VIEWS['3d'][0]; camera.elevation = VIEWS['3d'][1]; }
    }
    function screenAxes() {
      var d = direction(), forward = [-d[0], -d[1], -d[2]], right = normalize(cross(forward, [0, 0, 1])), up = cross(right, forward);
      return { forward: forward, right: right, up: up };
    }
    function pan(dx, dy) {
      var axes = screenAxes(), scale = 2 * halfHeight() / canvas.clientHeight;
      camera.target = along(along(camera.target, axes.right, -dx * scale), axes.up, dy * scale);
    }
    /* Line from the camera through a point of the canvas. */
    function ray(event) {
      var rect = canvas.getBoundingClientRect(), axes = screenAxes(), tan = Math.tan(FOV / 2);
      var nx = ((event.clientX - rect.left) / rect.width * 2 - 1) * tan * rect.width / rect.height, ny = (1 - (event.clientY - rect.top) / rect.height * 2) * tan;
      if (camera.ortho) {
        var eye = along(camera.target, direction(), camera.distance + scene.radius * 40);
        return { origin: along(along(eye, axes.right, nx * camera.distance), axes.up, ny * camera.distance), dir: axes.forward };
      }
      return { origin: along(camera.target, direction(), camera.distance), dir: normalize(along(along(axes.forward, axes.right, nx), axes.up, ny)) };
    }
    function pick(event) {
      var r = ray(event), best = -1, nearest = Infinity;
      scene.parts.forEach(function (part, index) {
        var enter = -Infinity, leave = Infinity;
        for (var k = 0; k < 3; k++) {
          var low = part.at[k] - part.half[k], high = part.at[k] + part.half[k];
          if (Math.abs(r.dir[k]) < 1e-12) { if (r.origin[k] < low || r.origin[k] > high) return; continue; }
          var t1 = (low - r.origin[k]) / r.dir[k], t2 = (high - r.origin[k]) / r.dir[k];
          enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
        }
        if (leave >= Math.max(enter, 0) && enter < nearest) { nearest = enter; best = index; }
      });
      return best;
    }
    function onPlane(event, z) {
      var r = ray(event);
      if (Math.abs(r.dir[2]) < 0.06) return null;
      var t = (z - r.origin[2]) / r.dir[2];
      return t > 0 ? along(r.origin, r.dir, t) : null;
    }

    function keyPoints(part) {
      var c = part.at, h = part.half, endless = part.endless || [false, false, false], out = [c.slice()], main = { x: 0, y: 1, z: 2 }[part.axis || 'z'];
      function face(k, sign) { if (endless[k]) return; var p = c.slice(); p[k] += sign * h[k]; out.push(p); }
      if (part.mesh === 'box') {
        [0, 1, 2].forEach(function (k) { face(k, -1); face(k, 1); });
        if (!endless[0] && !endless[1] && !endless[2]) [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sy) { [-1, 1].forEach(function (sz) { out.push([c[0] + sx * h[0], c[1] + sy * h[1], c[2] + sz * h[2]]); }); }); });
      } else if (part.mesh === 'sphere') [0, 1, 2].forEach(function (k) { face(k, -1); face(k, 1); });
      else if (part.mesh === 'prism') {
        face(2, -1); face(2, 1);
        if (!endless[2]) part.points.forEach(function (q) { out.push([c[0] + q[0], c[1] + q[1], c[2] - h[2]]); out.push([c[0] + q[0], c[1] + q[1], c[2] + h[2]]); });
      } else {
        face(main, -1); face(main, 1);                                            // the two flat ends
        if (part.mesh !== 'cone') [0, 1, 2].forEach(function (k) { if (k !== main) { face(k, -1); face(k, 1); } });   // the outermost points of the side wall
        if (part.mesh === 'ring') [0, 1].forEach(function (k) { [-1, 1].forEach(function (sign) { var p = c.slice(); p[k] += sign * h[k] * part.inner; out.push(p); }); });   // the wall of the hole
      }
      return out;
    }
    function toScreen(point) {
      if (!lastVP || !point) return null;
      var vp = lastVP, w = vp[3] * point[0] + vp[7] * point[1] + vp[11] * point[2] + vp[15];
      if (w <= 0) return null;
      var x = (vp[0] * point[0] + vp[4] * point[1] + vp[8] * point[2] + vp[12]) / w, y = (vp[1] * point[0] + vp[5] * point[1] + vp[9] * point[2] + vp[13]) / w;
      return [(x + 1) / 2 * canvas.clientWidth, (1 - y) / 2 * canvas.clientHeight];
    }
    function resolve(ref) {
      if (!ref) return null; if (ref.free) return ref.free;
      var part = scene.parts[ref.part]; return part ? keyPoints(part)[ref.key] || null : null;
    }
    function snap(event) {
      var rect = canvas.getBoundingClientRect(), mx = event.clientX - rect.left, my = event.clientY - rect.top, best = null, bestDistance = 14;
      scene.parts.forEach(function (part, index) {
        keyPoints(part).forEach(function (point, key) {
          var s = toScreen(point); if (!s) return;
          var d = Math.hypot(s[0] - mx, s[1] - my); if (d < bestDistance) { bestDistance = d; best = { part: index, key: key }; }
        });
      });
      if (best) return best;
      var ground = onPlane(event, 0);
      return ground ? { free: [Math.round(ground[0]), Math.round(ground[1]), 0] } : null;
    }
    function lengthText(nm) { if (handlers.format) return handlers.format(nm); return nm >= 1000 ? Number((nm / 1000).toPrecision(5)) + ' µm' : Number(nm.toFixed(1)) + ' nm'; }
    function measurement() {
      var a = resolve(ruler.a), b = resolve(ruler.b);
      if (!a) return null; if (!b) return { a: a };
      var delta = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      return { a: a, b: b, delta: delta, distance: Math.hypot(delta[0], delta[1], delta[2]) };
    }
    function report() { if (handlers.onMeasure) handlers.onMeasure(measurement()); }
    function drawRuler() {
      if (!rulerNodes) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        svg.setAttribute('class', 'ruler-svg'); svg.append(line);
        var make = function (className) { var node = document.createElement('span'); node.className = className; node.hidden = true; return node; };
        rulerNodes = { svg: svg, line: line, a: make('ruler-dot'), b: make('ruler-dot'), hover: make('ruler-dot hover'), label: make('ruler-label') };
        overlay.append(svg, rulerNodes.hover, rulerNodes.a, rulerNodes.b, rulerNodes.label);
      }
      var m = measurement(), a = m && toScreen(m.a), b = m && m.b && toScreen(m.b), hover = mode === 'measure' ? toScreen(resolve(ruler.hover)) : null;
      var dot = function (node, s) { node.hidden = !s; if (s) { node.style.left = s[0] + 'px'; node.style.top = s[1] + 'px'; } };
      dot(rulerNodes.a, a); dot(rulerNodes.b, b); dot(rulerNodes.hover, hover);
      var both = !!(a && b);
      rulerNodes.svg.style.display = both ? '' : 'none'; rulerNodes.label.hidden = !both;
      if (both) {
        rulerNodes.line.setAttribute('x1', a[0]); rulerNodes.line.setAttribute('y1', a[1]); rulerNodes.line.setAttribute('x2', b[0]); rulerNodes.line.setAttribute('y2', b[1]);
        rulerNodes.label.textContent = lengthText(m.distance);
        rulerNodes.label.style.left = (a[0] + b[0]) / 2 + 'px'; rulerNodes.label.style.top = (a[1] + b[1]) / 2 + 'px';
      }
    }
    function clearRuler() { ruler.a = ruler.b = ruler.hover = null; report(); invalidate(); }

    // ---- Pointer input: works for mouse, pen and touch. ----
    var pointers = new Map(), gesture = null, press = null, dragging = null;
    canvas.addEventListener('pointerdown', function (event) {
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic pointer */ }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      gesture = null; dragging = null;
      press = pointers.size === 1 ? { x: event.clientX, y: event.clientY, moved: false } : null;
      if (event.pointerType === 'mouse') canvas.focus({ preventScroll: true });
      if (mode === 'move' && pointers.size === 1) {
        var index = pick(event);
        if (index >= 0) {
          var part = scene.parts[index], start = onPlane(event, part.at[2]);
          if (handlers.onPick) handlers.onPick(index);
          if (start) dragging = { index: index, start: start, x: part.at[0], y: part.at[1], z: part.at[2] };
        }
      }
    });
    canvas.addEventListener('pointermove', function (event) {
      var previous = pointers.get(event.pointerId); if (!previous) return;
      var current = { x: event.clientX, y: event.clientY };
      if (press && Math.hypot(current.x - press.x, current.y - press.y) > 5) press.moved = true;
      if (pointers.size === 1) {
        var dx = current.x - previous.x, dy = current.y - previous.y;
        if (dragging) {
          var point = onPlane(event, dragging.z);
          if (point && handlers.onMove) handlers.onMove(dragging.index, dragging.x + point[0] - dragging.start[0], dragging.y + point[1] - dragging.start[1]);
        } else if (event.shiftKey || event.buttons === 2 || event.buttons === 4) pan(dx, dy);
        else { camera.azimuth -= dx * 0.009; camera.elevation += dy * 0.009; if (dx || dy) setProjection('3d'); }
      }
      pointers.set(event.pointerId, current);
      if (pointers.size === 2) {
        var both = Array.from(pointers.values());
        var spread = Math.hypot(both[0].x - both[1].x, both[0].y - both[1].y), cx = (both[0].x + both[1].x) / 2, cy = (both[0].y + both[1].y) / 2;
        if (gesture) { camera.distance *= gesture.spread / Math.max(spread, 1); pan(cx - gesture.cx, cy - gesture.cy); }
        gesture = { spread: spread, cx: cx, cy: cy };
      }
      clampCamera(); invalidate();
    });
    function release(event) {
      if (event.type === 'pointerup' && press && !press.moved && pointers.size === 1 && !dragging) {
        if (mode === 'measure') {
          // First click: start point. Second click: end point. A third click starts again.
          var hit = snap(event);
          if (hit) { if (!ruler.a || ruler.b) { ruler.a = hit; ruler.b = null; } else ruler.b = hit; report(); invalidate(); }
        } else if (handlers.onPick) handlers.onPick(pick(event));
      }
      if (dragging && handlers.onMoveEnd) handlers.onMoveEnd();
      pointers.delete(event.pointerId); gesture = null; press = null; dragging = null;
    }
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    // While measuring, a ring shows the shape point the next click would catch.
    canvas.addEventListener('pointermove', function (event) {
      if (mode !== 'measure' || pointers.size) return;
      var hit = snap(event); ruler.hover = hit && !hit.free ? hit : null; drawRuler();
    });
    canvas.addEventListener('pointerleave', function () { if (ruler.hover) { ruler.hover = null; drawRuler(); } });
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    canvas.addEventListener('dblclick', function () { fit(true); invalidate(); });
    canvas.addEventListener('wheel', function (event) {
      // Zoom only once the view has focus, so the page can still be scrolled past it.
      if (document.activeElement !== canvas && !event.ctrlKey) return;
      event.preventDefault();
      camera.distance *= Math.exp(Math.max(-1, Math.min(1, event.deltaY / 240)) * 0.35);
      clampCamera(); invalidate();
    }, { passive: false });
    canvas.addEventListener('keydown', function (event) {
      var step = 0.12, handled = true;
      if (event.key === 'ArrowLeft') camera.azimuth -= step;
      else if (event.key === 'ArrowRight') camera.azimuth += step;
      else if (event.key === 'ArrowUp') camera.elevation += step;
      else if (event.key === 'ArrowDown') camera.elevation -= step;
      else if (event.key === '+' || event.key === '=') camera.distance /= 1.2;
      else if (event.key === '-') camera.distance *= 1.2;
      else if (event.key === '0' || event.key === 'Home') fit(true);
      else if (event.key === 'Escape' && mode === 'measure') clearRuler();
      else handled = false;
      if (handled && event.key.indexOf('Arrow') === 0) setProjection('3d');
      if (handled) { event.preventDefault(); clampCamera(); invalidate(); }
    });

    if ('ResizeObserver' in window) new ResizeObserver(invalidate).observe(canvas);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) invalidate(); });
    canvas.addEventListener('webglcontextlost', function (event) { event.preventDefault(); });

    return {
      setScene: function (next, refit) {
        scene = next;
        scene.parts.forEach(function (part) { part.rgb = hex(part.color); });
        if (scene.setup) [].concat(scene.setup.boxes, scene.setup.dots || [], scene.setup.arrows || []).forEach(function (item) { item.rgb = hex(item.color); });
        if (refit) fit(true);
        if ((ruler.a && !resolve(ruler.a)) || (ruler.b && !resolve(ruler.b))) { ruler.a = ruler.b = null; }   // the measured shape is gone
        ruler.hover = null;
        if (ruler.a) report();
        invalidate();
      },
      fit: function () { fit(true); invalidate(); },
      view: function (name) {
        var v = VIEWS[name] || VIEWS['3d']; camera.azimuth = v[0]; camera.elevation = v[1];
        setProjection(v === VIEWS['3d'] ? '3d' : name);
        fit(true); invalidate();
      },
      /* options.background: 'paper' (white, no grid, the default), 'screen' (see-through, with the grid)
         or 'none' (see-through, no grid). project(point) gives the pixel of a point (in nm) in the copy. */
      snapshot: function (pixelWidth, options) {
        var width = canvas.clientWidth, height = canvas.clientHeight;
        if (!width || !height) return null;
        var background = options && (options.background === 'screen' || options.background === 'none') ? options.background : 'paper';
        var limit = Math.min(MAX_FIGURE, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || MAX_FIGURE);
        var shot = { ratio: Math.min(pixelWidth, limit, limit * width / height) / width, labels: [], background: background };
        render(shot);
        // Copy at once: the browser may clear the WebGL picture after this task.
        var copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
        copy.getContext('2d').drawImage(canvas, 0, 0);
        render();                                              // back to the page size
        var vp = shot.vp;
        function project(point) {
          var w = vp[3] * point[0] + vp[7] * point[1] + vp[11] * point[2] + vp[15];
          if (!(w > 0)) return null;
          var x = (vp[0] * point[0] + vp[4] * point[1] + vp[8] * point[2] + vp[12]) / w, y = (vp[1] * point[0] + vp[5] * point[1] + vp[9] * point[2] + vp[13]) / w;
          return [(x + 1) / 2 * copy.width, (1 - y) / 2 * copy.height];
        }
        return { canvas: copy, labels: shot.labels, nmPerPixel: camera.ortho ? 2 * halfHeight() / copy.height : null, background: background, project: project, ratio: shot.ratio };
      },
      zoom: function (factor) { camera.distance *= factor; clampCamera(); invalidate(); },
      setMode: function (next) {
        var before = mode;
        mode = next === 'move' || next === 'measure' ? next : 'orbit';
        canvas.style.cursor = mode === 'move' ? 'move' : mode === 'measure' ? 'crosshair' : '';
        if (before === 'measure' && mode !== 'measure') clearRuler();
      },
      keyPoints: function (index) { return scene.parts[index] ? keyPoints(scene.parts[index]) : []; },
      setRuler: function (a, b) { ruler.a = a || null; ruler.b = (a && b) || null; report(); invalidate(); return measurement(); },
      redraw: invalidate
    };
  }

  root.ElyvrisView3D = Object.freeze({ create: create });
}(typeof globalThis !== 'undefined' ? globalThis : window));
