import { Router } from '@angular/router';
import { ToastService } from './../../../../services/toast.service';
import { ChannelService } from './../../../../services/channel.service';
import { AlertController, ModalController, PopoverController } from '@ionic/angular';
import { User } from './../../../../models/User';
import { Comment } from '../../../../models/Comment';
import { Component, Input, OnInit, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { DropDownComponent } from 'src/app/pages/drop-down/drop-down.component';
import { getCommentUserName } from '../comments/comment-utils';
import constants from '../../../../helpers/constants';

@Component({
  selector: 'app-comment',
  templateUrl: './comment.component.html',
  styleUrls: ['./comment.component.scss'],
})
export class CommentComponent implements OnInit, OnChanges {

  @Output() removeComment = new EventEmitter();
  @Input() comment: Comment;
  @Input() backgroundColor: string;
  @Input() color: string;
  @Input() user: User;
  @Input() userName: string; 
  deleteLoading = false;
  isImageEnlarged: boolean = false;
  mediaUrl: string = '';
  cachedStrokeOffset: string = '';
  cachedCircleColor: string = '';
  previousExpiryDate: string | null = null;

  constructor(private alertCtrl: AlertController,   private cdr: ChangeDetectorRef, private channelService: ChannelService, private toastService:
             ToastService, private router: Router, private popoverController: PopoverController, private modalCtrl: ModalController) { }

  ngOnInit() {
    this.updateMediaUrl();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['comment'] && changes['comment'].currentValue !== changes['comment'].previousValue) {
      this.updateMediaUrl();
    }
  }
  

  updateMediaUrl() {
    this.mediaUrl = this.getMediaUrl(this.comment);
  }

  commentUserName(comment: Comment) {
    return comment.anonymName || `${comment.user.firstName} ${comment.user.lastName}`;
}
  

  getMediaUrl(comment: Comment): string {
    if (comment.media && comment.media.url) {
      const baseUrl = 'http://127.0.0.1:3300/';
      const mediaUrl = baseUrl + comment.media.url.replace(/\\/g, '/');
      console.log("Generated Media URL:", mediaUrl);  // Debugging output
      return mediaUrl;  // Ensure URL uses forward slashes
    }
    return '';
  }

  toggleImageSize() {
    this.isImageEnlarged = !this.isImageEnlarged;
  }

  // Function to calculate expiration progress
 // Function to calculate expiration progress
// Function to calculate expiration progress
getExpirationProgress(expiryDate: string): string {
  if (this.previousExpiryDate === expiryDate && this.cachedStrokeOffset) {
    return this.cachedStrokeOffset;
  }

  const expiryTime = new Date(expiryDate).getTime();
  const currentTime = Date.now();
  const totalTime = expiryTime - new Date(this.comment.createdAt).getTime();
  const remainingTime = expiryTime - currentTime;

  const progressPercentage = Math.max((remainingTime / totalTime) * 100, 0);
  const circumference = 282;
  const offset = circumference * (1 - progressPercentage / 100);

  this.cachedStrokeOffset = `stroke-dashoffset: ${offset};`;
  this.previousExpiryDate = expiryDate;
  return this.cachedStrokeOffset;
}


// Function to determine the color of the circle based on remaining time
getCircleColor(expiryDate: string): string {
  const expiryTime = new Date(expiryDate).getTime();
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
getTimeRemaining(expiryDate: string): string {
  const expiryTime = new Date(expiryDate).getTime();
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
        this.toastService.presentStdToastr(resp.message);
      },
      err => {
        this.deleteLoading = false;
        this.toastService.presentStdToastr(err);
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
    this.channelService.voteOnComment(this.comment.id, vote)
    .then(
      (resp: any) => {
        this.comment.voted = resp.data.voted;
        this.comment.votes = resp.data.votes;
      },
      err => {
        this.toastService.presentStdToastr(err);
      }
    )
  }

  showUserProfile(id: string){
    if (!this.comment.anonyme && this.user.id !== id) {
      this.router.navigate(['/tabs/profile/display/' + id]);
      this.modalCtrl.dismiss();
    }
  }

  async presentPopover(ev: any) {
    const popoverItems = [];
    if (this.comment.user.id === this.user.id) {
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

  async reportComment(){
    const alert = await this.alertCtrl.create({
      header: 'Report Comment',
      inputs: [
        {
          type: 'text',
          name: 'message',
          placeholder: 'Message'
        }
      ],
      buttons: [
        {
          text: 'CANCEL',
          role: 'cancel'
        },
        {
          text: 'SEND',
          cssClass: 'text-danger',
          handler: (val) => {
            const message = val.message;
            this.channelService.reportComment(this.comment.id, message)
            .then(
              (resp: any) => {
                this.toastService.presentStdToastr(resp.message);
              },
              err => {
                this.toastService.presentStdToastr(err);
              }
            );
          }
        }
      ]
    });
    await alert.present();
  }
}
