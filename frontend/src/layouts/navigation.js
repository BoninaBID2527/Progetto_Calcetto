/*
 * Mappa unica della navigazione. Ogni voce punta a una schermata esistente:
 * quando una milestone aggiunge una sezione, la si registra qui e compare
 * in barra laterale, barra in basso e menu "Altro".
 */
export function navigationFor(group, { unreadNotifications = 0, userId } = {}) {
  const base = group ? `/gruppi/${group.id}` : '/gruppi';
  const inGroup = (path, fallback = '/gruppi') => (group ? `${base}${path}` : fallback);
  const canOrganize = group && (group.settings.organizers === 'tutti' || group.myRole === 'admin');

  const items = {
    home: { label: 'Home', icon: 'home', to: inGroup('', '/gruppi'), end: true },
    partite: { label: 'Partite', icon: 'calendar', to: inGroup('/partite') },
    classifiche: { label: 'Classifiche', icon: 'trophy', to: inGroup('/classifiche') },
    chat: { label: 'Chat', icon: 'chat', to: inGroup('/chat'), badge: group?.unreadCount || 0, badgeLabel: `${group?.unreadCount || 0} messaggi non letti` },
    membri: { label: 'Membri', icon: 'users', to: inGroup('/membri') },
    boncall: { label: 'Convocazioni', icon: 'boncall', to: inGroup('/boncall') },
    hall: { label: 'Hall of Fame', icon: 'crown', to: inGroup('/hall-of-fame') },
    rivalita: { label: 'Rivalità', icon: 'rivalry', to: inGroup('/rivalita') },
    boncard: { label: 'La mia BONCARD', icon: 'card', to: inGroup(`/giocatori/${userId}`) },
    notifiche: { label: 'Notifiche', icon: 'bell', to: '/notifiche', badge: unreadNotifications, badgeLabel: `${unreadNotifications} notifiche non lette` },
    profilo: { label: 'Profilo', icon: 'user', to: '/profilo' },
    gruppi: { label: 'Tutti i gruppi', icon: 'shield', to: '/gruppi', end: true },
  };

  const create = canOrganize
    ? [
        { label: 'Nuova partita', short: 'Partita', icon: 'plus', to: `${base}/nuova-partita` },
        { label: 'BONCALL: cerca giocatori', short: 'BONCALL', icon: 'boncall', to: `${base}/boncall/nuova` },
      ]
    : [{ label: group ? 'Apri le partite del gruppo' : 'Crea o entra in un gruppo', short: group ? 'Partite' : 'Gruppi', icon: 'users', to: group ? `${base}/partite` : '/gruppi' }];

  return {
    home: group ? base : '/gruppi',
    create,
    bottom: [items.home, items.partite, items.chat],
    more: [items.boncall, items.boncard, items.classifiche, items.hall, items.rivalita, items.membri, items.notifiche, items.profilo, items.gruppi],
    moreBadge: unreadNotifications,
    sections: [
      { title: group ? group.name : 'Gruppo', items: [items.home, items.partite, items.boncall, items.classifiche, items.hall, items.rivalita, items.chat, items.membri] },
      { title: 'Tu', items: [...(group ? [items.boncard] : []), items.notifiche, items.profilo, items.gruppi] },
    ],
  };
}
