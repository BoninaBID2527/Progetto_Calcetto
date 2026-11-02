/*
 * Mappa unica della navigazione. Ogni voce punta a una schermata esistente:
 * quando una milestone aggiunge una sezione, la si registra qui e compare
 * in barra laterale, barra in basso e menu "Altro".
 */
export function navigationFor(group, { unreadNotifications = 0 } = {}) {
  const base = group ? `/gruppi/${group.id}` : '/gruppi';
  const inGroup = (path, fallback = '/gruppi') => (group ? `${base}${path}` : fallback);
  const canOrganize = group && (group.settings.organizers === 'tutti' || group.myRole === 'admin');

  const items = {
    partite: { label: 'Partite', icon: 'calendar', to: inGroup('/partite') },
    classifiche: { label: 'Classifiche', icon: 'trophy', to: inGroup('/classifiche') },
    chat: { label: 'Chat', icon: 'chat', to: inGroup('/chat'), badge: group?.unreadCount || 0, badgeLabel: `${group?.unreadCount || 0} messaggi non letti` },
    membri: { label: 'Membri', icon: 'users', to: inGroup('/membri') },
    notifiche: { label: 'Notifiche', icon: 'bell', to: '/notifiche', badge: unreadNotifications, badgeLabel: `${unreadNotifications} notifiche non lette` },
    profilo: { label: 'Profilo', icon: 'user', to: '/profilo' },
    gruppi: { label: 'Tutti i gruppi', icon: 'home', to: '/gruppi', end: true },
  };

  const create = canOrganize
    ? [{ label: 'Nuova partita', short: 'Partita', icon: 'plus', to: `${base}/nuova-partita` }]
    : [{ label: group ? 'Apri le partite del gruppo' : 'Crea o entra in un gruppo', short: group ? 'Partite' : 'Gruppi', icon: 'users', to: group ? `${base}/partite` : '/gruppi' }];

  return {
    home: group ? `${base}/partite` : '/gruppi',
    create,
    bottom: [items.partite, items.classifiche, items.chat],
    more: [items.membri, items.notifiche, items.profilo, items.gruppi],
    moreBadge: unreadNotifications,
    sections: [
      { title: group ? group.name : 'Gruppo', items: [items.partite, items.classifiche, items.chat, items.membri] },
      { title: 'Tu', items: [items.notifiche, items.profilo, items.gruppi] },
    ],
  };
}
