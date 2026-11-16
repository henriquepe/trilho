export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Formats a `YYYY-MM-DD` date without shifting it across time zones. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return dayFormat.format(new Date(year, month - 1, date));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function isOverdue(day: string): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return day < today;
}
