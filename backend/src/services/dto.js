'use strict';

const { User } = require('../models');
const { avatarColor, idOf } = require('../utils/helpers');

/** Dati pubblici di un utente: mai l'email. */
function publicUser(user, nickname = null) {
  if (!user) return null;
  return {
    id: idOf(user),
    name: user.name,
    avatarUrl: user.avatarUrl || null,
    avatarColor: avatarColor(user.name + idOf(user)),
    preferredRole: user.preferredRole || null,
    foot: user.foot || null,
    nickname,
  };
}

/** Dati dell'utente collegato, per sé stesso. */
function selfUser(user) {
  return {
    ...publicUser(user),
    email: user.email,
    settings: { nicknameMode: user.settings?.nicknameMode || 'accanto' },
    createdAt: user.createdAt,
  };
}

const formerMember = (id) => ({
  id: String(id),
  name: 'Ex membro',
  avatarUrl: null,
  avatarColor: '#9DB5AB',
  preferredRole: null,
  foot: null,
  nickname: null,
});

/**
 * Carica in un colpo solo gli utenti indicati e restituisce una funzione
 * id -> utente pubblico (con il soprannome attivo nel gruppo, se c'è).
 */
async function userResolver(ids, nicknames = new Map()) {
  const unique = [...new Set([...ids].filter(Boolean).map(String))];
  const users = unique.length ? await User.find({ _id: { $in: unique } }).lean() : [];
  const map = new Map(users.map((u) => [String(u._id), publicUser(u, nicknames.get(String(u._id)) || null)]));
  return (id) => (id ? map.get(String(id)) || formerMember(id) : null);
}

module.exports = { publicUser, selfUser, userResolver };
