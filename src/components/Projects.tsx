import { FolderIcon, PlusIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { formatDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { projectProgress } from '@/model';
import { navigate, paths } from '@/router';
import { actions, useAppState } from '@/store';
import { askConfirm, openProjectModal } from '@/uiStore';
import { ColorDot } from './icons';
import { IssuesView } from './IssuesView';
import { ProjectStatusPicker } from './pickers';
import { AutoTextarea, Count, EmptyState, PageHeader, titleClass } from './shared';

const progressClass = 'h-1.5 *:data-[slot=progress-indicator]:bg-(--st-done)';
const rowGrid = 'grid grid-cols-[minmax(180px,1fr)_170px_190px_70px_90px] items-center gap-3.5 px-6';

export function ProjectsPage() {
  const state = useAppState();
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-auto">
      <PageHeader>
        <h1 className="mr-auto flex items-center gap-2 text-[15px] font-semibold">
          <FolderIcon className="size-4" />
          <span>Projetos</span>
          <Count>{state.projects.length}</Count>
        </h1>
        <Button size="sm" onClick={openProjectModal}>
          <PlusIcon /> Novo projeto
        </Button>
      </PageHeader>

      {state.projects.length === 0 ? (
        <EmptyState
          title="Nenhum projeto ainda"
          action={
            <Button onClick={openProjectModal}>
              <PlusIcon /> Criar projeto
            </Button>
          }
        >
          Um projeto reúne issues de qualquer backlog em torno de uma entrega, com progresso próprio.
        </EmptyState>
      ) : (
        <div className="pb-10" role="list">
          <div className={cn(rowGrid, 'h-8 border-b bg-muted/60 text-xs text-muted-foreground')} aria-hidden="true">
            <span>Projeto</span>
            <span>Status</span>
            <span>Progresso</span>
            <span>Issues</span>
            <span>Meta</span>
          </div>
          {state.projects.map((project) => {
            const progress = projectProgress(state, project.id);
            return (
              <div key={project.id} className={cn(rowGrid, 'min-h-11 border-b hover:bg-muted/50')} role="listitem">
                <a
                  className="flex min-w-0 items-center gap-2.5 self-stretch text-sm font-medium outline-none focus-visible:underline"
                  href={`#${paths.project(project.id)}`}
                >
                  <ColorDot color={project.color} />
                  <span className="truncate">{project.name}</span>
                </a>
                <span>
                  <ProjectStatusPicker
                    value={project.status}
                    onChange={(status) => actions.updateProject(project.id, { status })}
                  />
                </span>
                <span className="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
                  <Progress
                    value={progress.percent}
                    className={progressClass}
                    aria-label={`Progresso de ${project.name}`}
                  />
                  {progress.percent}%
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {progress.done}/{progress.total}
                </span>
                <span className="text-sm text-muted-foreground">
                  {project.targetDate ? formatDay(project.targetDate) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProjectPage({ projectId }: { projectId: string }) {
  const state = useAppState();
  const project = state.projects.find((p) => p.id === projectId);
  const [name, setName] = useState(project?.name ?? '');
  const targetId = useId();
  const savedName = project?.name ?? '';
  useEffect(() => setName(savedName), [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!project) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <EmptyState
          title="Projeto não encontrado"
          action={
            <Button variant="outline" asChild>
              <a href={`#${paths.projects}`}>Ver projetos</a>
            </Button>
          }
        />
      </div>
    );
  }

  const progress = projectProgress(state, project.id);
  const update = (patch: Parameters<typeof actions.updateProject>[1]) => actions.updateProject(project.id, patch);

  return (
    <IssuesView
      scope={{ projectId: project.id }}
      title={project.name}
      icon={<ColorDot color={project.color} className="size-3" />}
      header={
        <section className="flex flex-col gap-2 border-b px-6 pt-5 pb-3.5" aria-label="Detalhes do projeto">
          <input
            className={cn(titleClass, 'w-full bg-transparent outline-none')}
            value={name}
            aria-label="Nome do projeto"
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim()) update({ name: event.target.value.trim() });
            }}
            onBlur={() => setName(project.name)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
            }}
          />
          <AutoTextarea
            className="text-sm"
            rows={2}
            ariaLabel="Descrição do projeto"
            value={project.description}
            placeholder="Descreva o objetivo do projeto…"
            onChange={(description) => update({ description })}
          />
          <div className="flex flex-wrap items-center gap-3.5">
            <ProjectStatusPicker value={project.status} onChange={(status) => update({ status })} />
            <div className="flex items-center gap-2">
              <Label htmlFor={targetId} className="font-normal text-muted-foreground">
                Meta
              </Label>
              <Input
                id={targetId}
                className="h-7 w-36"
                type="date"
                value={project.targetDate ?? ''}
                onChange={(event) => update({ targetDate: event.target.value || null })}
              />
            </div>
            <span className="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
              <Progress
                value={progress.percent}
                className={cn(progressClass, 'w-36')}
                aria-label="Progresso do projeto"
              />
              {progress.percent}% · {progress.done} de {progress.total} concluídas
            </span>
            <Button
              variant="destructive"
              size="sm"
              className="ml-auto"
              onClick={() =>
                askConfirm({
                  title: `Excluir o projeto ${project.name}?`,
                  message: 'As issues continuam nos seus backlogs, apenas sem projeto.',
                  confirmLabel: 'Excluir projeto',
                  onConfirm: () => {
                    actions.deleteProject(project.id);
                    navigate(paths.projects);
                  },
                })
              }
            >
              Excluir
            </Button>
          </div>
        </section>
      }
    />
  );
}
