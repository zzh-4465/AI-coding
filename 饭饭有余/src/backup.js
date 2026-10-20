import { Capacitor, registerPlugin } from '@capacitor/core';
export const nativeBackup = Capacitor.getPlatform() === 'android';
const files = registerPlugin('BackupFiles');
export async function downloadBackup(text) {
  if (nativeBackup) return files.save({ text });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  link.download = '饭饭有余-备份.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
export async function openNativeBackup() {
  return JSON.parse((await files.open()).text);
}
