import { useMemo, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { GeistiSays } from './Geisti';
import { dailyQuiz } from '../game/content';
import { useCantonProps } from './game/common';
import { getStats, QUIZ_LEN, recordQuiz, streakOf, today, useStats } from '../lib/stats';
import { scheduleQuizReminder } from '../lib/notify';
import { buzz, play } from '../lib/sound';
import type { GhostMood } from './Art';

const PRAISE = ['Genau!', 'Richtig, du Schlaumeier!', 'Bravo! 🎉', 'Stimmt!', 'Hammer!'];
const COMFORT = ['Knapp daneben!', 'Oje – fast!', 'Nicht ganz.', 'Hmm, leider nein.'];

/** Geistis Tagesquiz: 5 Fragen pro Tag, gleiche Fragen für alle, mit Serie */
export function QuizSheet({ onClose }: { onClose: () => void }) {
  const cantons = useCantonProps();
  const stats = useStats();
  const day = today();
  const questions = useMemo(() => (cantons ? dailyQuiz(day, cantons, QUIZ_LEN) : []), [cantons, day]);
  const done = stats.quiz[day];
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const q = questions[i];
  const streak = streakOf(stats);

  const answer = (o: string) => {
    if (!q || q.input.kind !== 'choice' || picked) return;
    setPicked(o);
    const ok = o === q.input.correct;
    play(ok ? 'right' : 'wrong');
    buzz(ok ? 30 : [60, 40, 60]);
    if (ok) setRight((r) => r + 1);
  };
  const next = () => {
    if (i + 1 >= questions.length) {
      recordQuiz(day, right);
      void scheduleQuizReminder(streakOf(getStats()));
      play(right >= QUIZ_LEN ? 'win' : 'pick');
    } else {
      setI(i + 1);
      setPicked(null);
    }
  };

  let body;
  if (done !== undefined) {
    const perfect = done >= QUIZ_LEN;
    const mood: GhostMood = perfect ? 'cheer' : done >= 3 ? 'happy' : 'wink';
    const text = perfect
      ? `Alle ${QUIZ_LEN} richtig – Besserwisser! 🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge. Morgen gibt’s neue Fragen.`
      : `${done} von ${QUIZ_LEN} richtig! 🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} in Folge. Komm morgen wieder, dann geht die Serie weiter.`;
    body = (
      <div className="quiz-done">
        <GeistiSays text={text} mood={mood} party={perfect} size={110} />
        <div className="quiz-score">
          <div>
            <strong>
              {done}/{QUIZ_LEN}
            </strong>
            <small>richtig</small>
          </div>
          <div>
            <strong>+{done * 10 + (perfect ? 20 : 0)}</strong>
            <small>XP</small>
          </div>
          <div>
            <strong>🔥 {streak}</strong>
            <small>{streak === 1 ? 'Tag' : 'Tage'} Serie</small>
          </div>
        </div>
        <button className="wide-btn" onClick={onClose}>
          Bis morgen, Geisti! 👋
        </button>
      </div>
    );
  } else if (!q || q.input.kind !== 'choice') {
    body = <GeistiSays text="Moment, ich suche die Fragen von heute zusammen …" mood="think" size={100} />;
  } else {
    const correct = q.input.correct;
    const ok = picked !== null && picked === correct;
    const say = picked === null ? (i === 0 ? 'Los geht’s! Frage 1 – weisst du’s?' : `Frage ${i + 1} von ${questions.length}. Weiter so!`) : ok ? PRAISE[i % PRAISE.length]! : `${COMFORT[i % COMFORT.length]} Richtig ist: ${correct}`;
    body = (
      <>
        <div className="quiz-steps" aria-label={`Frage ${i + 1} von ${questions.length}`}>
          {questions.map((x, k) => (
            <span key={x.id} className={k < i ? 'done' : k === i ? 'now' : ''} />
          ))}
        </div>
        <GeistiSays key={`${i}-${picked ?? ''}`} text={say} mood={picked === null ? 'think' : ok ? 'cheer' : 'sad'} size={96} side="right" />
        <p className="quiz-question">
          <span>{q.icon}</span> {q.prompt}
        </p>
        <div className="quiz-options">
          {q.input.options.map((o) => {
            const state = picked === null ? '' : o === correct ? 'right' : o === picked ? 'wrong' : '';
            return (
              <button key={o} className={`quiz-option ${state} ${picked === o ? 'chosen' : ''}`} disabled={picked !== null} onClick={() => answer(o)}>
                {o}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <button className="wide-btn start" onClick={next}>
            {i + 1 >= questions.length ? 'Fertig!' : 'Weiter'}
          </button>
        )}
      </>
    );
  }

  return (
    <BottomSheet title="Geistis Tagesquiz" subtitle={`🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'} Serie · jeden Tag 5 neue Fragen`} label="Tagesquiz" onClose={onClose}>
      {body}
    </BottomSheet>
  );
}
