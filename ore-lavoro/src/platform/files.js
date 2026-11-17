// Salvataggio di un file: condivisione su Android, download nel browser.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function exportFile(name, text) {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: 'Salva il backup' });
    } catch (err) {
      if (!/cancel/i.test(String(err?.message))) throw err; // chiudere il pannello non è un errore
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
