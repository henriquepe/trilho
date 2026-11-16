import { mergeState, parseState } from '@/model';
import { navigate, paths } from '@/router';
import { actions, getAppState } from '@/store';
import { askConfirm } from '@/uiStore';
import { isDesktopApp } from './desktop';

function notify(title: string, message: string) {
  askConfirm({ title, message, confirmLabel: 'Entendi', onConfirm: () => {}, notice: true });
}

/** Saves the whole workspace as JSON: a native save dialog in the app, a download in the browser. */
export async function exportData() {
  const json = JSON.stringify(getAppState(), null, 2);
  const fileName = `trilho-${new Date().toISOString().slice(0, 10)}.json`;

  if (!isDesktopApp()) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }

  try {
    const [{ save }, { invoke }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/api/core'),
    ]);
    const path = await save({
      title: 'Exportar dados do Trilho',
      defaultPath: fileName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return;
    await invoke('write_json_file', { path, contents: json });
    notify('Backup salvo', `Os dados foram salvos em ${path}.`);
  } catch (error) {
    notify('Não foi possível exportar', error instanceof Error ? error.message : String(error));
  }
}

/** Validates a file and asks before adding its backlogs, projects and issues to the current data. */
export async function importData(file: File) {
  importText(await file.text());
}

function importText(text: string) {
  try {
    const incoming = parseState(JSON.parse(text));
    // Dry run: surfaces key conflicts before asking for confirmation.
    const { summary } = mergeState(getAppState(), incoming);
    askConfirm({
      title: 'Importar dados?',
      message:
        `${summary.added} issues novas e ${summary.updated} atualizadas, ` +
        `em ${summary.teams} backlogs e ${summary.projects} projetos. ` +
        'Nada do que já existe é apagado; itens com o mesmo identificador são atualizados.',
      confirmLabel: 'Importar',
      tone: 'default',
      onConfirm: () => {
        actions.merge(incoming);
        navigate(paths.all);
      },
    });
  } catch (error) {
    notify(
      'Não foi possível importar',
      error instanceof SyntaxError ? 'O arquivo não é um JSON válido.' : (error as Error).message,
    );
  }
}
