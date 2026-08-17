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

  get groupedCalls(): any[] {
    const groups = new Map<string, any>();

    for (const call of (this.calls || [])) {
      const userId = String(call?.userId || '');
      if (!userId) continue;

      const timestamp =
        call?.timestamp ||
        call?.at ||
        new Date().toISOString();

      const ts = new Date(timestamp).getTime() || 0;

      const existing = groups.get(userId);

      if (!existing) {
        groups.set(userId, {
          ...call,
          userId,
          count: 1,
          latestTimestamp: timestamp,
          latestTs: ts
        });
        continue;
      }

      existing.count += 1;

      if (ts >= existing.latestTs) {
        existing.userName =
          call?.userName ||
          existing.userName;

        existing.userAvatar =
          call?.userAvatar ||
          existing.userAvatar;

        existing.latestTimestamp = timestamp;
        existing.latestTs = ts;
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => b.latestTs - a.latestTs);
  }

  get totalMissed(): number {
    return Array.isArray(this.calls)
      ? this.calls.length
      : 0;
  }

  close() {
    this.modalCtrl.dismiss();
  }

  callBack(userId: string) {
    this.modalCtrl.dismiss({
      action: 'callback',
      userId
    });
  }

  clearAll() {
    this.modalCtrl.dismiss({
      action: 'clearAll'
    });
  }

  avatarFor(call: any) {
    return (
      call &&
      (call.userAvatar || call.avatar)
    ) || 'assets/images/default-avatar.png';
  }

  onImgError(event: Event) {
    const img =
      event?.target as HTMLImageElement | null;

    if (img) {
      img.src =
        'assets/images/default-avatar.png';
    }
  }

  trackByUserId(
    _: number,
    call: any
  ) {
    return call?.userId;
  }
}
