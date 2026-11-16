import {
  DownloadIcon,
  FolderIcon,
  InboxIcon,
  KanbanIcon,
  ListIcon,
  PlusIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { exportData } from '@/lib/transfer';
import { issueKey, normalizeText } from '@/model';
import { navigate, paths } from '@/router';
import { useAppState } from '@/store';
import { closeOverlays, openNewIssue, openProjectModal, openTeamModal, setViewMode } from '@/uiStore';
import { ColorDot, StatusIcon } from './icons';

interface PaletteCommand {
  id: string;
  label: string;
  group: 'Ações' | 'Navegar' | 'Backlogs' | 'Projetos' | 'Issues';
  shortcut?: string;
  icon: ReactNode;
  run: () => void;
}

const GROUPS = ['Ações', 'Navegar', 'Backlogs', 'Projetos', 'Issues'] as const;
const MAX_ISSUES = 40;

export function CommandPalette() {
  const state = useAppState();
  const [query, setQuery] = useState('');

  const commands = useMemo<PaletteCommand[]>(() => {
    const go = (path: string) => () => {
      closeOverlays();
      navigate(path);
    };
    const view = (mode: 'list' | 'board') => () => {
      setViewMode(mode);
      closeOverlays();
    };
    const base: PaletteCommand[] = [
      { id: 'new-issue', label: 'Nova issue', group: 'Ações', shortcut: 'C', icon: <PlusIcon />, run: () => openNewIssue() },
      { id: 'new-team', label: 'Novo backlog', group: 'Ações', icon: <PlusIcon />, run: () => openTeamModal() },
      { id: 'new-project', label: 'Novo projeto', group: 'Ações', icon: <PlusIcon />, run: openProjectModal },
      { id: 'view-list', label: 'Ver como lista', group: 'Ações', icon: <ListIcon />, run: view('list') },
      { id: 'view-board', label: 'Ver como quadro', group: 'Ações', icon: <KanbanIcon />, run: view('board') },
      {
        id: 'export',
        label: 'Exportar dados (JSON)',
        group: 'Ações',
        icon: <DownloadIcon />,
        run: () => {
          exportData();
          closeOverlays();
        },
      },
      { id: 'go-all', label: 'Todas as issues', group: 'Navegar', icon: <InboxIcon />, run: go(paths.all) },
      { id: 'go-projects', label: 'Projetos', group: 'Navegar', icon: <FolderIcon />, run: go(paths.projects) },
      ...state.teams.map<PaletteCommand>((team) => ({
        id: `team-${team.id}`,
        label: team.name,
        group: 'Backlogs',
        shortcut: team.key,
        icon: <ColorDot color={team.color} />,
        run: go(paths.team(team.id)),
      })),
      ...state.projects.map<PaletteCommand>((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        group: 'Projetos',
        icon: <ColorDot color={project.color} />,
        run: go(paths.project(project.id)),
      })),
    ];
    const needle = normalizeText(query.trim());
    if (!needle) return base;
    const matches = base.filter((command) => normalizeText(command.label).includes(needle));
    const issues: PaletteCommand[] = [];
    for (const issue of state.issues) {
      if (issues.length >= MAX_ISSUES) break;
      const key = issueKey(state, issue);
      if (!normalizeText(`${key} ${issue.title}`).includes(needle)) continue;
      issues.push({
        id: `issue-${issue.id}`,
        label: issue.title,
        group: 'Issues',
        shortcut: key,
        icon: <StatusIcon status={issue.status} />,
        run: go(paths.issue(key)),
      });
    }
    return [...matches, ...issues];
  }, [state, query]);

  return (
    <CommandDialog
      open
      onOpenChange={(open) => {
        if (!open) closeOverlays();
      }}
      title="Paleta de comandos"
      description="Busque issues, backlogs, projetos e ações."
      className="sm:max-w-xl"
    >
      {/* Filtering is done above (accent-insensitive, and issues only appear when searching). */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Buscar issues, backlogs, projetos e ações…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-96">
          <CommandEmpty>Nada encontrado para “{query}”</CommandEmpty>
          {GROUPS.map((group) => {
            const items = commands.filter((command) => command.group === group);
            if (items.length === 0) return null;
            return (
              <CommandGroup key={group} heading={group}>
                {items.map((command) => (
                  <CommandItem key={command.id} value={command.id} onSelect={command.run}>
                    {command.icon}
                    <span className="truncate">{command.label}</span>
                    {command.shortcut && <CommandShortcut>{command.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
