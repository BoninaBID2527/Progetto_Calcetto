import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Icon from '../components/Icon';
import { Avatar, PlayerName } from '../components/Avatar';
import { ErrorState, Skeleton } from '../components/ui';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';
import { useOnReconnect, useRealtimeEvent } from '../context/RealtimeContext';
import { REACTIONS } from '../config';
import { formatDay, formatTime, sameDay } from '../utils/format';

function Message({ message, previous, meId, onReact }) {
  const [picking, setPicking] = useState(false);
  if (message.kind === 'sistema') {
    return (
      <div className="msg-system" role="note">
        {message.text}
        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
      </div>
    );
  }
  const mine = message.author?.id === meId;
  const continued = previous && previous.kind === 'utente' && previous.author?.id === message.author?.id && sameDay(previous.createdAt, message.createdAt);
  return (
    <div className={`msg ${mine ? 'is-me' : ''}`} style={continued ? { marginTop: -2 } : { marginTop: 6 }}>
      {!mine && (continued ? <span style={{ width: 32 }} aria-hidden="true" /> : <Avatar user={message.author} size={32} />)}
      <div className="msg-bubble">
        {!mine && !continued && (
          <span className="msg-author">
            <PlayerName user={message.author} />
          </span>
        )}
        <span style={{ whiteSpace: 'pre-wrap' }}>{message.text}</span>
        {message.reactions.length > 0 && (
          <div className="msg-reactions">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className="reaction"
                aria-pressed={r.userIds.includes(meId)}
                aria-label={`${r.emoji} ${r.count}${r.userIds.includes(meId) ? ', anche tu' : ''}`}
                onClick={() => onReact(message, r.emoji)}
              >
                <span aria-hidden="true">{r.emoji}</span>
                <span className="tabular" aria-hidden="true">
                  {r.count}
                </span>
              </button>
            ))}
          </div>
        )}
        <span className="msg-meta">
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        </span>
      </div>
      <div className="msg-actions">
        {picking ? (
          <div className="reaction-picker" role="group" aria-label="Scegli una reazione">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Reagisci con ${emoji}`}
                onClick={() => {
                  setPicking(false);
                  onReact(message, emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Aggiungi una reazione" onClick={() => setPicking(true)}>
            <Icon name="smile" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function GroupChat() {
  const { group } = useOutletContext();
  const { user } = useAuth();
  const { setOpenChat, markGroupRead } = useAppData();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState({ loading: true, error: null });
  const [unreadFrom, setUnreadFrom] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const chatRef = useRef(null);
  const atBottom = useRef(true);
  const keepOffset = useRef(null);
  const initialUnread = useRef(group.unreadCount || 0);

  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const markRead = useCallback(() => {
    api(`/groups/${group.id}/messages/read`, { method: 'POST' }).catch(() => {});
    markGroupRead(group.id);
  }, [group.id, markGroupRead]);

  const merge = useCallback((incoming, { prepend = false } = {}) => {
    setMessages((list) => {
      const known = new Set(list.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return prepend ? [...fresh, ...list] : [...list, ...fresh];
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOpenChat(group.id);
    setStatus({ loading: true, error: null });
    api(`/groups/${group.id}/messages?limit=30`)
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages);
        setHasMore(res.hasMore);
        const fromOthers = res.messages.filter((m) => m.author?.id !== user.id);
        const n = initialUnread.current;
        if (n > 0 && fromOthers.length) setUnreadFrom(fromOthers[Math.max(0, fromOthers.length - n)].id);
        setStatus({ loading: false, error: null });
        markRead();
        requestAnimationFrame(() => scrollToBottom());
      })
      .catch((error) => !cancelled && setStatus({ loading: false, error }));
    return () => {
      cancelled = true;
      setOpenChat(null);
    };
  }, [group.id, user.id, setOpenChat, markRead]);

  // La chat occupa lo spazio che resta fino alla barra in basso (o al fondo su desktop).
  useLayoutEffect(() => {
    const fit = () => {
      const el = chatRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const nav = document.querySelector('.bottom-nav');
      const navHeight = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().height : 0;
      el.style.height = `${Math.max(320, window.innerHeight - top - navHeight - 16)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Mantiene la posizione quando si caricano i messaggi più vecchi.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    }
  }, [messages]);

  const loadOlder = async () => {
    if (!messages.length) return;
    const el = scrollRef.current;
    try {
      const res = await api(`/groups/${group.id}/messages?limit=30&before=${messages[0].id}`);
      keepOffset.current = el.scrollHeight - el.scrollTop;
      merge(res.messages, { prepend: true });
      setHasMore(res.hasMore);
    } catch (err) {
      toast.error(err.message);
    }
  };

  useRealtimeEvent('chat:message', (m) => {
    if (m.groupId !== group.id) return;
    merge([m]);
    if (atBottom.current || m.author?.id === user.id) {
      requestAnimationFrame(() => scrollToBottom(true));
      markRead();
    } else {
      setNewCount((c) => c + 1);
    }
  });

  useRealtimeEvent('chat:reaction', ({ messageId, reactions }) => {
    setMessages((list) => list.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
  });

  // Dopo una disconnessione recupero i messaggi arrivati nel frattempo.
  useOnReconnect(async () => {
    const last = messages[messages.length - 1];
    if (!last) return;
    try {
      const res = await api(`/groups/${group.id}/messages?after=${last.id}&limit=100`);
      merge(res.messages);
    } catch {
      // riprova alla prossima riconnessione
    }
  });

  const onScroll = () => {
    const el = scrollRef.current;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottom.current = bottom;
    if (bottom && newCount) {
      setNewCount(0);
      markRead();
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      const { message } = await api(`/groups/${group.id}/messages`, { method: 'POST', body: { text: value } });
      merge([message]);
      setText('');
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const react = async (message, emoji) => {
    try {
      const res = await api(`/groups/${group.id}/messages/${message.id}/reactions`, { method: 'POST', body: { emoji } });
      setMessages((list) => list.map((m) => (m.id === message.id ? res.message : m)));
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="page">
      <div className="chat" ref={chatRef}>
        <div className="chat-scroll" ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-label={`Chat di ${group.name}`} tabIndex={0}>
          {status.loading && (
            <div className="stack" aria-busy="true">
              <Skeleton height={44} width="55%" />
              <Skeleton height={44} width="40%" />
              <Skeleton height={44} width="62%" />
            </div>
          )}
          {status.error && <ErrorState error={status.error} />}
          {hasMore && (
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'center' }} onClick={loadOlder}>
              Carica messaggi precedenti
            </button>
          )}
          {!status.loading && !messages.length && !status.error && (
            <p className="muted" style={{ textAlign: 'center', margin: 'auto' }}>
              Spogliatoio silenzioso. Scrivi il primo messaggio: chi porta il pallone?
            </p>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
            return (
              <Fragment key={m.id}>
                {newDay && <div className="chat-day">{formatDay(m.createdAt, { short: false })}</div>}
                {m.id === unreadFrom && <div className="chat-unread">Nuovi messaggi</div>}
                <Message message={m} previous={newDay ? null : prev} meId={user.id} onReact={react} />
              </Fragment>
            );
          })}
          {newCount > 0 && (
            <button
              type="button"
              className="btn btn-accent btn-sm chat-new"
              onClick={() => {
                scrollToBottom(true);
                setNewCount(0);
                markRead();
              }}
            >
              <Icon name="arrow-down" /> {newCount} {newCount === 1 ? 'nuovo messaggio' : 'nuovi messaggi'}
            </button>
          )}
        </div>
        <form className="composer" onSubmit={send}>
          <label htmlFor="chat-input" className="visually-hidden">
            Scrivi un messaggio
          </label>
          <textarea
            id="chat-input"
            className="textarea"
            rows={1}
            maxLength={1000}
            placeholder="Scrivi al gruppo…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="submit" className="btn btn-primary btn-icon" aria-label="Invia" disabled={sending || !text.trim()}>
            <Icon name="send" />
          </button>
        </form>
      </div>
    </div>
  );
}
