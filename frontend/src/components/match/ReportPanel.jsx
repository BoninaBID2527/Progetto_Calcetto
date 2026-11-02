import Icon from '../Icon';
import { PlayerName } from '../Avatar';
import { useToast } from '../../context/ToastContext';
import { APP_NAME } from '../../config';
import { formatDateLong, formatTime } from '../../utils/format';
import { Scoreboard } from './ResultPanel';

/** Disegna la pagella su un canvas 1080×1350 (formato adatto ai social). */
async function drawReport(report) {
  const { match, field } = report;
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  await Promise.all(['800 120px "Barlow Condensed"', '700 48px "Barlow Condensed"', '600 40px Inter'].map((f) => document.fonts?.load(f).catch(() => null)));

  ctx.fillStyle = '#0B1F1A';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = field.color;
  ctx.fillRect(0, 0, W, 18);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.15, 40, W * 0.8, H * 0.15, 700);
  glow.addColorStop(0, 'rgba(46,229,157,0.22)');
  glow.addColorStop(1, 'rgba(46,229,157,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const text = (value, x, y, font, color = '#F2F7F4', align = 'left') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  };
  text(APP_NAME, 80, 130, '800 64px "Barlow Condensed"', '#2EE59D');
  text('PAGELLA DELLA SERATA', 80, 200, '700 46px "Barlow Condensed"', '#9DB5AB');
  text(field.name.toUpperCase(), 80, 300, '800 92px "Barlow Condensed"');
  text(`${formatDateLong(match.startsAt)} · ${formatTime(match.startsAt)}`, 80, 360, '600 34px Inter', '#9DB5AB');

  ctx.fillStyle = '#12302A';
  ctx.beginPath();
  ctx.roundRect(60, 420, W - 120, 330, 40);
  ctx.fill();
  if (match.result) {
    text(match.teams.a.name.toUpperCase(), 260, 500, '700 44px "Barlow Condensed"', report.winner === 'a' ? '#2EE59D' : '#F2F7F4', 'center');
    text(match.teams.b.name.toUpperCase(), W - 260, 500, '700 44px "Barlow Condensed"', report.winner === 'b' ? '#2EE59D' : '#F2F7F4', 'center');
    text(String(match.result.scoreA), 260, 690, '800 200px "Barlow Condensed"', '#F2F7F4', 'center');
    text('-', W / 2, 670, '800 140px "Barlow Condensed"', '#9DB5AB', 'center');
    text(String(match.result.scoreB), W - 260, 690, '800 200px "Barlow Condensed"', '#F2F7F4', 'center');
  }

  const name = (u) => (u.nickname ? `${u.name} «${u.nickname}»` : u.name);
  let y = 850;
  const line = (label, value, color) => {
    text(label, 80, y, '700 40px "Barlow Condensed"', color);
    text(value, 330, y, '600 38px Inter');
    y += 90;
  };
  if (report.mvp.length) line('⭐ MVP', report.mvp.map(name).join(' e '), '#FFD23F');
  if (match.result?.scorers.length) {
    const scorers = match.result.scorers.map((s) => `${s.user.name}${s.goals > 1 ? ` (${s.goals})` : ''}`).join(', ');
    line('⚽ GOL', scorers.length > 44 ? `${scorers.slice(0, 42)}…` : scorers, '#2EE59D');
  }
  if (report.prizes.length) line('🏆 PREMIO', report.prizes.map((p) => `${p.label} ${p.emoji}`).join(' e '), '#FF8A3D');
  if (report.loserPaysEnabled && match.result) line('🍻 OFFRE', report.loserPays || 'Pareggio: alla romana', '#FF8A3D');

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export default function ReportPanel({ report }) {
  const toast = useToast();
  if (!report?.match.result) return null;
  const { match } = report;

  const shareText = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Pagella della serata', text: report.text });
      else {
        await navigator.clipboard.writeText(report.text);
        toast.success('Pagella copiata: incollala nel gruppo WhatsApp.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') toast.error('Non sono riuscito a condividere il testo.');
    }
  };

  const shareImage = async () => {
    try {
      const blob = await drawReport(report);
      const file = new File([blob], 'pagella-della-serata.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Pagella della serata' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success('Immagine della pagella scaricata.');
    } catch (err) {
      if (err.name !== 'AbortError') toast.error("Non sono riuscito a creare l'immagine.");
    }
  };

  return (
    <section className="card stack" aria-labelledby="report-title">
      <h2 id="report-title" className="section-title">
        <Icon name="list" /> Pagella della serata
      </h2>
      <div className="report-card">
        <span className="eyebrow">
          {report.field.name} · {formatDateLong(match.startsAt)}
        </span>
        <Scoreboard match={match} />
        <div className="report-line">
          <span className="icon-wrap">
            <Icon name="star" />
          </span>
          <span>
            <strong>MVP: </strong>
            {match.voting?.closed ? (
              report.mvp.length ? (
                report.mvp.map((u, i) => (
                  <span key={u.id}>
                    {i > 0 && ' e '}
                    <PlayerName user={u} />
                  </span>
                ))
              ) : (
                'nessuno'
              )
            ) : (
              <span className="muted">votazione in corso</span>
            )}
          </span>
        </div>
        {match.result.scorers.length > 0 && (
          <div className="report-line">
            <span className="icon-wrap">
              <Icon name="ball" />
            </span>
            <span>
              <strong>Gol: </strong>
              {match.result.scorers.map((s, i) => (
                <span key={s.user.id}>
                  {i > 0 && ', '}
                  <PlayerName user={s.user} />
                  {s.goals > 1 && ` (${s.goals})`}
                </span>
              ))}
            </span>
          </div>
        )}
        <div className="report-line">
          <span className="icon-wrap">
            <Icon name="mug" />
          </span>
          <span>
            <strong>Terzo tempo: </strong>
            {report.prizes.length ? report.prizes.map((p) => `${p.label} ${p.emoji}`).join(' e ') : <span className="muted">si vota ancora</span>}
          </span>
        </div>
        {report.loserPaysEnabled && (
          <div className="report-line">
            <span className="icon-wrap">
              <Icon name="euro" />
            </span>
            <span>
              <strong>Primo giro: </strong>
              {report.loserPays ? `offrono le ${report.loserPays}` : 'pareggio, alla romana'}
            </span>
          </div>
        )}
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={shareImage}>
          <Icon name="image" /> Condividi immagine
        </button>
        <button type="button" className="btn" onClick={shareText}>
          <Icon name="share" /> Condividi testo
        </button>
      </div>
    </section>
  );
}
