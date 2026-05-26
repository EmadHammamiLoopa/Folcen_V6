import { devLogger } from "../../../utils/dev-logger";
import { ListSearchComponent } from './../../list-search/list-search.component';
import { AuthService } from './../../../services/auth.service';
import { Router } from '@angular/router';
import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertController, ModalController, PickerController, Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { TermsOfServiceComponent } from '../../terms-of-service/terms-of-service.component';
import { PrivacyPolicyComponent } from '../../privacy-policy/privacy-policy.component';
import { JsonService } from '../../../services/json.service';
import { SchoolService } from '../../profile/form/school.service';
import { ToastService } from '../../../services/toast.service';
import { UserService } from '../../../services/user.service';
import { User } from '../../../models/User';
import { SocketService } from '../../../services/socket.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
})
export class SignupComponent implements OnInit, OnDestroy {

  gender = "prefer not to say";
  step = 0;
  steps = ['email', 'name', 'password', 'birthDate', 'gender', 'location', 'school', 'education', 'profession', 'interests', 'languages', 'aboutMe',
    // 'randomRequests', // TODO v2: re-enable when random feature is activated
    'ageVisibility', 'verifyEmail', 'success'];
  // Steps that render a step-icon illustration — logo is hidden on these
  // 'randomRequests' excluded here until random feature is re-enabled in v2
  stepsWithIllustration = new Set(['email', 'name', 'password', 'birthDate', /* 'randomRequests', */ 'ageVisibility', 'verifyEmail']);
  isSubmitted = false;
  validationErrors: any = {};
  btnLoading = false;
  pageLoading = false;
  birthDateDisplay = '';
  adjustingEmail = false;
  resendCooldown = 0;
  resendInterval: any;
  form!: FormGroup;

  countriesObject: any;
  countries: string[] = [];
  cities: string[] = [];
  selectedCountry: string = '';
  selectedCity: string = '';
  selectedInterests: string[] = [];
  selectedLanguages: string[] = [];
  studyCountries: string[] = [];
  selectedStudyCountry: string = '';
  isLoadingSchools = false;
  
  
  schools: string[] = [];
  educations: string[] = [];
  professions: string[] = [];
  interests: string[] = [];
  languages: string[] = [
    'English', 'French', 'Spanish', 'German', 'Arabic', 'Chinese', 'Japanese', 
    'Russian', 'Portuguese', 'Italian', 'Turkish', 'Hindi', 'Dutch',
    'Norwegian', 'Swedish', 'Danish', 'Finnish', 'Icelandic',
    'Polish', 'Ukrainian', 'Romanian', 'Greek', 'Czech', 'Hungarian',
    'Bulgarian', 'Slovak', 'Croatian', 'Lithuanian', 'Slovenian', 'Latvian', 'Estonian',
    'Irish', 'Maltese', 'Korean', 'Vietnamese', 'Thai', 'Indonesian', 'Malay', 'Persian'
  ];

  constructor(
    private router: Router,
    private auth: AuthService,
    private formBuilder: FormBuilder,
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private cdr: ChangeDetectorRef,
    private modalController: ModalController,
    private nativeStorage: NativeStorage,
    private jsonService: JsonService,
    private schoolService: SchoolService,
    private toastService: ToastService,
    private userService: UserService,
    private platform: Platform,
    private pickerCtrl: PickerController
  ) { }

  ionViewWillEnter() {
    this.step = 0;
    
    // Check if we have a logged-in but unverified user
    const user = this.userService.currentUserValue;
    if (user && user.emailVerified === false) {
      devLogger.log('SignupComponent: Unverified user detected, jumping to verifyEmail step');
      const verifyStepIndex = this.steps.indexOf('verifyEmail');
      if (verifyStepIndex !== -1) {
        this.step = verifyStepIndex;
        // Ensure the email is shown in the template
        if (user.email) {
          this.form.patchValue({ email: user.email });
        }
        this.toastService.presentErrorToastr('Your email address is not verified. Please check your inbox and click the verification link to access the app.');
      }
    }
  }

  ngOnInit() {
    this.initializeForm();
    this.loadCountries();
    this.loadEducations();
    this.loadProfessions();
    this.loadInterests();
  }

  ngOnDestroy() {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }

  initializeForm() {
    this.form = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email, Validators.maxLength(50)]],
      password: ['', [
        Validators.required, 
        Validators.minLength(8),
        Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/)
      ]],
      password_confirmation: ['', [Validators.required, Validators.minLength(8)]],
      firstName: ['', [Validators.required, Validators.pattern('[a-zA-Z-_]+'), Validators.maxLength(40)]], // Correct initialization
      lastName: ['', [Validators.required, Validators.pattern('[a-zA-Z-_]+'), Validators.maxLength(40)]], // Correct initialization
      birthDate: ['', [Validators.required]],
      receiveRandomRequests: [false],
      showAge: [true],
      genderVisible: [true],
      gender: ['prefer not to say', [Validators.required]],
      studyCountry: [''],       
      school: [''],
      education: [''],
      profession: [''],
      interests: [''],
      languages: [''],
      aboutMe: [''],
      acceptedTerms: [false, [Validators.requiredTrue]]
    });
  }
  



  addInterests(interests: any) {
    if (Array.isArray(interests)) {
      this.selectedInterests = interests;
    }
  }

  removeInterest(index: number) {
    this.selectedInterests.splice(index, 1);
  }

  addLanguages(languages: any) {
    if (Array.isArray(languages)) {
      this.selectedLanguages = languages;
    }
  }

  removeLanguage(index: number) {
    this.selectedLanguages.splice(index, 1);
  }

  async presentLanguagesModal() {
    const modal = await this.modalController.create({
      component: ListSearchComponent,
      componentProps: {
        data: this.languages,
        title: 'Languages',
        multiSelect: true
      }
    });

    modal.onDidDismiss().then((result) => {
      if (result.data) {
        this.addLanguages(result.data);
      }
    });

    await modal.present();
  }

  googleSignUp() {
    devLogger.log('Google sign-up triggered.');
  }

  async loadCountries() {
    const data = await this.jsonService.getCountries();
    // countries.json is an object { "Country": ["City1", "City2"] }
    // JsonService.getJsonOnce wraps it in an array if it's not an array.
    if (Array.isArray(data) && data.length === 1 && !Array.isArray(data[0]) && typeof data[0] === 'object') {
      this.countriesObject = data[0];
    } else {
      this.countriesObject = data;
    }
    this.countries = Object.keys(this.countriesObject || {});
    this.studyCountries = this.countries;
  }

  async loadEducations() {
    this.educations = await this.jsonService.getEducations();
  }

  async loadProfessions() {
    this.professions = await this.jsonService.getProfessions();
  }

  async loadInterests() {
    this.interests = await this.jsonService.getInterests();
  }

  continue() {
    this.isSubmitted = true;
    devLogger.log('Continue clicked. Current step:', this.steps[this.step]);
    
    if (!this.isValid()) {
      devLogger.log('Validation failed for step:', this.steps[this.step]);
      return;
    }

    const currentStep = this.steps[this.step];

    if (currentStep === 'email') {
      this.verifyEmail();
    } else if (currentStep === 'ageVisibility') {
      devLogger.log('Calling submit() from ageVisibility step');
      this.submit();
    } else if (currentStep === 'verifyEmail') {
      this.checkVerification();
    } else if (this.step < this.steps.length - 1) {
      this.validationErrors[currentStep] = undefined;
      this.isSubmitted = false;
      this.step++;
    }
  }

  back() {
    this.isSubmitted = false;
    if (this.step > 0) this.step--;
    else this.router.navigate(['/auth/home']);
  }

  adjustEmail() {
    this.step = 0;
    this.adjustingEmail = true;
    this.isSubmitted = false;
    this.cdr.detectChanges();
  }

  getUserInfo() {
    return {
      firstName: this.form.get('firstName')?.value,
      lastName: this.form.get('lastName')?.value,
      email: this.form.get('email')?.value,
      password: this.form.get('password')?.value,
      password_confirmation: this.form.get('password_confirmation')?.value,
      city: this.selectedCity,
      country: this.selectedCountry,
      gender: this.gender,
      birthDate: this.form.get('birthDate')?.value,
      receiveRandomRequests: this.form.get('receiveRandomRequests')?.value,
      ageVisible: this.form.get('showAge')?.value,
      genderVisible: this.form.get('genderVisible')?.value,
      school: String(this.form.get('school')?.value || ''), // Ensure it's a string
      education: String(this.form.get('education')?.value || ''), // Ensure it's a string
      profession: String(this.form.get('profession')?.value || ''), // Ensure it's a string
      interests: this.selectedInterests.map(s => s.trim()).filter(Boolean),
      languages: this.selectedLanguages.map(s => s.trim()).filter(Boolean),
      aboutMe: this.form.get('aboutMe')?.value,
      acceptedTerms: this.form.get('acceptedTerms')?.value
    };
  }
  

    // NEW: modal to pick country of study
    async presentStudyCountriesModal() {
      const modal = await this.modalController.create({
        component: ListSearchComponent,
        componentProps: { data: this.studyCountries, title: 'Country of Study' }
      });
      await modal.present();
      const { data } = await modal.onDidDismiss();
      if (data) {
        const country = typeof data === 'string' ? data : (data.name ?? '');
        if (country !== this.selectedStudyCountry) {
          this.selectedStudyCountry = country;
          this.form.get('studyCountry')?.setValue(country);
          this.form.get('school')?.reset('');    // clear previous choice
          this.schools = [];
          this.isLoadingSchools = true;
          this.schoolService.getUniversityNames(country).subscribe({
            next: names => { this.schools = names || []; this.isLoadingSchools = false; },
            error: (err) => { devLogger.error('Failed to load universities for', country, err); this.schools = []; this.isLoadingSchools = false; }
          });
        }
      }
    }
    
  
    // NEW: fetch school names for selected country
    loadSchoolsForCountry(country: string) {
      this.schoolService.getUniversityNames(country).subscribe((names: string[]) => {
        this.schools = names;
      });
    }
  
    // OPTIONAL: keep a guarded version if something else calls it
    async loadSchools() {
      if (!this.selectedStudyCountry) {
        this.schools = [];
        return;
      }
      this.loadSchoolsForCountry(this.selectedStudyCountry);
    }

  backToError() {
    for (let ind = 0; ind < this.steps.length; ++ind) {
      const step = this.steps[ind];
      if (this.validationErrors[step] || (step == 'name' && (this.validationErrors['firstName'] || this.validationErrors['lastName']))) {
        this.step = ind;
        break;
      }
    }
  }

  verifyEmail() {
    this.btnLoading = true;
    this.auth.verifyEmail(this.form.get('email')?.value)
      .then((resp: any) => {
        this.btnLoading = false;
        this.isSubmitted = false; // Reset submitted flag when moving to next step
        this.cdr.detectChanges();
        if (!resp.data) {
          if (this.adjustingEmail) {
            const ageStepIndex = this.steps.indexOf('ageVisibility');
            this.step = ageStepIndex !== -1 ? ageStepIndex : this.step + 1;
            this.adjustingEmail = false;
          } else {
            ++this.step;
          }
        }
        else this.validationErrors['email'] = ['this email is already exists'];
      }, err => {
        this.btnLoading = false;
        const errBody = err?.error;
        if (errBody?.errors && typeof errBody.errors === 'object') {
          this.validationErrors = errBody.errors;
        } else {
          // Surface a readable message — no raw JSON
          const message = errBody?.message
            || (typeof errBody?.errors === 'string' ? errBody.errors : null)
            || (typeof errBody === 'string' ? errBody : null)
            || err?.message
            || 'An unexpected error occurred.';
          this.toastService.presentErrorToastr(message);
        }
      });
  }

  async submit() {
    this.pageLoading = true;
    this.validationErrors = {};
    
    const userInfo = this.getUserInfo();
    const email = this.form.get('email')?.value;
    const password = this.form.get('password')?.value;

    try {
      const resp = await this.auth.firebaseSignup(email, password, userInfo);
      if (resp && resp.data && resp.data.token) {
        await this.storeUserData(resp.data.token, resp.data.user);
      }
      this.pageLoading = false;
      this.step++;
    } catch (err: any) {
      this.pageLoading = false;
      devLogger.error('Signup error:', err);

      // Email already in Firebase with a different password — real existing user.
      // Direct them to sign in; the "Forgot password?" flow there will clean up
      // any orphaned Firebase account if they are not in MongoDB.
      if (err && err.code === 'email-already-in-use') {
        const alert = await this.alertCtrl.create({
          header: 'Account Already Exists',
          message:
            'An account with this email already exists. ' +
            'Sign in with your password, or tap "Forgot password?" on the sign-in page to reset it.',
          buttons: [
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Sign In',
              handler: () => { this.router.navigate(['/auth/signin']); }
            }
          ]
        });
        await alert.present();
        return;
      }

      // Field-level validation errors from the backend
      if (err && err.errors && typeof err.errors === 'object') {
        this.validationErrors = err.errors;
        this.backToError();
      } else {
        this.toastService.presentErrorToastr(err?.message || 'An unexpected error occurred.');
      }
    }
  }

  async resendEmail() {
    if (this.resendCooldown > 0) return;
    
    this.btnLoading = true;
    try {
      await this.auth.resendVerification();
      this.toastService.presentSuccessToastr('Verification email resent!');
      
      // Start cooldown
      this.resendCooldown = 60;
      this.resendInterval = setInterval(() => {
        this.resendCooldown--;
        if (this.resendCooldown <= 0) {
          clearInterval(this.resendInterval);
        }
      }, 1000);

    } catch (err: any) {
      devLogger.error('Resend error:', err);
      if (err.code === 'auth/too-many-requests') {
        this.toastService.presentErrorToastr('Too many requests. Please wait a moment before trying again.');
        this.resendCooldown = 30; // Force a shorter cooldown
      } else {
        this.toastService.presentErrorToastr('Failed to resend email. ' + (err.message || ''));
      }
    } finally {
      this.btnLoading = false;
    }
  }

  async checkVerification() {
    this.btnLoading = true;
    try {
      const resp = await this.auth.checkVerification();
      if (resp && resp.data && resp.data.token) {
        // Success! User is verified and logged in.
        await this.storeUserData(resp.data.token, resp.data.user);
        
        // Initialize Socket
        try {
          await SocketService.initializeSocket();
          SocketService.bindToAuthUser();
        } catch (e) {}

        this.step++; // Go to success step
      } else {
        this.toastService.presentErrorToastr('Email not verified yet. Please check your inbox and click the link.');
      }
    } catch (err) {
      devLogger.error('Verification check error:', err);
      this.toastService.presentErrorToastr('Failed to check verification status.');
    } finally {
      this.btnLoading = false;
    }
  }

  private async storeUserData(token: string, user: any) {
    try {
      if (this.platform.is('cordova')) {
        await this.nativeStorage.setItem('token', token);
      } else {
        try { localStorage.setItem('token', token); } catch (e) {}
      }
    } catch (e) {}

    try {
      const userObj = new User().initialize(user);
      this.userService.setCurrentUser(userObj, { force: true });
    } catch (e) {
      const userData = JSON.stringify(user);
      try {
        if (this.platform.is('cordova')) {
          await this.nativeStorage.setItem('currentUser', userData);
        } else {
          localStorage.setItem('currentUser', userData);
        }
      } catch (e2) {}
    }
  }

  enterApp() {
    this.router.navigate(['/tabs/new-friends']);
  }

  isValid() {
    if (this.steps[this.step] == 'name') {
      return this.form.get('firstName')?.valid && this.form.get('lastName')?.valid;
    } else if (this.steps[this.step] == 'password') {
      return this.form.get('password')?.valid && this.form.get('password')?.value === this.form.get('password_confirmation')?.value;
    } else if (this.steps[this.step] == 'location') {
      return this.selectedCountry && this.selectedCity;
    } else if (this.steps[this.step] == 'randomRequests') {
      // TODO v2: re-enable when random feature is activated
      return true;
    } else if (this.steps[this.step] == 'ageVisibility') {
      // Last step before submit: require terms acceptance
      return this.form.get('acceptedTerms')?.value === true;
    } else if (this.steps[this.step] == 'verifyEmail') {
      return true;
    } else if (this.steps[this.step] != 'gender') {
      return this.form.get(this.steps[this.step])?.valid;
    }
    return true;
  }

  async presentCountriesModal() {
    const modal = await this.modalController.create({
      component: ListSearchComponent,
      componentProps: { data: this.countries, title: 'Countries' }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
  
    if (data !== undefined && data !== null) {
      const picked = typeof data === 'string' ? data : (data.name ?? '');
      const country = (picked || '').trim();  // normalize
  
      // Only update if changed
      if (country !== (this.selectedCountry || '')) {
        this.selectedCountry = country;
        this.cities = this.countriesObject[this.selectedCountry] || [];
        this.selectedCity = ''; // reset so City placeholder shows
      }
    }
  }
  
  

  async presentCitiesModal() {
    const modal = await this.modalController.create({
      component: ListSearchComponent,
      componentProps: {
        data: this.cities,
        title: 'Cities'
      }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data) {
      this.selectedCity = data;
    }
  }

  async presentSchoolsModal() {
    if (!this.selectedStudyCountry || this.isLoadingSchools || !this.schools.length) return;
  
    const modal = await this.modalController.create({
      component: ListSearchComponent,
      componentProps: { data: [...this.schools], title: 'Select University' } // pass a copy
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data) this.form.get('school')?.setValue(data);
  }

  async presentEducationsModal() {
    const modal = await this.modalController.create({
      component: ListSearchComponent,
      componentProps: {
        data: this.educations,
        title: 'Educations'
      }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data) {
      this.form.get('education')?.setValue(data);
    }
  }

  async presentProfessionsModal() {
    const modal = await this.modalController.create({
      component: ListSearchComponent,
      componentProps: {
        data: this.professions,
        title: 'Professions'
      }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data) {
      this.form.get('profession')?.setValue(data);
    }
  }

  async presentInterestsModal() {
    const modal = await this.modalController.create({
      component: ListSearchComponent,
      componentProps: {
        data: this.interests,
        title: 'Interests',
        multiSelect: true,
        maxSelection: 10
      }
    });

    modal.onDidDismiss().then((result) => {
      if (result.data) {
        this.addInterests(result.data);
      }
    });

    await modal.present();
  }

  getMaxDate() {
    const currDate = new Date();
    currDate.setFullYear(currDate.getFullYear() - 18);
    return currDate.toJSON().slice(0, 10);
  }

  async openBirthdayPicker() {
    const currentYear = new Date().getFullYear();
    const maxYear = currentYear - 18;
    const minYear = currentYear - 100;

    const months = [
      { text: 'January', value: '01' }, { text: 'February', value: '02' },
      { text: 'March', value: '03' }, { text: 'April', value: '04' },
      { text: 'May', value: '05' }, { text: 'June', value: '06' },
      { text: 'July', value: '07' }, { text: 'August', value: '08' },
      { text: 'September', value: '09' }, { text: 'October', value: '10' },
      { text: 'November', value: '11' }, { text: 'December', value: '12' }
    ];

    const days = Array.from({ length: 31 }, (_, i) => ({
      text: String(i + 1), value: String(i + 1).padStart(2, '0')
    }));

    const years: { text: string; value: string }[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      years.push({ text: String(y), value: String(y) });
    }

    let defMonth = 0, defDay = 0, defYear = 0;
    const current = this.form.get('birthDate')?.value;
    if (current) {
      const [y, m, d] = current.split('-');
      defMonth = parseInt(m, 10) - 1;
      defDay = parseInt(d, 10) - 1;
      defYear = years.findIndex(yr => yr.value === y);
    }

    const picker = await this.pickerCtrl.create({
      cssClass: 'birthday-picker',
      columns: [
        { name: 'month', options: months, selectedIndex: defMonth >= 0 ? defMonth : 0 },
        { name: 'day', options: days, selectedIndex: defDay >= 0 ? defDay : 0 },
        { name: 'year', options: years, selectedIndex: defYear >= 0 ? defYear : 0 }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel', cssClass: 'picker-cancel-btn' },
        {
          text: 'Confirm',
          cssClass: 'picker-confirm-btn',
          handler: (value) => {
            const dateStr = `${value.year.value}-${value.month.value}-${value.day.value}`;
            this.form.get('birthDate')?.setValue(dateStr);
            this.form.get('birthDate')?.markAsDirty();
            this.birthDateDisplay = `${value.month.text} ${parseInt(value.day.value, 10)}, ${value.year.value}`;
            this.cdr.detectChanges();
          }
        }
      ]
    });

    await picker.present();
  }

  async openPrivacyPolicy() {
    const modal = await this.modalCtrl.create({
      component: PrivacyPolicyComponent
    });

    await modal.present();
  }

  async openTermsOfService() {
    const modal = await this.modalCtrl.create({
      component: TermsOfServiceComponent
    });

    await modal.present();
  }
}
