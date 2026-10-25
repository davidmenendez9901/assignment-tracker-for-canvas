import type { Classification } from './classify';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type IconName = 'check' | 'alert' | 'clock' | 'lock' | 'hourglass' | 'minus' | 'retry' | 'calendar';

export interface BadgePart {
  /** Short visible text. */
  text: string;
  /** Full text for assistive technology. */
  label: string;
  tone: Tone;
  icon: IconName;
  /** Low-emphasis styling (e.g. full score, which needs no attention). */
  subtle?: boolean;
}

export interface FormatOptions {
  now: number;
  locale?: string | undefined;
  timeZone?: string | undefined;
  /** Include an "Open" part. Off for inline rows (noise), on for the panel list. */
  includeOpen?: boolean;
}

/** 85 → "85", 85.5 → "85.5", 85.256 → "85.26" */
export function formatPoints(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function pts(n: number): string {
  return `${formatPoints(n)} ${n === 1 ? 'pt' : 'pts'}`;
}

function points(n: number): string {
  return `${formatPoints(n)} ${n === 1 ? 'point' : 'points'}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Upcoming work due within this window is highlighted. */
export const DUE_SOON_MS = 48 * HOUR;

/** "in 3 hours", "tomorrow", "in 5 days". */
export function formatRelative(target: number, now: number): string {
  const diff = target - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DUE_SOON_MS) return rtf.format(Math.round(diff / HOUR), 'hour');
  return rtf.format(Math.round(diff / DAY), 'day');
}

export function formatDate(t: number, opts: Pick<FormatOptions, 'locale' | 'timeZone'> = {}): string {
  return new Intl.DateTimeFormat(opts.locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: opts.timeZone,
  }).format(t);
}

/** Badge parts in display order. Empty when there is no student data. */
export function badgeParts(c: Classification, opts: FormatOptions): BadgePart[] {
  if (!c.hasStudentData) return [];
  const parts: BadgePart[] = [];
  const dateOpts = { locale: opts.locale, timeZone: opts.timeZone };

  // 1. Score / grading state.
  if (c.excused) {
    parts.push({ text: 'Excused', label: 'Excused', tone: 'neutral', icon: 'minus' });
  } else if (c.ungraded) {
    parts.push({ text: 'No points', label: 'Not graded for points', tone: 'neutral', icon: 'minus', subtle: true });
  } else if (c.passFail === 'complete') {
    parts.push({ text: 'Complete', label: 'Graded complete, full credit', tone: 'success', icon: 'check', subtle: true });
  } else if (c.passFail === 'incomplete') {
    parts.push({ text: 'Incomplete', label: 'Graded incomplete', tone: 'danger', icon: 'alert' });
  } else if (c.score !== null && c.pointsPossible !== null) {
    const ratio = `${formatPoints(c.score)}/${formatPoints(c.pointsPossible)}`;
    const outOf = `Score ${formatPoints(c.score)} out of ${formatPoints(c.pointsPossible)}`;
    if (c.fullPoints) {
      const extra = c.extraPoints !== null ? ` · +${formatPoints(c.extraPoints)} extra` : '';
      const extraLabel = c.extraPoints !== null ? `, plus ${points(c.extraPoints)} extra credit` : ', full points';
      parts.push({ text: `${ratio}${extra}`, label: `${outOf}${extraLabel}`, tone: 'success', icon: 'check', subtle: true });
    } else if (c.pointsLeft !== null) {
      parts.push({
        text: `${ratio} · ${pts(c.pointsLeft)} left`,
        label: `${outOf}, ${points(c.pointsLeft)} below full score`,
        tone: 'warning',
        icon: 'alert',
      });
    }
  } else if (c.gradeHidden) {
    parts.push({ text: 'Grade not posted', label: 'Graded, but the grade is not posted yet', tone: 'info', icon: 'hourglass' });
  } else if (c.pendingGrading) {
    parts.push({ text: 'Submitted · awaiting grade', label: 'Submitted, waiting to be graded', tone: 'info', icon: 'hourglass' });
  }

  // A resubmission after grading: the old score is visible but a new grade is pending.
  if (c.pendingGrading && c.score !== null && !c.gradeHidden) {
    parts.push({ text: 'Awaiting regrade', label: 'Resubmitted, waiting for a new grade', tone: 'info', icon: 'hourglass' });
  }

  // 2. Deadline problems.
  if (c.missing) {
    parts.push({ text: 'Missing', label: 'Marked missing', tone: 'danger', icon: 'alert' });
  } else if (c.overdue) {
    parts.push({ text: 'Overdue', label: 'Overdue: past the due date and not submitted', tone: 'danger', icon: 'clock' });
  } else if (
    c.availability === 'open' &&
    c.dueAt !== null &&
    c.dueAt > opts.now &&
    !c.submitted &&
    !c.excused &&
    !c.ungraded &&
    c.score === null
  ) {
    // Upcoming work still to do.
    const rel = formatRelative(c.dueAt, opts.now);
    const soon = c.dueAt - opts.now <= DUE_SOON_MS;
    parts.push({
      text: `Due ${rel}`,
      label: `Not submitted yet, due ${rel}`,
      tone: soon ? 'warning' : 'neutral',
      icon: 'clock',
      subtle: !soon,
    });
  }
  if (c.late) {
    const deducted = c.pointsDeducted !== null ? ` (−${formatPoints(c.pointsDeducted)})` : '';
    const deductedLabel = c.pointsDeducted !== null ? `, ${points(c.pointsDeducted)} deducted` : '';
    parts.push({ text: `Late${deducted}`, label: `Submitted late${deductedLabel}`, tone: 'warning', icon: 'clock' });
  }
  if (c.extended) {
    parts.push({ text: 'Extended', label: 'Deadline extended', tone: 'info', icon: 'calendar' });
  }

  // 3. Availability.
  if (c.availability === 'not_yet_available') {
    if (c.lockReason === 'module') {
      const mod = c.moduleName ? `: complete “${c.moduleName}” first` : '';
      parts.push({ text: 'Locked (module)', label: `Not yet available${mod}`, tone: 'neutral', icon: 'lock' });
    } else if (c.unlockAt !== null) {
      const when = formatDate(c.unlockAt, dateOpts);
      parts.push({ text: `Opens ${when}`, label: `Not yet available, opens ${when}`, tone: 'neutral', icon: 'lock' });
    } else {
      parts.push({ text: 'Not yet available', label: 'Not yet available', tone: 'neutral', icon: 'lock' });
    }
  } else if (c.availability === 'closed') {
    const nothing = !c.submitted && !c.excused && !c.ungraded && c.score === null && c.passFail === null;
    parts.push({
      text: nothing ? 'Closed · not submitted' : 'Closed',
      label: nothing ? 'Closed, nothing was submitted' : 'Closed for submissions',
      tone: nothing ? 'danger' : 'neutral',
      icon: 'lock',
    });
  } else if (opts.includeOpen) {
    const until = c.lockAt !== null ? ` until ${formatDate(c.lockAt, dateOpts)}` : '';
    parts.push({ text: `Open${until}`, label: `Open for submissions${until}`, tone: 'neutral', icon: 'calendar', subtle: true });
  }

  // 4. Attempts.
  if (c.retryAvailable && c.attemptsAllowed !== null) {
    parts.push({
      text: `Retry available (${c.attemptsUsed}/${c.attemptsAllowed} used)`,
      label: `Retry available, ${c.attemptsUsed} of ${c.attemptsAllowed} attempts used`,
      tone: 'info',
      icon: 'retry',
    });
  }

  return parts;
}

/** Label for the whole badge group, read by screen readers. */
export function ariaSummary(c: Classification, opts: FormatOptions): string {
  const parts = badgeParts(c, opts);
  return parts.length ? `Assignment Tracker: ${parts.map((p) => p.label).join('; ')}` : '';
}

/** Stable key that changes whenever the rendered badge would change. */
export function badgeSignature(c: Classification, opts: FormatOptions): string {
  return badgeParts(c, opts)
    .map((p) => `${p.tone}:${p.text}`)
    .join('|');
}

export function formatDue(c: Classification, opts: Pick<FormatOptions, 'locale' | 'timeZone'>): string {
  return c.dueAt === null ? 'No due date' : `Due ${formatDate(c.dueAt, opts)}`;
}
