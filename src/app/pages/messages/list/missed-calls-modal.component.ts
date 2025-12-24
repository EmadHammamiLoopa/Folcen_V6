import { Component, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-missed-calls-modal',
  templateUrl: './missed-calls-modal.component.html',
  styleUrls: ['./missed-calls-modal.component.scss']
})
export class MissedCallsModalComponent {
  @Input() calls: any[] = [];

  constructor(private modalCtrl: ModalController) {}

  close() {
    this.modalCtrl.dismiss();
  }

  callBack(userId: string) {
    this.modalCtrl.dismiss({ action: 'callback', userId });
  }

  clearAll() {
    this.modalCtrl.dismiss({ action: 'clearAll' });
  }

  avatarFor(call: any) {
    // prefer explicit userAvatar or avatar, else fallback to bundled asset
    return (call && (call.userAvatar || call.avatar)) || 'assets/images/default-avatar.png';
  }

  onImgError(event: Event) {
    // typed handler to satisfy Angular template typechecker
    const img = event?.target as HTMLImageElement | null;
    if (img) img.src = 'assets/images/default-avatar.png';
  }
}
