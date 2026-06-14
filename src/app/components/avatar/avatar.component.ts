import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { AvatarUrlUtil, AvatarProfile } from '../../utils/avatar-url.util';
import constants from 'src/app/helpers/constants';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss']
})
export class AvatarComponent implements OnChanges {
  @Input() profile: AvatarProfile | null = null;
  @Input() size: number = 48;
  @Input() premium: boolean = false;
  @Input() shape: 'circle' | 'rounded' = 'circle';
  @Input() showCameraIcon: boolean = false;

  avatarUrl: string = '';
  initials: string = '';
  hasError: boolean = false;
  private triedGeneratedFallback: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.profile || changes.size) {
      this.updateAvatar();
    }
  }

  updateAvatar() {
    this.hasError = false;
    this.triedGeneratedFallback = false;
    if (this.profile) {
      // Use the centralized AvatarUrlUtil with the domain for relative paths
      this.avatarUrl = AvatarUrlUtil.getAvatarUrl(this.profile, constants.DOMAIN_URL);
      
      this.initials = this.getInitials(this.profile);
      console.log('AvatarComponent updated:', { url: this.avatarUrl, profile: this.profile });
      this.cdr.detectChanges();
    } else {
      this.avatarUrl = '';
      this.initials = '?';
      this.cdr.detectChanges();
    }
  }

  getInitials(profile: any): string {
    if (!profile) return '?';
    const f = profile.firstName || profile._firstName || '';
    const l = profile.lastName || profile._lastName || '';
    const u = profile.username || profile._username || profile.userName || '';
    const initials = (f.charAt(0) + l.charAt(0)).toUpperCase();
    return initials || u.charAt(0).toUpperCase() || '?';
  }

  handleError() {
    if (this.profile && !this.triedGeneratedFallback && this.profile.avatarStyle === 'avataaars') {
      const fallbackUrl = AvatarUrlUtil.buildAvataaarsUrl(this.profile);
      if (fallbackUrl && fallbackUrl !== this.avatarUrl) {
        this.triedGeneratedFallback = true;
        this.avatarUrl = fallbackUrl;
        this.hasError = false;
        this.cdr.detectChanges();
        return;
      }
    }
    this.hasError = true;
  }
}
