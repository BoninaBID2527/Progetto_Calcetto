import { formatDay } from '../../utils/format';

const pct = (v) => `${Math.round(v * 100)}%`;
const comma = (v) => String(v).replace('.', ',');
const when = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });
const who = (u) => (u.nickname ? `${u.name} «${u.nickname}»` : u.name);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Le schermate del BONWRAPPED, costruite solo dai dati dell'API: una sezione
 * senza dati non produce nessuna schermata. Lo stesso elenco alimenta la
 * visualizzazione a schermo e l'immagine esportata.
 */
export function buildSlides(w) {
  if (!w?.enough) return [];
  const s = w.summary;
  const name = w.user.nickname || w.user.name;
  const period = w.season ? w.season.label : 'Tutto il periodo';
  const slides = [];

  slides.push({
    key: 'intro',
    kicker: period,
    big: name,
    bigSmall: true,
    title: 'Il tuo BONWRAPPED',
    lines: [`${plural(s.played, 'partita giocata', 'partite giocate')}, dal ${when(s.firstMatchAt)} al ${when(s.lastMatchAt)}.`],
    accent: '#C7FF36',
  });
  slides.push({
    key: 'partite',
    kicker: 'Sul campo',
    big: String(s.played),
    title: s.played === 1 ? 'partita giocata' : 'partite giocate',
    lines: [`${plural(s.wins, 'vittoria', 'vittorie')} · ${plural(s.draws, 'pareggio', 'pareggi')} · ${plural(s.losses, 'sconfitta', 'sconfitte')}`, s.played >= 5 ? `Hai vinto il ${pct(s.winRate)} delle partite.` : 'Con meno di 5 partite la percentuale non è significativa.'],
    accent: '#C7FF36',
  });
  if (s.goals !== null) {
    slides.push({
      key: 'gol',
      kicker: 'Sotto porta',
      big: String(s.goals),
      title: s.goals === 1 ? 'gol segnato' : 'gol segnati',
      lines: [`Contati in ${plural(s.goalsMatches, 'partita con i marcatori', 'partite con i marcatori')}.`, ...(w.records.mostGoals ? [`Il tuo record: ${plural(w.records.mostGoals.goals, 'gol', 'gol')} il ${when(w.records.mostGoals.date)}.`] : [])],
      accent: '#FF8466',
    });
  }
  if (s.mvp > 0 || w.awards.matchAwards.length) {
    slides.push({
      key: 'premi',
      kicker: 'Riconoscimenti',
      big: String(s.mvp),
      title: s.mvp === 1 ? 'volta MVP' : 'volte MVP',
      lines: w.awards.matchAwards.map((a) => `${a.label}: ${a.count} ${a.count === 1 ? 'volta' : 'volte'}`),
      accent: '#F5D98C',
    });
  }
  if (w.bestMatch) {
    slides.push({
      key: 'migliore',
      kicker: 'La tua migliore partita',
      big: comma(w.bestMatch.rating),
      title: 'voto dai compagni',
      lines: [`${when(w.bestMatch.date)} a ${w.bestMatch.fieldName}`, `Finì ${w.bestMatch.score}${w.bestMatch.goals ? ` · ${plural(w.bestMatch.goals, 'gol', 'gol')}` : ''}${w.bestMatch.mvp ? ' · MVP' : ''}`],
      accent: '#6FD3FF',
    });
  }
  if (w.progression) {
    const d = w.progression.delta;
    slides.push({
      key: 'progressione',
      kicker: 'Progressione',
      big: `${d > 0 ? '+' : ''}${comma(d)}`,
      title: d > 0 ? 'sei cresciuto' : d < 0 ? 'in calo, ma si recupera' : 'costante',
      lines: [`Voto medio: ${comma(w.progression.first)} nella prima metà, ${comma(w.progression.second)} nella seconda.`],
      accent: '#C7FF36',
    });
  }
  if (w.rivalry || w.partner) {
    slides.push({
      key: 'compagni',
      kicker: 'Rivali e compagni',
      big: w.rivalry ? who(w.rivalry.user) : who(w.partner.user),
      bigSmall: true,
      title: w.rivalry ? 'il tuo avversario di sempre' : 'il tuo compagno ideale',
      lines: [
        ...(w.rivalry ? [`${plural(w.rivalry.played, 'sfida', 'sfide')}: ${w.rivalry.wins} vittorie, ${w.rivalry.draws} pari, ${w.rivalry.losses} sconfitte.`] : []),
        ...(w.partner ? [`In squadra con ${who(w.partner.user)}: ${w.partner.wins} vittorie in ${plural(w.partner.played, 'partita', 'partite')}.`] : []),
      ],
      accent: '#FF8466',
    });
  }
  if (w.moments.length) {
    slides.push({
      key: 'momenti',
      kicker: 'Momenti',
      big: String(w.moments.length),
      title: w.moments.length === 1 ? 'momento da ricordare' : 'momenti da ricordare',
      lines: w.moments.slice(0, 4).map((m) => `${m.title}${m.date ? ` · ${formatDay(m.date).toLowerCase()}` : ''}`),
      accent: '#F5D98C',
    });
  }
  if (w.achievements.length) {
    slides.push({
      key: 'traguardi',
      kicker: 'Traguardi',
      big: String(w.achievements.length),
      title: w.achievements.length === 1 ? 'traguardo sbloccato' : 'traguardi sbloccati',
      lines: w.achievements.slice(0, 5).map((a) => a.label),
      accent: '#F5D98C',
    });
  }
  if (w.standings.length) {
    const best = [...w.standings].sort((a, b) => a.position - b.position)[0];
    slides.push({
      key: 'classifiche',
      kicker: 'In classifica',
      big: `${best.position}°`,
      title: `in «${best.title}»`,
      lines: w.standings.map((x) => `${x.title}: ${x.position}° su ${x.of}`),
      accent: '#6FD3FF',
    });
  }
  slides.push({
    key: 'fine',
    kicker: period,
    big: 'Ci vediamo giovedì',
    bigSmall: true,
    title: 'Grazie per la stagione',
    lines: ['Tutti i numeri vengono dalle partite e dai voti registrati nel gruppo.'],
    accent: '#C7FF36',
  });
  return slides;
}
