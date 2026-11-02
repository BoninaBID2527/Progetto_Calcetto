'use strict';

/*
 * BONRATING: algoritmo dell'overall, documentato in docs/ARCHITETTURA.md.
 * Solo funzioni pure, così ogni passaggio è verificabile nei test.
 */

const ATTRIBUTES = ['vel', 'tir', 'pas', 'dri', 'dif', 'fis'];
const PRIOR = 5; // voto "neutro" di partenza
const K_GENERAL = 4; // voti fantasma per il voto generale
const K_ATTRIBUTE = 3; // voti fantasma per ogni attributo
const MIN_ATTRIBUTE_SAMPLES = 3; // sotto questa soglia l'attributo è "provvisorio"
const MIN_ATTRIBUTES_FOR_TECHNICAL = 3; // attributi valutati necessari per l'overall tecnico
const PROVISIONAL_MATCHES = 3;
const PROVISIONAL_RATINGS = 5;

const WEIGHTS = {
  portiere: { vel: 15, tir: 5, pas: 20, dri: 5, dif: 30, fis: 25 },
  difensore: { vel: 15, tir: 5, pas: 15, dri: 5, dif: 35, fis: 25 },
  centrocampista: { vel: 15, tir: 15, pas: 30, dri: 20, dif: 10, fis: 10 },
  attaccante: { vel: 20, tir: 35, pas: 10, dri: 20, dif: 5, fis: 10 },
  default: { vel: 1, tir: 1, pas: 1, dri: 1, dif: 1, fis: 1 },
};

/** Media bayesiana: con pochi voti resta vicina a 5, con molti segue i voti reali. */
function bayes(sum, n, k, prior = PRIOR) {
  return (sum + k * prior) / (n + k);
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const toCardScale = (v) => Math.round(clamp(v * 10, 10, 99));

/** Attributi su scala 10-99 con numero di campioni; null se mai valutati. */
function attributesFrom(attributeVotes) {
  const out = {};
  for (const key of ATTRIBUTES) {
    const values = attributeVotes.map((a) => a?.[key]).filter((v) => typeof v === 'number');
    out[key] = values.length
      ? {
          value: toCardScale(bayes(values.reduce((a, b) => a + b, 0), values.length, K_ATTRIBUTE)),
          raw: bayes(values.reduce((a, b) => a + b, 0), values.length, K_ATTRIBUTE),
          samples: values.length,
          provisional: values.length < MIN_ATTRIBUTE_SAMPLES,
        }
      : null;
  }
  return out;
}

/** Overall tecnico (scala 1-10) dagli attributi disponibili, pesati per ruolo. */
function technicalFrom(attributes, role) {
  const available = ATTRIBUTES.filter((k) => attributes[k]);
  if (available.length < MIN_ATTRIBUTES_FOR_TECHNICAL) return null;
  const w = WEIGHTS[role] || WEIGHTS.default;
  const totalWeight = available.reduce((s, k) => s + w[k], 0);
  return available.reduce((s, k) => s + attributes[k].raw * w[k], 0) / totalWeight;
}

/**
 * @param {object} p
 * @param {number[]} p.ratings      tutti i voti 1-10 ricevuti
 * @param {number[]} p.perMatch     media dei voti per partita, in ordine cronologico (null se non votata)
 * @param {object[]} p.attributeVotes  voti per attributo ricevuti
 * @param {string|null} p.role
 * @param {number} p.played
 */
function overall({ ratings, perMatch, attributeVotes, role, played }) {
  const general = bayes(ratings.reduce((a, b) => a + b, 0), ratings.length, K_GENERAL);
  const attributes = attributesFrom(attributeVotes);
  const technical = technicalFrom(attributes, role);
  const recent = perMatch.filter((v) => v !== null).slice(-5);
  const form = recent.length ? clamp(recent.reduce((a, b) => a + b, 0) / recent.length - general, -1, 1) : 0;
  const base = technical !== null ? 0.6 * general + 0.4 * technical : general;
  return {
    value: Math.round(clamp(10 * (base + 0.5 * form), 40, 99)),
    provisional: played < PROVISIONAL_MATCHES || ratings.length < PROVISIONAL_RATINGS,
    general: Math.round(general * 10) / 10,
    technical: technical === null ? null : toCardScale(technical),
    form: Math.round(form * 100) / 100,
    samples: { ratings: ratings.length, matches: played, recentRated: recent.length },
    attributes,
  };
}

module.exports = {
  ATTRIBUTES,
  WEIGHTS,
  overall,
  attributesFrom,
  technicalFrom,
  bayes,
  constants: { PRIOR, K_GENERAL, K_ATTRIBUTE, MIN_ATTRIBUTE_SAMPLES, MIN_ATTRIBUTES_FOR_TECHNICAL, PROVISIONAL_MATCHES, PROVISIONAL_RATINGS },
};
