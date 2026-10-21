import type { Usage } from '../../shared/types.js';

export class BudgetTracker {
  private t: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };

  constructor(private readonly limits: { usd: number; tokens: number }) {}

  add(delta: Usage): void {
    this.t = {
      inputTokens: this.t.inputTokens + delta.inputTokens,
      outputTokens: this.t.outputTokens + delta.outputTokens,
      cacheReadTokens: this.t.cacheReadTokens + delta.cacheReadTokens,
      cacheCreationTokens: this.t.cacheCreationTokens + delta.cacheCreationTokens,
      costUsd: this.t.costUsd + delta.costUsd,
    };
  }

  get total(): Usage {
    return { ...this.t };
  }

  get exceeded(): boolean {
    const tokens = this.t.inputTokens + this.t.outputTokens + this.t.cacheReadTokens + this.t.cacheCreationTokens;
    return tokens >= this.limits.tokens || this.t.costUsd >= this.limits.usd;
  }
}
