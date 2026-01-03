import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { User } from './../../../models/User';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { JsonService } from 'src/app/services/json.service';
import { ListSearchComponent } from './../../list-search/list-search.component';
import { SchoolService } from './school.service';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ToastService } from 'src/app/services/toast.service';
import { UserService } from 'src/app/services/user.service'; // Adjust the import path as needed
import { Platform } from '@ionic/angular'; // Import Platform
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SocketService } from 'src/app/services/socket.service';

@Component({
  selector: 'app-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.scss'],
})
export class FormComponent implements OnInit, OnDestroy {
  user: User;
  form: FormGroup;
  validationErrors = {};
  pageLoading = true;
  isUpdating = false;
  id: string;
  private destroy$ = new Subject<void>();
  private socketSub: Subscription | null = null;
  private profileFetched = false;

  countries = [];
  selectedCountry = '';

  // fields
studyCountries: string[] = [];
selectedStudyCountry = '';


  cities = [];
  selectedCity = '';

  professions = [];
  selectedProfession = '';

  educations = [];
  selectedEducation = '';

  interests = [];
  selectedInterests = [];

  languages = [
    'English', 'French', 'Spanish', 'German', 'Arabic', 'Chinese', 'Japanese', 
    'Russian', 'Portuguese', 'Italian', 'Turkish', 'Hindi', 'Dutch',
    'Norwegian', 'Swedish', 'Danish', 'Finnish', 'Icelandic',
    'Polish', 'Ukrainian', 'Romanian', 'Greek', 'Czech', 'Hungarian',
    'Bulgarian', 'Slovak', 'Croatian', 'Lithuanian', 'Slovenian', 'Latvian', 'Estonian',
    'Irish', 'Maltese', 'Korean', 'Vietnamese', 'Thai', 'Indonesian', 'Malay', 'Persian'
  ];
  selectedLanguages = [];

  schools = [];
  selectedSchool = '';
  isLoadingSchools = false;

  constructor(
    private formBuilder: FormBuilder,
    private modalCtrl: ModalController,
    private jsonService: JsonService,
    private nativeStorage: NativeStorage,
    private schoolService: SchoolService,
    private http: HttpClient,
    private router: Router,
    private toastService: ToastService,
    private userService: UserService, // Add this line
    private platform: Platform,  // Add Platform service
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.form = this.formBuilder.group({
      firstName: [''],
      lastName: [''],
      birthDate: ['', Validators.required], // Ensure Validators.required is set
      gender: [''],
      studyCountry: [''],            // <-- NEW
      school: [''],
      education: [''],
      country: [''],
      city: [''],
      profession: [''],
      interests: [''],
      languages: [''],
      aboutMe: [''],
      isPrivate: [false],
      ageVisible: [true],
      genderVisible: [true]
    });
  
    this.loadUserData();
    this.loadJsonData();

    // Listen for socket updates to refresh form if profile is updated from elsewhere
    try {
      this.socketSub = SocketService.userProfileUpdated$.subscribe((payload: any) => {
        const uid = payload?.userId;
        if (uid && this.user && (this.user._id === String(uid) || this.user.id === String(uid))) {
          console.log('FormComponent: Socket update received, refreshing user data');
          this.userService.refreshCurrentUser({ forceRefresh: true }).subscribe();
        }
      });
    } catch (e) {
      console.warn('SocketService not available in FormComponent', e);
    }
  }

  async openAvatarCustomize() {
    const modal = await this.modalCtrl.create({
      component: (await import('../../../components/avatar-customize-modal/avatar-customize-modal.component')).AvatarCustomizeModalComponent,
      componentProps: { profile: this.user }
    });
    await modal.present();

    const { data } = await modal.onDidDismiss();
    if (data) {
      console.log('Avatar modal dismissed with data, UI should already be updated via UserService');
    }
  }

  loadUserData() {
    this.userService.currentUser$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(user => {
      if (user) {
        console.log('FormComponent: Received user update', user.id);
        const isFirstLoad = !this.user;
        this.user = user;

        // Populate the form only when it's safe:
        // - if not currently updating and
        // - if the form is not dirty (no unsaved edits) OR it's the first load
        // This prevents overwriting unsaved changes while still allowing settings
        // updates from other places (e.g., Settings page) to reflect here.
        const safeToPopulate = !this.isUpdating && (!this.form || !this.form.dirty || isFirstLoad);
        if (safeToPopulate) {
          this.populateForm();
        }
        
        this.cdr.detectChanges();
        
        if (!this.profileFetched) {
          this.profileFetched = true;
          console.log('FormComponent: Initial profile fetch triggered');
          this.fetchUserProfileDirectly();
        }
      }
    });
  }

  populateForm() {
    console.log('Populating form with user data:', this.user);

    if (this.user) {
      const sanitize = (val: any) => (val === 'undefined' || val === undefined || val === null) ? '' : val;

      this.form.patchValue({
        firstName: sanitize(this.user.firstName),
        lastName: sanitize(this.user.lastName),
        birthDate: this.user.birthDate ? this.user.birthDate.toISOString().substring(0, 10) : '',
        gender: sanitize(this.user.gender),
        isPrivate: this.user.isPrivate,
        ageVisible: this.user.ageVisible,
        genderVisible: this.user.genderVisible,
        studyCountry: (() => {
          const sc = (this.user as any).studyCountry;
          if (!sc) return '';
          if (typeof sc === 'string') return sc;
          if (typeof sc === 'object') return sanitize(sc.name || JSON.stringify(sc));
          return String(sc);
        })(),
        country: sanitize(this.user.country),
        city: sanitize(this.user.city),
        school: sanitize(this.user.school),
        education: sanitize(this.user.education),
        profession: sanitize(this.user.profession),
        interests: this.user.interests,
        languages: this.user.languages,
        aboutMe: sanitize(this.user.aboutMe)
      });

      this.selectedCountry = sanitize(this.user.country);
      this.selectedCity = sanitize(this.user.city);
      this.selectedProfession = sanitize(this.user.profession);
      this.selectedSchool = sanitize(this.user.school);
      this.selectedInterests = this.user.interests || [];
      this.selectedLanguages = this.user.languages || [];
      // Normalize study country to a simple string to avoid [object Object]
      const rawStudy = (this.user as any).studyCountry;
      if (!rawStudy) {
        this.selectedStudyCountry = '';
      } else if (typeof rawStudy === 'string') {
        this.selectedStudyCountry = rawStudy;
      } else if (typeof rawStudy === 'object') {
        this.selectedStudyCountry = rawStudy.name || JSON.stringify(rawStudy);
      } else {
        this.selectedStudyCountry = String(rawStudy);
      }
      if (this.selectedStudyCountry) {
        this.loadUniversities();
      }
    }
    
    this.pageLoading = false;
  }

  loadJsonData() {
    this.jsonService.getCountries().then(
      (data: any) => {
        let countriesObj = data;
        // Handle JsonService wrapping object in array
        if (Array.isArray(data) && data.length === 1 && !Array.isArray(data[0]) && typeof data[0] === 'object') {
          countriesObj = data[0];
        }

        if (countriesObj && typeof countriesObj === 'object' && !Array.isArray(countriesObj)) {
          this.countries = Object.keys(countriesObj).map(key => ({ name: key, values: countriesObj[key] }));
        } else {
          this.countries = Array.isArray(countriesObj) ? countriesObj : [];
        }

        // reuse the same list for study countries
        this.studyCountries = this.countries.map((c: any) => (typeof c === 'string' ? c : (c.name ?? '')));
      },
      (error) => console.error('Error fetching countries:', error)
    );

    this.jsonService.getProfessions().then(
      (resp: any) => {
        this.professions = resp;
      },
      (error) => {
        console.error('Error fetching professions:', error);
      }
    );

    this.jsonService.getEducations().then(
      (resp: any) => {
        this.educations = resp;
      },
      (error) => {
        console.error('Error fetching educations:', error);
      }
    );

    this.jsonService.getInterests().then(
      (resp: any) => {
        this.interests = resp;
      },
      (error) => {
        console.error('Error fetching interests:', error);
      }
    );
  }

  loadUniversities() {
    if (!this.selectedStudyCountry) {
      this.schools = [];
      return;
    }
    this.isLoadingSchools = true;
    this.schoolService.getUniversityNames(this.selectedStudyCountry).subscribe({
      next: (names: string[]) => {
        this.schools = names || [];
        this.isLoadingSchools = false;
      },
      error: (err) => {
        console.error('Failed to load universities for', this.selectedStudyCountry, err);
        this.schools = [];
        this.isLoadingSchools = false;
      }
    });
  }
  

  async presentModal(data: any[], title: string, multiSelect: boolean = false) {
    let modalData = data;

    if (!Array.isArray(data)) {
      modalData = Object.keys(data).map(key => ({ name: key, values: data[key] }));
    }

    const modal = await this.modalCtrl.create({
      component: ListSearchComponent,
      componentProps: { data: modalData, title, multiSelect }
    });

    modal.onDidDismiss().then((result) => {
      if (result.data) {
        if (title === 'Countries') {
          this.selectedCountry = result.data.name;
          this.cities = result.data.values;
        } else if (title === 'Cities') {
          this.selectedCity = result.data;
        } else if (title === 'Professions') {
          this.selectedProfession = result.data;
        } else if (title === 'Interests') {
          this.addInterests(result.data);
        } else if (title === 'Languages') {
          this.addLanguages(result.data);
        } else if (title === 'Educations') {
          this.selectedEducation = result.data;
        } else if (title === 'Schools') {
          this.selectedSchool = result.data;
        } else if (title === 'Study Countries') {
          // result.data can be either { name, values } or a simple string
          this.selectedStudyCountry = result.data.name || result.data;
          this.loadUniversities();
        }
      }
    });

    return await modal.present();
  }

  addInterests(interests) {
    interests.forEach(interest => {
      if (this.selectedInterests.length < 10 && !this.selectedInterests.includes(interest)) {
        this.selectedInterests.push(interest);
      }
    });
  }

  removeInterest(index: number) {
    this.selectedInterests.splice(index, 1);
  }

  addLanguages(languages) {
    languages.forEach(lang => {
      if (this.selectedLanguages.length < 5 && !this.selectedLanguages.includes(lang)) {
        this.selectedLanguages.push(lang);
      }
    });
  }

  removeLanguage(index: number) {
    this.selectedLanguages.splice(index, 1);
  }

  async presentCountriesModal() {
    await this.presentModal(this.countries, 'Countries');
  }

  async presentStudyCountriesModal() {
    await this.presentModal(this.studyCountries, 'Study Countries');
  }

  async presentCitiesModal() {
    if (this.selectedCountry) {
      await this.presentModal(this.cities, 'Cities');
    } else {
      console.warn('Please select a country first');
    }
  }

  async presentProfessionsModal() {
    await this.presentModal(this.professions, 'Professions');
  }

  async presentInterestsModal() {
    await this.presentModal(this.interests, 'Interests', true);
  }

  async presentLanguagesModal() {
    await this.presentModal(this.languages, 'Languages', true);
  }

  async presentSchoolsModal() {
    if (!this.selectedStudyCountry) {
      this.toastService.presentErrorToastr('Please select a Study Country first');
      return;
    }

    await this.presentModal(this.schools, 'Schools');
  }

  getMaxBirthDate(): string {
    const today = new Date();
    const maxDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()); // Exact date 18 years ago
    return maxDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
  }

  onToggleChange(controlName: string, event: any) {
    if (this.isUpdating) return;
    const newValue = event.detail.checked;
    if (this.form.get(controlName).value !== newValue) {
      this.form.get(controlName).setValue(newValue);
      this.form.get(controlName).markAsDirty();
    }
  }

  fetchUserProfileDirectly() {
    const userId = this.user.id;
    this.userService.getUserProfile(userId).subscribe(
      (response) => {
        console.log('Profile Response:', response);
        if (response) {
          // Centralized update will trigger populateForm via subscription
          this.userService.setCurrentUser(response);
        } else {
          console.error('User data not available in response');
        }
      },
      (error) => {
        console.error('Error fetching profile:', error);
        this.handleError(error);  // Custom error handling method
      }
    );
  }

  handleError(error: any) {
    if (error.status === 404) {
      console.error('Profile not found (404):', error.message);
    } else if (error.status === 500) {
      console.error('Server error (500):', error.message);
    } else {
      console.error('Unknown error:', error);
    }
  }

  submit() {
    if (this.form.valid) {
      this.isUpdating = true;
      const formData = this.form.getRawValue();
      console.log('Form Data:', formData);

      const userId = this.user.id;
      if (!userId) {
        console.error('User ID is not defined');
        return;
      }
  
      // Construct updatedUserData by merging only meaningful (non-empty) form fields
      // into the existing user object to avoid clearing fields unintentionally.
      const base = (typeof this.user.toObject === 'function') ? this.user.toObject() : { ...this.user };
      const updatedUserData: any = { ...base };

      Object.keys(formData).forEach((key) => {
        const val = formData[key];
        // Booleans and numbers are valid values even if falsy; strings should be persisted only when non-empty
        if (typeof val === 'string') {
          if (val !== '' && val !== 'undefined') {
            updatedUserData[key] = val;
          }
        } else if (val !== null && val !== undefined) {
          updatedUserData[key] = val;
        }
      });

      // Always persist selected arrays explicitly
      updatedUserData.interests = Array.isArray(this.selectedInterests) ? this.selectedInterests : (updatedUserData.interests || []);
      updatedUserData.languages = Array.isArray(this.selectedLanguages) ? this.selectedLanguages : (updatedUserData.languages || []);

      console.log('Updating user with ID: ', userId, 'payload:', updatedUserData);
      // Prevent changing country/city from the profile form (preserve values from sign-up)
      updatedUserData.country = this.user.country || updatedUserData.country;
      updatedUserData.city = this.user.city || updatedUserData.city;

      this.userService.updateUser(userId, updatedUserData).subscribe({
        next: (response) => {
          this.isUpdating = false;
          console.log('Update Response:', response);
  
          if (response && response.data) {
            // Centralized update will trigger UI updates
            this.userService.setCurrentUser(response.data);
            this.populateForm(); // Force refresh form fields after successful save
  
            this.toastService.presentSuccessToastr('Profile updated successfully');
  
            this.router.navigate(['/tabs/profile/display/null']);
          } else {
            console.error('User data not available in response');
            // Handle the case where user data is not available
            this.toastService.presentErrorToastr('Error fetching updated profile data');
          }
        },
        error: (error) => {
          this.isUpdating = false;
          console.error('Error updating profile:', error);
  
          // Log detailed error information
          if (error.status) {
            console.error(`Error Status: ${error.status}`);
          }
          if (error.message) {
            console.error(`Error Message: ${error.message}`);
          }
          if (error.error) {
            console.error(`Error Details:`, error.error);
          }
  
          this.toastService.presentErrorToastr('Error updating profile. Please check the console for details.');
        }
      });
    } else {
      console.log('Form is invalid');
      // Handle invalid form submission as needed
    }
  }
  

  hasProfileChanged(formData: any): boolean {
    return (
      formData.firstName !== this.user.firstName ||
      formData.lastName !== this.user.lastName ||
      formData.birthDate !== this.user.birthDate ||
      formData.gender !== this.user.gender ||
      formData.education !== this.user.education ||
      formData.school !== this.user.school ||
      formData.country !== this.user.country ||
      formData.city !== this.user.city ||
      formData.aboutMe !== this.user.aboutMe // Add this line
    );
  }

  get firstName() { return this.form.get('firstName'); }
  get lastName() { return this.form.get('lastName'); }
  get birthDate() { return this.form.get('birthDate'); }
  get gender() { return this.form.get('gender'); }
  get school() { return this.form.get('school'); }
  get education() { return this.form.get('education'); }
  get aboutMe() { return this.form.get('aboutMe'); }  // Add this line

  getMaxDate() {
    return new Date().toISOString().split('T')[0];
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.socketSub) {
      this.socketSub.unsubscribe();
    }
  }
}
