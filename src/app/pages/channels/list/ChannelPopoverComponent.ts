import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-channel-popover',
  template: `
    <div class="channel-info-shell">
      <div class="channel-info-aurora" aria-hidden="true"></div>

      <section class="channel-info-card" role="dialog" aria-modal="true" aria-labelledby="channel-info-title">
        <button type="button" class="close-btn" (click)="close()" aria-label="Close channel information">
          <ion-icon name="close-outline"></ion-icon>
        </button>

        <div class="info-header">
          <div class="img-wrapper">
            <img [src]="channel.photo" *ngIf="channel.photo" [alt]="channel.name + ' channel cover'" />
            <div class="fallback-icon" *ngIf="!channel.photo" aria-hidden="true">
              <ion-icon name="radio-outline"></ion-icon>
            </div>
            <div class="verified-icon" *ngIf="channel.approved" aria-label="Verified channel">
              <ion-icon name="checkmark-circle"></ion-icon>
            </div>
          </div>

          <span class="info-kicker">{{ isStaticChannel() ? 'Official local channel' : 'Community channel' }}</span>
          <h2 class="title" id="channel-info-title">{{ channel.name }}</h2>
          <div class="category-badge" *ngIf="channel.category">
            <ion-icon name="pricetag-outline" aria-hidden="true"></ion-icon>
            <span>{{ channel.category }}</span>
          </div>
        </div>

        <div class="info-content">
          <div class="description-panel">
            <ion-icon name="information-circle-outline" aria-hidden="true"></ion-icon>
            <p class="desc">{{ getEnhancedDescription(channel.name) }}</p>
          </div>

          <div class="stats-row">
            <div class="stat">
              <div class="stat-icon" aria-hidden="true">
                <ion-icon name="people-outline"></ion-icon>
              </div>
              <div class="stat-copy">
                <strong>{{ channel.followers?.length || 0 }}</strong>
                <span>Followers</span>
              </div>
            </div>
          </div>

          <div class="community-note">
            <div class="note-icon" aria-hidden="true">
              <ion-icon name="shield-checkmark-outline"></ion-icon>
            </div>
            <div>
              <strong>Community space</strong>
              <span>Be respectful, helpful, and follow the Folcen community guidelines.</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host {
      --modal-bg: var(--f-page-bg, #0b1120);
      --modal-surface: var(--f-surface, rgba(15, 23, 42, .96));
      --modal-surface-muted: var(--f-surface-muted, rgba(30, 41, 59, .72));
      --modal-border: var(--f-border, rgba(148, 163, 184, .14));
      --modal-border-strong: var(--f-border-strong, rgba(148, 163, 184, .22));
      --modal-text: var(--f-text-strong, #f8fafc);
      --modal-muted: var(--f-text-muted, #94a3b8);
      --modal-faint: var(--f-text-faint, #64748b);
      --modal-accent: var(--f-accent, #7c6cff);
      --modal-accent-soft: var(--f-accent-soft, rgba(124, 108, 255, .12));
      display: block;
      min-height: 100%;
      font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Roboto, sans-serif;
      color: var(--modal-text);
    }

    .channel-info-shell {
      position: relative;
      min-height: 100%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 22px 14px calc(22px + env(safe-area-inset-bottom));
      background: var(--modal-bg);
      overflow: auto;
    }

    .channel-info-aurora {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 14% 8%, rgba(124, 108, 255, .16), transparent 32%),
        radial-gradient(circle at 88% 18%, rgba(56, 189, 248, .10), transparent 34%),
        radial-gradient(circle at 50% 92%, rgba(236, 72, 153, .08), transparent 38%);
    }

    .channel-info-card {
      position: relative;
      z-index: 1;
      width: min(100%, 520px);
      box-sizing: border-box;
      padding: 22px;
      border: 1px solid var(--modal-border-strong);
      border-radius: 24px;
      background: var(--modal-surface);
      box-shadow: 0 24px 70px rgba(0, 0, 0, .24);
      backdrop-filter: blur(24px) saturate(150%);
      -webkit-backdrop-filter: blur(24px) saturate(150%);
    }

    .close-btn {
      appearance: none;
      position: absolute;
      top: 12px;
      right: 12px;
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid var(--modal-border);
      border-radius: 13px;
      color: var(--modal-muted);
      background: var(--modal-surface-muted);
      cursor: pointer;
      z-index: 5;
    }

    .close-btn ion-icon { font-size: 19px; }
    .close-btn:active { transform: scale(.94); }

    .info-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 8px 28px 18px;
    }

    .img-wrapper {
      position: relative;
      width: 82px;
      height: 82px;
      margin-bottom: 13px;
    }

    .img-wrapper img,
    .fallback-icon {
      width: 100%;
      height: 100%;
      border-radius: 22px;
      border: 1px solid var(--modal-border-strong);
      box-shadow: 0 12px 30px rgba(0, 0, 0, .18);
    }

    .img-wrapper img {
      display: block;
      object-fit: cover;
    }

    .fallback-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--modal-accent);
      background: var(--modal-accent-soft);
    }

    .fallback-icon ion-icon { font-size: 34px; }

    .verified-icon {
      position: absolute;
      right: -5px;
      bottom: -5px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 3px solid var(--modal-surface);
      border-radius: 50%;
      color: #60a5fa;
      background: var(--modal-surface);
    }

    .verified-icon ion-icon { font-size: 20px; }

    .info-kicker {
      margin-bottom: 4px;
      color: var(--modal-accent);
      font-size: 9px;
      font-weight: 760;
      letter-spacing: .09em;
      text-transform: uppercase;
    }

    .title {
      margin: 0;
      color: var(--modal-text);
      font-size: 21px;
      font-weight: 730;
      line-height: 1.15;
      letter-spacing: -.03em;
    }

    .category-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-top: 8px;
      min-height: 28px;
      padding: 0 10px;
      border: 1px solid rgba(124, 108, 255, .18);
      border-radius: 999px;
      color: var(--modal-accent);
      background: var(--modal-accent-soft);
      font-size: 9.5px;
      font-weight: 680;
    }

    .category-badge ion-icon { font-size: 12px; }

    .info-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .description-panel,
    .community-note,
    .stat {
      border: 1px solid var(--modal-border);
      border-radius: 17px;
      background: var(--modal-surface-muted);
    }

    .description-panel {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      gap: 10px;
      padding: 14px;
    }

    .description-panel > ion-icon {
      margin-top: 1px;
      color: var(--modal-accent);
      font-size: 18px;
    }

    .desc {
      margin: 0;
      color: var(--modal-muted);
      font-size: 12px;
      line-height: 1.5;
      text-align: left;
    }

    .stats-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
    }

    .stat-icon,
    .note-icon {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      color: var(--modal-accent);
      background: var(--modal-accent-soft);
    }

    .stat-icon ion-icon,
    .note-icon ion-icon { font-size: 17px; }

    .stat-copy strong,
    .stat-copy span,
    .community-note strong,
    .community-note span {
      display: block;
    }

    .stat-copy strong {
      color: var(--modal-text);
      font-size: 13px;
      font-weight: 720;
    }

    .stat-copy span {
      margin-top: 1px;
      color: var(--modal-muted);
      font-size: 9.5px;
    }

    .community-note {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
    }

    .community-note strong {
      color: var(--modal-text);
      font-size: 10.5px;
      font-weight: 680;
    }

    .community-note span {
      margin-top: 2px;
      color: var(--modal-muted);
      font-size: 9.5px;
      line-height: 1.4;
    }

    @media (max-width: 420px) {
      .channel-info-shell {
        align-items: flex-end;
        padding: 12px 10px calc(12px + env(safe-area-inset-bottom));
      }

      .channel-info-card {
        padding: 18px 14px 16px;
        border-radius: 22px;
      }

      .info-header { padding-inline: 26px; }
      .img-wrapper { width: 72px; height: 72px; }
      .title { font-size: 19px; }
    }

    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation: none !important; }
    }
  `]
})
export class ChannelPopoverComponent {
  @Input() channel: any;

  constructor(private modalCtrl: ModalController) {}

  close() {
    this.modalCtrl.dismiss();
  }

  isStaticChannel(): boolean {
    return ['static', 'static_events', 'static_dating'].includes(this.channel?.type);
  }

  getEnhancedDescription(name: string): string {
    switch (name) {
      case `${this.channel.city} Local News`:
        return `Get the latest updates and breaking news in ${this.channel.city}. Stay connected to everything happening around you.`;
      case `${this.channel.city} Arts and Culture`:
        return `Immerse yourself in the rich arts and culture scene of ${this.channel.city}. From live performances to art galleries, there's always something inspiring.`;
      case `${this.channel.city} Lost & Found`:
        return `Lost something important? Found something valuable? This is your go-to spot for reconnecting lost items with their owners in ${this.channel.city}.`;
      case `${this.channel.city} Neighborhood Watch`:
        return `Keep ${this.channel.city} safe by staying informed. Share safety tips and neighborhood alerts to ensure a secure environment for everyone.`;
      default:
        return this.channel.description;
    }
  }
}
