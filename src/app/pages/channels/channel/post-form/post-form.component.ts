import { ModalController } from '@ionic/angular';
import { Post } from './../../../../models/Post';
import { ToastService } from './../../../../services/toast.service';
import { ChannelService } from './../../../../services/channel.service';
import { Component, OnInit, ViewChild, ElementRef, Input, Output, EventEmitter } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Channel } from 'src/app/models/Channel';

@Component({
  selector: 'app-post-form',
  templateUrl: './post-form.component.html',
  styleUrls: ['./post-form.component.scss'],
})
export class PostFormComponent implements OnInit {
  @Input() channelId;
  mediaFile: File | null = null;
  mediaPreview: any = ''; // Media preview for images or videos
  @Input() channel:Channel;
  showEventFields = false; // Flag to toggle event-specific fields
  showDatingFields = false; // Flag to toggle dating-specific fields
  @ViewChild('postTextarea', { static: false }) postTextarea: ElementRef;

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

  postBackColor = "#6366f1";
  postTextColor = "#ffffff";

  postText = "";
  @ViewChild('fileInput', { static: false }) fileInput: ElementRef;
  visibilitySelectOptions = {
    cssClass: 'visibility-popover',
    backdropDismiss: true,
    showBackdrop: true,
    animated: true,
    mode: 'md'
  } as const;

  constructor(private channelService: ChannelService, private route: ActivatedRoute,private toastService: ToastService, private modalCtrl:
              ModalController, private sanitizer: DomSanitizer) { }


  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      if (params.channel) {
        const channelData = JSON.parse(params.channel);
        this.channel = new Channel().initialize(channelData);

        // Toggle event fields for static_events
        if (this.channel.type === 'static_events') {
          this.showEventFields = true;
        }

        // Toggle dating fields for static_dating
        if (this.channel.type === 'static_dating') {
          this.showDatingFields = true;
        }
      }
    });
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

  
  onMediaSelected(event) {
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


addPost() {
  // Ensure postText is not null or undefined and check if it's empty after trimming
  if (!this.postText || !this.postText.trim()) {
    this.toastService.presentErrorToastr('Please add text or media before submitting.');
    return;
  }

  const formData = new FormData();
  formData.append('text', this.postText.trim());
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
  this.mediaFile = null;
  this.mediaPreview = '';
  this.postBackColor = '#6366f1';
  this.postTextColor = '#ffffff';

  setTimeout(() => this.forceTextareaResize(), 200); // Recalculate after UI updates
}

  selectColor(color){
    this.postBackColor = color.background;
    this.postTextColor = color.text;
  }
}
