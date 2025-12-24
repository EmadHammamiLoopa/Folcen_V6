import { Component, OnInit } from '@angular/core';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-events',
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.scss']
})
export class EventsComponent implements OnInit {
  overview: any = null;
  recent: any[] = [];
  loading = false;

  // Filters / pagination
  filterType: string = 'all';
  query: string = '';
  fromDate: string | null = null; // ISO date string
  toDate: string | null = null;   // ISO date string
  page = 1;
  pageSize = 20;
  hasMore = false;

  constructor(private admin: AdminService) {}

  ngOnInit(): void {
    this.loadOverview();
    this.loadRecent();
  }

  async loadOverview() {
    this.loading = true;
    try {
      const res: any = await this.admin.getAuthOverview();
      this.overview = res && (res.data || res) ? (res.data || res) : {};
    } catch (e) {
      console.error('Failed to load auth events overview', e);
    } finally { this.loading = false; }
  }

  async loadRecent(reset: boolean = true) {
    if (reset) { this.page = 1; }
    const skip = (this.page - 1) * this.pageSize;
    this.loading = true;
    try {
      const opts: any = { limit: this.pageSize, skip };
      if (this.filterType && this.filterType !== 'all') opts.type = this.filterType;
      if (this.query) opts.q = this.query;
      if (this.fromDate) opts.from = this.fromDate;
      if (this.toDate) opts.to = this.toDate;
      const res: any = await this.admin.getAuthRecent(opts);
      const events = res && res.data && Array.isArray(res.data.events) ? res.data.events : (res.events || []);
      if (reset) this.recent = events; else this.recent = this.recent.concat(events);
      this.hasMore = events.length === this.pageSize;
    } catch (e) {
      console.error('Failed to load recent auth events', e);
    } finally { this.loading = false; }
  }

  async nextPage() {
    if (!this.hasMore) return;
    this.page += 1;
    await this.loadRecent(false);
  }

  async prevPage() {
    if (this.page <= 1) return;
    this.page -= 1;
    await this.loadRecent(true);
  }

  applyFilters() {
    this.loadOverview();
    this.loadRecent(true);
  }

  clearFilters() {
    this.filterType = 'all'; this.query = ''; this.fromDate = null; this.toDate = null; this.page = 1; this.loadRecent(true);
  }
}
