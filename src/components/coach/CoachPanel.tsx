'use client';

import clsx from 'clsx';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import type { Scan, Trial, Verdict } from '@/lib/domain';
import { Button, Spinner } from '@/components/ui';
import { buildTrialContext, QUESTION_MAX, SUGGESTED_QUESTIONS } from './context';
import { coachPhotos, photoPair } from './photos';
import { useCoach, useCoachEnabled, type CoachAnswer } from './useCoach';
import styles from './CoachPanel.module.css';

export interface CoachPanelProps {
  trial: Trial;
  scans: Scan[];
  verdict: Verdict;
  /** Moment the verdict was computed for (from useTrialData). Defaults to now. */
  now?: Date;
  /** Start expanded. The trial page leaves it collapsed. */
  defaultOpen?: boolean;
  className?: string;
}

/** Markdown the model sometimes adds anyway: bold, headings, bullets. */
function plain(text: string): string[] {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[*•-]\s+/gm, '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** "Checking acne scores" → "checked acne scores" for the line under a finished answer. */
function pastTense(label: string): string {
  return label
    .replace(/^Checking\b/, 'checked')
    .replace(/^Comparing\b/, 'compared')
    .replace(/^Reading\b/, 'read');
}

function sourcesLine(tools: string[]): string {
  const unique = [...new Set(tools)];
  if (!unique.length) return '';
  const parts = unique.map(pastTense);
  parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function Answer({ answer, onRetry }: { answer: CoachAnswer; onRetry: () => void }) {
  const paragraphs = plain(answer.text);
  const working = answer.status === 'working';
  const currentTool = answer.tools[answer.tools.length - 1];
  const statusLine = working ? (paragraphs.length ? currentTool : (currentTool ?? 'Reading this trial')) : answer.status === 'done' ? sourcesLine(answer.tools) : '';

  return (
    <div className={styles.answer} aria-live="polite" aria-busy={working || undefined}>
      <p className={styles.asked}>{answer.question}</p>
      {statusLine ? (
        <p className={clsx(styles.tool, 'num')}>
          {working ? <Spinner size={16} className={styles.toolIcon} /> : <Check size={16} strokeWidth={1.75} aria-hidden className={styles.toolIcon} />}
          <span>{statusLine}</span>
        </p>
      ) : null}
      {paragraphs.length ? (
        <div className={clsx(styles.text, 'num')}>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : null}
      {answer.status === 'error' ? (
        <div className={styles.error} role="alert">
          <p>{answer.error}</p>
          {answer.retryable !== false ? (
            <Button variant="quiet" icon={RotateCcw} onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * «Ask about this trial»: questions about one trial, answered from its scores and the ingredient
 * timeline. Mounted under the VerdictCard. Renders nothing while /api/coach is unavailable.
 */
export function CoachPanel({ trial, scans, verdict, now, defaultOpen = false, className }: CoachPanelProps) {
  const enabled = useCoachEnabled();
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState('');
  const [usePhotos, setUsePhotos] = useState(false);
  const { answer, ask } = useCoach();
  const ids = { head: useId(), body: useId(), input: useId(), photos: useId(), photosHint: useId() };
  const pair = useMemo(() => photoPair(scans), [scans]);
  const suggestions = SUGGESTED_QUESTIONS[verdict.kind];
  const busy = answer?.status === 'working';

  if (!enabled) return null;

  function send(question: string) {
    const q = question.trim().slice(0, QUESTION_MAX);
    if (!q) return;
    const context = buildTrialContext(trial, scans, verdict, now ?? new Date());
    void ask(q, context, usePhotos && pair ? () => coachPhotos(scans) : undefined);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !draft.trim()) return;
    send(draft);
    setDraft('');
  }

  return (
    <section className={clsx(styles.panel, open && styles.open, className)} aria-labelledby={ids.head}>
      <h2 className={styles.heading}>
        <button type="button" id={ids.head} className={styles.toggle} aria-expanded={open} aria-controls={ids.body} onClick={() => setOpen((o) => !o)}>
          <span>Ask about this trial</span>
          <ChevronDown size={20} strokeWidth={1.75} aria-hidden className={styles.chevron} />
        </button>
      </h2>

      <div id={ids.body} className={styles.body} hidden={!open}>
        <div className={styles.suggestions} role="group" aria-label="Suggested questions">
          {suggestions.map((q) => (
            <button key={q} type="button" className={styles.suggestion} onClick={() => send(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>

        <form className={styles.form} onSubmit={submit}>
          <label htmlFor={ids.input} className="visually-hidden">
            Your question about this trial
          </label>
          <input
            id={ids.input}
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={QUESTION_MAX}
            placeholder="Ask your own question"
            autoComplete="off"
            enterKeyHint="send"
          />
          <Button type="submit" variant="secondary" disabled={!draft.trim()} loading={busy}>
            Ask
          </Button>
        </form>

        {pair ? (
          <div className={styles.photos}>
            <input
              id={ids.photos}
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={usePhotos}
              onChange={(e) => setUsePhotos(e.target.checked)}
              aria-describedby={ids.photosHint}
            />
            <div>
              <label htmlFor={ids.photos} className={styles.photosLabel}>
                Let the assistant look at my photos
              </label>
              <p id={ids.photosHint} className={clsx(styles.photosHint, 'num')}>
                Your day {pair.first.day} and day {pair.latest.day} photos go to OpenRouter with the question, reduced to 512 px.
              </p>
            </div>
          </div>
        ) : null}

        {answer ? <Answer answer={answer} onRetry={() => send(answer.question)} /> : null}
      </div>
    </section>
  );
}
