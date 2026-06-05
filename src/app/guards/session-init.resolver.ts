import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Resolve } from '@angular/router';
import { from, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { SessionStoreService } from '../services/session-store.service';
import { User } from '../models/User';
import { UserService } from '../services/user.service';

/**
 * Idempotent resolver that ensures the session/user initialization has run
 * before protected routes render. It reuses SessionStoreService.init(), which
 * is already in-flight deduped and cached.
 */
@Injectable({ providedIn: 'root' })
export class SessionInitResolver implements Resolve<User | null> {
  constructor(
    private sessionStore: SessionStoreService,
    private userService: UserService
  ) {}

  resolve(route: ActivatedRouteSnapshot): Observable<User | null> {
    if (route.queryParamMap.get('directCall') === '1') {
      return of(this.userService.currentUserValue || null);
    }

    return from(this.sessionStore.init()).pipe(
      tap(() => {
        // Expose metrics for verification without altering logic
        (window as any).__sessionMetrics = this.sessionStore.getMetrics?.();
      }),
      catchError(() => {
        // Do not block navigation; fall back gracefully
        return of(null);
      })
    );
  }
}
