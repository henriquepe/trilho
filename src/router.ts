import { createStore } from './lib/createStore';

export type Route =
  | { name: 'all' }
  | { name: 'team'; teamId: string }
  | { name: 'projects' }
  | { name: 'project'; projectId: string }
  | { name: 'issue'; key: string };

export function parseRoute(hash: string): Route {
  const [head, arg] = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);
  if (head === 'team' && arg) return { name: 'team', teamId: arg };
  if (head === 'projects') return { name: 'projects' };
  if (head === 'project' && arg) return { name: 'project', projectId: arg };
  if (head === 'issue' && arg) return { name: 'issue', key: arg };
  return { name: 'all' };
}

export const paths = {
  all: '/all',
  team: (id: string) => `/team/${id}`,
  projects: '/projects',
  project: (id: string) => `/project/${id}`,
  issue: (key: string) => `/issue/${key}`,
};

const routeStore = createStore<Route>(parseRoute(window.location.hash));
window.addEventListener('hashchange', () => routeStore.set(parseRoute(window.location.hash)));

export const useRoute = routeStore.use;

export function navigate(path: string) {
  window.location.hash = path;
}
