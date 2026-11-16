/** True inside the installed desktop app (Tauri), false in a regular browser tab. */
export const isDesktopApp = () => '__TAURI_INTERNALS__' in window;

/** Opens a URL in the default browser. Inside the app a plain `target=_blank` link does nothing. */
export async function openExternal(url: string) {
  if (!isDesktopApp()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}
