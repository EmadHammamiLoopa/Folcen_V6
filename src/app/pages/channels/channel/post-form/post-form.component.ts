import { ModalController } from '@ionic/angular';
import { Post } from './../../../../models/Post';
import { ToastService } from './../../../../services/toast.service';
import { ChannelService } from './../../../../services/channel.service';
import { Component, OnInit, OnChanges, SimpleChanges, ViewChild, ElementRef, Input, Output, EventEmitter } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Channel } from 'src/app/models/Channel';
import { UserService } from 'src/app/services/user.service';

@Component({
  selector: 'app-post-form',
  templateUrl: './post-form.component.html',
  styleUrls: ['./post-form.component.scss'],
})
export class PostFormComponent implements OnInit, OnChanges {
  @Input() channelId!: string;
  mediaFile: File | null = null;
  mediaPreview: any = ''; // Media preview for images or videos
  @Input() channel!: Channel;
  showEventFields = false; // Flag to toggle event-specific fields
  showDatingFields = false; // Flag to toggle dating-specific fields
  @ViewChild('postTextarea', { static: false }) postTextarea!: ElementRef;

  anonyme = false;
  visibility = 'public'; // Default visibility
  eventDate: string = '';      // Event Date
  eventLocation: string = '';  // Event Location
  eventTime: string = '';      // Event Time
  minDate: string = new Date().toISOString(); // Minimum date for events (today)
  maxDate: string = (new Date().getFullYear() + 20).toString(); // Maximum year for events

  relationshipGoals: string = '';
  ageRange = { lower: 18, upper: 99 };  // Adjusted to use `lower` and `upper` for ion-range
  interests: string[] = [];
  hintAboutMe: string = '';
  

  colors = [
    { background: '#6366f1', text: '#ffffff' }, // Indigo
    { background: '#f43f5e', text: '#ffffff' }, // Rose
    { background: '#8b5cf6', text: '#ffffff' }, // Violet
    { background: '#10b981', text: '#ffffff' }, // Emerald
    { background: '#f59e0b', text: '#ffffff' }, // Amber
    { background: '#0f172a', text: '#ffffff' }, // Slate
    { background: '#cbd5e1', text: '#0f172a' }, // Cool Slate Blue (Replaced White)
    { background: '#ec4899', text: '#ffffff' }, // Pink
  ];

  postLoading = false;
  // Structured mentions: UI text is only presentation; user IDs are authoritative.
  friendTagUsers: Array<{ name: string; id: string }> = [];
  filteredTaggableUsers: Array<{ name: string; id: string }> = [];
  tagging = false;

  private selectedMentions = new Map<string, string>();
  private mentionStart = -1;
  private mentionEnd = -1;
  private activePostTextarea: any = null;


  postBackColor = "#6366f1";
  postTextColor = "#ffffff";

  get isLightBg(): boolean {
    // Consider it a light background when the text color is dark (close to black)
    return this.postTextColor === '#0f172a' || this.postTextColor === '#000000' || this.postTextColor === '#111827';
  }

  postText = "";
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef;
  visibilitySelectOptions = {
    cssClass: 'visibility-popover',
    backdropDismiss: true,
    showBackdrop: true,
    animated: true,
    mode: 'md'
  } as const;

  constructor(private channelService: ChannelService, private route: ActivatedRoute,private toastService: ToastService, private modalCtrl:
              ModalController, private sanitizer: DomSanitizer, private userService: UserService) { }

  private applyChannelTypeFlags() {
    const t = this.channel?.type;
    this.showEventFields = t === 'static_events';
    this.showDatingFields = t === 'static_dating';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['channel'] && this.channel) {
      this.channel = new Channel().initialize(this.channel as any);
      this.applyChannelTypeFlags();
    }
  }


  ngOnInit() {
    // Modal path: channel is passed via componentProps from channel page.
    if (this.channel) {
      this.channel = new Channel().initialize(this.channel as any);
      this.applyChannelTypeFlags();
    }

    this.route.queryParams.subscribe((params) => {
      if (params.channel) {
        const channelData = JSON.parse(params.channel);
        this.channel = new Channel().initialize(channelData);
        this.applyChannelTypeFlags();
      }
    });

    this.loadFriendTagUsers();
  }

  shouldAutoGrow = true;

  ionViewWillEnter(){
    this.resetForm();
    this.forceTextareaResize();
    this.postText = "";
    const randomInd = Math.floor(Math.random() * this.colors.length);
    this.selectColor(this.colors[randomInd]);
    this.shouldAutoGrow = false;
    setTimeout(() => this.shouldAutoGrow = true, 50);
  }


  
  triggerFileInput() {
    this.fileInput.nativeElement.click();
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


removeMedia() {
  this.mediaFile = null;
  this.mediaPreview = ""; // Clear the preview UI (if any)
  
  // Reset the file input to allow the same file to be selected again
  this.fileInput.nativeElement.value = ''; 

  this.toastService.presentSuccessToastr('Media file removed.');
}



  private currentUserId(): string {
    try {
      return String(this.userService.getCurrentUserId() || '');
    } catch (_) {
      return '';
    }
  }

  private idOf(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value._id || value.id || value.user || '');
  }

  private displayNameOfUser(value: any): string {
    if (!value) return '';
    const first = value.firstName || value._firstName || '';
    const last = value.lastName || value._lastName || '';
    return String(
      value.fullName ||
      value.name ||
      `${first} ${last}`.trim() ||
      ''
    ).trim();
  }

  private loadFriendTagUsers(): void {
    this.userService.getFriends(0).subscribe(
      (resp: any) => {
        const rawFriends = Array.isArray(resp?.friends)
          ? resp.friends
          : (
              Array.isArray(resp?.data?.friends)
                ? resp.data.friends
                : (Array.isArray(resp?.data) ? resp.data : [])
            );

        const me = this.currentUserId();
        const seen = new Set<string>();

        this.friendTagUsers = (rawFriends || [])
          .map((friend: any) => ({
            id: this.idOf(friend),
            name: this.displayNameOfUser(friend)
          }))
          .filter((friend: any) => {
            if (
              !friend.id ||
              !friend.name ||
              friend.id === me ||
              seen.has(friend.id)
            ) {
              return false;
            }
            seen.add(friend.id);
            return true;
          });
      },
      () => {
        this.friendTagUsers = [];
      }
    );
  }

  private canTagPostUsers(): boolean {
    return !this.anonyme && this.visibility !== 'private';
  }

  setPostVisibility(value: 'public' | 'friends-only' | 'private'): void {
    this.visibility = value;
    this.onPostMentionPolicyChanged();
  }

  onPostMentionPolicyChanged(): void {
    if (!this.canTagPostUsers()) {
      this.tagging = false;
      this.filteredTaggableUsers = [];
      this.selectedMentions.clear();
    }
  }

  onPostMentionKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.tagging = false;
      this.filteredTaggableUsers = [];
    }
  }

  private findPostMentionAtCursor(
    text: string,
    cursor: number
  ): { start: number; end: number; query: string } | null {
    const beforeCursor = text.slice(0, cursor);
    const at = beforeCursor.lastIndexOf('@');

    if (at < 0) return null;

    if (at > 0 && !/\s/.test(beforeCursor.charAt(at - 1))) {
      return null;
    }

    const raw = beforeCursor.slice(at + 1);

    if (
      raw.includes('\n') ||
      raw.includes('\r') ||
      raw.length > 80 ||
      /[,;:!?()[\]{}]/.test(raw)
    ) {
      return null;
    }

    // A previously selected mention followed by a space is complete.
    for (const label of Array.from(this.selectedMentions.values())) {
      if (raw.startsWith(label + ' ')) {
        return null;
      }
    }

    return {
      start: at,
      end: cursor,
      query: raw.trim().toLowerCase()
    };
  }

  async onPostInput(event: any): Promise<void> {
    const value = String(
      event?.detail?.value ??
      event?.target?.value ??
      this.postText ??
      ''
    );

    this.postText = value;
    this.activePostTextarea = event?.target || this.activePostTextarea;

    this.reconcilePostMentions(value);

    if (!this.canTagPostUsers()) {
      this.tagging = false;
      this.filteredTaggableUsers = [];
      return;
    }

    let cursor = value.length;

    try {
      const native = await event?.target?.getInputElement?.();
      if (
        native &&
        typeof native.selectionStart === 'number'
      ) {
        cursor = native.selectionStart;
      }
    } catch (_) {}

    const active = this.findPostMentionAtCursor(value, cursor);

    if (!active) {
      this.tagging = false;
      this.filteredTaggableUsers = [];
      this.mentionStart = -1;
      this.mentionEnd = -1;
      return;
    }

    this.mentionStart = active.start;
    this.mentionEnd = active.end;

    const query = active.query;

    this.filteredTaggableUsers = this.friendTagUsers
      .filter(user =>
        !query ||
        user.name.toLowerCase().includes(query)
      )
      .slice(0, 10);

    this.tagging = this.filteredTaggableUsers.length > 0;
  }

  selectPostMention(user: { name: string; id: string }): void {
    if (!this.canTagPostUsers()) return;

    const selectedId = this.idOf(user?.id);
    const selectedName = String(user?.name || '').trim();

    const allowed = this.friendTagUsers.some(
      friend => friend.id === selectedId
    );

    if (
      !selectedId ||
      !selectedName ||
      selectedId === this.currentUserId() ||
      !allowed ||
      this.mentionStart < 0 ||
      this.mentionEnd < this.mentionStart
    ) {
      return;
    }

    const before = this.postText.slice(0, this.mentionStart);
    const after = this.postText.slice(this.mentionEnd);
    const inserted = `@${selectedName} `;

    this.postText = before + inserted + after;
    this.selectedMentions.set(selectedId, selectedName);

    const newCursor = before.length + inserted.length;

    this.tagging = false;
    this.filteredTaggableUsers = [];
    this.mentionStart = -1;
    this.mentionEnd = -1;

    setTimeout(async () => {
      try {
        const native =
          await this.activePostTextarea?.getInputElement?.();

        native?.focus?.();
        native?.setSelectionRange?.(
          newCursor,
          newCursor
        );
      } catch (_) {}

      this.forceTextareaResize();
    }, 0);
  }

  private mentionLabelExists(text: string, label: string): boolean {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    return new RegExp(
      `(^|\\s)@${escaped}(?=$|\\s|[.,!?;:])`,
      'i'
    ).test(text || '');
  }

  private reconcilePostMentions(text: string): void {
    for (const [id, label] of Array.from(this.selectedMentions.entries())) {
      if (!this.mentionLabelExists(text, label)) {
        this.selectedMentions.delete(id);
      }
    }
  }

  private getStructuredPostMentionIds(): string[] {
    this.reconcilePostMentions(this.postText || '');

    if (!this.canTagPostUsers()) {
      return [];
    }

    const allowed = new Set(
      this.friendTagUsers.map(friend => friend.id)
    );

    return Array.from(this.selectedMentions.keys())
      .filter(id =>
        !!id &&
        id !== this.currentUserId() &&
        allowed.has(id)
      );
  }

addPost() {
  const text = (this.postText || '').trim();
  if (!text && !this.mediaFile) {
    this.toastService.presentErrorToastr('Please add text or media before submitting.');
    return;
  }

  if (!this.channel || !this.channelId) {
    this.toastService.presentErrorToastr('Channel is not ready yet. Please try again.');
    return;
  }

  const formData = new FormData();
  formData.append('text', text);
  formData.append('mentionMode', 'structured');

  this.getStructuredPostMentionIds()
    .forEach(id => formData.append('mentionedUserIds[]', id));
  formData.append('backgroundColor', this.postBackColor);
  formData.append('color', this.postTextColor);
  formData.append('anonyme', this.anonyme.toString());
  formData.append('visibility', this.visibility);

  // If media is selected, add it to the form data
  if (this.mediaFile) {
    formData.append('media', this.mediaFile);
  }

  // Event-specific logic for static_events channels
  if (this.channel.type === 'static_events') {
    if (!this.eventDate || !this.eventTime || !this.eventLocation) {
      this.toastService.presentErrorToastr('Please fill all event details (Date, Time, Location)');
      return;
    }
    formData.append('eventDate', this.eventDate);
    formData.append('eventLocation', this.eventLocation);
    formData.append('eventTime', this.eventTime);
  }

  if (this.channel.type === 'static_dating') {
    formData.append('relationshipGoals', this.relationshipGoals);
    formData.append('ageRangeMin', this.ageRange.lower.toString());
    formData.append('ageRangeMax', this.ageRange.upper.toString());
    formData.append('interests', this.interests.toString());
    formData.append('hintAboutMe', this.hintAboutMe);
  }


  this.postLoading = true;

  this.channelService.storePost(this.channelId, formData).then(
    (resp: any) => {
      this.postLoading = false;

      // Successfully added the post
      this.toastService.presentSuccessToastr('Post created successfully');

      // Reset form values
      this.resetForm();

      // Dismiss the modal and return the new post
      this.modalCtrl.dismiss({
        post: new Post().initialize(resp.data)
      });
    },
    (err) => {
      this.postLoading = false;
      const errorMessage = err.error?.errors?.text?.[0] || err.message || 'Failed to create post';
      this.toastService.presentErrorToastr(`Error creating post: ${errorMessage}`);
    }
  );
}


forceTextareaResize() {
  setTimeout(() => {
    if (this.postTextarea && this.postTextarea.nativeElement) {
      const textarea = this.postTextarea.nativeElement.querySelector('.native-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.style.height = 'auto';  // Reset height
        textarea.style.height = textarea.scrollHeight + 'px'; // Force recalculation
      }
    }
  }, 100); // Slight delay to ensure rendering is done
}

resetForm() {
  this.postText = ''; // Reset text
  this.selectedMentions.clear();
  this.filteredTaggableUsers = [];
  this.tagging = false;
  this.mentionStart = -1;
  this.mentionEnd = -1;
  this.mediaFile = null;
  this.mediaPreview = '';
  this.postBackColor = '#6366f1';
  this.postTextColor = '#ffffff';

  setTimeout(() => this.forceTextareaResize(), 200); // Recalculate after UI updates
}

  selectColor(color: any){
    this.postBackColor = color.background;
    this.postTextColor = color.text;
  }
}
