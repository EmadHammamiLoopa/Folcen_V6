// ringer.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RingerService {
  private player: HTMLAudioElement | null = null;
  private activeKey: string | null = null;
  private finalKeys = new Set<string>();

  /** Start playing a looping ringtone */
  start(file: string, key = 'global', reason = 'start') {
    if (this.finalKeys.has(key)) {
      console.log('[ringer] stale event ignored', { key, reason });
      return;
    }
    if (this.player && this.activeKey === key) {
      console.log('[ringer] duplicate tone start ignored', { key, reason });
      return;
    }

    this.stop(this.activeKey || key, 'replace'); // Stop previous sound if any
    const audio = new Audio(`assets/audio/${file}`);
    audio.loop = true;
    audio.preload = 'auto';
    this.player = audio;
    this.activeKey = key;
    console.log('[ringer] tone start', { key, file, reason });

    const tryPlay = () => {
      if (!this.player || this.activeKey !== key || this.finalKeys.has(key)) return;
      this.player.play().catch(() => {
        const resume = () => {
          if (!this.player || this.activeKey !== key || this.finalKeys.has(key)) return;
          this.player.play().catch(() => {});
          document.removeEventListener('click', resume);
        };
        document.addEventListener('click', resume, { once: true });
      });
    };

    if (audio.readyState >= 3) {
      tryPlay();
    } else {
      audio.oncanplay = tryPlay;
    }
  }

  /** Play a short one-time sound effect */
  playOnce(file: string) {
    const audio = new Audio(`assets/audio/${file}`);
    audio.preload = 'auto';
    audio.play().catch(() => {});
  }

  /** Stop the current ringtone */
  stop(key = this.activeKey || 'global', reason = 'stop') {
    if (this.player) {
      console.log('[ringer] tone stop', { key, activeKey: this.activeKey, reason });
      this.player.pause();
      this.player.src = '';
      this.player.load(); // free up memory
      this.player = null;
    }
    if (!key || key === this.activeKey || this.activeKey === 'global') {
      this.activeKey = null;
    }
  }

  markFinal(key = 'global', reason = 'final') {
    if (key) this.finalKeys.add(key);
    this.stop(key, reason);
    setTimeout(() => this.finalKeys.delete(key), 2 * 60 * 1000);
  }
}
