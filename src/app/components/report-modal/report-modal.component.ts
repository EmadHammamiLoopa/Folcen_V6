import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { PrivacyPolicyComponent } from '../../pages/privacy-policy/privacy-policy.component';
import { TermsOfServiceComponent } from '../../pages/terms-of-service/terms-of-service.component';

@Component({
  selector: 'app-report-modal',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar class="fancy-toolbar">
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()" class="close-btn">
            <ion-icon name="close-circle" slot="icon-only"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Report {{ targetName || 'Content' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="report-container">
        <div class="info-card">
          <ion-icon name="shield-checkmark-outline" class="info-icon"></ion-icon>
          <div class="info-text-wrapper">
            <h3>Community Safety</h3>
            <p>
              Help us understand what's happening with <strong>{{ targetName || 'this content' }}</strong>. 
              Your report is confidential and helps keep our community safe.
            </p>
          </div>
        </div>

        <div class="form-section">
          <div class="section-header">
            <ion-icon name="alert-circle-outline"></ion-icon>
            <ion-label>Reason for reporting</ion-label>
          </div>
          <ion-item lines="none" class="custom-item">
            <ion-select [(ngModel)]="reportType" placeholder="Select a reason" interface="action-sheet" class="custom-select">
              <ion-select-option value="Abuse">Abuse</ion-select-option>
              <ion-select-option value="Spam">Spam</ion-select-option>
              <ion-select-option value="Inappropriate Content">Inappropriate Content</ion-select-option>
              <ion-select-option value="Hate Speech">Hate Speech</ion-select-option>
              <ion-select-option value="Harassment">Harassment</ion-select-option>
              <ion-select-option value="Violence">Violence</ion-select-option>
              <ion-select-option value="Scam">Scam</ion-select-option>
              <ion-select-option value="Other">Other</ion-select-option>
            </ion-select>
          </ion-item>
        </div>

        <div class="form-section">
          <div class="section-header">
            <ion-icon name="speedometer-outline"></ion-icon>
            <ion-label>Severity Level</ion-label>
          </div>
          <ion-segment [(ngModel)]="severity" mode="ios" class="custom-segment">
            <ion-segment-button value="low">
              <ion-label>Low</ion-label>
            </ion-segment-button>
            <ion-segment-button value="medium">
              <ion-label>Med</ion-label>
            </ion-segment-button>
            <ion-segment-button value="high">
              <ion-label>High</ion-label>
            </ion-segment-button>
            <ion-segment-button value="critical">
              <ion-label>Crit</ion-label>
            </ion-segment-button>
          </ion-segment>
        </div>

        <div class="form-section">
          <div class="section-header">
            <ion-icon name="document-text-outline"></ion-icon>
            <ion-label>Details (Optional)</ion-label>
          </div>
          <ion-textarea
            [(ngModel)]="message"
            placeholder="Provide more context to help our moderators..."
            rows="4"
            class="custom-textarea"
          ></ion-textarea>
        </div>

        <div class="privacy-notice">
          <ion-item lines="none" class="consent-item">
            <ion-checkbox slot="start" [(ngModel)]="consentGiven"></ion-checkbox>
            <ion-label class="ion-text-wrap">
              I understand that my report and associated metadata will be processed in accordance with the 
              <span class="link" (click)="openPrivacyPolicy($event)">Privacy Policy</span> and 
              <span class="link" (click)="openTermsOfService($event)">Terms of Service</span>.
            </ion-label>
          </ion-item>
          
          <ion-item lines="none" class="consent-item">
            <ion-checkbox slot="start" [(ngModel)]="isAnonymous"></ion-checkbox>
            <ion-label class="ion-text-wrap">
              Keep my identity anonymous to the reported party.
            </ion-label>
          </ion-item>
        </div>

        <ion-button
          expand="block"
          class="submit-btn"
          [disabled]="!reportType || !consentGiven"
          (click)="submit()"
        >
          <ion-icon name="send-outline" slot="start"></ion-icon>
          Submit Report
        </ion-button>

        <div class="gdpr-footer">
          <ion-icon name="lock-closed-outline"></ion-icon>
          <span>Privacy-aware reporting • Moderation records follow the retention policy</span>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .fancy-toolbar {
      --background: var(--ion-color-primary);
      --color: var(--ion-color-primary-contrast);
      ion-title { 
        font-weight: 800; 
        font-size: 1.1rem;
        letter-spacing: -0.5px;
      }
    }
    .close-btn {
      --color: var(--ion-color-primary-contrast);
      opacity: 0.8;
    }
    .report-container {
      max-width: 500px;
      margin: 0 auto;
      padding-bottom: 20px;
    }
    .info-card {
      background: var(--ion-color-primary-tint, #428cff);
      color: var(--ion-color-primary-contrast, #fff);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 24px;
      box-shadow: 0 4px 12px rgba(var(--ion-color-primary-rgb), 0.2);
      
      .info-icon {
        font-size: 2.4rem;
        flex-shrink: 0;
      }
      .info-text-wrapper {
        h3 {
          margin: 0 0 4px 0;
          font-weight: 700;
          font-size: 1rem;
        }
        p {
          margin: 0;
          font-size: 0.85rem;
          line-height: 1.4;
          opacity: 0.9;
        }
      }
    }
    .form-section {
      margin-bottom: 24px;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      color: var(--ion-text-color);
      
      ion-icon {
        font-size: 1.2rem;
        color: var(--ion-color-primary);
      }
      ion-label {
        font-weight: 700;
        font-size: 0.95rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }
    .custom-item {
      --background: var(--ion-color-step-50, #f2f2f2);
      --border-radius: 12px;
      --padding-start: 12px;
      --inner-padding-end: 12px;
      border: 1px solid var(--ion-color-step-150, #d9d9d9);
      transition: all 0.2s ease;
      
      &:focus-within {
        border-color: var(--ion-color-primary);
        box-shadow: 0 0 0 2px rgba(var(--ion-color-primary-rgb), 0.1);
      }
    }
    .custom-select {
      width: 100%;
      --placeholder-color: var(--ion-color-step-400);
      --color: var(--ion-text-color);
    }
    .custom-segment {
      background: var(--ion-color-step-50, #f2f2f2);
      border-radius: 12px;
      padding: 4px;
      
      ion-segment-button {
        --background-checked: var(--ion-color-primary);
        --color-checked: var(--ion-color-primary-contrast);
        --border-radius: 10px;
        font-weight: 600;
        min-height: 36px;
      }
    }
    .custom-textarea {
      --background: var(--ion-color-step-50, #f2f2f2);
      --color: var(--ion-text-color);
      --padding-start: 12px;
      --padding-end: 12px;
      border: 1px solid var(--ion-color-step-150, #d9d9d9);
      border-radius: 12px;
      transition: all 0.2s ease;
      
      &:focus-within {
        border-color: var(--ion-color-primary);
      }
    }
    .privacy-notice {
      background: var(--ion-color-step-50, #f2f2f2);
      border-radius: 16px;
      padding: 12px;
      margin-bottom: 24px;
      border: 1px dashed var(--ion-color-step-250);
    }
    .consent-item {
      --background: transparent;
      --padding-start: 0;
      --inner-padding-end: 0;
      margin-bottom: 4px;
      
      ion-label {
        font-size: 0.82rem;
        color: var(--ion-color-step-600);
        line-height: 1.4;
      }
      ion-checkbox {
        --size: 20px;
        --border-radius: 6px;
        margin-right: 12px;
      }
    }
    .link {
      color: var(--ion-color-primary);
      font-weight: 600;
      text-decoration: underline;
      cursor: pointer;
    }
    .submit-btn {
      --background: var(--ion-color-danger);
      --background-activated: var(--ion-color-danger-shade);
      --border-radius: 14px;
      font-weight: 800;
      height: 54px;
      margin-top: 10px;
      font-size: 1rem;
      letter-spacing: 0.5px;
      box-shadow: 0 4px 15px rgba(var(--ion-color-danger-rgb), 0.3);
    }
    .gdpr-footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 20px;
      color: var(--ion-color-step-400);
      font-size: 0.75rem;
      font-weight: 500;
      
      ion-icon {
        font-size: 0.9rem;
      }
    }
  `]
})
export class ReportModalComponent implements OnInit {
  @Input() entityId: string;
  @Input() entityType: string;
  @Input() targetName: string;

  reportType: string = '';
  severity: string = 'medium';
  message: string = '';
  consentGiven: boolean = false;
  isAnonymous: boolean = true;

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {}

  dismiss() {
    this.modalCtrl.dismiss();
  }

  async openPrivacyPolicy(event: Event) {
    event.stopPropagation();
    const modal = await this.modalCtrl.create({
      component: PrivacyPolicyComponent,
    });
    await modal.present();
  }

  async openTermsOfService(event: Event) {
    event.stopPropagation();
    const modal = await this.modalCtrl.create({
      component: TermsOfServiceComponent,
    });
    await modal.present();
  }

  submit() {
    this.modalCtrl.dismiss({
      reportType: this.reportType,
      severity: this.severity,
      message: this.message,
      consentGiven: this.consentGiven,
      isAnonymous: this.isAnonymous
    });
  }
}

