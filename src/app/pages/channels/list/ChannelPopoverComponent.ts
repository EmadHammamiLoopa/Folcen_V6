import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-channel-popover',
  template: `
    <div class="channel-info-card">
      <div class="card-glow"></div>
      
      <div class="info-header">
        <div class="img-wrapper">
          <img [src]="channel.photo" *ngIf="channel.photo" />
          <div class="verified-icon" *ngIf="channel.approved">
            <ion-icon name="checkmark-circle"></ion-icon>
          </div>
        </div>
        <h2 class="title">{{ channel.name }}</h2>
        <div class="category-badge" *ngIf="channel.category">{{ channel.category }}</div>
      </div>

      <div class="info-content">
        <p class="desc">{{ getEnhancedDescription(channel.name) }}</p>
        
        <div class="stats-row">
          <div class="stat">
            <i class="fas fa-users"></i>
            <span>{{ channel.followers?.length || 0 }} Followers</span>
          </div>
        </div>

        <div class="disclaimer">
          <div class="divider"></div>
          <div class="disclaimer-content">
            <i class="fas fa-info-circle"></i>
            <span>Community-driven space. Please be respectful.</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      --card-bg: rgba(30, 41, 59, 0.8);
      --accent: #6366f1;
    }

    .channel-info-card {
      background: var(--card-bg);
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
      padding: 24px;
      color: white;
      position: relative;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .card-glow {
      position: absolute;
      top: -50px;
      right: -50px;
      width: 150px;
      height: 150px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%);
      pointer-events: none;
    }

    .info-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      margin-bottom: 20px;
    }

    .info-header .img-wrapper {
      position: relative;
      width: 70px;
      height: 70px;
      margin-bottom: 12px;
    }

    .info-header .img-wrapper img {
      width: 100%;
      height: 100%;
      border-radius: 20px;
      object-fit: cover;
      border: 2px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    }

    .info-header .img-wrapper .verified-icon {
      position: absolute;
      bottom: -4px;
      right: -4px;
      color: var(--accent);
      background: white;
      border-radius: 50%;
      display: flex;
      font-size: 18px;
    }

    .info-header .title {
      font-size: 1.25rem;
      font-weight: 800;
      margin: 0 0 6px;
      letter-spacing: -0.02em;
    }

    .info-header .category-badge {
      font-size: 0.65rem;
      font-weight: 800;
      text-transform: uppercase;
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      padding: 4px 10px;
      border-radius: 20px;
      letter-spacing: 0.05em;
    }

    .info-content .desc {
      font-size: 0.95rem;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 20px;
      text-align: center;
    }

    .info-content .stats-row {
      display: flex;
      justify-content: center;
      margin-bottom: 20px;
    }

    .info-content .stats-row .stat {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
    }
    
    .info-content .stats-row .stat i { color: var(--accent); }

    .info-content .disclaimer .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.1), transparent);
      margin-bottom: 16px;
    }

    .info-content .disclaimer .disclaimer-content {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.4);
      line-height: 1.4;
    }

    .info-content .disclaimer .disclaimer-content i { font-size: 14px; }
  `]
})
export class ChannelPopoverComponent {
  @Input() channel: any;

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
