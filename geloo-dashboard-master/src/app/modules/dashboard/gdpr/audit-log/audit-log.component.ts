import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { GdprService } from '../../../../services/gdpr.service';

@Component({
  selector: 'app-audit-log',
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss']
})
export class AuditLogComponent implements OnInit, OnDestroy {
  logs: any[] = [];
  loading = false;
  error = '';
  total = 0;
  totalPages = 1;

  filterUserId = '';
  filterAction = '';
  page = 1;
  limit = 25;

  expandedRows = new Set<string>();

  private userId$ = new Subject<string>();
  private action$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(private gdpr: GdprService) {}

  ngOnInit() {
    this.load();

    this.userId$.pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.load());

    this.action$.pipe(debounceTime(350), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.load());
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  onUserIdInput(v: string) { this.userId$.next(v); }
  onActionInput(v: string) { this.action$.next(v); }

  load(resetPage = true) {
    if (resetPage) { this.page = 1; this.expandedRows.clear(); }
    this.loading = true; this.error = '';
    const params: any = { page: this.page, limit: this.limit };
    if (this.filterUserId.trim()) params.userId  = this.filterUserId.trim();
    if (this.filterAction.trim())  params.action  = this.filterAction.trim();

    this.gdpr.getAuditLogs(params).subscribe({
      next: (res: any) => {
        const data = res.data || res;
        this.logs = Array.isArray(data) ? data : (data.docs || data.logs || []);
        this.total = data.total || this.logs.length;
        this.totalPages = data.totalPages || Math.ceil(this.total / this.limit) || 1;
        this.loading = false;
      },
      error: (e: any) => { this.error = e?.message || 'Failed to load audit log'; this.loading = false; }
    });
  }

  toggleRow(id: string) {
    this.expandedRows.has(id) ? this.expandedRows.delete(id) : this.expandedRows.add(id);
  }
  isExpanded(id: string): boolean { return this.expandedRows.has(id); }
  rowId(log: any): string { return log._id || log.id || JSON.stringify(log).slice(0, 30); }

  nextPage() { if (this.page < this.totalPages) { this.page++; this.load(false); } }
  prevPage() { if (this.page > 1) { this.page--; this.load(false); } }
  clearFilters() { this.filterUserId = ''; this.filterAction = ''; this.load(); }
}
