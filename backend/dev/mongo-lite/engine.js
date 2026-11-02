'use strict';

/*
 * Motore in memoria di mongo-lite: emula il sottoinsieme di comandi MongoDB
 * usato da questa app (via Mongoose). Serve solo per sviluppo e test quando
 * un vero MongoDB non è disponibile. Vedi docs/DECISIONI.md.
 *
 * Ogni comando viene eseguito in modo sincrono, quindi è atomico rispetto
 * agli altri: lo stesso comportamento che MongoDB garantisce su un singolo
 * documento.
 */

const { ObjectId, Long } = require('bson');

class CommandError extends Error {
  constructor(message, code = 2, codeName = 'BadValue', extra = {}) {
    super(message);
    this.code = code;
    this.codeName = codeName;
    this.extra = extra;
  }
}

// ---------------------------------------------------------------- valori

function bsonType(v) {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'bigint') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'bool';
  if (v instanceof Date) return 'date';
  if (Array.isArray(v)) return 'array';
  if (v instanceof RegExp) return 'regex';
  if (Buffer.isBuffer(v)) return 'binData';
  switch (v._bsontype) {
    case 'ObjectId':
    case 'ObjectID':
      return 'objectId';
    case 'Long':
    case 'Int32':
    case 'Double':
    case 'Decimal128':
      return 'number';
    case 'Binary':
      return 'binData';
    default:
      return 'object';
  }
}

const TYPE_ORDER = { null: 1, number: 2, string: 3, object: 4, array: 5, binData: 6, objectId: 7, bool: 8, date: 9, regex: 11 };

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (v && typeof v.toNumber === 'function') return v.toNumber();
  if (v && v._bsontype === 'Decimal128') return parseFloat(v.toString());
  if (v && typeof v.valueOf === 'function') return Number(v.valueOf());
  return Number(v);
}

function isPlainObject(v) {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof RegExp) &&
    !Buffer.isBuffer(v) &&
    !v._bsontype
  );
}

function isOperatorObject(v) {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  return keys.length > 0 && keys[0].startsWith('$');
}

function compareValues(a, b) {
  const ta = bsonType(a);
  const tb = bsonType(b);
  if (ta !== tb) return (TYPE_ORDER[ta] || 99) - (TYPE_ORDER[tb] || 99);
  switch (ta) {
    case 'null':
      return 0;
    case 'number': {
      const x = toNumber(a);
      const y = toNumber(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    case 'string':
      return a < b ? -1 : a > b ? 1 : 0;
    case 'bool':
      return a === b ? 0 : a ? 1 : -1;
    case 'date':
      return a.getTime() - b.getTime();
    case 'objectId': {
      const x = a.toHexString();
      const y = b.toHexString();
      return x < y ? -1 : x > y ? 1 : 0;
    }
    case 'array': {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const c = compareValues(a[i], b[i]);
        if (c !== 0) return c;
      }
      return a.length - b.length;
    }
    case 'object': {
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
        if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
        const c = compareValues(a[ka[i]], b[kb[i]]);
        if (c !== 0) return c;
      }
      return ka.length - kb.length;
    }
    default:
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
}

function equals(a, b) {
  const ta = bsonType(a);
  const tb = bsonType(b);
  if (ta !== tb) return false;
  switch (ta) {
    case 'array':
      return a.length === b.length && a.every((x, i) => equals(x, b[i]));
    case 'object': {
      const ka = Object.keys(a).filter((k) => a[k] !== undefined);
      const kb = Object.keys(b).filter((k) => b[k] !== undefined);
      return ka.length === kb.length && ka.every((k) => equals(a[k], b[k]));
    }
    case 'regex':
      return a.source === b.source && a.flags === b.flags;
    case 'binData':
      return Buffer.from(a.buffer || a).equals(Buffer.from(b.buffer || b));
    default:
      return compareValues(a, b) === 0;
  }
}

function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(clone);
  if (Buffer.isBuffer(v)) return Buffer.from(v);
  if (v._bsontype) return v;
  if (v instanceof RegExp) return new RegExp(v.source, v.flags);
  const out = {};
  for (const k of Object.keys(v)) if (v[k] !== undefined) out[k] = clone(v[k]);
  return out;
}

// ---------------------------------------------------------------- percorsi

/** Tutti i valori raggiungibili da un percorso "a.b.c", attraversando gli array. */
function resolvePath(value, parts) {
  if (parts.length === 0) return [value];
  const [head, ...rest] = parts;
  if (Array.isArray(value)) {
    const out = [];
    if (/^\d+$/.test(head)) {
      if (value[Number(head)] !== undefined) out.push(...resolvePath(value[Number(head)], rest));
    } else {
      for (const el of value) if (isPlainObject(el)) out.push(...resolvePath(el, parts));
    }
    return out;
  }
  if (isPlainObject(value)) {
    if (!Object.prototype.hasOwnProperty.call(value, head) || value[head] === undefined) return [];
    return resolvePath(value[head], rest);
  }
  return [];
}

function getValue(doc, path) {
  let cur = doc;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) cur = cur[Number(part)];
    else if (isPlainObject(cur)) cur = cur[part];
    else return undefined;
  }
  return cur;
}

function setValue(doc, path, value) {
  const parts = path.split('.');
  let cur = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const key = Array.isArray(cur) ? Number(part) : part;
    if (cur[key] === null || cur[key] === undefined || typeof cur[key] !== 'object') {
      cur[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    cur = cur[key];
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cur)) {
    const idx = Number(last);
    while (cur.length < idx) cur.push(null);
    cur[idx] = value;
  } else {
    cur[last] = value;
  }
}

function unsetValue(doc, path) {
  const parts = path.split('.');
  const parent = parts.length > 1 ? getValue(doc, parts.slice(0, -1).join('.')) : doc;
  if (parent === null || parent === undefined || typeof parent !== 'object') return;
  const last = parts[parts.length - 1];
  if (Array.isArray(parent)) parent[Number(last)] = null;
  else delete parent[last];
}

function expandArrays(candidates) {
  const out = [];
  for (const c of candidates) {
    out.push(c);
    if (Array.isArray(c)) out.push(...c);
  }
  return out;
}

// ---------------------------------------------------------------- query

function regexFrom(pattern, options) {
  if (pattern instanceof RegExp) return new RegExp(pattern.source, (options || pattern.flags).replace('g', ''));
  return new RegExp(pattern, (options || '').replace(/[^imsux]/g, ''));
}

function matchEquality(candidates, value) {
  if (value === null || value === undefined) {
    return candidates.length === 0 || expandArrays(candidates).some((c) => c === null || c === undefined);
  }
  if (value instanceof RegExp) {
    const re = regexFrom(value);
    return expandArrays(candidates).some((c) => typeof c === 'string' && re.test(c));
  }
  return expandArrays(candidates).some((c) => equals(c, value));
}

function sameBracket(a, b) {
  return bsonType(a) === bsonType(b);
}

function matchOperators(candidates, ops) {
  for (const [op, arg] of Object.entries(ops)) {
    switch (op) {
      case '$eq':
        if (!matchEquality(candidates, arg)) return false;
        break;
      case '$ne':
        if (matchEquality(candidates, arg)) return false;
        break;
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte': {
        const ok = expandArrays(candidates).some((c) => {
          if (!sameBracket(c, arg)) return false;
          const cmp = compareValues(c, arg);
          if (op === '$gt') return cmp > 0;
          if (op === '$gte') return cmp >= 0;
          if (op === '$lt') return cmp < 0;
          return cmp <= 0;
        });
        if (!ok) return false;
        break;
      }
      case '$in':
        if (!Array.isArray(arg)) throw new CommandError('$in needs an array');
        if (!arg.some((v) => matchEquality(candidates, v))) return false;
        break;
      case '$nin':
        if (!Array.isArray(arg)) throw new CommandError('$nin needs an array');
        if (arg.some((v) => matchEquality(candidates, v))) return false;
        break;
      case '$exists':
        if ((candidates.length > 0) !== Boolean(arg)) return false;
        break;
      case '$size':
        if (!candidates.some((c) => Array.isArray(c) && c.length === toNumber(arg))) return false;
        break;
      case '$all':
        if (!arg.every((v) => matchEquality(candidates, v))) return false;
        break;
      case '$elemMatch':
        if (!candidates.some((c) => Array.isArray(c) && c.some((el) => matchElement(el, arg)))) return false;
        break;
      case '$regex': {
        const re = regexFrom(arg, ops.$options);
        if (!expandArrays(candidates).some((c) => typeof c === 'string' && re.test(c))) return false;
        break;
      }
      case '$options':
        break;
      case '$type': {
        const ALIASES = { int: 'number', long: 'number', double: 'number', decimal: 'number', number: 'number', string: 'string', bool: 'bool', date: 'date', objectId: 'objectId', array: 'array', object: 'object', null: 'null', regex: 'regex', binData: 'binData' };
        const wanted = (Array.isArray(arg) ? arg : [arg]).map((t) => ALIASES[t] || t);
        if (!candidates.some((c) => wanted.includes(bsonType(c)))) return false;
        break;
      }
      case '$not':
        if (isOperatorObject(arg) ? matchOperators(candidates, arg) : matchEquality(candidates, arg)) return false;
        break;
      default:
        throw new CommandError(`mongo-lite: operatore di query non supportato ${op}`, 2, 'BadValue');
    }
  }
  return true;
}

function matchElement(el, cond) {
  if (isOperatorObject(cond) && !['$and', '$or', '$nor'].includes(Object.keys(cond)[0])) {
    return matchOperators([el], cond);
  }
  return isPlainObject(el) && matchDocument(el, cond);
}

function matchField(doc, path, cond) {
  const candidates = resolvePath(doc, path.split('.'));
  if (isOperatorObject(cond)) return matchOperators(candidates, cond);
  return matchEquality(candidates, cond);
}

function matchDocument(doc, query) {
  if (!query) return true;
  for (const [key, cond] of Object.entries(query)) {
    if (cond === undefined) continue;
    if (key === '$and') {
      if (!cond.every((q) => matchDocument(doc, q))) return false;
    } else if (key === '$or') {
      if (!cond.some((q) => matchDocument(doc, q))) return false;
    } else if (key === '$nor') {
      if (cond.some((q) => matchDocument(doc, q))) return false;
    } else if (key === '$comment') {
      continue;
    } else if (key.startsWith('$')) {
      throw new CommandError(`mongo-lite: operatore non supportato ${key}`, 2, 'BadValue');
    } else if (!matchField(doc, key, cond)) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- aggiornamenti

/** Condizioni della query che riguardano gli elementi dell'array `arrayPath`. */
function collectArrayConditions(query, arrayPath, out = []) {
  for (const [key, cond] of Object.entries(query || {})) {
    if (key === '$and') cond.forEach((q) => collectArrayConditions(q, arrayPath, out));
    else if (key === arrayPath) {
      if (isPlainObject(cond) && cond.$elemMatch) out.push({ elem: cond.$elemMatch });
      else out.push({ sub: '', cond });
    } else if (key.startsWith(`${arrayPath}.`)) {
      out.push({ sub: key.slice(arrayPath.length + 1), cond });
    }
  }
  return out;
}

function positionalIndex(doc, query, arrayPath) {
  const arr = getValue(doc, arrayPath);
  const conds = collectArrayConditions(query, arrayPath);
  if (!Array.isArray(arr) || conds.length === 0) return -1;
  return arr.findIndex((el) =>
    conds.every((c) => {
      if (c.elem) return matchElement(el, c.elem);
      if (c.sub === '') return isOperatorObject(c.cond) ? matchOperators([el], c.cond) : matchEquality([el], c.cond);
      return isPlainObject(el) && matchField(el, c.sub, c.cond);
    })
  );
}

function arrayFilterMatches(el, ident, arrayFilters) {
  const filter = (arrayFilters || []).find((f) => Object.keys(f).some((k) => k === ident || k.startsWith(`${ident}.`)));
  if (!filter) throw new CommandError(`No array filter found for identifier '${ident}'`);
  return Object.entries(filter).every(([k, cond]) => {
    if (k === ident) return isOperatorObject(cond) ? matchOperators([el], cond) : matchEquality([el], cond);
    return isPlainObject(el) && matchField(el, k.slice(ident.length + 1), cond);
  });
}

function concretePaths(doc, path, query, arrayFilters) {
  const parts = path.split('.');
  const idx = parts.findIndex((p) => p === '$' || p.startsWith('$['));
  if (idx === -1) return [path];
  const prefix = parts.slice(0, idx).join('.');
  const rest = parts.slice(idx + 1).join('.');
  const token = parts[idx];
  const arr = getValue(doc, prefix);
  let indexes = [];
  if (token === '$') {
    const i = positionalIndex(doc, query, prefix);
    if (i === -1) throw new CommandError('The positional operator did not find the match needed from the query.', 2, 'BadValue');
    indexes = [i];
  } else if (Array.isArray(arr)) {
    const ident = token.slice(2, -1);
    indexes = arr.map((_, i) => i).filter((i) => ident === '' || arrayFilterMatches(arr[i], ident, arrayFilters));
  }
  return indexes.flatMap((i) => concretePaths(doc, [prefix, String(i), rest].filter(Boolean).join('.'), query, arrayFilters));
}

function pullMatches(el, cond) {
  if (isOperatorObject(cond)) return matchOperators([el], cond);
  if (isPlainObject(cond)) return isPlainObject(el) && matchDocument(el, cond);
  return equals(el, cond);
}

function applyOperator(doc, op, path, value, isInsert) {
  switch (op) {
    case '$set':
      setValue(doc, path, clone(value));
      break;
    case '$setOnInsert':
      if (isInsert) setValue(doc, path, clone(value));
      break;
    case '$unset':
      unsetValue(doc, path);
      break;
    case '$inc': {
      const cur = getValue(doc, path);
      setValue(doc, path, (cur === undefined || cur === null ? 0 : toNumber(cur)) + toNumber(value));
      break;
    }
    case '$mul': {
      const cur = getValue(doc, path);
      setValue(doc, path, (cur === undefined || cur === null ? 0 : toNumber(cur)) * toNumber(value));
      break;
    }
    case '$min':
    case '$max': {
      const cur = getValue(doc, path);
      const cmp = cur === undefined ? null : compareValues(value, cur);
      if (cmp === null || (op === '$min' ? cmp < 0 : cmp > 0)) setValue(doc, path, clone(value));
      break;
    }
    case '$currentDate':
      setValue(doc, path, new Date());
      break;
    case '$rename': {
      const cur = getValue(doc, path);
      if (cur !== undefined) {
        unsetValue(doc, path);
        setValue(doc, value, cur);
      }
      break;
    }
    case '$push':
    case '$addToSet': {
      let arr = getValue(doc, path);
      if (arr === undefined || arr === null) {
        arr = [];
        setValue(doc, path, arr);
      }
      if (!Array.isArray(arr)) throw new CommandError(`The field '${path}' must be an array`, 2, 'BadValue');
      const hasEach = isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, '$each');
      const items = (hasEach ? value.$each : [value]).map(clone);
      if (op === '$addToSet') {
        for (const item of items) if (!arr.some((x) => equals(x, item))) arr.push(item);
      } else {
        const position = hasEach && value.$position !== undefined ? toNumber(value.$position) : arr.length;
        arr.splice(position, 0, ...items);
        if (hasEach && value.$slice !== undefined) {
          const n = toNumber(value.$slice);
          const sliced = n >= 0 ? arr.slice(0, n) : arr.slice(n);
          arr.splice(0, arr.length, ...sliced);
        }
      }
      break;
    }
    case '$pull': {
      const arr = getValue(doc, path);
      if (Array.isArray(arr)) {
        const kept = arr.filter((el) => !pullMatches(el, value));
        arr.splice(0, arr.length, ...kept);
      }
      break;
    }
    case '$pullAll': {
      const arr = getValue(doc, path);
      if (Array.isArray(arr)) {
        const kept = arr.filter((el) => !value.some((v) => equals(el, v)));
        arr.splice(0, arr.length, ...kept);
      }
      break;
    }
    case '$pop': {
      const arr = getValue(doc, path);
      if (Array.isArray(arr) && arr.length) {
        if (toNumber(value) === -1) arr.shift();
        else arr.pop();
      }
      break;
    }
    default:
      throw new CommandError(`mongo-lite: operatore di aggiornamento non supportato ${op}`, 9, 'FailedToParse');
  }
}

function applyUpdate(doc, update, { query, isInsert = false, arrayFilters } = {}) {
  if (Array.isArray(update)) throw new CommandError('mongo-lite: pipeline di aggiornamento non supportate', 2, 'BadValue');
  const keys = Object.keys(update || {});
  if (keys.length && !keys[0].startsWith('$')) {
    const id = doc._id;
    for (const k of Object.keys(doc)) delete doc[k];
    Object.assign(doc, clone(update));
    if (id !== undefined) doc._id = id;
    return;
  }
  for (const [op, fields] of Object.entries(update)) {
    for (const [rawPath, value] of Object.entries(fields || {})) {
      for (const path of concretePaths(doc, rawPath, query, arrayFilters)) {
        applyOperator(doc, op, path, value, isInsert);
      }
    }
  }
}

function upsertSeed(query, doc = {}) {
  for (const [key, cond] of Object.entries(query || {})) {
    if (key === '$and') cond.forEach((q) => upsertSeed(q, doc));
    else if (key.startsWith('$')) continue;
    else if (!isOperatorObject(cond)) setValue(doc, key, clone(cond));
    else if (Object.prototype.hasOwnProperty.call(cond, '$eq')) setValue(doc, key, clone(cond.$eq));
  }
  return doc;
}

// ---------------------------------------------------------------- proiezione, ordinamento

function copyPath(src, dest, parts) {
  if (!isPlainObject(src)) return;
  const [head, ...rest] = parts;
  if (!Object.prototype.hasOwnProperty.call(src, head)) return;
  const value = src[head];
  if (rest.length === 0) {
    dest[head] = clone(value);
  } else if (Array.isArray(value)) {
    const target = Array.isArray(dest[head]) ? dest[head] : [];
    value.forEach((el, i) => {
      if (!isPlainObject(el)) return;
      target[i] = target[i] || {};
      copyPath(el, target[i], rest);
    });
    dest[head] = target.filter((x) => x !== undefined);
  } else if (isPlainObject(value)) {
    dest[head] = isPlainObject(dest[head]) ? dest[head] : {};
    copyPath(value, dest[head], rest);
  }
}

function removePath(doc, parts) {
  if (!isPlainObject(doc)) return;
  const [head, ...rest] = parts;
  if (rest.length === 0) {
    delete doc[head];
    return;
  }
  const value = doc[head];
  if (Array.isArray(value)) value.forEach((el) => removePath(el, rest));
  else removePath(value, rest);
}

function project(doc, projection) {
  if (!projection || Object.keys(projection).length === 0) return doc;
  const entries = Object.entries(projection);
  const included = entries.filter(([k, v]) => k !== '_id' && v !== 0 && v !== false);
  const sliceOps = included.filter(([, v]) => isPlainObject(v) && v.$slice !== undefined);
  const inclusion = included.filter(([, v]) => !isPlainObject(v));
  let out;
  if (inclusion.length > 0) {
    out = {};
    if (projection._id !== 0 && projection._id !== false && doc._id !== undefined) out._id = doc._id;
    for (const [path] of inclusion) copyPath(doc, out, path.split('.'));
  } else {
    out = clone(doc);
    for (const [path, v] of entries) if (v === 0 || v === false) removePath(out, path.split('.'));
  }
  for (const [path, v] of sliceOps) {
    const arr = getValue(doc, path);
    if (Array.isArray(arr)) {
      const n = Array.isArray(v.$slice) ? v.$slice : [v.$slice];
      const sliced = n.length === 2 ? arr.slice(n[0], n[0] + n[1]) : n[0] >= 0 ? arr.slice(0, n[0]) : arr.slice(n[0]);
      setValue(out, path, clone(sliced));
    }
  }
  return out;
}

function sortDocs(docs, sort) {
  const keys = Object.entries(sort || {}).filter(([k]) => k !== '$natural');
  if (keys.length === 0) return docs;
  return docs
    .map((d, i) => ({ d, i }))
    .sort((x, y) => {
      for (const [path, dir] of keys) {
        const direction = toNumber(dir) < 0 ? -1 : 1;
        const vx = resolvePath(x.d, path.split('.'));
        const vy = resolvePath(y.d, path.split('.'));
        const c = compareValues(vx.length ? vx[0] : null, vy.length ? vy[0] : null);
        if (c !== 0) return c * direction;
      }
      return x.i - y.i;
    })
    .map((x) => x.d);
}

// ---------------------------------------------------------------- aggregazione

function evalExpression(doc, expr) {
  if (typeof expr === 'string' && expr.startsWith('$')) return getValue(doc, expr.slice(1));
  if (Array.isArray(expr)) return expr.map((e) => evalExpression(doc, e));
  if (isOperatorObject(expr)) {
    const [op, arg] = Object.entries(expr)[0];
    switch (op) {
      case '$size': {
        const v = evalExpression(doc, arg);
        return Array.isArray(v) ? v.length : 0;
      }
      case '$ifNull': {
        const [a, b] = arg;
        const v = evalExpression(doc, a);
        return v === null || v === undefined ? evalExpression(doc, b) : v;
      }
      case '$literal':
        return arg;
      default:
        throw new CommandError(`mongo-lite: espressione non supportata ${op}`, 168, 'InvalidPipelineOperator');
    }
  }
  if (isPlainObject(expr)) {
    const out = {};
    for (const [k, v] of Object.entries(expr)) out[k] = evalExpression(doc, v);
    return out;
  }
  return expr;
}

function accumulate(docs, spec) {
  const [op, arg] = Object.entries(spec)[0];
  const values = docs.map((d) => evalExpression(d, arg));
  const nums = values.filter((v) => bsonType(v) === 'number').map(toNumber);
  switch (op) {
    case '$sum':
      if (typeof arg === 'number') return arg * docs.length;
      return nums.reduce((a, b) => a + b, 0);
    case '$avg':
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    case '$min':
      return values.filter((v) => v !== null && v !== undefined).sort(compareValues)[0] ?? null;
    case '$max':
      return values.filter((v) => v !== null && v !== undefined).sort(compareValues).pop() ?? null;
    case '$first':
      return values[0] ?? null;
    case '$last':
      return values[values.length - 1] ?? null;
    case '$push':
      return values;
    case '$addToSet':
      return values.filter((v, i) => values.findIndex((w) => equals(v, w)) === i);
    case '$count':
      return docs.length;
    default:
      throw new CommandError(`mongo-lite: accumulatore non supportato ${op}`, 15952, 'Location15952');
  }
}

// ---------------------------------------------------------------- motore

function duplicateKeyError(dbName, collName, index, keyValue) {
  const pretty = Object.entries(keyValue)
    .map(([k, v]) => `${k}: ${v instanceof Object && v.toHexString ? `ObjectId('${v.toHexString()}')` : JSON.stringify(v)}`)
    .join(', ');
  return new CommandError(
    `E11000 duplicate key error collection: ${dbName}.${collName} index: ${index.name} dup key: { ${pretty} }`,
    11000,
    'DuplicateKey',
    { keyPattern: index.key, keyValue }
  );
}

class Engine {
  constructor() {
    this.dbs = new Map();
    this.ttlTimer = setInterval(() => this.sweepTtl(), 15000);
    this.ttlTimer.unref();
  }

  close() {
    clearInterval(this.ttlTimer);
  }

  collection(dbName, name, create = true) {
    if (!this.dbs.has(dbName)) {
      if (!create) return null;
      this.dbs.set(dbName, new Map());
    }
    const db = this.dbs.get(dbName);
    if (!db.has(name)) {
      if (!create) return null;
      db.set(name, { name, docs: [], indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }] });
    }
    return db.get(name);
  }

  sweepTtl() {
    const now = Date.now();
    for (const db of this.dbs.values()) {
      for (const coll of db.values()) {
        for (const index of coll.indexes) {
          if (index.expireAfterSeconds === undefined) continue;
          const field = Object.keys(index.key)[0];
          coll.docs = coll.docs.filter((d) => {
            const v = getValue(d, field);
            return !(v instanceof Date) || v.getTime() + toNumber(index.expireAfterSeconds) * 1000 > now;
          });
        }
      }
    }
  }

  checkUnique(dbName, coll, doc, ignore) {
    for (const index of coll.indexes) {
      if (!index.unique && index.name !== '_id_') continue;
      if (index.partialFilterExpression && !matchDocument(doc, index.partialFilterExpression)) continue;
      const fields = Object.keys(index.key);
      const values = fields.map((f) => resolvePath(doc, f.split('.')));
      if (index.sparse && values.every((v) => v.length === 0)) continue;
      const key = values.map((v) => (v.length ? v[0] : null));
      const clash = coll.docs.find((other) => {
        if (other === ignore) return false;
        if (index.partialFilterExpression && !matchDocument(other, index.partialFilterExpression)) return false;
        return fields.every((f, i) => {
          const ov = resolvePath(other, f.split('.'));
          return equals(ov.length ? ov[0] : null, key[i]);
        });
      });
      if (clash) {
        const keyValue = {};
        fields.forEach((f, i) => (keyValue[f] = key[i]));
        throw duplicateKeyError(dbName, coll.name, index, keyValue);
      }
    }
  }

  command(dbName, cmd, ctx = {}) {
    const name = Object.keys(cmd)[0];
    const handler = COMMANDS[name] || COMMANDS[name.toLowerCase()];
    if (!handler) return { ok: 0, errmsg: `no such command: '${name}'`, code: 59, codeName: 'CommandNotFound' };
    try {
      return handler.call(this, dbName, cmd, ctx);
    } catch (err) {
      if (err instanceof CommandError) {
        return { ok: 0, errmsg: err.message, code: err.code, codeName: err.codeName, ...err.extra };
      }
      return { ok: 0, errmsg: err.message, code: 1, codeName: 'InternalError' };
    }
  }

  writeOne(dbName, coll, doc, ignore) {
    this.checkUnique(dbName, coll, doc, ignore);
  }

  aggregate(dbName, collName, pipeline) {
    const coll = this.collection(dbName, collName, false);
    let docs = coll ? coll.docs.slice() : [];
    for (const stage of pipeline) {
      const [op, arg] = Object.entries(stage)[0];
      switch (op) {
        case '$match':
          docs = docs.filter((d) => matchDocument(d, arg));
          break;
        case '$sort':
          docs = sortDocs(docs, arg);
          break;
        case '$skip':
          docs = docs.slice(toNumber(arg));
          break;
        case '$limit':
          docs = docs.slice(0, toNumber(arg));
          break;
        case '$count':
          docs = docs.length ? [{ [arg]: docs.length }] : [];
          break;
        case '$project': {
          const computed = Object.entries(arg).some(([, v]) => (typeof v === 'string' && v.startsWith('$')) || isPlainObject(v));
          docs = computed
            ? docs.map((d) => {
                const out = arg._id === 0 || arg._id === false ? {} : { _id: d._id };
                for (const [k, v] of Object.entries(arg)) {
                  if (k === '_id') continue;
                  out[k] = v === 1 || v === true ? clone(getValue(d, k)) : evalExpression(d, v);
                }
                return out;
              })
            : docs.map((d) => project(d, arg));
          break;
        }
        case '$addFields':
        case '$set':
          docs = docs.map((d) => {
            const out = clone(d);
            for (const [k, v] of Object.entries(arg)) setValue(out, k, evalExpression(d, v));
            return out;
          });
          break;
        case '$unwind': {
          const spec = typeof arg === 'string' ? { path: arg } : arg;
          const path = spec.path.slice(1);
          docs = docs.flatMap((d) => {
            const arr = getValue(d, path);
            if (Array.isArray(arr) && arr.length) {
              return arr.map((el) => {
                const out = clone(d);
                setValue(out, path, clone(el));
                return out;
              });
            }
            return spec.preserveNullAndEmptyArrays ? [d] : [];
          });
          break;
        }
        case '$group': {
          const groups = [];
          for (const d of docs) {
            const key = evalExpression(d, arg._id);
            let g = groups.find((x) => equals(x.key, key));
            if (!g) groups.push((g = { key, docs: [] }));
            g.docs.push(d);
          }
          docs = groups.map((g) => {
            const out = { _id: g.key === undefined ? null : g.key };
            for (const [k, spec] of Object.entries(arg)) if (k !== '_id') out[k] = accumulate(g.docs, spec);
            return out;
          });
          break;
        }
        case '$lookup': {
          if (arg.pipeline) throw new CommandError('mongo-lite: $lookup con pipeline non supportato');
          const foreign = this.collection(dbName, arg.from, false);
          const fdocs = foreign ? foreign.docs : [];
          docs = docs.map((d) => {
            const local = expandArrays(resolvePath(d, arg.localField.split('.')));
            const matches = fdocs.filter((fd) =>
              expandArrays(resolvePath(fd, arg.foreignField.split('.'))).some((v) => local.some((l) => equals(l, v)))
            );
            return { ...d, [arg.as]: matches.map(clone) };
          });
          break;
        }
        default:
          throw new CommandError(`mongo-lite: stadio di aggregazione non supportato ${op}`, 40324, 'Location40324');
      }
    }
    return docs;
  }
}

const cursorReply = (dbName, collName, batch) => ({
  cursor: { firstBatch: batch, id: Long.ZERO, ns: `${dbName}.${collName}` },
  ok: 1,
});

const COMMANDS = {
  hello(dbName, cmd, ctx) {
    return {
      helloOk: true,
      ismaster: true,
      isWritablePrimary: true,
      maxBsonObjectSize: 16 * 1024 * 1024,
      maxMessageSizeBytes: 48000000,
      maxWriteBatchSize: 100000,
      localTime: new Date(),
      logicalSessionTimeoutMinutes: 30,
      connectionId: ctx.connectionId || 1,
      minWireVersion: 0,
      maxWireVersion: 21,
      readOnly: false,
      ok: 1,
    };
  },
  ismaster(...args) {
    return COMMANDS.hello.apply(this, args);
  },
  ping: () => ({ ok: 1 }),
  buildinfo: () => ({ version: '7.0.0-mongo-lite', versionArray: [7, 0, 0, 0], ok: 1 }),
  getparameter: () => ({ ok: 1 }),
  endsessions: () => ({ ok: 1 }),
  killcursors: (dbName, cmd) => ({ cursorsKilled: cmd.cursors || [], ok: 1 }),
  getmore: (dbName, cmd) => ({ cursor: { nextBatch: [], id: Long.ZERO, ns: `${dbName}.${cmd.collection}` }, ok: 1 }),
  listdatabases() {
    return { databases: [...this.dbs.keys()].map((name) => ({ name, sizeOnDisk: 0, empty: false })), ok: 1 };
  },

  create(dbName, cmd) {
    this.collection(dbName, cmd.create);
    return { ok: 1 };
  },
  drop(dbName, cmd) {
    const db = this.dbs.get(dbName);
    if (db) db.delete(cmd.drop);
    return { ok: 1 };
  },
  dropdatabase(dbName) {
    this.dbs.delete(dbName);
    return { ok: 1 };
  },
  listcollections(dbName, cmd) {
    const db = this.dbs.get(dbName) || new Map();
    const items = [...db.keys()]
      .map((name) => ({ name, type: 'collection', options: {}, info: { readOnly: false } }))
      .filter((c) => matchDocument(c, cmd.filter || {}));
    return cursorReply(dbName, '$cmd.listCollections', items);
  },
  createindexes(dbName, cmd) {
    const coll = this.collection(dbName, cmd.createIndexes);
    const before = coll.indexes.length;
    for (const index of cmd.indexes) {
      if (coll.indexes.some((i) => i.name === index.name)) continue;
      const created = { v: 2, ...clone(index) };
      if (created.unique) {
        // Verifica che i dati già presenti rispettino il nuovo indice unico.
        const probe = { ...coll, indexes: [created], docs: [] };
        for (const doc of coll.docs) {
          this.checkUnique(dbName, probe, doc, null);
          probe.docs.push(doc);
        }
      }
      coll.indexes.push(created);
    }
    return { createdCollectionAutomatically: false, numIndexesBefore: before, numIndexesAfter: coll.indexes.length, ok: 1 };
  },
  listindexes(dbName, cmd) {
    const coll = this.collection(dbName, cmd.listIndexes, false);
    if (!coll) return { ok: 0, errmsg: `ns does not exist: ${dbName}.${cmd.listIndexes}`, code: 26, codeName: 'NamespaceNotFound' };
    return cursorReply(dbName, cmd.listIndexes, coll.indexes.map(clone));
  },
  dropindexes(dbName, cmd) {
    const coll = this.collection(dbName, cmd.dropIndexes, false);
    if (coll) {
      coll.indexes = coll.indexes.filter((i) => i.name === '_id_' || (cmd.index !== '*' && i.name !== cmd.index));
    }
    return { ok: 1 };
  },

  find(dbName, cmd) {
    const coll = this.collection(dbName, cmd.find, false);
    let docs = coll ? coll.docs.filter((d) => matchDocument(d, cmd.filter || {})) : [];
    docs = sortDocs(docs, cmd.sort);
    if (cmd.skip) docs = docs.slice(toNumber(cmd.skip));
    if (cmd.limit) docs = docs.slice(0, Math.abs(toNumber(cmd.limit)));
    return cursorReply(dbName, cmd.find, docs.map((d) => project(d, cmd.projection)));
  },
  count(dbName, cmd) {
    const coll = this.collection(dbName, cmd.count, false);
    let docs = coll ? coll.docs.filter((d) => matchDocument(d, cmd.query || {})) : [];
    if (cmd.skip) docs = docs.slice(toNumber(cmd.skip));
    if (cmd.limit) docs = docs.slice(0, toNumber(cmd.limit));
    return { n: docs.length, ok: 1 };
  },
  distinct(dbName, cmd) {
    const coll = this.collection(dbName, cmd.distinct, false);
    const docs = coll ? coll.docs.filter((d) => matchDocument(d, cmd.query || {})) : [];
    const values = [];
    for (const d of docs) {
      for (const v of expandArrays(resolvePath(d, cmd.key.split('.')))) {
        if (!Array.isArray(v) && !values.some((x) => equals(x, v))) values.push(v);
      }
    }
    return { values, ok: 1 };
  },
  aggregate(dbName, cmd) {
    return cursorReply(dbName, cmd.aggregate, this.aggregate(dbName, cmd.aggregate, cmd.pipeline || []));
  },

  insert(dbName, cmd) {
    const coll = this.collection(dbName, cmd.insert);
    const writeErrors = [];
    let n = 0;
    (cmd.documents || []).some((raw, index) => {
      const doc = clone(raw);
      if (doc._id === undefined) doc._id = new ObjectId();
      try {
        this.writeOne(dbName, coll, doc, null);
        coll.docs.push(doc);
        n++;
        return false;
      } catch (err) {
        if (!(err instanceof CommandError)) throw err;
        writeErrors.push({ index, code: err.code, errmsg: err.message, ...err.extra });
        return cmd.ordered !== false;
      }
    });
    return writeErrors.length ? { n, writeErrors, ok: 1 } : { n, ok: 1 };
  },
  update(dbName, cmd) {
    const coll = this.collection(dbName, cmd.update);
    const writeErrors = [];
    const upserted = [];
    let n = 0;
    let nModified = 0;
    (cmd.updates || []).some((spec, index) => {
      try {
        const matched = coll.docs.filter((d) => matchDocument(d, spec.q));
        const targets = spec.multi ? matched : matched.slice(0, 1);
        if (targets.length === 0 && spec.upsert) {
          const doc = upsertSeed(spec.q);
          applyUpdate(doc, spec.u, { query: spec.q, isInsert: true, arrayFilters: spec.arrayFilters });
          if (doc._id === undefined) doc._id = new ObjectId();
          this.writeOne(dbName, coll, doc, null);
          coll.docs.push(doc);
          upserted.push({ index, _id: doc._id });
          n++;
        }
        for (const target of targets) {
          const next = clone(target);
          applyUpdate(next, spec.u, { query: spec.q, arrayFilters: spec.arrayFilters });
          this.writeOne(dbName, coll, next, target);
          n++;
          if (!equals(next, target)) {
            nModified++;
            coll.docs[coll.docs.indexOf(target)] = next;
          }
        }
        return false;
      } catch (err) {
        if (!(err instanceof CommandError)) throw err;
        writeErrors.push({ index, code: err.code, errmsg: err.message, ...err.extra });
        return cmd.ordered !== false;
      }
    });
    const reply = { n, nModified, ok: 1 };
    if (upserted.length) reply.upserted = upserted;
    if (writeErrors.length) reply.writeErrors = writeErrors;
    return reply;
  },
  delete(dbName, cmd) {
    const coll = this.collection(dbName, cmd.delete, false);
    let n = 0;
    if (coll) {
      for (const spec of cmd.deletes || []) {
        const matched = coll.docs.filter((d) => matchDocument(d, spec.q));
        const targets = toNumber(spec.limit) === 1 ? matched.slice(0, 1) : matched;
        coll.docs = coll.docs.filter((d) => !targets.includes(d));
        n += targets.length;
      }
    }
    return { n, ok: 1 };
  },
  findandmodify(dbName, cmd) {
    const collName = cmd.findAndModify || cmd.findandmodify;
    const coll = this.collection(dbName, collName);
    const matched = sortDocs(
      coll.docs.filter((d) => matchDocument(d, cmd.query || {})),
      cmd.sort
    );
    const target = matched[0];
    const shape = (doc) => (doc ? project(doc, cmd.fields) : null);
    if (cmd.remove) {
      if (target) coll.docs = coll.docs.filter((d) => d !== target);
      return { lastErrorObject: { n: target ? 1 : 0 }, value: shape(target), ok: 1 };
    }
    if (!target) {
      if (!cmd.upsert) return { lastErrorObject: { n: 0, updatedExisting: false }, value: null, ok: 1 };
      const doc = upsertSeed(cmd.query);
      applyUpdate(doc, cmd.update, { query: cmd.query, isInsert: true, arrayFilters: cmd.arrayFilters });
      if (doc._id === undefined) doc._id = new ObjectId();
      this.writeOne(dbName, coll, doc, null);
      coll.docs.push(doc);
      return { lastErrorObject: { n: 1, updatedExisting: false, upserted: doc._id }, value: cmd.new ? shape(doc) : null, ok: 1 };
    }
    const next = clone(target);
    applyUpdate(next, cmd.update, { query: cmd.query, arrayFilters: cmd.arrayFilters });
    this.writeOne(dbName, coll, next, target);
    coll.docs[coll.docs.indexOf(target)] = next;
    return { lastErrorObject: { n: 1, updatedExisting: true }, value: shape(cmd.new ? next : target), ok: 1 };
  },
};

module.exports = {
  Engine,
  CommandError,
  // Esportate per i test dell'emulatore.
  matchDocument,
  applyUpdate,
  compareValues,
  equals,
  project,
  sortDocs,
};
