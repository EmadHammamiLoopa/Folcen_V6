import { Component, Input, OnInit } from '@angular/core';
import { ModalController, IonicSlides } from '@ionic/angular';

@Component({
  selector: 'app-photo-viewer',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar color="dark">
        <ion-buttons slot="start">
          <ion-button (click)="close()">
            <ion-icon name="close-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ (initialIndex + 1) }} / {{ photos.length }}</ion-title>
        <ion-buttons slot="end" *ngIf="myProfile">
          <ion-button *ngIf="!isCurrentMain()" (click)="setAsMain()" class="main-btn">
            <ion-icon name="star-outline" slot="start"></ion-icon>
            Set Main
          </ion-button>
          <ion-button color="danger" (click)="deletePhoto()">
            <ion-icon name="trash-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="end" *ngIf="!myProfile">
          <ion-button color="warning" (click)="reportPhoto()">
            <ion-icon name="flag-outline" slot="start"></ion-icon>
            Report
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content color="dark" class="ion-no-padding">
      <div class="viewer-container">
        <!-- Debug info -->
        <div style="position: absolute; top: 10px; left: 10px; color: #444; z-index: 9999; font-size: 10px;">
          P: {{photos?.length}} | I: {{initialIndex}}
        </div>

        <!-- Simple fallback image while slides are loading or if they fail -->
        <img *ngIf="!showSlides && photos && photos.length > 0" [src]="photos[initialIndex]" class="fallback-img" />

        <ion-slides *ngIf="showSlides && photos && photos.length > 0" [options]="slideOpts" (ionSlideDidChange)="slideChanged($event)">
          <ion-slide *ngFor="let photo of photos">
            <div class="swiper-zoom-container">
              <img [src]="photo" (error)="onImgError($event)" />
            </div>
          </ion-slide>
        </ion-slides>
        
        <div *ngIf="showSlides && (!photos || photos.length === 0)" class="empty-viewer">
          <ion-icon name="image-outline"></ion-icon>
          <p>No image to display</p>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .viewer-container {
      height: 100%;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      position: relative;
    }
    .fallback-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .empty-viewer {
      text-align: center;
      color: #666;
      ion-icon {
        font-size: 64px;
      }
    }
    ion-slides {
      height: 100%;
      width: 100%;
    }
    img {
      max-height: 100%;
      max-width: 100%;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .main-btn {
      --color: #60a5fa;
      font-size: 0.9rem;
      font-weight: 600;
      margin-right: 8px;
    }
  `]
})
export class PhotoViewerComponent implements OnInit {
  @Input() photos: string[] = [];
  @Input() rawPaths: string[] = [];
  @Input() initialIndex: number = 0;
  @Input() myProfile: boolean = false;
  @Input() currentMainPath: string = '';

  showSlides = false;
  slideOpts = {
    initialSlide: 0,
    zoom: {
      maxRatio: 3
    },
    modules: [IonicSlides]
  };

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {
    console.log('PhotoViewerComponent init:', {
      count: this.photos?.length,
      initialIndex: this.initialIndex,
      photos: this.photos
    });
    
    this.slideOpts.initialSlide = this.initialIndex;
    
    // Small delay to ensure ion-slides initializes with correct initialSlide
    setTimeout(() => {
      this.showSlides = true;
    }, 200);
  }

  onImgError(event: any) {
    console.error('Image failed to load in viewer:', event.target.src);
    event.target.src = 'assets/imgs/default-avatar.png'; // Fallback
  }

  close() {
    this.modalCtrl.dismiss();
  }

  async slideChanged(event: any) {
    const swiper = await event.target.getSwiper();
    this.initialIndex = swiper.activeIndex;
  }

  isCurrentMain(): boolean {
    if (!this.rawPaths || this.initialIndex >= this.rawPaths.length) return false;
    return this.rawPaths[this.initialIndex] === this.currentMainPath;
  }

  setAsMain() {
    this.modalCtrl.dismiss({
      action: 'setMain',
      path: this.rawPaths && this.rawPaths.length > this.initialIndex ? this.rawPaths[this.initialIndex] : this.photos[this.initialIndex]
    });
  }

  deletePhoto() {
    this.modalCtrl.dismiss({
      action: 'delete',
      path: this.rawPaths && this.rawPaths.length > this.initialIndex ? this.rawPaths[this.initialIndex] : this.photos[this.initialIndex]
    });
  }

  reportPhoto() {
    this.modalCtrl.dismiss({
      action: 'report',
      path: this.rawPaths && this.rawPaths.length > this.initialIndex ? this.rawPaths[this.initialIndex] : this.photos[this.initialIndex]
    });
  }
}
