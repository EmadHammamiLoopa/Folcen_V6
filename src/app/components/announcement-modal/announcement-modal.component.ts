import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-announcement-modal',
  template: `
    <ion-content class="announcement-content">
      <div class="announcement-wrapper" [ngClass]="announcement.type">
        <div class="blob-bg"></div>
        
        <div class="main-card">
          <div class="header-visual">
            <div class="icon-circle">
              <ion-icon [name]="getIcon()"></ion-icon>
            </div>
            <div class="sparkles">
              <span></span><span></span><span></span>
            </div>
          </div>

          <div class="text-content">
            <h2 class="title">{{ announcement.title }}</h2>
            <div class="divider"></div>
            <p class="message">{{ announcement.content }}</p>
          </div>

          <div class="footer-actions">
            <ion-button expand="block" shape="round" (click)="dismiss()" class="action-btn">
              <ion-label>Got it</ion-label>
            </ion-button>
          </div>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .announcement-content {
      --background: transparent;
    }
    .announcement-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      padding: 20px;
      position: relative;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.95);
    }

    /* Background Blobs */
    .blob-bg {
      position: absolute;
      width: 300px;
      height: 300px;
      background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      filter: blur(80px);
      opacity: 0.15;
      border-radius: 50%;
      top: -50px;
      right: -50px;
      z-index: 0;
      animation: float 10s infinite alternate;
    }

    @keyframes float {
      from { transform: translate(0, 0) scale(1); }
      to { transform: translate(-20px, 30px) scale(1.1); }
    }

    .main-card {
      background: white;
      width: 100%;
      max-width: 340px;
      border-radius: 32px;
      padding: 32px 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
      position: relative;
      z-index: 1;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.8);
    }

    .header-visual {
      position: relative;
      margin-bottom: 24px;
      display: flex;
      justify-content: center;
    }

    .icon-circle {
      width: 88px;
      height: 88px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 44px;
      transform: rotate(-5deg);
      transition: transform 0.3s ease;
      box-shadow: 0 10px 20px -5px rgba(0,0,0,0.1);
    }
    .main-card:hover .icon-circle { transform: rotate(0deg) scale(1.05); }

    /* Type-specific colors */
    .announcement-wrapper.info .icon-circle { background: #eff6ff; color: #3b82f6; }
    .announcement-wrapper.success .icon-circle { background: #f0fdf4; color: #22c55e; }
    .announcement-wrapper.warning .icon-circle { background: #fffbeb; color: #f59e0b; }
    .announcement-wrapper.danger .icon-circle { background: #eef2ff; color: #6366f1; }

    .sparkles span {
      position: absolute;
      width: 6px;
      height: 6px;
      background: #a855f7;
      border-radius: 50%;
      opacity: 0.6;
    }
    .sparkles span:nth-child(1) { top: 10px; left: 20%; animation: pulse 2s infinite; }
    .sparkles span:nth-child(2) { bottom: 0; right: 25%; animation: pulse 2s infinite 0.5s; }
    .sparkles span:nth-child(3) { top: 40%; right: 15%; animation: pulse 2s infinite 1s; }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.5); opacity: 0.2; }
    }

    .title {
      font-size: 24px;
      font-weight: 800;
      color: #111827;
      margin: 0 0 12px 0;
      letter-spacing: -0.5px;
    }

    .divider {
      width: 40px;
      height: 4px;
      background: #e5e7eb;
      border-radius: 2px;
      margin: 0 auto 20px;
    }

    .message {
      font-size: 16px;
      line-height: 1.6;
      color: #4b5563;
      margin-bottom: 32px;
    }

    .action-btn {
      --background: #111827;
      --background-activated: #1f2937;
      --border-radius: 16px;
      --padding-top: 20px;
      --padding-bottom: 20px;
      margin: 0;
      font-weight: 700;
      letter-spacing: 0.5px;
      height: 56px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }

    .announcement-wrapper.success .action-btn { --background: #22c55e; }
    .announcement-wrapper.warning .action-btn { --background: #f59e0b; }
    .announcement-wrapper.danger .action-btn { --background: #6366f1; }
  `]
})
export class AnnouncementModalComponent implements OnInit {
  @Input() announcement: any;

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {}

  getIcon() {
    switch (this.announcement.type) {
      case 'warning': return 'alert-circle-outline';
      case 'success': return 'checkmark-circle-outline';
      case 'danger': return 'close-circle-outline';
      default: return 'information-circle-outline';
    }
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
