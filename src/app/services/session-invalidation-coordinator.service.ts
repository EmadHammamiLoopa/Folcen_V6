import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SessionInvalidationCoordinator {
  private inFlight: Promise<void> | null = null;

  invalidate(reason: string, executor: () => Promise<void>): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }

    const execution = Promise.resolve().then(() => executor());
    const guarded = execution.finally(() => {
      if (this.inFlight === guarded) {
        this.inFlight = null;
      }
    });

    this.inFlight = guarded;
    return guarded;
  }
}
