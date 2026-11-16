import {
  DownloadIcon,
  FolderIcon,
  InboxIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportData, importData } from '@/lib/transfer';
import { cn } from '@/lib/utils';
import { navigate, paths, type Route } from '@/router';
import { actions, useAppState } from '@/store';
import { askConfirm, openNewIssue, openPalette, openProjectModal, openTeamModal } from '@/uiStore';
import { ColorDot, Logo } from './icons';
import { Count } from './shared';

const itemClass =
  'group/nav flex min-h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-sidebar-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring';
const activeClass = 'bg-sidebar-accent font-medium text-foreground';

function Heading({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className="mt-4 flex items-center justify-between py-0.5 pr-1 pl-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function Sidebar({ route }: { route: Route }) {
  const state = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const openCount = (teamId: string) =>
    state.issues.filter((i) => i.teamId === teamId && i.status !== 'done' && i.status !== 'canceled').length;

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-2.5 border-r border-sidebar-border bg-sidebar px-2.5 py-3">
      <div className="flex items-center gap-2 px-1.5 text-[15px] font-semibold tracking-tight">
        <Logo />
        <span>Trilho</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          title="Buscar e executar comandos (⌘K)"
          aria-label="Abrir paleta de comandos"
          onClick={openPalette}
        >
          <SearchIcon />
        </Button>
      </div>

      <Button variant="outline" size="sm" className="justify-start" onClick={() => openNewIssue()}>
        <PlusIcon /> Nova issue
        <kbd className="ml-auto rounded border px-1 text-[11px] font-normal text-muted-foreground">C</kbd>
      </Button>

      <nav className="flex flex-1 flex-col gap-px overflow-auto" aria-label="Principal">
        <a className={cn(itemClass, route.name === 'all' && activeClass)} href={`#${paths.all}`}>
          <InboxIcon className="size-4" /> <span className="truncate">Todas as issues</span>
        </a>
        <a className={cn(itemClass, route.name === 'projects' && activeClass)} href={`#${paths.projects}`}>
          <FolderIcon className="size-4" /> <span className="truncate">Projetos</span>
        </a>

        <Heading
          action={
            <Button
              variant="ghost"
              size="icon-xs"
              title="Novo backlog"
              aria-label="Novo backlog"
              onClick={() => openTeamModal()}
            >
              <PlusIcon />
            </Button>
          }
        >
          Backlogs
        </Heading>
        {state.teams.map((team) => (
          <div
            key={team.id}
            className={cn(itemClass, 'pr-1', route.name === 'team' && route.teamId === team.id && activeClass)}
          >
            <a
              className="flex min-w-0 flex-1 items-center gap-2 self-stretch outline-none"
              href={`#${paths.team(team.id)}`}
            >
              <ColorDot color={team.color} />
              <span className="truncate">{team.name}</span>
            </a>
            <Count>{openCount(team.id)}</Count>
            {/* Non-modal so opening a dialog from an item never leaves the page locked. */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 group-hover/nav:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                  aria-label={`Opções de ${team.name}`}
                >
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => openTeamModal(team.id)}>Editar backlog</DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    const total = state.issues.filter((i) => i.teamId === team.id).length;
                    askConfirm({
                      title: `Excluir o backlog ${team.name}?`,
                      message:
                        total === 0
                          ? 'O backlog está vazio.'
                          : `As ${total} issues deste backlog serão excluídas em definitivo.`,
                      confirmLabel: 'Excluir backlog',
                      onConfirm: () => {
                        actions.deleteTeam(team.id);
                        if (route.name !== 'projects') navigate(paths.all);
                      },
                    });
                  }}
                >
                  Excluir backlog
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {state.teams.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum backlog</p>}

        <Heading
          action={
            <Button
              variant="ghost"
              size="icon-xs"
              title="Novo projeto"
              aria-label="Novo projeto"
              onClick={openProjectModal}
            >
              <PlusIcon />
            </Button>
          }
        >
          Projetos
        </Heading>
        {state.projects.map((project) => (
          <a
            key={project.id}
            className={cn(itemClass, route.name === 'project' && route.projectId === project.id && activeClass)}
            href={`#${paths.project(project.id)}`}
          >
            <ColorDot color={project.color} />
            <span className="truncate">{project.name}</span>
          </a>
        ))}
        {state.projects.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum projeto</p>}
      </nav>

      <div className="flex gap-1 border-t border-sidebar-border pt-2">
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={exportData}>
          <DownloadIcon /> Exportar
        </Button>
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => fileRef.current?.click()}>
          <UploadIcon /> Importar
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importData(file);
          }}
        />
      </div>
    </aside>
  );
}
