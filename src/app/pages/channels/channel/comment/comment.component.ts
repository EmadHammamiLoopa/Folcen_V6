import { environment } from 'src/environments/environment';
import { Router } from '@angular/router';
import { ToastService } from './../../../../services/toast.service';
import { ChannelService } from './../../../../services/channel.service';
import { AlertController, ModalController, PopoverController } from '@ionic/angular';
import { PhotoViewerComponent } from 'src/app/components/photo-viewer/photo-viewer.component';
import { ReportModalComponent } from 'src/app/components/report-modal/report-modal.component';
import { User } from './../../../../models/User';
import { Comment } from '../../../../models/Comment';
import { AfterViewInit, Component, ElementRef, Input, OnInit, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild } from '@angular/core';
import { DropDownComponent } from 'src/app/pages/drop-down/drop-down.component';
import { getCommentUserName } from '../comments/comment-utils';
import constants from '../../../../helpers/constants';

@Component({
  selector: 'app-comment',
  templateUrl: './comment.component.html',
  styleUrls: ['./comment.component.scss'],
})
export class CommentComponent implements OnInit, OnChanges, AfterViewInit {

  @Output() removeComment = new EventEmitter();
  @Input() comment: Comment;
  @Input() backgroundColor: string;
  @Input() color: string;
  @Input() cardBackground: string;
  @Input() cardTextColor: string;
  @Input() cardMutedColor: string;
  @Input() cardControlBackground: string;
  @Input() cardThemeIndex = 0;
  @Input() user: User;
  @Input() userName: string;
  @ViewChild('cardEl') cardEl?: ElementRef<HTMLElement>;
  deleteLoading = false;
  isImageEnlarged: boolean = false;
  mediaUrl: string = '';
  mediaFailed = false;
  cachedStrokeOffset: string = '';
  cachedCircleColor: string = '';
  previousExpiryDate: string | null = null;
  isVoting = false;

  constructor(private alertCtrl: AlertController,   private cdr: ChangeDetectorRef, private channelService: ChannelService, private toastService:
             ToastService, private router: Router, private popoverController: PopoverController, private modalCtrl: ModalController) { }

  ngOnInit() {
    // Ensure comment exists to avoid template errors in tests
    if (!this.comment) this.comment = {} as any;
    if (!this.comment.user) this.comment.user = {} as any;
    this.normalizeCommentUser();
    this.updateMediaUrl();
    this.applyCardTheme();
  }

  ngAfterViewInit() {
    this.applyCardTheme();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['comment'] && changes['comment'].currentValue !== changes['comment'].previousValue) {
      if (!this.comment) this.comment = {} as any;
      if (!this.comment.user) this.comment.user = {} as any;
      this.normalizeCommentUser();
      this.updateMediaUrl();
    }
    if (changes['cardBackground'] || changes['cardTextColor'] || changes['cardMutedColor'] || changes['cardControlBackground']) {
      this.applyCardTheme();
    }
  }

  private applyCardTheme() {
    requestAnimationFrame(() => {
      const el = this.cardEl?.nativeElement;
      if (!el) return;
      if (this.cardBackground) {
        el.style.setProperty('background', this.cardBackground, 'important');
      }
      if (this.cardTextColor) {
        el.style.setProperty('--comment-card-text', this.cardTextColor);
        el.style.setProperty('color', this.cardTextColor, 'important');
      }
      if (this.cardMutedColor) {
        el.style.setProperty('--comment-card-muted', this.cardMutedColor);
      }
      if (this.cardControlBackground) {
        el.style.setProperty('--comment-card-control', this.cardControlBackground);
      }
    });
  }

  private normalizeCommentUser() {
    const raw: any = this.comment?.user || {};
    if (!raw.id && raw._id) raw.id = raw._id;
    if (!raw._id && raw.id) raw._id = raw.id;
    if (!Array.isArray(raw.avatar)) {
      raw.avatar = raw.avatar ? [raw.avatar] : [];
    }
    if (!raw.mainAvatar && raw.avatar.length) {
      raw.mainAvatar = raw.avatar[0];
    }
    this.comment.user = raw;
  }

  get commentUser(): any {
    this.normalizeCommentUser();
    return this.comment.user || {};
  }

  get commentUserId(): string {
    const user: any = this.commentUser;
    return user.id || user._id || '';
  }


  updateMediaUrl() {
    this.mediaFailed = false;
    this.mediaUrl = this.getMediaUrl(this.comment);
  }

  commentUserName(comment: Comment) {
    if (this.isAdminComment()) return 'System';
    if (comment?.anonymName) return comment.anonymName;
    const user: any = this.commentUser;
    const first = user.firstName || user._firstName || user.name || user.username || '';
    const last = user.lastName || user._lastName || '';
    return `${first} ${last}`.trim() || 'Member';
  }

  isAdminComment(): boolean {
    const role = (this.comment?.user?.role || '').toUpperCase();
    return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'SUPER ADMIN';
  }


  getMediaUrl(comment: Comment): string {
    if (!comment || !comment.media) return '';
    const rawUrl = comment.media && comment.media.url;
    if (typeof rawUrl === 'string') {
      const cleanUrl = rawUrl.trim();
      if (!cleanUrl || cleanUrl === 'undefined' || cleanUrl === 'null' || cleanUrl === '[object Object]') {
        return '';
      }
      if (cleanUrl.startsWith('http') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
        return cleanUrl;
      }
      const normalizedPath = cleanUrl
        .replace(/\\/g, '/')
        .replace(/^.*\/uploads\//, 'uploads/')
        .replace(/^public\/uploads\//, 'uploads/');
      const baseUrl = environment.socketUrl.replace(/\/+$/, '') + '/';
      const mediaUrl = baseUrl + normalizedPath.replace(/^\/+/, '');
      console.log("Generated Media URL:", mediaUrl);
      return mediaUrl;
    }
    return '';
  }

  onMediaError() {
    this.mediaFailed = true;
    this.mediaUrl = '';
  }

  // Function to calculate expiration progress
 // Function to calculate expiration progress
// Function to calculate expiration progress
getExpirationProgress(expiryDate: any): string {
  if (!expiryDate) return '';
  if (this.previousExpiryDate === expiryDate && this.cachedStrokeOffset) {
    return this.cachedStrokeOffset;
  }

  const createdAt = this.comment?.createdAt;
  if (!createdAt) return '';

  const dateObj = new Date(expiryDate);
  if (isNaN(dateObj.getTime())) return '';

  const expiryTime = dateObj.getTime();
  const currentTime = Date.now();
  const totalTime = expiryTime - new Date(createdAt).getTime();
  const remainingTime = expiryTime - currentTime;

  if (totalTime === 0) return '';

  const progressPercentage = Math.max((remainingTime / totalTime) * 100, 0);
  const circumference = 282;
  const offset = circumference * (1 - progressPercentage / 100);

  this.cachedStrokeOffset = `stroke-dashoffset: ${offset};`;
  this.previousExpiryDate = expiryDate;
  return this.cachedStrokeOffset;
}


// Function to determine the color of the circle based on remaining time
getCircleColor(expiryDate: any): string {
  if (!expiryDate) return 'blue';
  const dateObj = new Date(expiryDate);
  if (isNaN(dateObj.getTime())) return 'blue';

  const expiryTime = dateObj.getTime();
  const currentTime = Date.now();
  const remainingTime = expiryTime - currentTime;

  const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
  const twentyFourHours = 24 * oneHour; // 24 hours in milliseconds

  if (remainingTime > oneHour && remainingTime <= twentyFourHours) {
    return 'blue'; // More than 1 hour, but less than 24 hours
  } else if (remainingTime <= oneHour && remainingTime > 45 * 60 * 1000) {
    return 'orange'; // Between 45 minutes and 1 hour
  } else if (remainingTime <= 45 * 60 * 1000) {
    return 'red'; // Less than 45 minutes
  }

  return 'blue'; // Default to blue for longer durations
}

// Function to calculate the remaining time and format it as a string
getTimeRemaining(expiryDate: any): string {
  if (!expiryDate) return '';
  const dateObj = new Date(expiryDate);
  if (isNaN(dateObj.getTime())) return '';

  const expiryTime = dateObj.getTime();
  const currentTime = Date.now();
  const remainingTime = expiryTime - currentTime;

  const minutes = Math.floor(remainingTime / (1000 * 60)) % 60;
  const hours = Math.floor(remainingTime / (1000 * 60 * 60));

  if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}



  deleteComment(){
    this.deleteLoading = true;
    this.channelService.deleteComment(this.comment.id)
    .then(
      (resp: any) => {
        this.deleteLoading = false;
        this.removeComment.emit();
        this.toastService.presentSuccessToastr(resp.message);
      },
      err => {
        this.deleteLoading = false;
        this.toastService.presentErrorToastr(err);
      }
    )
  }

  async deleteCommentConf(){
    const alert = await this.alertCtrl.create({
      header: 'Delete Comment',
      message: 'Do you really want to delete this comment?',
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Yes',
          handler: () => {
            this.deleteComment();
          },
          cssClass: "text-danger"
        }
      ]
    })
    await alert.present();
  }

  voteOnComment(vote: number){
    if (this.isVoting || !this.comment?.id) return;
    this.isVoting = true;
    this.channelService.voteOnComment(this.comment.id, vote)
    .then(
      (resp: any) => {
        this.comment.voted = resp.data.voted;
        this.comment.votes = resp.data.votes;
        this.isVoting = false;
      },
      err => {
        this.isVoting = false;
        this.toastService.presentErrorToastr(err);
      }
    )
  }

  showUserProfile(id: string){
    if (id && !this.comment.anonyme && !this.isAdminComment()) {
      this.router.navigate(['/tabs/profile/display/' + id]);
      this.modalCtrl.dismiss();
    }
  }

  async presentPopover(ev: any) {
    const popoverItems = [];
    // Use the backend-provided isOwner flag for definitive ownership check
    const isOwner = this.comment.isOwner;
    if (isOwner) {
      popoverItems.push(
        {
          text: 'Delete',
          icon: 'fas fa-trash-alt',
          event: 'delete'
        }
      );
    } else {
      popoverItems.push(
        {
          text: 'Report',
          icon: 'fas fa-exclamation-triangle',
          event: 'report'
        }
      );
    }
    const popover = await this.popoverController.create({
      component: DropDownComponent,
      event: ev,
      cssClass: 'dropdown-popover',
      showBackdrop: false,
      componentProps: {
        items: popoverItems
      }
    });
    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data && data.event) {
      if (data.event === 'delete') {
        this.deleteCommentConf();
      } else if (data.event === 'report') {
        this.reportComment();
      }
    }
  }

  async reportComment(evidence?: string){
    const modal = await this.modalCtrl.create({
      component: ReportModalComponent,
      componentProps: {
        targetName: evidence ? 'this image' : 'this comment'
      },
      cssClass: 'report-modal-class'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      if (evidence) {
        data.evidence = [evidence];
        data.photoUrl = evidence;
      }
      this.channelService.reportComment(this.comment.id, data)
      .then(
        (resp: any) => {
          this.toastService.presentSuccessToastr(resp.message || 'Report submitted successfully');
        },
        err => {
          this.toastService.presentErrorToastr(err || 'Error reporting comment');
        }
      );
    }
  }

  async toggleImageSize() {
    if (this.mediaUrl) {
      const modal = await this.modalCtrl.create({
        component: PhotoViewerComponent,
        componentProps: {
          photos: [this.mediaUrl],
          initialIndex: 0,
          myProfile: false
        }
      });
      await modal.present();

      const { data } = await modal.onDidDismiss();
      if (data && data.action === 'report') {
        this.reportComment(this.mediaUrl);
      }
    }
  }
}
