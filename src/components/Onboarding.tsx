import { useEffect, useMemo, useState } from 'react';
import { Drips } from './Art';
import { GeistiSays } from './Geisti';
import type { GhostMood } from './Art';
import { isNative } from '../lib/native';
import { notifyPermission, requestNotify } from '../lib/notify';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { play } from '../lib/sound';

export type Goal = 'game' | 'explore' | 'route';

interface Props {
  initialName: string;
  onName: (name: string) => void;
  /** tour: Tour durch die App starten; goal: was die Person zuerst machen will */
  onDone: (result: { tour: boolean; goal: Goal | null }) => void;
  onOpenApp: () => void;
}

type Step = 'hello' | 'name' | 'goal' | 'reply' | 'notify' | 'app' | 'ready';

const GOALS: { id: Goal; icon: string; label: string; text: string }[] = [
  { id: 'game', icon: '🕵️', label: 'Versteckspiel mit Freunden', text: 'Quer durch die Schweiz verstecken und suchen' },
  { id: 'explore', icon: '🗺️', label: 'Die Schweiz erkunden', text: 'Berge, Seen, Kantone und Gemeinden' },
  { id: 'route', icon: '🚆', label: 'ÖV-Verbindungen finden', text: 'Fahrplan, Gleise und Abfahrten' },
];

const REPLY: Record<Goal, { mood: GhostMood; text: string }> = {
  game: {
    mood: 'cool',
    text: 'Hammer! Die eine Hälfte versteckt sich irgendwo in der Schweiz, die andere jagt sie mit Zug, Bus und Power-ups. Ich bin der Schiedsrichter – und ich verrate nichts. 🤫',
  },
  explore: {
    mood: 'love',
    text: 'Oh, ich liebe die Schweiz! Drück irgendwo lange auf die Karte, dann zeige ich dir Höhe, Kanton und die nächsten Abfahrten.',
  },
  route: {
    mood: 'happy',
    text: 'Ich kenne jeden Fahrplan der Schweiz. Von A nach B mit Gleis, Umstiegen und Verspätungen – in Sekunden.',
  },
};

export function Onboarding({ initialName, onName, onDone, onOpenApp }: Props) {
  const { installed } = useInstallPrompt();
  const [perm, setPerm] = useState<string>('unsupported');
  const [name, setName] = useState(initialName);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [typed, setTyped] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    void notifyPermission().then(setPerm);
  }, []);

  const steps = useMemo<Step[]>(
    () => [
      'hello',
      'name',
      'goal',
      'reply',
      ...(perm === 'default' ? (['notify'] as Step[]) : []),
      ...(!installed && !isNative ? (['app'] as Step[]) : []),
      'ready',
    ],
    [perm, installed],
  );
  const at = Math.min(i, steps.length - 1);
  const step = steps[at]!;
  const next = () => {
    play('tick');
    setTyped(false);
    setI((v) => Math.min(v + 1, steps.length - 1));
  };
  const first = name.trim().split(/\s+/)[0] ?? '';
  const finish = (tour: boolean) => {
    if (name.trim().length >= 2 && name.trim() !== initialName) onName(name.trim());
    onDone({ tour, goal });
  };

  let say: { text: string; mood: GhostMood; wave?: boolean; party?: boolean };
  switch (step) {
    case 'hello':
      say = { text: 'Hoi! Ich bin Geisti, der Geist von Zeitgeist. 👻 Ich begleite dich durch die Schweiz – und durchs Spiel.', mood: 'happy', wave: true };
      break;
    case 'name':
      say = { text: 'Wie heisst du? Dann wissen deine Freunde im Spiel, wer da so herumgeistert.', mood: 'think' };
      break;
    case 'goal':
      say = { text: first ? `Schön, dich kennenzulernen, ${first}! Worauf hast du am meisten Lust?` : 'Schön, dich kennenzulernen! Worauf hast du am meisten Lust?', mood: 'wink' };
      break;
    case 'reply':
      say = REPLY[goal ?? 'game'];
      break;
    case 'notify':
      say = { text: 'Darf ich dir Bescheid geben, wenn im Spiel etwas passiert? Zum Beispiel bei einer neuen Challenge oder einer Falle. Versprochen: kein Spam!', mood: 'surprised' };
      break;
    case 'app':
      say = { text: 'Hol mich auf deinen Home-Bildschirm! Dann bin ich mit einem Tipp da – gratis und ohne App Store.', mood: 'love' };
      break;
    default:
      say = { text: 'Alles bereit! Soll ich dir kurz zeigen, wo was ist? Dauert nur eine halbe Minute.', mood: 'cheer', party: true };
  }

  return (
    <div className="onboarding" role="dialog" aria-label="Einführung mit Geisti">
      <div className="ob-drips" aria-hidden="true">
        <Drips />
      </div>
      <div className="ob-top">
        <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={at + 1}>
          <span style={{ width: `${((at + 1) / steps.length) * 100}%` }} />
        </div>
        <button className="ob-skip" onClick={() => finish(false)}>
          Überspringen
        </button>
      </div>

      <div className="ob-stage" key={step}>
        <GeistiSays text={say.text} mood={say.mood} wave={say.wave} party={say.party} size={150} onTypedChange={setTyped} />
      </div>

      <div className={`ob-actions ${typed ? 'ready' : ''}`}>
        {step === 'hello' && (
          <button className="wide-btn start" onClick={next}>
            Hoi Geisti! 👋
          </button>
        )}
        {step === 'name' && (
          <form
            className="ob-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length >= 2) next();
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Dein Name" aria-label="Dein Name" autoComplete="given-name" />
            <button className="wide-btn start" disabled={name.trim().length < 2}>
              Weiter
            </button>
            <button type="button" className="link inline ob-later" onClick={next}>
              Später
            </button>
          </form>
        )}
        {step === 'goal' && (
          <div className="ob-choices">
            {GOALS.map((g) => (
              <button
                key={g.id}
                className={`ob-choice ${goal === g.id ? 'chosen' : ''}`}
                onClick={() => {
                  setGoal(g.id);
                  play('pick');
                  window.setTimeout(next, 260);
                }}
              >
                <span className="ob-choice-icon">{g.icon}</span>
                <span className="ob-choice-text">
                  <strong>{g.label}</strong>
                  <small>{g.text}</small>
                </span>
              </button>
            ))}
          </div>
        )}
        {step === 'reply' && (
          <button className="wide-btn start" onClick={next}>
            Cool, weiter
          </button>
        )}
        {step === 'notify' && (
          <>
            <button
              className="wide-btn start"
              onClick={async () => {
                setPerm(await requestNotify());
                next();
              }}
            >
              🔔 Ja, gerne
            </button>
            <button className="link inline ob-later" onClick={next}>
              Später
            </button>
          </>
        )}
        {step === 'app' && (
          <>
            <button
              className="wide-btn start"
              onClick={() => {
                finish(false);
                onOpenApp();
              }}
            >
              📲 App herunterladen
            </button>
            <button className="link inline ob-later" onClick={next}>
              Später
            </button>
          </>
        )}
        {step === 'ready' && (
          <>
            <button className="wide-btn start" onClick={() => finish(true)}>
              Zeig’s mir!
            </button>
            <button className="link inline ob-later" onClick={() => finish(false)}>
              Nein danke, los geht’s
            </button>
          </>
        )}
      </div>
    </div>
  );
}
