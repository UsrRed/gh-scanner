import { describe, expect, it } from 'vitest';
import { ACTIVE_STATUSES } from '../../shared/types.js';

describe('scaffold', () => {
  it('exposes shared constants', () => {
    expect(ACTIVE_STATUSES).toContain('cloning');
  });
});
