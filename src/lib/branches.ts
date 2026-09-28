/** Agents' worktree branches: `escouade/<name>`, or `ccm/<name>` for agents made before 0.1.4. */
const AGENT_BRANCH = /^(escouade|ccm)\//;

export const isAgentBranch = (ref: string) => AGENT_BRANCH.test(ref);

export const shortBranch = (ref: string) => ref.replace(AGENT_BRANCH, '');
