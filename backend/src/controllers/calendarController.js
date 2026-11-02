'use strict';

const calendarService = require('../services/calendarService');
const seriesService = require('../services/seriesService');
const { badRequest } = require('../utils/AppError');

const range = async (req, res) => res.json(await calendarService.range(req.user, req.validQuery));
async function exportIcs(req, res) {
  const body = await calendarService.ics(req.user, { group: req.validQuery.group });
  res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="bonmatch.ics"', 'Cache-Control': 'private, no-store' });
  res.send(body);
}

const listSeries = async (req, res) => res.json({ series: await seriesService.list(req.group) });
const createSeries = async (req, res) => res.status(201).json(await seriesService.create(req.group, req.user, req.body));
const updateSeries = async (req, res) => res.json(await seriesService.update(req.params.seriesId, req.user, req.body));
const endSeries = async (req, res) => res.json(await seriesService.end(req.params.seriesId, req.user, { cancelFuture: req.validQuery.cancelFuture }));

const availability = async (req, res) => res.json(await calendarService.availability(req.group, req.user, req.validQuery));
const setAvailability = async (req, res) => res.json(await calendarService.setAvailability(req.group, req.user, req.params.date, req.body.status));
const clearAvailability = async (req, res, next) => {
  if (!req.params.date) return next(badRequest('Data mancante.'));
  return res.json(await calendarService.setAvailability(req.group, req.user, req.params.date, null));
};

module.exports = { range, exportIcs, listSeries, createSeries, updateSeries, endSeries, availability, setAvailability, clearAvailability };
