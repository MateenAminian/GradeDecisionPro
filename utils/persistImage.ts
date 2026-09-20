import { Platform } from 'react-native';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read photo'));
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load card photo'));
    img.src = src;
  });
}

async function downscaleDataUrl(dataUrl: string, maxEdge = 720, quality = 0.72): Promise<string> {
  if (typeof document === 'undefined') return dataUrl;
  const img = await loadHtmlImage(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Keep a copy that survives refresh: data URL on web, original file URI on native. */
export async function persistImageUri(uri: string): Promise<string> {
  if (!uri) return uri;
  try {
    if (Platform.OS !== 'web' && !uri.startsWith('blob:') && !uri.startsWith('data:')) {
      return uri;
    }
    const dataUrl = uri.startsWith('data:')
      ? uri
      : await blobToDataUrl(await (await fetch(uri)).blob());
    return await downscaleDataUrl(dataUrl);
  } catch {
    return uri;
  }
}
