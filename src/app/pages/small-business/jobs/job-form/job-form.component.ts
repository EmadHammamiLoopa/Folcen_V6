import { JobService } from './../../../../services/job.service';
import { Router } from '@angular/router';
import { ToastService } from './../../../../services/toast.service';
import { WebView } from '@ionic-native/ionic-webview/ngx';
import { UploadFileService } from './../../../../services/upload-file.service';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Camera } from '@ionic-native/camera/ngx';
import { Component, OnInit } from '@angular/core';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { ModalController, Platform } from '@ionic/angular';
import { ListSearchComponent } from 'src/app/pages/list-search/list-search.component';
import { AdMobFeeService } from './../../../../services/admobfree.service';
import { JsonService } from 'src/app/services/json.service';
import { JobPublisherDisclaimerComponent } from './job-publisher-disclaimer.component';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-job-form',
  templateUrl: './job-form.component.html',
  styleUrls: ['./job-form.component.scss'],
})
export class JobFormComponent implements OnInit {

  countriesObject = {};
  countries: string[] = [];
  cities: string[] = [];
  selectedCountry: string;
  selectedCity: string;

  jobTypes = ['Full-time', 'Part-time', 'Contract', 'Internship'];
  experienceLevels = ['Entry-level', 'Mid-level', 'Senior'];
  remoteOptions = ['Remote', 'Onsite', 'Hybrid'];
  salaryRange: { lower: number; upper: number } = { lower: 1000, upper: 1000000 }; // Default values

  pageLoading = false;
  jobImages: any[] = [];
  validatorErrors = {};
  form: FormGroup;
  imageLoading = false;
  jobId: string = null;

  minDate: string;
  maxDate: string;

  get title() {
    return this.form.get('title');
  }

  get company() {
    return this.form.get('company');
  }

  get email() {
    return this.form.get('email');
  }

  get description() {
    return this.form.get('description');
  }

  get jobType() {
    return this.form.get('jobType');
  }


  get minSalary() {
    return this.form.get('minSalary');
  }
  
  get maxSalary() {
    return this.form.get('maxSalary');
  }
  
  get experienceLevel() {
    return this.form.get('experienceLevel');
  }

  get jobCategory() {
    return this.form.get('jobCategory');
  }

  get remoteOption() {
    return this.form.get('remoteOption');
  }

  get applicationDeadline() {
    return this.form.get('applicationDeadline');
  }

  get jobRequirements() {
    return this.form.get('jobRequirements');
  }

  get jobBenefits() {
    return this.form.get('jobBenefits');
  }

  get educationLevel() {
    return this.form.get('educationLevel');
  }

  get industry() {
    return this.form.get('industry');
  }

  get website() {
    return this.form.get('website');
  }

  get jobLocationType() {
    return this.form.get('jobLocationType');
  }

  get address() {
    return this.form.get('address');
  }

  get skills() {
    return this.form.get('skills');
  }

  get workingHours() {
    return this.form.get('workingHours');
  }


  
  constructor(
    private camera: Camera,
    private formBuilder: FormBuilder,
    private uploadFile: UploadFileService,
    private nativeStorage: NativeStorage,
    private toastService: ToastService,
    private webView: WebView,
    private jobService: JobService,
    private router: Router,
    private modalController: ModalController,
    private adMobFeeService: AdMobFeeService,
    private platform: Platform,
    private jsonService: JsonService,
    private sanitizer: DomSanitizer
  ) { }

  ngOnInit() {
    this.pageLoading = true; // Start loading

    this.initializeForm();
    this.fetchCountriesAndCities(); // Fetch country and city data
    this.setMinAndMaxDates(); // Set min and max dates based on the createdAt time
    setTimeout(() => {
      this.pageLoading = false; // Set to false when page is fully loaded
    }, 1000); // Change the timeout to real loading logic
  }

  ionViewWillEnter() {
    // Re-initialize form data if needed
  }

  initializeForm() {
    this.form = this.formBuilder.group({
      title: ['', [Validators.required, Validators.maxLength(50)]],
      description: ['', [Validators.required, Validators.maxLength(255)]],
      company: ['', [Validators.required, Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(50)]],
      jobType: ['', [Validators.required]],
      minSalary: [this.salaryRange.lower, [Validators.required, Validators.min(1000)]], // Add Validators.required
      maxSalary: [this.salaryRange.upper, [Validators.required, Validators.max(1000000)]], // Add Validators.required
   
      
      address: ['', [Validators.required]],   
      experienceLevel: ['', [Validators.required]],
      jobCategory: ['', [Validators.required]],
      remoteOption: ['', [Validators.required]],
      applicationDeadline: [''],
      jobRequirements: ['', [Validators.required, Validators.maxLength(500)]],
      jobBenefits: [''],
      educationLevel: ['', [Validators.required]],
      industry: [''],
      website: [''],
      jobLocationType: ['', [Validators.required]],
      skills: [''],
      workingHours: [''],
    });
  
    console.log('Min Salary:', parseFloat(this.form.get('minSalary').value));
    console.log('Max Salary:', parseFloat(this.form.get('maxSalary').value));
    
    this.platform.ready().then(() => {
      if (this.platform.is('cordova')) {
        this.nativeStorage.getItem('job-data').then(
          data => {
            this.form.patchValue(data);
          },
          error => {
            console.error('Error getting job data from NativeStorage', error);
          }
        );
      } else {
        console.warn('Cordova not available - using localStorage as fallback');
        const data = JSON.parse(localStorage.getItem('job-data'));
        if (data) {
          this.form.patchValue(data);
        }
      }
    });
  }

  updateSalaryRange(event: any) {
    const { lower, upper } = event.detail.value;
    this.form.patchValue({
      minSalary: lower,
      maxSalary: upper,
    });
    console.log('Updated minSalary:', this.form.get('minSalary').value);
    console.log('Updated maxSalary:', this.form.get('maxSalary').value);
  }
  
  

  fetchCountriesAndCities() {
    this.platform.ready().then(() => {
      if (this.platform.is('cordova')) {
        this.nativeStorage.getItem('countries').then(
          data => {
            this.processCountryData(JSON.parse(data));
          },
          error => {
            console.error('Error getting countries data from NativeStorage', error);
            this.fetchFromLocalStorage();
          }
        );
      } else {
        this.fetchFromLocalStorage();
      }
    });
  }
  
  setMinAndMaxDates() {
    const createdAt = new Date(); // Assuming createdAt is the current date
    
    // Set tomorrow as the minimum date
    const tomorrow = new Date(createdAt);
    tomorrow.setDate(createdAt.getDate() + 1);
    this.minDate = tomorrow.toISOString().split('T')[0]; // Tomorrow's date as min
    
    // Set max date to one year from today
    const nextYear = new Date(createdAt);
    nextYear.setFullYear(createdAt.getFullYear() + 1); // One year from today
    this.maxDate = nextYear.toISOString().split('T')[0]; // One year later
  }

  fetchFromLocalStorage() {
    const data = JSON.parse(localStorage.getItem('countries'));
    if (data) {
      this.processCountryData(data);
    } else {
      this.fetchFromJsonService();
    }
  }

  async fetchFromJsonService() {
    try {
      const data = await this.jsonService.getCountries();
      this.processCountryData(data);
      this.nativeStorage.setItem('countries', JSON.stringify(data)).catch((error) => {
        console.warn('NativeStorage not available, using localStorage fallback', error);
        localStorage.setItem('countries', JSON.stringify(data));
      });
    } catch (err) {
      console.error('Failed to load countries from JsonService:', err);
      this.toastService.presentErrorToastr('Error fetching countries and cities.');
    }
  }

  processCountryData(data) {
    if (Array.isArray(data)) {
      this.countries = data;
    } else {
      this.countriesObject = data;
      this.countries = Object.keys(this.countriesObject);
    }
  }

  saveData() {
    const formData = this.form.value;
    if (this.platform.is('cordova')) {
      this.nativeStorage.setItem('job-data', formData).then(
        () => console.log('Data saved to NativeStorage'),
        error => console.error('Error saving data to NativeStorage', error)
      );
    } else {
      console.warn('Cordova not available - using localStorage as fallback');
      localStorage.setItem('job-data', JSON.stringify(formData));
    }
  }

  pickImage() {
    this.imageLoading = true;
    
    if (!this.platform.is('cordova')) {
      // Browser fallback
      this.uploadFile.getFileFromBrowser()
        .then((file: any) => {
          this.imageLoading = false;
          const img = {
            url: this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(file)) as string,
            file: file,
            name: file.name
          };
          this.jobImages.push(img);
        })
        .catch(err => {
          this.imageLoading = false;
          console.error(err);
        });
    } else {
      this.uploadFile.takePicture(this.camera.PictureSourceType.PHOTOLIBRARY)
        .then(
          (resp: any) => {
            this.imageLoading = false;
            let imageUrl = resp.imageData;
            if (this.webView && this.webView.convertFileSrc) {
              imageUrl = this.webView.convertFileSrc(resp.imageData);
            }
            const img = {
              url: this.sanitizer.bypassSecurityTrustUrl(imageUrl) as string,
              file: resp.file,
              name: resp.name
            };
            this.jobImages.push(img);
          },
          err => {
            this.imageLoading = false;
            this.toastService.presentErrorToastr(err);
          }
        );
    }
  }

  removeImage(index: number) {
    this.jobImages.splice(index, 1);
  }

  getJobForm() {
    const form: FormData = new FormData();
    form.append('title', this.title.value);
    form.append('company', this.company.value);
    form.append('email', this.email.value);
    form.append('country', this.selectedCountry);
    form.append('city', this.selectedCity);
    form.append('address', this.address.value); // Use .value to get the address value
    form.append('description', this.description.value);
    form.append('jobType', this.jobType.value);
    form.append('minSalary',this.minSalary.value);
    form.append('maxSalary', this.maxSalary.value);
    
    form.append('experienceLevel', this.experienceLevel.value);
    form.append('jobCategory', this.jobCategory.value);
    form.append('remoteOption', this.remoteOption.value);
    form.append('applicationDeadline', this.applicationDeadline.value);
    form.append('jobRequirements', this.jobRequirements.value);
    form.append('jobBenefits', this.jobBenefits.value);
    form.append('educationLevel', this.educationLevel.value);
    form.append('industry', this.industry.value);
    form.append('website', this.website.value);
    form.append('jobLocationType', this.jobLocationType.value);
    form.append('skills', this.skills.value);
    form.append('workingHours', this.workingHours.value);
    
    // Append all photos
    this.jobImages.forEach((img, index) => {
      if (img.file) {
        form.append('photos', img.file, img.name);
      }
    });

    // Fallback for single photo if backend expects 'photo'
    if (this.jobImages.length > 0) {
      form.append('photo', this.jobImages[0].file, this.jobImages[0].name);
    }

    return form;
  }

  clearJobForm() {
    this.form.patchValue({
      title: '',
      description: '',
      company: '',
      email: '',
      skills: '',
      workingHours: ''
    });
    this.jobImages = [];
  }

  submit() {
    if (this.form.invalid) {
      this.toastService.presentErrorToastr('Please fill all required fields correctly.');
      return;
    }

    if (this.jobImages.length === 0) {
      this.toastService.presentErrorToastr('Please select at least one image for the job');
      return;
    }

    this.showPublisherDisclaimer();
  }

  async showPublisherDisclaimer() {
    const modal = await this.modalController.create({
      component: JobPublisherDisclaimerComponent,
      cssClass: 'disclaimer-modal'
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data === true) {
      this.executeSubmit();
    }
  }

  executeSubmit() {
    // Additional validation for minSalary and maxSalary
    const minSalary = parseFloat(this.minSalary.value);
    const maxSalary = parseFloat(this.maxSalary.value);
  
    if (isNaN(minSalary) || isNaN(maxSalary)) {
      this.toastService.presentErrorToastr('Please enter valid salary values.');
      return;
    }
  
    // Proceed with submission if validations pass
    this.validatorErrors = {};
    this.pageLoading = true;
  
    this.jobService.store(this.getJobForm())
      .then(resp => {
        this.pageLoading = false;
        this.toastService.presentSuccessToastr('Job created successfully');
        this.router.navigateByUrl('/tabs/small-business/jobs');
        this.clearJobForm();
      })
      .catch(err => {
        this.pageLoading = false;
        console.error('Error creating job', err);
        if (err.errors) {
          this.validatorErrors = err.errors;
        }
        if (typeof err === 'string') {
          this.toastService.presentErrorToastr(err);
        }
      });
  }
  

  async presentCountriesModal() {
    const result = await this.presentSearchListModal(this.countries, 'Countries');
    if (result) {
      this.selectedCountry = result;
      this.cities = this.countriesObject[this.selectedCountry];
    }
  }

  async presentCitiesModal() {
    const result = await this.presentSearchListModal(this.cities, 'Cities');
    if (result) {
      this.selectedCity = result;
    }
  }

  async presentSearchListModal(list: any, title: string) {
    const modal = await this.modalController.create({
      componentProps: {
        data: list,
        title
      },
      component: ListSearchComponent
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    return data; // Make sure data is directly returned
  }

  isFormValid(form: FormGroup) {
    return !form.valid || !this.selectedCountry || !this.selectedCity;
  }
}
