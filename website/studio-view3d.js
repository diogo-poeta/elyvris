/* Elyvris Studio — small 3D viewer (WebGL, no external library).
 *
 * Draws a list of shapes on a reference grid. Coordinates are in
 * nanometres; z points up.
 *
 * Mouse:  drag = rotate · Shift+drag or right-drag = slide the view · wheel = zoom (after clicking the view)
 * Touch:  one finger = rotate · two fingers = pinch to zoom and slide
 * Keys:   arrows = rotate · + and - = zoom · 0 = fit
 * Click a shape to select it. In "move" mode, dragging a shape slides it
 * in the horizontal plane.
 */
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
      for (q = 0; q < segments; q++) idx.push(centre, centre + 1 + q, centre + 2 + q);
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
      for (j = 0; j < segments; j++) { var a = start + 2 * j; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    function face(z, nz) {
      var start = p.length / 3;
      for (var j = 0; j <= segments; j++) { var f = 2 * Math.PI * j / segments, c = Math.cos(f), s = Math.sin(f); p.push(c * inner, s * inner, z, c * 0.5, s * 0.5, z); n.push(0, 0, nz, 0, 0, nz); }
      for (j = 0; j < segments; j++) { var a = start + 2 * j; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
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
      idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    });
    return { p: p, n: n, idx: idx };
  }
  /* Split a polygon into triangles ("ear clipping"). Returns corner numbers, three per triangle. */
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
      tris.forEach(function (t) { idx.push(start + t); });
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

  // ---- Small vector and matrix helpers (column-major, as WebGL expects). ----
  function normalize(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function along(origin, direction, distance) { return [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance]; }
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
  function lookAt(eye, target) {
    var zAxis = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    var xAxis = normalize(cross([0, 0, 1], zAxis)), yAxis = cross(zAxis, xAxis);
    return [xAxis[0], yAxis[0], zAxis[0], 0, xAxis[1], yAxis[1], zAxis[1], 0, xAxis[2], yAxis[2], zAxis[2], 0, -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1];
  }
  function hex(color) { var v = parseInt(color.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }

  var FOV = 32 * Math.PI / 180;
  var FIT_MARGIN = 1.25;
  var BACKGROUND = hex('#131B23'), GRID = hex('#2b3948'), GRID_AXIS = hex('#4a5d73');
  var AXIS_COLORS = [hex('#E0786C'), hex('#7FC08A'), hex('#7AA7E8')];
  var VIEWS = { '3d': [-0.9, 0.48], top: [-Math.PI / 2, 1.5607], front: [-Math.PI / 2, 0], side: [0, 0] };

  function create(canvas, overlay, handlers) {
    handlers = handlers || {};
    var gl = canvas.getContext('webgl', { antialias: true, alpha: false });
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
    var meshes = { sphere: upload(sphereMesh(28, 44)), cylinder: upload(roundMesh(56, 0.5, 0.5)), arrowhead: upload(roundMesh(24, 0.5, 0)), box: upload(boxMesh()), grid: upload(gridMesh(20)) };
    // Shapes whose mesh depends on their numbers (cones, rings, prisms) are built on demand.
    var custom = {}, customCount = 0;
    function customMesh(key, build) {
      if (custom[key]) return custom[key];
      if (customCount > 80) { Object.keys(custom).forEach(function (k) { gl.deleteBuffer(custom[k].p); gl.deleteBuffer(custom[k].n); gl.deleteBuffer(custom[k].i); }); custom = {}; customCount = 0; }
      customCount++; return (custom[key] = upload(build()));
    }
    gl.enable(gl.DEPTH_TEST);

    var scene = { parts: [], center: [0, 0, 0], radius: 300, grid: 100 };
    var camera = { azimuth: VIEWS['3d'][0], elevation: VIEWS['3d'][1], distance: 1, target: [0, 0, 0], fit: 1 };
    var labels = {}, frame = 0, mode = 'orbit';

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
    function place(name, text, point, vp, box) {
      var w = vp[3] * point[0] + vp[7] * point[1] + vp[11] * point[2] + vp[15];
      var label = labels[name];
      if (!label) { label = labels[name] = document.createElement('span'); label.className = 'view-label'; overlay.append(label); }
      if (w <= 0) { label.hidden = true; return; }
      var x = (vp[0] * point[0] + vp[4] * point[1] + vp[8] * point[2] + vp[12]) / w;
      var y = (vp[1] * point[0] + vp[5] * point[1] + vp[9] * point[2] + vp[13]) / w;
      label.hidden = false; label.textContent = text;
      label.style.left = (box.x + (x + 1) / 2 * box.w) + 'px';
      label.style.top = (box.y + (1 - y) / 2 * box.h) + 'px';
    }

    function render() {
      frame = 0;
      var width = canvas.clientWidth, height = canvas.clientHeight;
      if (!width || !height) return;
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(BACKGROUND[0], BACKGROUND[1], BACKGROUND[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var eye = along(camera.target, direction(), camera.distance);
      setCamera(lookAt(eye, camera.target), perspective(FOV, width / height, camera.distance * 0.02, camera.distance + scene.radius * 40));
      // Reference grid on the plane z = 0: 20 squares across, one square = scene.grid nm.
      var span = 20 * scene.grid;
      drawBuffers(meshes.grid, { at: [0, 0, 0], scale: [span, span, 1], color: GRID, flat: true });
      drawBuffers(meshes.box, { at: [0, 0, 0], scale: [span, scene.grid * 0.02, scene.grid * 0.02], color: GRID_AXIS, flat: true });
      drawBuffers(meshes.box, { at: [0, 0, 0], scale: [scene.grid * 0.02, span, scene.grid * 0.02], color: GRID_AXIS, flat: true });
      scene.parts.forEach(function (part) {
        drawBuffers(buffersFor(part), { at: part.at, scale: part.size, rot: ROTATION[part.axis || 'z'], color: part.rgb, selected: part.selected });
      });

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
        place(name, name, along([0, 0, 0], axis, 1.25), vpAxes, cornerBox);
      });
      gl.disable(gl.SCISSOR_TEST);
    }
    function invalidate() { if (!frame) frame = requestAnimationFrame(render); }

    function clampCamera() {
      camera.elevation = Math.max(-1.5607, Math.min(1.5607, camera.elevation));
      camera.distance = Math.max(camera.fit * 0.05, Math.min(camera.fit * 20, camera.distance));
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
      var axes = screenAxes(), scale = 2 * camera.distance * Math.tan(FOV / 2) / canvas.clientHeight;
      camera.target = along(along(camera.target, axes.right, -dx * scale), axes.up, dy * scale);
    }
    /* Line from the camera through a point of the canvas. */
    function ray(event) {
      var rect = canvas.getBoundingClientRect(), axes = screenAxes(), tan = Math.tan(FOV / 2);
      var nx = ((event.clientX - rect.left) / rect.width * 2 - 1) * tan * rect.width / rect.height, ny = (1 - (event.clientY - rect.top) / rect.height * 2) * tan;
      return { origin: along(camera.target, direction(), camera.distance), dir: normalize(along(along(axes.forward, axes.right, nx), axes.up, ny)) };
    }
    /* Nearest shape under the pointer, tested against each shape's bounding box
     * (centre `at`, half sizes `half`). */
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
        else { camera.azimuth -= dx * 0.009; camera.elevation += dy * 0.009; }
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
      if (event.type === 'pointerup' && press && !press.moved && pointers.size === 1 && !dragging && handlers.onPick) handlers.onPick(pick(event));
      if (dragging && handlers.onMoveEnd) handlers.onMoveEnd();
      pointers.delete(event.pointerId); gesture = null; press = null; dragging = null;
    }
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
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
      else handled = false;
      if (handled) { event.preventDefault(); clampCamera(); invalidate(); }
    });

    if ('ResizeObserver' in window) new ResizeObserver(invalidate).observe(canvas);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) invalidate(); });
    canvas.addEventListener('webglcontextlost', function (event) { event.preventDefault(); });

    return {
      /* scene = { parts: [{ mesh, size: [x, y, z], at: [x, y, z], half: [x, y, z], axis,
       *                     color, selected, bottom, top, inner, points }],
       *           center: [x, y, z], radius, grid }   (all lengths in nm) */
      setScene: function (next, refit) {
        scene = next;
        scene.parts.forEach(function (part) { part.rgb = hex(part.color); });
        if (refit) fit(true);
        invalidate();
      },
      fit: function () { fit(true); invalidate(); },
      view: function (name) { var v = VIEWS[name] || VIEWS['3d']; camera.azimuth = v[0]; camera.elevation = v[1]; fit(true); invalidate(); },
      zoom: function (factor) { camera.distance *= factor; clampCamera(); invalidate(); },
      setMode: function (next) { mode = next === 'move' ? 'move' : 'orbit'; canvas.style.cursor = mode === 'move' ? 'move' : ''; },
      redraw: invalidate
    };
  }

  root.ElyvrisView3D = Object.freeze({ create: create });
}(typeof globalThis !== 'undefined' ? globalThis : window));
