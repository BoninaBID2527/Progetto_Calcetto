import { APP_NAME } from '../../config';
import { formatDateLong, formatTime } from '../../utils/format';

/**
 * Locandina MATCHDAY. Formato "verticale" 1080×1920 (storie) o "quadrato"
 * 1080×1080 (post). Contiene solo dati pensati per essere condivisi:
 * campo, data, squadre con nomi e soprannomi, mai email o quote personali.
 */
export async function exportPosterPng(matchday, format = 'verticale') {
  const W = 1080;
  const H = format === 'quadrato' ? 1080 : 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await Promise.all(['800 200px "Barlow Condensed"', '700 60px "Barlow Condensed"', '600 36px Inter'].map((f) => document.fonts?.load(f).catch(() => null)));
  const { match, field, teams } = matchday;
  const accent = field.color || '#C7FF36';

  ctx.fillStyle = '#090D0C';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createLinearGradient(0, 0, W, H * 0.6);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, '#090D0C00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(244,248,242,0.06)';
  ctx.lineWidth = 40;
  for (let i = -H; i < W + H; i += 120) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i - H * 0.6, H);
    ctx.stroke();
  }

  const t = (value, x, y, font, color = '#F4F8F2', align = 'left') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  const square = format === 'quadrato';
  const top = square ? 120 : 220;
  t(APP_NAME, 80, square ? 80 : 120, '800 54px "Barlow Condensed"', '#C7FF36');
  t('MATCHDAY', 80, top + (square ? 110 : 170), `800 ${square ? 150 : 220}px "Barlow Condensed"`);
  t(field.name.toUpperCase(), 80, top + (square ? 190 : 290), '800 80px "Barlow Condensed"', accent);
  t(`${formatDateLong(match.startsAt)} · ${formatTime(match.startsAt)}`, 80, top + (square ? 245 : 360), '600 38px Inter', '#A7B5AC');

  const name = (u) => (u.nickname ? `${u.nickname}` : u.name);
  const listTop = top + (square ? 330 : 520);
  if (match.teams) {
    const cols = [
      [match.teams.a, teams?.a, 80, 'left'],
      [match.teams.b, teams?.b, W - 80, 'right'],
    ];
    for (const [team, info, x, align] of cols) {
      t(team.name.toUpperCase(), x, listTop, '700 52px "Barlow Condensed"', '#F4F8F2', align);
      if (info?.avgOverall) t(`OVR ${info.avgOverall}`, x, listTop + 50, '700 36px "Barlow Condensed"', accent, align);
      team.players.slice(0, square ? 6 : 8).forEach((u, i) => {
        t(name(u), x, listTop + (square ? 110 : 140) + i * (square ? 58 : 86), `600 ${square ? 34 : 42}px Inter`, '#F4F8F2', align);
      });
    }
    t('VS', W / 2, listTop + (square ? 230 : 330), '800 120px "Barlow Condensed"', 'rgba(244,248,242,0.25)', 'center');
  } else {
    t(`${match.counts.ci_sono}/${match.slots} convocati`, 80, listTop, '700 60px "Barlow Condensed"');
    const names = match.participants.filter((p) => p.response === 'ci_sono').map((p) => name(p.user));
    names.slice(0, square ? 8 : 14).forEach((n, i) => t(n, 80 + (i % 2) * 480, listTop + 90 + Math.floor(i / 2) * 70, '600 40px Inter'));
  }
  t('Ci vediamo in campo', W / 2, H - (square ? 60 : 120), '600 34px Inter', '#A7B5AC', 'center');
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
