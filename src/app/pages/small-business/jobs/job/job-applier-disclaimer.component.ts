import { Component } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-job-applier-disclaimer',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Applicant Safety & Disclaimer</ion-title>
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
          <ion-icon name="shield-checkmark-outline" color="primary"></ion-icon>
        </div>

        <h2>Important Notice for Applicants</h2>
        <p class="intro">
          Please read and acknowledge these terms before applying for this position.
        </p>

        <section class="terms-section">
          <ul>
            <li><strong>Limited Verification:</strong> The platform does not fully verify employers. Basic verification is limited and not a guarantee of legitimacy.</li>
            <li><strong>User Risk:</strong> Applying for this job is done entirely at your own risk.</li>
            <li><strong>No Responsibility:</strong> The platform is not responsible for hiring decisions, interview outcomes, or employment conditions.</li>
            <li><strong>Independent Agreement:</strong> All agreements and contracts are strictly between you and the employer.</li>
            <li><strong>Age Requirement:</strong> By continuing, you confirm that you are 18 years of age or older.</li>
          </ul>
        </section>

        <div class="acceptance-area">
          <ion-item lines="none" class="checkbox-item">
            <ion-checkbox slot="start" [(ngModel)]="accepted"></ion-checkbox>
            <ion-label class="ion-text-wrap">
              I understand and accept these terms. I am 18+ years old.
            </ion-label>
          </ion-item>

          <ion-button expand="block" [disabled]="!accepted" (click)="dismiss(true)" class="apply-btn">
            Accept & Continue
          </ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .disclaimer-container { max-width: 500px; margin: 0 auto; }
    .icon-header { text-align: center; font-size: 56px; margin-bottom: 15px; }
    h2 { text-align: center; font-weight: 700; margin-bottom: 10px; }
    .intro { text-align: center; color: var(--ion-color-step-600); margin-bottom: 20px; }
    .terms-section { background: var(--ion-color-step-50); border-radius: 12px; padding: 15px; margin-bottom: 20px; }
    ul { padding-left: 20px; margin: 0; }
    li { margin-bottom: 12px; font-size: 0.9rem; line-height: 1.4; color: var(--ion-color-step-800); }
    .checkbox-item { --padding-start: 0; margin-bottom: 20px; }
    .apply-btn { --border-radius: 12px; font-weight: 600; height: 50px; }
  `]
})
export class JobApplierDisclaimerComponent {
  accepted: boolean = false;
  constructor(private modalCtrl: ModalController) {}
  dismiss(val: boolean) { this.modalCtrl.dismiss(val); }
}
