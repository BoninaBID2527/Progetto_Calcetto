import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const RealtimeContext = createContext({ status: 'offline', socket: null });

/**
 * Connessione Socket.IO con riconnessione automatica. Le pagine si iscrivono
 * agli eventi con useRealtimeEvent e ricaricano i dati con useOnReconnect,
 * così recuperano ciò che si sono perse mentre la connessione era giù.
 */
export function RealtimeProvider({ children }) {
  const { token } = useAuth();
  const [status, setStatus] = useState('offline');
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    const s = io({ auth: { token }, transports: ['websocket', 'polling'], reconnectionDelay: 800, reconnectionDelayMax: 5000 });
    setStatus('connecting');
    s.on('connect', () => {
      setStatus('online');
    });
    s.on('disconnect', () => setStatus('connecting'));
    s.on('connect_error', (err) => setStatus(err.message === 'UNAUTHORIZED' ? 'offline' : 'connecting'));
    s.io.on('reconnect_failed', () => setStatus('offline'));
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
      setStatus('offline');
    };
  }, [token]);

  return <RealtimeContext.Provider value={{ status, socket }}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

/** Esegue `handler` a ogni evento `event` finché il componente è montato. */
export function useRealtimeEvent(event, handler) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return undefined;
    const fn = (payload) => ref.current(payload);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}

/** Esegue `handler` quando la connessione torna dopo un'interruzione. */
export function useOnReconnect(handler) {
  const { socket } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return undefined;
    let first = socket.connected;
    const fn = () => {
      if (first) ref.current();
      first = true;
    };
    socket.on('connect', fn);
    return () => socket.off('connect', fn);
  }, [socket]);
}
