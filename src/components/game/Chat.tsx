import { useEffect, useRef, useState } from 'react';
import type { GameClient, GameSnapshot } from '../../game/client';
import type { ChatMessage, Derived } from '../../game/derive';
import { formatTimeOfDay } from '../../game/rules';
import type { Team } from '../../game/types';
import { load, save } from '../../lib/storage';
import { Avatar } from './common';

const QUICK = ['👍', '🚆 Bin im Zug', '📍 Bin dort', '👀 Spur gefunden', '⏳ Gleich da', '🆘 Hilfe!'];

/** Nachrichten, die ich sehen darf (in der Lobby alle, danach nur das eigene Team) */
export function visibleChat(d: Derived, team: Team | null): ChatMessage[] {
  return d.chat.filter((m) => m.audience === 'all' || m.audience === team);
}

const readKey = (snap: GameSnapshot, d: Derived) => `chat.read.${snap.code}.${d.round}`;

/** Anzahl ungelesener Nachrichten anderer; `active` markiert alles als gelesen */
export function useUnreadChat(snap: GameSnapshot, d: Derived, team: Team | null, active: boolean): number {
  const key = readKey(snap, d);
  const [lastRead, setLastRead] = useState(() => load<number>(key, 0));
  const msgs = visibleChat(d, team).filter((m) => m.by !== snap.me.id);
  const latest = msgs.length ? msgs[msgs.length - 1]!.t : 0;
  useEffect(() => {
    if (active && latest > lastRead) {
      setLastRead(latest);
      save(key, latest);
    }
  }, [active, latest, lastRead, key]);
  return active ? 0 : msgs.filter((m) => m.t > lastRead).length;
}

export function ChatPanel({ client, snap, d, team, title = 'Team-Chat' }: { client: GameClient; snap: GameSnapshot; d: Derived; team: Team | null; title?: string }) {
  const [text, setText] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const msgs = visibleChat(d, team);
  const send = (t: string) => {
    const v = t.trim().slice(0, 200);
    if (!v) return;
    client.addAction({ kind: 'chat', text: v });
    setText('');
  };
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length]);

  return (
    <section className="chat">
      <h3 className="section-title">{title}</h3>
      <ul className="chat-list" ref={list}>
        {msgs.length === 0 && <li className="chat-empty">Noch keine Nachrichten. Sagt Hallo! 👋</li>}
        {msgs.map((m) => {
          const p = snap.players[m.by];
          const mine = m.by === snap.me.id;
          return (
            <li key={m.id} className={`chat-msg ${mine ? 'mine' : ''}`}>
              {!mine && <Avatar p={p ?? { name: '?', color: '#888' }} size={28} />}
              <div className="chat-bubble">
                {!mine && <small>{p?.name ?? 'Jemand'}</small>}
                <span>{m.text}</span>
                <time>{formatTimeOfDay(m.t)}</time>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="chat-quick">
        {QUICK.map((q) => (
          <button key={q} className="chip" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nachricht …" maxLength={200} aria-label="Nachricht" />
        <button className="wide-btn" disabled={!text.trim()} aria-label="Senden">
          Senden
        </button>
      </form>
    </section>
  );
}
