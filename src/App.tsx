import { useEffect } from 'react';
import { InboxIcon } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';
import { ColorDot } from '@/components/icons';
import { IssuePage } from '@/components/IssuePage';
import { IssuesView } from '@/components/IssuesView';
import { ConfirmModal, NewIssueModal, ProjectModal, TeamModal } from '@/components/Modals';
import { ProjectPage, ProjectsPage } from '@/components/Projects';
import { EmptyState } from '@/components/shared';
import { Sidebar } from '@/components/Sidebar';
import { Button } from '@/components/ui/button';
import { isTypingTarget } from '@/lib/format';
import { paths, useRoute, type Route } from '@/router';
import { useAppState } from '@/store';
import { hasOverlay, openNewIssue, openPalette, ui } from '@/uiStore';

function newIssueDefaultsFor(route: Route) {
  if (route.name === 'team') return { teamId: route.teamId };
  if (route.name === 'project') return { projectId: route.projectId };
  return {};
}

function Page({ route }: { route: Route }) {
  const state = useAppState();
  switch (route.name) {
    case 'team': {
      const team = state.teams.find((t) => t.id === route.teamId);
      if (!team) {
        return (
          <div className="flex min-w-0 flex-1 flex-col overflow-auto">
            <EmptyState
              title="Backlog não encontrado"
              action={
                <Button variant="outline" asChild>
                  <a href={`#${paths.all}`}>Ver todas as issues</a>
                </Button>
              }
            />
          </div>
        );
      }
      return (
        <IssuesView
          key={team.id}
          scope={{ teamId: team.id }}
          title={team.name}
          icon={<ColorDot color={team.color} className="size-3" />}
        />
      );
    }
    case 'projects':
      return <ProjectsPage />;
    case 'project':
      return <ProjectPage key={route.projectId} projectId={route.projectId} />;
    case 'issue':
      return <IssuePage issueKeyParam={route.key} />;
    default:
      return <IssuesView key="all" scope={{}} title="Todas as issues" icon={<InboxIcon className="size-4" />} />;
  }
}

export function App() {
  const route = useRoute();
  const overlays = ui.use();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || hasOverlay() || isTypingTarget(event.target)) return;
      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        openNewIssue(newIssueDefaultsFor(route));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [route]);

  return (
    <div className="flex h-full">
      <Sidebar route={route} />
      <main className="flex min-w-0 flex-1">
        <Page route={route} />
      </main>
      {overlays.newIssue && <NewIssueModal defaults={overlays.newIssue} />}
      {overlays.teamModal && <TeamModal teamId={overlays.teamModal.teamId} />}
      {overlays.projectModal && <ProjectModal />}
      {overlays.palette && <CommandPalette />}
      {overlays.confirm && <ConfirmModal request={overlays.confirm} />}
    </div>
  );
}
