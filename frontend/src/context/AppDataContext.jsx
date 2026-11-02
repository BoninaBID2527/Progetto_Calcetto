import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useOnReconnect, useRealtimeEvent } from './RealtimeContext';
import { useToast } from './ToastContext';

const AppDataContext = createContext(null);
const ACTIVE_KEY = 'bonmatch.activeGroup';

function readActive() {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** Gruppi dell'utente, gruppo attivo, non letti della chat e notifiche. */
export function AppDataProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [groups, setGroups] = useState(null);
  const [activeId, setActiveIdState] = useState(readActive);
  const [notifications, setNotifications] = useState({ notifications: [], unread: 0 });
  const [openChat, setOpenChat] = useState(null);

  const refreshGroups = useCallback(async () => {
    const res = await api('/groups');
    setGroups(res.groups);
    return res.groups;
  }, []);

  const refreshNotifications = useCallback(async () => {
    const res = await api('/notifications?limit=40');
    setNotifications(res);
    return res;
  }, []);

  useEffect(() => {
    if (!user) {
      setGroups(null);
      return;
    }
    refreshGroups().catch(() => setGroups([]));
    refreshNotifications().catch(() => {});
  }, [user, refreshGroups, refreshNotifications]);

  useOnReconnect(() => {
    refreshGroups().catch(() => {});
    refreshNotifications().catch(() => {});
  });

  const setActiveId = useCallback((id) => {
    setActiveIdState(id);
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      // ignorato
    }
  }, []);

  useRealtimeEvent('notification:new', (n) => {
    setNotifications((s) => ({ notifications: [n, ...s.notifications].slice(0, 40), unread: s.unread + 1 }));
    toast.info(n.title);
  });

  useRealtimeEvent('chat:message', (m) => {
    if (m.groupId === openChat || m.author?.id === user?.id) return;
    setGroups((list) => list?.map((g) => (g.id === m.groupId ? { ...g, unreadCount: (g.unreadCount || 0) + 1 } : g)));
  });

  useRealtimeEvent('group:updated', () => refreshGroups().catch(() => {}));
  useRealtimeEvent('group:removed', () => refreshGroups().catch(() => {}));

  const markGroupRead = useCallback((groupId) => {
    setGroups((list) => list?.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g)));
  }, []);

  const markNotificationRead = useCallback(async (id) => {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    setNotifications((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unread: Math.max(0, s.unread - (s.notifications.find((n) => n.id === id && !n.read) ? 1 : 0)),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await api('/notifications/read-all', { method: 'POST' });
    setNotifications((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })), unread: 0 }));
  }, []);

  const activeGroup = useMemo(() => {
    if (!groups?.length) return null;
    return groups.find((g) => g.id === activeId) || groups[0];
  }, [groups, activeId]);

  const value = {
    groups,
    activeGroup,
    setActiveId,
    refreshGroups,
    markGroupRead,
    setOpenChat,
    notifications,
    refreshNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  };
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export const useAppData = () => useContext(AppDataContext);
