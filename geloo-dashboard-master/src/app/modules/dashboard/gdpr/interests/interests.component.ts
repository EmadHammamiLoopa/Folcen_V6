import { Component, OnInit, OnDestroy } from '@angular/core';
import { GdprService } from '../../../../services/gdpr.service';
import { NotificationService } from '../../../../services/notification.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

interface ConsentStats { optedIn: number; optedOut: number; neverResponded: number; total: number; optOutRate: string; }
interface CategoryRow { _id: string; count: number; eventTypes?: string[]; }
interface ChannelRow { _id: string; count: number; channelName?: string; }
interface EventRow { _id: string; count: number; }
interface EvidenceEvent { eventType: string; category?: string; channelId?: string; timestamp: string; }
interface ExplainResult { consentStatus: string; userId?: string; computedAt?: string; topCategories?: { category: string; score: number }[]; evidence?: EvidenceEvent[]; }

@Component({
  selector: 'app-interests',
  templateUrl: './interests.component.html',
  styleUrls: ['./interests.component.scss']
})
export class InterestsComponent implements OnInit, OnDestroy {
  // ── Aggregate view ──
  loading = false;
  error = '';
  stats: ConsentStats | null = null;
  topCategories: CategoryRow[] = [];
  topChannels: ChannelRow[] = [];
  eventBreakdown: EventRow[] = [];
  period: { from: string; to: string } | null = null;

  fromDate = '';
  toDate = '';

  // ── Per-user explainer ──
  explainUserId = '';
  explainLoading = false;
  explainError = '';
  explainResult: ExplainResult | null = null;

  private destroy$ = new Subject<void>();
  private explainSubject = new Subject<string>();

  constructor(
    private gdpr: GdprService,
    private notify: NotificationService
  ) {}

  ngOnInit() {
    this.loadAggregates();
    // Debounce explainer look-up
    this.explainSubject.pipe(
      debounceTime(600),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(uid => {
      if (uid && uid.trim().length === 24) this.runExplainer(uid.trim());
    });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  loadAggregates() {
    this.loading = true; this.error = '';
    const params: any = {};
    if (this.fromDate) params.fromDate = this.fromDate;
    if (this.toDate) params.toDate = this.toDate;

    this.gdpr.getAggregatedInterests(params).subscribe({
      next: (res: any) => {
        const d = res.data || res;
        this.stats = d.consentStats || null;
        this.topCategories = d.topCategories || [];
        this.topChannels = d.topChannels || [];
        this.eventBreakdown = d.eventBreakdown || [];
        this.period = d.period || null;
        this.loading = false;
      },
      error: (e: any) => {
        this.error = e?.message || 'Failed to load analytics';
        this.loading = false;
        this.notify.showError(this.error, 'Analytics Error');
      }
    });
  }

  refresh() {
    this.gdpr.clearCache('interests:');
    this.loadAggregates();
  }

  onExplainInput(val: string) { this.explainSubject.next(val); }

  runExplainer(userId: string) {
    this.explainLoading = true; this.explainError = ''; this.explainResult = null;
    this.gdpr.getInterestExplainer(userId).subscribe({
      next: (res: any) => { this.explainResult = res.data || res; this.explainLoading = false; },
      error: (e: any) => {
        this.explainError = e?.message || 'Failed to load explainer';
        this.explainLoading = false;
      }
    });
  }

  totalEvents(): number {
    return this.eventBreakdown.reduce((s, e) => s + e.count, 0);
  }

  eventPct(count: number): string {
    const total = this.totalEvents();
    return total > 0 ? ((count / total) * 100).toFixed(1) : '0';
  }

  consentPct(n: number): string {
    if (!this.stats || !this.stats.total) return '0';
    return ((n / this.stats.total) * 100).toFixed(0);
  }
}
