import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const ALLOWED_TOOLS = 'Read,Grep,Glob';
export const DISALLOWED_TOOLS = 'Bash,Write,Edit,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task';

export interface ArgsInput { model: string; systemPrompt: string; maxTurns: number; settingsFile: string; mcpFile: string }

export function buildClaudeArgs(a: ArgsInput): string[] {
  return ['-p', '--output-format', 'stream-json', '--verbose', '--model', a.model,
    '--allowedTools', ALLOWED_TOOLS, '--disallowedTools', DISALLOWED_TOOLS,
    '--strict-mcp-config', '--mcp-config', a.mcpFile, '--settings', a.settingsFile,
    '--append-system-prompt', a.systemPrompt, '--max-turns', String(a.maxTurns)];
}

/** Writes the sandbox settings and the empty MCP config under <claudeHome>; returns their paths. */
export function writeSandboxFiles(claudeHome: string): { settingsFile: string; mcpFile: string } {
  mkdirSync(claudeHome, { recursive: true });
  const settingsFile = path.join(claudeHome, 'sandbox-settings.json');
  const mcpFile = path.join(claudeHome, 'empty-mcp.json');
  writeFileSync(settingsFile, JSON.stringify({
    permissions: { allow: ['Read', 'Grep', 'Glob'], deny: DISALLOWED_TOOLS.split(','), defaultMode: 'default' },
    enableAllProjectMcpServers: false,
  }, null, 2));
  writeFileSync(mcpFile, JSON.stringify({ mcpServers: {} }));
  return { settingsFile, mcpFile };
}
