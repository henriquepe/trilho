import { FolderIcon, PlusIcon, TagIcon } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { normalizeText, PRIORITIES, PROJECT_STATUSES, STATUSES } from '@/model';
import { actions, useAppState } from '@/store';
import type { Priority, ProjectStatus, StatusId } from '@/types';
import { ColorDot, PriorityIcon, ProjectStatusDot, StatusIcon } from './icons';

export interface Option<T> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/** Accent-insensitive substring match, so "revisao" finds "Em revisão". */
const matchOption = (value: string, search: string) =>
  normalizeText(value).includes(normalizeText(search.trim())) ? 1 : 0;

/** Searchable option list in a popover: shadcn Popover + Command. */
function OptionPicker<T>({
  trigger,
  options,
  isSelected,
  onPick,
  placeholder,
  onCreate,
  multiple,
}: {
  trigger: ReactElement;
  options: Option<T>[];
  isSelected: (value: T) => boolean;
  onPick: (value: T) => void;
  placeholder: string;
  onCreate?: (text: string) => void;
  multiple?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const needle = normalizeText(query.trim());
  const canCreate =
    !!onCreate && !!needle && !options.some((option) => normalizeText(option.label) === needle);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      {/* Clicks inside the portal must not reach a clickable card/row that contains the trigger. */}
      <PopoverContent align="start" className="w-60 p-0" onClick={(event) => event.stopPropagation()}>
        <Command filter={matchOption}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Nada encontrado</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={String(option.value)}
                  value={option.label}
                  data-checked={isSelected(option.value)}
                  onSelect={() => {
                    onPick(option.value);
                    if (!multiple) setOpen(false);
                  }}
                >
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  value={query}
                  onSelect={() => {
                    onCreate?.(query.trim());
                    setQuery('');
                  }}
                >
                  <PlusIcon />
                  <span className="truncate">Criar “{query.trim()}”</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PickerButton({
  icon,
  label,
  iconOnly,
  title,
  muted,
  active,
  ...props
}: {
  icon: ReactNode;
  label: string;
  iconOnly?: boolean;
  title: string;
  muted?: boolean;
  active?: boolean;
} & React.ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant={iconOnly ? 'ghost' : 'outline'}
      size={iconOnly ? 'icon-xs' : 'sm'}
      title={title}
      aria-label={`${title}: ${label}`}
      className={cn(
        !iconOnly && 'max-w-56 font-normal',
        muted && 'text-muted-foreground',
        active && 'border-primary/60 bg-primary/10',
      )}
      {...props}
      onClick={(event) => {
        // Keep the click from navigating when the picker sits inside a clickable card.
        event.stopPropagation();
        props.onClick?.(event);
      }}
    >
      {icon}
      {!iconOnly && <span className="truncate">{label}</span>}
    </Button>
  );
}

interface PickerProps<T> {
  value: T;
  onChange: (value: T) => void;
  iconOnly?: boolean;
}

export function StatusPicker({ value, onChange, iconOnly }: PickerProps<StatusId>) {
  const current = STATUSES.find((s) => s.id === value)!;
  return (
    <OptionPicker
      trigger={<PickerButton icon={<StatusIcon status={value} />} label={current.label} iconOnly={iconOnly} title="Status" />}
      options={STATUSES.map((s) => ({ value: s.id, label: s.label, icon: <StatusIcon status={s.id} /> }))}
      placeholder="Mudar status…"
      isSelected={(v) => v === value}
      onPick={onChange}
    />
  );
}

export function PriorityPicker({ value, onChange, iconOnly }: PickerProps<Priority>) {
  const current = PRIORITIES.find((p) => p.id === value)!;
  return (
    <OptionPicker
      trigger={
        <PickerButton
          icon={<PriorityIcon priority={value} />}
          label={value === 0 ? 'Prioridade' : current.label}
          iconOnly={iconOnly}
          title="Prioridade"
          muted={value === 0}
        />
      }
      options={PRIORITIES.map((p) => ({ value: p.id, label: p.label, icon: <PriorityIcon priority={p.id} /> }))}
      placeholder="Definir prioridade…"
      isSelected={(v) => v === value}
      onPick={onChange}
    />
  );
}

export function TeamPicker({ value, onChange }: PickerProps<string>) {
  const { teams } = useAppState();
  const current = teams.find((t) => t.id === value);
  return (
    <OptionPicker
      trigger={
        <PickerButton
          icon={<ColorDot color={current?.color ?? 'var(--muted-foreground)'} />}
          label={current?.name ?? 'Backlog'}
          title="Backlog"
        />
      }
      options={teams.map((t) => ({
        value: t.id,
        label: `${t.name} (${t.key})`,
        icon: <ColorDot color={t.color} />,
      }))}
      placeholder="Mover para o backlog…"
      isSelected={(v) => v === value}
      onPick={onChange}
    />
  );
}

export function ProjectPicker({ value, onChange }: PickerProps<string | null>) {
  const { projects } = useAppState();
  const current = projects.find((p) => p.id === value);
  const options: Option<string | null>[] = [
    { value: null, label: 'Sem projeto', icon: <FolderIcon /> },
    ...projects.map((p) => ({ value: p.id, label: p.name, icon: <ColorDot color={p.color} /> })),
  ];
  return (
    <OptionPicker
      trigger={
        <PickerButton
          icon={current ? <ColorDot color={current.color} /> : <FolderIcon />}
          label={current?.name ?? 'Projeto'}
          title="Projeto"
          muted={!current}
        />
      }
      options={options}
      placeholder="Definir projeto…"
      isSelected={(v) => v === value}
      onPick={onChange}
    />
  );
}

export function LabelsPicker({ value, onChange }: PickerProps<string[]>) {
  const { labels } = useAppState();
  const selected = labels.filter((l) => value.includes(l.id));
  return (
    <OptionPicker
      multiple
      trigger={
        <PickerButton
          icon={selected.length === 1 ? <ColorDot color={selected[0].color} /> : <TagIcon />}
          label={
            selected.length === 0
              ? 'Etiquetas'
              : selected.length === 1
                ? selected[0].name
                : `${selected.length} etiquetas`
          }
          title="Etiquetas"
          muted={selected.length === 0}
        />
      }
      options={labels.map((l) => ({ value: l.id, label: l.name, icon: <ColorDot color={l.color} /> }))}
      placeholder="Buscar ou criar etiqueta…"
      isSelected={(v) => value.includes(v)}
      onPick={(id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])}
      onCreate={(name) => onChange([...value, actions.addLabel(name).id])}
    />
  );
}

export function ProjectStatusPicker({ value, onChange }: PickerProps<ProjectStatus>) {
  const current = PROJECT_STATUSES.find((s) => s.id === value)!;
  return (
    <OptionPicker
      trigger={<PickerButton icon={<ProjectStatusDot status={value} />} label={current.label} title="Status do projeto" />}
      options={PROJECT_STATUSES.map((s) => ({ value: s.id, label: s.label, icon: <ProjectStatusDot status={s.id} /> }))}
      placeholder="Mudar status…"
      isSelected={(v) => v === value}
      onPick={onChange}
    />
  );
}

/** Multi-select filter used in the issues toolbar. */
export function FilterPicker<T>({
  label,
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  options: Option<T>[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <OptionPicker
      multiple
      trigger={
        <PickerButton
          icon={icon}
          label={value.length ? `${label}: ${value.length}` : label}
          title={`Filtrar por ${label.toLowerCase()}`}
          muted={value.length === 0}
          active={value.length > 0}
        />
      }
      options={options}
      placeholder={`Filtrar por ${label.toLowerCase()}…`}
      isSelected={(v) => value.includes(v)}
      onPick={(v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])}
    />
  );
}
