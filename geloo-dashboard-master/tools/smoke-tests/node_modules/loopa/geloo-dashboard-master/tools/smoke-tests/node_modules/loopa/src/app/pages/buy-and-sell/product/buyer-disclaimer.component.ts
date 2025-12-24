import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-buyer-disclaimer',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Buyer Safety & Disclaimer</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss(false)">
            <ion-icon name="close"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="disclaimer-container">
        <div class="icon-header">
          <ion-icon name="cart-outline" color="primary"></ion-icon>
        </div>

        <h2>Safe Buying Guide</h2>
        <p class="intro">
          To ensure a safe transaction, please read and acknowledge these guidelines before contacting the seller.
        </p>

        <section class="info-section">
          <h3>1. Independent Sellers</h3>
          <p>
            Sellers on this platform are independent individuals or businesses. The platform does not own, inspect, or guarantee any items listed.
          </p>
        </section>

        <section class="info-section">
          <h3>2. Inspect Before Paying</h3>
          <p>
            Always inspect the item in person before making any payment. Verify that the condition matches the description and photos.
          </p>
        </section>

        <section class="info-section">
          <h3>3. Safe Transactions</h3>
          <ul>
            <li>Meet in a safe, public location (e.g., a mall or coffee shop).</li>
            <li>Avoid carrying large amounts of cash. Use secure digital payments if possible.</li>
            <li>Never send money via wire transfer or untraceable methods to someone you haven't met.</li>
          </ul>
        </section>

        <section class="info-section">
          <h3>4. No Platform Liability</h3>
          <p>
            The platform is not responsible for fraudulent listings, defective items, or transaction disputes. You buy at your own risk.
          </p>
        </section>

        <div class="action-area">
          <ion-button expand="block" (click)="dismiss(true)" class="accept-btn">
            I Understand & Accept
          </ion-button>
          <ion-button expand="block" fill="clear" (click)="dismiss(false)" color="medium">
            Cancel
          </ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .disclaimer-container {
      max-width: 500px;
      margin: 0 auto;
    }
    .icon-header {
      text-align: center;
      font-size: 56px;
      margin-bottom: 15px;
    }
    h2 {
      text-align: center;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .intro {
      text-align: center;
      color: var(--ion-color-step-600);
      margin-bottom: 25px;
    }
    .info-section {
      margin-bottom: 20px;
      padding: 15px;
      background: var(--ion-color-step-50);
      border-radius: 12px;
    }
    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 8px;
      color: var(--ion-color-primary);
    }
    p, li {
      font-size: 0.95rem;
      line-height: 1.4;
      color: var(--ion-color-step-800);
    }
    ul {
      padding-left: 20px;
      margin: 0;
    }
    .action-area {
      margin-top: 30px;
      padding-bottom: 20px;
    }
    .accept-btn {
      --border-radius: 12px;
      font-weight: 600;
      height: 50px;
    }
  `]
})
export class BuyerDisclaimerComponent {
  constructor(private modalCtrl: ModalController) {}

  dismiss(accepted: boolean) {
    this.modalCtrl.dismiss(accepted);
  }
}
