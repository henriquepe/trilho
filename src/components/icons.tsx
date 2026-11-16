import type { Priority, ProjectStatus, StatusId } from '@/types';

// Domain icons only. Generic icons come from lucide-react.

const STATUS_FILL: Record<StatusId, number> = {
  backlog: 0,
  todo: 0,
  in_progress: 0.5,
  in_review: 0.8,
  done: 1,
  canceled: 1,
};

/** Rounded square that fills up as the issue advances. */
export function StatusIcon({ status }: { status: StatusId }) {
  const color = `var(--st-${status})`;
  const fill = STATUS_FILL[status];
  const solid = status === 'done' || status === 'canceled';
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden="true">
      <rect
        x="1.25"
        y="1.25"
        width="11.5"
        height="11.5"
        rx="3.5"
        fill={solid ? color : 'none'}
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={status === 'backlog' ? '2.2 2' : undefined}
      />
      {!solid && fill > 0 && (
        <rect x="3.6" y={3.6 + 6.8 * (1 - fill)} width="6.8" height={6.8 * fill} rx="1.2" fill={color} />
      )}
      {status === 'done' && (
        <path d="M4 7.3l2 2 4-4.3" stroke="var(--background)" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {status === 'canceled' && (
        <path d="M4.7 4.7l4.6 4.6M9.3 4.7L4.7 9.3" stroke="var(--background)" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function PriorityIcon({ priority }: { priority: Priority }) {
  if (priority === 0) {
    return (
      <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden="true">
        <g fill="var(--muted-foreground)" opacity=".6">
          <rect x="1.5" y="6.25" width="2.6" height="1.5" rx=".75" />
          <rect x="5.7" y="6.25" width="2.6" height="1.5" rx=".75" />
          <rect x="9.9" y="6.25" width="2.6" height="1.5" rx=".75" />
        </g>
      </svg>
    );
  }
  if (priority === 1) {
    return (
      <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="12" height="12" rx="3.5" fill="var(--urgent)" />
        <path d="M7 3.6v4.1" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="7" cy="10.1" r="1" fill="var(--background)" />
      </svg>
    );
  }
  const filled = 5 - priority; // high = 3 bars, medium = 2, low = 1
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden="true">
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1.5 + bar * 4}
          y={8.5 - bar * 3}
          width="3"
          height={4 + bar * 3}
          rx="1"
          fill={bar < filled ? 'var(--muted-foreground)' : 'var(--input)'}
        />
      ))}
    </svg>
  );
}

export function ColorDot({ color, className = 'size-2.5' }: { color: string; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}

const PROJECT_STATUS_COLOR: Record<ProjectStatus, string> = {
  planned: 'var(--st-todo)',
  active: 'var(--st-in_progress)',
  paused: 'var(--st-in_review)',
  completed: 'var(--st-done)',
  canceled: 'var(--st-canceled)',
};

export function ProjectStatusDot({ status }: { status: ProjectStatus }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-[3px]"
      style={{ background: PROJECT_STATUS_COLOR[status] }}
    />
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-5 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M9 11h14M9 16h9M9 21h5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
