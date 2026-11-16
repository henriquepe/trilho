import {
  CalendarIcon,
  ChevronRightIcon,
  FolderIcon,
  KanbanIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  SignalIcon,
  TagIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDay, isOverdue, isTypingTarget } from '@/lib/format';
import { cn } from '@/lib/utils';
import { compareIssues, filterIssues, issueKey, PRIORITIES, STATUSES } from '@/model';
import { navigate, paths } from '@/router';
import { actions, useAppState } from '@/store';
import type { AppState, Issue, Priority, StatusId } from '@/types';
import { openNewIssue, openTeamModal, setViewMode, viewMode } from '@/uiStore';
import { ColorDot, PriorityIcon, StatusIcon } from './icons';
import { FilterPicker, PriorityPicker, StatusPicker } from './pickers';
import { Count, EmptyState, PageHeader } from './shared';

interface Scope {
  teamId?: string;
  projectId?: string;
}

export function IssuesView({
  scope,
  title,
  icon,
  header,
}: {
  scope: Scope;
  title: string;
  icon?: ReactNode;
  /** Extra content rendered between the title bar and the issues (used by the project page). */
  header?: ReactNode;
}) {
  const state = useAppState();
  const mode = viewMode.use();
  const [text, setText] = useState('');
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<StatusId[]>(['canceled']);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || isTypingTarget(event.target) || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const { teamId, projectId } = scope;
  const issues = useMemo(
    () => filterIssues(state, { teamId, projectId, text, priorities, labelIds, projectIds }).sort(compareIssues),
    [state, teamId, projectId, text, priorities, labelIds, projectIds],
  );
  const byStatus = useMemo(() => {
    const groups = new Map<StatusId, Issue[]>(STATUSES.map((s) => [s.id, []]));
    for (const issue of issues) groups.get(issue.status)?.push(issue);
    return groups;
  }, [issues]);

  const filtersActive = !!text || priorities.length > 0 || labelIds.length > 0 || projectIds.length > 0;
  const clearFilters = () => {
    setText('');
    setPriorities([]);
    setLabelIds([]);
    setProjectIds([]);
  };
  const create = (status?: StatusId) => openNewIssue({ teamId, projectId: projectId ?? null, status });

  if (state.teams.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <EmptyState
          title="Nenhum backlog ainda"
          action={
            <Button onClick={() => openTeamModal()}>
              <PlusIcon /> Criar backlog
            </Button>
          }
        >
          Um backlog guarda as issues de um time, produto ou área da sua vida. Crie quantos quiser.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-auto">
      <PageHeader>
        <h1 className="mr-auto flex min-w-0 items-center gap-2 text-[15px] font-semibold">
          {icon}
          <span className="truncate">{title}</span>
          <Count>{issues.length}</Count>
        </h1>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={mode}
          aria-label="Visualização"
          onValueChange={(value) => {
            if (value === 'list' || value === 'board') setViewMode(value);
          }}
        >
          <ToggleGroupItem value="list">
            <ListIcon /> Lista
          </ToggleGroupItem>
          <ToggleGroupItem value="board">
            <KanbanIcon /> Quadro
          </ToggleGroupItem>
        </ToggleGroup>
        <Button size="sm" onClick={() => create()}>
          <PlusIcon /> Nova issue
        </Button>
      </PageHeader>

      {header}

      <div className="flex flex-wrap items-center gap-2 px-6 py-2.5">
        <div className="relative w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="h-7 pl-8"
            value={text}
            placeholder="Buscar por título ou código  /"
            aria-label="Buscar issues"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setText('');
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        <FilterPicker
          label="Prioridade"
          icon={<SignalIcon />}
          value={priorities}
          onChange={setPriorities}
          options={PRIORITIES.map((p) => ({ value: p.id, label: p.label, icon: <PriorityIcon priority={p.id} /> }))}
        />
        <FilterPicker
          label="Etiqueta"
          icon={<TagIcon />}
          value={labelIds}
          onChange={setLabelIds}
          options={state.labels.map((l) => ({ value: l.id, label: l.name, icon: <ColorDot color={l.color} /> }))}
        />
        {!projectId && (
          <FilterPicker
            label="Projeto"
            icon={<FolderIcon />}
            value={projectIds}
            onChange={setProjectIds}
            options={state.projects.map((p) => ({ value: p.id, label: p.name, icon: <ColorDot color={p.color} /> }))}
          />
        )}
        {filtersActive && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearFilters}>
            Limpar filtros
          </Button>
        )}
      </div>

      {issues.length === 0 ? (
        <EmptyState title={filtersActive ? 'Nenhuma issue com esses filtros' : 'Nenhuma issue por aqui'}>
          {filtersActive
            ? 'Ajuste a busca ou limpe os filtros para ver tudo.'
            : 'Crie a primeira com o botão acima ou apertando C.'}
        </EmptyState>
      ) : mode === 'list' ? (
        <div className="pb-10" role="list">
          {STATUSES.map((status) => {
            const group = byStatus.get(status.id) ?? [];
            if (group.length === 0) return null;
            const isCollapsed = collapsed.includes(status.id);
            return (
              <section key={status.id}>
                <div className="-mt-px flex h-9 items-center justify-between border-y bg-muted/60 pr-5 pl-3">
                  <button
                    type="button"
                    className="flex h-full items-center gap-2 rounded-sm text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((value) =>
                        isCollapsed ? value.filter((s) => s !== status.id) : [...value, status.id],
                      )
                    }
                  >
                    <ChevronRightIcon
                      className={cn('size-3.5 text-muted-foreground transition-transform', !isCollapsed && 'rotate-90')}
                    />
                    <StatusIcon status={status.id} />
                    <span>{status.label}</span>
                    <Count>{group.length}</Count>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title={`Nova issue em ${status.label}`}
                    aria-label={`Nova issue em ${status.label}`}
                    onClick={() => create(status.id)}
                  >
                    <PlusIcon />
                  </Button>
                </div>
                {!isCollapsed &&
                  group.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} state={state} showProject={!projectId} />
                  ))}
              </section>
            );
          })}
        </div>
      ) : (
        <Board byStatus={byStatus} state={state} onCreate={create} showProject={!projectId} />
      )}
    </div>
  );
}

function isClosed(issue: Issue) {
  return issue.status === 'done' || issue.status === 'canceled';
}

function IssueMeta({ issue, state, showProject }: { issue: Issue; state: AppState; showProject: boolean }) {
  const labels = state.labels.filter((l) => issue.labelIds.includes(l.id));
  const project = showProject ? state.projects.find((p) => p.id === issue.projectId) : undefined;
  return (
    <>
      {labels.map((label) => (
        <Badge key={label.id} variant="outline" className="font-normal text-muted-foreground">
          <ColorDot color={label.color} className="size-1.5" />
          {label.name}
        </Badge>
      ))}
      {project && (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          <ColorDot color={project.color} className="size-1.5" />
          {project.name}
        </Badge>
      )}
      {issue.dueDate && (
        <Badge
          variant={isOverdue(issue.dueDate) && !isClosed(issue) ? 'destructive' : 'outline'}
          className="font-normal"
        >
          <CalendarIcon />
          {formatDay(issue.dueDate)}
        </Badge>
      )}
    </>
  );
}

const keyClass = 'shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums';

function IssueRow({ issue, state, showProject }: { issue: Issue; state: AppState; showProject: boolean }) {
  const key = issueKey(state, issue);
  return (
    <div className="flex h-10 items-center gap-2 border-b pr-6 pl-5 hover:bg-muted/50" role="listitem">
      <PriorityPicker
        iconOnly
        value={issue.priority}
        onChange={(priority) => actions.updateIssue(issue.id, { priority })}
      />
      <span className={cn(keyClass, 'min-w-13')}>{key}</span>
      <StatusPicker iconOnly value={issue.status} onChange={(status) => actions.updateIssue(issue.id, { status })} />
      <a
        className={cn(
          'flex min-w-20 flex-1 items-center self-stretch truncate text-sm font-medium outline-none focus-visible:underline',
          isClosed(issue) && 'text-muted-foreground',
        )}
        href={`#${paths.issue(key)}`}
      >
        <span className="truncate">{issue.title}</span>
      </a>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        <IssueMeta issue={issue} state={state} showProject={showProject} />
      </span>
    </div>
  );
}

function Board({
  byStatus,
  state,
  onCreate,
  showProject,
}: {
  byStatus: Map<StatusId, Issue[]>;
  state: AppState;
  onCreate: (status: StatusId) => void;
  showProject: boolean;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<StatusId | null>(null);

  return (
    <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto px-6 pt-1 pb-5">
      {STATUSES.map((status) => {
        const group = byStatus.get(status.id) ?? [];
        return (
          <section
            key={status.id}
            className={cn(
              'flex min-h-40 w-72 shrink-0 flex-col rounded-xl border border-transparent bg-muted/60',
              over === status.id && 'border-primary bg-primary/10',
            )}
            aria-label={status.label}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              if (over !== status.id) setOver(status.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('text/plain') || dragging;
              if (id) actions.updateIssue(id, { status: status.id });
              setOver(null);
              setDragging(null);
            }}
          >
            <header className="flex items-center gap-2 py-2 pr-2 pl-3 text-sm font-medium">
              <StatusIcon status={status.id} />
              <span>{status.label}</span>
              <Count>{group.length}</Count>
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                title={`Nova issue em ${status.label}`}
                aria-label={`Nova issue em ${status.label}`}
                onClick={() => onCreate(status.id)}
              >
                <PlusIcon />
              </Button>
            </header>
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2.5">
              {group.map((issue) => {
                const key = issueKey(state, issue);
                return (
                  <article
                    key={issue.id}
                    data-slot="issue-card"
                    className={cn(
                      'flex cursor-grab flex-col gap-1.5 rounded-lg border bg-card px-3 pt-2 pb-2.5 shadow-xs hover:border-input',
                      dragging === issue.id && 'opacity-40',
                    )}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', issue.id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDragging(issue.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onClick={() => navigate(paths.issue(key))}
                  >
                    <div className="flex items-center justify-between">
                      <span className={keyClass}>{key}</span>
                      <PriorityPicker
                        iconOnly
                        value={issue.priority}
                        onChange={(priority) => actions.updateIssue(issue.id, { priority })}
                      />
                    </div>
                    <a
                      className={cn(
                        'text-sm font-medium wrap-anywhere outline-none focus-visible:underline',
                        isClosed(issue) && 'text-muted-foreground',
                      )}
                      href={`#${paths.issue(key)}`}
                      draggable={false}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {issue.title}
                    </a>
                    <div className="flex flex-wrap gap-1 empty:hidden">
                      <IssueMeta issue={issue} state={state} showProject={showProject} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
