import { devLogger } from "../../../utils/dev-logger";
import { User } from './../../../models/User';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import constants from 'src/app/helpers/constants';
import { ToastService } from './../../../services/toast.service';
import { ProductService } from './../../../services/product.service';
import { UserService } from './../../../services/user.service'; // Import UserService
import { Product } from './../../../models/Product';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertController, PopoverController, ModalController } from '@ionic/angular';
import { DropDownComponent } from '../../drop-down/drop-down.component';
import { ReportModalComponent } from 'src/app/components/report-modal/report-modal.component';
import { BuyerDisclaimerComponent } from './buyer-disclaimer.component';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-product',
  templateUrl: './product.component.html',
  styleUrls: ['./product.component.scss'],
})
export class ProductComponent implements OnInit, OnDestroy {

  pageLoading = false;
  product: Product;
  productId: string;
  domain = constants.DOMAIN_URL;
  page: number = 1;
  user: User;
  isSeller: boolean = false;
  isBuyer: boolean = false;
  poster: User; // Add poster variable
  private destroy$ = new Subject<void>();

  constructor(
    private productService: ProductService, 
    private userService: UserService, // Inject UserService
    private route: ActivatedRoute, 
    private popoverController: PopoverController,
    private toastService: ToastService, 
    private alertCtrl: AlertController, 
    private router: Router,
    private nativeStorage: NativeStorage,
    private modalController: ModalController
  ) { }

  ngOnInit() {
    this.userService.currentUser.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user) {
        this.user = user;
        devLogger.log('User updated in ProductComponent:', this.user);
        if (this.productId) {
          this.getProduct();
        }
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ionViewWillEnter() {
    this.getProductId();
  }

  getProductId() {
    this.route.paramMap.subscribe(params => {
      this.productId = params.get('id');
    });
  }

  getProduct(event?) {
    if (!event) this.pageLoading = true;
    this.productService.get(this.productId).then(
      (resp: any) => {
        devLogger.log("resp for get prod.........!", resp);
        this.pageLoading = false;
        this.product = new Product(resp.data);
        this.product.photos = this.product.photos.map(photo => ({
          ...photo,
          url: `http://127.0.0.1:3300/public${photo.path}` // Construct the full URL for each photo
        }));
        devLogger.log(this.product);
        this.page++;
        this.checkIfSellerOrBuyer();
        this.getPosterDetails(); // Fetch poster details
        if (event) event.target.complete();
      },
      err => {
        this.pageLoading = false;
        devLogger.log(err);
        if (event) event.target.complete();
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  getPosterDetails() {
    const userId = typeof this.product.user === 'string' ? this.product.user : this.product.user._id;
    this.userService.getUserProfile(userId).subscribe(
      (user: User) => {
        this.poster = user;
        devLogger.log("nammmmmmmmmmmmm",this.poster);
      },
      err => {
        devLogger.log('Error fetching poster details:', err);
      }
    );
}


  checkIfSellerOrBuyer() {
    if (this.user && this.product && this.product.user && this.user._id) {
      const userId = this.user._id.toString();
      const productUserId = typeof this.product.user === 'string' ? this.product.user : this.product.user._id.toString();
      devLogger.log("User ID:", userId);
      devLogger.log("Product User ID:", productUserId);
      this.isSeller = userId === productUserId;
      this.isBuyer = userId !== productUserId;
      devLogger.log("isSeller:", this.isSeller);
      devLogger.log("isBuyer:", this.isBuyer);
    }
  }

  removeProduct() {
    this.productService.remove(this.product.id).then(
      (resp: any) => {
        devLogger.log(resp);
        this.toastService.presentSuccessToastr(resp.message);
        this.router.navigateByUrl('/tabs/buy-and-sell/products/sell');
      },
      err => {
        devLogger.log(err);
        this.toastService.presentErrorToastr(err);
      }
    );
  }

  async removeConfirmation() {
    const alert = await this.alertCtrl.create({
      message: 'Do you really want to delete this product?',
      header: 'Delete Product',
      buttons: [
        {
          text: 'No',
          role: 'cancel'
        },
        {
          text: 'Yes',
          cssClass: 'text-danger',
          handler: () => {
            this.removeProduct();
          }
        }
      ]
    });

    await alert.present();
  }

  markAsSold() {
    this.pageLoading = true;
    this.productService.sold(this.product.id).then(
      (resp: any) => {
        this.toastService.presentSuccessToastr(resp.message);
        this.product.sold = true;
        this.pageLoading = false;
      },
      err => {
        this.toastService.presentErrorToastr(err);
        this.pageLoading = false;
      }
    );
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
      if (data.event == 'report') this.reportProduct();
    }
  }

  async reportProduct() {
    const modal = await this.modalController.create({
      component: ReportModalComponent,
      componentProps: {
        targetName: this.product.label
      },
      cssClass: 'report-modal-class'
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      this.productService.report(this.product.id, data).then(
        (resp: any) => {
          this.toastService.presentSuccessToastr(resp.message || 'Report submitted successfully');
        },
        err => {
          this.toastService.presentErrorToastr(err || 'Error reporting product');
        }
      );
    }
  }

  goToPosterProfile() {
    if (this.poster) {
      this.router.navigate(['/tabs/profile/display/'+ this.poster._id]);
    }
  }

  async contactSeller() {
    const modal = await this.modalController.create({
      component: BuyerDisclaimerComponent,
      cssClass: 'disclaimer-modal'
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data === true) {
      this.router.navigate(['/messages/chat/', this.product.user], {
        queryParams: { productId: this.product.id }
      });
    }
  }

  buyNow() {
    this.contactSeller();
  }

  editProduct() {
    this.router.navigate(['/tabs/buy-and-sell/product/form', { id: this.product.id }]);
  }
  
}
