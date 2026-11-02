'use strict';

const groupService = require('../services/groupService');
const nicknameService = require('../services/nicknameService');
const dashboardService = require('../services/dashboardService');
const activityService = require('../services/activityService');
const seasonService = require('../services/seasonService');
const thirdHalfService = require('../services/thirdHalfService');
const cashboxService = require('../services/cashboxService');
const clubService = require('../services/clubService');
const hallOfFameService = require('../services/hallOfFameService');

const list = async (req, res) => res.json({ groups: await groupService.listMine(req.user) });
const create = async (req, res) => res.status(201).json({ group: await groupService.create(req.user, req.body) });
const preview = async (req, res) => res.json({ invite: await groupService.previewByCode(req.user, req.params.code) });
const join = async (req, res) => res.status(201).json({ group: await groupService.join(req.user, req.body.code) });
const show = async (req, res) => res.json({ group: groupService.summary(req.group, req.user._id) });
const update = async (req, res) => res.json({ group: await groupService.update(req.group, req.user, req.body) });
const regenerateCode = async (req, res) => res.json({ group: await groupService.regenerateCode(req.group, req.user) });
const members = async (req, res) => res.json({ members: await groupService.members(req.group) });
const prizeStats = async (req, res) => res.json({ prizes: await groupService.prizeStats(req.group) });

async function setRole(req, res) {
  res.json({ members: await groupService.setRole(req.group, req.params.userId, req.body.role) });
}

async function removeMember(req, res, next) {
  const self = req.params.userId === String(req.user._id);
  if (!self && req.membership.role !== 'admin') {
    const { forbidden } = require('../utils/AppError');
    return next(forbidden('Solo un admin può rimuovere un membro.'));
  }
  await groupService.removeMember(req.group, req.user, req.params.userId);
  return res.status(204).end();
}

const listNicknames = async (req, res) =>
  res.json({ nicknames: await nicknameService.list(req.group, { targetId: req.validQuery.userId }) });
const proposeNickname = async (req, res) =>
  res.status(201).json({ nickname: await nicknameService.propose(req.group, req.user, req.body.targetUserId, req.body.text) });
const rejectNickname = async (req, res) =>
  res.json({ nickname: await nicknameService.reject(req.group, req.user, req.params.nicknameId) });
const replaceNickname = async (req, res) =>
  res.status(201).json({ nickname: await nicknameService.replace(req.group, req.user, req.params.nicknameId, req.body.text) });
const removeNickname = async (req, res) =>
  res.json({ nickname: await nicknameService.remove(req.group, req.user, req.params.nicknameId) });

const dashboard = async (req, res) => res.json({ dashboard: await dashboardService.forUser(req.group, req.user) });
const activity = async (req, res) => res.json(await activityService.list(req.group._id, req.validQuery));

const listSeasons = async (req, res) => res.json({ mode: seasonService.settingsOf(req.group), seasons: await seasonService.list(req.group) });
async function createSeason(req, res, next) {
  if (seasonService.settingsOf(req.group).mode !== 'personalizzata') {
    return next(require('../utils/AppError').unprocessable('Le stagioni si creano a mano solo nella modalità personalizzata.'));
  }
  return res.status(201).json({ season: await seasonService.create(req.group, req.body) });
}
const removeSeason = async (req, res) => {
  await seasonService.remove(req.group, req.params.seasonId);
  res.status(204).end();
};
const hallOfFame = async (req, res) => res.json({ hallOfFame: await hallOfFameService.forGroup(req.group) });

const club = async (req, res) => res.json({ club: await clubService.profile(req.group) });
const setClubImage = (kind) => async (req, res) => res.json({ group: await clubService.setImage(req.group, req.user, kind, req.file) });
const removeClubImage = (kind) => async (req, res) => res.json({ group: await clubService.removeImage(req.group, req.user, kind) });

const cashbox = async (req, res) => res.json({ cashbox: await cashboxService.summary(req.group, req.user) });
const ledger = async (req, res) => res.json(await cashboxService.ledger(req.group, req.user, req.validQuery));
const createEntry = async (req, res) => res.status(201).json({ entry: await cashboxService.createEntry(req.group, req.user, req.body) });
const verifyEntry = async (req, res) => res.json({ entry: await cashboxService.verify(req.group, req.user, req.params.entryId) });
const cancelEntry = async (req, res) => res.json({ entry: await cashboxService.cancel(req.group, req.user, req.params.entryId, req.body.reason) });

const thirdHalf = async (req, res) => res.json({ thirdHalf: await thirdHalfService.forGroup(req.group, req.validQuery) });

module.exports = {
  thirdHalf,
  cashbox,
  ledger,
  createEntry,
  verifyEntry,
  cancelEntry,
  club,
  setClubImage,
  removeClubImage,
  listSeasons,
  createSeason,
  removeSeason,
  hallOfFame,
  dashboard,
  activity,
  list,
  create,
  preview,
  join,
  show,
  update,
  regenerateCode,
  members,
  prizeStats,
  setRole,
  removeMember,
  listNicknames,
  proposeNickname,
  rejectNickname,
  replaceNickname,
  removeNickname,
};
