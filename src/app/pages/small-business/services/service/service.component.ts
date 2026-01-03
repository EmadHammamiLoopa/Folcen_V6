import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { AlertController, PopoverController, Platform, ModalController, IonSlides } from '@ionic/angular';
import { ToastService } from './../../../../services/toast.service';
import { ServiceService } from './../../../../services/service.service';
import { ActivatedRoute, Router } from '@angular/router';
import { User } from './../../../../models/User';
import constants from 'src/app/helpers/constants';
import { Service } from './../../../../models/Service';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CallNumber } from '@ionic-native/call-number/ngx';
import { DropDownComponent } from 'src/app/pages/drop-down/drop-down.component';
import { ReportModalComponent } from 'src/app/components/report-modal/report-modal.component';
import { OneSignalService } from 'src/app/services/one-signal.service';
import { ShareFriendsModalComponent } from './share-friends-modal.component';
import { ApplierDisclaimerComponent } from './applier-disclaimer.component';
import { GalleryModalComponent } from './gallery-modal.component';
import { UserService } from 'src/app/services/user.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';


@Component({
  selector: 'app-service',
  templateUrl: './service.component.html',
  styleUrls: ['./service.component.scss'],
})
export class ServiceComponent implements OnInit, OnDestroy {

  @ViewChild('serviceSlides') slides: IonSlides;

  pageLoading = false;
  service: Service;
  serviceId: string;
  domain = constants.DOMAIN_URL;
  page: number = 1;
  user: User;
  showNumber: boolean = false;
  currentPhotoIndex: number = 1;
  private destroy$ = new Subject<void>();

  constructor(private serviceService: ServiceService, private route: ActivatedRoute, private popoverController: PopoverController,
              private toastService: ToastService, private alertCtrl: AlertController,
              private router: Router, private nativeStorage: NativeStorage, private callNumber: CallNumber,
              private platform: Platform, private changeDetectorRef: ChangeDetectorRef, private oneSignalService: OneSignalService,
              private modalCtrl: ModalController, private userService: UserService) { }

  ngOnInit() {
    this.userService.currentUser.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user) {
        this.user = user;
        this.changeDetectorRef.detectChanges();
        console.log('User updated in ServiceComponent:', this.user);
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillEnter(){
    this.getServiceId();
  }

  getServiceId(){
    this.route.paramMap
    .subscribe(
      params => {
        this.serviceId = params.get('id');
        this.getService();
      }
    )
  }

  getService(){
    this.pageLoading = true;
    this.serviceService.get(this.serviceId)
    .then(
      (resp: any) => {
        this.pageLoading = false;
        this.service = new Service(resp.data);
        this.currentPhotoIndex = 1;
        console.log("this.service this.service",this.service); // Check the format of the createdAt field

        this.page++;
        console.log(this.service);
      },
      err => {
        this.pageLoading = false;
        console.log(err);
        this.toastService.presentErrorToastr(err);
      }
    )
  }

  removeService(){
    this.serviceService.remove(this.service.id)
    .then(
      (resp: any) => {
        console.log(resp);
        this.toastService.presentSuccessToastr(resp.message);
        this.router.navigateByUrl('/tabs/small-business/services/list/posted')
      },
      err => {
        console.log(err);
        this.toastService.presentErrorToastr(err);
      }
    )
  }

  async removeConfirmation(){
    const alert = await this.alertCtrl.create({
      message: 'Do you really want to delete this service ?',
      header: 'Delete Service',
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Yes',
          cssClass: 'text-danger',
          handler: () => {
            this.removeService();
          }
        }
      ]
    });

    await alert.present();
  }

  async call(){
    const modal = await this.modalCtrl.create({
      component: ApplierDisclaimerComponent,
      cssClass: 'disclaimer-modal'
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    
    if (data === true) {
      this.showNumber = true;
      this.callNumber.callNumber(this.service.phone, true)
        .then(res => console.log('Launched dialer!', res))
        .catch(err => this.toastService.presentErrorToastr('Cannot make this call'));
    }
  }

  async presentPopover(ev: any) {
    const popoverItems = [
      {
        text: 'Report',
        icon: 'fas fa-exclamation-triangle',
        event: 'report'
      }
    ]
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
    if(data && data.event){
      if(data.event == 'report') this.reportService();
    }
  }

  async shareToFriends() {
    const modal = await this.modalCtrl.create({
      component: ShareFriendsModalComponent,
      componentProps: {
        service: this.service,
        authUser: this.user
      },
      cssClass: 'share-modal'
    });
    return await modal.present();
  }

  async openGallery(index: number) {
    const photos = this.service.photos && this.service.photos.length > 0 
      ? this.service.photos 
      : [this.service.photo];

    const modal = await this.modalCtrl.create({
      component: GalleryModalComponent,
      componentProps: {
        photos: photos,
        initialSlide: index
      },
      cssClass: 'gallery-modal'
    });
    return await modal.present();
  }

  async slideChanged() {
    const index = await this.slides.getActiveIndex();
    this.currentPhotoIndex = index + 1;
  }

  async reportService(){
    const modal = await this.modalCtrl.create({
      component: ReportModalComponent,
      componentProps: {
        targetName: this.service.title
      },
      cssClass: 'report-modal-class'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      this.serviceService.report(this.service.id, data)
      .then(
        (resp: any) => {
          this.toastService.presentSuccessToastr(resp.message || 'Report submitted successfully');
        },
        err => {
          this.toastService.presentErrorToastr(err || 'Error reporting service');
        }
      )
    }
  }

}
