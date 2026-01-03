import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { auditTime } from 'rxjs/operators';

export type TabKey =
  | 'profile'
  | 'friends'
  | 'messages'
  | 'new-friends'
  | 'channels'
  | 'feed'
  | 'buy-and-sell'
  | 'small-business';

@Injectable({ providedIn: 'root' })
export class AppEventsService {
  private subjects = new Map<TabKey, BehaviorSubject<number>>();
  private debug = true; // Set to false in production
  // Centralized missed-calls stream so UI can subscribe to a single source of truth
  // We keep an internal subject for immediate updates but expose a debounced
  // stream that runs the zone.run only at most every 100ms to avoid CD thrash.
  private missedCallsSubject = new BehaviorSubject<any[]>([]);
  private debouncedMissedCallsSubject = new BehaviorSubject<any[]>([]);
  public missedCalls$ = this.debouncedMissedCallsSubject.asObservable();
  // Budget updates (e.g., missedCallBudget) for feed and other UIs
  private budgetSubject = new BehaviorSubject<number>(0);
  public budget$ = this.budgetSubject.asObservable();

  private showTabsSubject = new BehaviorSubject<boolean>(true);
  public showTabs$ = this.showTabsSubject.asObservable();

  constructor(private zone: NgZone) {
    // seed all known tabs with 0
    ['profile','friends','messages','new-friends','channels','feed','buy-and-sell','small-business']
      .forEach(k => this.subjects.set(k as TabKey, new BehaviorSubject<number>(0)));

    // Debounce the missedCallsSubject and push debounced values into debouncedMissedCallsSubject
    // using zone.run so subscribers see updates but change-detection isn't flooded.
    this.missedCallsSubject.subscribe((calls) => {
      if (this.debug) console.log('[AppEvents] missedCallsSubject emitted:', calls?.length);
      this.zone.run(() => {
        this.debouncedMissedCallsSubject.next(calls || []);
      });
    });
  }

  /** Observable stream for a tab's badge count */
  badge$(tab: TabKey): Observable<number> {
    if (!tab) {
      // Return a safe default observable if tab is null/undefined
      return new BehaviorSubject<number>(0).asObservable();
    }
    const subject = this.subjects.get(tab);
    if (subject) {
      return subject.asObservable();
    }
    return this.ensure(tab).asObservable();
  }

  /** Current numeric value (for logic) */
  get(tab: TabKey): number {
    return (this.subjects.get(tab) ?? this.ensure(tab)).value;
  }

  /** Set absolute value */
  set(tab: TabKey, count: number): void {
    if (this.debug) console.log(`Setting ${tab} badge to ${count}`);
    this.zone.run(() => (this.subjects.get(tab) ?? this.ensure(tab)).next(Math.max(0, count || 0)));
  }

  /** Increment/decrement by delta (can be negative) */
  inc(tab: TabKey, delta = 1): void {
    if (this.debug) console.log(`Incrementing ${tab} badge by ${delta}`);
    const s = this.subjects.get(tab) ?? this.ensure(tab);
    this.zone.run(() => s.next(Math.max(0, (s.value || 0) + (delta || 0))));
  }

  /** Reset to zero */
  reset(tab: TabKey): void {
    if (this.debug) console.log(`Resetting ${tab} badge to 0`);
    this.set(tab, 0);
  }

  /** Replace the missed calls array and notify subscribers (debounced) */
  setMissedCalls(calls: any[]) {
    if (this.debug) console.log('AppEvents: setting missedCalls ->', calls?.length || 0);
    
    // Performance monitoring
    if (typeof (window as any).__perfMonitor !== 'undefined') {
      (window as any).__perfMonitor.incrementMissedCallsSet();
    }
    
    // Prevent no-op emissions: only emit if value actually changed
    const currentCalls = this.missedCallsSubject.value || [];
    const newCount = (calls || []).length;
    const currentCount = currentCalls.length;
    
    if (newCount === currentCount && newCount === 0) {
      if (this.debug) console.log('AppEvents: Skipping redundant 0->0 missedCalls emission');
      return;
    }
    
    // Emit immediately to the internal subject; the debounced subject will
    // be updated inside the zone at most every 100ms.
    this.missedCallsSubject.next(calls || []);
  }

  /** Get current missed calls snapshot */
  getMissedCalls(): any[] {
    return this.missedCallsSubject.value || [];
  }

  /** Set budget value and notify subscribers */
  setBudget(amount: number) {
    if (this.debug) console.log('[AppEvents] setting budget ->', amount);
    try { this.zone.run(() => this.budgetSubject.next(Number(amount) || 0)); } catch(e) { this.budgetSubject.next(Number(amount) || 0); }
  }

  setShowTabs(show: boolean) {
    if (this.debug) console.log('[AppEvents] setting showTabs ->', show);
    try { this.zone.run(() => this.showTabsSubject.next(show)); } catch(e) { this.showTabsSubject.next(show); }
  }

  private ensure(tab: TabKey): BehaviorSubject<number> {
    const s = new BehaviorSubject<number>(0);
    this.subjects.set(tab, s);
    return s;
  }
}