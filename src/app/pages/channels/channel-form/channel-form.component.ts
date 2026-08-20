import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Camera } from '@ionic-native/camera/ngx';
import { UploadFileService } from './../../../services/upload-file.service';
import { ToastService } from './../../../services/toast.service';
import { ChannelService } from './../../../services/channel.service';
import { Router } from '@angular/router';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { Platform, ModalController } from '@ionic/angular';
import { TermsModalComponent } from './terms-modal.component';
import { ListSearchComponent } from '../../list-search/list-search.component';

@Component({
  selector: 'app-channel-form',
  templateUrl: './channel-form.component.html',
  styleUrls: ['./channel-form.component.scss'],
})
export class ChannelFormComponent implements OnInit {

  @ViewChild('fileInput', { static: false }) fileInput: ElementRef;
  termsAccepted = false;
  imageLoading = false;
  pageLoading = false;
  channelImage = {
    url: '',
    file: null,
    name: ''
  };
  validatorErrors = {};
  form: FormGroup;
  categories = [
    'News', 'Events', 'Dating', 'Arts', 'Watch', 'Found',
    'Sports', 'Food', 'Technology', 'Music', 'Gaming',
    'Health', 'Education', 'Business', 'Lifestyle',
    'Travel', 'Fashion', 'Science', 'Politics', 'Religion', 'Community',
    'Movies', 'Photography', 'Automotive', 'Finance', 'Environment',
    'Pets', 'DIY', 'History', 'Literature', 'Philosophy', 'Space',
    'Fitness', 'Parenting', 'Real Estate', 'Legal', 'Marketing',
    'Design', 'Architecture', 'Comedy', 'Spirituality', 'Crypto',
    'Startups', 'Mental Health', 'Gardening', 'Crafts', 'Volunteering',
    'Networking', 'Jobs', 'Outdoors', 'Self Improvement', 'Social Media',
    'Writing', 'Languages', 'Culture', 'Sci-Fi', 'Fantasy', 'Anime',
    'Collectibles', 'Cooking', 'Investing', 'Career', 'Mindfulness',
    'Yoga', 'Psychology', 'Astronomy', 'Sustainability', 'Aviation',
    'Military', 'Poetry', 'True Crime', 'Mystery', 'Horror', 'Romance',
    'Teaching', 'Family', 'Weddings', 'Backpacking', 'Camping', 'Hiking',
    'Digital Nomad', 'UI/UX', 'Interior Design', 'Veganism', 'Baking',
    'Wine', 'Beer', 'Coffee', 'Esports', 'Retro Gaming', 'Tabletop',
    'Chess', 'Poker', 'Memes', 'Astrology', 'Tarot', 'Human Rights',
    'Charity', 'Local News', 'SEO', 'Sales', 'Leadership', 'Agile',
    'AI', 'Robotics', 'IoT', 'Cybersecurity', 'Blockchain', 'NFTs',
    'Metaverse', 'VR/AR', 'Quantum', 'Biotech', 'Clean Tech', 'FinTech',
    'AgTech', 'Logistics', 'Manufacturing', 'Construction', 'Energy',
    'Insurance', 'Genealogy', 'Museums', 'Theater', 'Dance', 'Opera',
    'Classical', 'Jazz', 'Rock', 'Pop', 'Hip Hop', 'Electronic',
    'DJing', 'Animation', 'VFX', 'Screenwriting', 'Acting', 'Reality TV',
    'Podcasts', 'Audiobooks', 'Blogging', 'Vlogging', 'Public Speaking',
    'Conferences', 'Festivals', 'Exhibitions', 'Workshops', 'Webinars',
    'Meetups', 'Parties', 'Holidays', 'Seasons', 'Weather', 'Wildlife',
    'Conservation', 'Recycling', 'Zero Waste', 'Animal Rights', 'Dogs',
    'Cats', 'Birds', 'Fish', 'Reptiles', 'Horses', 'Livestock',
    'Veterinary', 'Plants', 'Flowers', 'Trees', 'Landscaping',
    'Permaculture', 'Agriculture', 'Nutrition', 'Dieting', 'Healthy Eating',
    'Gourmet', 'Street Food', 'Fast Food', 'Beverages', 'Spirits',
    'Cocktails', 'Tea', 'Juice', 'Water', 'Restaurants', 'Cafes',
    'Bars', 'Pubs', 'Clubs', 'Tourism', 'Destinations', 'Adventure',
    'Luxury', 'Budget', 'Solo', 'Family', 'Business Travel', 'Flights',
    'Trains', 'Road Trips', 'Hotels', 'Resorts', 'Vacation Rentals',
    'Expat', 'Heritage', 'Customs', 'Etiquette', 'Morality', 'Values',
    'Beliefs', 'Faith', 'Self-Help', 'Motivation', 'Inspiration',
    'Success', 'Happiness', 'Well-being', 'Mathematics', 'Engineering',
    'Medicine', 'Universe', 'Future', 'Confessions', 'Rants',
    'Compliments', 'Recommendations', 'Requests', 'Offers', 'Trading',
    'Free Stuff', 'Giveaways', 'Contests', 'Challenges', 'Projects',
    'Collaborations', 'Support', 'Help', 'Feedback', 'Ideas',
    'Creativity', 'Discovery', 'Transformation', 'Impact', 'Purpose',
    'Meaning', 'Connection', 'Belonging', 'Identity', 'Diversity',
    'Inclusion', 'Equality', 'Justice', 'Freedom', 'Peace', 'Love',
    'Kindness', 'Compassion', 'Empathy', 'Gratitude', 'Hope', 'Resilience',
    'Courage', 'Strength', 'Wisdom', 'Truth', 'Beauty', 'Wonder',
    'Awe', 'Joy', 'Laughter', 'Fun', 'Play', 'Exploration', 'Curiosity',
    'Imagination', 'Dreams', 'Vision', 'Legacy', 'Life', 'Death',
    'Existence', 'Reality', 'Consciousness', 'Spirit', 'Soul', 'God',
    'Other'
  ];
  showOtherCategory = false;

  get name() {
    return this.form.get('name');
  }

  get description() {
    return this.form.get('description');
  }

  get category() {
    return this.form.get('category');
  }

  get otherCategory() {
    return this.form.get('otherCategory');
  }

  get canCreateChannel(): boolean {
    if (!this.form) return false;
    const hasRequiredFields = !!(
      this.name && this.name.valid && this.name.value &&
      this.description && this.description.valid && this.description.value &&
      this.category && this.category.valid && this.category.value
    );
    const hasOtherCategory = this.category && this.category.value === 'Other'
      ? !!(this.otherCategory && String(this.otherCategory.value || '').trim())
      : true;
    return hasRequiredFields && hasOtherCategory && this.termsAccepted && !!this.channelImage.file;
  }

  constructor(
    private camera: Camera,
    private formBuilder: FormBuilder,
    private uploadFile: UploadFileService,
    private toastService: ToastService,
    private webView: WebView,
    private channelService: ChannelService,
    private router: Router,
    private platform: Platform,
    private modalController: ModalController
  ) { }

  ngOnInit() {
    this.initializeForm();
  }

  initializeForm() {
    this.form = this.formBuilder.group({
      name: ['', [Validators.required, Validators.maxLength(50)]],
      description: ['', [Validators.required, Validators.maxLength(255)]],
      category: ['', [Validators.required]],
      otherCategory: ['']
    });
  }

  onCategoryChange(event: any) {
    const value = event && event.detail ? event.detail.value : event;
    this.setCategory(value);
  }

  private setCategory(value: any) {
    const selected = typeof value === 'string' ? value : (value && (value.name || value.label || value.title));
    if (!selected || !this.category) return;

    this.category.setValue(selected);
    this.category.markAsDirty();
    this.category.markAsTouched();
    this.showOtherCategory = selected === 'Other';

    if (!this.showOtherCategory && this.otherCategory) {
      this.otherCategory.setValue('');
    }
    this.form.updateValueAndValidity();
  }

  async openCategoryPicker() {
    const modal = await this.modalController.create({
      component: ListSearchComponent,
      componentProps: {
        data: this.categories,
        title: 'Choose Category',
        multiSelect: false
      },
      cssClass: 'channel-category-modal',
      mode: 'ios'
    });

    await modal.present();
    const result = await modal.onDidDismiss();
    if (result && result.data) {
      this.setCategory(result.data);
    }
  }

  async presentTermsModal() {
    const modal = await this.modalController.create({
      component: TermsModalComponent,
      cssClass: 'channel-terms-modal',
      mode: 'ios'
    });

    await modal.present();
    const result = await modal.onDidDismiss();
    this.termsAccepted = !!(result && result.data && result.data.accepted);
  }

  pickImage() {
    if (this.platform.is('cordova')) {
      this.imageLoading = true;
      this.uploadFile.takePicture(this.camera.PictureSourceType.PHOTOLIBRARY)
        .then((resp: any) => {
          this.imageLoading = false;
          if (!resp?.file) {
            this.toastService.presentErrorToastr('Could not read the selected image. Please try again.');
            return;
          }
          const imageUrl = this.webView.convertFileSrc(resp.imageData);
          this.channelImage = {
            url: imageUrl,
            file: resp.file,
            name: resp.name
          };
        })
        .catch(err => {
          this.imageLoading = false;
          this.toastService.presentErrorToastr(err);
        });
    } else {
      this.fileInput.nativeElement.click();
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.imageLoading = true;
      const reader = new FileReader();
      reader.onload = () => {
        this.channelImage = {
          url: reader.result as string,
          file,
          name: file.name
        };
        this.imageLoading = false;
      };
      reader.readAsDataURL(file);
    }
  }

  getProductForm() {
    const form: FormData = new FormData();
    form.append('name', this.name.value);
    form.append('description', this.description.value);

    let categoryValue = this.category.value;
    if (categoryValue === 'Other' && this.otherCategory.value) {
      categoryValue = this.otherCategory.value;
    }
    form.append('category', categoryValue);

    form.append('photo', this.channelImage.file, this.channelImage.name);
    form.append('image', this.channelImage.file, this.channelImage.name);
    form.append('type', 'user');

    if (this.termsAccepted) {
      form.append('acceptedTerms', 'true');
    }

    return form;
  }

  clearProductForm() {
    this.form.patchValue({
      name: '',
      description: '',
      category: '',
      otherCategory: ''
    });
    this.showOtherCategory = false;
    this.channelImage = {
      url: '',
      file: null,
      name: ''
    };
    this.termsAccepted = false;
  }

  submit() {
    if (!this.canCreateChannel) {
      this.toastService.presentErrorToastr('Add a cover, complete the required details, and accept the terms');
      return;
    }

    this.validatorErrors = {};
    this.pageLoading = true;
    this.channelService.store(this.getProductForm())
      .then(
        (resp: any) => {
          this.pageLoading = false;
          console.log('Channel creation response:', resp);
          this.toastService.presentSuccessToastr(resp.message || 'Channel created successfully');
          this.router.navigateByUrl('/tabs/channels');
          this.clearProductForm();
        },
        err => {
          this.pageLoading = false;
          if (err.errors) {
            this.validatorErrors = err.errors;
          }
          if (typeof err === 'string') {
            this.toastService.presentErrorToastr(err);
          }
          console.log(err);
        }
      );
  }
}
