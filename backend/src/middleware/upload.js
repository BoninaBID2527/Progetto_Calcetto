'use strict';

const multer = require('multer');
const { AppError, unprocessable } = require('../utils/AppError');

/**
 * Carica un solo file immagine in memoria (campo "file") con un limite di peso.
 * Il tipo reale si verifica poi dai primi byte; qui si rifiutano solo
 * richieste malformate o troppo grandi, con messaggi in italiano.
 */
function uploadImage(maxBytes) {
  const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 2 } }).single('file');
  return (req, res, next) => {
    parser(req, res, (err) => {
      if (!err) return req.file ? next() : next(unprocessable('Seleziona un file immagine.', { file: 'File mancante.' }));
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, 'PAYLOAD_TOO_LARGE', `Il file supera il limite di ${Math.round(maxBytes / 1024)} KB.`));
      }
      if (err instanceof multer.MulterError || /multipart|Boundary|Unexpected end/i.test(err.message)) {
        return next(unprocessable('Caricamento non valido: invia un solo file nel campo "file".', { file: 'Richiesta non valida.' }));
      }
      return next(err);
    });
  };
}

module.exports = { uploadImage };
