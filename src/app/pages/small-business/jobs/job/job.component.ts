import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { ToastService } from './../../../../services/toast.service';
import { AlertController, Platform, PopoverController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { JobService } from './../../../../services/job.service';
import { User } from './../../../../models/User';
import { Job } from './../../../../models/Job';
import { ChangeDetectorRef, Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import constants from 'src/app/helpers/constants';
import { DropDownComponent } from 'src/app/pages/drop-down/drop-down.component';
import { ReportModalComponent } from 'src/app/components/report-modal/report-modal.component';
import { OneSignalService } from 'src/app/services/one-signal.service';
import { JobApplierDisclaimerComponent } from './job-applier-disclaimer.component';
import { ModalController } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-job',
  templateUrl: './job.component.html',
  styleUrls: ['./job.component.scss'],
})
export class JobComponent implements OnInit, OnDestroy {

  pageLoading = false;
  job: Job;
  jobId: string;
  domain = constants.DOMAIN_URL;
  page: number = 1;
  user: User;
  currentPhotoIndex: number = 1;
  private destroy$ = new Subject<void>();

  @ViewChild('jobSlides') slides: any;

  constructor(
    private jobService: JobService, private route: ActivatedRoute, private popoverController: PopoverController,
    private toastService: ToastService, private alertCtrl: AlertController,
    private router: Router, private nativeStorage: NativeStorage, private changeDetectorRef: ChangeDetectorRef,
    private platform: Platform, private oneSignalService: OneSignalService,
    private modalCtrl: ModalController, private userService: UserService
  ) { }

  ngOnInit() {
    this.userService.currentUser.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user) {
        this.user = user;
        this.changeDetectorRef.detectChanges();
        console.log('User updated in JobComponent:', this.user);
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillEnter() {
    this.getJobId();
  }

  getJobId() {
    this.route.paramMap.subscribe(params => {
      this.jobId = params.get('id');
      this.getJob();
    });
  }

  getJob() {
    this.pageLoading = true;
    this.jobService.get(this.jobId).then((resp: any) => {
      this.pageLoading = false;
      this.job = new Job(resp.data);
      this.page++;
      console.log(this.job);
    }).catch(err => {
      this.pageLoading = false;
      console.log(err);
      this.toastService.presentErrorToastr(err);
    });
  }

  removeJob() {
    this.jobService.remove(this.job.id).then((resp: any) => {
      console.log(resp);
      this.toastService.presentSuccessToastr(resp.message);
      this.router.navigateByUrl('/tabs/small-business/jobs/list/posted');
    }).catch(err => {
      console.log(err);
      this.toastService.presentErrorToastr(err);
    });
  }

  sendEmail() {
    const subject = encodeURIComponent('Job Inquiry: ' + this.job.title);
    const body = encodeURIComponent('Dear ' + this.job.company + ',\n\nI am interested in the job position titled "' + this.job.title + '".\n\nRegards,\n');
    window.open(`mailto:${this.job.email}?subject=${subject}&body=${body}`);
  }

  async removeConfirmation() {
    const alert = await this.alertCtrl.create({
      message: 'Do you really want to delete this job?',
      header: 'Delete Job',
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Yes',
          cssClass: 'text-danger',
          handler: () => {
            this.removeJob();
          }
        }
      ]
    });

    await alert.present();
  }

  openMail() {
    window.open('mailto:' + this.job.email);
  }

  async slideChanged() {
    const index = await this.slides.getActiveIndex();
    this.currentPhotoIndex = index + 1;
  }

  openWebsite(url: string) {
    if (url) {
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      window.open(url, '_system');
    }
  }

  async applyForJob() {
    const modal = await this.modalCtrl.create({
      component: JobApplierDisclaimerComponent,
      cssClass: 'disclaimer-modal'
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data === true) {
      // Logic to store acceptance could be added here (API call)
      console.log('Job application disclaimer accepted by user:', this.user._id);
      
      // Proceed with application (e.g., open mail or chat)
      window.open(`mailto:${this.job.email}?subject=Application for ${this.job.title}`, '_system');
    }
  }

  async presentPopover(ev: any) {
    const popoverItems = [
      {
        text: 'Report',
        icon: 'fas fa-exclamation-triangle',
        event: 'report'
      }
    ];
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
      if (data.event === 'report') this.reportJob();
    }
  }

  async reportJob() {
    const modal = await this.modalCtrl.create({
      component: ReportModalComponent,
      componentProps: {
        targetName: this.job.title
      },
      cssClass: 'report-modal-class'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      this.jobService.report(this.job.id, data).then((resp: any) => {
        this.toastService.presentSuccessToastr(resp.message || 'Report submitted successfully');
      }).catch(err => {
        this.toastService.presentErrorToastr(err || 'Error reporting job');
      });
    }
  }
}
