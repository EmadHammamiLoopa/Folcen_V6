import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-applier-disclaimer',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Client Safety & Disclaimer</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss(false)">
            <ion-icon name="close" color="light"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding vibrant-dark-theme">
      <div class="mesh-gradient"></div>
      <div class="disclaimer-container">
        <div class="icon-header">
          <ion-icon name="shield-checkmark-outline"></ion-icon>
        </div>

        <h2>Important Safety Notice</h2>
        <p class="intro">
          To protect our community, please read and acknowledge these safety guidelines before contacting the provider.
        </p>

        <section class="glass-card">
          <h3>1. Independent Provider</h3>
          <p>
            This provider is an independent professional. The platform does NOT employ, endorse, or verify the quality of their work. You are hiring them directly at your own discretion.
          </p>
        </section>

        <section class="glass-card">
          <h3>2. Verify Before Hiring</h3>
          <p>
            Always ask for proof of identity, professional licenses, and insurance. Do not share sensitive personal information or financial details until you have verified the provider.
          </p>
        </section>

        <section class="glass-card">
          <h3>3. Safe Meeting & Payment</h3>
          <ul>
            <li>Meet in public, well-lit areas for initial consultations.</li>
            <li>Never pay the full amount upfront. Use milestone payments if possible.</li>
            <li>Tell a friend or family member about your meeting location and time.</li>
          </ul>
        </section>

        <section class="glass-card">
          <h3>4. Platform Disclaimer</h3>
          <p>
            The platform is a directory only. We are not responsible for any disputes, financial losses, or personal injuries. By proceeding, you release the platform from all liability.
          </p>
        </section>

        <div class="action-area">
          <ion-button expand="block" (click)="dismiss(true)" class="accept-btn">
            I Understand & Accept
          </ion-button>
          <ion-button expand="block" fill="clear" (click)="dismiss(false)" class="cancel-btn">
            Cancel
          </ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .vibrant-dark-theme {
      --background: #0a0a0c;
      color: #fff;
      position: relative;
    }
    .mesh-gradient {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background-image: 
        radial-gradient(at 0% 0%, rgba(108, 92, 231, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(0, 206, 201, 0.1) 0px, transparent 50%);
      z-index: 0;
    }
    ion-toolbar {
      --background: #0a0a0c;
      --color: #fff;
    }
    .disclaimer-container {
      position: relative;
      z-index: 1;
      max-width: 500px;
      margin: 0 auto;
    }
    .icon-header {
      text-align: center;
      font-size: 50px;
      margin: 10px 0;
      color: #a29bfe;
    }
    h2 {
      text-align: center;
      font-weight: 700;
      color: #fff;
      margin-bottom: 10px;
    }
    .intro {
      text-align: center;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 20px;
      font-size: 0.9rem;
    }
    .glass-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 15px;
      margin-bottom: 12px;
    }
    h3 {
      font-size: 1rem;
      font-weight: 600;
      color: #a29bfe;
      margin-top: 0;
      margin-bottom: 8px;
    }
    p, li {
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.85rem;
      line-height: 1.4;
    }
    ul {
      padding-left: 20px;
      margin: 0;
    }
    .action-area {
      margin-top: 25px;
      padding-bottom: 20px;
    }
    .accept-btn {
      --background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
      --border-radius: 12px;
      --box-shadow: 0 4px 15px rgba(108, 92, 231, 0.3);
      font-weight: 600;
      height: 50px;
    }
    .cancel-btn {
      --color: rgba(255, 255, 255, 0.5);
      font-size: 0.9rem;
    }
  `]
})
export class ApplierDisclaimerComponent {
  constructor(private modalCtrl: ModalController) {}

  dismiss(accepted: boolean) {
    this.modalCtrl.dismiss(accepted);
  }
}
