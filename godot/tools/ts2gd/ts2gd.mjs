#!/usr/bin/env node
/**
 * ts2gd: translates the game's TypeScript (the fight sim, the item catalogue, the part
 * builders) into GDScript for the Godot app, line by line, so both versions run the same code.
 *
 *   node godot/tools/ts2gd/ts2gd.mjs            # writes godot/gen/*.gd
 *
 * It is type-directed (it runs the TypeScript checker) and keeps JavaScript's semantics where
 * GDScript differs: every number is a float, `||` returns a value, closures capture variables
 * (boxed when written), `===` on objects is identity, sorts are stable, int32 bit operations.
 * Things it can't express are errors naming the file and line, so they get fixed here rather
 * than silently miscompiled.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exactLit } from './exactlit.mjs';

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  const root = execSync('npm root -g').toString().trim();
  ts = require(path.join(root, 'typescript'));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const OUT = path.join(REPO, 'godot/gen');
const CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, 'modules.json'), 'utf8'));

/** Source path (repo-relative) -> GDScript class name. */
const MODULES = new Map(Object.entries(CONFIG.modules));
/** Source path -> { exportName: gdExpression } for hand-written stand-ins. */
const EXTERNAL = new Map(Object.entries(CONFIG.external));
/** "file.ts:Class.method" or "file.ts:fn" -> replacement GDScript (raw lines) for hot spots. */
const OVERRIDES = CONFIG.overrides ?? {};

// --------------------------------------------------------------------------- names
const NAMES = JSON.parse(fs.readFileSync(path.join(HERE, 'godot-names.json'), 'utf8'));
const KEYWORDS = [
  'if', 'elif', 'else', 'for', 'while', 'match', 'when', 'break', 'continue', 'pass', 'return', 'class', 'class_name',
  'extends', 'is', 'in', 'as', 'self', 'super', 'signal', 'func', 'static', 'const', 'enum', 'var', 'breakpoint',
  'preload', 'await', 'yield', 'assert', 'void', 'PI', 'TAU', 'INF', 'NAN', 'not', 'and', 'or', 'true', 'false', 'null',
  'tool', 'onready', 'export', 'trait', 'namespace', 'abstract', 'print', 'range', 'len', 'char', 'ord', 'load',
  'typeof', 'str', 'Color8', 'convert', 'instance_from_id', 'is_instance_of', 'get_stack', 'print_debug', 'type_exists',
  'inst_to_dict', 'dict_to_inst', 'print_stack', 'Callable', 'Signal',
];
const RESERVED = new Set([
  ...KEYWORDS,
  ...NAMES.util,
  ...NAMES.builtin,
  ...NAMES.classes,
  ...NAMES.objectMethods,
  ...NAMES.dictMethods,
  ...NAMES.singletons,
  'script', 'V3', 'JS', 'DM', 'TPerf', 'name',
]);
// Short math helpers are fine as members (called through their class) but not as locals.
// Every name changed this way, for TInit.RENAMED: saves and other JSON go through
// TInit.from_json/to_json so their keys match what the translated code reads.
const RENAMED = new Map();
const gd = (n) => {
  const g = n === '_' ? '_u' : /^_+$/.test(n) ? n + 'u' : RESERVED.has(n) ? n + '_' : n;
  if (g !== n && /^[A-Za-z_$][\w$]*$/.test(n)) RENAMED.set(n, g);
  return g;
};

// --------------------------------------------------------------------------- program
const roots = [...MODULES.keys()].map((p) => path.join(REPO, p));
const options = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
  baseUrl: REPO,
  paths: { three: [path.join(HERE, 'three.d.ts')] },
  allowImportingTsExtensions: true,
};
const program = ts.createProgram(roots, options);
const checker = program.getTypeChecker();

const rel = (sf) => path.relative(REPO, sf.fileName).split(path.sep).join('/');
const where = (node) => {
  const sf = node.getSourceFile();
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
  return `${rel(sf)}:${line + 1}`;
};
class TransError extends Error {}
const fail = (node, msg) => {
  throw new TransError(`${where(node)}: ${msg}\n    ${node.getText().slice(0, 160)}`);
};

// --------------------------------------------------------------------------- types
const F = ts.TypeFlags;
const nonNull = (t) => (t.isUnion() ? checker.getNonNullableType(t) : t);
const isNullable = (t) => t.isUnion() && t.types.some((u) => u.flags & (F.Null | F.Undefined | F.Void));
const typeOf = (node) => checker.getTypeAtLocation(node);
const isNum = (t) => {
  t = nonNull(t);
  if (t.isUnion()) return t.types.every((u) => u.flags & F.NumberLike);
  return !!(t.flags & F.NumberLike);
};
const isBool = (t) => {
  t = nonNull(t);
  if (t.isUnion()) return t.types.every((u) => u.flags & F.BooleanLike);
  return !!(t.flags & F.BooleanLike);
};
const isStr = (t) => {
  t = nonNull(t);
  if (t.isUnion()) return t.types.every((u) => u.flags & F.StringLike);
  return !!(t.flags & F.StringLike);
};
const isPrim = (t) => isNum(t) || isBool(t) || isStr(t);
const symName = (t) => {
  t = nonNull(t);
  const s = t.getSymbol() ?? t.aliasSymbol;
  return s ? s.getName() : '';
};
const isV3 = (t) => symName(t) === 'Vector3';
const TYPED = new Set(['Float64Array', 'Float32Array', 'Int8Array', 'Int16Array', 'Int32Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Uint8ClampedArray']);
const typedKind = (t) => {
  t = nonNull(t);
  if (t.isIntersection()) {
    for (const u of t.types) if (TYPED.has(symName(u))) return symName(u);
    return '';
  }
  return TYPED.has(symName(t)) ? symName(t) : '';
};
const isArr = (t) => {
  t = nonNull(t);
  if (t.isUnion()) return t.types.every((u) => isArr(u));
  return checker.isArrayType(t) || checker.isTupleType(t) || symName(t) === 'ReadonlyArray';
};
const isList = (t) => isArr(t) || !!typedKind(t);
const isMap = (t) => ['Map', 'ReadonlyMap'].includes(symName(t));
const isSet = (t) => ['Set', 'ReadonlySet'].includes(symName(t));
/** A Record<string, X> (an index signature and nothing else): any key may be missing. */
const isKeyed = (t) => !!nonNull(t).getStringIndexType?.() && !nonNull(t).getProperties().length && !isList(t);
const isAny = (t) => !!(t.flags & (F.Any | F.Unknown));
/** The class declaration (in translated code) a type is an instance of, if any. */
const classDeclOf = (t) => {
  t = nonNull(t);
  const s = t.getSymbol();
  if (!s) return null;
  const d = s.valueDeclaration ?? s.declarations?.[0];
  return d && ts.isClassDeclaration(d) ? d : null;
};
const isFn = (t) => {
  t = nonNull(t);
  return t.getCallSignatures().length > 0 && !classDeclOf(t);
};
/** Values that live by reference: compared with is_same. */
const isRefType = (t) => !isPrim(t) && !(t.flags & (F.Null | F.Undefined));
const isClassInstance = (t) => !!classDeclOf(t) || isV3(t);

function moduleOf(sf) {
  return MODULES.get(rel(sf));
}
/** GDScript type annotation for a TS type, or '' to leave it untyped (Variant). */
/** The default a constructor parameter of GDScript type `ann` gets for a blank instance. */
function blankValue(ann) {
  if (ann === 'float') return '0.0';
  if (ann === 'int') return '0';
  if (ann === 'bool') return 'false';
  if (ann === 'String') return '""';
  if (ann === 'Dictionary') return '{}';
  if (ann.startsWith('Array')) return '[]';
  if (ann.startsWith('Packed')) return `${ann}()`;
  return 'null';
}

function gdType(t, { nullableOk = true } = {}) {
  if (isAny(t)) return '';
  const nullable = isNullable(t);
  if (isNum(t)) return nullable ? '' : 'float';
  if (isBool(t)) return nullable ? '' : 'bool';
  if (isStr(t)) return nullable ? '' : 'String';
  if (isV3(t)) return 'V3';
  const cd0 = classDeclOf(t);
  if (cd0) {
    const m = moduleOf(cd0.getSourceFile());
    if (m) return `${m}.${cd0.name.text}`;
  }
  if (nullable) return '';
  const tk = typedKind(t);
  if (tk === 'Float64Array') return 'PackedFloat64Array';
  if (tk === 'Float32Array') return 'PackedFloat32Array';
  if (tk) return 'Array';
  if (isArr(t)) return 'Array';
  if (isMap(t) || isSet(t)) return 'Dictionary';
  const cd = classDeclOf(t);
  if (cd) {
    const m = moduleOf(cd.getSourceFile());
    if (m) return `${m}.${cd.name.text}`;
  }
  return '';
}

// --------------------------------------------------------------------------- literals
function num(v) {
  return exactLit(v);
}
const strLit = (s) => JSON.stringify(s);

// --------------------------------------------------------------------------- module index
/** Top-level declarations of a module, by name. */
function isTopLevel(decl) {
  let n = decl;
  if (ts.isVariableDeclaration(n)) n = n.parent.parent; // VariableStatement
  return n.parent && ts.isSourceFile(n.parent);
}
/** A top-level `const f = (...) => ...` becomes a static func. */
function isConstFn(decl) {
  return (
    ts.isVariableDeclaration(decl) &&
    isTopLevel(decl) &&
    decl.initializer &&
    (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) &&
    decl.parent.flags & ts.NodeFlags.Const
  );
}

// --------------------------------------------------------------------------- emitter
const PURE_KINDS = new Set([ts.SyntaxKind.Identifier, ts.SyntaxKind.ThisKeyword, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword]);
function isPure(node) {
  node = skipOuter(node);
  if (PURE_KINDS.has(node.kind)) return true;
  if (ts.isPropertyAccessExpression(node)) return isPure(node.expression);
  if (ts.isElementAccessExpression(node)) return isPure(node.expression) && isPure(node.argumentExpression);
  if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.ExclamationToken)) return isPure(node.operand);
  return false;
}
function skipOuter(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression?.(node) || ts.isSatisfiesExpression?.(node)) node = node.expression;
  return node;
}

const FN_KINDS = new Set([ts.SyntaxKind.FunctionDeclaration, ts.SyntaxKind.FunctionExpression, ts.SyntaxKind.ArrowFunction, ts.SyntaxKind.MethodDeclaration, ts.SyntaxKind.Constructor, ts.SyntaxKind.GetAccessor, ts.SyntaxKind.SetAccessor]);
const enclosingFn = (node) => {
  let n = node.parent;
  while (n && !FN_KINDS.has(n.kind) && !ts.isSourceFile(n) && !ts.isPropertyDeclaration(n) && !ts.isClassStaticBlockDeclaration?.(n)) n = n.parent;
  return n;
};

class Scope {
  constructor(parent = null) {
    this.parent = parent;
    this.names = new Map(); // symbol -> gd name
    this.used = parent ? parent.used : new Set(); // gd names used in this top-level function
    this.boxed = parent ? parent.boxed : new Set(); // symbols boxed into [x]
    this.tmp = parent ? parent.tmp : { n: 0 };
  }
  lookup(sym) {
    for (let s = this; s; s = s.parent) if (s.names.has(sym)) return s.names.get(sym);
    return null;
  }
}

class ModuleEmitter {
  constructor(sf, cls) {
    this.sf = sf;
    this.cls = cls;
    this.lines = [];
    this.staticInit = []; // lines for _static_init
    this.helpers = []; // extra static funcs (initialisers)
    this.helperN = 0;
    this.initScope = new Scope(); // __init_module's locals: one namespace for every initialiser
    this.override = new Map(); // node -> already emitted text (links of an optional chain)
    this.intVars = new Set(); // for-loop counters kept as GDScript ints (intCounter)
  }

  /** a?.b.c(d)?.[e]: evaluated link by link, the whole chain is null once a guarded link is. */
  optChain(node, ctx, asStatement) {
    const links = [];
    let n = node;
    while (true) {
      links.push(n);
      const inner = skipOuter(n.expression);
      if (isChainLink(inner) && inner.flags & ts.NodeFlags.OptionalChain) n = inner;
      else break;
    }
    links.reverse();
    let cur = this.expr(links[0].expression, ctx);
    const guards = [];
    const c2 = { ...ctx, inChain: true };
    for (const link of links) {
      if (link.questionDotToken) {
        if (!/^[A-Za-z_]\w*((\.\w+)|(\[[\w.]+\])|(\.get\("\w+"\)))*$/.test(cur)) {
          if (ctx.cond) fail(link, '?. on an expression with side effects inside a condition');
          const t = this.newTmp(ctx.scope);
          // computed only when the links before it were not null
          ctx.pre.push(guards.length ? `var ${t} = (${cur} if ${guards.join(' and ')} else null)` : `var ${t} = ${cur}`);
          guards.length = 0;
          cur = t;
        }
        guards.push(`${cur} != null`);
      }
      this.override.set(link.expression, cur);
      try {
        cur = this.expr(link, c2);
      } finally {
        this.override.delete(link.expression);
      }
    }
    if (asStatement) return guards.length ? [`if ${guards.join(' and ')}:`, `\t${cur}`] : [cur];
    return guards.length ? `(${cur} if ${guards.join(' and ')} else null)` : cur;
  }

  // ----------------------------------------------------------------- symbols
  symOf(node) {
    let s = checker.getSymbolAtLocation(node);
    if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
    return s;
  }
  declOf(sym) {
    return sym?.valueDeclaration ?? sym?.declarations?.[0];
  }

  /** Expression for a reference to a top-level declaration or an external stand-in. */
  topRef(decl, name) {
    const sf = decl.getSourceFile();
    const r = rel(sf);
    if (EXTERNAL.has(r)) {
      const ext = EXTERNAL.get(r);
      if (!(name in ext)) fail(decl, `no stand-in for ${name} from ${r}`);
      return ext[name];
    }
    if (r.endsWith('three.d.ts')) {
      if (name === 'Vector3') return 'V3';
      fail(decl, `three.${name} has no stand-in`);
    }
    const m = moduleOf(sf);
    if (!m) fail(decl, `${name} comes from ${r}, which is not translated (add it to modules.json)`);
    return `${m}.${gd(name)}`;
  }

  // ----------------------------------------------------------------- scopes
  /** Assign unique local names for every declaration inside a function (and its closures). */
  prepareFunction(fnNode, scope) {
    const declare = (nameNode) => {
      if (ts.isIdentifier(nameNode)) {
        const sym = checker.getSymbolAtLocation(nameNode);
        if (!sym || scope.names.has(sym)) return;
        let base = gd(nameNode.text);
        let n = base, i = 2;
        while (scope.used.has(n)) n = `${base}_${i++}`;
        scope.used.add(n);
        scope.names.set(sym, n);
      } else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
        for (const el of nameNode.elements) if (!ts.isOmittedExpression(el)) declare(el.name);
      }
    };
    const locals = new Set();
    const visit = (n) => {
      if (ts.isParameter(n)) declare(n.name);
      else if (ts.isVariableDeclaration(n)) declare(n.name);
      else if (ts.isFunctionDeclaration(n) && n !== fnNode && n.name) declare(n.name);
      else if (ts.isCatchClause(n) && n.variableDeclaration) declare(n.variableDeclaration.name);
      if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) return;
      ts.forEachChild(n, visit);
    };
    visit(fnNode);
    for (const s of scope.names.keys()) locals.add(s);
    // box variables that a closure captures and that are written after capture
    const info = new Map();
    const scan = (n) => {
      if (ts.isIdentifier(n)) {
        const sym = checker.getSymbolAtLocation(n);
        if (sym && locals.has(sym)) {
          const e = info.get(sym) ?? { closures: [], writes: [], declFn: null };
          const d = this.declOf(sym);
          if (!e.declFn && d) e.declFn = ts.isParameter(d) ? d.parent : enclosingFn(d);
          const myFn = enclosingFn(n);
          const write = isWriteTarget(n);
          if (e.declFn && myFn !== e.declFn && !(ts.isFunctionDeclaration(d) && d.name === n)) {
            // the outermost closure (inside the declaring function) that holds this reference
            let c = myFn;
            while (c && enclosingFn(c) !== e.declFn) c = enclosingFn(c);
            e.closures.push(c ?? myFn);
            if (write) e.writes.push({ node: n, inClosure: true });
          } else if (write) e.writes.push({ node: n, inClosure: false });
          info.set(sym, e);
        }
      }
      ts.forEachChild(n, scan);
    };
    scan(fnNode);
    const loopOf = (n, stop) => {
      const loops = [];
      for (let p = n.parent; p && p !== stop; p = p.parent) if (ts.isIterationStatement(p, false)) loops.push(p);
      return loops;
    };
    for (const [sym, e] of info) {
      const d = this.declOf(sym);
      if (!e.closures.length || !e.writes.length || !d || ts.isFunctionDeclaration(d)) continue;
      const box = e.writes.some((w) => {
        if (w.inClosure) return true;
        return e.closures.some((c) => {
          if (w.node.pos > c.pos) return true;
          const lw = loopOf(w.node, e.declFn);
          return loopOf(c, e.declFn).some((l) => lw.includes(l));
        });
      });
      if (box) scope.boxed.add(sym);
    }
  }

  newTmp(scope, base = 't') {
    let n;
    do n = `__${base}${++scope.tmp.n}`;
    while (scope.used.has(n));
    scope.used.add(n);
    return n;
  }

  // ----------------------------------------------------------------- module
  emit() {
    const out = this.lines;
    out.push(`## Translated from ${rel(this.sf)} by godot/tools/ts2gd. Do not edit: change the TypeScript and re-run.`);
    out.push(`class_name ${this.cls}`);
    out.push('extends RefCounted');
    out.push('');
    // Every static is set by __init_module, which TInit.run() calls in the order JavaScript
    // evaluates the modules (Godot's own static initialisers run in load order, which differs).
    this.deferStatics = true;
    for (const st of this.sf.statements) this.emitTop(st);
    out.push('');
    out.push('static func __init_module() -> void:');
    if (!this.staticInit.length) out.push('\tpass');
    for (const l of this.staticInit) out.push('\t' + l);
    for (const h of this.helpers) {
      out.push('');
      for (const l of h) out.push(l);
    }
    return out.join('\n') + '\n';
  }

  isTopStatement(st) {
    return !(
      ts.isImportDeclaration(st) ||
      ts.isExportDeclaration(st) ||
      ts.isInterfaceDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) ||
      ts.isEnumDeclaration(st) ||
      ts.isFunctionDeclaration(st) ||
      ts.isClassDeclaration(st) ||
      ts.isVariableStatement(st) ||
      ts.isModuleDeclaration(st) ||
      ts.isEmptyStatement(st)
    );
  }

  emitTop(st) {
    const out = this.lines;
    if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEmptyStatement(st) || ts.isModuleDeclaration(st)) return;
    if (ts.isEnumDeclaration(st)) {
      // members are inlined as constants; a runtime object only for non-const enums
      if (!(ts.getCombinedModifierFlags(st) & ts.ModifierFlags.Const)) {
        const parts = st.members.map((m) => `${strLit(m.name.getText())}: ${this.constValue(m)}`);
        out.push(`static var ${gd(st.name.text)} = {${parts.join(', ')}}`);
      }
      return;
    }
    if (ts.isFunctionDeclaration(st)) {
      if (!st.body) return; // overload signature
      out.push('');
      for (const l of this.emitFunction(st, { kind: 'static', name: gd(st.name.text) })) out.push(l);
      return;
    }
    if (ts.isClassDeclaration(st)) {
      out.push('');
      for (const l of this.emitClass(st)) out.push(l);
      return;
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (isConstFn(d)) {
          out.push('');
          for (const l of this.emitFunction(d.initializer, { kind: 'static', name: gd(d.name.text), declNode: d })) out.push(l);
          continue;
        }
        if (!ts.isIdentifier(d.name)) fail(d, 'top-level destructuring');
        const name = gd(d.name.text);
        const t = gdType(typeOf(d.name));
        const ann = t ? `: ${t}` : '';
        if (!d.initializer) {
          out.push(`static var ${name}${ann}`);
          continue;
        }
        const scope = new Scope(this.initScope);
        this.prepareFunction(d.initializer, scope);
        const ctx = this.ctx(scope, { isStatic: true });
        if (this.isConstExpr(d.initializer) && st.declarationList.flags & ts.NodeFlags.Const) {
          out.push(`const ${name}${ann} = ${this.expr(d.initializer, ctx)}`);
          continue;
        }
        const v = this.expr(d.initializer, ctx);
        if (this.deferStatics) {
          out.push(`static var ${name}${ann}`);
          for (const l of ctx.pre) this.staticInit.push(l);
          this.staticInit.push(`${this.cls}.${name} = ${v}`);
        } else if (ctx.pre.length) {
          const h = `_init_${name}`;
          out.push(`static var ${name}${ann} = ${this.cls}.${h}()`);
          this.helpers.push([`static func ${h}():`, ...ctx.pre.map((l) => '\t' + l), `\treturn ${v}`]);
        } else {
          out.push(`static var ${name}${ann} = ${v}`);
        }
      }
      return;
    }
    // any other top-level statement runs once when the class loads, in order
    const scope = new Scope(this.initScope);
    this.prepareFunction(st, scope);
    const ctx = this.ctx(scope, { isStatic: true });
    for (const l of this.stmt(st, ctx)) this.staticInit.push(l);
  }

  isConstExpr(node) {
    node = skipOuter(node);
    if (ts.isNumericLiteral(node) || ts.isStringLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return true;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) return this.isConstExpr(node.operand);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(node.operatorToken.kind))
      return isNum(typeOf(node)) && this.isConstExpr(node.left) && this.isConstExpr(node.right);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Math' && ['PI', 'SQRT2', 'E', 'LN2', 'LN10', 'SQRT1_2'].includes(node.name.text)) return true;
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const sym = this.symOf(ts.isIdentifier(node) ? node : node.name);
      const d = this.declOf(sym);
      if (d && ts.isEnumMember(d)) return true;
      if (d && ts.isVariableDeclaration(d) && isTopLevel(d) && d.getSourceFile() === this.sf && d.parent.flags & ts.NodeFlags.Const && d.initializer && this.isConstExpr(d.initializer) && d.pos < node.pos) return true;
    }
    return false;
  }

  constValue(member) {
    const v = checker.getConstantValue(member);
    if (typeof v === 'number') return num(v);
    if (typeof v === 'string') return strLit(v);
    fail(member, 'enum member without a constant value');
  }

  ctx(scope, extra = {}) {
    return { scope, pre: [], loops: [], isStatic: false, cls: null, cond: 0, ...extra };
  }

  // ----------------------------------------------------------------- classes
  emitClass(cd) {
    const name = cd.name.text;
    const lines = [];
    let ext = 'RefCounted';
    const her = cd.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
    if (her) {
      const base = her.types[0].expression;
      ext = this.expr(base, this.ctx(new Scope()));
    }
    lines.push(`class ${name} extends ${ext}:`);
    const body = [];
    const ctor = cd.members.find((m) => ts.isConstructorDeclaration(m) && m.body);
    const fieldInits = [];
    const staticInits = [];
    for (const m of cd.members) {
      if (ts.isPropertyDeclaration(m)) {
        const fname = gd(m.name.getText());
        const isStatic = !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static);
        const t = gdType(typeOf(m.name));
        body.push(`${isStatic ? 'static ' : ''}var ${fname}${t ? ': ' + t : ''}`);
        if (m.initializer) (isStatic ? staticInits : fieldInits).push(m);
      } else if (ts.isGetAccessor(m)) {
        const fname = gd(m.name.getText());
        const setter = cd.members.find((x) => ts.isSetAccessor(x) && x.name.getText() === m.name.getText());
        const t = gdType(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(m)));
        body.push(`var ${fname}${t ? ': ' + t : ''}:`);
        const scope = new Scope();
        this.prepareFunction(m, scope);
        const ctx = this.ctx(scope, { cls: cd });
        body.push('\tget:');
        for (const l of this.block(m.body.statements, ctx)) body.push('\t\t' + l);
        if (setter) {
          const sc2 = new Scope();
          this.prepareFunction(setter, sc2);
          const c2 = this.ctx(sc2, { cls: cd });
          const p = sc2.names.get(checker.getSymbolAtLocation(setter.parameters[0].name));
          body.push(`\tset(${p}):`);
          for (const l of this.block(setter.body.statements, c2)) body.push('\t\t' + l);
        }
      }
    }
    // parameter properties
    const paramProps = ctor ? ctor.parameters.filter((p) => ts.getCombinedModifierFlags(p) & (ts.ModifierFlags.Public | ts.ModifierFlags.Private | ts.ModifierFlags.Protected | ts.ModifierFlags.Readonly)) : [];
    for (const p of paramProps) {
      const t = gdType(typeOf(p.name));
      body.push(`var ${gd(p.name.getText())}${t ? ': ' + t : ''}`);
    }
    for (const m of staticInits) {
      const scope = new Scope(this.initScope);
      this.prepareFunction(m.initializer, scope);
      const ctx = this.ctx(scope, { cls: cd, isStatic: true });
      const v = this.expr(m.initializer, ctx);
      for (const l of ctx.pre) this.staticInit.push(l);
      this.staticInit.push(`${this.classRef(cd)}.${gd(m.name.getText())} = ${v}`);
    }
    // constructor: parameter properties, field initialisers, then the body
    if (ctor || fieldInits.length) {
      body.push('');
      const scope = new Scope();
      if (ctor) this.prepareFunction(ctor, scope);
      for (const m of fieldInits) this.prepareFunction(m.initializer, scope);
      const ctx = this.ctx(scope, { cls: cd });
      const params = ctor ? this.params(ctor, ctx, 0, true) : '';
      body.push(`func _init(${params}) -> void:`);
      // (JS.BLANK, on the thread that set it: a blank instance for SimSnap to fill in, nothing run)
      const inner = ['if JS.BLANK and OS.get_thread_caller_id() == JS.BLANK_THREAD:', '\treturn'];
      let stmts = ctor ? [...ctor.body.statements] : [];
      // super(...) first
      const superIdx = stmts.findIndex((s) => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && s.expression.expression.kind === ts.SyntaxKind.SuperKeyword);
      if (superIdx >= 0) {
        for (const l of this.stmt(stmts[superIdx], ctx)) inner.push(l);
        stmts.splice(superIdx, 1);
      }
      if (ctor) for (const l of this.paramPrologue(ctor, ctx)) inner.push(l);
      for (const p of paramProps) inner.push(`self.${gd(p.name.getText())} = ${scope.lookup(checker.getSymbolAtLocation(p.name))}`);
      for (const m of fieldInits) {
        const v = this.expr(m.initializer, ctx);
        for (const l of ctx.pre.splice(0)) inner.push(l);
        inner.push(`self.${gd(m.name.getText())} = ${v}`);
      }
      for (const l of this.block(stmts, ctx)) inner.push(l);
      if (!inner.length) inner.push('pass');
      for (const l of inner) body.push('\t' + l);
    }
    for (const m of cd.members) {
      if (ts.isMethodDeclaration(m) && m.body) {
        const isStatic = !!(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static);
        body.push('');
        for (const l of this.emitFunction(m, { kind: isStatic ? 'static' : 'method', name: gd(m.name.getText()), cls: cd })) body.push(l);
      }
    }
    if (!body.length) body.push('pass');
    for (const l of body) lines.push('\t' + l);
    return lines;
  }

  // ----------------------------------------------------------------- functions
  emitFunction(fn, { kind, name, cls = null, declNode = null }) {
    const key = `${rel(this.sf)}:${cls ? cls.name.text + '.' : ''}${declNode ? declNode.name.text : fn.name?.getText?.() ?? name}`;
    const scope = new Scope();
    this.prepareFunction(fn, scope);
    const ctx = this.ctx(scope, { isStatic: kind === 'static', cls });
    const params = this.params(fn, ctx);
    const sig = checker.getSignatureFromDeclaration(fn);
    const rt = sig ? checker.getReturnTypeOfSignature(sig) : null;
    let ret = '';
    if (rt) {
      if (isVoidish(rt)) ret = ' -> void';
      else {
        const t = gdType(rt);
        if (t) ret = ` -> ${t}`;
      }
    }
    const lines = [`${kind === 'static' ? 'static ' : ''}func ${name}(${params})${ret}:`];
    if (OVERRIDES[key]) {
      for (const l of OVERRIDES[key]) lines.push('\t' + l);
      return lines;
    }
    const hoist = this.hoistable(fn, scope);
    ctx.hoist = hoist;
    const body = [];
    const hoistAt = (i) => {
      for (const h of hoist.values()) if (h.at === i) body.push(`var ${h.name}${h.ann} = ${h.ref}`);
    };
    hoistAt(-1);
    body.push(...this.paramPrologue(fn, ctx));
    if (ts.isBlock(fn.body)) {
      // (as block(), with each hoisted read just before the first statement that needs it, so an
      // early return doesn't pay for reads it never makes)
      const stmts = fn.body.statements;
      for (const st of stmts) if (ts.isFunctionDeclaration(st)) body.push(...this.localFunction(st, ctx));
      stmts.forEach((st, i) => {
        if (ts.isFunctionDeclaration(st)) return;
        hoistAt(i);
        body.push(...this.stmt(st, ctx));
      });
    } else if (ret === ' -> void') {
      body.push(...this.withPre(ctx, () => this.exprStmt(fn.body, ctx)));
    } else {
      const v = this.expr(fn.body, ctx);
      for (const l of ctx.pre.splice(0)) body.push(l);
      body.push(`return ${v}`);
    }
    if (!body.length) body.push('pass');
    for (const l of body) lines.push('\t' + l);
    return lines;
  }

  /**
   * Module-level `const` bindings a function reads more than once (or inside a loop), read once
   * into a local at its top. A static var read through its class name (`TBody._a`) costs GDScript
   * a global lookup and a named member lookup every time, several times a local read, and the
   * sim's scratch vectors and tables are read in its hottest loops. A `const` binding is never
   * reassigned after the module's init, so the local always holds the same object or value.
   */
  hoistable(fn, scope) {
    const weight = new Map();
    // the top-level statement each is first read in (-1: the parameters, a nested function
    // declaration, which is hoisted to the top, or an expression body)
    const first = new Map();
    let at = -1;
    const loopKinds = new Set([ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.ForInStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement]);
    const visit = (n, inLoop) => {
      if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) {
        let sym = checker.getSymbolAtLocation(n);
        if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
        const decl = sym && this.declOf(sym);
        if (decl && decl !== n.parent && this.isHoistable(decl)) {
          weight.set(sym, (weight.get(sym) ?? 0) + (inLoop ? 2 : 1));
          if (!first.has(sym)) first.set(sym, at);
        }
      }
      const loop = inLoop || loopKinds.has(n.kind);
      ts.forEachChild(n, (c) => visit(c, loop));
    };
    for (const p of fn.parameters) visit(p, false);
    if (fn.body && ts.isBlock(fn.body)) {
      fn.body.statements.forEach((st, i) => {
        at = ts.isFunctionDeclaration(st) ? -1 : i;
        visit(st, false);
      });
    } else if (fn.body) visit(fn.body, false);
    const out = new Map();
    for (const [sym, w] of weight) {
      if (w < 2) continue;
      const decl = this.declOf(sym);
      let base = `_h${gd(sym.getName())}`, name = base, i = 2;
      while (scope.used.has(name)) name = `${base}_${i++}`;
      scope.used.add(name);
      const t = gdType(typeOf(decl.name));
      out.set(sym, { name, ann: t ? `: ${t}` : '', ref: this.topRef(decl, sym.getName()), at: first.get(sym) });
    }
    return out;
  }

  isHoistable(decl) {
    if (!ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name) || !isTopLevel(decl) || isConstFn(decl)) return false;
    if (!(decl.parent.flags & ts.NodeFlags.Const) || !decl.initializer) return false;
    // compile-time constants are GDScript consts already, free to read
    if (this.isConstExpr(decl.initializer)) return false;
    const r = rel(decl.getSourceFile());
    return !EXTERNAL.has(r) && !r.endsWith('three.d.ts') && !!moduleOf(decl.getSourceFile());
  }

  params(fn, ctx, padTo = 0, blank = false) {
    const ps = fn.parameters.map((p, i) => {
      if (p.dotDotDotToken) fail(p, 'rest parameters');
      let nm;
      if (ts.isIdentifier(p.name)) nm = ctx.scope.lookup(checker.getSymbolAtLocation(p.name));
      else nm = `__p${i}`;
      const t = typeOf(p);
      let ann = p.questionToken && !p.initializer ? '' : gdType(t);
      if (p.initializer) {
        // defaults must be constant-ish; anything else is resolved in the prologue
        if (this.isConstExpr(p.initializer) || skipOuter(p.initializer).kind === ts.SyntaxKind.NullKeyword) {
          const v = this.expr(p.initializer, this.ctx(ctx.scope));
          if (v === 'null') ann = '';
          return `${nm}${ann ? ': ' + ann : ''} = ${v}`;
        }
        return `${nm} = null`;
      }
      if (p.questionToken) return `${nm} = null`;
      // a constructor's parameters all have defaults, so SimSnap can make a blank instance
      if (blank) return `${nm}${ann ? ': ' + ann : ''} = ${blankValue(ann)}`;
      return `${nm}${ann ? ': ' + ann : ''}`;
    });
    while (ps.length < padTo) ps.push(`_a${ps.length} = null`);
    return ps.join(', ');
  }

  /** Non-constant defaults, destructured parameters and boxed parameters. */
  paramPrologue(fn, ctx) {
    const out = [];
    fn.parameters.forEach((p, i) => {
      if (ts.isIdentifier(p.name)) {
        const sym = checker.getSymbolAtLocation(p.name);
        const nm = ctx.scope.lookup(sym);
        if (p.initializer && !(this.isConstExpr(p.initializer) || skipOuter(p.initializer).kind === ts.SyntaxKind.NullKeyword)) {
          const v = this.expr(p.initializer, ctx);
          for (const l of ctx.pre.splice(0)) out.push(l);
          out.push(`if ${nm} == null:`);
          out.push(`\t${nm} = ${v}`);
        }
        if (ctx.scope.boxed.has(sym)) out.push(`${nm} = [${nm}]`);
      } else {
        for (const l of this.destructure(p.name, `__p${i}`, ctx)) out.push(l);
      }
    });
    return out;
  }

  destructure(pattern, src, ctx) {
    const out = [];
    if (ts.isArrayBindingPattern(pattern)) {
      pattern.elements.forEach((el, i) => {
        if (ts.isOmittedExpression(el)) return;
        if (el.dotDotDotToken) {
          out.push(...this.bind(el.name, `${src}.slice(${i})`, ctx));
          return;
        }
        let v = `${src}[${i}]`;
        if (el.initializer) v = `(${src}[${i}] if ${src}.size() > ${i} and ${src}[${i}] != null else ${this.expr(el.initializer, ctx)})`;
        out.push(...this.bind(el.name, v, ctx));
      });
    } else {
      for (const el of pattern.elements) {
        if (el.dotDotDotToken) fail(el, 'object rest in destructuring');
        const key = gd((el.propertyName ?? el.name).getText());
        let v = `${src}.${key}`;
        if (el.initializer) v = `JS.get_field(${src}, &${strLit(key)})`;
        if (el.initializer) {
          const t = this.newTmp(ctx.scope);
          out.push(`var ${t} = ${v}`);
          v = `(${t} if ${t} != null else ${this.expr(el.initializer, ctx)})`;
        }
        out.push(...this.bind(el.name, v, ctx));
      }
    }
    return out;
  }

  bind(name, value, ctx) {
    if (ts.isIdentifier(name)) {
      const sym = checker.getSymbolAtLocation(name);
      const nm = ctx.scope.lookup(sym);
      const t = gdType(typeOf(name));
      if (ctx.scope.boxed.has(sym)) return [`var ${nm} = [${value}]`];
      return [`var ${nm}${t ? ': ' + t : ''} = ${value}`];
    }
    const t = this.newTmp(ctx.scope);
    return [`var ${t} = ${value}`, ...this.destructure(name, t, ctx)];
  }

  // ----------------------------------------------------------------- statements
  block(stmts, ctx, { fnBody = false } = {}) {
    const out = [];
    // nested function declarations are hoisted (as lambdas) to the top of their block
    for (const s of stmts) if (ts.isFunctionDeclaration(s)) out.push(...this.localFunction(s, ctx));
    for (const s of stmts) if (!ts.isFunctionDeclaration(s)) out.push(...this.stmt(s, ctx));
    return out;
  }

  localFunction(fd, ctx) {
    const nm = ctx.scope.lookup(checker.getSymbolAtLocation(fd.name));
    const lam = this.lambdaLines(fd, ctx);
    return [`var ${nm} = ${lam[0]}`, ...lam.slice(1)];
  }

  stmts(node, ctx) {
    if (ts.isBlock(node)) {
      const b = this.block(node.statements, ctx);
      return b.length ? b : ['pass'];
    }
    const b = this.stmt(node, ctx);
    return b.length ? b : ['pass'];
  }

  withPre(ctx, fn) {
    const saved = ctx.pre;
    ctx.pre = [];
    const lines = fn();
    const pre = ctx.pre;
    ctx.pre = saved;
    return [...pre, ...lines];
  }

  stmt(node, ctx) {
    const K = ts.SyntaxKind;
    switch (node.kind) {
      case K.VariableStatement: {
        const out = [];
        for (const d of node.declarationList.declarations) {
          out.push(
            ...this.withPre(ctx, () => {
              if (!d.initializer) {
                if (!ts.isIdentifier(d.name)) fail(d, 'destructuring without initializer');
                const sym = checker.getSymbolAtLocation(d.name);
                const nm = ctx.scope.lookup(sym);
                const t = gdType(typeOf(d.name));
                if (ctx.scope.boxed.has(sym)) return [`var ${nm} = [null]`];
                return [`var ${nm}${t ? ': ' + t : ''}`];
              }
              const v = this.expr(d.initializer, ctx);
              return this.bind(d.name, v, ctx);
            }),
          );
        }
        return out;
      }
      case K.ExpressionStatement:
        return this.withPre(ctx, () => this.exprStmt(node.expression, ctx));
      case K.ReturnStatement:
        return this.withPre(ctx, () => {
          if (!node.expression) return ['return'];
          const fn = enclosingFn(node);
          const sig = fn && FN_KINDS.has(fn.kind) ? checker.getSignatureFromDeclaration(fn) : null;
          const rt = sig ? checker.getReturnTypeOfSignature(sig) : null;
          if ((rt && isVoidish(rt)) || ts.isConstructorDeclaration(fn)) {
            const e = this.exprStmt(node.expression, ctx);
            return [...e, 'return'];
          }
          return [`return ${this.expr(node.expression, ctx)}`];
        });
      case K.IfStatement: {
        const out = [];
        let n = node;
        let first = true;
        while (true) {
          const c = this.withPreCond(ctx, n.expression);
          if (c.pre.length && !first) {
            // a later condition needs statements: nest it under else
            out.push('else:');
            for (const l of this.stmt(n, ctx)) out.push('\t' + l);
            return out;
          }
          out.push(...c.pre);
          out.push(`${first ? 'if' : 'elif'} ${c.cond}:`);
          for (const l of this.stmts(n.thenStatement, ctx)) out.push('\t' + l);
          first = false;
          if (!n.elseStatement) break;
          if (ts.isIfStatement(n.elseStatement)) {
            n = n.elseStatement;
            continue;
          }
          out.push('else:');
          for (const l of this.stmts(n.elseStatement, ctx)) out.push('\t' + l);
          break;
        }
        return out;
      }
      case K.Block: {
        const b = this.block(node.statements, ctx);
        if (!b.length) return [];
        return ['if true:', ...b.map((l) => '\t' + l)];
      }
      case K.ForStatement:
        return this.forStmt(node, ctx);
      case K.ForOfStatement:
        return this.forOf(node, ctx);
      case K.ForInStatement: {
        return this.withPre(ctx, () => {
          const src = this.expr(node.expression, ctx);
          const d = node.initializer.declarations[0];
          const nm = ctx.scope.lookup(checker.getSymbolAtLocation(d.name));
          ctx.loops.push({ incr: [] });
          const body = this.stmts(node.statement, ctx);
          ctx.loops.pop();
          return [`for ${nm} in JS.keys(${src}):`, ...body.map((l) => '\t' + l)];
        });
      }
      case K.WhileStatement: {
        const c = this.withPreCond(ctx, node.expression);
        ctx.loops.push({ incr: [] });
        const body = this.stmts(node.statement, ctx);
        ctx.loops.pop();
        if (c.pre.length) return ['while true:', ...c.pre.map((l) => '\t' + l), `\tif not (${c.cond}):`, '\t\tbreak', ...body.map((l) => '\t' + l)];
        return [`while ${c.cond}:`, ...body.map((l) => '\t' + l)];
      }
      case K.DoStatement: {
        if (containsContinue(node.statement)) fail(node, 'continue inside do-while');
        const c = this.withPreCond(ctx, node.expression);
        ctx.loops.push({ incr: [] });
        const body = this.stmts(node.statement, ctx);
        ctx.loops.pop();
        return ['while true:', ...body.map((l) => '\t' + l), ...c.pre.map((l) => '\t' + l), `\tif not (${c.cond}):`, '\t\tbreak'];
      }
      case K.BreakStatement:
        if (node.label) fail(node, 'labelled break');
        return ['break'];
      case K.ContinueStatement: {
        if (node.label) fail(node, 'labelled continue');
        const loop = ctx.loops[ctx.loops.length - 1];
        if (loop && 'pseudo' in loop) {
          if (!loop.pseudo) fail(node, 'continue inside a switch case');
          return [`${loop.pseudo} = true`, 'break'];
        }
        return [...(loop ? loop.incr : []), 'continue'];
      }
      case K.SwitchStatement:
        return this.switchStmt(node, ctx);
      case K.EmptyStatement:
        return [];
      case K.ThrowStatement:
        return this.withPre(ctx, () => [`push_error(str(${this.expr(node.expression, ctx)}))`, 'assert(false)']);
      case K.FunctionDeclaration:
        return this.localFunction(node, ctx);
      default:
        fail(node, `statement ${K[node.kind]}`);
    }
  }

  withPreCond(ctx, e) {
    const saved = ctx.pre;
    ctx.pre = [];
    const cond = this.cond(e, ctx);
    const pre = ctx.pre;
    ctx.pre = saved;
    return { cond, pre };
  }

  /**
   * `for (let i = 0; i < n; i++)` whose counter nothing else writes (nor a closure keeps): the
   * counter is a GDScript int, read as itself where it indexes a list or is compared and as
   * float(i) everywhere else, so every result stays bit-identical while list reads skip the
   * float-to-int index conversion (several times faster in GDScript).
   */
  intCounter(node) {
    const init = node.initializer;
    if (!init || !ts.isVariableDeclarationList(init) || init.declarations.length !== 1) return null;
    const d = init.declarations[0];
    if (!ts.isIdentifier(d.name) || !d.initializer || !ts.isNumericLiteral(d.initializer)) return null;
    const start = Number(d.initializer.text);
    if (!Number.isInteger(start) || start < 0) return null;
    const sym = checker.getSymbolAtLocation(d.name);
    const inc = node.incrementor && skipOuter(node.incrementor);
    const K = ts.SyntaxKind;
    const isSelf = (e) => ts.isIdentifier(skipOuter(e)) && checker.getSymbolAtLocation(skipOuter(e)) === sym;
    if (!inc || !((ts.isPostfixUnaryExpression(inc) || ts.isPrefixUnaryExpression(inc)) && inc.operator === K.PlusPlusToken && isSelf(inc.operand))) return null;
    let ok = true;
    const visit = (n, inFn) => {
      if (!ok) return;
      if (ts.isIdentifier(n) && checker.getSymbolAtLocation(n) === sym) {
        const p = n.parent;
        if (inFn) ok = false;
        else if ((ts.isPostfixUnaryExpression(p) || ts.isPrefixUnaryExpression(p)) && [K.PlusPlusToken, K.MinusMinusToken].includes(p.operator)) ok = false;
        else if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind >= K.FirstAssignment && p.operatorToken.kind <= K.LastAssignment) ok = false;
      }
      ts.forEachChild(n, (c) => visit(c, inFn || FN_KINDS.has(c.kind)));
    };
    if (node.condition) visit(node.condition, false);
    visit(node.statement, false);
    return ok ? { sym, start } : null;
  }

  forStmt(node, ctx) {
    const out = [];
    const ic = this.intCounter(node);
    if (ic) {
      const nm = ctx.scope.lookup(ic.sym);
      if (nm && !ctx.scope.boxed.has(ic.sym)) {
        this.intVars.add(ic.sym);
        const c = node.condition ? this.withPreCond(ctx, node.condition) : { cond: 'true', pre: [] };
        const incr = [`${nm} += 1`];
        ctx.loops.push({ incr });
        const body = this.stmts(node.statement, ctx);
        ctx.loops.pop();
        out.push(`var ${nm}: int = ${ic.start}`);
        if (c.pre.length) out.push('while true:', ...c.pre.map((l) => '\t' + l), `\tif not (${c.cond}):`, '\t\tbreak');
        else out.push(`while ${c.cond}:`);
        const endsInJump = body.length && /^(return|break|continue)\b/.test(body[body.length - 1]);
        for (const l of body) out.push('\t' + l);
        if (!endsInJump) for (const l of incr) out.push('\t' + l);
        return out;
      }
    }
    if (node.initializer) {
      if (ts.isVariableDeclarationList(node.initializer)) {
        for (const d of node.initializer.declarations) {
          out.push(
            ...this.withPre(ctx, () => {
              if (!d.initializer) {
                const nm = ctx.scope.lookup(checker.getSymbolAtLocation(d.name));
                return [`var ${nm}`];
              }
              return this.bind(d.name, this.expr(d.initializer, ctx), ctx);
            }),
          );
        }
      } else out.push(...this.withPre(ctx, () => this.exprStmt(node.initializer, ctx)));
    }
    const incr = node.incrementor ? this.withPre(ctx, () => this.exprStmt(node.incrementor, ctx)) : [];
    const c = node.condition ? this.withPreCond(ctx, node.condition) : { cond: 'true', pre: [] };
    ctx.loops.push({ incr });
    const body = this.stmts(node.statement, ctx);
    ctx.loops.pop();
    if (c.pre.length) {
      out.push('while true:', ...c.pre.map((l) => '\t' + l), `\tif not (${c.cond}):`, '\t\tbreak');
    } else out.push(`while ${c.cond}:`);
    const endsInJump = body.length && /^(return|break|continue)\b/.test(body[body.length - 1]);
    for (const l of body) out.push('\t' + l);
    if (!endsInJump) for (const l of incr) out.push('\t' + l);
    return out;
  }

  forOf(node, ctx) {
    return this.withPre(ctx, () => {
      const t = typeOf(node.expression);
      let src = this.expr(node.expression, ctx);
      const e = skipOuter(node.expression);
      // map.entries()/keys()/values(), Object.entries(...)
      let pairs = false;
      if (isMap(t)) pairs = true;
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
        const recvT = typeOf(e.expression.expression);
        const m = e.expression.name.text;
        if ((isMap(recvT) || isSet(recvT)) && ['entries', 'keys', 'values'].includes(m)) {
          const r = this.expr(e.expression.expression, ctx);
          if (m === 'entries') {
            src = r;
            pairs = isMap(recvT);
          } else src = m === 'keys' || isSet(recvT) ? `${r}.keys()` : `${r}.values()`;
        }
      } else if (isSet(t)) src = `${src}.keys()`;
      const d = node.initializer.declarations ? node.initializer.declarations[0] : null;
      if (!d) fail(node, 'for-of without declaration');
      ctx.loops.push({ incr: [] });
      const body = this.stmts(node.statement, ctx);
      ctx.loops.pop();
      if (pairs) {
        if (!ts.isArrayBindingPattern(d.name)) fail(node, 'iterating a Map needs [k, v]');
        const k = this.newTmp(ctx.scope, 'k');
        const els = d.name.elements;
        const lines = [`for ${k} in ${src}:`];
        if (els[0] && !ts.isOmittedExpression(els[0])) lines.push(...this.bind(els[0].name, k, ctx).map((l) => '\t' + l));
        if (els[1] && !ts.isOmittedExpression(els[1])) lines.push(...this.bind(els[1].name, `${src}[${k}]`, ctx).map((l) => '\t' + l));
        return [...lines, ...body.map((l) => '\t' + l)];
      }
      if (ts.isIdentifier(d.name)) {
        const sym = checker.getSymbolAtLocation(d.name);
        const nm = ctx.scope.lookup(sym);
        if (ctx.scope.boxed.has(sym)) {
          const it = this.newTmp(ctx.scope, 'it');
          return [`for ${it} in ${src}:`, `\tvar ${nm} = [${it}]`, ...body.map((l) => '\t' + l)];
        }
        const tt = gdType(typeOf(d.name));
        if (tt && tt !== 'float') return [`for ${nm}: ${tt} in ${src}:`, ...body.map((l) => '\t' + l)];
        return [`for ${nm} in ${src}:`, ...body.map((l) => '\t' + l)];
      }
      const it = this.newTmp(ctx.scope, 'it');
      return [`for ${it} in ${src}:`, ...this.destructure(d.name, it, ctx).map((l) => '\t' + l), ...body.map((l) => '\t' + l)];
    });
  }

  switchStmt(node, ctx) {
    const out = [];
    let disc = this.expr(node.expression, ctx);
    out.push(...ctx.pre.splice(0));
    if (!isPure(node.expression)) {
      const t = this.newTmp(ctx.scope, 's');
      out.push(`var ${t} = ${disc}`);
      disc = t;
    }
    const clauses = node.caseBlock.clauses;
    const groups = [];
    let cur = { tests: [], isDefault: false, body: [] };
    for (const c of clauses) {
      if (ts.isDefaultClause(c)) cur.isDefault = true;
      else cur.tests.push(c.expression);
      if (c.statements.length) {
        cur.body = c.statements;
        groups.push(cur);
        cur = { tests: [], isDefault: false, body: [] };
      }
    }
    if (cur.tests.length || cur.isDefault) groups.push(cur);
    let first = true;
    const defaults = groups.filter((g) => g.isDefault);
    const ordered = [...groups.filter((g) => !g.isDefault), ...defaults];
    for (const g of ordered) {
      let stmts = [...g.body];
      if (stmts.length === 1 && ts.isBlock(stmts[0])) stmts = [...stmts[0].statements];
      const last = stmts[stmts.length - 1];
      if (last && ts.isBreakStatement(last)) stmts.pop();
      else if (last && !(ts.isReturnStatement(last) || ts.isThrowStatement(last) || ts.isContinueStatement(last)) && g !== groups[groups.length - 1]) {
        if (!(ts.isBlock(last) && endsInJumpNode(last))) fail(last, 'switch case falls through');
      }
      let body;
      if (stmts.some((s) => containsSwitchBreak(s))) {
        // a break part-way through a case: run the case in a one-pass loop so break leaves it
        const outer = ctx.loops[ctx.loops.length - 1];
        const flag = stmts.some((s) => containsContinue(s)) ? this.newTmp(ctx.scope, 'c') : null;
        ctx.loops.push({ incr: [], pseudo: flag });
        const inner = this.block(stmts, ctx);
        ctx.loops.pop();
        body = [];
        if (flag) body.push(`var ${flag} = false`);
        body.push('while true:', ...inner.map((l) => '\t' + l), '\tbreak');
        if (flag) body.push(`if ${flag}:`, ...(outer ? outer.incr : []).map((l) => '\t' + l), '\tcontinue');
      } else body = this.block(stmts, ctx);
      if (g.isDefault && !g.tests.length) {
        if (first) out.push('if true:');
        else out.push('else:');
      } else {
        const tests = g.tests.map((t) => `${disc} == ${this.expr(t, ctx)}`).join(' or ');
        out.push(`${first ? 'if' : 'elif'} ${tests}:`);
      }
      first = false;
      for (const l of body.length ? body : ['pass']) out.push('\t' + l);
    }
    return out;
  }

  // ----------------------------------------------------------------- expression statements
  exprStmt(e, ctx) {
    e = skipOuter(e);
    const K = ts.SyntaxKind;
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === K.CommaToken) return [...this.exprStmt(e.left, ctx), ...this.exprStmt(e.right, ctx)];
      if (op >= K.FirstAssignment && op <= K.LastAssignment) return this.assign(e, ctx);
      if (op === K.AmpersandAmpersandToken || op === K.BarBarToken || op === K.QuestionQuestionToken) {
        // `a && b()` as a statement
        const c = op === K.QuestionQuestionToken ? `${this.expr(e.left, ctx)} == null` : op === K.AmpersandAmpersandToken ? this.cond(e.left, ctx) : `not (${this.cond(e.left, ctx)})`;
        const pre = ctx.pre.splice(0);
        const body = this.withPre(ctx, () => this.exprStmt(e.right, ctx));
        return [...pre, `if ${c}:`, ...body.map((l) => '\t' + l)];
      }
    }
    if (ts.isPostfixUnaryExpression(e) || (ts.isPrefixUnaryExpression(e) && (e.operator === K.PlusPlusToken || e.operator === K.MinusMinusToken))) {
      const t = this.lvalue(e.operand, ctx);
      return [`${t} ${e.operator === K.PlusPlusToken ? '+=' : '-='} 1.0`];
    }
    if (ts.isConditionalExpression(e)) {
      const c = this.cond(e.condition, ctx);
      const pre = ctx.pre.splice(0);
      const a = this.withPre(ctx, () => this.exprStmt(e.whenTrue, ctx));
      const b = this.withPre(ctx, () => this.exprStmt(e.whenFalse, ctx));
      return [...pre, `if ${c}:`, ...a.map((l) => '\t' + l), 'else:', ...b.map((l) => '\t' + l)];
    }
    if (ts.isDeleteExpression(e)) {
      const x = skipOuter(e.expression);
      if (ts.isPropertyAccessExpression(x)) return [`${this.expr(x.expression, ctx)}.erase(${strLit(gd(x.name.text))})`];
      if (ts.isElementAccessExpression(x)) return [`${this.expr(x.expression, ctx)}.erase(${this.expr(x.argumentExpression, ctx)})`];
    }
    if (isChainTop(e)) {
      const lines = this.optChain(e, ctx, true);
      return [...ctx.pre.splice(0), ...lines];
    }
    const inl = this.inlineV3(e, ctx);
    if (inl) return inl;
    const v = this.expr(e, ctx);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(v) || /^-?[0-9.]+$/.test(v)) return [];
    return [v];
  }

  /**
   * A statement of Vector3 calls that each set the vector component by component and return it
   * (`v.copy(a).multiplyScalar(s).addScaledVector(b, k)`), written out as the field maths
   * V3's methods do (runtime/v3.gd), in the same order and with each argument evaluated once,
   * where its turn comes. A GDScript method call costs several times the three lines of maths,
   * and the sim makes nearly two thousand of them a step.
   */
  inlineV3(e, ctx) {
    if (!ts.isCallExpression(e)) return null;
    const links = [];
    let cur = e;
    while (ts.isCallExpression(cur) && !(cur.flags & ts.NodeFlags.OptionalChain) && ts.isPropertyAccessExpression(cur.expression) && !cur.expression.questionDotToken) {
      const recv = skipOuter(cur.expression.expression);
      const name = cur.expression.name.text;
      if (!isV3(typeOf(recv)) || !(name in V3_INLINE) || cur.arguments.length !== V3_INLINE[name].n) break;
      links.unshift({ name, args: cur.arguments });
      cur = recv;
    }
    if (!links.length || links.length !== chainLength(e)) return null;
    const out = [];
    const simple = (v) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(v) || /^-?[0-9]+(\.[0-9]+)?(e-?[0-9]+)?$/.test(v);
    const val = (node, type) => {
      const v = this.expr(node, ctx);
      out.push(...ctx.pre.splice(0));
      if (simple(v)) return v;
      const t = this.newTmp(ctx.scope, 'v');
      out.push(`var ${t}: ${type} = ${v}`);
      return t;
    };
    const r = val(cur, 'V3');
    for (const { name, args } of links) {
      const spec = V3_INLINE[name];
      const a = args.map((arg, i) => val(arg, spec.types[i]));
      out.push(...spec.emit(r, a, () => this.newTmp(ctx.scope, 'v')));
    }
    return out;
  }

  assign(e, ctx) {
    const K = ts.SyntaxKind;
    const op = e.operatorToken.kind;
    const left = skipOuter(e.left);
    if (op === K.EqualsToken && (ts.isArrayLiteralExpression(left) || ts.isObjectLiteralExpression(left))) {
      const t = this.newTmp(ctx.scope);
      const out = [`var ${t} = ${this.expr(e.right, ctx)}`];
      if (ts.isArrayLiteralExpression(left)) {
        left.elements.forEach((el, i) => {
          if (ts.isOmittedExpression(el)) return;
          out.push(`${this.lvalue(el, ctx)} = ${t}[${i}]`);
        });
      } else fail(e, 'object destructuring assignment');
      return out;
    }
    if (op === K.EqualsToken && ts.isBinaryExpression(skipOuter(e.right)) && skipOuter(e.right).operatorToken.kind === K.EqualsToken) {
      // a = b = v
      const inner = skipOuter(e.right);
      const lines = this.assign(inner, ctx);
      return [...lines, `${this.lvalue(left, ctx)} = ${this.lvalue(inner.left, ctx)}`];
    }
    if (op === K.EqualsToken && ts.isPropertyAccessExpression(left) && left.name.text === 'length' && isList(typeOf(left.expression))) {
      const r = this.expr(left.expression, ctx);
      const v = skipOuter(e.right);
      if (ts.isNumericLiteral(v) && Number(v.text) === 0) return [...ctx.pre.splice(0), `${r}.clear()`];
      return [...ctx.pre.splice(0), `${r}.resize(int(${this.expr(e.right, ctx)}))`];
    }
    if (op === K.EqualsToken && ts.isPropertyAccessExpression(left) && (typedKind(typeOf(left.expression)) || isArr(typeOf(left.expression)))) {
      const r = this.expr(left.expression, ctx);
      return [...ctx.pre.splice(0), `JS.xprop_set(${r}, ${strLit(left.name.text)}, ${this.expr(e.right, ctx)})`];
    }
    const target = this.lvalue(left, ctx);
    const rhs = this.expr(e.right, ctx);
    const pre = ctx.pre.splice(0);
    switch (op) {
      case K.EqualsToken:
        return [...pre, `${target} = ${rhs}`];
      case K.PlusEqualsToken:
        if (isStr(typeOf(e.left)) && !isStr(typeOf(e.right))) return [...pre, `${target} += JS.s(${rhs})`];
        return [...pre, `${target} += ${rhs}`];
      case K.MinusEqualsToken:
        return [...pre, `${target} -= ${rhs}`];
      case K.AsteriskEqualsToken:
        return [...pre, `${target} *= ${rhs}`];
      case K.SlashEqualsToken:
        return [...pre, `${target} /= ${rhs}`];
      case K.PercentEqualsToken:
        return [...pre, `${target} = fmod(${target}, ${rhs})`];
      case K.BarEqualsToken:
        return [...pre, `${target} = JS.bor(${target}, ${rhs})`];
      case K.AmpersandEqualsToken:
        return [...pre, `${target} = JS.band(${target}, ${rhs})`];
      case K.CaretEqualsToken:
        return [...pre, `${target} = JS.bxor(${target}, ${rhs})`];
      case K.LessThanLessThanEqualsToken:
        return [...pre, `${target} = JS.shl(${target}, ${rhs})`];
      case K.GreaterThanGreaterThanEqualsToken:
        return [...pre, `${target} = JS.shr(${target}, ${rhs})`];
      case K.GreaterThanGreaterThanGreaterThanEqualsToken:
        return [...pre, `${target} = JS.ushr(${target}, ${rhs})`];
      case K.BarBarEqualsToken:
        return [...pre, `if not (${this.truthy(target, typeOf(e.left))}):`, `\t${target} = ${rhs}`];
      case K.AmpersandAmpersandEqualsToken:
        return [...pre, `if ${this.truthy(target, typeOf(e.left))}:`, `\t${target} = ${rhs}`];
      case K.QuestionQuestionEqualsToken:
        return [...pre, `if ${target} == null:`, `\t${target} = ${rhs}`];
      default:
        fail(e, `assignment operator ${K[op]}`);
    }
  }

  lvalue(node, ctx) {
    node = skipOuter(node);
    if (ts.isIdentifier(node)) return this.ident(node, ctx);
    if (ts.isPropertyAccessExpression(node)) {
      const recv = this.expr(node.expression, ctx);
      return `${recv}.${gd(node.name.text)}`;
    }
    if (ts.isElementAccessExpression(node)) {
      return `${this.expr(node.expression, ctx)}[${this.expr(node.argumentExpression, ctx)}]`;
    }
    fail(node, 'assignment target');
  }

  // ----------------------------------------------------------------- conditions
  truthy(code, t) {
    if (isAny(t)) return `JS.truthy(${code})`;
    const nullable = isNullable(t);
    if (isBool(t)) return nullable ? `(${code} == true)` : code;
    if (isNum(t)) return nullable ? `JS.truthy(${code})` : `(${code} != 0.0)`;
    if (isStr(t)) return nullable ? `JS.truthy(${code})` : `(${code} != "")`;
    const nn = nonNull(t);
    if (nn.isUnion() && nn.types.some((u) => u.flags & (F.NumberLike | F.StringLike | F.BooleanLike))) return `JS.truthy(${code})`;
    return `(${code} != null)`;
  }

  cond(e, ctx) {
    e = skipOuter(e);
    const K = ts.SyntaxKind;
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === K.AmpersandAmpersandToken || op === K.BarBarToken) {
        const a = this.cond(e.left, ctx);
        ctx.cond++;
        const b = this.cond(e.right, ctx);
        ctx.cond--;
        return `(${a} ${op === K.AmpersandAmpersandToken ? 'and' : 'or'} ${b})`;
      }
    }
    if (ts.isPrefixUnaryExpression(e) && e.operator === K.ExclamationToken) return `(not ${this.cond(e.operand, ctx)})`;
    const t = typeOf(e);
    // a Record<string, X> read may be undefined whatever X is
    if (ts.isElementAccessExpression(e) && isKeyed(typeOf(e.expression))) return `JS.truthy(${this.expr(e, ctx)})`;
    return this.truthy(this.expr(e, ctx), t);
  }

  // ----------------------------------------------------------------- expressions
  expr(node, ctx) {
    const K = ts.SyntaxKind;
    if (this.override.has(node)) return this.override.get(node);
    if (isChainTop(node) && !ctx.inChain) return this.optChain(node, ctx, false);
    switch (node.kind) {
      case K.NumericLiteral:
        return num(Number(node.text));
      case K.StringLiteral:
      case K.NoSubstitutionTemplateLiteral:
        return strLit(node.text);
      case K.TemplateExpression: {
        const parts = [];
        if (node.head.text) parts.push(strLit(node.head.text));
        for (const span of node.templateSpans) {
          const v = this.expr(span.expression, ctx);
          parts.push(isStr(typeOf(span.expression)) && !isNullable(typeOf(span.expression)) ? `(${v})` : `JS.s(${v})`);
          if (span.literal.text) parts.push(strLit(span.literal.text));
        }
        return parts.length ? `(${parts.join(' + ')})` : '""';
      }
      case K.TrueKeyword:
        return 'true';
      case K.FalseKeyword:
        return 'false';
      case K.NullKeyword:
        return 'null';
      case K.ThisKeyword:
        return 'self';
      case K.Identifier:
        return this.ident(node, ctx);
      case K.ParenthesizedExpression:
        return `(${this.expr(node.expression, ctx)})`;
      case K.AsExpression:
      case K.NonNullExpression:
      case K.TypeAssertionExpression:
      case K.SatisfiesExpression:
        return this.expr(node.expression, ctx);
      case K.PropertyAccessExpression:
        return this.prop(node, ctx);
      case K.ElementAccessExpression:
        return this.elem(node, ctx);
      case K.CallExpression:
        return this.callExpr(node, ctx);
      case K.NewExpression:
        return this.newExpr(node, ctx);
      case K.BinaryExpression:
        return this.binary(node, ctx);
      case K.PrefixUnaryExpression:
        return this.prefix(node, ctx);
      case K.PostfixUnaryExpression: {
        if (ctx.cond) fail(node, 'x++ inside a condition');
        const t = this.newTmp(ctx.scope);
        const lv = this.lvalue(node.operand, ctx);
        ctx.pre.push(`var ${t} = ${lv}`);
        ctx.pre.push(`${lv} ${node.operator === K.PlusPlusToken ? '+=' : '-='} 1.0`);
        return t;
      }
      case K.ConditionalExpression: {
        const c = this.cond(node.condition, ctx);
        ctx.cond++;
        const a = this.expr(node.whenTrue, ctx);
        const b = this.expr(node.whenFalse, ctx);
        ctx.cond--;
        return `(${a} if ${c} else ${b})`;
      }
      case K.ArrowFunction:
      case K.FunctionExpression:
        return this.lambda(node, ctx);
      case K.ObjectLiteralExpression:
        return this.objectLit(node, ctx);
      case K.ArrayLiteralExpression:
        return this.arrayLit(node, ctx);
      case K.TypeOfExpression:
        return `JS.typeof_(${this.expr(node.expression, ctx)})`;
      case K.VoidExpression:
        return 'null';
      default:
        fail(node, `expression ${K[node.kind]}`);
    }
  }

  ident(node, ctx) {
    const t = node.text;
    if (t === 'undefined') return 'null';
    if (t === 'NaN') return 'NAN';
    if (t === 'Infinity') return 'INF';
    let sym = checker.getSymbolAtLocation(node);
    if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) sym = checker.getShorthandAssignmentValueSymbol(node.parent);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
    if (!sym) fail(node, `unknown name ${t}`);
    const local = ctx.scope.lookup(sym);
    if (local && this.intVars.has(sym)) {
      let n = node;
      while (ts.isParenthesizedExpression(n.parent)) n = n.parent;
      const p = n.parent;
      const K = ts.SyntaxKind;
      if (ts.isElementAccessExpression(p) && p.argumentExpression === n && (isList(typeOf(p.expression)) || isStr(typeOf(p.expression)))) return local;
      if (ts.isBinaryExpression(p) && [K.LessThanToken, K.LessThanEqualsToken, K.GreaterThanToken, K.GreaterThanEqualsToken].includes(p.operatorToken.kind)) return local;
      return `float(${local})`;
    }
    if (local) return ctx.scope.boxed.has(sym) ? `${local}[0]` : local;
    const h = ctx.hoist?.get(sym);
    if (h) return h.name;
    const decl = this.declOf(sym);
    if (!decl) {
      if (t === 'Math' || t === 'Number' || t === 'Object' || t === 'Array' || t === 'JSON' || t === 'console') return t;
      fail(node, `no declaration for ${t}`);
    }
    if (ts.isEnumMember(decl)) return this.constValue(decl);
    const sf = decl.getSourceFile();
    if (sf.isDeclarationFile && !rel(sf).endsWith('three.d.ts')) {
      if (['Math', 'Number', 'Object', 'Array', 'JSON', 'console', 'Map', 'Set'].includes(t)) return t;
      fail(node, `global ${t}`);
    }
    if (ts.isEnumDeclaration(decl)) return this.topRef(decl, decl.name.text);
    if (isTopLevel(decl) || ts.isClassDeclaration(decl) || ts.isFunctionDeclaration(decl)) return this.topRef(decl, sym.getName());
    if (ts.isImportSpecifier(decl) || ts.isNamespaceImport(decl)) fail(node, `unresolved import ${t}`);
    fail(node, `name ${t} is not in scope (closure over a class field?)`);
  }

  /** Is `this.x` (or a bare member) shadowed by a local of the same gd name? */
  selfMember(name, ctx) {
    return ctx.scope.used.has(name) || ctx.isStatic ? `self.${name}` : name;
  }

  prop(node, ctx) {
    const K = ts.SyntaxKind;
    const name = node.name.text;
    const recvNode = skipOuter(node.expression);
    // enums, namespaces, Math
    const recvSym = ts.isIdentifier(recvNode) ? this.symOf(recvNode) : null;
    const memberSym = this.symOf(node.name);
    const memberDecl = this.declOf(memberSym);
    if (memberDecl && ts.isEnumMember(memberDecl)) return this.constValue(memberDecl);
    if (ts.isIdentifier(recvNode) && recvNode.text === 'Math') {
      const map = { PI: 'PI', E: '2.718281828459045', SQRT2: '1.4142135623730951', SQRT1_2: '0.7071067811865476', LN2: '0.6931471805599453', LN10: '2.302585092994046' };
      if (!(name in map)) fail(node, `Math.${name}`);
      return map[name];
    }
    if (ts.isIdentifier(recvNode) && recvNode.text === 'Number') {
      const map = { MAX_VALUE: '1.7976931348623157e308', MIN_VALUE: '5e-324', EPSILON: '2.220446049250313e-16', POSITIVE_INFINITY: 'INF', NEGATIVE_INFINITY: '-INF', MAX_SAFE_INTEGER: '9007199254740991.0' };
      if (!(name in map)) fail(node, `Number.${name}`);
      return map[name];
    }
    if (recvSym) {
      const rd = this.declOf(recvSym);
      if (rd && ts.isNamespaceImport(rd)) return this.topRef(memberDecl, name);
    }
    const rt = typeOf(node.expression);
    // optional chaining
    let recv = this.expr(node.expression, ctx);
    if (recvNode.kind === K.ThisKeyword) recv = 'self';
    let v;
    if (name === 'length' && (isList(rt) || isStr(rt))) {
      v = isStr(rt) ? `float(${recv}.length())` : `float(${recv}.size())`;
    } else if (typedKind(rt) || (isArr(rt) && !['length'].includes(name))) {
      v = `JS.xprop_get(${recv}, ${strLit(name)})`;
    } else if (name === 'size' && (isMap(rt) || isSet(rt))) {
      v = `float(${recv}.size())`;
    } else if (recvNode.kind === K.ThisKeyword && ctx.cls && !ctx.inLambda) {
      v = this.selfMember(gd(name), ctx);
      if (v === gd(name) && this.isStaticMember(memberDecl)) v = `${this.classRef(ctx.cls)}.${gd(name)}`;
    } else if (recvSym && this.declOf(recvSym) && ts.isClassDeclaration(this.declOf(recvSym))) {
      v = `${recv}.${gd(name)}`; // static member
    } else if ((this.isOptionalField(memberDecl) || (memberSym && memberSym.flags & ts.SymbolFlags.Optional)) && !isClassInstance(rt)) {
      v = `${recv}.get(${strLit(gd(name))})`;
    } else {
      v = `${recv}.${gd(name)}`;
    }
    return v;
  }

  isStaticMember(decl) {
    return decl && (ts.isPropertyDeclaration(decl) || ts.isMethodDeclaration(decl)) && ts.getCombinedModifierFlags(decl) & ts.ModifierFlags.Static;
  }

  classRef(cd) {
    return `${moduleOf(cd.getSourceFile())}.${cd.name.text}`;
  }

  isOptionalField(decl) {
    return decl && (ts.isPropertySignature(decl) || ts.isPropertyDeclaration(decl)) && !!decl.questionToken;
  }

  elem(node, ctx) {
    const rt = typeOf(node.expression);
    const recv = this.expr(node.expression, ctx);
    const lit = skipOuter(node.argumentExpression);
    // (a whole-number constant index into a list is written as an int: a float index costs a conversion)
    const idx =
      (isList(rt) || isStr(rt)) && ts.isNumericLiteral(lit) && Number.isInteger(Number(lit.text)) && Number(lit.text) >= 0
        ? String(Number(lit.text))
        : this.expr(node.argumentExpression, ctx);
    const parent = node.parent;
    const K = ts.SyntaxKind;
    const maybeMissing =
      !!node.questionDotToken ||
      (ts.isBinaryExpression(parent) && parent.left === node && [K.QuestionQuestionToken, K.BarBarToken].includes(parent.operatorToken.kind)) ||
      (ts.isPropertyAccessExpression(parent) && parent.questionDotToken) ||
      (ts.isElementAccessExpression(parent) && parent.questionDotToken) ||
      isNullable(typeOf(node));
    if (isList(rt) || isStr(rt)) {
      // an optional tuple element ([a, b, c?]) may simply not be there
      if (checker.isTupleType(nonNull(rt)) && isNullable(typeOf(node)) && !isWriteTarget(node)) return `JS.idx(${recv}, ${idx})`;
      if (maybeMissing && !isList(rt)) return `JS.idx(${recv}, ${idx})`;
      if (maybeMissing && (ts.isBinaryExpression(parent) || ts.isPropertyAccessExpression(parent))) return `JS.idx(${recv}, ${idx})`;
      return `${recv}[${idx}]`;
    }
    // (a key read off data of unknown shape, e.g. a save, may simply not be there)
    // (as is a read of a Record<string, X> by any key: JavaScript reads undefined for one it hasn't)
    const keyed = isKeyed(rt);
    if (maybeMissing || ((isAny(typeOf(node)) || keyed) && !isWriteTarget(node))) return `${recv}.get(${idx})`;
    return `${recv}[${idx}]`;
  }

  prefix(node, ctx) {
    const K = ts.SyntaxKind;
    switch (node.operator) {
      case K.ExclamationToken:
        return `(not ${this.cond(node.operand, ctx)})`;
      case K.MinusToken: {
        const o = skipOuter(node.operand);
        if (ts.isNumericLiteral(o)) return num(-Number(o.text));
        return `(-${this.expr(node.operand, ctx)})`;
      }
      case K.PlusToken: {
        const t = typeOf(node.operand);
        const v = this.expr(node.operand, ctx);
        return isNum(t) ? v : `float(${v})`;
      }
      case K.TildeToken:
        return `JS.bnot(${this.expr(node.operand, ctx)})`;
      case K.PlusPlusToken:
      case K.MinusMinusToken: {
        if (ctx.cond) fail(node, '++x inside a condition');
        const lv = this.lvalue(node.operand, ctx);
        ctx.pre.push(`${lv} ${node.operator === K.PlusPlusToken ? '+=' : '-='} 1.0`);
        return lv;
      }
    }
    fail(node, 'prefix operator');
  }

  binary(node, ctx) {
    const K = ts.SyntaxKind;
    const op = node.operatorToken.kind;
    if (op >= K.FirstAssignment && op <= K.LastAssignment) {
      if (ctx.cond) fail(node, 'assignment inside a condition');
      ctx.pre.push(...this.assign(node, ctx));
      return this.lvalue(node.left, ctx);
    }
    if (op === K.CommaToken) {
      if (ctx.cond) fail(node, 'comma inside a condition');
      ctx.pre.push(...this.exprStmt(node.left, ctx));
      return this.expr(node.right, ctx);
    }
    const lt = typeOf(node.left), rt = typeOf(node.right);
    const L = () => this.expr(node.left, ctx);
    const R = () => {
      ctx.cond++;
      const v = this.expr(node.right, ctx);
      ctx.cond--;
      return v;
    };
    switch (op) {
      case K.PlusToken: {
        const resT = typeOf(node);
        if (isStr(resT)) {
          const a = this.expr(node.left, ctx), b = this.expr(node.right, ctx);
          const sa = isStr(lt) && !isNullable(lt) ? a : `JS.s(${a})`;
          const sb = isStr(rt) && !isNullable(rt) ? b : `JS.s(${b})`;
          return `(${sa} + ${sb})`;
        }
        return `(${this.expr(node.left, ctx)} + ${this.expr(node.right, ctx)})`;
      }
      case K.MinusToken:
        return `(${this.expr(node.left, ctx)} - ${this.expr(node.right, ctx)})`;
      case K.AsteriskToken:
        return `(${this.expr(node.left, ctx)} * ${this.expr(node.right, ctx)})`;
      case K.SlashToken:
        return `(${this.expr(node.left, ctx)} / ${this.expr(node.right, ctx)})`;
      case K.PercentToken:
        return `fmod(${this.expr(node.left, ctx)}, ${this.expr(node.right, ctx)})`;
      case K.AsteriskAsteriskToken:
        return `DM.pow(${this.expr(node.left, ctx)}, ${this.expr(node.right, ctx)})`;
      case K.LessThanToken:
      case K.GreaterThanToken:
      case K.LessThanEqualsToken:
      case K.GreaterThanEqualsToken: {
        const o = { [K.LessThanToken]: '<', [K.GreaterThanToken]: '>', [K.LessThanEqualsToken]: '<=', [K.GreaterThanEqualsToken]: '>=' }[op];
        return `(${this.expr(node.left, ctx)} ${o} ${this.expr(node.right, ctx)})`;
      }
      case K.EqualsEqualsEqualsToken:
      case K.EqualsEqualsToken:
      case K.ExclamationEqualsEqualsToken:
      case K.ExclamationEqualsToken: {
        const eq = op === K.EqualsEqualsEqualsToken || op === K.EqualsEqualsToken;
        const l = skipOuter(node.left), r = skipOuter(node.right);
        const isNil = (n) => n.kind === K.NullKeyword || (ts.isIdentifier(n) && n.text === 'undefined');
        const a = this.expr(node.left, ctx), b = this.expr(node.right, ctx);
        if (isNil(l) || isNil(r)) return `(${isNil(l) ? b : a} ${eq ? '==' : '!='} null)`;
        if ((isRefType(lt) && !isClassInstance(lt)) || (isRefType(rt) && !isClassInstance(rt)) || isAny(lt) || isAny(rt)) {
          if (isAny(lt) || isAny(rt)) return `${eq ? '' : 'not '}JS.same(${a}, ${b})`;
          return `(${eq ? '' : 'not '}is_same(${a}, ${b}))`;
        }
        return `(${a} ${eq ? '==' : '!='} ${b})`;
      }
      case K.AmpersandAmpersandToken:
      case K.BarBarToken: {
        const resT = typeOf(node);
        if (isBool(resT) && !isNullable(resT)) return this.cond(node, ctx);
        let a = L();
        if (!isPure(node.left)) {
          if (ctx.cond) {
            const b = R();
            return op === K.BarBarToken ? `JS.or_v(${a}, ${b})` : `JS.and_v(${a}, ${b})`;
          }
          const t = this.newTmp(ctx.scope);
          ctx.pre.push(`var ${t} = ${a}`);
          a = t;
        }
        const ta = this.truthy(a, lt);
        const b = R();
        return op === K.BarBarToken ? `(${a} if ${ta} else ${b})` : `(${b} if ${ta} else ${a})`;
      }
      case K.QuestionQuestionToken: {
        let a = L();
        if (!isPure(node.left)) {
          if (ctx.cond) {
            const b = R();
            return `JS.nullish(${a}, ${b})`;
          }
          const t = this.newTmp(ctx.scope);
          ctx.pre.push(`var ${t} = ${a}`);
          a = t;
        }
        const b = R();
        return `(${a} if ${a} != null else ${b})`;
      }
      case K.BarToken:
        return `JS.bor(${L()}, ${this.expr(node.right, ctx)})`;
      case K.AmpersandToken:
        return `JS.band(${L()}, ${this.expr(node.right, ctx)})`;
      case K.CaretToken:
        return `JS.bxor(${L()}, ${this.expr(node.right, ctx)})`;
      case K.LessThanLessThanToken:
        return `JS.shl(${L()}, ${this.expr(node.right, ctx)})`;
      case K.GreaterThanGreaterThanToken:
        return `JS.shr(${L()}, ${this.expr(node.right, ctx)})`;
      case K.GreaterThanGreaterThanGreaterThanToken:
        return `JS.ushr(${L()}, ${this.expr(node.right, ctx)})`;
      case K.InstanceOfKeyword:
        return `(${L()} is ${this.expr(node.right, ctx)})`;
      case K.InKeyword:
        return `JS.has_key(${this.expr(node.right, ctx)}, ${L()})`;
    }
    fail(node, `binary operator ${K[op]}`);
  }

  // ----------------------------------------------------------------- functions as values
  /** Lines of a lambda: first line `func(...):` (or a one-liner), the rest indented one level. */
  lambdaLines(fn, ctx, padTo = 0) {
    const scope = new Scope(ctx.scope);
    // locals were already named by the enclosing prepareFunction (it walks closures too)
    const c2 = { ...ctx, scope, pre: [], loops: [], cond: 0, inLambda: false };
    // JavaScript ignores extra arguments and GDScript doesn't: take as many as the function's
    // type says callers may pass (a taunt's line(me, opp) given as (me) => ...)
    if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
      const ct = checker.getContextualType(fn);
      const types = ct ? (ct.isUnion() ? ct.types : [ct]) : [];
      for (const t of types) for (const s of t.getCallSignatures()) padTo = Math.max(padTo, s.parameters.length);
    }
    const params = this.params(fn, c2, padTo);
    const sig = checker.getSignatureFromDeclaration(fn);
    const rt = sig ? checker.getReturnTypeOfSignature(sig) : null;
    const isVoid = rt && isVoidish(rt);
    const body = [...this.paramPrologue(fn, c2)];
    if (ts.isBlock(fn.body)) body.push(...this.block(fn.body.statements, c2));
    else if (isVoid) body.push(...this.withPre(c2, () => this.exprStmt(fn.body, c2)));
    else {
      const v = this.expr(fn.body, c2);
      body.push(...c2.pre.splice(0));
      body.push(`return ${v}`);
    }
    if (!body.length) body.push('pass');
    return [`func(${params}):`, ...body.map((l) => '\t' + l)];
  }

  exprStmtSafe(node, ctx, v) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) return ['pass'];
    return [v];
  }

  lambda(fn, ctx, padTo = 0) {
    const lines = this.lambdaLines(fn, ctx, padTo);
    if (lines.length === 2 && !/^\t(if|for|while|var|match)\b/.test(lines[1])) {
      return `${lines[0]} ${lines[1].slice(1)}`;
    }
    // multi-line lambdas go in a variable before the statement
    const t = this.newTmp(ctx.scope, 'f');
    ctx.pre.push(`var ${t} = ${lines[0]}`, ...lines.slice(1));
    return t;
  }

  objectLit(node, ctx) {
    const parts = [];
    const spreads = [];
    let cur = [];
    for (const p of node.properties) {
      if (ts.isSpreadAssignment(p)) {
        if (cur.length) spreads.push(`{${cur.join(', ')}}`);
        cur = [];
        spreads.push(this.expr(p.expression, ctx));
        continue;
      }
      let key;
      if (ts.isComputedPropertyName(p.name)) key = this.expr(p.name.expression, ctx);
      else if (ts.isNumericLiteral(p.name)) key = num(Number(p.name.text));
      else key = strLit(gd(p.name.text ?? p.name.getText()));
      if (ts.isPropertyAssignment(p)) cur.push(`${key}: ${this.expr(p.initializer, ctx)}`);
      else if (ts.isShorthandPropertyAssignment(p)) cur.push(`${key}: ${this.ident(p.name, ctx)}`);
      else if (ts.isMethodDeclaration(p)) cur.push(`${key}: ${this.lambda(p, ctx)}`);
      else if (ts.isGetAccessor(p)) fail(p, 'getter in an object literal');
      else fail(p, 'object literal member');
    }
    if (!spreads.length) {
      const s = `{${cur.join(', ')}}`;
      return s.length > 140 ? `{\n${cur.map((x) => '\t' + x).join(',\n')}\n}` : s;
    }
    if (cur.length) spreads.push(`{${cur.join(', ')}}`);
    return `JS.merge([${spreads.join(', ')}])`;
  }

  arrayLit(node, ctx) {
    const segs = [];
    let cur = [];
    for (const el of node.elements) {
      if (ts.isSpreadElement(el)) {
        if (cur.length) segs.push(`[${cur.join(', ')}]`);
        cur = [];
        const t = typeOf(el.expression);
        const v = this.expr(el.expression, ctx);
        segs.push(isArr(t) ? `${v}.duplicate()` : isSet(t) ? `${v}.keys()` : `Array(${v})`);
        continue;
      }
      if (ts.isOmittedExpression(el)) {
        cur.push('null');
        continue;
      }
      cur.push(this.expr(el, ctx));
    }
    if (cur.length || !segs.length) {
      const s = `[${cur.join(', ')}]`;
      segs.push(s.length > 160 ? `[\n${cur.map((x) => '\t' + x).join(',\n')}\n]` : s);
    }
    return segs.length === 1 ? segs[0] : `(${segs.join(' + ')})`;
  }

  // ----------------------------------------------------------------- calls
  args(call, ctx, { pad = {} } = {}) {
    return call.arguments.map((a, i) => {
      if (ts.isSpreadElement(a)) fail(a, 'spread arguments');
      if ((ts.isArrowFunction(a) || ts.isFunctionExpression(a)) && pad[i]) return this.lambda(a, ctx, pad[i]);
      return this.expr(a, ctx);
    });
  }

  callExpr(node, ctx, optionalAsStatement = false) {
    const K = ts.SyntaxKind;
    const callee = skipOuter(node.expression);
    if (callee.kind === K.SuperKeyword) return `super(${this.args(node, ctx).join(', ')})`;
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      const recvNode = skipOuter(callee.expression);
      if (recvNode.kind === K.SuperKeyword) return `super.${gd(name)}(${this.args(node, ctx).join(', ')})`;
      if (ts.isIdentifier(recvNode)) {
        const g = this.globalCall(recvNode.text, name, node, ctx);
        if (g !== null) return g;
      }
      if (ts.isIdentifier(recvNode)) {
        const rs = this.symOf(recvNode);
        const rd = this.declOf(rs);
        if (rd && EXTERNAL.has(rel(rd.getSourceFile()))) return `${this.ident(recvNode, ctx)}.${name}(${this.args(node, ctx).join(', ')})`;
      }
      const rt = typeOf(callee.expression);
      const special = this.methodCall(callee, name, rt, node, ctx);
      if (special !== null) return special;
      // user methods: real methods are called; function-valued fields go through .call
      const mSym = this.symOf(callee.name);
      const mDecl = this.declOf(mSym);
      let recv = this.expr(callee.expression, ctx);
      if (recvNode.kind === K.ThisKeyword) recv = 'self';
      const args = this.args(node, ctx).join(', ');
      const isRealMethod = mDecl && (ts.isMethodDeclaration(mDecl) || ts.isMethodSignature(mDecl)) && (ts.isClassDeclaration(mDecl.parent) || (ts.isMethodSignature(mDecl) && this.implementedByClassOnly(mDecl)));
      let call;
      if (mDecl && ts.isMethodDeclaration(mDecl) && ts.isClassDeclaration(mDecl.parent)) {
        if (recvNode.kind === K.ThisKeyword && !ctx.isStatic) call = `${this.selfMember(gd(name), ctx)}(${args})`;
        else call = `${recv}.${gd(name)}(${args})`;
      } else if (isRealMethod) call = `${recv}.${gd(name)}(${args})`;
      else call = `${recv}.${gd(name)}.call(${args})`;
      return call;
    }
    if (ts.isIdentifier(callee)) {
      const t = callee.text;
      const g = this.globalFn(t, node, ctx);
      if (g !== null) return g;
      let sym = this.symOf(callee);
      const decl = this.declOf(sym);
      const args = this.args(node, ctx).join(', ');
      if (decl && (ts.isFunctionDeclaration(decl) || isConstFn(decl)) && isTopLevel(decl)) {
        const inl = this.inlineCall(decl, node, ctx);
        if (inl !== null) return inl;
        return `${this.topRef(decl, sym.getName())}(${args})`;
      }
      const f = this.ident(callee, ctx);
      return `${f}.call(${args})`;
    }
    const f = this.expr(callee, ctx);
    return `(${f}).call(${this.args(node, ctx).join(', ')})`;
  }

  /**
   * A call to a one-line maths helper (`lerp(a, b, t)`, `clamp01(v)`, `ropeSide(x, z)`) written
   * in place, when its body is a single returned expression of its number parameters and every
   * argument is a plain number variable or literal (so reading it more than once is the same as
   * reading it once). A GDScript call costs more than such a body, and the sim makes hundreds a
   * step. The expression is the callee's own, translated with its parameters bound to the
   * arguments, so the maths is operation for operation the same.
   */
  inlineCall(decl, node, ctx) {
    const fn = ts.isFunctionDeclaration(decl) ? decl : decl.initializer;
    if (!fn.body || EXTERNAL.has(rel(decl.getSourceFile()))) return null;
    let ret = fn.body;
    if (ts.isBlock(fn.body)) {
      const st = fn.body.statements;
      if (st.length !== 1 || !ts.isReturnStatement(st[0]) || !st[0].expression) return null;
      ret = st[0].expression;
    }
    const ps = fn.parameters;
    if (ps.length !== node.arguments.length) return null;
    const isNum = (t) => !!(t.flags & ts.TypeFlags.NumberLike) && !(t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown));
    if (ps.some((p) => !ts.isIdentifier(p.name) || p.initializer || p.dotDotDotToken || p.questionToken || !isNum(typeOf(p.name)))) return null;
    if (!isNum(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(fn)))) return null;
    let ok = true;
    const K = ts.SyntaxKind;
    const check = (n) => {
      if (!ok) return;
      if (ts.isFunctionLike(n) || n.kind === K.ThisKeyword || ts.isObjectLiteralExpression(n) || ts.isArrayLiteralExpression(n)) ok = false;
      else if (ts.isBinaryExpression(n) && n.operatorToken.kind >= K.FirstAssignment && n.operatorToken.kind <= K.LastAssignment) ok = false;
      else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === K.PlusPlusToken || n.operator === K.MinusMinusToken)) ok = false;
      else if (ts.isIdentifier(n) && this.declOf(this.symOf(n)) === decl) ok = false; // recursion
      else ts.forEachChild(n, check);
    };
    check(ret);
    if (!ok) return null;
    // how often the body reads each parameter
    const uses = ps.map(() => 0);
    const psyms = ps.map((p) => checker.getSymbolAtLocation(p.name));
    const count = (n) => {
      if (ts.isIdentifier(n)) {
        const i = psyms.indexOf(this.symOf(n));
        if (i >= 0) uses[i]++;
      }
      ts.forEachChild(n, count);
    };
    count(ret);
    // an argument with no side effects (reads and arithmetic, no calls) can be read in another
    // order, or not at all; one read more than once has to be small too
    const pure = (n) => {
      n = skipOuter(n);
      if (ts.isIdentifier(n) || ts.isNumericLiteral(n)) return 1;
      if (ts.isPropertyAccessExpression(n) && !n.questionDotToken) return 1 + pure(n.expression);
      if (ts.isElementAccessExpression(n) && !n.questionDotToken) return 1 + pure(n.expression) + pure(n.argumentExpression);
      if (ts.isPrefixUnaryExpression(n) && (n.operator === K.MinusToken || n.operator === K.PlusToken)) return 1 + pure(n.operand);
      if (ts.isBinaryExpression(n) && [K.PlusToken, K.MinusToken, K.AsteriskToken, K.SlashToken].includes(n.operatorToken.kind)) return 1 + pure(n.left) + pure(n.right);
      return Infinity;
    };
    const simple = (v) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(v) || /^-?[0-9]+(\.[0-9]+)?(e-?[0-9]+)?$/.test(v);
    const saved = ctx.pre.length;
    const args = [];
    for (let i = 0; i < ps.length; i++) {
      const a = node.arguments[i];
      if (!isNum(typeOf(a))) return null;
      const size = pure(a);
      if (size === Infinity || (uses[i] > 1 && size > 4)) return null;
      const v = this.expr(a, ctx);
      if (ctx.pre.length !== saved) {
        ctx.pre.length = saved;
        return null;
      }
      args.push(simple(v) ? v : `(${v})`);
    }
    const scope = new Scope();
    ps.forEach((p, i) => scope.names.set(checker.getSymbolAtLocation(p.name), args[i]));
    const c2 = this.ctx(scope, { isStatic: true });
    let v;
    try {
      v = this.expr(ret, c2);
    } catch {
      return null;
    }
    if (c2.pre.length) return null;
    return `(${v})`;
  }

  /** Interfaces whose methods are only ever implemented by classes can be called directly. */
  implementedByClassOnly(_sig) {
    return false;
  }

  globalFn(name, node, ctx) {
    const a = () => this.args(node, ctx);
    const sym = this.symOf(node.expression);
    const decl = this.declOf(sym);
    if (decl && !decl.getSourceFile().isDeclarationFile) return null;
    switch (name) {
      case 'isFinite':
        return `is_finite(${a()[0]})`;
      case 'isNaN':
        return `is_nan(${a()[0]})`;
      case 'Number': {
        const t = typeOf(node.arguments[0]);
        const v = a()[0];
        return isNum(t) ? v : isBool(t) ? `(1.0 if ${v} else 0.0)` : `float(${v})`;
      }
      case 'String':
        return `JS.s(${a()[0]})`;
      case 'Boolean':
        return this.truthy(a()[0], typeOf(node.arguments[0]));
      case 'parseInt':
        return `float(int(${a()[0]}))`;
      case 'parseFloat':
        return `float(${a()[0]})`;
    }
    return null;
  }

  globalCall(obj, name, node, ctx) {
    const sym = this.symOf(skipOuter(node.expression).expression);
    const decl = this.declOf(sym);
    if (decl && !decl.getSourceFile().isDeclarationFile) {
      if (ts.isNamespaceImport(decl)) return null;
      // DM and friends are ordinary references (their module maps to a stand-in)
      return null;
    }
    const a = () => this.args(node, ctx);
    if (obj === 'Math') {
      const x = a();
      switch (name) {
        case 'abs':
          return `absf(${x[0]})`;
        case 'floor':
          return `floorf(${x[0]})`;
        case 'ceil':
          return `ceilf(${x[0]})`;
        case 'round':
          return `JS.round(${x[0]})`;
        case 'trunc':
          return `JS.trunc(${x[0]})`;
        case 'sign':
          return `JS.sign(${x[0]})`;
        case 'sqrt':
          return `sqrt(${x[0]})`;
        case 'min':
        case 'max': {
          if (x.length === 0) return name === 'min' ? 'INF' : '-INF';
          if (x.length === 1) return x[0];
          let s = x[0];
          for (let i = 1; i < x.length; i++) s = `${name}f(${s}, ${x[i]})`;
          return s;
        }
        case 'imul':
          return `JS.imul(${x[0]}, ${x[1]})`;
        case 'random':
          return 'randf()';
        case 'fround':
          return `JS.fround(${x[0]})`;
        case 'hypot':
        case 'sin':
        case 'cos':
        case 'tan':
        case 'atan2':
        case 'atan':
        case 'asin':
        case 'acos':
        case 'exp':
        case 'log':
        case 'pow':
        case 'cbrt':
        case 'log2':
        case 'log10':
          // engine maths: only allowed outside the sim (check-sim enforces DM there)
          return `JS.math_${name}(${x.join(', ')})`;
      }
      fail(node, `Math.${name}`);
    }
    if (obj === 'Array') {
      if (name === 'isArray') return `(${a()[0]} is Array)`;
      if (name === 'from') {
        const src = node.arguments[0];
        if (ts.isObjectLiteralExpression(src)) {
          const len = src.properties.find((p) => p.name?.getText() === 'length');
          const n = this.expr(len.initializer, ctx);
          if (!node.arguments[1]) return `JS.filled(${n}, null)`;
          const fnNode = node.arguments[1];
          const f = ts.isArrowFunction(fnNode) || ts.isFunctionExpression(fnNode) ? this.lambda(fnNode, ctx, 2) : this.expr(fnNode, ctx);
          return `JS.array_from(${n}, ${f})`;
        }
        const s = this.expr(src, ctx);
        const st = typeOf(src);
        const srcExpr = isMap(st) || isSet(st) ? `${s}.keys()` : s;
        if (!node.arguments[1]) return `JS.array_copy(${srcExpr})`;
        const fnNode = node.arguments[1];
        const f = ts.isArrowFunction(fnNode) || ts.isFunctionExpression(fnNode) ? this.lambda(fnNode, ctx, 2) : this.expr(fnNode, ctx);
        return `JS.array_copy(${srcExpr}, ${f})`;
      }
      if (name === 'of') return `[${a().join(', ')}]`;
    }
    if (obj === 'Object') {
      const x = a();
      switch (name) {
        case 'keys':
          return `JS.keys(${x[0]})`;
        case 'values':
          return `JS.values(${x[0]})`;
        case 'entries':
          return `JS.entries(${x[0]})`;
        case 'freeze':
          return x[0];
        case 'assign':
          return `JS.assign(${x.join(', ')})`;
        case 'fromEntries':
          return `JS.from_entries(${x[0]})`;
      }
    }
    if (obj === 'Number') {
      const x = a();
      if (name === 'isFinite') return `is_finite(${x[0]})`;
      if (name === 'isNaN') return `is_nan(${x[0]})`;
      if (name === 'isInteger') return `JS.is_integer(${x[0]})`;
    }
    if (obj === 'console') return `print(${a().join(', ')})`;
    if (obj === 'JSON' && name === 'stringify') return `JSON.stringify(${a()[0]})`;
    if (obj === 'JSON' && name === 'parse') {
      // JSON.parse(JSON.stringify(x)), JavaScript's deep copy
      const inner = skipOuter(node.arguments[0]);
      if (ts.isCallExpression(inner) && inner.expression.getText() === 'JSON.stringify') return `(${this.expr(inner.arguments[0], ctx)}).duplicate(true)`;
      return `TInit.from_json(JSON.parse_string(${a()[0]}))`;
    }
    return null;
  }

  /** Built-in methods on arrays, typed arrays, maps, sets, strings, numbers, Vector3. */
  methodCall(callee, name, rt, node, ctx) {
    const recvNode = skipOuter(callee.expression);
    const R = () => this.expr(callee.expression, ctx);
    const A = (pad) => this.args(node, ctx, { pad });
    if (isV3(rt)) {
      const x = A();
      const r = R();
      const m = name === 'set' ? 'set3' : name;
      // (the dot product and lengths as v3.gd computes them, where nothing needs evaluating once)
      const id = (v) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(v);
      if (id(r) && x.every(id)) {
        if (m === 'dot' && x.length === 1) return `(${r}.x * ${x[0]}.x + ${r}.y * ${x[0]}.y + ${r}.z * ${x[0]}.z)`;
        if (m === 'lengthSq' && !x.length) return `(${r}.x * ${r}.x + ${r}.y * ${r}.y + ${r}.z * ${r}.z)`;
        if (m === 'length' && !x.length) return `sqrt(${r}.x * ${r}.x + ${r}.y * ${r}.y + ${r}.z * ${r}.z)`;
      }
      return `${r}.${m}(${x.join(', ')})`;
    }
    if (isList(rt)) {
      const typed = !!typedKind(rt);
      switch (name) {
        case 'push': {
          const r = R();
          const x = A();
          if (x.length === 1) {
            if (isExprStatement(node)) return `${r}.append(${x[0]})`;
            return `JS.push(${r}, ${x[0]})`;
          }
          if (!isExprStatement(node)) fail(node, 'push of several values used as a value');
          return `${r}.append_array([${x.join(', ')}])`;
        }
        case 'pop':
          return `${R()}.pop_back()`;
        case 'shift':
          return `${R()}.pop_front()`;
        case 'unshift':
          return `${R()}.push_front(${A()[0]})`;
        case 'includes':
          return `JS.includes(${R()}, ${A()[0]})`;
        case 'indexOf':
          return `JS.index_of(${R()}, ${A()[0]})`;
        case 'slice': {
          const x = A();
          if (!x.length) return `${R()}.duplicate()`;
          return `${R()}.slice(${x.join(', ')})`;
        }
        case 'concat':
          return `(${[R(), ...A()].join(' + ')})`;
        case 'join':
          return `JS.join(${R()}${node.arguments.length ? ', ' + A()[0] : ''})`;
        case 'fill': {
          const x = A();
          if (x.length > 1) fail(node, 'fill with a range');
          return `JS.fill(${R()}, ${x[0]})`;
        }
        case 'reverse':
          return `JS.reverse(${R()})`;
        case 'at':
          return `JS.at(${R()}, ${A()[0]})`;
        case 'splice':
          return `JS.splice(${R()}, ${A().join(', ')}${node.arguments.length > 2 ? '' : ''})`;
        case 'sort': {
          const fnNode = node.arguments[0];
          const f = fnNode ? (ts.isArrowFunction(fnNode) || ts.isFunctionExpression(fnNode) ? this.lambda(fnNode, ctx, 2) : this.expr(fnNode, ctx)) : 'null';
          return `JS.sort(${R()}, ${f})`;
        }
        case 'map':
        case 'filter':
        case 'forEach':
        case 'some':
        case 'every':
        case 'find':
        case 'findIndex':
        case 'flatMap': {
          const fnNode = node.arguments[0];
          const inline = fnNode && (ts.isArrowFunction(fnNode) || ts.isFunctionExpression(fnNode));
          const r = R();
          const f = inline ? this.lambda(fnNode, ctx, 2) : this.expr(fnNode, ctx);
          const helper = { map: 'map', filter: 'filter', forEach: 'for_each', some: 'some', every: 'every', find: 'find', findIndex: 'find_index', flatMap: 'flat_map' }[name];
          if (!inline && name === 'map') return `JS.map1(${r}, ${f})`;
          if (!inline) return `JS.${helper}(${r}, func(v, _i): return ${f}.call(v))`;
          return `JS.${helper}(${r}, ${f})`;
        }
        case 'reduce': {
          const fnNode = node.arguments[0];
          const inline = ts.isArrowFunction(fnNode) || ts.isFunctionExpression(fnNode);
          const r = R();
          const f = inline ? this.lambda(fnNode, ctx, 3) : this.expr(fnNode, ctx);
          if (node.arguments.length < 2) return `JS.reduce1(${r}, ${f})`;
          return `JS.reduce(${r}, ${f}, ${this.expr(node.arguments[1], ctx)})`;
        }
        case 'keys':
          return `range(${R()}.size())`;
        case 'set':
          if (typed) return `JS.typed_set(${R()}, ${A().join(', ')})`;
          break;
        case 'subarray':
          return `${R()}.slice(${A().join(', ')})`;
      }
      fail(node, `array method ${name}`);
    }
    if (isMap(rt) || isSet(rt)) {
      const r = R();
      const x = A();
      switch (name) {
        case 'get':
          return `${r}.get(${x[0]})`;
        case 'set':
          if (isExprStatement(node)) return `${r}[${x[0]}] = ${x[1]}`;
          return `JS.map_set(${r}, ${x[0]}, ${x[1]})`;
        case 'add':
          if (isExprStatement(node)) return `${r}[${x[0]}] = true`;
          return `JS.map_set(${r}, ${x[0]}, true)`;
        case 'has':
          return `${r}.has(${x[0]})`;
        case 'delete':
          return `${r}.erase(${x[0]})`;
        case 'clear':
          return `${r}.clear()`;
        case 'keys':
          return `${r}.keys()`;
        case 'values':
          return isSet(rt) ? `${r}.keys()` : `${r}.values()`;
        case 'entries':
          return `JS.entries(${r})`;
        case 'forEach':
          return `JS.map_for_each(${r}, ${x[0]})`;
      }
      fail(node, `Map/Set method ${name}`);
    }
    if (isStr(rt)) {
      const r = R();
      const x = A();
      switch (name) {
        case 'charCodeAt':
          return `JS.char_code_at(${r}, ${x[0] ?? '0.0'})`;
        case 'startsWith':
          return `${r}.begins_with(${x[0]})`;
        case 'endsWith':
          return `${r}.ends_with(${x[0]})`;
        case 'toUpperCase':
          return `${r}.to_upper()`;
        case 'toLowerCase':
          return `${r}.to_lower()`;
        case 'split':
          return `Array(${r}.split(${x[0]}))`;
        case 'padStart':
          return `JS.pad_start(${r}, ${x.join(', ')})`;
        case 'padEnd':
          return `JS.pad_end(${r}, ${x.join(', ')})`;
        case 'repeat':
          return `${r}.repeat(int(${x[0]}))`;
        case 'slice':
        case 'substring':
          return `JS.str_slice(${r}, ${x.join(', ')})`;
        case 'includes':
          return `(${r}.find(${x[0]}) >= 0)`;
        case 'indexOf':
          return `float(${r}.find(${x[0]}))`;
        case 'trim':
          return `${r}.strip_edges()`;
        case 'replace':
          return `JS.str_replace(${r}, ${x.join(', ')})`;
        case 'charAt':
          return `JS.str_slice(${r}, ${x[0]}, ${x[0]} + 1.0)`;
      }
      fail(node, `string method ${name}`);
    }
    if (isNum(rt)) {
      const r = R();
      const x = A();
      if (name === 'toFixed') return `JS.to_fixed(${r}, ${x[0] ?? '0.0'})`;
      if (name === 'toString') return `JS.s(${r})`;
      // (only ever 'en-US' here: digits grouped in threes with commas)
      if (name === 'toLocaleString') return `JS.to_locale(${r})`;
      fail(node, `number method ${name}`);
    }
    if (isFn(rt) && (name === 'call' || name === 'apply' || name === 'bind')) fail(node, `Function.${name}`);
    return null;
  }

  newExpr(node, ctx) {
    const callee = skipOuter(node.expression);
    const name = ts.isIdentifier(callee) ? callee.text : '';
    const args = node.arguments ?? [];
    const A = () => args.map((a) => this.expr(a, ctx));
    const sym = ts.isIdentifier(callee) ? this.symOf(callee) : null;
    const decl = this.declOf(sym);
    const lib = !decl || decl.getSourceFile().isDeclarationFile;
    if (lib && !(decl && rel(decl.getSourceFile()).endsWith('three.d.ts'))) {
      switch (name) {
        case 'Map':
          return args.length ? `JS.map_from(${A()[0]})` : '{}';
        case 'Set':
          return args.length ? `JS.set_from(${A()[0]})` : '{}';
        case 'Array':
          return args.length === 1 ? `JS.filled(${A()[0]}, null)` : `[${A().join(', ')}]`;
        case 'Float64Array':
        case 'Float32Array': {
          const k = name === 'Float64Array' ? 'f64' : 'f32';
          if (!args.length) return `JS.${k}(0.0)`;
          return isNum(typeOf(args[0])) ? `JS.${k}(${A()[0]})` : `JS.${k}_of(${A()[0]})`;
        }
        case 'Int8Array':
        case 'Int16Array':
        case 'Int32Array':
        case 'Uint8Array':
        case 'Uint16Array':
        case 'Uint32Array':
          if (!args.length) return '[]';
          return isNum(typeOf(args[0])) ? `JS.filled(${A()[0]}, 0.0)` : `JS.array_copy(${A()[0]})`;
        case 'Error':
          return `str(${A()[0] ?? '""'})`;
      }
      fail(node, `new ${name}`);
    }
    const c = this.expr(callee, ctx);
    return `${c}.new(${A().join(', ')})`;
  }
}

function isChainLink(n) {
  return ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n);
}
/** The outermost node of an optional chain (a?.b.c: the .c access). */
function isChainTop(n) {
  if (!isChainLink(n) || !(n.flags & ts.NodeFlags.OptionalChain)) return false;
  let p = n.parent;
  while (ts.isNonNullExpression(p) || ts.isParenthesizedExpression(p)) {
    if (ts.isParenthesizedExpression(p)) return true;
    p = p.parent;
  }
  return !(isChainLink(p) && skipOuter(p.expression) === n && p.flags & ts.NodeFlags.OptionalChain);
}

function isVoidish(t) {
  if (t.flags & F.Void) return true;
  return t.isUnion() && t.types.every((u) => u.flags & (F.Void | F.Undefined));
}

/**
 * Vector3 methods inlineV3 writes out: argument count and types, and the lines (receiver `r`,
 * evaluated arguments `a`). Each must match runtime/v3.gd operation for operation, and set the
 * components one by one from values read before or independently of them (so `v.sub(v)` and
 * friends alias the same way). `set` reads all its arguments first, as a call would.
 */
const V3_INLINE = {
  set: { n: 3, types: ['float', 'float', 'float'], emit: (r, a) => [`${r}.x = ${a[0]}`, `${r}.y = ${a[1]}`, `${r}.z = ${a[2]}`] },
  setX: { n: 1, types: ['float'], emit: (r, a) => [`${r}.x = ${a[0]}`] },
  setY: { n: 1, types: ['float'], emit: (r, a) => [`${r}.y = ${a[0]}`] },
  setZ: { n: 1, types: ['float'], emit: (r, a) => [`${r}.z = ${a[0]}`] },
  copy: { n: 1, types: ['V3'], emit: (r, [v]) => [`${r}.x = ${v}.x`, `${r}.y = ${v}.y`, `${r}.z = ${v}.z`] },
  add: { n: 1, types: ['V3'], emit: (r, [v]) => [`${r}.x += ${v}.x`, `${r}.y += ${v}.y`, `${r}.z += ${v}.z`] },
  sub: { n: 1, types: ['V3'], emit: (r, [v]) => [`${r}.x -= ${v}.x`, `${r}.y -= ${v}.y`, `${r}.z -= ${v}.z`] },
  addVectors: { n: 2, types: ['V3', 'V3'], emit: (r, [p, q]) => [`${r}.x = ${p}.x + ${q}.x`, `${r}.y = ${p}.y + ${q}.y`, `${r}.z = ${p}.z + ${q}.z`] },
  subVectors: { n: 2, types: ['V3', 'V3'], emit: (r, [p, q]) => [`${r}.x = ${p}.x - ${q}.x`, `${r}.y = ${p}.y - ${q}.y`, `${r}.z = ${p}.z - ${q}.z`] },
  addScaledVector: { n: 2, types: ['V3', 'float'], emit: (r, [v, k]) => [`${r}.x += ${v}.x * ${k}`, `${r}.y += ${v}.y * ${k}`, `${r}.z += ${v}.z * ${k}`] },
  multiplyScalar: { n: 1, types: ['float'], emit: (r, [k]) => [`${r}.x *= ${k}`, `${r}.y *= ${k}`, `${r}.z *= ${k}`] },
  lerpVectors: {
    n: 3,
    types: ['V3', 'V3', 'float'],
    emit: (r, [p, q, k]) => [`${r}.x = ${p}.x + (${q}.x - ${p}.x) * ${k}`, `${r}.y = ${p}.y + (${q}.y - ${p}.y) * ${k}`, `${r}.z = ${p}.z + (${q}.z - ${p}.z) * ${k}`],
  },
  normalize: {
    n: 0,
    types: [],
    emit: (r, a, tmp) => {
      const l = tmp();
      const k = tmp();
      return [`var ${l}: float = sqrt(${r}.x * ${r}.x + ${r}.y * ${r}.y + ${r}.z * ${r}.z)`, `var ${k}: float = 1.0 / (${l} if ${l} != 0.0 else 1.0)`, `${r}.x *= ${k}`, `${r}.y *= ${k}`, `${r}.z *= ${k}`];
    },
  },
};

/** How many calls deep `a.f().g().h()` is (3), counting only plain property-call links. */
function chainLength(e) {
  let n = 0;
  while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
    n++;
    e = skipOuter(e.expression.expression);
  }
  return n;
}

function isExprStatement(node) {
  let p = node.parent;
  while (ts.isParenthesizedExpression(p)) p = p.parent;
  return ts.isExpressionStatement(p) || (ts.isArrowFunction(p) && p.body === node && (() => {
    const sig = checker.getSignatureFromDeclaration(p);
    return sig && checker.getReturnTypeOfSignature(sig).flags & F.Void;
  })());
}

function isWriteTarget(id) {
  let n = id;
  const p = n.parent;
  if (ts.isBinaryExpression(p) && p.left === n && p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && p.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
  if ((ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) && (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  if (ts.isArrayLiteralExpression(p) && ts.isBinaryExpression(p.parent) && p.parent.left === p) return true;
  return false;
}

function containsContinue(node) {
  let found = false;
  const v = (n) => {
    if (found) return;
    if (ts.isContinueStatement(n)) found = true;
    if (ts.isIterationStatement(n, false) || FN_KINDS.has(n.kind)) return;
    ts.forEachChild(n, v);
  };
  ts.forEachChild(node, v);
  if (ts.isContinueStatement(node)) found = true;
  return found;
}

function containsSwitchBreak(node) {
  let found = false;
  const v = (n) => {
    if (found) return;
    if (ts.isBreakStatement(n) && !n.label) found = true;
    if (ts.isIterationStatement(n, false) || ts.isSwitchStatement(n) || FN_KINDS.has(n.kind)) return;
    ts.forEachChild(n, v);
  };
  v(node);
  return found;
}

function endsInJumpNode(block) {
  const last = block.statements[block.statements.length - 1];
  return last && (ts.isReturnStatement(last) || ts.isBreakStatement(last) || ts.isContinueStatement(last) || ts.isThrowStatement(last));
}

// --------------------------------------------------------------------------- main
const diags = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error && d.file && MODULES.has(rel(d.file)));
if (diags.length) {
  for (const d of diags.slice(0, 20)) {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    console.error(`${rel(d.file)}:${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  }
  console.error(`(${diags.length} type errors; translating anyway)`);
}

fs.mkdirSync(OUT, { recursive: true });
let errors = 0;
const only = process.argv[2];
for (const [src, cls] of MODULES) {
  if (only && !src.includes(only)) continue;
  const sf = program.getSourceFile(path.join(REPO, src));
  if (!sf) {
    console.error(`missing ${src}`);
    errors++;
    continue;
  }
  try {
    const text = new ModuleEmitter(sf, cls).emit();
    const out = path.join(OUT, CONFIG.outNames?.[src] ?? path.basename(src).replace(/\.ts$/, '.gd'));
    fs.writeFileSync(out, text);
  } catch (e) {
    if (e instanceof TransError) {
      console.error(e.message);
      errors++;
    } else throw e;
  }
}
// TInit.run(): module initialisers in JavaScript's evaluation order (depth-first over imports).
{
  const order = [];
  const seen = new Set();
  const visit = (src) => {
    if (seen.has(src)) return;
    seen.add(src);
    const sf = program.getSourceFile(path.join(REPO, src));
    if (!sf) return;
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) && !(ts.isExportDeclaration(st) && st.moduleSpecifier)) continue;
      if (st.importClause?.isTypeOnly || st.isTypeOnly) continue;
      const spec = st.moduleSpecifier.text;
      if (!spec.startsWith('.')) continue;
      const res = ts.resolveModuleName(spec, sf.fileName, options, ts.sys).resolvedModule;
      if (!res) continue;
      const dep = path.relative(REPO, res.resolvedFileName).split(path.sep).join('/');
      if (MODULES.has(dep)) visit(dep);
    }
    order.push(src);
  };
  for (const src of MODULES.keys()) visit(src);
  const lines = [
    '## Generated by godot/tools/ts2gd: runs every translated module\'s initialiser once, in the',
    '## order JavaScript evaluates them.',
    'class_name TInit',
    'extends RefCounted',
    '',
    'static var done := false',
    '',
    '',
    'static func run() -> void:',
    '\tif done:',
    '\t\treturn',
    '\tdone = true',
    ...order.map((src) => `\t${MODULES.get(src)}.__init_module()`),
    '',
    '',
    '## Names the translation renamed (a JavaScript name that is a GDScript keyword or builtin),',
    '## and so the dictionary keys the translated code reads and writes in their place.',
    `const RENAMED := {${[...RENAMED].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`,
    'static var _unrenamed := {}',
    '',
    '',
    '## Data parsed from JSON (a save, the cloud) with its keys renamed as the translated code',
    '## names them, at every depth.',
    'static func from_json(v: Variant) -> Variant:',
    '\tif v is Dictionary:',
    '\t\tvar out := {}',
    '\t\tfor k in v:',
    '\t\t\tout[RENAMED.get(k, k) if k is String else k] = from_json(v[k])',
    '\t\treturn out',
    '\tif v is Array:',
    '\t\treturn (v as Array).map(from_json)',
    '\treturn v',
    '',
    '',
    '## The other way: translated data with its keys back to the JavaScript names, for JSON.',
    'static func to_json(v: Variant) -> Variant:',
    '\tif _unrenamed.is_empty():',
    '\t\tfor k in RENAMED:',
    '\t\t\t_unrenamed[RENAMED[k]] = k',
    '\tif v is Dictionary:',
    '\t\tvar out := {}',
    '\t\tfor k in v:',
    '\t\t\tout[_unrenamed.get(k, k) if k is String else k] = to_json(v[k])',
    '\t\treturn out',
    '\tif v is Array:',
    '\t\treturn (v as Array).map(to_json)',
    '\treturn v',
  ];
  // the build's fight, as a number (saved replays keep it: another one may not play out the same)
  const sim = createHash('sha1');
  for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.gd') && f !== 'init.gd').sort()) sim.update(f).update(fs.readFileSync(path.join(OUT, f)));
  lines.push(
    '',
    '',
    '## A fingerprint of every translated module as generated (the fight sim, the parts, the',
    '## loadouts): saved replays keep it, and one saved on another one may not play out the same.',
    `const SIM_HASH := ${parseInt(sim.digest('hex').slice(0, 8), 16)}`,
  );
  fs.writeFileSync(path.join(OUT, 'init.gd'), lines.join('\n') + '\n');
}
if (errors) {
  console.error(`${errors} module(s) failed`);
  process.exit(1);
}
console.log(`translated ${MODULES.size} modules into ${path.relative(REPO, OUT)}`);
