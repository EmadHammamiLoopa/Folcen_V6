import { User } from 'src/app/models/User';
import { IonInfiniteScroll } from '@ionic/angular';
import { Comment } from '../../../../models/Comment';
import { ToastService } from './../../../../services/toast.service';
import { ChannelService } from './../../../../services/channel.service';
import { Post } from './../../../../models/Post';
import { Channel } from 'src/app/models/Channel';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, ViewChild, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { getCommentUserName } from './comment-utils';
import { DomSanitizer } from '@angular/platform-browser';
import { AppEventsService } from 'src/app/services/app-events.service';

@Component({
  selector: 'app-comments',
  templateUrl: './comments.component.html',
  styleUrls: ['./comments.component.scss'],
})
export class CommentsComponent implements OnInit, OnDestroy {

  @ViewChild('infinitScroll') infinitScroll!: IonInfiniteScroll;
  @ViewChild('mediaInput') mediaInput!: ElementRef<HTMLInputElement>;
  @ViewChild('cameraPreview') cameraPreview!: ElementRef<HTMLVideoElement>;
  @HostListener('document:click', ['$event'])
  onClickOutside(event: any) {
    if (!event.target.closest('.tag-dropdown')) {
      this.tagging = false;
    }
  }
  
  @Output() addComment = new EventEmitter();
  post!: Post;
  channel: Channel = new Channel().initialize({ type: 'user' } as any);
  postId!: string;
  user!: User;
  postError: boolean = false;

  anonyme = false;

  commentText = "";
  mediaFile: File | null = null; // Store the selected media file
  mediaPreview: any = "";
  comments: Comment[] = [];
  visibleCommentTotal = 0;
  showMediaSourceMenu = false;
  showInlineCamera = false;
  private inlineCameraStream: MediaStream | null = null;
  private capturingInlinePhoto = false;
  private readonly commentThemes = [
    {
      bg: 'linear-gradient(145deg, #8be9d8 0%, #d9fff7 100%)',
      text: '#111827',
      muted: '#64748b',
      control: 'rgba(255, 255, 255, 0.62)'
    },
    {
      bg: 'linear-gradient(145deg, #c9b5ff 0%, #f0e9ff 100%)',
      text: '#111827',
      muted: '#64748b',
      control: 'rgba(255, 255, 255, 0.62)'
    },
    {
      bg: 'linear-gradient(145deg, #ffaec6 0%, #ffeaf1 100%)',
      text: '#111827',
      muted: '#64748b',
      control: 'rgba(255, 255, 255, 0.62)'
    },
    {
      bg: 'linear-gradient(145deg, #9bd0ff 0%, #e8f6ff 100%)',
      text: '#111827',
      muted: '#64748b',
      control: 'rgba(255, 255, 255, 0.62)'
    },
    {
      bg: 'linear-gradient(145deg, #ffc96b 0%, #fff0cf 100%)',
      text: '#111827',
      muted: '#64748b',
      control: 'rgba(255, 255, 255, 0.62)'
    },
    {
      bg: 'linear-gradient(145deg, #b7e66d 0%, #efffda 100%)',
      text: '#111827',
      muted: '#64748b',
      control: 'rgba(255, 255, 255, 0.62)'
    }
  ];

  page = 0;
  pageLoading = false;

  constructor(
    private channelService: ChannelService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private nativeStorage: NativeStorage,
    private sanitizer: DomSanitizer,
    private events: AppEventsService,
    private changeDetectorRef: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.getUserData();
  }

  ionViewWillEnter(){
    this.pageLoading = true;
    this.getPostId();
    this.events.setShowTabs(false);
  }

  ionViewWillLeave() {
    this.events.setShowTabs(true);
  }

  ngOnDestroy() {
    this.stopInlineCamera();
    this.events.setShowTabs(true);
  }

  
  private getUserData() {
    (async () => {
      try {
        let u: any = null;
        try { u = await this.nativeStorage.getItem('currentUser'); } catch(e) {}
        if (!u) {
          try { u = await this.nativeStorage.getItem('currentUser'); } catch(e) { /* ignore */ }
        }
        if (!u) try { u = await this.nativeStorage.getItem('user'); } catch(e) {}
        if (u) this.user = new User().initialize(u);
        else this.fetchUserFromLocalStorage();
      } catch (error) {
        console.warn('Error fetching user data from NativeStorage:', error);
        this.fetchUserFromLocalStorage();
      }
    })();
  }



  commentUserName(comment: Comment) {
    return comment.anonymName || `${comment.user.firstName} ${comment.user.lastName}`;
}

  
  getTaggableUsers(): Array<{ name: string, id: string }> {
    const taggableUsersMap = new Map<string, { name: string, id: string }>();
  
    // Add the post author if not the current user
    if (this.post && this.post.user._id !== this.user._id) {
      const authorName = this.post.anonyme ? this.post.anonymName : `${this.post.user.firstName} ${this.post.user.lastName}`;
      taggableUsersMap.set(`${this.post.user._id}-${this.post.anonyme}`, {
        name: authorName,
        id: this.post.user._id
      });
    }
  
    // Add the users from comments, considering both anonymous and real identities
    if (this.comments && this.comments.length > 0) {
      this.comments.forEach(comment => {
        const identityKey = `${comment.user._id}-${comment.anonyme}`;
        if (comment.user._id !== this.user._id && !taggableUsersMap.has(identityKey)) {
          taggableUsersMap.set(identityKey, {
            name: this.commentUserName(comment),
            id: comment.user._id
          });
        }
      });
    }
  
    // Convert the map values to an array and return
    return Array.from(taggableUsersMap.values());
  }
  
  
 
  
  filteredTaggableUsers: Array<{name: string, id: string}> = [];
tagging = false;

onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    this.tagging = false;
  }
}

/** Called on every input change. Detects an unfinished @mention at the end of the current text. */
onCommentInput(value: string) {
  this.commentText = value ?? '';
  const m = /(?:^|\s)@([^\s@]*)$/.exec(this.commentText);
  if (m) {
    const query = (m[1] || '').toLowerCase();
    const all = this.getTaggableUsers();
    this.filteredTaggableUsers = query
      ? all.filter(u => u.name.toLowerCase().includes(query))
      : all;
    this.tagging = this.filteredTaggableUsers.length > 0;
  } else {
    this.tagging = false;
    this.filteredTaggableUsers = [];
  }
}

selectUser(user: { name: string; id: string }) {
  // Replace the trailing @query with @Name + space
  this.commentText = this.commentText.replace(/(?:^|\s)@([^\s@]*)$/, (full, _q, offset) => {
    const lead = offset === 0 ? '' : full[0];
    return `${lead}@${user.name} `;
  });
  this.tagging = false;
  this.filteredTaggableUsers = [];
  this.taggedUserIds.add(user.id);
}

taggedUserIds: Set<string> = new Set();


  private fetchUserFromLocalStorage() {
  const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
  const user = raw ? JSON.parse(raw) : null;
    if (user) {
      this.user = new User().initialize(user);
    } else {
      console.log('User data not found in localStorage');
      // Handle the scenario where user data is not found
      // For example, redirect to login or handle initial setup
    }
  }

  getPostId(){
    this.route.paramMap.subscribe(
      params => {
        this.postId = params.get('id') || '';
        this.hydrateChannelFromRoute();
        this.restorePendingCommentCameraMedia();
        this.getPost();
      }
    )
  }

  private hydrateChannelFromRoute(): void {
    const rawChannel = this.route.snapshot.queryParamMap.get('channel');
    if (!rawChannel) {
      this.channel = new Channel().initialize({ type: 'user' } as any);
      return;
    }

    try {
      this.channel = new Channel().initialize(JSON.parse(rawChannel));
    } catch (e) {
      console.warn('[comments] failed to parse route channel payload', e);
      this.channel = new Channel().initialize({ type: 'user' } as any);
    }
  }

  getPost(){
    this.postError = false;
    this.channelService.getPost(this.postId).then(
      (resp: any) => {
        this.post = new Post().initialize(resp.data);
        this.getComments(null, true);
      },
      err => {
        this.pageLoading = false;
        if (err && (err.status === 403 || err.status === 404)) {
          this.postError = true;
        } else {
          this.toastService.presentErrorToastr(err);
        }
      }
    );
  }

  private hasCommentContent(comment: any): boolean {
    const text = typeof comment?.text === 'string' ? comment.text.trim() : '';
    const media = comment?.media;
    const mediaUrl = typeof media === 'string'
      ? media.trim()
      : (typeof media?.url === 'string' ? media.url.trim() : '');
    const cleanMediaUrl = mediaUrl.toLowerCase();
    const expiryRaw = typeof media === 'object' && media ? media.expiryDate : null;
    const expiryTime = expiryRaw ? new Date(expiryRaw).getTime() : null;
    const mediaExpired = Number.isFinite(expiryTime) && expiryTime <= Date.now();
    return !!text || (
      !!mediaUrl &&
      !cleanMediaUrl.includes('undefined') &&
      !cleanMediaUrl.includes('null') &&
      mediaUrl !== '[object Object]' &&
      !mediaExpired
    );
  }

  getCommentTheme(index: number) {
    return this.commentThemes[index % this.commentThemes.length];
  }

  getComments(event?: any, refresh?: boolean) {
    if (!event) this.pageLoading = true;
    if (refresh) this.page = 0;
  
    this.channelService.getComments(this.post.id, this.page).then(
      (resp: any) => {
        console.log(resp);
  
        if (!event || refresh) {
          this.comments = []; // Clear comments array when refreshing
        }
  
        if (refresh) {
          if (this.infinitScroll) this.infinitScroll.disabled = false;
        }
  
        if (event) {
          event.target.complete();
          if (!resp.data.more && !refresh) {
            event.target.disabled = true;
          }
        }
  
        // Push only new comments
        resp.data.comments.forEach((cmt: any) => {
          if (!this.hasCommentContent(cmt)) return;
          const incomingId = cmt && (cmt._id || cmt.id);
          if (!incomingId) return;
          if (!this.comments.some(existingComment => String(existingComment.id) === String(incomingId))) {
            this.comments.push(new Comment().initialize(cmt));
          }
        });
        const responseCount = Number(resp?.data?.count);
        this.visibleCommentTotal = this.comments.length;
        if (this.post) {
          this.post.commentCount = this.visibleCommentTotal;
        }
  
        this.pageLoading = false;
        if (resp?.data?.more) {
          this.page += 1;
        }

        // Check for commentId in query params to scroll to it
        this.route.queryParamMap.subscribe(queryParams => {
          const commentId = queryParams.get('commentId');
          if (commentId) {
            setTimeout(() => {
              const element = document.getElementById('comment-' + commentId);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight-comment');
              }
            }, 500);
          }
        });
      },
      err => {
        this.pageLoading = false;
        this.toastService.presentErrorToastr(err);
      }
    );
  }
  
  
  onMediaSelected(event: any) {
    const file = event.target.files[0];
    console.log("Selected file type:", file.type); // Log the file type for debugging
    if (file && this.isValidMedia(file)) {
      this.mediaFile = file;
      // Sanitize the blob URL
      this.mediaPreview = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(file));
    } else {
      this.toastService.presentErrorToastr('Invalid media file selected');
    }
  }

  async captureCommentMedia() {
    const isNativeRuntime = this.channelService.platform?.is('cordova')
      || this.channelService.platform?.is('capacitor')
      || this.channelService.platform?.is('hybrid');

    if (!isNativeRuntime) {
      const input = this.mediaInput && this.mediaInput.nativeElement;
      if (input) {
        input.value = '';
        input.click();
      }
      return;
    }

    await this.chooseCommentMediaSource();
  }

  async chooseCommentMediaSource() {
    this.showMediaSourceMenu = true;
  }

  closeMediaSourceMenu() {
    this.showMediaSourceMenu = false;
  }

  selectCommentMediaSource(source: 'gallery' | 'camera') {
    this.closeMediaSourceMenu();
    if (source === 'gallery') {
      this.openGalleryInput();
      return;
    }
    this.openInlineCamera();
  }

  private openGalleryInput() {
    const input = this.mediaInput && this.mediaInput.nativeElement;
    if (input) {
      input.setAttribute('accept', 'image/*,video/*');
      input.removeAttribute('capture');
      input.value = '';
      input.click();
    }
  }

  private openCameraInput() {
    const input = this.mediaInput && this.mediaInput.nativeElement;
    if (input) {
      input.setAttribute('accept', 'image/*');
      input.setAttribute('capture', 'environment');
      input.value = '';
      input.click();
    }
  }

  async openInlineCamera() {
    this.showInlineCamera = true;
    this.changeDetectorRef.detectChanges();
    try {
      this.inlineCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      await new Promise(resolve => setTimeout(resolve, 80));
      if (this.cameraPreview?.nativeElement) {
        this.cameraPreview.nativeElement.srcObject = this.inlineCameraStream;
        await this.cameraPreview.nativeElement.play().catch(() => {});
      }
    } catch (err: any) {
      this.showInlineCamera = false;
      this.stopInlineCamera();
      this.toastService.presentErrorToastr('Camera failed: ' + (err?.message || err));
    }
  }

  async captureInlineCameraPhoto() {
    if (this.capturingInlinePhoto) return;
    this.capturingInlinePhoto = true;
    try {
      const video = this.cameraPreview?.nativeElement;
      if (!video) {
        this.toastService.presentErrorToastr('Camera is not ready yet.');
        return;
      }
      await this.waitForInlineVideoReady(video);
      const width = video.videoWidth || Math.round(video.clientWidth * (window.devicePixelRatio || 1));
      const height = video.videoHeight || Math.round(video.clientHeight * (window.devicePixelRatio || 1));
      if (!width || !height) {
        this.toastService.presentErrorToastr('Camera is not ready yet.');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not capture photo');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      const file = this.dataUrlToFile(dataUrl, `comment-${Date.now()}.jpg`, 'image/jpeg');
      this.mediaFile = file;
      this.mediaPreview = this.sanitizer.bypassSecurityTrustUrl(dataUrl);
      this.closeInlineCamera();
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      this.toastService.presentErrorToastr('Camera failed: ' + (e?.message || e));
    } finally {
      this.capturingInlinePhoto = false;
    }
  }

  private async waitForInlineVideoReady(video: HTMLVideoElement) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (video.videoWidth && video.videoHeight) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  closeInlineCamera() {
    this.showInlineCamera = false;
    this.stopInlineCamera();
  }

  private stopInlineCamera() {
    if (this.inlineCameraStream) {
      this.inlineCameraStream.getTracks().forEach(track => track.stop());
      this.inlineCameraStream = null;
    }
  }

  private safeSerializeChannel() {
    try {
      return this.channel && typeof (this.channel as any).toObject === 'function'
        ? (this.channel as any).toObject()
        : this.channel;
    } catch (e) {
      return null;
    }
  }

  private restorePendingCommentCameraMedia() {
    try {
      const raw = localStorage.getItem('pendingCommentCameraMedia');
      if (!raw) return;
      const pending = JSON.parse(raw);
      if (!pending?.postId || String(pending.postId) !== String(this.postId)) return;
      if (pending.at && Date.now() - Number(pending.at) > 10 * 60 * 1000) {
        localStorage.removeItem('pendingCommentCameraMedia');
        return;
      }
      const dataUrl = pending.dataUrl || '';
      if (!dataUrl.startsWith('data:image/')) return;
      const file = this.dataUrlToFile(dataUrl, pending.name || `comment-${Date.now()}.jpg`, pending.mimeType || 'image/jpeg');
      this.mediaFile = file;
      this.mediaPreview = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(file));
      localStorage.removeItem('pendingCommentCameraMedia');
      localStorage.removeItem('pendingCommentCameraReturn');
      this.changeDetectorRef.detectChanges();
    } catch (e) {
      console.warn('[comments] failed to restore pending camera media', e);
    }
  }

  private dataUrlToFile(dataUrl: string, name: string, fallbackMime: string): File {
    const [meta, base64] = dataUrl.split(',');
    const mime = /data:([^;]+)/.exec(meta || '')?.[1] || fallbackMime;
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type: mime });
  }
  

// Validate file type (image/video)
// Validate file type (image/video)
isValidMedia(file: File): boolean {
  const allowedTypes = [
    'image/png',    // PNG images
    'image/jpeg',   // JPEG images
    'image/jpg',    // JPG images
    'image/gif',    // GIF images (optional)
    'image/webp',   // WebP images
    'video/mp4',    // MP4 videos
    'video/webm',   // WebM videos (optional)
    'video/ogg',    // Ogg videos (optional)
    // Add more types if needed
  ];
  return allowedTypes.includes(file.type);
}

  storeComment() {
  if (!this.commentText.trim() && !this.mediaFile) {
    this.toastService.presentErrorToastr('Please add a comment or media before submitting.');
    return;
  }

  const formData = new FormData();
  formData.append('text', this.commentText.trim());
  formData.append('anonyme', this.anonyme.toString());
  // Send structured mention IDs so the backend doesn't have to guess from text.
  if (this.taggedUserIds && this.taggedUserIds.size) {
    Array.from(this.taggedUserIds).forEach(id => formData.append('mentionedUserIds[]', id));
  }
  if (this.mediaFile) {
      formData.append('media', this.mediaFile);
  }
  formData.forEach((value, key) => {
      console.log(`FormData key: ${key}, value:`, value);
  });

  this.channelService.storeComment(this.post.id, formData).then(
    (resp: any) => {
      console.log('Comment added successfully:', resp);

      // Successfully added the comment
      const newComment = new Comment().initialize(resp.data);
      const shouldShowComment = this.hasCommentContent(newComment);
      if (shouldShowComment) {
        this.comments.unshift(newComment);
      }
      if (this.post) {
        const current = Array.isArray(this.post.comments) ? this.post.comments : [];
        this.post.comments = shouldShowComment ? [newComment, ...current] : current;
        this.visibleCommentTotal = this.comments.length;
        this.post.commentCount = this.visibleCommentTotal;
      }
      this.commentText = ""; // Reset the comment text
      this.mediaFile = null; // Reset the media file
      this.mediaPreview = ""; // Clear media preview
      this.taggedUserIds.clear();
      try {
        localStorage.removeItem('pendingCommentCameraMedia');
        localStorage.removeItem('pendingCommentCameraReturn');
      } catch (e) {}

      this.toastService.presentSuccessToastr('Comment added successfully.');
    },
    (err) => {
      // Handle any errors
      console.error('Error adding comment:', err);
      const errorMessage = err.error?.errors?.text?.[0] || err.message || 'Failed to add comment';
      this.toastService.presentErrorToastr(`Error adding comment: ${errorMessage}`);
    }
  );
}

reactToPost(vote: number) {
  if (!this.post?.id) return;
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

onRemoveComment(index: number) {
  this.comments.splice(index, 1);
  if (this.post && Array.isArray(this.post.comments)) {
    this.post.comments = this.post.comments.filter((_comment, ind) => ind !== index);
  }
  if (this.post) {
    this.visibleCommentTotal = Math.max(Number(this.visibleCommentTotal || this.post.commentCount || 0) - 1, this.comments.length);
    this.post.commentCount = this.visibleCommentTotal;
  }
  // Additional logic if required
}

onHiddenComment(commentId: string) {
  if (!commentId) return;
  const before = this.comments.length;
  this.comments = this.comments.filter(comment => String(comment.id) !== String(commentId));
  if (before === this.comments.length) return;
  this.visibleCommentTotal = this.comments.length;
  if (this.post) {
    this.post.commentCount = this.visibleCommentTotal;
  }
  this.changeDetectorRef.detectChanges();
}


// Remove selected media file
removeMedia() {
  this.mediaFile = null;
  this.mediaPreview = ""; // Clear the preview UI (if any)
  try {
    localStorage.removeItem('pendingCommentCameraMedia');
    localStorage.removeItem('pendingCommentCameraReturn');
  } catch (e) {}
  this.toastService.presentSuccessToastr('Media file removed.');
}


}
