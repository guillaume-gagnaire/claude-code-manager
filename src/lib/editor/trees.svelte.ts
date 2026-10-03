// The file trees of the editor's sources, by project and source.

import { api } from '../ipc';
import type { FileTree } from '../types';
import { sourceAgent } from './buffers.svelte';

class Trees {
  all = $state<Record<string, FileTree>>({});

  get(projectId: string, source: string): FileTree | undefined {
    return this.all[`${projectId}|${source}`];
  }

  async load(projectId: string, source: string): Promise<FileTree> {
    const t = await api.fsTree(projectId, sourceAgent(source));
    this.all[`${projectId}|${source}`] = t;
    return t;
  }

  reset() {
    this.all = {};
  }
}

export const trees = new Trees();
