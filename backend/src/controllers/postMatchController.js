'use strict';

const teamService = require('../services/teamService');
const votingService = require('../services/votingService');
const rankingService = require('../services/rankingService');
const matchdayService = require('../services/matchdayService');
const awardsService = require('../services/awardsService');

const balance = async (req, res) => res.json(await teamService.autoBalance(req.match, { names: req.body?.names }));
const setTeams = async (req, res) => res.json(await teamService.setManual(req.match, req.body));
const setResult = async (req, res) => res.json({ match: await votingService.setResult(req.match, req.user, req.body) });

async function votingState(req, res) {
  await votingService.finalizeIfDue(req.match);
  res.json({ voting: await votingService.state(req.match._id, req.user) });
}

const mvpVote = async (req, res) => res.status(201).json({ voting: await votingService.castMvp(req.match, req.user, req.body.mvpUserId) });
const ratings = async (req, res) => res.json({ voting: await votingService.rate(req.match, req.user, req.body.ratings) });
const prizeVote = async (req, res) => res.status(201).json({ voting: await votingService.votePrize(req.match, req.user, req.body.option) });
const closeVoting = async (req, res) => res.json({ match: await votingService.closeNow(req.match) });

async function report(req, res) {
  await votingService.finalizeIfDue(req.match);
  res.json({ report: await votingService.report(req.match._id) });
}

const matchday = async (req, res) => res.json({ matchday: await matchdayService.forMatch(req.match) });
const rankings = async (req, res) => res.json(await rankingService.groupRankings(req.group, req.validQuery));

const awards = async (req, res) => {
  await votingService.finalizeIfDue(req.match);
  res.json({ awards: await awardsService.state(req.match._id, req.user) });
};
const awardVote = async (req, res) => res.status(201).json({ awards: await awardsService.vote(req.match, req.user, req.params.key, req.body.nominee) });
const awardAssign = async (req, res) => res.json({ awards: await awardsService.assign(req.match, req.params.key, req.body.userIds) });

module.exports = {
  awards,
  awardVote,
  awardAssign, matchday, balance, setTeams, setResult, votingState, mvpVote, ratings, prizeVote, closeVoting, report, rankings };
