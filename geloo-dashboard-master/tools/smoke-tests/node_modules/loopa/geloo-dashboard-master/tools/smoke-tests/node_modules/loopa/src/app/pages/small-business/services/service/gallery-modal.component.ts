import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-gallery-modal',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="dismiss()" color="light">
            <ion-icon name="close"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title color="light">Gallery</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="gallery-content">
      <ion-slides [options]="slideOpts" class="fullscreen-slides">
        <ion-slide *ngFor="let photo of photos">
          <div class="swiper-zoom-container">
            <img [src]="photo" class="full-image" />
          </div>
        </ion-slide>
      </ion-slides>
    </ion-content>
  `,
  styles: [`
    ion-toolbar {
      --background: #000;
      --color: #fff;
    }
    .gallery-content {
      --background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .fullscreen-slides {
      height: 100%;
      width: 100%;
    }
    .full-image {
      width: 100%;
      height: auto;
      max-height: 100%;
      object-fit: contain;
    }
    .swiper-zoom-container {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
    }
  `]
})
export class GalleryModalComponent {
  @Input() photos: string[] = [];
  @Input() initialSlide: number = 0;

  slideOpts = {
    initialSlide: 0,
    zoom: true,
    speed: 400
  };

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {
    this.slideOpts.initialSlide = this.initialSlide;
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
