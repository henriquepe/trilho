import { ChevronRightIcon, CornerLeftUpIcon, ExternalLinkIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { openExternal } from '@/lib/desktop';
import { formatDateTime } from '@/lib/format';
import { findIssueByKey, issueKey, subIssues } from '@/model';
import { navigate, paths } from '@/router';
import { actions, useAppState } from '@/store';
import { askConfirm } from '@/uiStore';
import { ColorDot, StatusIcon } from './icons';
import { LabelsPicker, PriorityPicker, ProjectPicker, StatusPicker, TeamPicker } from './pickers';
import { AutoTextarea, descriptionClass, EmptyState, PageHeader, titleClass } from './shared';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 grid gap-2">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-22 shrink-0 text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function IssuePage({ issueKeyParam }: { issueKeyParam: string }) {
  const state = useAppState();
  const issue = findIssueByKey(state, issueKeyParam);
  const [title, setTitle] = useState(issue?.title ?? '');

  // Reset the draft when navigating to another issue.
  const issueId = issue?.id;
  const savedTitle = issue?.title ?? '';
  useEffect(() => setTitle(savedTitle), [issueId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!issue) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <EmptyState
          title="Issue não encontrada"
          action={
            <Button variant="outline" asChild>
              <a href={`#${paths.all}`}>Ver todas as issues</a>
            </Button>
          }
        >
          O código {issueKeyParam} não existe ou a issue foi excluída.
        </EmptyState>
      </div>
    );
  }

  const team = state.teams.find((t) => t.id === issue.teamId);
  const key = issueKey(state, issue);
  const parent = issue.parentId ? state.issues.find((i) => i.id === issue.parentId) : undefined;
  const children = subIssues(state, issue.id);
  const update = (patch: Parameters<typeof actions.updateIssue>[1]) => actions.updateIssue(issue.id, patch);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-auto">
      <PageHeader>
        <nav className="mr-auto flex items-center gap-2 text-sm text-muted-foreground" aria-label="Caminho">
          <a
            className="flex items-center gap-2 font-medium text-foreground hover:underline"
            href={`#${paths.team(issue.teamId)}`}
          >
            <ColorDot color={team?.color ?? 'var(--muted-foreground)'} />
            {team?.name}
          </a>
          <ChevronRightIcon className="size-3.5" />
          {parent && (
            <>
              <a
                className="flex max-w-64 items-center gap-1.5 hover:text-foreground hover:underline"
                href={`#${paths.issue(issueKey(state, parent))}`}
                title={`Sub-issue de ${issueKey(state, parent)}`}
              >
                <CornerLeftUpIcon className="size-3.5 shrink-0" />
                <span className="truncate">{issueKey(state, parent)} {parent.title}</span>
              </a>
              <ChevronRightIcon className="size-3.5" />
            </>
          )}
          <span className="tabular-nums">{key}</span>
        </nav>
        <Button
          variant="destructive"
          size="sm"
          onClick={() =>
            askConfirm({
              title: `Excluir ${key}?`,
              message:
                children.length > 0
                  ? `“${issue.title}” será excluída em definitivo. As ${children.length} sub-issues continuam, sem issue-pai.`
                  : `“${issue.title}” será excluída em definitivo.`,
              confirmLabel: 'Excluir issue',
              onConfirm: () => {
                actions.deleteIssue(issue.id);
                navigate(paths.team(issue.teamId));
              },
            })
          }
        >
          Excluir
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex max-w-4xl min-w-0 flex-1 flex-col gap-3 px-6 py-7 md:px-10">
          <AutoTextarea
            className={titleClass}
            rows={1}
            ariaLabel="Título"
            value={title}
            placeholder="Título da issue"
            onChange={(value) => {
              // Titles are single-line: pasted line breaks become spaces.
              const next = value.replace(/\s*\n\s*/g, ' ');
              setTitle(next);
              if (next.trim()) update({ title: next.trim() });
            }}
            onBlur={() => setTitle(issue.title)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <AutoTextarea
            className={`${descriptionClass} min-h-40`}
            ariaLabel="Descrição"
            value={issue.description}
            placeholder="Adicione uma descrição…"
            onChange={(description) => update({ description })}
          />

          {children.length > 0 && (
            <Section title={`Sub-issues · ${children.filter((c) => c.status === 'done').length}/${children.length}`}>
              <div className="overflow-hidden rounded-lg border">
                {children.map((child) => {
                  const childKey = issueKey(state, child);
                  return (
                    <a
                      key={child.id}
                      href={`#${paths.issue(childKey)}`}
                      className="flex h-9 items-center gap-2.5 border-b px-3 text-sm last:border-b-0 hover:bg-muted/50"
                    >
                      <StatusIcon status={child.status} />
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{childKey}</span>
                      <span className="truncate">{child.title}</span>
                    </a>
                  );
                })}
              </div>
            </Section>
          )}

          {issue.links.length > 0 && (
            <Section title="Links">
              <ul className="grid gap-1">
                {issue.links.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.preventDefault();
                        void openExternal(link.url);
                      }}
                      className="inline-flex max-w-full items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLinkIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{link.title || link.url}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {issue.comments.length > 0 && (
            <Section title={`Comentários · ${issue.comments.length}`}>
              <ol className="grid gap-3">
                {issue.comments.map((comment) => (
                  <li key={comment.id} className="rounded-lg border bg-card px-3.5 py-2.5">
                    <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{comment.author}</span>
                      <span>{formatDateTime(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{comment.body}</p>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </div>

        <aside
          className="flex shrink-0 flex-col gap-2.5 border-t px-5 py-5 md:w-76 md:border-t-0 md:border-l"
          aria-label="Propriedades"
        >
          <Property label="Status">
            <StatusPicker value={issue.status} onChange={(status) => update({ status })} />
          </Property>
          <Property label="Prioridade">
            <PriorityPicker value={issue.priority} onChange={(priority) => update({ priority })} />
          </Property>
          <Property label="Backlog">
            <TeamPicker
              value={issue.teamId}
              onChange={(teamId) => {
                if (teamId === issue.teamId) return;
                // The key changes with the team, so follow the issue to its new address.
                const target = state.teams.find((t) => t.id === teamId);
                update({ teamId });
                if (target) navigate(paths.issue(`${target.key}-${target.nextNumber}`));
              }}
            />
          </Property>
          <Property label="Projeto">
            <ProjectPicker value={issue.projectId} onChange={(projectId) => update({ projectId })} />
          </Property>
          <Property label="Etiquetas">
            <LabelsPicker value={issue.labelIds} onChange={(labelIds) => update({ labelIds })} />
          </Property>
          <Property label="Estimativa">
            <Input
              className="h-7 w-36"
              type="number"
              min={0}
              step={1}
              aria-label="Estimativa em pontos"
              placeholder="Pontos"
              value={issue.estimate ?? ''}
              onChange={(event) =>
                update({ estimate: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })
              }
            />
          </Property>
          <Property label="Prazo">
            <Input
              className="h-7 w-36"
              type="date"
              aria-label="Prazo"
              value={issue.dueDate ?? ''}
              onChange={(event) => update({ dueDate: event.target.value || null })}
            />
          </Property>
          <Separator className="my-2" />
          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>Criada em {formatDateTime(issue.createdAt)}</div>
            <div>Atualizada em {formatDateTime(issue.updatedAt)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
