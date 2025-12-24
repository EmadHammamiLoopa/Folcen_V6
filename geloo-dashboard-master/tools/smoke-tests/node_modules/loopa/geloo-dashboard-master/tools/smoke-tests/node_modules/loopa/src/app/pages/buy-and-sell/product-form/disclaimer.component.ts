import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { LegalService } from '../../../services/legal.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-disclaimer',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Seller Disclaimer & Terms</ion-title>
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
          <ion-icon name="shield-checkmark-outline"></ion-icon>
        </div>

        <h2>Seller Terms, Disclaimer & Legal Notice</h2>
        <p class="intro">
          Please read the following terms carefully before publishing any product or service.
          By proceeding, you expressly acknowledge and agree to all terms below without limitation.
        </p>

        <section>
          <h3>1. Platform Role & Scope</h3>
          <p>
            This platform operates solely as a technical intermediary that enables communication
            between independent sellers and buyers. The platform is not a party to any transaction,
            does not own, manufacture, store, inspect, verify, or guarantee any products or services
            listed by users.
          </p>
          <p>
            All transactions occur directly between users at their own risk and responsibility.
          </p>
        </section>

        <section>
          <h3>2. Limitation of Liability</h3>
          <p>
            To the maximum extent permitted by applicable law, the platform, its owners, operators,
            affiliates, employees, and partners shall not be held liable for any direct, indirect,
            incidental, consequential, or special damages arising out of or related to:
          </p>
          <ul>
            <li>The quality, safety, legality, or availability of any product or service.</li>
            <li>The accuracy, completeness, or truthfulness of any listing or user-generated content.</li>
            <li>The ability of sellers to sell or buyers to pay.</li>
            <li>Any dispute, loss, injury, damage, delay, or failure related to a transaction.</li>
          </ul>
        </section>

        <section>
          <h3>3. Seller Responsibilities</h3>
          <p>
            As a seller, you acknowledge and agree that you are solely and fully responsible for:
          </p>
          <ul>
            <li>Providing accurate, lawful, and non-misleading descriptions and images.</li>
            <li>Ensuring you have full legal authority and rights to sell the listed item or service.</li>
            <li>Complying with all applicable local, national, and international laws and regulations.</li>
            <li>Handling all communications, fulfillment, refunds, and disputes with buyers.</li>
          </ul>
        </section>

        <section>
          <h3>4. Global Use & Legal Compliance</h3>
          <p>
            This platform is available for global use. Laws and regulations vary significantly
            between countries and jurisdictions. You acknowledge that it is solely your responsibility
            to understand, comply with, and adhere to all applicable laws in your country, the buyer’s
            country, and any other relevant jurisdiction.
          </p>
          <p>
            The platform does not provide legal advice and assumes no responsibility for user
            non-compliance with any law or regulation.
          </p>
        </section>

        <section>
          <h3>5. Taxes & Financial Obligations</h3>
          <p>
            Sellers are solely responsible for determining, collecting, reporting, and remitting
            any and all applicable taxes, duties, or fees, including but not limited to VAT, sales
            tax, customs duties, or similar charges.
          </p>
          <p>
            The platform does not provide tax advice and does not collect or remit taxes on behalf
            of users unless explicitly stated otherwise.
          </p>
        </section>

        <section>
          <h3>6. Prohibited Items & Content</h3>
          <p>
            The sale or promotion of illegal, counterfeit, dangerous, restricted, or otherwise
            prohibited goods or content is strictly forbidden. Any violation may result in immediate
            suspension or termination of the account without prior notice.
          </p>
        </section>

        <section>
          <h3>7. Indemnification</h3>
          <p>
            You agree to indemnify, defend, and hold harmless the platform and its affiliates from
            any claims, liabilities, damages, losses, or expenses arising from your use of the platform,
            your listings, or your violation of these terms.
          </p>
        </section>

        <section>
          <h3>8. Modifications to Terms</h3>
          <p>
            The platform reserves the right to modify or update these terms at any time. Continued
            use of the platform after such changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <div class="acceptance-box">
          <ion-item lines="none">
            <ion-checkbox slot="start" [(ngModel)]="accepted"></ion-checkbox>
            <ion-label class="ion-text-wrap">
              I confirm that I have read, understood, and agreed to all Seller Terms,
              Disclaimers, and Legal Notices, and I accept full legal responsibility
              for any content or transactions I publish.
            </ion-label>
          </ion-item>
        </div>
      </div>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button
          expand="block"
          [disabled]="!accepted"
          (click)="dismiss(true)"
          class="accept-btn">
          Accept, Assume Responsibility & Publish
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  `,
  styles: [`
    ion-content {
      --background: var(--ion-background-color);
      color: var(--ion-text-color);
    }
    ion-toolbar {
      --background: var(--loopa-toolbar-background);
      --color: var(--ion-text-color);
    }
    .disclaimer-container {
      padding: 10px;
    }
    .icon-header {
      text-align: center;
      font-size: 64px;
      color: #6366f1;
      margin-bottom: 20px;
    }
    h2 {
      text-align: center;
      font-weight: 800;
      margin-bottom: 10px;
    }
    .intro {
      text-align: center;
      color: #94a3b8;
      margin-bottom: 30px;
    }
    section {
      margin-bottom: 24px;
      h3 {
        color: #6366f1;
        font-size: 1.1rem;
        font-weight: 700;
        margin-bottom: 8px;
      }
      p, li {
        color: #cbd5e1;
        font-size: 0.95rem;
        line-height: 1.5;
      }
      ul {
        padding-left: 20px;
        margin-top: 8px;
      }
    }
    .acceptance-box {
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 16px;
      padding: 10px;
      margin-top: 30px;
      
      ion-item {
        --background: transparent;
        --color: #f8fafc;
        font-size: 0.9rem;
      }
      ion-checkbox {
        --border-color: #6366f1;
        --checkbox-background-checked: #6366f1;
      }
    }
    .accept-btn {
      --background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      --border-radius: 16px;
      margin: 16px;
      font-weight: 700;
      height: 50px;
    }
  `]
})
export class DisclaimerComponent {
  accepted = false;

  constructor(private modalController: ModalController, private legal: LegalService) {}

  async dismiss(accepted: boolean) {
    if (accepted) {
      try {
        await this.legal.recordAcceptance({ documentType: 'seller_disclaimer', documentVersion: environment.SELLER_DISCLAIMER_VERSION || 'v1.0', acceptanceContext: 'publish_product', meta: { client: 'ionic-app' } });
      } catch (e) {
        console.warn('Failed to record seller acceptance', e);
      }
    }
    this.modalController.dismiss(accepted);
  }
}
