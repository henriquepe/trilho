import { useId, useRef, useState, type FormEvent } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { COLORS, makeTeamKey, sanitizeTeamKey } from '@/model';
import { navigate, paths } from '@/router';
import { actions, useAppState } from '@/store';
import type { Priority, StatusId } from '@/types';
import { closeOverlays, type ConfirmRequest, type NewIssueDefaults } from '@/uiStore';
import { LabelsPicker, PriorityPicker, ProjectPicker, StatusPicker, TeamPicker } from './pickers';
import { AutoTextarea, titleClass } from './shared';

const onOpenChange = (open: boolean) => {
  if (!open) closeOverlays();
};

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label="Cor">
      {COLORS.map((color) => (
        <button
          type="button"
          key={color}
          role="radio"
          aria-checked={value === color}
          aria-label={`Cor ${color}`}
          className={cn(
            'size-6 rounded-full border-2 border-popover outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === color && 'ring-2 ring-foreground',
          )}
          style={{ background: color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

export function NewIssueModal({ defaults }: { defaults: NewIssueDefaults }) {
  const state = useAppState();
  const [teamId, setTeamId] = useState(defaults.teamId ?? state.teams[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<StatusId>(defaults.status ?? 'backlog');
  const [priority, setPriority] = useState<Priority>(0);
  const [projectId, setProjectId] = useState<string | null>(defaults.projectId ?? null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [keepOpen, setKeepOpen] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const keepOpenId = useId();

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!title.trim() || !teamId) return;
    const issue = actions.addIssue({ teamId, title, description, status, priority, projectId, labelIds });
    if (!keepOpen) {
      closeOverlays();
      return;
    }
    const team = state.teams.find((t) => t.id === teamId);
    setCreated(`${team?.key}-${issue.number}`);
    setTitle('');
    setDescription('');
    titleRef.current?.focus();
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={false}
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <form onSubmit={submit} className="grid gap-3">
          <DialogHeader className="flex-row items-center gap-2.5">
            <TeamPicker value={teamId} onChange={setTeamId} />
            <DialogTitle className="text-sm font-normal text-muted-foreground">Nova issue</DialogTitle>
          </DialogHeader>
          <input
            ref={titleRef}
            className={cn(titleClass, 'w-full bg-transparent outline-none placeholder:text-muted-foreground/60')}
            value={title}
            placeholder="Título da issue"
            aria-label="Título"
            onChange={(event) => setTitle(event.target.value)}
          />
          <AutoTextarea
            className="min-h-18 text-sm"
            ariaLabel="Descrição"
            value={description}
            placeholder="Adicione uma descrição…"
            onChange={setDescription}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            <StatusPicker value={status} onChange={setStatus} />
            <PriorityPicker value={priority} onChange={setPriority} />
            <ProjectPicker value={projectId} onChange={setProjectId} />
            <LabelsPicker value={labelIds} onChange={setLabelIds} />
          </div>
          <DialogFooter className="sm:items-center">
            <div className="flex items-center gap-2 sm:mr-auto">
              <Checkbox
                id={keepOpenId}
                checked={keepOpen}
                onCheckedChange={(checked) => setKeepOpen(checked === true)}
              />
              <Label htmlFor={keepOpenId} className="font-normal text-muted-foreground">
                Criar outra em seguida
              </Label>
              {created && (
                <span className="text-xs text-muted-foreground" role="status">
                  {created} criada
                </span>
              )}
            </div>
            <Button type="button" variant="outline" onClick={closeOverlays}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!title.trim() || !teamId}>
              Criar issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamModal({ teamId }: { teamId: string | null }) {
  const state = useAppState();
  const editing = state.teams.find((t) => t.id === teamId);
  const [name, setName] = useState(editing?.name ?? '');
  const [key, setKey] = useState(editing?.key ?? '');
  const [color, setColor] = useState<string>(editing?.color ?? COLORS[state.teams.length % COLORS.length]);
  const [error, setError] = useState('');
  const nameId = useId();
  const keyId = useId();

  const otherKeys = state.teams.filter((t) => t.id !== teamId).map((t) => t.key);
  const suggestedKey = name.trim() ? makeTeamKey(name, otherKeys) : '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editing) {
        actions.updateTeam(editing.id, { name, key, color });
      } else {
        const team = actions.addTeam({ name, key, color });
        navigate(paths.team(team.id));
      }
      closeOverlays();
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar backlog' : 'Novo backlog'}</DialogTitle>
            <DialogDescription>
              Um backlog guarda as issues de um time, produto ou área. Crie quantos quiser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>Nome</Label>
            <Input
              id={nameId}
              value={name}
              placeholder="Ex.: Engenharia, Marketing, Casa"
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={keyId}>Sigla</Label>
            <Input
              id={keyId}
              value={key}
              placeholder={suggestedKey || 'ENG'}
              maxLength={6}
              aria-invalid={!!error}
              onChange={(event) => {
                setKey(sanitizeTeamKey(event.target.value));
                setError('');
              }}
            />
            <p className="text-xs text-muted-foreground">
              Prefixo dos códigos das issues, como {key || suggestedKey || 'ENG'}-1.
              {editing && ' Mudar a sigla muda o código de todas as issues deste backlog.'}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Cor</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeOverlays}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {editing ? 'Salvar' : 'Criar backlog'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectModal() {
  const state = useAppState();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(COLORS[(state.projects.length + 3) % COLORS.length]);
  const nameId = useId();
  const descriptionId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const project = actions.addProject({ name, description, color });
    closeOverlays();
    navigate(paths.project(project.id));
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Novo projeto</DialogTitle>
            <DialogDescription>
              Um projeto reúne issues de qualquer backlog em torno de uma entrega.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={nameId}>Nome</Label>
            <Input
              id={nameId}
              value={name}
              placeholder="Ex.: Lançamento da versão 2"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={descriptionId}>Descrição</Label>
            <Textarea
              id={descriptionId}
              rows={3}
              value={description}
              placeholder="Qual é o objetivo?"
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Cor</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeOverlays}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Criar projeto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmModal({ request }: { request: ConfirmRequest }) {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request.title}</AlertDialogTitle>
          <AlertDialogDescription>{request.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!request.notice && <AlertDialogCancel>Cancelar</AlertDialogCancel>}
          <AlertDialogAction
            variant={request.tone === 'default' || request.notice ? 'default' : 'destructive'}
            onClick={() => {
              closeOverlays();
              request.onConfirm();
            }}
          >
            {request.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
