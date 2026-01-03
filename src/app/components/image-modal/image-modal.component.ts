import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-image-modal',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="close()">Close</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="image-modal-content">
      <div class="image-wrapper">
        <img [src]="image" alt="Image" />
      </div>
    </ion-content>
  `,
  styles: [
    `
    .image-modal-content { --ion-background-color: #000; display:flex; align-items:center; justify-content:center; }
    .image-wrapper img { max-width:100%; max-height:100vh; display:block; margin:0 auto; }
    `
  ]
})
export class ImageModalComponent {
  @Input() image: string;

  constructor(private modalCtrl: ModalController) {}

  close() {
    this.modalCtrl.dismiss();
  }
}
