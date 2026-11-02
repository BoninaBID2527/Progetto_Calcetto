import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Icon from '../components/Icon';
import { buildSlides } from '../components/wrapped/slides';
import { exportSlidePng } from '../components/wrapped/exportSlide';
import { shareOrDownload } from '../components/player/exportCard';
import { Button, CardSkeleton, EmptyState, ErrorState } from '../components/ui';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useToast } from '../context/ToastContext';

function Slide({ slide, direction }) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      key={slide.key}
      className="wrapped-slide"
      style={{ '--accent': slide.accent }}
      initial={reduce ? false : { opacity: 0, x: 40 * direction }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? undefined : { opacity: 0, x: -40 * direction }}
      transition={{ duration: 0.22 }}
      aria-roledescription="schermata"
    >
      <p className="wrapped-kicker">{slide.kicker}</p>
      <motion.p className={`wrapped-big ${slide.bigSmall ? 'is-small' : ''}`} initial={reduce ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: reduce ? 0 : 0.08, type: 'spring', stiffness: 220, damping: 20 }}>
        {slide.big}
      </motion.p>
      <h3 className="wrapped-title">{slide.title}</h3>
      <ul className="wrapped-lines">
        {slide.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </motion.article>
  );
}

export default function Wrapped() {
  const { group } = useOutletContext();
  const toast = useToast();
  const [params] = useSearchParams();
  const target = params.get('utente');
  const [season, setSeason] = useState('corrente');
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [busy, setBusy] = useState(false);
  const seasons = useResource(() => api(`/groups/${group.id}/seasons`), [group.id]);
  const { data, error, loading, reload } = useResource(() => api(`/groups/${group.id}/wrapped?season=${encodeURIComponent(season)}${target ? `&user=${target}` : ''}`).then((r) => r.wrapped), [group.id, season, target]);
  const slides = useMemo(() => buildSlides(data), [data]);
  const past = (seasons.data?.seasons || []).filter((s) => s.closed);

  const go = useCallback(
    (delta) => {
      setDirection(delta);
      setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta)));
    },
    [slides.length]
  );
  useEffect(() => setIndex(0), [season, target, data?.user?.id]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const slide = slides[index];
  const fileName = (s) => `bonwrapped-${data.user.name.toLowerCase().replace(/\W+/g, '-')}-${s.key}.png`;

  const share = async () => {
    setBusy(true);
    try {
      const blob = await exportSlidePng(slide, { groupName: group.name });
      const how = await shareOrDownload(blob, fileName(slide), 'Il mio BONWRAPPED');
      if (how === 'downloaded') toast.success('Immagine scaricata in formato verticale.');
    } catch (err) {
      if (err.name !== 'AbortError') toast.error("Non sono riuscito a creare l'immagine.");
    } finally {
      setBusy(false);
    }
  };
  const downloadAll = async () => {
    setBusy(true);
    try {
      for (const s of slides) {
        const blob = await exportSlidePng(s, { groupName: group.name });
        const url = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: fileName(s) }).click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        await new Promise((r) => setTimeout(r, 250));
      }
      toast.success(`${slides.length} immagini scaricate.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <span className="overline">BONWRAPPED</span>
          <h2>{data?.user && target ? `La stagione di ${data.user.name}` : 'La tua stagione'}</h2>
          <p>Un riepilogo da condividere, fatto solo di partite e voti reali. Se i dati non bastano, te lo diciamo.</p>
        </div>
        <div className="field" style={{ minWidth: 220 }}>
          <label className="label" htmlFor="wrapped-season">
            Periodo
          </label>
          <select id="wrapped-season" className="select" value={season} onChange={(e) => setSeason(e.target.value)}>
            <option value="corrente">Stagione corrente</option>
            <option value="sempre">Tutto il periodo</option>
            {past.length > 0 && (
              <optgroup label="Stagioni passate">
                {past.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {loading && !data && <CardSkeleton lines={5} />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && !data.enough && (
        <EmptyState title="Non ci sono ancora abbastanza dati">
          {data.reason} <Link to={`/gruppi/${group.id}/partite`}>Vai alle partite</Link>.
        </EmptyState>
      )}

      {data?.enough && slide && (
        <section className="wrapped" aria-label="Schermate del riepilogo" aria-live="polite">
          <ol className="wrapped-progress" aria-label={`Schermata ${index + 1} di ${slides.length}`}>
            {slides.map((s, i) => (
              <li key={s.key}>
                <button type="button" className={i <= index ? 'is-done' : ''} aria-label={`Vai alla schermata ${i + 1}: ${s.kicker}`} aria-current={i === index ? 'step' : undefined} onClick={() => { setDirection(i > index ? 1 : -1); setIndex(i); }} />
              </li>
            ))}
          </ol>
          <div className="wrapped-stage">
            <AnimatePresence mode="wait" initial={false}>
              <Slide key={slide.key} slide={slide} direction={direction} />
            </AnimatePresence>
          </div>
          <div className="wrapped-controls">
            <button type="button" className="btn btn-icon" onClick={() => go(-1)} disabled={index === 0} aria-label="Schermata precedente">
              <Icon name="chevron-left" />
            </button>
            <Button variant="primary" icon="share" onClick={share} loading={busy}>
              Condividi questa schermata
            </Button>
            <button type="button" className="btn btn-icon" onClick={() => go(1)} disabled={index === slides.length - 1} aria-label="Schermata successiva">
              <Icon name="chevron-right" />
            </button>
          </div>
          <button type="button" className="btn btn-ghost" onClick={downloadAll} disabled={busy}>
            <Icon name="download" /> Scarica tutte ({slides.length})
          </button>
        </section>
      )}
    </div>
  );
}
