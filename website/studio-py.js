/* Reader for Meep geometry scripts: a safe subset of Python, no eval.
 * ElyvrisPy.readMeep(text) -> { objects, diagnostics, notes, setup }. Lengths in the script's unit. */
(function (root) {
  'use strict';

  var MAX_STEPS = 300000, MAX_OBJECTS = 5000;
  var KEYWORDS = ['import', 'from', 'as', 'for', 'in', 'if', 'elif', 'else', 'def', 'return', 'pass', 'break', 'continue',
    'and', 'or', 'not', 'is', 'True', 'False', 'None', 'while', 'class', 'with', 'try', 'except', 'finally', 'lambda',
    'assert', 'del', 'global', 'nonlocal', 'raise', 'yield', 'async', 'await'];

  function PyError(message, line) { this.message = message; this.line = line; }

  function tokenize(src) {
    var tokens = [], indents = [0], depth = 0, i = 0, line = 1, atStart = true, n = src.length;
    function push(t, v) { tokens.push({ t: t, v: v, line: line, pos: i }); }
    while (i < n) {
      if (atStart && depth === 0) {
        var col = 0, j = i;
        while (j < n && (src[j] === ' ' || src[j] === '\t')) { col += src[j] === '\t' ? 8 - (col % 8) : 1; j++; }
        if (j >= n) break;
        if (src[j] === '\n' || src[j] === '\r' || src[j] === '#') {          // blank line or comment line
          while (j < n && src[j] !== '\n') j++;
          i = j + 1; line++; continue;
        }
        i = j; atStart = false;
        if (col > indents[indents.length - 1]) { indents.push(col); push('indent'); }
        else while (col < indents[indents.length - 1]) { indents.pop(); push('dedent'); }
      }
      var ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
      if (ch === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      if (ch === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) { i += src[i + 1] === '\r' ? 3 : 2; line++; continue; }
      if (ch === '\n') {
        if (depth === 0) { if (tokens.length && tokens[tokens.length - 1].t !== 'nl') push('nl'); atStart = true; }
        i++; line++; continue;
      }
      var rest = src.slice(i, i + 80), m;
      if ((m = /^(?:\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)/.exec(rest))) {
        if (/[jJ]/.test(src[i + m[0].length] || '')) throw new PyError('complex numbers are not read', line);
        push('num', Number(m[0].replace(/_/g, ''))); i += m[0].length; tokens[tokens.length - 1].end = i; continue;
      }
      if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
        var word = m[0], next = src[i + word.length];
        if (/^[rRbBfFuU]{1,2}$/.test(word) && (next === '"' || next === "'")) { i += word.length; ch = next; }
        else { push(KEYWORDS.indexOf(word) >= 0 ? 'kw' : 'name', word); i += word.length; continue; }
      }
      if (ch === '"' || ch === "'") {
        var triple = src.substr(i, 3) === ch + ch + ch, close = triple ? ch + ch + ch : ch, k = i + close.length, text = '', startLine = line;
        while (k < n && src.substr(k, close.length) !== close) {
          if (src[k] === '\\') { text += src[k + 1] || ''; k += 2; continue; }
          if (src[k] === '\n') { if (!triple) throw new PyError('a text string is not closed', startLine); line++; }
          text += src[k]; k++;
        }
        if (k >= n) throw new PyError('a text string is not closed', startLine);
        tokens.push({ t: 'str', v: text, line: startLine }); i = k + close.length; continue;
      }
      var three = src.substr(i, 3), two = src.substr(i, 2);
      if (['**=', '//=', '...'].indexOf(three) >= 0) { push('op', three); i += 3; continue; }
      if (['**', '//', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '->', '<<', '>>', ':='].indexOf(two) >= 0) { push('op', two); i += 2; continue; }
      if ('+-*/%()[]{},:.=<>@;&|^~'.indexOf(ch) >= 0) {
        if ('([{'.indexOf(ch) >= 0) depth++; else if (')]}'.indexOf(ch) >= 0) depth = Math.max(0, depth - 1);
        push('op', ch); i++; continue;
      }
      throw new PyError('the character ' + ch + ' is not read', line);
    }
    if (tokens.length && tokens[tokens.length - 1].t !== 'nl') push('nl');
    while (indents.length > 1) { indents.pop(); push('dedent'); }
    push('eof');
    return tokens;
  }

  /* ---------------------------------------------------------------- *
   * 2. Tokens -> statements (a tree). Statements that cannot be read
   *    are kept as { k: 'bad' } so that they are reported, never lost.
   * ---------------------------------------------------------------- */
  function parse(tokens) {
    var p = 0;
    function peek() { return tokens[p]; }
    function isOp(v) { var t = tokens[p]; return t.t === 'op' && t.v === v; }
    function isKw(v) { var t = tokens[p]; return t.t === 'kw' && t.v === v; }
    function fail(message, tok) { throw new PyError(message, (tok || tokens[p]).line); }
    function eatOp(v) { if (!isOp(v)) fail('expected ' + v); return tokens[p++]; }
    function eatKw(v) { if (!isKw(v)) fail('expected ' + v); return tokens[p++]; }
    function eatName() { if (tokens[p].t !== 'name') fail('expected a name'); return tokens[p++].v; }

    /* Skip the rest of a statement, and its indented block if it has one. */
    function skipStatement() {
      while (tokens[p].t !== 'nl' && tokens[p].t !== 'eof') p++;
      if (tokens[p].t === 'nl') p++;
      if (tokens[p].t === 'indent') {
        var level = 0;
        do { if (tokens[p].t === 'indent') level++; else if (tokens[p].t === 'dedent') level--; p++; } while (level > 0 && tokens[p].t !== 'eof');
      }
    }
    function block() {
      eatOp(':');
      if (tokens[p].t !== 'nl') { var one = [simple()]; return one; }        // "if x: y" on one line
      p++;
      if (tokens[p].t !== 'indent') fail('expected an indented block');
      p++;
      var body = [];
      while (tokens[p].t !== 'dedent' && tokens[p].t !== 'eof') body.push(statement());
      if (tokens[p].t === 'dedent') p++;
      return body;
    }
    function statement() {
      var start = p, tok = tokens[p];
      try {
        if (tok.t === 'kw') {
          if (tok.v === 'for') {
            p++; var target = targetList(); eatKw('in'); var iter = exprList(); var body = block();
            if (isKw('else')) fail('for ... else is not read');
            return { k: 'for', target: target, iter: iter, body: body, line: tok.line };
          }
          if (tok.v === 'if') {
            p++; var branches = [{ test: expr(), body: block() }], orelse = null;
            while (isKw('elif')) { p++; branches.push({ test: expr(), body: block() }); }
            if (isKw('else')) { p++; orelse = block(); }
            return { k: 'if', branches: branches, orelse: orelse, line: tok.line };
          }
          if (tok.v === 'def') {
            p++; var name = eatName(), params = []; eatOp('(');
            while (!isOp(')')) {
              if (isOp('*') || isOp('**')) fail('*args in a function is not read');
              var param = { name: eatName(), fallback: null };
              if (isOp(':')) { p++; expr(); }
              if (isOp('=')) { p++; param.fallback = expr(); }
              params.push(param); if (!isOp(')')) eatOp(',');
            }
            p++; if (isOp('->')) { p++; expr(); }
            return { k: 'def', name: name, params: params, body: block(), line: tok.line };
          }
          if (['while', 'class', 'with', 'try', 'assert', 'del', 'global', 'nonlocal', 'raise', 'async', 'yield', 'await'].indexOf(tok.v) >= 0) fail('"' + tok.v + '" is not read by the Studio');
        }
        if (isOp('@')) fail('decorators are not read');
        var node = simple();
        return node;
      } catch (error) {
        if (!(error instanceof PyError)) throw error;
        p = start; skipStatement();
        return { k: 'bad', line: tok.line, message: error.message, errorLine: error.line };
      }
    }
    /* A statement on one line (several may be joined with ";"). */
    function simple() {
      var tok = tokens[p], node;
      if (tok.t === 'kw' && (tok.v === 'import' || tok.v === 'from')) node = importStatement();
      else if (isKw('pass')) { p++; node = { k: 'pass', line: tok.line }; }
      else if (isKw('break') || isKw('continue')) { p++; node = { k: tok.v, line: tok.line }; }
      else if (isKw('return')) { p++; node = { k: 'return', value: tokens[p].t === 'nl' ? null : exprList(), line: tok.line }; }
      else {
        var left = exprList();
        if (isOp('=')) {
          var targets = [left];
          p++; var value = exprList();
          while (isOp('=')) { p++; targets.push(value); value = exprList(); }
          node = { k: 'assign', targets: targets, value: value, line: tok.line };
        } else if (tokens[p].t === 'op' && ['+=', '-=', '*=', '/=', '//=', '**=', '%='].indexOf(tokens[p].v) >= 0) {
          var op = tokens[p++].v.slice(0, -1);
          node = { k: 'aug', target: left, op: op, value: exprList(), line: tok.line };
        } else if (isOp(':')) fail('type annotations are not read');
        else node = { k: 'expr', value: left, line: tok.line };
      }
      if (isOp(';')) { p++; if (tokens[p].t !== 'nl') return { k: 'seq', body: [node, simple()], line: tok.line }; }
      if (tokens[p].t === 'nl') p++; else if (tokens[p].t !== 'eof' && tokens[p].t !== 'dedent') fail('this line could not be read to its end');
      return node;
    }
    function dotted() { var name = eatName(); while (isOp('.')) { p++; name += '.' + eatName(); } return name; }
    function importStatement() {
      var tok = tokens[p++], names = [];
      if (tok.v === 'import') {
        do { if (names.length) p++; var mod = dotted(), alias = null; if (isKw('as')) { p++; alias = eatName(); } names.push({ module: mod, as: alias }); } while (isOp(','));
        return { k: 'import', names: names, line: tok.line };
      }
      var from = dotted(); eatKw('import');
      var bracket = isOp('('); if (bracket) p++;
      if (isOp('*')) { p++; names = '*'; }
      else do { if (names.length) p++; if (bracket && isOp(')')) break; var item = eatName(), as = null; if (isKw('as')) { p++; as = eatName(); } names.push({ name: item, as: as }); } while (isOp(','));
      if (bracket) eatOp(')');
      return { k: 'from', module: from, names: names, line: tok.line };
    }
    function targetList() {
      var first = postfix(), items = [first];
      while (isOp(',')) { p++; if (isKw('in')) break; items.push(postfix()); }
      return items.length > 1 ? { k: 'tuple', items: items, line: first.line } : first;
    }
    function exprList() {
      var first = expr();
      if (!isOp(',')) return first;
      var items = [first];
      while (isOp(',')) { p++; if (tokens[p].t === 'nl' || isOp('=') || isOp(')') || isOp(']')) break; items.push(expr()); }
      return { k: 'tuple', items: items, line: first.line };
    }
    function expr() {
      if (isKw('lambda')) fail('lambda is not read');
      var value = orTest();
      if (isKw('if')) { var tok = tokens[p++]; var test = orTest(); eatKw('else'); return { k: 'cond', test: test, yes: value, no: expr(), line: tok.line }; }
      return value;
    }
    function orTest() { var left = andTest(); while (isKw('or')) { var t = tokens[p++]; left = { k: 'bool', op: 'or', left: left, right: andTest(), line: t.line }; } return left; }
    function andTest() { var left = notTest(); while (isKw('and')) { var t = tokens[p++]; left = { k: 'bool', op: 'and', left: left, right: notTest(), line: t.line }; } return left; }
    function notTest() { if (isKw('not')) { var t = tokens[p++]; return { k: 'not', value: notTest(), line: t.line }; } return comparison(); }
    function comparison() {
      var left = arith(), ops = [], rights = [], line = tokens[p].line;
      for (;;) {
        var t = tokens[p], op = null;
        if (t.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].indexOf(t.v) >= 0) { op = t.v; p++; }
        else if (isKw('in')) { op = 'in'; p++; }
        else if (isKw('not') && tokens[p + 1].t === 'kw' && tokens[p + 1].v === 'in') { op = 'not in'; p += 2; }
        else if (isKw('is')) { p++; op = 'is'; if (isKw('not')) { p++; op = 'is not'; } }
        else break;
        ops.push(op); rights.push(arith());
      }
      return ops.length ? { k: 'compare', left: left, ops: ops, rights: rights, line: line } : left;
    }
    function arith() { var left = term(); while (isOp('+') || isOp('-')) { var t = tokens[p++]; left = { k: 'bin', op: t.v, left: left, right: term(), line: t.line }; } return left; }
    function term() { var left = unary(); while (isOp('*') || isOp('/') || isOp('//') || isOp('%')) { var t = tokens[p++]; left = { k: 'bin', op: t.v, left: left, right: unary(), line: t.line }; } return left; }
    function unary() { if (isOp('-') || isOp('+')) { var t = tokens[p++]; return { k: 'unary', op: t.v, value: unary(), line: t.line, pos: t.pos }; } return power(); }
    function power() { var base = postfix(); if (isOp('**')) { var t = tokens[p++]; return { k: 'bin', op: '**', left: base, right: unary(), line: t.line }; } return base; }
    function comprehension(element, closer) {
      var loops = [];
      while (isKw('for')) { p++; var target = targetList(); eatKw('in'); var iter = orTest(), tests = []; while (isKw('if')) { p++; tests.push(orTest()); } loops.push({ target: target, iter: iter, tests: tests }); }
      var end = eatOp(closer);
      return { k: 'comp', element: element, loops: loops, line: element.line, endLine: end.line };
    }
    function postfix() {
      var start = tokens[p].pos, node = atom();
      for (;;) {
        if (isOp('.')) { p++; node = { k: 'attr', value: node, name: eatName(), line: node.line }; }
        else if (isOp('(')) {
          p++; var args = [], named = [], endLine = null;
          while (!isOp(')')) {
            if (isOp('*') || isOp('**')) fail('*args in a call is not read');
            if (tokens[p].t === 'name' && tokens[p + 1].t === 'op' && tokens[p + 1].v === '=') { var key = tokens[p].v; p += 2; named.push({ name: key, value: expr() }); }
            else {
              var value = expr();
              if (isKw('for')) { var gen = comprehension(value, ')'); args.push(gen); endLine = gen.endLine; break; }   // f(x for x in xs)
              args.push(value);
            }
            if (!isOp(')')) eatOp(',');
          }
          if (endLine === null) endLine = tokens[p++].line;
          // pos/end: where the whole call is in the text, from its name to its ")".
          node = { k: 'call', fn: node, args: args, named: named, line: node.line, endLine: endLine, pos: start, end: tokens[p - 1].pos + 1 };
        }
        else if (isOp('[')) {
          p++; var index;
          if (isOp(':') || (function () { var save = p, found = false; try { expr(); found = isOp(':'); } catch (e) { found = false; } p = save; return found; }())) {
            var lo = isOp(':') ? null : expr(); eatOp(':'); var hi = isOp(']') || isOp(':') ? null : expr(), step = null;
            if (isOp(':')) { p++; step = isOp(']') ? null : expr(); }
            index = { k: 'slice', lo: lo, hi: hi, step: step };
          } else index = exprList();
          eatOp(']'); node = { k: 'index', value: node, index: index, line: node.line };
        }
        else break;
      }
      return node;
    }
    function atom() {
      var tok = tokens[p];
      if (tok.t === 'num') { p++; return { k: 'num', v: tok.v, line: tok.line, pos: tok.pos, end: tok.end }; }
      if (tok.t === 'str') { var text = ''; while (tokens[p].t === 'str') text += tokens[p++].v; return { k: 'str', v: text, line: tok.line }; }
      if (tok.t === 'name') { p++; return { k: 'name', v: tok.v, line: tok.line }; }
      if (tok.t === 'kw' && (tok.v === 'True' || tok.v === 'False' || tok.v === 'None')) { p++; return { k: 'const', v: tok.v === 'None' ? null : tok.v === 'True', line: tok.line }; }
      if (isOp('(')) {
        p++;
        if (isOp(')')) { p++; return { k: 'tuple', items: [], line: tok.line }; }
        var inner = expr();
        if (isKw('for')) return comprehension(inner, ')');
        if (isOp(',')) { var items = [inner]; while (isOp(',')) { p++; if (isOp(')')) break; items.push(expr()); } inner = { k: 'tuple', items: items, line: tok.line }; }
        eatOp(')'); return inner;
      }
      if (isOp('[')) {
        p++; var list = [];
        if (isOp(']')) { p++; return { k: 'list', items: list, line: tok.line }; }
        var first = expr();
        if (isKw('for')) return comprehension(first, ']');
        list.push(first);
        while (isOp(',')) { p++; if (isOp(']')) break; list.push(expr()); }
        eatOp(']'); return { k: 'list', items: list, line: tok.line };
      }
      if (isOp('{')) fail('dictionaries and sets are not read');
      fail(tok.t === 'nl' || tok.t === 'eof' ? 'the line ends too early' : 'unexpected "' + (tok.v === undefined ? tok.t : tok.v) + '"');
    }

    var program = [];
    while (tokens[p].t !== 'eof') {
      if (tokens[p].t === 'nl' || tokens[p].t === 'dedent' || tokens[p].t === 'indent') { p++; continue; }
      program.push(statement());
    }
    return program;
  }

  function Vec(x, y, z) { this.x = x; this.y = y; this.z = z; }
  function Nd(a) { this.a = a; }                       // a numpy array of numbers (1D)
  function Medium(n, name, air) { this.n = n; this.name = name || null; this.air = !!air; this.span = null; this.code = null; this.library = null; }
  function Geo(kind, args, named, node, local) { this.kind = kind; this.args = args; this.named = named; this.node = node; this.local = local; this.line = node.line; this.endLine = node.endLine === undefined ? node.line : node.endLine; }
  function Opaque(what) { this.what = what; }
  function Layer(kind, a, kw, node) { this.kind = kind; this.a = a; this.kw = kw; this.line = node.line; }
  function Sim(kw, node) { this.kw = kw; this.node = node; this.line = node.line; this.monitors = []; }
  function Src(kind, a, kw, node) { this.kind = kind; this.a = a; this.kw = kw; this.line = node.line; }
  function Region(kind, a, kw, node) { this.kind = kind; this.a = a; this.kw = kw; this.line = node.line; }
  function Module(name) { this.name = name; }
  function Func(node, scope) { this.node = node; this.scope = scope; }
  function Signal(kind, value) { this.kind = kind; this.value = value; }

  function isNum(v) { return typeof v === 'number' || typeof v === 'boolean'; }
  function typeName(v) {
    if (v === null || v === undefined) return 'None';
    if (isNum(v)) return 'a number'; if (typeof v === 'string') return 'text'; if (Array.isArray(v)) return 'a list';
    if (v instanceof Vec) return 'a Vector3'; if (v instanceof Nd) return 'an array'; if (v instanceof Medium) return 'a material';
    if (v instanceof Geo) return 'a geometry object'; if (v instanceof Opaque) return v.what;
    if (v instanceof Sim) return 'a Simulation'; if (v instanceof Src) return 'a source'; if (v instanceof Region) return 'a monitor region'; return 'this value';
  }
  function truthy(v) {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0; if (v instanceof Nd) return v.a.length > 0;
    return !!v;
  }

  var GEO = ['Sphere', 'Cylinder', 'Block', 'Cone', 'Ellipsoid', 'Prism', 'Wedge'];
  var MATH = {
    sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, floor: Math.floor, ceil: Math.ceil,
    arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    log: Math.log, log10: Math.log10, fabs: Math.abs, absolute: Math.abs, abs: Math.abs,
    radians: function (d) { return d * Math.PI / 180; }, deg2rad: function (d) { return d * Math.PI / 180; },
    degrees: function (r) { return r * 180 / Math.PI; }, rad2deg: function (r) { return r * 180 / Math.PI; },
    square: function (x) { return x * x; }
  };
  var MATH2 = { arctan2: Math.atan2, atan2: Math.atan2, hypot: Math.hypot, power: Math.pow, pow: Math.pow };

  function run(program) {
    var globals = Object.create(null), steps = 0, created = [], simGeometry, sim = null, diagnostics = [], notes = [];
    var defNode = Object.create(null), setCount = Object.create(null), changing = Object.create(null);
    function markChanging(target) { if (target.k === 'name') changing[target.v] = true; else if (target.items) target.items.forEach(markChanging); }
    globals.__name__ = '__main__';
    function err(message, node) { throw new PyError(message, node && node.line); }
    function tick(node) { if (++steps > MAX_STEPS) throw new PyError('the script is too long to read here (more than ' + MAX_STEPS + ' steps)', node && node.line); }
    function num(v, node, what) { if (!isNum(v)) err((what || 'a value') + ' should be a number, but it is ' + typeName(v), node); return Number(v); }
    function iterate(v, node) {
      if (Array.isArray(v)) return v; if (v instanceof Nd) return v.a;
      if (typeof v === 'string') return v.split('');
      err('cannot loop over ' + typeName(v), node);
    }
    function toVec(v, node, what) {
      if (v instanceof Vec) return v;
      if (Array.isArray(v) && v.length <= 3 && v.every(isNum)) return new Vec(Number(v[0] || 0), Number(v[1] || 0), Number(v[2] || 0));
      if (v instanceof Nd && v.a.length <= 3) return new Vec(v.a[0] || 0, v.a[1] || 0, v.a[2] || 0);
      err((what || 'a value') + ' should be a Vector3, but it is ' + typeName(v), node);
    }

    var builtins = {
      range: function (a, kw, node) {
        var v = a.map(function (x) { return num(x, node, 'range'); }), lo = v.length > 1 ? v[0] : 0, hi = v.length > 1 ? v[1] : v[0], step = v.length > 2 ? v[2] : 1, out = [];
        if (!v.length || !step) err('range needs a count', node);
        if (Math.abs((hi - lo) / step) > MAX_STEPS) err('this range is too long to read here', node);
        for (var x = lo; step > 0 ? x < hi : x > hi; x += step) out.push(x);
        return out;
      },
      len: function (a, kw, node) { return iterate(a[0], node).length; },
      abs: function (a, kw, node) { return a[0] instanceof Vec ? Math.hypot(a[0].x, a[0].y, a[0].z) : Math.abs(num(a[0], node)); },
      min: function (a, kw, node) { var list = a.length === 1 ? iterate(a[0], node) : a; return Math.min.apply(null, list.map(function (x) { return num(x, node); })); },
      max: function (a, kw, node) { var list = a.length === 1 ? iterate(a[0], node) : a; return Math.max.apply(null, list.map(function (x) { return num(x, node); })); },
      sum: function (a, kw, node) { return iterate(a[0], node).reduce(function (s, x) { return binary('+', s, x, node); }, a.length > 1 ? a[1] : 0); },
      round: function (a, kw, node) { var f = Math.pow(10, a.length > 1 ? num(a[1], node) : 0), x = num(a[0], node) * f, r = Math.round(x); if (Math.abs(x % 1) === 0.5 && r % 2) r -= 1; return r / f; },
      int: function (a, kw, node) { return Math.trunc(num(a[0], node)); },
      float: function (a, kw, node) { return typeof a[0] === 'string' ? (/^[+-]?inf(inity)?$/i.test(a[0].trim()) ? (a[0].trim()[0] === '-' ? -Infinity : Infinity) : Number(a[0])) : num(a[0], node); },
      bool: function (a) { return truthy(a[0]); },
      str: function (a) { return String(a[0]); },
      list: function (a, kw, node) { return a.length ? iterate(a[0], node).slice() : []; },
      tuple: function (a, kw, node) { return a.length ? iterate(a[0], node).slice() : []; },
      enumerate: function (a, kw, node) { var start = a.length > 1 ? num(a[1], node) : 0; return iterate(a[0], node).map(function (x, i) { return [i + start, x]; }); },
      zip: function (a, kw, node) { var lists = a.map(function (x) { return iterate(x, node); }), n = Math.min.apply(null, lists.map(function (l) { return l.length; })), out = []; for (var i = 0; i < n; i++) out.push(lists.map(function (l) { return l[i]; })); return out; },
      reversed: function (a, kw, node) { return iterate(a[0], node).slice().reverse(); },
      sorted: function (a, kw, node) { return iterate(a[0], node).slice().sort(function (x, y) { return num(x, node) - num(y, node); }); },
      print: function () { return null; },
      isinstance: function () { return new Opaque('isinstance()'); }
    };

    function mathMember(name, modName, node) {
      if (name === 'pi') return Math.PI; if (name === 'e') return Math.E; if (name === 'inf' || name === 'Inf' || name === 'infty') return Infinity;
      var each = function (f) { return function (a) { var x = a[0]; if (x instanceof Nd) return new Nd(x.a.map(function (v) { return f(v); })); return f(num(x, node, name)); }; };
      if (MATH[name]) return each(MATH[name]);
      if (MATH2[name]) return function (a) { return MATH2[name](num(a[0], node, name), num(a[1], node, name)); };
      if (modName === 'numpy') {
        if (name === 'linspace') return function (a, kw) {
          var lo = num(a[0], node), hi = num(a[1], node), n = Math.round(num(a.length > 2 ? a[2] : kw.num === undefined ? 50 : kw.num, node)), end = kw.endpoint === undefined ? true : truthy(kw.endpoint), out = [];
          if (n > MAX_STEPS) err('this linspace is too long to read here', node);
          for (var i = 0; i < n; i++) out.push(n === 1 ? lo : lo + (hi - lo) * i / (end ? n - 1 : n));
          return new Nd(out);
        };
        if (name === 'arange') return function (a, kw, n2) {
          var v = a.map(function (x) { return num(x, node); }), lo = v.length > 1 ? v[0] : 0, hi = v.length > 1 ? v[1] : v[0], step = v.length > 2 ? v[2] : 1;
          var count = Math.max(0, Math.ceil((hi - lo) / step)), out = [];
          if (!step || count > MAX_STEPS) err('this arange is too long to read here', node);
          for (var i = 0; i < count; i++) out.push(lo + i * step);
          return new Nd(out);
        };
        if (name === 'array' || name === 'asarray') return function (a) { var list = iterate(a[0], node); if (!list.every(isNum)) err('only arrays of plain numbers are read', node); return new Nd(list.map(Number)); };
        if (name === 'zeros' || name === 'ones') return function (a) { var n = num(a[0], node), out = []; for (var i = 0; i < n; i++) out.push(name === 'ones' ? 1 : 0); return new Nd(out); };
      }
      return new Opaque(modName + '.' + name);
    }
    function moduleMember(mod, name, node) {
      var m = mod.name;
      if (m === 'meep') {
        if (name === 'inf') return Infinity; if (name === 'pi') return Math.PI;
        if (name === 'air' || name === 'vacuum') return new Medium(1, null, true);
        if (name === 'metal' || name === 'perfect_electric_conductor' || name === 'perfect_magnetic_conductor') { var conductor = new Medium(null, name); conductor.code = 'mp.' + name; return conductor; }
        if (name === 'materials') return new Module('meep.materials');
        if (name === 'Vector3') return function (a, kw) {
          var v = [0, 0, 0];
          a.forEach(function (x, i) { if (i < 3) v[i] = num(x, node, 'a Vector3 component'); });
          ['x', 'y', 'z'].forEach(function (key, i) { if (kw[key] !== undefined) v[i] = num(kw[key], node, 'a Vector3 component'); });
          return new Vec(v[0], v[1], v[2]);
        };
        if (name === 'Medium') return function (a, kw, callNode) {
          var keys = Object.keys(kw);
          if (!keys.length) return new Medium(1, null, false);
          if (kw.index !== undefined && keys.length === 1) return new Medium(num(kw.index, node, 'index'));
          if (kw.epsilon !== undefined && keys.length === 1) { var eps = num(kw.epsilon, node, 'epsilon'); if (eps > 0) return new Medium(Number(Math.sqrt(eps).toPrecision(12))); }
          var medium = new Medium(null); medium.complex = true;
          if (callNode && callNode.pos !== undefined) medium.span = [callNode.pos, callNode.end];
          return medium;
        };
        if (GEO.indexOf(name) >= 0) return function (a, kw, n2, callNode, scope) {
          if (created.length >= MAX_OBJECTS) err('more than ' + MAX_OBJECTS + ' objects: too many to draw here', node);
          var local = Object.create(null);
          for (var s = scope; s; s = s.parent) Object.keys(s.vars).forEach(function (key) { local[key] = true; });
          var geo = new Geo(name, a, kw, callNode, local);
          created.push(geo); return geo;
        };
        var CONSTANTS = { X: 0, Y: 1, Z: 2, ALL: -1, AUTOMATIC: -1, Low: 1, High: 0 };
        if (CONSTANTS[name] !== undefined) return CONSTANTS[name];
        // Field components are kept as their names (mp.Ez -> 'Ez').
        if (/^[EHDB][xyz]$/.test(name) || name === 'ALL_COMPONENTS') return name;
        if (name === 'Source' || name === 'EigenModeSource' || name === 'GaussianBeamSource') return function (a, kw, n2, callNode) { return new Src(name, a, kw, callNode); };
        if (name === 'FluxRegion' || name === 'ModeRegion') return function (a, kw, n2, callNode) { return new Region(name, a, kw, callNode); };
        if (name === 'PML' || name === 'Absorber') return function (a, kw, n2, callNode) { return new Layer(name, a, kw, callNode); };
        // The last mp.Simulation made is the one drawn (as for its geometry).
        if (name === 'Simulation') return function (a, kw, n2, callNode) { if (kw.geometry !== undefined) simGeometry = kw.geometry; sim = new Sim(kw, callNode); return sim; };
        return new Opaque('mp.' + name);
      }
      if (m === 'meep.materials') { var listed = new Medium(null, name); listed.library = name; return listed; }
      if (m === 'numpy' || m === 'math') return mathMember(name, m, node);
      return new Opaque(m + '.' + name);
    }
    function vecMember(v, name, node) {
      if (name === 'x' || name === 'y' || name === 'z') return v[name];
      if (name === 'norm') return function () { return Math.hypot(v.x, v.y, v.z); };
      if (name === 'scale') return function (a) { var s = num(a[0], node); return new Vec(v.x * s, v.y * s, v.z * s); };
      if (name === 'unit') return function () { var l = Math.hypot(v.x, v.y, v.z); return new Vec(v.x / l, v.y / l, v.z / l); };
      if (name === 'dot') return function (a) { var b = toVec(a[0], node); return v.x * b.x + v.y * b.y + v.z * b.z; };
      if (name === 'cross') return function (a) { var b = toVec(a[0], node); return new Vec(v.y * b.z - v.z * b.y, v.z * b.x - v.x * b.z, v.x * b.y - v.y * b.x); };
      if (name === 'rotate') return function (a) {
        var k = toVec(a[0], node), t = num(a[1], node), l = Math.hypot(k.x, k.y, k.z); k = new Vec(k.x / l, k.y / l, k.z / l);
        var c = Math.cos(t), s = Math.sin(t), d = k.x * v.x + k.y * v.y + k.z * v.z;
        return new Vec(v.x * c + (k.y * v.z - k.z * v.y) * s + k.x * d * (1 - c), v.y * c + (k.z * v.x - k.x * v.z) * s + k.y * d * (1 - c), v.z * c + (k.x * v.y - k.y * v.x) * s + k.z * d * (1 - c));
      };
      err('Vector3.' + name + ' is not read', node);
    }
    function member(value, name, node) {
      if (value instanceof Module) return moduleMember(value, name, node);
      if (value instanceof Vec) return vecMember(value, name, node);
      if (value instanceof Opaque) return new Opaque(value.what);
      if (value instanceof Sim) {
        if (name === 'add_flux' || name === 'add_mode_monitor') return function (a, kw, n2, callNode) {
          a.concat(kw.where !== undefined ? [kw.where] : []).forEach(function (r) { if (r instanceof Region) value.monitors.push({ region: r, via: name, line: callNode.line }); });
          return new Opaque('a monitor');
        };
        return new Opaque('a Simulation');
      }
      if (Array.isArray(value)) {
        if (name === 'append') return function (a) { value.push(a[0]); return null; };
        if (name === 'extend') return function (a) { iterate(a[0], node).forEach(function (x) { value.push(x); }); return null; };
        if (name === 'insert') return function (a) { value.splice(num(a[0], node), 0, a[1]); return null; };
        if (name === 'copy') return function () { return value.slice(); };
        err('list.' + name + ' is not read', node);
      }
      if (value instanceof Nd && name === 'tolist') return function () { return value.a.slice(); };
      if (value instanceof Geo) { if (value.named[name] !== undefined) return value.named[name]; err('reading .' + name + ' of a geometry object is not supported', node); }
      if (value instanceof Medium) return new Opaque('a material property');
      if (typeof value === 'string') return new Opaque('a text method');
      err('cannot read .' + name + ' of ' + typeName(value), node);
    }

    function binary(op, a, b, node) {
      if (isNum(a) && isNum(b)) {
        a = Number(a); b = Number(b);
        switch (op) {
          case '+': return a + b; case '-': return a - b; case '*': return a * b; case '**': return Math.pow(a, b);
          case '/': if (b === 0) err('division by zero', node); return a / b;
          case '//': if (b === 0) err('division by zero', node); return Math.floor(a / b);
          case '%': if (b === 0) err('division by zero', node); return a - b * Math.floor(a / b);
        }
      }
      if (a instanceof Vec && b instanceof Vec) {
        if (op === '+') return new Vec(a.x + b.x, a.y + b.y, a.z + b.z);
        if (op === '-') return new Vec(a.x - b.x, a.y - b.y, a.z - b.z);
        if (op === '*') return a.x * b.x + a.y * b.y + a.z * b.z;             // Meep: Vector3 * Vector3 is the dot product
      }
      if (a instanceof Vec && isNum(b) && (op === '*' || op === '/')) { if (op === '/' && Number(b) === 0) err('division by zero', node); return op === '*' ? new Vec(a.x * b, a.y * b, a.z * b) : new Vec(a.x / b, a.y / b, a.z / b); }
      if (isNum(a) && b instanceof Vec && op === '*') return new Vec(a * b.x, a * b.y, a * b.z);
      if (a instanceof Nd || b instanceof Nd) {
        var la = a instanceof Nd ? a.a : null, lb = b instanceof Nd ? b.a : null;
        if ((la || isNum(a)) && (lb || isNum(b)) && (!la || !lb || la.length === lb.length)) {
          var n = (la || lb).length, out = [];
          for (var i = 0; i < n; i++) out.push(binary(op, la ? la[i] : a, lb ? lb[i] : b, node));
          return new Nd(out);
        }
      }
      if (Array.isArray(a) && Array.isArray(b) && op === '+') return a.concat(b);
      if (op === '*' && ((Array.isArray(a) && isNum(b)) || (isNum(a) && Array.isArray(b)))) {
        var list = Array.isArray(a) ? a : b, times = Number(Array.isArray(a) ? b : a), rep = [];
        if (list.length * times > MAX_STEPS) err('this list is too long to read here', node);
        for (var r = 0; r < times; r++) rep = rep.concat(list);
        return rep;
      }
      if (typeof a === 'string' && typeof b === 'string' && op === '+') return a + b;
      if (typeof a === 'string' && op === '%') return a;
      err('cannot compute ' + typeName(a) + ' ' + op + ' ' + typeName(b), node);
    }
    function equal(a, b) {
      if (isNum(a) && isNum(b)) return Number(a) === Number(b);
      if (a instanceof Vec && b instanceof Vec) return a.x === b.x && a.y === b.y && a.z === b.z;
      if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every(function (x, i) { return equal(x, b[i]); });
      return a === b;
    }
    function compare(op, a, b, node) {
      if (op === '==') return equal(a, b); if (op === '!=') return !equal(a, b);
      if (op === 'is') return a === b; if (op === 'is not') return a !== b;
      if (op === 'in' || op === 'not in') { var found = typeof b === 'string' ? b.indexOf(String(a)) >= 0 : iterate(b, node).some(function (x) { return equal(x, a); }); return op === 'in' ? found : !found; }
      var x = num(a, node, 'a compared value'), y = num(b, node, 'a compared value');
      return op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
    }

    function defined(name, scope) {
      for (var s = scope; s; s = s.parent) if (name in s.vars) return true;
      return name in globals || !!builtins[name];
    }
    function lookup(name, scope, node) {
      for (var s = scope; s; s = s.parent) if (name in s.vars) return s.vars[name];
      if (name in globals) return globals[name];
      if (builtins[name]) return builtins[name];
      err('the name ' + name + ' is not defined', node);
    }
    function store(target, value, scope, node) {
      if (target.k === 'name') {
        if (value instanceof Medium && !value.name && !value.air) value.name = target.v;
        if (!scope) setCount[target.v] = (setCount[target.v] || 0) + 1;
        (scope ? scope.vars : globals)[target.v] = value; return;
      }
      if (target.k === 'tuple' || target.k === 'list') {
        var list = value instanceof Vec ? [value.x, value.y, value.z] : iterate(value, node);
        if (list.length !== target.items.length) err('cannot unpack ' + list.length + ' values into ' + target.items.length + ' names', node);
        target.items.forEach(function (t, i) { store(t, list[i], scope, node); }); return;
      }
      if (target.k === 'index') {
        var container = evaluate(target.value, scope), index = evaluate(target.index, scope);
        if (Array.isArray(container) && isNum(index)) { var i = index < 0 ? container.length + index : index; if (i < 0 || i >= container.length) err('list index out of range', node); container[i] = value; return; }
        if (container instanceof Nd && isNum(index)) { container.a[index < 0 ? container.a.length + index : index] = num(value, node); return; }
      }
      if (target.k === 'attr') { var owner = evaluate(target.value, scope); if (owner instanceof Opaque || owner instanceof Sim) return; if (owner instanceof Geo) { owner.named[target.name] = value; return; } }
      err('this kind of assignment is not read', node);
    }
    function call(fn, args, named, node, scope) {
      if (typeof fn === 'function') return fn(args, named, node, node, scope);
      if (fn instanceof Opaque) return new Opaque(fn.what);
      if (fn instanceof Func) {
        var scope = { vars: Object.create(null), parent: fn.scope }, params = fn.node.params;
        if (args.length > params.length) err(fn.node.name + '() got too many values', node);
        params.forEach(function (param, i) {
          if (i < args.length) scope.vars[param.name] = args[i];
          else if (named[param.name] !== undefined) scope.vars[param.name] = named[param.name];
          else if (param.fallback) scope.vars[param.name] = evaluate(param.fallback, fn.scope);
          else err(fn.node.name + '() needs a value for ' + param.name, node);
        });
        Object.keys(named).forEach(function (key) { if (!params.some(function (q) { return q.name === key; })) err(fn.node.name + '() has no parameter ' + key, node); });
        var signal = execBlock(fn.node.body, scope);
        return signal && signal.kind === 'return' ? signal.value : null;
      }
      err(typeName(fn) + ' cannot be called', node);
    }
    function comprehend(node, scope) {
      var out = [], inner = { vars: Object.create(null), parent: scope || null };
      (function loop(level) {
        if (level === node.loops.length) { out.push(evaluate(node.element, inner)); return; }
        var spec = node.loops[level];
        iterate(evaluate(spec.iter, inner), node).forEach(function (item) {
          tick(node); store(spec.target, item, inner, node);
          if (spec.tests.every(function (t) { return truthy(evaluate(t, inner)); })) loop(level + 1);
        });
      }(0));
      return out;
    }
    function evaluate(node, scope) {
      switch (node.k) {
        case 'num': case 'str': case 'const': return node.v;
        case 'name': return lookup(node.v, scope, node);
        case 'list': case 'tuple': return node.items.map(function (item) { return evaluate(item, scope); });
        case 'comp': return comprehend(node, scope);
        case 'unary': { var u = evaluate(node.value, scope); if (node.op === '+') return u; if (u instanceof Vec) return new Vec(-u.x, -u.y, -u.z); if (u instanceof Nd) return new Nd(u.a.map(function (x) { return -x; })); return -num(u, node); }
        case 'not': return !truthy(evaluate(node.value, scope));
        case 'bool': { var l = evaluate(node.left, scope); return node.op === 'and' ? (truthy(l) ? evaluate(node.right, scope) : l) : (truthy(l) ? l : evaluate(node.right, scope)); }
        case 'cond': return truthy(evaluate(node.test, scope)) ? evaluate(node.yes, scope) : evaluate(node.no, scope);
        case 'compare': { var left = evaluate(node.left, scope); for (var c = 0; c < node.ops.length; c++) { var right = evaluate(node.rights[c], scope); if (!compare(node.ops[c], left, right, node)) return false; left = right; } return true; }
        case 'bin': return binary(node.op, evaluate(node.left, scope), evaluate(node.right, scope), node);
        case 'attr': return member(evaluate(node.value, scope), node.name, node);
        case 'call': {
          var fn = evaluate(node.fn, scope), args = node.args.map(function (a) { return evaluate(a, scope); }), named = {};
          node.named.forEach(function (pair) {
            // material=Ag where Ag is not defined in the script: keep the name, and say so.
            if (pair.name === 'material' && pair.value.k === 'name' && !defined(pair.value.v, scope)) {
              named.material = new Medium(null, pair.value.v);
              var note = 'Material ' + pair.value.v + ' is not defined in the script: define it before running the script.';
              if (notes.indexOf(note) < 0) notes.push(note);
            } else named[pair.name] = evaluate(pair.value, scope);
          });
          tick(node); return call(fn, args, named, node, scope);
        }
        case 'index': {
          var value = evaluate(node.value, scope);
          if (value instanceof Opaque) return new Opaque(value.what);
          var list = value instanceof Nd ? value.a : value instanceof Vec ? [value.x, value.y, value.z] : value;
          if (!Array.isArray(list) && typeof list !== 'string') err('cannot index ' + typeName(value), node);
          if (node.index.k === 'slice') {
            var s = node.index, step = s.step ? num(evaluate(s.step, scope), node) : 1;
            if (step !== 1) err('slices with a step are not read', node);
            var part = list.slice(s.lo ? num(evaluate(s.lo, scope), node) : 0, s.hi ? num(evaluate(s.hi, scope), node) : undefined);
            return value instanceof Nd ? new Nd(part) : part;
          }
          var i = num(evaluate(node.index, scope), node, 'an index'); if (i < 0) i += list.length;
          if (!(i >= 0 && i < list.length) || i % 1) err('index out of range', node);
          return list[i];
        }
      }
      err('this expression is not read', node);
    }
    function exec(node, scope) {
      tick(node);
      switch (node.k) {
        case 'bad': throw new PyError(node.message, node.errorLine || node.line);
        case 'pass': return null;
        case 'seq': return execBlock(node.body, scope);
        case 'expr': evaluate(node.value, scope); return null;
        case 'assign': {
          var value = evaluate(node.value, scope);
          node.targets.forEach(function (t) { store(t, value, scope, node); });
          if (!scope && node.targets.length === 1 && node.targets[0].k === 'name') defNode[node.targets[0].v] = node.value;
          return null;
        }
        case 'aug': {
          var current = evaluate(node.target, scope), extra = evaluate(node.value, scope);
          if (!scope) markChanging(node.target);
          if (Array.isArray(current) && node.op === '+') { iterate(extra, node).forEach(function (x) { current.push(x); }); return null; }   // list += list changes the list itself
          store(node.target, binary(node.op, current, extra, node), scope, node); return null;
        }
        case 'import': node.names.forEach(function (item) {
          var target = scope ? scope.vars : globals;
          if (item.as) target[item.as] = new Module(item.module); else target[item.module.split('.')[0]] = new Module(item.module.split('.')[0]);
        }); return null;
        case 'from': {
          if (node.names === '*') err('"from ' + node.module + ' import *" is not read: import the names you use', node);
          var mod = new Module(node.module);
          node.names.forEach(function (item) { (scope ? scope.vars : globals)[item.as || item.name] = moduleMember(mod, item.name, node); });
          return null;
        }
        case 'def': (scope ? scope.vars : globals)[node.name] = new Func(node, scope || null); return null;
        case 'return': return new Signal('return', node.value ? evaluate(node.value, scope) : null);
        case 'break': case 'continue': return new Signal(node.k);
        case 'if': {
          for (var b = 0; b < node.branches.length; b++) if (truthy(evaluate(node.branches[b].test, scope))) return execBlock(node.branches[b].body, scope);
          return node.orelse ? execBlock(node.orelse, scope) : null;
        }
        case 'for': {
          var items = iterate(evaluate(node.iter, scope), node).slice();
          if (!scope) markChanging(node.target);
          for (var i = 0; i < items.length; i++) {
            tick(node); store(node.target, items[i], scope, node);
            var signal = execBlock(node.body, scope);
            if (signal) { if (signal.kind === 'break') break; if (signal.kind === 'return') return signal; }
          }
          return null;
        }
      }
      err('this statement is not read', node);
    }
    function execBlock(body, scope) {
      for (var i = 0; i < body.length; i++) { var signal = exec(body[i], scope); if (signal) return signal; }
      return null;
    }

    for (var s = 0; s < program.length; s++) {
      try { exec(program[s], null); }
      catch (error) {
        if (!(error instanceof PyError)) throw error;
        diagnostics.push({ line: error.line || program[s].line, message: error.message });
        if (steps > MAX_STEPS) break;
      }
    }
    function origin(node, local, depth) {
      if (!node || depth > 8) return null;
      if (node.k === 'num') return { pos: node.pos, end: node.end, line: node.line, via: null };
      if (node.k === 'unary' && node.op === '-' && node.value.k === 'num') return { pos: node.pos, end: node.value.end, line: node.line, via: null };
      if (node.k === 'name' && !local[node.v] && setCount[node.v] === 1 && !changing[node.v] && defNode[node.v]) {
        var found = origin(defNode[node.v], {}, depth + 1);
        if (found) found.via = found.via || node.v;
        return found;
      }
      return null;
    }
    function vectorOrigin(node, local, depth) {
      if (!node || depth > 8) return null;
      if (node.k === 'name' && !local[node.v] && setCount[node.v] === 1 && !changing[node.v] && defNode[node.v]) return vectorOrigin(defNode[node.v], {}, depth + 1);
      if (node.k !== 'call' || !((node.fn.k === 'attr' && node.fn.name === 'Vector3') || (node.fn.k === 'name' && node.fn.v === 'Vector3'))) return null;
      var parts = [null, null, null];
      node.args.forEach(function (arg, i) { if (i < 3) parts[i] = origin(arg, local, depth); });
      node.named.forEach(function (pair) { var i = ['x', 'y', 'z'].indexOf(pair.name); if (i >= 0) parts[i] = origin(pair.value, local, depth); });
      return parts;
    }
    return { globals: globals, created: created, simGeometry: simGeometry, sim: sim, diagnostics: diagnostics, notes: notes, toVec: toVec, origin: origin, vectorOrigin: vectorOrigin };
  }

  var POSITIONAL = { Sphere: ['radius'], Cylinder: ['radius'], Cone: ['radius'], Block: ['size'], Ellipsoid: ['size'], Prism: ['vertices', 'height', 'axis', 'center'] };

  function outsideNames(code, globals) {
    var tokens, found = [];
    try { tokens = tokenize(code); } catch (error) { return found; }
    tokens.forEach(function (tok, i) {
      if (tok.t !== 'name') return;
      var before = tokens[i - 1], after = tokens[i + 1];
      if (before && before.t === 'op' && before.v === '.') return;           // mp.LorentzianSusceptibility: an attribute
      if (after && after.t === 'op' && after.v === '=') return;              // epsilon=…: a keyword
      if (globals[tok.v] instanceof Module) return;                          // mp, np, math
      if (found.indexOf(tok.v) < 0) found.push(tok.v);
    });
    return found;
  }

  function readSetup(state, diagnostics) {
    var sim = state.sim;
    if (!sim) return null;
    var kw = sim.kw;
    var argLine = function (key) { var hit = sim.node.named.filter(function (pair) { return pair.name === key; })[0]; return hit && hit.value.line ? hit.value.line : sim.line; };
    var problem = function (message, line) { diagnostics.push({ line: line || sim.line, message: message }); };
    var setup = { line: sim.line, cell: null, center: [0, 0, 0], dimensions: null, resolution: null, layers: [], walls: 'metal', kPoint: null, sources: [], monitors: [] };
    var vec = function (key) { try { var v = state.toVec(kw[key], { line: argLine(key) }, key); return [v.x, v.y, v.z]; } catch (error) { if (!(error instanceof PyError)) throw error; problem(error.message, argLine(key)); return null; } };
    if (kw.cell_size === undefined) problem('mp.Simulation has no cell_size: the cell is not drawn');
    else {
      var size = vec('cell_size');
      if (size && size.every(function (v) { return isFinite(v) && v >= 0; })) setup.cell = { size: size, line: argLine('cell_size') };
      else if (size) problem('cell_size should hold three finite sizes of zero or more', argLine('cell_size'));
    }
    if (kw.geometry_center !== undefined) { var c = vec('geometry_center'); if (c) setup.center = c; }
    if (kw.dimensions !== undefined) {
      if (isNum(kw.dimensions) && [1, 2, 3].indexOf(Number(kw.dimensions)) >= 0) setup.dimensions = Number(kw.dimensions);
      else { problem('only dimensions=1, 2 or 3 are drawn (not cylindrical coordinates): the cell is not drawn', argLine('dimensions')); setup.cell = null; }
    } else if (setup.cell) setup.dimensions = setup.cell.size[2] === 0 ? 2 : 3;
    if (kw.resolution !== undefined && isNum(kw.resolution)) setup.resolution = Number(kw.resolution);
    if (kw.k_point !== undefined && kw.k_point !== false) {
      if (kw.k_point instanceof Vec) { setup.walls = 'periodic'; setup.kPoint = [kw.k_point.x, kw.k_point.y, kw.k_point.z]; }
      else { setup.walls = null; problem('k_point is not a Vector3: the kind of cell walls is not known here', argLine('k_point')); }
    }
    if (kw.boundary_layers !== undefined) {
      (Array.isArray(kw.boundary_layers) ? kw.boundary_layers : [kw.boundary_layers]).forEach(function (layer) {
        if (!(layer instanceof Layer)) { problem('boundary_layers holds ' + typeName(layer) + ', not an mp.PML or mp.Absorber: it is not drawn', argLine('boundary_layers')); return; }
        var names = ['thickness', 'direction', 'side'], v = { direction: -1, side: -1 };
        layer.a.forEach(function (value, i) { if (i < names.length) v[names[i]] = value; });
        names.forEach(function (key) { if (layer.kw[key] !== undefined) v[key] = layer.kw[key]; });
        if (!isNum(v.thickness) || !(Number(v.thickness) >= 0) || !isFinite(v.thickness)) { problem('mp.' + layer.kind + ' needs a thickness of zero or more', layer.line); return; }
        if ([-1, 0, 1, 2].indexOf(v.direction) < 0 || [-1, 0, 1].indexOf(v.side) < 0) { problem('mp.' + layer.kind + ': only the directions mp.X, mp.Y, mp.Z, mp.ALL and the sides mp.Low, mp.High, mp.ALL are drawn', layer.line); return; }
        setup.layers.push({ kind: layer.kind, thickness: Number(v.thickness), direction: v.direction, side: v.side, line: layer.line });
      });
    }
    readSources(state, sim, setup, problem, argLine);
    readMonitors(state, sim, setup, problem);
    return setup;
  }

  var UNIT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // The directions the cell has: x, y in 2D; z in 1D; x, y, z in 3D.
  function cellAxes(setup) { return setup.dimensions === 2 ? [0, 1] : setup.dimensions === 1 ? [2] : [0, 1, 2]; }
  function planeNormal(size, setup) { var zero = cellAxes(setup).filter(function (k) { return size[k] === 0; }); return zero.length === 1 ? zero[0] : null; }
  // Positional and named values of a call, by Meep's parameter names.
  function values(item, names) { var v = {}; item.a.forEach(function (value, i) { if (i < names.length) v[names[i]] = value; }); Object.keys(item.kw).forEach(function (key) { v[key] = item.kw[key]; }); return v; }

  function readSources(state, sim, setup, problem, argLine) {
    if (sim.kw.sources === undefined) return;
    var list = Array.isArray(sim.kw.sources) ? sim.kw.sources : [sim.kw.sources];
    list.forEach(function (src) {
      if (!(src instanceof Src)) { problem('sources holds ' + typeName(src) + ', not a Meep source: it is not drawn', argLine('sources')); return; }
      var names = src.kind === 'Source' ? ['src', 'component', 'center', 'volume', 'size'] : ['src', 'center', 'volume'];
      var v = values(src, names), node = { line: src.line };
      try {
        if (v.volume !== undefined && v.volume !== null) throw new PyError('a source given by volume= is not drawn yet (give center= and size=)', src.line);
        var vec = function (key, fallback) { if (v[key] === undefined) return fallback; var w = state.toVec(v[key], node, key); return [w.x, w.y, w.z]; };
        var out = { kind: src.kind, line: src.line, center: vec('center', [0, 0, 0]), size: vec('size', [0, 0, 0]), component: null, polarization: null, travel: null, note: null };
        if (src.kind === 'Source') {
          if (typeof v.component !== 'string') throw new PyError('mp.Source needs a component such as mp.Ez', src.line);
          out.component = v.component;
          if (/^[EHDB][xyz]$/.test(v.component)) out.polarization = UNIT['xyz'.indexOf(v.component[1])];
          out.note = 'both';
        } else if (src.kind === 'EigenModeSource') {
          var direction = v.direction === undefined ? -1 : v.direction;
          var axis = [0, 1, 2].indexOf(direction) >= 0 ? direction : planeNormal(out.size, setup);
          var k = vec('eig_kpoint', [0, 0, 0]);
          if (axis === null) out.note = 'no-normal';
          else if (k.some(function (x, i) { return i !== axis && x !== 0; })) out.note = 'oblique';
          else { out.travel = UNIT[axis].map(function (x) { return k[axis] < 0 ? -x : x; }); out.note = 'mode'; }
          out.component = typeof v.component === 'string' && v.component !== 'ALL_COMPONENTS' ? v.component : null;
        } else {
          var kdir = vec('beam_kdir', null), e0 = vec('beam_E0', null), length = kdir && Math.hypot(kdir[0], kdir[1], kdir[2]);
          if (!length) out.note = 'no-kdir';
          else { out.travel = kdir.map(function (x) { return x / length; }); out.note = 'beam'; }
          var e = e0 && Math.hypot(e0[0], e0[1], e0[2]);
          if (e) out.polarization = e0.map(function (x) { return x / e; });
        }
        setup.sources.push(out);
      } catch (error) {
        if (!(error instanceof PyError)) throw error;
        problem(error.message, error.line || src.line);
      }
    });
  }

  function readMonitors(state, sim, setup, problem) {
    sim.monitors.forEach(function (m) {
      var r = m.region, v = values(r, ['center', 'size', 'direction', 'weight', 'volume']), node = { line: r.line };
      try {
        if (v.volume !== undefined && v.volume !== null) throw new PyError('a monitor region given by volume= is not drawn yet (give center= and size=)', r.line);
        var vec = function (key, fallback) { if (v[key] === undefined) return fallback; var w = state.toVec(v[key], node, key); return [w.x, w.y, w.z]; };
        var out = { kind: m.via === 'add_mode_monitor' ? 'mode' : 'flux', line: r.line, addLine: m.line, center: vec('center', [0, 0, 0]), size: vec('size', [0, 0, 0]), normal: null, weight: 1 };
        if (v.weight !== undefined) { if (!isNum(v.weight)) throw new PyError('only a real weight is drawn', r.line); out.weight = Number(v.weight); }
        var direction = v.direction === undefined ? -1 : v.direction;
        var axis = [0, 1, 2].indexOf(direction) >= 0 ? direction : planeNormal(out.size, setup);
        if (axis !== null && out.weight !== 0) out.normal = UNIT[axis].map(function (x) { return out.weight < 0 ? -x : x; });
        setup.monitors.push(out);
      } catch (error) {
        if (!(error instanceof PyError)) throw error;
        problem(error.message, error.line || r.line);
      }
    });
  }

  function readMeep(text) {
    var tokens, state;
    try { tokens = tokenize(String(text)); }
    catch (error) { if (!(error instanceof PyError)) throw error; return { objects: [], diagnostics: [{ line: error.line, message: error.message }], notes: [], source: 'none', setup: null }; }
    state = run(parse(tokens));
    var diagnostics = state.diagnostics, notes = state.notes, list, source;
    if (state.simGeometry !== undefined) { list = state.simGeometry; source = 'simulation'; }
    else if (Array.isArray(state.globals.geometry)) { list = state.globals.geometry; source = 'geometry'; }
    else { list = state.created; source = 'all'; if (state.created.length) notes.push('No list named "geometry" was found: every object in the script is drawn.'); }

    var flat = [];
    (function flatten(items, depth) {
      (Array.isArray(items) ? items : [items]).forEach(function (item) {
        if (Array.isArray(item) && depth < 8) flatten(item, depth + 1);
        else if (item instanceof Geo) flat.push(item);
        else if (item !== null && item !== undefined) notes.push('The geometry list holds something that is not a shape (' + typeName(item) + '); it is left out.');
      });
    }(list, 0));

    var objects = [];
    flat.forEach(function (geo) {
      try {
        if (geo.kind === 'Wedge') throw new PyError('mp.Wedge is not drawn yet', geo.line);
        var a = {}, names = POSITIONAL[geo.kind], node = { line: geo.line };
        geo.args.forEach(function (value, i) { if (i >= names.length) throw new PyError('mp.' + geo.kind + ' has too many unnamed values', geo.line); a[names[i]] = value; });
        Object.keys(geo.named).forEach(function (key) { a[key] = geo.named[key]; });
        var number = function (key, fallback) {
          if (a[key] === undefined) { if (fallback === undefined) throw new PyError('mp.' + geo.kind + ' needs ' + key, geo.line); return fallback; }
          if (!isNum(a[key])) throw new PyError(key + ' should be a number, but it is ' + typeName(a[key]), geo.line);
          return Number(a[key]);
        };
        var vector = function (key, fallback) { if (a[key] === undefined) { if (fallback === undefined) throw new PyError('mp.' + geo.kind + ' needs ' + key, geo.line); return fallback; } var v = state.toVec(a[key], node, key); return [v.x, v.y, v.z]; };
        var out = { kind: geo.kind, line: geo.line, endLine: geo.endLine, centerGiven: a.center !== undefined, center: vector('center', [0, 0, 0]) };
        var argNode = function (key) {
          var hit = geo.node.named.filter(function (pair) { return pair.name === key; })[0];
          return hit ? hit.value : geo.node.args[names.indexOf(key)] || null;
        };
        out.origins = {};
        ['radius', 'radius2', 'height'].forEach(function (key) { var o = state.origin(argNode(key), geo.local, 0); if (o) out.origins[key] = o; });
        ['center', 'size'].forEach(function (key) { var o = state.vectorOrigin(argNode(key), geo.local, 0); if (o) out.origins[key] = o; });
        var material = a.material;
        if (material === undefined) out.medium = { n: 1, name: null, air: true, given: false };
        else if (material instanceof Medium) {
          var code = material.code || (material.span ? String(text).slice(material.span[0], material.span[1]) : null);
          out.medium = { n: material.n, name: material.name, air: material.air || (material.n === 1 && !material.name), complex: !!material.complex, given: true,
            code: code, library: material.library, needs: material.span ? outsideNames(code, state.globals) : [] };
        }
        else throw new PyError('material should be an mp.Medium, but it is ' + typeName(material), geo.line);
        if (geo.kind === 'Sphere') out.radius = number('radius');
        else if (geo.kind === 'Cylinder' || geo.kind === 'Cone') {
          out.radius = number('radius'); out.height = number('height', Infinity); out.axis = vector('axis', [0, 0, 1]);
          if (geo.kind === 'Cone') out.radius2 = number('radius2', 0);
        } else if (geo.kind === 'Block' || geo.kind === 'Ellipsoid') {
          out.size = vector('size'); out.rotated = a.e1 !== undefined || a.e2 !== undefined || a.e3 !== undefined;
        } else {
          if (a.vertices === undefined) throw new PyError('mp.Prism needs vertices', geo.line);
          var vertices = a.vertices instanceof Nd ? null : a.vertices;
          if (!Array.isArray(vertices) || vertices.length < 3) throw new PyError('a prism needs a list of at least three Vector3 vertices', geo.line);
          out.vertices = vertices.map(function (v) { var w = state.toVec(v, node, 'a vertex'); return [w.x, w.y, w.z]; });
          out.height = number('height', Infinity); out.axis = vector('axis', [0, 0, 1]);
          out.slanted = a.sidewall_angle !== undefined && Number(a.sidewall_angle) !== 0;
        }
        objects.push(out);
      } catch (error) {
        if (!(error instanceof PyError)) throw error;
        diagnostics.push({ line: error.line || geo.line, message: error.message });
      }
    });
    var setup = readSetup(state, diagnostics);
    diagnostics.sort(function (x, y) { return (x.line || 0) - (y.line || 0); });
    return { objects: objects, diagnostics: diagnostics, notes: notes, source: source, setup: setup };
  }

  var api = Object.freeze({ readMeep: readMeep, tokenize: tokenize, parse: parse });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ElyvrisPy = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
