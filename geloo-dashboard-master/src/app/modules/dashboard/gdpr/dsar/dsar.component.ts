import { Component } from '@angular/core';
import { GdprService } from '../../../../services/gdpr.service';
import { NotificationService } from '../../../../services/notification.service';

@Component({
    selector: 'app-dsar',
    templateUrl: './dsar.component.html',
    styleUrls: ['./dsar.component.scss'],
    standalone: false
})
export class DsarComponent {
  userId = '';
  loading = false;
  error = '';
  exportData: any = null;

  sections = [
    { icon: 'fas fa-user',          label: 'Profile',          key: 'user' },
    { icon: 'fas fa-file-alt',      label: 'Posts',            key: 'posts' },
    { icon: 'fas fa-comments',      label: 'Messages',         key: 'messages' },
    { icon: 'fas fa-bell',          label: 'Notifications',    key: 'notifications' },
    { icon: 'fas fa-toggle-on',     label: 'Consent Record',   key: 'consentRecord' },
    { icon: 'fas fa-chart-bar',     label: 'Analytics Events', key: 'analyticsEventSummary' },
    { icon: 'fas fa-heart',         label: 'Follows',          key: 'follows' },
    { icon: 'fas fa-comment-alt',   label: 'Comments',         key: 'comments' },
    { icon: 'fas fa-calendar-alt',  label: 'Activity',         key: 'activities' },
  ];

  constructor(private gdpr: GdprService, private notify: NotificationService) {}

  export() {
    if (!this.userId.trim()) { this.error = 'User ID is required'; return; }
    this.loading = true;
    this.error = '';
    this.exportData = null;

    this.gdpr.exportUserDataAll(this.userId.trim()).subscribe({
      next: (res: any) => {
        this.exportData = res.data || res;
        this.loading = false;

        const pagesFetched =
          this.exportData?.dashboardAggregation?.pagesFetched || 1;

        if (this.exportData?.complete === false) {
          this.error =
            'The server did not mark the export complete. Do not treat this file as a complete DSAR.';
          this.notify.showError(
            this.error,
            'Incomplete DSAR Export'
          );
          return;
        }

        this.notify.showSuccess(
          `Complete export generated (${pagesFetched} page${pagesFetched === 1 ? '' : 's'} fetched)`,
          'DSAR Export'
        );
      },
      error: (e: any) => {
        this.error = e?.message || 'Failed to fetch export';
        this.loading = false;
        this.notify.showError(this.error, 'Export Failed');
      }
    });
  }

  downloadJson() {
    if (!this.exportData) return;
    const blob = new Blob([JSON.stringify(this.exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gdpr-export-${this.userId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify.showSuccess('JSON file downloaded', 'Download');
  }

  sectionHasData(key: string): boolean {
    if (!this.exportData) return false;
    // 'follows' is stored as separate 'followers' + 'following' arrays in the export
    if (key === 'follows') {
      const ers = this.exportData['followers'];
      const ing = this.exportData['following'];
      return (Array.isArray(ers) && ers.length > 0) || (Array.isArray(ing) && ing.length > 0);
    }
    const v = this.exportData[key];
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === 'object') return Object.keys(v).length > 0;
    return v != null;
  }

  reset() { this.userId = ''; this.exportData = null; this.error = ''; }
}
