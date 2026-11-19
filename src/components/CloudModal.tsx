import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
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
import { cloudStatus, getAppState, syncNow } from '@/store';
import { cloudClient, loadCloudConfig, normalizeUrl, saveCloudConfig } from '@/sync/cloud';
import { mergeWorkspaces } from '@/sync/merge';
import { closeOverlays } from '@/uiStore';

const onOpenChange = (open: boolean) => {
  if (!open) closeOverlays();
};

function describeStatus(status: ReturnType<typeof cloudStatus.get>) {
  if (!status) return 'Desligada';
  if (status.state === 'syncing') return 'Sincronizando…';
  if (status.state === 'offline') return status.message;
  return `Sincronizada às ${new Date(status.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Connects the app to a hosted Trilho (see infra/). Connecting merges this workspace with the
 * hosted one, so nothing on either side is lost; after that the app syncs on its own.
 */
export function CloudModal() {
  const config = loadCloudConfig();
  const status = cloudStatus.use();
  const [url, setUrl] = useState(config?.url ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urlId = useId();
  const tokenId = useId();

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const next = { url: normalizeUrl(url), token: token.trim() };
      const client = cloudClient(next);
      const local = getAppState();
      for (let attempt = 0; ; attempt++) {
        const remote = await client.get();
        const written =
          remote.status === 'ok'
            ? mergeWorkspaces(undefined, local, remote.state) === remote.state
              ? ({ status: 'ok' } as const)
              : await client.put(mergeWorkspaces(undefined, local, remote.state), remote.etag)
            : await client.put(local, null);
        if (written.status === 'ok') break;
        if (attempt === 3) throw new Error('A nuvem mudou durante a conexão. Tente de novo.');
      }
      saveCloudConfig(next);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  const disconnect = () => {
    saveCloudConfig(null);
    window.location.reload();
  };

  if (config) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuvem</DialogTitle>
            <DialogDescription>
              Este app sincroniza com o Trilho hospedado. Bots e outras máquinas veem as mesmas issues. Uma cópia
              local continua salva para quando estiver sem conexão.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Endereço</dt>
            <dd className="truncate">{config.url}</dd>
            <dt className="text-muted-foreground">Situação</dt>
            <dd role="status">{describeStatus(status)}</dd>
          </dl>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={disconnect}>
              Desconectar
            </Button>
            <Button type="button" onClick={() => void syncNow()} disabled={status?.state === 'syncing'}>
              Sincronizar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={connect} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Conectar à nuvem</DialogTitle>
            <DialogDescription>
              Use o endereço e o token do seu Trilho hospedado. Este workspace é juntado ao da nuvem: nada se perde
              dos dois lados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={urlId}>Endereço</Label>
            <Input
              id={urlId}
              value={url}
              placeholder="https://…execute-api.sa-east-1.amazonaws.com"
              inputMode="url"
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={tokenId}>Token</Label>
            <Input
              id={tokenId}
              type="password"
              value={token}
              autoComplete="off"
              aria-invalid={!!error}
              onChange={(event) => setToken(event.target.value)}
            />
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
            <Button type="submit" disabled={busy || !url.trim() || !token.trim()}>
              {busy ? 'Conectando…' : 'Conectar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
