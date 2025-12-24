import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-job-publisher-disclaimer',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-title>Employer Terms & Disclaimer</ion-title>
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
          <ion-icon name="business-outline" color="primary"></ion-icon>
        </div>

        <h2>Job Posting Terms & Legal Notice</h2>
        <p class="intro">
          Please read and accept these terms before publishing your job listing.
        </p>

        <section class="terms-section">
          <ul>
            <li><strong>No Endorsement:</strong> Basic verification (email/website) does not imply platform approval or endorsement of your company.</li>
            <li><strong>Sole Responsibility:</strong> You are solely responsible for the content, legitimacy, and consequences of this job post.</li>
            <li><strong>Platform Role:</strong> The platform is NOT an employer, recruiter, or agent. We only provide a space for listings.</li>
            <li><strong>No Guarantees:</strong> The platform does not guarantee the legitimacy of the job or the quality of applicants.</li>
            <li><strong>Legal Compliance:</strong> You confirm that this job post complies with all local labor laws and regulations.</li>
            <li><strong>Indemnification:</strong> You agree to indemnify the platform from any claims, disputes, or legal issues arising from this post.</li>
          </ul>
        </section>

        <div class="acceptance-area">
          <ion-item lines="none" class="checkbox-item">
            <ion-checkbox slot="start" [(ngModel)]="accepted"></ion-checkbox>
            <ion-label class="ion-text-wrap">
              I have read and agree to the Employer Terms & Disclaimer.
            </ion-label>
          </ion-item>

          <ion-button expand="block" [disabled]="!accepted" (click)="dismiss(true)" class="publish-btn">
            Accept & Publish
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
    .publish-btn { --border-radius: 12px; font-weight: 600; height: 50px; }
  `]
})
export class JobPublisherDisclaimerComponent {
  accepted: boolean = false;
  constructor(private modalCtrl: ModalController) {}
  dismiss(val: boolean) { this.modalCtrl.dismiss(val); }
}
