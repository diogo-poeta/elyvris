/* Elyvris Studio — small 3D viewer (WebGL, no external library).
 *
 * Draws spheres, cylinders and boxes, plus a schematic of the incoming light.
 * Coordinates are in nanometres; z points up.
 *
 * Mouse:  drag = rotate · Shift+drag or right-drag = move · wheel = zoom (after clicking the view)
 * Touch:  one finger = rotate · two fingers = pinch to zoom and move
 * Keys:   arrows = rotate · + and - = zoom · 0 = reset
 *
 * Rotating or moving the view never changes the calculation: the light
 * direction is fixed relative to the object and drawn with arrows.
 */
(function (root) {
  'use strict';

  var VERTEX = [
    'attribute vec3 aPos; attribute vec3 aNor;',
    'uniform mat4 uVP; uniform mat3 uRot; uniform mat3 uViewRot; uniform vec3 uScale; uniform vec3 uTrans;',
    'varying vec3 vN; varying float vAxis;',
    'void main() {',
    '  vec3 world = uRot * (aPos * uScale) + uTrans;',
    '  vN = uViewRot * (uRot * normalize(aNor / uScale));',
    '  vAxis = aPos.z;',
    '  gl_Position = uVP * vec4(world, 1.0);',
    '}'].join('\n');
  var FRAGMENT = [
    'precision mediump float;',
    'uniform vec3 uColor; uniform vec3 uBg; uniform float uFade; uniform float uFlat;',
    'varying vec3 vN; varying float vAxis;',
    'void main() {',
    '  vec3 n = normalize(vN);',
    '  float d = max(dot(n, normalize(vec3(0.35, 0.5, 0.8))), 0.0);',
    '  float rim = pow(1.0 - max(n.z, 0.0), 3.0);',
    '  vec3 c = uColor * (0.42 + 0.62 * d) + vec3(0.22) * pow(d, 24.0);',
    '  c = mix(c, uColor * 0.55, rim * 0.3);',
    '  c = mix(c, uColor, uFlat);',
    '  if (uFade > 0.0) c = mix(c, uBg, smoothstep(0.2, 0.5, abs(vAxis)));',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'].join('\n');

  // ---- Unit meshes: each fits in a box of side 1 centred on the origin. ----
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
  function roundMesh(segments, topRadius, zBottom, zTop) {
    // Cylinder (topRadius = 0.5) or cone (topRadius = 0), axis along z.
    var p = [], n = [], idx = [], slope = (0.5 - topRadius) / (zTop - zBottom);
    for (var j = 0; j <= segments; j++) {
      var phi = 2 * Math.PI * j / segments, c = Math.cos(phi), s = Math.sin(phi);
      p.push(c / 2, s / 2, zBottom, c * topRadius, s * topRadius, zTop);
      n.push(c, s, slope, c, s, slope);
    }
    for (j = 0; j < segments; j++) { var a = 2 * j; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    function cap(z, radius, nz) {
      var centre = p.length / 3; p.push(0, 0, z); n.push(0, 0, nz);
      for (var q = 0; q <= segments; q++) { var f = 2 * Math.PI * q / segments; p.push(Math.cos(f) * radius, Math.sin(f) * radius, z); n.push(0, 0, nz); }
      for (q = 0; q < segments; q++) idx.push(centre, centre + 1 + q, centre + 2 + q);
    }
    cap(zBottom, 0.5, -1); if (topRadius > 0) cap(zTop, topRadius, 1);
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

  // ---- Small vector and matrix helpers (column-major, as WebGL expects). ----
  function normalize(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function along(origin, direction, distance) { return [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance, origin[2] + direction[2] * distance]; }
  function basis(w) { // rotation whose z axis points along w
    w = normalize(w);
    var u = normalize(cross(Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], w)), v = cross(w, u);
    return [u[0], u[1], u[2], v[0], v[1], v[2], w[0], w[1], w[2]];
  }
  var IDENTITY3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
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
  var FIT_MARGIN = 2.5; // how far the camera starts, in units of the closest distance that shows the whole object
  var BACKGROUND = hex('#131B23'), AMBER = hex('#EFB653'), LAVENDER = hex('#A38CD9');
  var AXIS_COLORS = [hex('#E0786C'), hex('#7FC08A'), hex('#7AA7E8')];

  function create(canvas, overlay) {
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
    ['uVP', 'uRot', 'uViewRot', 'uScale', 'uTrans', 'uColor', 'uBg', 'uFade', 'uFlat'].forEach(function (name) { loc[name] = gl.getUniformLocation(program, name); });
    var aPos = gl.getAttribLocation(program, 'aPos'), aNor = gl.getAttribLocation(program, 'aNor');
    gl.enableVertexAttribArray(aPos); gl.enableVertexAttribArray(aNor);
    function upload(mesh) {
      var buffers = { count: mesh.idx.length, p: gl.createBuffer(), n: gl.createBuffer(), i: gl.createBuffer() };
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.p); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.p), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.n); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.n), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.idx), gl.STATIC_DRAW);
      return buffers;
    }
    var meshes = { sphere: upload(sphereMesh(28, 44)), dot: upload(sphereMesh(8, 12)), cylinder: upload(roundMesh(56, 0.5, -0.5, 0.5)), cone: upload(roundMesh(28, 0, 0, 1)), box: upload(boxMesh()) };
    gl.enable(gl.DEPTH_TEST);
    gl.uniform3fv(loc.uBg, BACKGROUND);

    var scene = { parts: [], light: null, radius: 100 };
    var camera = { azimuth: -0.9, elevation: 0.42, distance: 1, target: [0, 0, 0], fit: 1 };
    var labels = {}, dirty = true, motion = false, visible = true, frame = 0, clock = 0, last = 0;

    function draw(mesh, options) {
      var buffers = meshes[mesh];
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.p); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.n); gl.vertexAttribPointer(aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.i);
      gl.uniformMatrix3fv(loc.uRot, false, options.rot || IDENTITY3);
      gl.uniform3fv(loc.uScale, options.scale); gl.uniform3fv(loc.uTrans, options.at);
      gl.uniform3fv(loc.uColor, options.color); gl.uniform1f(loc.uFade, options.fade ? 1 : 0); gl.uniform1f(loc.uFlat, options.flat ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, buffers.count, gl.UNSIGNED_SHORT, 0);
    }
    function arrow(from, direction, length, thickness, color) {
      var d = normalize(direction), head = Math.min(length * 0.4, thickness * 4.5), shaft = length - head, rot = basis(d);
      draw('cylinder', { at: along(from, d, shaft / 2), scale: [thickness, thickness, shaft], rot: rot, color: color, flat: true });
      draw('cone', { at: along(from, d, shaft), scale: [thickness * 2.8, thickness * 2.8, head], rot: rot, color: color, flat: true });
      return along(from, d, length);
    }
    function eyePosition() {
      var ce = Math.cos(camera.elevation);
      return along(camera.target, [ce * Math.cos(camera.azimuth), ce * Math.sin(camera.azimuth), Math.sin(camera.elevation)], camera.distance);
    }
    function setCamera(view, projection) {
      gl.uniformMatrix4fv(loc.uVP, false, multiply(projection, view));
      gl.uniformMatrix3fv(loc.uViewRot, false, [view[0], view[1], view[2], view[4], view[5], view[6], view[8], view[9], view[10]]);
      return multiply(projection, view);
    }
    function place(name, text, point, vp, box) {
      // Put an HTML label at the screen position of a 3D point.
      var w = vp[3] * point[0] + vp[7] * point[1] + vp[11] * point[2] + vp[15];
      var label = labels[name];
      if (!label) { label = labels[name] = document.createElement('span'); label.className = 'view-label view-label-' + name; overlay.append(label); }
      if (w <= 0) { label.hidden = true; return; }
      var x = (vp[0] * point[0] + vp[4] * point[1] + vp[8] * point[2] + vp[12]) / w;
      var y = (vp[1] * point[0] + vp[5] * point[1] + vp[9] * point[2] + vp[13]) / w;
      label.hidden = false; label.textContent = text;
      label.style.left = (box.x + (x + 1) / 2 * box.w) + 'px';
      label.style.top = (box.y + (1 - y) / 2 * box.h) + 'px';
    }
    function hideLabels() { Object.keys(labels).forEach(function (name) { labels[name].hidden = true; }); }

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
      hideLabels();

      var near = camera.distance * 0.02, far = camera.distance + scene.radius * 60;
      var vp = setCamera(lookAt(eyePosition(), camera.target), perspective(FOV, width / height, near, far));
      scene.parts.forEach(function (part) { draw(part.mesh, { at: part.at || [0, 0, 0], scale: part.size, color: part.color, fade: part.fade }); });

      var light = scene.light;
      if (light) {
        // Schematic incident wave: dots follow E(s, t) = E0 sin(2 pi s / wavelength - omega t).
        var R = scene.radius, k = normalize(light.k), e = normalize(light.e);
        var reach = Math.min(Math.max(3 * R, 1.5 * light.wavelength), 12 * R), amplitude = 0.45 * R, size = 0.11 * R;
        var count = Math.min(170, Math.round(2 * reach / (size * 1.25)));
        for (var i = 0; i < count; i++) {
          var s = -reach + 2 * reach * i / (count - 1);
          var field = amplitude * Math.sin(2 * Math.PI * s / light.wavelength - clock);
          draw('dot', { at: along(along([0, 0, 0], k, s), e, field), scale: [size, size, size], color: AMBER, flat: true });
        }
        // Arrows sit just in front of the object so they are visible in the starting view.
        var start = along([0, 0, 0], k, -Math.min(reach, 2.3 * R)), thickness = 0.045 * R;
        var tipK = arrow(along(start, e, -amplitude - 0.5 * R), k, 1.3 * R, thickness, AMBER);
        var tipE = arrow(along(start, e, amplitude + 0.2 * R), e, 0.9 * R, thickness, LAVENDER);
        var full = { x: 0, y: 0, w: width, h: height };
        place('k', 'k', tipK, vp, full);
        place('e', 'E', tipE, vp, full);
      }

      // Orientation axes in the bottom-left corner.
      var corner = Math.round(Math.min(96, width * 0.24)), px = Math.round(corner * ratio);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, px, px); gl.viewport(0, 0, px, px);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      var ce = Math.cos(camera.elevation), direction = [ce * Math.cos(camera.azimuth), ce * Math.sin(camera.azimuth), Math.sin(camera.elevation)];
      var vpAxes = setCamera(lookAt(along([0, 0, 0], direction, 5.2), [0, 0, 0]), perspective(FOV, 1, 0.5, 20));
      var cornerBox = { x: 0, y: height - corner, w: corner, h: corner };
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (axis, index) {
        arrow([0, 0, 0], axis, 0.95, 0.07, AXIS_COLORS[index]);
        place('axis' + index, 'xyz'[index], along([0, 0, 0], axis, 1.22), vpAxes, cornerBox);
      });
      gl.disable(gl.SCISSOR_TEST);

      if (motion && visible && scene.light) schedule();
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(tick); }
    function tick(time) {
      if (motion && scene.light) { clock += Math.min(0.1, (time - (last || time)) / 1000) * 2.4; }
      last = time; render();
    }
    function invalidate() { dirty = true; last = 0; schedule(); }

    function clampCamera() {
      camera.elevation = Math.max(-1.5, Math.min(1.5, camera.elevation));
      camera.distance = Math.max(camera.fit * 0.12, Math.min(camera.fit * 14, camera.distance));
    }
    function fit() {
      camera.fit = scene.radius / Math.sin(FOV / 2) * FIT_MARGIN;
      camera.distance = camera.fit; camera.target = [0, 0, 0]; camera.azimuth = -0.9; camera.elevation = 0.42;
    }
    function pan(dx, dy) {
      // Move the target in the plane of the screen.
      var ce = Math.cos(camera.elevation), forward = [-ce * Math.cos(camera.azimuth), -ce * Math.sin(camera.azimuth), -Math.sin(camera.elevation)];
      var right = normalize(cross(forward, [0, 0, 1])), up = cross(right, forward);
      var scale = 2 * camera.distance * Math.tan(FOV / 2) / canvas.clientHeight;
      camera.target = along(along(camera.target, right, -dx * scale), up, dy * scale);
    }

    // ---- Pointer input: works for mouse, pen and touch. ----
    var pointers = new Map(), gesture = null;
    canvas.addEventListener('pointerdown', function (event) {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      gesture = null;
      if (event.pointerType === 'mouse') canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener('pointermove', function (event) {
      var previous = pointers.get(event.pointerId); if (!previous) return;
      var current = { x: event.clientX, y: event.clientY };
      if (pointers.size === 1) {
        var dx = current.x - previous.x, dy = current.y - previous.y;
        if (event.shiftKey || event.buttons === 2 || event.buttons === 4) pan(dx, dy);
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
    function release(event) { pointers.delete(event.pointerId); gesture = null; }
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    canvas.addEventListener('dblclick', function () { fit(); invalidate(); });
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
      else if (event.key === '0' || event.key === 'Home') fit();
      else handled = false;
      if (handled) { event.preventDefault(); clampCamera(); invalidate(); }
    });

    if ('ResizeObserver' in window) new ResizeObserver(invalidate).observe(canvas);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; if (visible) invalidate(); }).observe(canvas);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) invalidate(); });
    canvas.addEventListener('webglcontextlost', function (event) { event.preventDefault(); });

    return {
      /* scene = { parts: [{mesh, size: [x, y, z] in nm, color: '#rrggbb', fade}], radius: nm,
       *           light: null or { k: [..], e: [..], wavelength: nm in the medium } } */
      setScene: function (next, refit) {
        scene = { parts: next.parts.map(function (part) { return { mesh: part.mesh, size: part.size, at: part.at, color: hex(part.color), fade: part.fade }; }), light: next.light || null, radius: next.radius };
        if (refit) fit();
        else {
          // Keep the viewing angle and relative zoom when only the size changes.
          var newFit = scene.radius / Math.sin(FOV / 2) * FIT_MARGIN, ratio = newFit / camera.fit;
          camera.fit = newFit; camera.distance *= ratio;
          camera.target = camera.target.map(function (value) { return value * ratio; });
        }
        invalidate();
      },
      reset: function () { fit(); invalidate(); },
      zoom: function (factor) { camera.distance *= factor; clampCamera(); invalidate(); },
      setMotion: function (on) { motion = !!on; invalidate(); },
      camera: function () { return { azimuth: camera.azimuth, elevation: camera.elevation, distance: camera.distance, fit: camera.fit, target: camera.target.slice() }; }
    };
  }

  root.ElyvrisView3D = Object.freeze({ create: create });
}(typeof globalThis !== 'undefined' ? globalThis : window));
