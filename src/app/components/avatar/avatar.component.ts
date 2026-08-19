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
  @Input() refreshKey: string | number | null = null;
  @Input() priority: boolean = false;

  avatarUrl: string = '';
  initials: string = '';
  hasError: boolean = false;
  isLoading: boolean = false;
  private triedGeneratedFallback: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes.profile || changes.size || changes.refreshKey) {
      this.updateAvatar();
    }
  }

  updateAvatar() {
    this.hasError = false;
    this.triedGeneratedFallback = false;

    if (this.profile) {
      const nextUrl = AvatarUrlUtil.getAvatarUrl(this.profile, constants.DOMAIN_URL);
      this.avatarUrl = nextUrl;
      this.initials = this.getInitials(this.profile);
      this.isLoading = !!nextUrl;
      this.cdr.detectChanges();
      return;
    }

    this.avatarUrl = '';
    this.initials = '?';
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  handleLoad() {
    if (!this.isLoading) return;
    this.isLoading = false;
    this.cdr.detectChanges();
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
        this.isLoading = true;
        this.cdr.detectChanges();
        return;
      }
    }

    this.isLoading = false;
    this.hasError = true;
    this.cdr.detectChanges();
  }
}
