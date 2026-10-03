// The editor's file tree: a flat list of paths shown as folders and files.

export type FileStatus = 'M' | 'A' | 'D';

export interface TreeRow {
  kind: 'dir' | 'file';
  path: string;
  name: string;
  depth: number;
  /** A folder shown open. */
  open: boolean;
  /** A file changed in git. */
  status: FileStatus | null;
  /** A folder holding changed files. */
  changedInside: boolean;
}

interface Node {
  dirs: Map<string, Node>;
  files: string[];
}

const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);

export function treeRows(files: string[], expanded: Record<string, boolean>, status: Record<string, FileStatus>): TreeRow[] {
  const root: Node = { dirs: new Map(), files: [] };
  for (const f of files) {
    let n = root;
    for (const d of f.split('/').slice(0, -1)) {
      let c = n.dirs.get(d);
      if (!c) n.dirs.set(d, (c = { dirs: new Map(), files: [] }));
      n = c;
    }
    n.files.push(f);
  }
  const changed = Object.keys(status);
  const rows: TreeRow[] = [];
  const walk = (n: Node, depth: number, prefix: string) => {
    for (const name of [...n.dirs.keys()].sort(byName)) {
      const path = prefix + name;
      const open = !!expanded[path];
      rows.push({ kind: 'dir', path, name, depth, open, status: null, changedInside: changed.some((p) => p.startsWith(path + '/')) });
      if (open) walk(n.dirs.get(name)!, depth + 1, path + '/');
    }
    for (const path of [...n.files].sort((a, b) => byName(nameOf(a), nameOf(b)))) {
      rows.push({ kind: 'file', path, name: nameOf(path), depth, open: false, status: status[path] ?? null, changedInside: false });
    }
  };
  walk(root, 0, '');
  return rows;
}

/** The folders above `path`, outermost first. */
export function ancestors(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}
