'use strict';

// Test dell'emulatore di sviluppo: garantiscono che le query usate dall'app si comportino come in MongoDB.
const { ObjectId } = require('bson');
const { matchDocument, applyUpdate } = require('../dev/mongo-lite/engine');

describe('mongo-lite', () => {
  const id = new ObjectId();
  const doc = { _id: id, name: 'Luca', tags: ['a', 'b'], key: 'x', n: 3, parts: [{ user: id, response: 'ci_sono' }] };

  test('operatori di confronto, $in, $ne su array, $elemMatch', () => {
    expect(matchDocument(doc, { n: { $gte: 3, $lt: 4 } })).toBe(true);
    expect(matchDocument(doc, { tags: { $in: ['b'] } })).toBe(true);
    expect(matchDocument(doc, { 'parts.response': { $ne: 'attesa' } })).toBe(true);
    expect(matchDocument(doc, { parts: { $elemMatch: { user: new ObjectId(id.toHexString()), response: 'ci_sono' } } })).toBe(true);
  });

  test('$type, usato dagli indici parziali', () => {
    expect(matchDocument(doc, { key: { $type: 'string' } })).toBe(true);
    expect(matchDocument({ _id: id }, { key: { $type: 'string' } })).toBe(false);
    expect(matchDocument(doc, { _id: { $type: 'objectId' } })).toBe(true);
    expect(matchDocument(doc, { n: { $type: ['int', 'double'] } })).toBe(true);
  });

  test('aggiornamenti con arrayFilters e $inc', () => {
    const copy = JSON.parse(JSON.stringify({ parts: [{ user: 'a', response: 'forse' }, { user: 'b', response: 'forse' }], free: 1 }));
    applyUpdate(copy, { $set: { 'parts.$[me].response': 'ci_sono' }, $inc: { free: -1 } }, { arrayFilters: [{ 'me.user': 'b' }] });
    expect(copy.parts.map((p) => p.response)).toEqual(['forse', 'ci_sono']);
    expect(copy.free).toBe(0);
  });
});
