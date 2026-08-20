import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-image-modal',
  template: `
    <ion-content class="image-viewer-content" fullscreen>
      <div class="viewer-backdrop" (click)="close()"></div>

      <button type="button" class="viewer-close" (click)="close()" aria-label="Close image viewer">
        <ion-icon name="close-outline"></ion-icon>
      </button>

      <div class="image-stage" (click)="$event.stopPropagation()">
        <img [src]="image" alt="Shared image" />
      </div>
    </ion-content>
  `,
  styles: [
    `
    :host { display:block; }

    .image-viewer-content {
      --background: #030712;
      position: relative;
    }

    .viewer-backdrop {
      position: fixed;
      inset: 0;
      background:
        radial-gradient(circle at 18% 8%, rgba(124,108,255,.18), transparent 34%),
        radial-gradient(circle at 82% 90%, rgba(56,189,248,.10), transparent 34%),
        #030712;
    }

    .viewer-close {
      position: fixed;
      top: calc(14px + env(safe-area-inset-top));
      right: 14px;
      z-index: 5;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 15px;
      color: #fff;
      background: rgba(15,23,42,.72);
      box-shadow: 0 10px 28px rgba(0,0,0,.30);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .viewer-close ion-icon {
      font-size: 23px;
    }

    .image-stage {
      position: relative;
      z-index: 2;
      min-height: 100%;
      width: 100%;
      box-sizing: border-box;
      padding: calc(74px + env(safe-area-inset-top)) 12px calc(24px + env(safe-area-inset-bottom));
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .image-stage img {
      display: block;
      max-width: 100%;
      max-height: calc(100vh - 110px - env(safe-area-inset-top) - env(safe-area-inset-bottom));
      object-fit: contain;
      border-radius: 16px;
      box-shadow: 0 20px 70px rgba(0,0,0,.42);
    }
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
