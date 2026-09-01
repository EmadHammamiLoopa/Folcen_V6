import { Component } from '@angular/core';
import { GdprService } from '../../../../services/gdpr.service';
import { NotificationService } from '../../../../services/notification.service';

type Step = 'input' | 'confirm' | 'done';

@Component({
    selector: 'app-erase-user',
    templateUrl: './erase-user.component.html',
    styleUrls: ['./erase-user.component.scss'],
    standalone: false
})
export class EraseUserComponent {
  userId = '';
  reason = '';
  confirmText = '';   // must match userId before erasure is allowed
  loading = false;
  error = '';
  step: Step = 'input';
  preview: any = null;  // { wouldDelete: { ... } }
  result: any = null;

  previewKeys = [
    { key: 'posts',           label: 'Posts',            icon: 'fas fa-file-alt' },
    { key: 'comments',        label: 'Comments',         icon: 'fas fa-comment' },
    { key: 'messages',        label: 'Messages',         icon: 'fas fa-envelope' },
    { key: 'notifications',   label: 'Notifications',    icon: 'fas fa-bell' },
    { key: 'activities',      label: 'Activities',       icon: 'fas fa-bolt' },
    { key: 'pushTokens',      label: 'Push Tokens',      icon: 'fas fa-mobile-alt' },
    { key: 'follows',         label: 'Follows',          icon: 'fas fa-user-plus' },
    { key: 'dailyActivity',   label: 'Daily Activity',   icon: 'fas fa-calendar' },
    { key: 'analyticsEvents', label: 'Analytics Events', icon: 'fas fa-chart-bar' },
    { key: 'interestProfile', label: 'Interest Profile', icon: 'fas fa-tags' },
    { key: 'consents',        label: 'Consent Records',  icon: 'fas fa-toggle-on' },
  ];

  constructor(private gdpr: GdprService, private notify: NotificationService) {}

  get countsSource(): any { return this.preview?.wouldDelete || this.preview?.counts || this.preview || {}; }
  get confirmValid(): boolean { return this.confirmText.trim() === this.userId.trim() && !!this.reason.trim(); }

  runPreview() {
    if (!this.userId.trim()) { this.error = 'User ID is required'; return; }
    this.loading = true;
    this.error = '';

    this.gdpr.erasePreview(this.userId.trim()).subscribe({
      next: (res: any) => {
        this.preview = res.data || res;
        this.step = 'confirm';
        this.loading = false;
      },
      error: (e: any) => {
        this.error = e?.message || 'Preview failed';
        this.loading = false;
        this.notify.showError(this.error, 'Preview Failed');
      }
    });
  }

  confirmErase() {
    if (!this.confirmValid) return;
    this.loading = true;
    this.error = '';

    this.gdpr.eraseUser(this.userId.trim(), this.reason.trim()).subscribe({
      next: (res: any) => {
        this.result = res.data || res;
        this.step = 'done';
        this.loading = false;
        this.notify.showSuccess('User erasure completed', 'Erasure Complete');
      },
      error: (e: any) => {
        this.error = e?.message || 'Erasure failed';
        this.loading = false;
        this.notify.showError(this.error, 'Erasure Failed');
      }
    });
  }

  reset() {
    this.userId = ''; this.reason = ''; this.confirmText = '';
    this.preview = null; this.result = null; this.error = '';
    this.step = 'input';
  }
}
