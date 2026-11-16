import { useSyncExternalStore } from 'react';

/** Minimal external store: immutable value, subscribe, and a React hook. */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = () => value;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    get,
    subscribe,
    set(next: T | ((prev: T) => T)) {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      if (resolved === value) return;
      value = resolved;
      listeners.forEach((listener) => listener());
    },
    use: () => useSyncExternalStore(subscribe, get),
  };
}
