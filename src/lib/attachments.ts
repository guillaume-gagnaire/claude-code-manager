// Files attached to a message: images, PDFs and text files, as Claude reads them.

import type { Attachment } from './types';

export type AttachmentKind = 'image' | 'pdf' | 'text';

/** An attachment waiting in the composer; images keep a preview. */
export interface DraftAttachment extends Attachment {
  kind: AttachmentKind;
  url?: string;
}

/** The only image formats the API reads. */
const IMAGE_EXTENSIONS = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['gif', 'image/gif'],
  ['webp', 'image/webp'],
]);
const IMAGE_TYPES = new Set(IMAGE_EXTENSIONS.values());

// Extensions (or whole names, for files without one) read as text: Windows often gives such
// files no type, or a wrong one (.ts is "video/mp2t").
const TEXT_EXTENSIONS = new Set(
  (
    'txt text md markdown mdx rst adoc org tex bib log csv tsv json jsonc json5 jsonl ndjson ' +
    'yaml yml toml ini cfg conf config properties env xml xsd xsl html htm xhtml svg css scss sass less ' +
    'js mjs cjs jsx ts mts cts tsx vue svelte astro py pyi rb php java kt kts scala groovy gradle go rs ' +
    'c h cc cpp cxx hpp hh cs fs fsx vb swift m mm dart lua pl pm r jl ex exs erl hs clj elm zig nim ' +
    'sql graphql gql proto prisma tf hcl http sh bash zsh fish ps1 psm1 psd1 bat cmd diff patch ' +
    'lock gitignore gitattributes editorconfig dockerfile makefile license readme srt vtt'
  ).split(' '),
);
const TEXT_TYPES = /^(text\/|application\/([\w.-]+\+)?(json|xml|yaml|x-yaml|toml|sql|javascript|x-sh)$)/;

const LIMITS_MB: Record<AttachmentKind, number> = { image: 5, pdf: 20, text: 1 };

const SUPPORTED = 'les fichiers acceptés sont les images (PNG, JPEG, GIF, WebP), les PDF et les fichiers texte';

/** For the file dialog's filter. */
export const ACCEPT = [...IMAGE_TYPES, 'application/pdf', '.pdf', 'text/*', ...[...TEXT_EXTENSIONS].map((e) => '.' + e)].join(',');

function extension(name: string): string {
  const n = name.toLowerCase();
  return n.slice(n.lastIndexOf('.') + 1);
}

export function attachmentKind(f: File): AttachmentKind | null {
  const ext = extension(f.name);
  if (IMAGE_TYPES.has(f.type) || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (f.type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (TEXT_EXTENSIONS.has(ext) || TEXT_TYPES.test(f.type)) return 'text';
  return null;
}

function read(f: File, as: 'dataURL'): Promise<string>;
function read(f: File, as: 'arrayBuffer'): Promise<ArrayBuffer>;
function read(f: File, as: 'dataURL' | 'arrayBuffer'): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result!);
    r.onerror = () => reject(new Error(`${f.name} n'a pas pu être lu`));
    if (as === 'dataURL') r.readAsDataURL(f);
    else r.readAsArrayBuffer(f);
  });
}

function utf8(buf: ArrayBuffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

/** Reads a file to attach; rejects with the reason to show when it cannot be. */
export async function readAttachment(f: File): Promise<DraftAttachment> {
  const kind = attachmentKind(f);
  if (!kind) throw new Error(`« ${f.name} » ne peut pas être joint : ${SUPPORTED}.`);
  const max = LIMITS_MB[kind];
  if (f.size > max * 1024 * 1024) throw new Error(`${f.name} dépasse ${max} Mo`);
  if (kind === 'text') {
    const data = utf8(await read(f, 'arrayBuffer'));
    if (data === null || data.includes('\0')) {
      throw new Error(`${f.name} n'est pas un fichier texte UTF-8 : il ne peut pas être joint.`);
    }
    return { kind, name: f.name, mediaType: 'text/plain', data };
  }
  const url = await read(f, 'dataURL');
  const data = url.slice(url.indexOf(',') + 1);
  if (kind === 'pdf') return { kind, name: f.name, mediaType: 'application/pdf', data };
  const mediaType = IMAGE_TYPES.has(f.type) ? f.type : IMAGE_EXTENSIONS.get(extension(f.name))!;
  return { kind, name: f.name || 'image', mediaType, data, url };
}

/** A file dropped outside a drop zone would make the WebView open it in place of the app. */
export function guardFileDrops(target: Window): () => void {
  const files = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
  const over = (e: DragEvent) => {
    if (e.defaultPrevented || !files(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'none';
  };
  const drop = (e: DragEvent) => {
    if (files(e)) e.preventDefault();
  };
  target.addEventListener('dragover', over);
  target.addEventListener('drop', drop);
  return () => {
    target.removeEventListener('dragover', over);
    target.removeEventListener('drop', drop);
  };
}
