import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { User } from '../models/User';
import { UserService } from './user.service';

interface SessionMetrics {
  initAttempts: number;
  initCompleted: number;
  profileHits: number;
  profileMisses: number;
}

/**
 * Centralized session store that initializes the authenticated user once per app session
 * and exposes a shared observable for consumers. It deduplicates concurrent init attempts
 * and surfaces lightweight metrics for debugging duplicate fetches.
 */
@Injectable({ providedIn: 'root' })
export class SessionStoreService {
  private userSubject = new BehaviorSubject<User | null>(null);
  readonly user$: Observable<User | null> = this.userSubject.asObservable();

  private inflightInit: Promise<User | null> | null = null;
  private metrics: SessionMetrics = {
    initAttempts: 0,
    initCompleted: 0,
    profileHits: 0,
    profileMisses: 0,
  };

  constructor(private userService: UserService) {
    // Keep session store in sync with user service state
    this.userService.currentUser.subscribe((u) => {
      if (u !== this.userSubject.value) {
        this.userSubject.next(u);
      }
    });
  }

  /** Initialize session once per app start. Uses in-flight deduping to avoid repeat calls. */
  async init(forceRefresh = false): Promise<User | null> {
    this.metrics.initAttempts += 1;
    const existing = this.userService.currentUserValue;
    if (existing && !forceRefresh) {
      this.metrics.profileHits += 1;
      this.userSubject.next(existing);
      return existing;
    }

    if (!forceRefresh && this.inflightInit) {
      return this.inflightInit;
    }

    const runInit = (async () => {
      try {
        const refreshed = await firstValueFrom(this.userService.refreshCurrentUser());
        this.metrics.profileMisses += 1;
        this.userSubject.next(refreshed);
        return refreshed;
      } catch (err) {
        console.warn('Session init failed, returning existing user if any', err);
        return this.userService.currentUserValue;
      } finally {
        this.metrics.initCompleted += 1;
        this.inflightInit = null;
        (window as any).__sessionMetrics = this.getMetrics();
      }
    })();

    this.inflightInit = runInit;
    return runInit;
  }

  /** Clear session state and caches on logout/user switch. */
  clear(reason = 'logout') {
    console.log(`🔁 SessionStore cleared (${reason})`);
    this.userSubject.next(null);
    this.userService.resetUserCache(reason);
  }

  /** Lightweight metrics for manual verification. */
  getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }
}
