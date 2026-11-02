import { APP_NAME } from '../../config';
import { initials } from '../../utils/format';
import { ATTR_LABEL, ROLE_SHORT } from './PlayerCard';

// Colori per edizione (sfondo, accento, testo) usati anche nell'immagine esportata.
const THEME = {
  base: ['#19251E', '#24332A', '#C7FF36', '#F4F8F2'],
  in_forma: ['#1E3A12', '#2E5A10', '#C7FF36', '#F4F8F2'],
  mvp: ['#3A2E10', '#6B5418', '#F5D98C', '#F4F8F2'],
  bomber: ['#3A1A12', '#6B2A18', '#FF8466', '#F4F8F2'],
  tots: ['#10253A', '#1A3F5E', '#6FD3FF', '#F4F8F2'],
  leggenda: ['#0B0B0B', '#2A2310', '#F5D98C', '#F5D98C'],
};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Disegna la BONCARD in formato verticale 1080×1920 (storie social) e restituisce un PNG. */
export async function exportCardPng(card) {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await Promise.all(['800 160px "Barlow Condensed"', '700 60px "Barlow Condensed"', '600 40px Inter'].map((f) => document.fonts?.load(f).catch(() => null)));
  const [bg1, bg2, accent, text] = THEME[card.edition.key] || THEME.base;

  ctx.fillStyle = '#090D0C';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 520, 50, W / 2, 520, 900);
  glow.addColorStop(0, `${accent}33`);
  glow.addColorStop(1, '#090D0C00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Sagoma della carta: rettangolo con angoli smussati in diagonale.
  const x = 120;
  const y = 220;
  const w = 840;
  const h = 1176;
  const cut = 70;
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, bg2);
  grad.addColorStop(1, bg1);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = `${accent}22`;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.55, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const t = (value, px, py, font, color = text, align = 'left') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, px, py);
  };
  t(String(card.overall.value), x + 80, y + 200, '800 170px "Barlow Condensed"', accent);
  t(ROLE_SHORT[card.user.preferredRole] || '—', x + 86, y + 260, '700 56px "Barlow Condensed"');
  if (card.overall.provisional) t('PROVVISORIO', x + 86, y + 305, '600 26px Inter', text);
  t(card.edition.label.toUpperCase(), x + w - 70, y + 110, '700 48px "Barlow Condensed"', accent, 'right');

  // Foto o iniziali.
  const cx = x + w - 260;
  const cy = y + 360;
  const r = 190;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const img = card.user.avatarUrl ? await loadImage(card.user.avatarUrl) : null;
  if (img) ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  else {
    ctx.fillStyle = card.user.avatarColor || accent;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    t(initials(card.user.name), cx, cy + 50, '800 150px "Barlow Condensed"', '#090D0C', 'center');
  }
  ctx.restore();

  t(card.user.name.toUpperCase(), x + w / 2, y + 660, '800 92px "Barlow Condensed"', text, 'center');
  if (card.user.nickname) t(`«${card.user.nickname}»`, x + w / 2, y + 720, '600 40px Inter', accent, 'center');

  const attrs = Object.entries(ATTR_LABEL);
  attrs.forEach(([k, label], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const px = x + 150 + col * 270;
    const py = y + 830 + row * 120;
    const a = card.attributes[k];
    t(a ? String(a.value) : '—', px, py, '800 84px "Barlow Condensed"', a ? text : '#A7B5AC', 'center');
    t(label, px, py + 40, '700 34px "Barlow Condensed"', accent, 'center');
  });

  const s = card.stats;
  const stats = [
    ['PRE', s.played],
    ['GOL', s.goals],
    ['VIT', s.winRate === null ? '—' : `${Math.round(s.winRate * 100)}%`],
    ['MVP', s.mvp],
  ];
  stats.forEach(([label, value], i) => {
    const px = x + 130 + i * 195;
    t(String(value), px, y + 1110, '800 64px "Barlow Condensed"', text, 'center');
    t(label, px, y + 1145, '700 28px "Barlow Condensed"', '#A7B5AC', 'center');
  });

  t(APP_NAME, W / 2, 140, '800 72px "Barlow Condensed"', '#C7FF36', 'center');
  t(`${card.context} · ${card.season.label}`, W / 2, y + h + 110, '600 36px Inter', '#A7B5AC', 'center');
  t('Statistiche calcolate dalle partite registrate nel gruppo', W / 2, H - 120, '600 28px Inter', '#A7B5AC', 'center');

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Condivide un PNG con il menu di sistema, oppure lo scarica. */
export async function shareOrDownload(blob, filename, title) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
