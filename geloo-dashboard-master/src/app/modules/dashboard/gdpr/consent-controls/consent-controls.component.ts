import { Component } from '@angular/core';
import { GdprService } from '../../../../services/gdpr.service';
import { NotificationService } from '../../../../services/notification.service';

@Component({
  selector: 'app-consent-controls',
  templateUrl: './consent-controls.component.html',
  styleUrls: ['./consent-controls.component.scss']
})
export class ConsentControlsComponent {
  userId = '';
  loading = false;
  saving = false;
  error = '';
  info = '';
  consent: any = null;
  showHistory = false;

  consentKeys = [
    {
      key: 'analytics_optin',
      label: 'Analytics Opt-In',
      description: 'Allow aggregated usage analytics & interest profiling',
      optOutNote: 'Disabling this will immediately delete the user\'s interest profile and stop all event tracking.'
    },
    {
      key: 'personalization',
      label: 'Personalisation',
      description: 'Allow content recommendations based on usage patterns',
      optOutNote: 'Disabling this will stop recommendation scoring for this user.'
    },
  ];

  constructor(private gdpr: GdprService, private notify: NotificationService) {}

  get historyItems(): any[] {
    return (this.consent?.history || []).slice().reverse().slice(0, 10);
  }

  lastChange(key: string): string {
    if (!this.consent?.history?.length) return '';
    const ev = [...this.consent.history].reverse().find((h: any) => h.key === key);
    if (!ev) return '';
    const who = ev.changedBy || 'admin';
    const when = ev.changedAt ? new Date(ev.changedAt).toLocaleString() : '';
    return `Changed by ${who} on ${when}`;
  }

  load() {
    if (!this.userId.trim()) { this.error = 'User ID is required'; return; }
    this.loading = true; this.error = ''; this.consent = null; this.info = '';

    this.gdpr.getConsentStatus(this.userId.trim()).subscribe({
      next: (res: any) => { this.consent = res.data || res; this.loading = false; },
      error: (e: any) => {
        this.error = e?.message || 'Failed to load consent';
        this.loading = false;
        this.notify.showError(this.error, 'Consent Load Failed');
      }
    });
  }

  toggle(key: string) {
    if (!this.consent) return;
    const current = this.consent[key] === true;
    this.saving = true;
    this.error = ''; this.info = '';

    this.gdpr.updateConsent(this.userId.trim(), key, !current).subscribe({
      next: (res: any) => {
        const newConsent = res.data?.consent || res.data || res;
        this.consent = { ...this.consent, ...newConsent, [key]: !current };
        this.info = `${key} updated to ${!current}`;
        this.saving = false;
        this.notify.showSuccess(this.info, 'Consent Updated');
      },
      error: (e: any) => {
        this.error = e?.message || 'Update failed';
        this.saving = false;
        this.notify.showError(this.error, 'Update Failed');
      }
    });
  }
}
