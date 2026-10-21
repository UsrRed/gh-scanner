import type { Finding } from '../../shared/types.js';

export interface RawFinding extends Omit<Finding, 'id' | 'scanId' | 'fingerprint' | 'snippet'> { snippet?: string }
