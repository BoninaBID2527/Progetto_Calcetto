import { APP_NAME } from '../../config';

const W = 1080;
const H = 1920;

function wrap(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Disegna una schermata del BONWRAPPED in formato verticale 1080×1920 e restituisce un PNG. */
export async function exportSlidePng(slide, { groupName }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await Promise.all(['800 300px "Barlow Condensed"', '700 60px "Barlow Condensed"', '500 44px Inter'].map((f) => document.fonts?.load(f).catch(() => null)));

  ctx.fillStyle = '#090D0C';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 800, 40, W / 2, 800, 1000);
  glow.addColorStop(0, `${slide.accent}40`);
  glow.addColorStop(1, '#090D0C00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const t = (text, x, y, font, color, align = 'center') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
  };

  t(APP_NAME, W / 2, 150, '800 76px "Barlow Condensed"', '#C7FF36');
  t(String(slide.kicker).toUpperCase(), W / 2, 420, '700 52px "Barlow Condensed"', slide.accent);

  // Numero grande: si rimpicciolisce finché sta nella larghezza.
  let size = slide.bigSmall ? 150 : 420;
  ctx.font = `800 ${size}px "Barlow Condensed"`;
  while (ctx.measureText(slide.big).width > W - 160 && size > 70) {
    size -= 10;
    ctx.font = `800 ${size}px "Barlow Condensed"`;
  }
  t(slide.big, W / 2, 800, `800 ${size}px "Barlow Condensed"`, '#F4F8F2');
  t(slide.title, W / 2, 940, '700 72px "Barlow Condensed"', slide.accent);

  ctx.font = '500 44px Inter';
  let y = 1100;
  for (const line of slide.lines) {
    for (const part of wrap(ctx, line, W - 200)) {
      t(part, W / 2, y, '500 44px Inter', '#F4F8F2');
      y += 66;
    }
    y += 18;
  }

  t(groupName, W / 2, H - 170, '700 48px "Barlow Condensed"', '#A7B5AC');
  t('Dati reali delle partite registrate nel gruppo', W / 2, H - 110, '500 30px Inter', '#A7B5AC');
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
