import { environment } from 'src/environments/environment';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from './../../../../services/toast.service';
import { ChannelService } from './../../../../services/channel.service';
import { AlertController, ModalController, PopoverController } from '@ionic/angular';
import { PhotoViewerComponent } from 'src/app/components/photo-viewer/photo-viewer.component';
import { ReportModalComponent } from 'src/app/components/report-modal/report-modal.component';
import { Post } from './../../../../models/Post';
import { User } from './../../../../models/User';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, SimpleChanges, OnChanges, ViewChild, ElementRef, Renderer2 } from '@angular/core';
import { DropDownComponent } from 'src/app/pages/drop-down/drop-down.component';
import { Channel } from 'src/app/models/Channel';

@Component({
  selector: 'app-post',
  templateUrl: './post.component.html',
  styleUrls: ['./post.component.scss'],
})
export class PostComponent implements OnInit, OnChanges {

  @ViewChild('dropdown', { static: false }) dropdown!: ElementRef;
  private clickListener: (() => void) | null = null;

  @Output() removePost = new EventEmitter();
  @Input() post!: Post;
  @Input() user!: User;
  @Input() showCommentsBtn = true;
  @Input() channel!: Channel;

  isImageEnlarged: boolean = false;
  isMediaExpired: boolean = false;
  mediaUrl: string = '';
  cachedStrokeOffset: string = '';
  cachedCircleColor: string = '';
  previousExpiryDate: string | null = null;

  visibilityOptionsOpen = false;
  postId!: string;

  deleteLoading = false;

  constructor(
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef,
    private channelService: ChannelService,
    private toastService: ToastService,
    private modalCtrl: ModalController,
    private router: Router,
    private popoverController: PopoverController,
    private renderer: Renderer2,
    private activatedRoute: ActivatedRoute // Inject ActivatedRoute

  ) { }

  ngOnInit() {
    this.activatedRoute.queryParams.subscribe(params => {
      if (params.channel) {
const channelData = typeof params.channel === 'string' ? JSON.parse(params.channel) : params.channel;
        this.channel = new Channel().initialize(channelData);
        if (this.channel.type === 'static_events') {
          // Handle logic specific to static_events channels
          console.log('This is a static_events channel');
        } else if (this.channel.type === 'static') {
          // Handle logic for static channels
          console.log('This is a static channel');
        } else {
          // Handle logic for user-created channels
          console.log('This is a user-created channel');
        }
      }
    });
    // Ensure `post` and `user` exist to avoid template/runtime errors in tests
    if (!this.post) this.post = {} as any;
    if (!this.post.user) this.post.user = {} as any;
    if (!this.post.media) this.post.media = {} as any;
    if (!this.user) this.user = {} as any;
    if (!this.channel) this.channel = {} as any;
    this.updateMediaUrl();
    this.checkAndRemoveExpiredMedia(); // Check for expired media

  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['post']) {
      if (this.post && !this.post.user) this.post.user = {} as any;
      this.updateMediaUrl();
      this.checkAndRemoveExpiredMedia(); // Check for expired media

    }
  }

  postUserName(post: Post) {
    if (!post) return '';
    if (post.anonymName) return post.anonymName;
    if (this.isAdminPost()) return 'System';
    const u: any = post.user || {};
    const first = u.firstName || u.name || '';
    const last = u.lastName || '';
    return (first + ' ' + last).trim() || '';
  }

  isAdminPost(): boolean {
    const role = (this.post?.user?.role || '').toUpperCase();
    return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'SUPER ADMIN';
  }

  updateMediaUrl() {
    this.mediaUrl = this.getMediaUrl(this.post);
  }


  getMediaUrl(post: Post): string {
    if (!post || !post.media) return '';
    if (post.media && post.media.url) {
      const baseUrl = environment.socketUrl + '/';
      const mediaUrl = baseUrl + post.media.url.replace(/\\/g, '/');
      console.log("Generated Media URL:", mediaUrl);
      return mediaUrl;
    }
    return '';
  }

  isImageMedia(url?: string): boolean {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg') ||
           lowerUrl.endsWith('.png') || lowerUrl.endsWith('.gif') ||
           lowerUrl.endsWith('.webp');
  }

  isVideoMedia(url?: string): boolean {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm') ||
           lowerUrl.endsWith('.ogg');
  }

  getExpirationProgress(expiryDate: any): string {
    if (!expiryDate) return '';
    if (this.previousExpiryDate === expiryDate && this.cachedStrokeOffset) {
      return this.cachedStrokeOffset;
    }

    const dateObj = new Date(expiryDate);
    if (isNaN(dateObj.getTime())) return '';

    const expiryTime = dateObj.getTime();
    const currentTime = Date.now();
    const createdAtTime = this.post && this.post.createdAt ? new Date(this.post.createdAt).getTime() : Date.now();
    const totalTime = expiryTime - createdAtTime;
    const remainingTime = expiryTime - currentTime;

    const progressPercentage = Math.max((remainingTime / totalTime) * 100, 0);
    const circumference = 50.26; // 2 * PI * 8
    const offset = circumference * (1 - progressPercentage / 100);

    this.cachedStrokeOffset = `stroke-dashoffset: ${offset}; stroke-dasharray: ${circumference};`;
    this.previousExpiryDate = expiryDate;
    return this.cachedStrokeOffset;
  }

  getCircleColor(expiryDate: any): string {
    if (!expiryDate) return 'blue';
    if (this.previousExpiryDate === expiryDate && this.cachedCircleColor) {
      return this.cachedCircleColor;
    }

    const dateObj = new Date(expiryDate);
    if (isNaN(dateObj.getTime())) return 'blue';

    const expiryTime = dateObj.getTime();
    const currentTime = Date.now();
    const remainingTime = expiryTime - currentTime;

    const oneHour = 60 * 60 * 1000;
    const twentyFourHours = 24 * oneHour;

    let color = 'blue';
    if (remainingTime > oneHour && remainingTime <= twentyFourHours) {
      color = 'blue';
    } else if (remainingTime <= oneHour && remainingTime > 45 * 60 * 1000) {
      color = 'orange';
    } else if (remainingTime <= 45 * 60 * 1000) {
      color = 'red';
    }

    this.cachedCircleColor = color;
    return color;
  }

  getTimeRemaining(expiryDate: any): string {
    if (!expiryDate) return '';
    const dateObj = new Date(expiryDate);
    if (isNaN(dateObj.getTime())) return '';

    const expiryTime = dateObj.getTime();
    const currentTime = Date.now();
    const remainingTime = Math.max(expiryTime - currentTime, 0); // Ensure remainingTime is never negative

    const minutes = Math.floor(remainingTime / (1000 * 60)) % 60;
    const hours = Math.floor(remainingTime / (1000 * 60 * 60));

    return hours > 0 ? `${hours}h` : `${minutes}m`;
  }


  checkAndRemoveExpiredMedia() {
    const expiryDate = this.post && this.post.media ? this.post.media.expiryDate : null;
    if (!expiryDate) {
      this.isMediaExpired = false;
      return;
    }
    const expiryTime = new Date(expiryDate).getTime();
    const currentTime = Date.now();

    if (Number.isFinite(expiryTime) && expiryTime <= currentTime) {
      this.isMediaExpired = true;
      this.mediaUrl = ''; // Clear the URL so it doesn't load
    } else {
      this.isMediaExpired = false;
    }
  }



  voteOnPost(vote: number) {
    this.channelService.voteOnPost(this.post.id, vote).then(
      (resp: any) => {
        this.post.voted = resp.data.voted;
        this.post.votes = resp.data.votes;
      },
      err => {
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  toggleVisibilityOptions(event: Event) {
    event.stopPropagation();
    this.visibilityOptionsOpen = !this.visibilityOptionsOpen;

    if (this.visibilityOptionsOpen) {
      this.addClickListener();
    } else {
      this.removeClickListener();
    }
  }

  private addClickListener() {
    this.clickListener = this.renderer.listen('document', 'click', (event: Event) => {
      if (this.dropdown && !this.dropdown.nativeElement.contains(event.target)) {
        this.visibilityOptionsOpen = false;
        this.removeClickListener();
      }
    });
  }

  private removeClickListener() {
    if (this.clickListener) {
      this.clickListener();
      this.clickListener = null;
    }
  }

  ngOnDestroy() {
    this.removeClickListener();
  }

  changeVisibility(option: string) {
    if (!this.post || !this.post.id) return;

    this.channelService.updatePostVisibility(this.post.id, option).then(
      (res: any) => {
        this.post.visibility = option;
        this.toastService.presentSuccessToastr('Visibility updated successfully');
        this.visibilityOptionsOpen = false;
        this.removeClickListener();
        this.cdr.detectChanges();
      },
      err => {
        console.error('Error updating visibility:', err);
        this.toastService.presentErrorToastr('Could not update visibility');
        this.visibilityOptionsOpen = false;
        this.removeClickListener();
      }
    );
  }

  async showComments() {
    if (!this.showCommentsBtn) return;
    this.router.navigate(['/tabs/channels/post/' + this.post.id], {
      queryParams: {
        channel: JSON.stringify(this.channel.toObject())
      }
    });
  }

  handleMediaClick() {
    if (this.showCommentsBtn) {
      this.showComments();
    } else {
      this.toggleImageSize();
    }
  }


  showUserProfile(id: string) {
    if (id && !this.post.anonyme && !this.isAdminPost()) {
      this.router.navigate(['/tabs/profile/display/' + id]);
    }
  }

  async presentPopover(ev: any) {
    // Use the backend-provided isOwner flag for definitive ownership check
    const isOwner = this.post.isOwner;
    const popoverItems = isOwner
      ? [{ text: 'Delete', icon: 'fas fa-trash-alt', event: 'delete' }]
      : [{ text: 'Report', icon: 'fas fa-exclamation-triangle', event: 'report' }];

    const popover = await this.popoverController.create({
      component: DropDownComponent,
      event: ev,
      cssClass: 'dropdown-popover',
      showBackdrop: false,
      componentProps: { items: popoverItems }
    });
    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data && data.event) {
      if (data.event === 'delete') {
        this.deletePostConf();
      } else if (data.event === 'report') {
        this.reportPost();
      }
    }
  }

  async deletePostConf() {
    const alert = await this.alertCtrl.create({
      header: 'Delete Post',
      message: 'Do you really want to delete this post?',
      buttons: [
        { text: 'No', role: 'cancel' },
        { text: 'Yes', handler: () => this.deletePost(), cssClass: "text-danger" }
      ]
    });
    await alert.present();
  }

  deletePost() {
    this.channelService.deletePost(this.post.id).then(
      (resp: any) => {
        this.removePost.emit();
        this.toastService.presentSuccessToastr(resp.message);
      },
      err => {
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  async reportPost(evidence?: string) {
    const modal = await this.modalCtrl.create({
      component: ReportModalComponent,
      componentProps: {
        targetName: evidence ? 'this image' : 'this post'
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
      this.channelService.reportPost(this.post.id, data).then(
        (resp: any) => {
          this.toastService.presentSuccessToastr(resp.message || 'Report submitted successfully');
        },
        err => {
          this.toastService.presentErrorToastr(err || 'Error reporting post');
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
        this.reportPost(this.mediaUrl);
      }
    }
  }
}
