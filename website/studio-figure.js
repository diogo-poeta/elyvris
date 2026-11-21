/* Figure export: 3D view on paper, on the dark stage or transparent, plus scale bar, legend
   and (optionally) shape names and sizes. PNG at 300 dpi. */
(function (root) {
  'use strict';

  var FONT = 'Arial, Helvetica, sans-serif', INK = '#1a1a1a';
  var DPI = 300;

  /* Largest "nice" length (1, 2 or 5 times a power of ten) not above `limit`. */
  function niceLength(limit) {
    var power = Math.pow(10, Math.floor(Math.log10(limit))), f = limit / power;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * power;
  }
  function lengthLabel(nm) {
    return nm >= 1000 ? Number((nm / 1000).toPrecision(3)) + ' µm' : Number(nm.toPrecision(3)) + ' nm';
  }

  /* The page's stage background (studio-viewport.css): radial-gradient(ellipse at 54% 44%, ...), farthest-corner. */
  var STAGE = [[0, '#2c3043'], [0.51, '#1b2030'], [1, '#121623']], STAGE_EDGE = '#121623';
  function paintStage(ctx, W, H) {
    var cx = 0.54 * W, cy = 0.44 * H, sx = Math.max(cx, W - cx), sy = Math.max(cy, H - cy);
    var rx = Math.SQRT2 * sx, ry = Math.SQRT2 * sy;            // the farthest corner is at (sx, sy) from the centre
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    var gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    STAGE.forEach(function (stop) { gradient.addColorStop(stop[0], stop[1]); });
    ctx.fillStyle = gradient; ctx.fillRect(-cx, -cy * rx / ry, W, H * rx / ry);
    ctx.restore();
  }

  var THEMES = {
    paper: { ink: INK, box: 'rgba(255,255,255,0.92)', boxLine: '#6b6b6b', fill: '#ffffff' },
    screen: { ink: '#e8eaf2', box: 'rgba(18,22,35,0.86)', boxLine: '#8a8fa6', fill: STAGE_EDGE },
    none: { ink: INK, box: 'rgba(255,255,255,0.92)', boxLine: '#6b6b6b', fill: null }
  };

  function overlap(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  /* Name and size labels. marks = [{ title, detail, anchors: [[x, y, z], ...], corners: [[8 corners of copy 1], ...] }] in nm.
   * Each label tries 24 places around its shape and takes the cheapest:
   * outside the picture > over another label > over the corner axes > over another shape > far away. */
  function drawMarks(ctx, shot, marks, theme, text, W, H) {
    var pad = Math.round(text * 0.45), lineGap = Math.round(text * 0.3), margin = Math.round(text * 0.6);
    // Screen rectangles of each mark's copies; a large base (a substrate) is left out, so labels may sit on it.
    var rects = marks.map(function (mark) {
      return (mark.corners || []).map(function (copy) {
        var pts = copy.map(shot.project).filter(Boolean);
        if (!pts.length) return null;
        var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
        var box = { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys) };
        box.w = Math.max.apply(null, xs) - box.x; box.h = Math.max.apply(null, ys) - box.y;
        return box.w * box.h < 0.5 * W * H ? box : null;
      }).filter(Boolean);
    });
    var outlines = rects.map(function (list) { return list[0] || null; });
    var corner = Math.min(92 * shot.ratio, W * 0.22) * 1.1, axes = { x: 0, y: H - corner, w: corner, h: corner }, placed = [];
    var inside = function (p, box) { return box && p[0] >= box.x && p[0] <= box.x + box.w && p[1] >= box.y && p[1] <= box.y + box.h; };
    marks.forEach(function (mark, index) {
      // The first anchor point in the picture away from smaller shapes (those that sit on this one), else the first.
      var mine = outlines[index] ? outlines[index].w * outlines[index].h : Infinity, near = text * 0.8;
      var points = (mark.anchors || [mark.anchor]).map(shot.project).filter(function (p) { return p && p[0] >= 0 && p[0] <= W && p[1] >= 0 && p[1] <= H; });
      var at = points.filter(function (p) {
        return !rects.some(function (list, j) {
          return j !== index && list.some(function (box) { return box.w * box.h < mine && inside(p, { x: box.x - near, y: box.y - near, w: box.w + 2 * near, h: box.h + 2 * near }); });
        });
      })[0] || points[0];
      if (!at) return;
      ctx.font = '600 ' + text + 'px ' + FONT;
      var width = ctx.measureText(mark.title).width;
      ctx.font = text + 'px ' + FONT;
      if (mark.detail) width = Math.max(width, ctx.measureText(mark.detail).width);
      var bw = Math.ceil(width + 2 * pad), bh = Math.ceil(text * (mark.detail ? 2 : 1) + (mark.detail ? lineGap : 0) + 2 * pad), best = null;
      [2.2, 4, 6.5].forEach(function (step) {
        [[1, -1], [-1, -1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]].forEach(function (dir) {
          var cx = at[0] + dir[0] * step * text * 0.8, cy = at[1] + dir[1] * step * text * 0.6;
          var box = { x: dir[0] > 0 ? cx : dir[0] < 0 ? cx - bw : cx - bw / 2, y: dir[1] > 0 ? cy : dir[1] < 0 ? cy - bh : cy - bh / 2, w: bw, h: bh };
          var cost = step * text;
          if (box.x < margin || box.y < margin || box.x + bw > W - margin || box.y + bh > H - margin) cost += 1e9;
          placed.forEach(function (other) { cost += 50 * overlap(box, { x: other.x - pad, y: other.y - pad, w: other.w + 2 * pad, h: other.h + 2 * pad }); });
          rects.forEach(function (list, j) { list.forEach(function (shape) { cost += (j === index ? 0.5 : 2) * overlap(box, shape); }); });
          cost += 20 * overlap(box, axes);
          if (!best || cost < best.cost) best = { box: box, cost: cost };
        });
      });
      var b = best.box; placed.push(b);
      var ex = Math.max(b.x, Math.min(at[0], b.x + b.w)), ey = Math.max(b.y, Math.min(at[1], b.y + b.h));
      ctx.strokeStyle = theme.ink; ctx.lineWidth = Math.max(1, Math.round(text * 0.08));
      ctx.beginPath(); ctx.moveTo(at[0], at[1]); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = theme.ink; ctx.beginPath(); ctx.arc(at[0], at[1], Math.max(2, text * 0.18), 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, Math.round(text * 0.3)); else ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = theme.box; ctx.fill();
      ctx.strokeStyle = theme.boxLine; ctx.lineWidth = Math.max(1, Math.round(text * 0.06)); ctx.stroke();
      ctx.fillStyle = theme.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '600 ' + text + 'px ' + FONT; ctx.fillText(mark.title, b.x + pad, b.y + pad + text / 2);
      if (mark.detail) { ctx.font = text + 'px ' + FONT; ctx.fillText(mark.detail, b.x + pad, b.y + pad + text * 1.5 + lineGap); }
    });
  }

  /* shot: from the viewer's snapshot(); materials: [{ label, color }]; options.marks: see drawMarks. */
  function compose(shot, materials, options) {
    options = options || {};
    var theme = THEMES[shot.background] || THEMES.paper;
    var W = shot.canvas.width, H = shot.canvas.height;
    var text = Math.max(11, Math.round(W * 0.017)), pad = Math.round(text * 1.2), row = Math.round(text * 1.9);
    var gap = Math.round(text * 0.45), between = Math.round(text * 1.6);
    var measure = document.createElement('canvas').getContext('2d');
    measure.font = text + 'px ' + FONT;

    // The strip is a row of cells: the scale bar first, then one cell per material.
    var cells = [];
    if (shot.nmPerPixel > 0) {
      var length = niceLength(0.25 * W * shot.nmPerPixel), label = lengthLabel(length);
      cells.push({ bar: length / shot.nmPerPixel, label: label, width: length / shot.nmPerPixel + gap + measure.measureText(label).width });
    }
    materials.forEach(function (material) {
      cells.push({ color: material.color, label: material.label, width: text + gap + measure.measureText(material.label).width });
    });
    // Place the cells left to right; start a new line when one does not fit.
    var x = pad, line = 0;
    cells.forEach(function (cell) {
      if (x > pad && x + cell.width > W - pad) { x = pad; line++; }
      cell.x = x; cell.line = line; x += cell.width + between;
    });
    var strip = cells.length ? Math.round(pad * 0.6) + (line + 1) * row + Math.round(pad * 0.6) : 0;

    var out = document.createElement('canvas'); out.width = W; out.height = H + strip;
    var ctx = out.getContext('2d');
    if (theme.fill) { ctx.fillStyle = theme.fill; ctx.fillRect(0, 0, out.width, out.height); }
    if (shot.background === 'screen') paintStage(ctx, W, H);
    ctx.drawImage(shot.canvas, 0, 0);

    // x, y, z letters of the corner axes.
    ctx.fillStyle = theme.ink; ctx.font = '600 ' + text + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    shot.labels.forEach(function (item) { ctx.fillText(item.text, item.x, item.y); });

    if (options.marks && options.marks.length && shot.project) drawMarks(ctx, shot, options.marks, theme, text, W, H);

    ctx.font = text + 'px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    cells.forEach(function (cell) {
      var middle = H + Math.round(pad * 0.6) + cell.line * row + row / 2, textX;
      if (cell.bar) {
        var thick = Math.max(2, Math.round(text * 0.2));
        ctx.fillStyle = theme.ink; ctx.fillRect(cell.x, Math.round(middle - thick / 2), cell.bar, thick);
        textX = cell.x + cell.bar + gap;
      } else {
        ctx.fillStyle = cell.color; ctx.fillRect(cell.x, Math.round(middle - text / 2), text, text);
        ctx.strokeStyle = theme.ink; ctx.lineWidth = Math.max(1, Math.round(text * 0.06));
        ctx.strokeRect(cell.x, Math.round(middle - text / 2), text, text);
        textX = cell.x + text + gap;
      }
      ctx.fillStyle = theme.ink; ctx.fillText(cell.label, textX, middle);
    });
    return out;
  }

  var crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function withPrintSize(png, dpi) {
    var hasChunk = false;
    for (var i = 33; i + 8 <= png.length;) {                    // walk the chunks: 4 bytes length, 4 bytes name
      var size = (png[i] << 24 | png[i + 1] << 16 | png[i + 2] << 8 | png[i + 3]) >>> 0;
      var name = String.fromCharCode(png[i + 4], png[i + 5], png[i + 6], png[i + 7]);
      if (name === 'pHYs') hasChunk = true;
      if (name === 'IDAT' || name === 'pHYs') break;
      i += 12 + size;
    }
    if (hasChunk || png.length < 33) return png;
    var perMetre = Math.round(dpi / 0.0254);                    // 300 dpi = 11811 pixels per metre
    var chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
    view.setUint32(0, 9);                                       // 9 bytes of data
    chunk.set([112, 72, 89, 115], 4);                           // "pHYs"
    view.setUint32(8, perMetre); view.setUint32(12, perMetre); chunk[16] = 1;   // 1 = the unit is the metre
    view.setUint32(17, crc32(chunk.subarray(4, 17)));
    var out = new Uint8Array(png.length + 21);
    out.set(png.subarray(0, 33)); out.set(chunk, 33); out.set(png.subarray(33), 54);
    return out;
  }

  /* PNG file of a canvas, as a Blob, with the 300 dpi print size written in. */
  function toPng(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('The browser could not make the PNG.')); return; }
        blob.arrayBuffer().then(function (buffer) {
          resolve(new Blob([withPrintSize(new Uint8Array(buffer), DPI)], { type: 'image/png' }));
        }, reject);
      }, 'image/png');
    });
  }

  function save(canvas, filename) {
    return toPng(canvas).then(function (blob) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  root.ElyvrisFigure = Object.freeze({ compose: compose, toPng: toPng, save: save, niceLength: niceLength, lengthLabel: lengthLabel });
}(typeof globalThis !== 'undefined' ? globalThis : window));
