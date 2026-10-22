import type { Finding, RiskMatrix } from '../../shared/types.js';

export interface RawFinding extends Omit<Finding, 'id' | 'scanId' | 'fingerprint' | 'snippet' | 'risk'> { snippet?: string; risk?: Partial<RiskMatrix> }
