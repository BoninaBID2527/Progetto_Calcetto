'use strict';

/*
 * Riconoscimento sicuro delle immagini caricate: il tipo si decide dai primi
 * byte del file, mai dal nome o dal Content-Type dichiarato dal client.
 * Solo PNG, JPEG e WebP: niente SVG (può contenere script), GIF o altro.
 */
function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

const toDataUrl = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

module.exports = { sniffImage, toDataUrl };
