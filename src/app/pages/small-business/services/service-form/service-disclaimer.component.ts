import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-service-disclaimer',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Service Provider Terms & Legal Disclaimer</ion-title>
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
          <ion-icon name="briefcase-outline"></ion-icon>
        </div>

        <h2>Service Provider Terms, Disclaimer & Legal Notice</h2>
        <p class="intro">
          Please read these terms very carefully before publishing any service.
          By continuing, you expressly confirm that you understand and agree to all
          terms below without limitation.
        </p>

        <section>
          <h3>1. Age Restriction (18+ Only)</h3>
          <p>
            This platform is strictly intended for users who are eighteen (18) years of age
            or older. By publishing or accepting any service, you explicitly confirm that
            you are legally an adult in your jurisdiction.
          </p>
          <p>
            The platform assumes no responsibility or liability if adult users voluntarily
            engage in services with other adult users.
          </p>
        </section>

        <section>
          <h3>2. Platform Role & No Agency Relationship</h3>
          <p>
            The platform operates solely as a technical intermediary and directory that enables
            contact between independent service providers and clients. The platform is not:
          </p>
          <ul>
            <li>A party to any agreement, contract, or transaction.</li>
            <li>An employer, agent, partner, or representative of any user.</li>
            <li>A supervisor, verifier, or guarantor of services.</li>
          </ul>
          <p>
            All services are arranged and performed independently and entirely at the users’
            own risk.
          </p>
        </section>

        <section>
          <h3>3. Professional Conduct & Full Responsibility</h3>
          <p>
            As a service provider, you acknowledge and agree that you are solely and fully
            responsible for:
          </p>
          <ul>
            <li>Providing services exactly as described in your listing.</li>
            <li>Maintaining professional and lawful conduct at all times.</li>
            <li>Honoring agreed timelines, pricing, and appointments.</li>
            <li>The quality, outcome, and consequences of your services.</li>
          </ul>
        </section>

        <section>
          <h3>4. Licensing, Authorization & Legal Compliance</h3>
          <p>
            You are solely responsible for ensuring that you hold all required licenses,
            permits, certifications, registrations, and legal authorizations required
            in your jurisdiction and in the client’s jurisdiction.
          </p>
          <p>
            The platform does not verify licensing status and assumes no responsibility
            for unlicensed or unlawful services.
          </p>
        </section>

        <section>
          <h3>5. Prohibited Services</h3>
          <p>
            The following services are strictly prohibited and may result in immediate
            account suspension or termination:
          </p>
          <ul>
            <li>Illegal activities or services facilitating unlawful behavior.</li>
            <li>Sexually explicit, adult, or pornographic services.</li>
            <li>Hazardous or dangerous services without proper certification.</li>
            <li>Fraudulent, deceptive, or misleading schemes.</li>
            <li>Medical, legal, or financial advice by unlicensed individuals.</li>
          </ul>
        </section>

        <section>
          <h3>6. Payments, Disputes & User Interactions</h3>
          <p>
            All financial arrangements, agreements, payments, refunds, and disputes are
            strictly between the service provider and the client.
          </p>
          <p>
            The platform has no responsibility or obligation regarding payment failures,
            disputes, chargebacks, refunds, or contractual disagreements.
          </p>
        </section>

        <section>
          <h3>7. Limitation of Liability</h3>
          <p>
            To the maximum extent permitted by applicable law, the platform shall not be
            liable for any direct, indirect, incidental, consequential, or special damages,
            including but not limited to:
          </p>
          <ul>
            <li>Personal injury or bodily harm.</li>
            <li>Property damage or loss.</li>
            <li>Financial loss or loss of income.</li>
            <li>Emotional distress or reputational harm.</li>
          </ul>
        </section>

        <section>
          <h3>8. Indemnification & Waiver</h3>
          <p>
            You agree to fully indemnify, defend, and hold harmless the platform, its owners,
            affiliates, employees, and partners from any claims, damages, losses, liabilities,
            or legal costs arising from:
          </p>
          <ul>
            <li>Your services or listings.</li>
            <li>Your interactions with other users.</li>
            <li>Your violation of these terms or applicable laws.</li>
          </ul>
        </section>

        <section>
          <h3>9. Global Use & Jurisdictional Differences</h3>
          <p>
            The platform is used globally and laws vary by country. You are solely responsible
            for understanding and complying with all local, national, and international laws
            applicable to your services.
          </p>
        </section>

        <section>
          <h3>10. Modifications & Enforcement</h3>
          <p>
            The platform reserves the right to modify these terms at any time and to suspend
            or terminate accounts at its sole discretion. Continued use constitutes acceptance
            of updated terms.
          </p>
        </section>

        <div class="acceptance-box">
          <ion-item lines="none">
            <ion-checkbox slot="start" [(ngModel)]="accepted"></ion-checkbox>
            <ion-label class="ion-text-wrap">
              I confirm that I am at least 18 years old, legally authorized to provide
              this service, and I accept full legal responsibility for all services,
              interactions, and consequences arising from my use of the platform.
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
          Accept Terms, Assume Responsibility & Publish Service
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
      color: #818cf8;
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
    }
    section h3 {
      color: #818cf8;
      font-size: 1.1rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    section p, section li {
      color: #cbd5e1;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    section ul {
      padding-left: 20px;
      margin-top: 8px;
    }
    .acceptance-box {
      background: rgba(129, 140, 248, 0.1);
      border: 1px solid rgba(129, 140, 248, 0.2);
      border-radius: 16px;
      padding: 10px;
      margin-top: 30px;
    }
    .acceptance-box ion-item {
      --background: transparent;
      --color: #f8fafc;
      font-size: 0.9rem;
    }
    .acceptance-box ion-checkbox {
      --border-color: #818cf8;
      --checkbox-background-checked: #818cf8;
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
export class ServiceDisclaimerComponent {
  accepted = false;

  constructor(private modalController: ModalController) {}

  dismiss(accepted: boolean) {
    this.modalController.dismiss(accepted);
  }
}
