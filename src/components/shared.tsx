import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Borderless textarea that grows with its content (titles and descriptions). */
export function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
  onKeyDown,
  onBlur,
  rows = 3,
  ariaLabel,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  rows?: number;
  ariaLabel: string;
  ref?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const target = ref ?? innerRef;
  useLayoutEffect(() => {
    const element = target.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value, target]);
  return (
    <textarea
      ref={target}
      rows={rows}
      className={cn(
        // shrink-0: inside flex columns the computed height must win over flex shrinking.
        'w-full shrink-0 resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/60',
        className,
      )}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    />
  );
}

export const titleClass = 'text-xl leading-snug font-semibold tracking-tight';
export const descriptionClass = 'text-[15px] leading-relaxed';

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="m-auto flex max-w-md flex-col items-center gap-2 px-6 py-16 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex min-h-13 items-center gap-3 border-b bg-background px-6 py-2">
      {children}
    </header>
  );
}

export function Count({ children }: { children: ReactNode }) {
  return <span className="text-xs font-normal text-muted-foreground tabular-nums">{children}</span>;
}
