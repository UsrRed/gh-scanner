import { z } from 'zod';

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export const categorySchema = z.enum([
  'secrets', 'injection', 'deserialization', 'dependencies', 'ci-cd', 'install-scripts',
  'obfuscation', 'exfiltration', 'quality', 'prompt-injection', 'sandbox-violation', 'symlink',
]);

const relPath = z.string().min(1).refine((p) => !p.split(/[\\/]/).includes('..') && !/^([\\/]|[A-Za-z]:)/.test(p), 'path must be relative without ..');

export const MappingOutput = z.object({
  languages: z.array(z.string()),
  entryPoints: z.array(z.string()),
  manifests: z.array(z.string()),
  lockfiles: z.array(z.string()),
  ciWorkflows: z.array(z.string()),
  installScripts: z.array(z.string()),
  riskZones: z.array(z.object({ path: z.string(), reason: z.string(), categories: z.array(categorySchema) })),
});

export const ClaudeFinding = z.object({
  severity: severitySchema,
  category: categorySchema,
  rule: z.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1).max(160),
  file: relPath,
  line: z.number().int().positive().nullable(),
  explanation: z.string(),
  fix: z.string(),
});

export const TargetedOutput = z.object({ findings: z.array(ClaudeFinding) });

export const SynthesisOutput = z.object({
  verdict: z.enum(['trust', 'caution', 'do-not-install']),
  justification: z.string().max(1200),
  keyRisks: z.array(z.string()),
});

export type MappingOutputT = z.infer<typeof MappingOutput>;
export type ClaudeFindingT = z.infer<typeof ClaudeFinding>;
export type TargetedOutputT = z.infer<typeof TargetedOutput>;
export type SynthesisOutputT = z.infer<typeof SynthesisOutput>;
