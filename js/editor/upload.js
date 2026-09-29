// Prepares files for committing to the repo. Everything is stored in the repo
// itself (GitHub Pages can't serve Git LFS), so sizes are kept small:
//   images -> resized + converted to WebP in the browser
//   PDFs   -> size limit
//   video  -> hard limit + a nudge toward YouTube / Google Drive
import { slugify, formatBytes, confirmDialog } from '../ui.js';
import { filesDir } from '../store.js';

const MB = 1024 * 1024;

function uploadPath(slug, originalName, ext) {
  const base = slugify(originalName.replace(/\.[^.]+$/, '')).slice(0, 40) || 'file';
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rnd = crypto.getRandomValues(new Uint16Array(1))[0].toString(36);
  return `${filesDir(slug)}/${date}-${base}-${rnd}.${ext}`;
}

async function compressImage(file, maxDim, quality) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') {
    // Very old Safari can't encode WebP: fall back to JPEG.
    const jpg = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return { blob: jpg, ext: 'jpg', width: w, height: h };
  }
  return { blob, ext: 'webp', width: w, height: h };
}

/**
 * @returns {Promise<{path, blob, size, note}>} or throws Error with a friendly message.
 */
export async function prepareUpload(file, kind, { config, slug }) {
  const lim = config.uploads || {};
  if (!file) throw new Error('Choose a file first.');

  if (kind === 'image') {
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      throw new Error('SVG uploads are blocked for security. Export the image as PNG or JPG instead.');
    }
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(file.type)) throw new Error('Use a PNG, JPG, WebP or GIF image.');
    if (file.size > (lim.maxImageMB || 15) * MB) throw new Error(`That image is ${formatBytes(file.size)}. The limit is ${lim.maxImageMB || 15} MB.`);
    if (file.type === 'image/gif') {
      if (file.size > 5 * MB) throw new Error('GIFs must be under 5 MB. Use a short video or a YouTube link instead.');
      return { path: uploadPath(slug, file.name, 'gif'), blob: file, size: file.size, note: 'GIF kept as-is.' };
    }
    const out = await compressImage(file, lim.imageMaxDimension || 2000, lim.imageQuality || 0.82);
    const useOriginal = out.blob.size >= file.size && /^image\/(webp|jpeg)$/.test(file.type);
    const blob = useOriginal ? file : out.blob;
    const ext = useOriginal ? (file.type === 'image/webp' ? 'webp' : 'jpg') : out.ext;
    return {
      path: uploadPath(slug, file.name, ext),
      blob,
      size: blob.size,
      note: useOriginal ? `Kept original (${formatBytes(blob.size)}).` : `Optimized ${formatBytes(file.size)} → ${formatBytes(blob.size)} (${out.width}×${out.height}).`,
    };
  }

  if (kind === 'pdf') {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('That file is not a PDF.');
    if (file.size > (lim.maxPdfMB || 25) * MB) throw new Error(`That PDF is ${formatBytes(file.size)}. The limit is ${lim.maxPdfMB || 25} MB. Put large PDFs in Google Drive and add a Drive link instead.`);
    return { path: uploadPath(slug, file.name, 'pdf'), blob: file, size: file.size, note: formatBytes(file.size) };
  }

  if (kind === 'video') {
    if (!/^video\/(mp4|webm)$/.test(file.type)) throw new Error('Use an MP4 (H.264) or WebM video so it plays in every browser.');
    const max = lim.maxVideoMB || 50;
    const warn = lim.warnVideoMB || 15;
    if (file.size > max * MB) {
      throw new Error(`That video is ${formatBytes(file.size)}. Videos stored in the repo are limited to ${max} MB (GitHub's hard limit is 100 MB, and big files slow the site down). Upload it to YouTube (unlisted) or Google Drive and add it as an embed instead.`);
    }
    if (file.size > warn * MB) {
      const ok = await confirmDialog({
        title: 'Large video',
        message: `This video is ${formatBytes(file.size)}. Every visitor downloads it from the repo, and it makes the repo bigger forever. YouTube (unlisted) or Google Drive is usually a better home for videos over ${warn} MB. Upload it here anyway?`,
        confirmLabel: 'Upload anyway',
        cancelLabel: 'Cancel',
      });
      if (!ok) throw Object.assign(new Error('Upload cancelled.'), { cancelled: true });
    }
    const ext = file.type === 'video/webm' ? 'webm' : 'mp4';
    return { path: uploadPath(slug, file.name, ext), blob: file, size: file.size, note: formatBytes(file.size) };
  }

  throw new Error('Unsupported upload type.');
}
