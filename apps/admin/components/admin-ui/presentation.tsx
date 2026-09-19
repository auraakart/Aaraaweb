import type { HTMLAttributes, ReactNode } from 'react'
import styles from './admin-ui.module.css'

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'
export type LoadState = 'ready' | 'loading' | 'error' | 'empty'
const cx = (...values: (string | undefined | false)[]) => values.filter(Boolean).join(' ')

export function PageShell({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  return <main {...props} className={cx(styles.shell, className)}>{children}</main>
}

export function PageHeader({ title, description, context, actions }: {
  title: string; description?: ReactNode; context?: ReactNode; actions?: ReactNode
}) {
  return <header className={styles.header}>
    <div>{context && <div className={styles.context}>{context}</div>}<h1>{title}</h1>
      {description && <div className={styles.description}>{description}</div>}</div>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>
}

/** Optional layout composition; exported as a named PageShell member to keep the public vocabulary small. */
PageShell.Columns = function PageColumns({ children }: { children: ReactNode }) {
  return <div className={styles.columns}>{children}</div>
}

type PanelProps = {
  title: string; children?: ReactNode; actions?: ReactNode; state?: LoadState;
  empty?: ReactNode; error?: ReactNode; loadingLabel?: string
}

function PanelContent({ state = 'ready', children, empty, error, loadingLabel = 'Loading…' }: PanelProps) {
  if (state === 'loading') return <p role="status">{loadingLabel}</p>
  if (state === 'error') return error ?? <ErrorState title="Could not load this section" />
  if (state === 'empty') return empty ?? <EmptyState title="No records yet" />
  return children
}

export function QueuePanel({ count, ...props }: PanelProps & { count?: number }) {
  return <section className={styles.panel} aria-label={props.title} aria-busy={props.state === 'loading'}>
    <div className={styles.panelHeader}><h2>{props.title}{count !== undefined && <span className={styles.count}> ({count})</span>}</h2>{props.actions}</div>
    <PanelContent {...props} />
  </section>
}

export function DetailPanel(props: PanelProps) {
  return <section className={styles.panel} aria-label={props.title} aria-busy={props.state === 'loading'}>
    <div className={styles.panelHeader}><h2>{props.title}</h2>{props.actions}</div>
    <PanelContent {...props} />
  </section>
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return <span className={cx(styles.pill, styles[tone] ?? styles.neutral)}>{label}</span>
}

export function ReadinessPanel({ title, status, checks, blockers = [], nextActions = [], boundary, state = 'ready', error }: {
  title: string; status?: { label: string; tone?: Tone }; checks?: ReactNode;
  blockers?: readonly string[]; nextActions?: readonly string[]; boundary?: ReactNode;
  state?: Exclude<LoadState, 'empty'>; error?: ReactNode
}) {
  return <section className={styles.readiness} aria-label={title} aria-busy={state === 'loading'}>
    <div className={styles.panelHeader}><h3>{title}</h3>
      {state === 'ready' && <StatusPill label={status?.label ?? 'Readiness unavailable'} tone={status?.tone} />}</div>
    {state === 'loading' ? <p role="status">Loading readiness…</p> : state === 'error'
      ? error ?? <ErrorState title="Readiness unavailable" />
      : <>{checks}{blockers.length > 0 && <div><h4>Blockers</h4><ul>{blockers.map((x, i) => <li key={`${i}-${x}`}>{x}</li>)}</ul></div>}
        {nextActions.length > 0 && <div><h4>Next actions</h4><ul>{nextActions.map((x, i) => <li key={`${i}-${x}`}>{x}</li>)}</ul></div>}</>}
    {boundary && <div className={styles.description}>{boundary}</div>}
  </section>
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return <div className={styles.empty}><p className={styles.stateTitle}>{title}</p>{description && <p>{description}</p>}{action}</div>
}

export function ErrorState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return <div className={styles.error}><div role="alert"><p className={styles.stateTitle}>{title}</p>{description && <p>{description}</p>}</div>{action}</div>
}

export type TimelineEvent = { id: string; label: string; actor?: string; dateTime?: string; timeLabel: string; evidence?: ReactNode }
export function Timeline({ events, label = 'Activity history', emptyLabel = 'No history entries.' }: {
  events: readonly TimelineEvent[]; label?: string; emptyLabel?: string
}) {
  if (!events.length) return <EmptyState title={emptyLabel} />
  return <ol className={styles.timeline} aria-label={label}>{events.map(event => <li key={event.id}>
    <strong>{event.label}</strong><div className={styles.description}>{event.actor && <span>{event.actor} · </span>}
      <time dateTime={event.dateTime}>{event.timeLabel}</time></div>{event.evidence}
  </li>)}</ol>
}

export type EvidenceItem = { id: string; label: string; value: ReactNode; unavailableLabel?: string }
export function EvidenceGrid({ items }: { items: readonly EvidenceItem[] }) {
  return <dl className={styles.evidence}>{items.map(item => <div key={item.id}>
    <dt>{item.label}</dt><dd>{item.value ?? item.unavailableLabel ?? 'Not recorded'}</dd>
  </div>)}</dl>
}

export function ActionBar({ children, feedback, label = 'Actions' }: { children: ReactNode; feedback?: ReactNode; label?: string }) {
  return <div className={styles.actionBar}><div className={styles.actions} role="group" aria-label={label}>{children}</div>
    <div role="status" aria-live="polite">{feedback}</div></div>
}
