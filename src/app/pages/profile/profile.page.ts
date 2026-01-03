import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { UserService } from 'src/app/services/user.service';
import { User } from './../../models/User';
import { Platform } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import constants from 'src/app/helpers/constants';
import { IdService } from 'src/app/services/id.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage implements OnInit, OnDestroy {
  user: User;
  authUser: User;

  edit = false;
  form: FormGroup;
  pageLoading = true;
  myProfile = false;
  mainAvatar: string = '';
  viewedUser: User;
  private destroy$ = new Subject<void>();

  constructor(
    private userService: UserService,
    private platform: Platform,
    private nativeStorage: NativeStorage,
    private formBuilder: FormBuilder,
    private route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef
    , private idService: IdService
  ) {}

  ngOnInit() {
    this.initializeForm();
    this.loadUserData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initializeForm() {
    this.form = this.formBuilder.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      avatar: [''],
      birthDate: [''],
      gender: [''],
      education: [''],
      school: [''],
      country: [''],
      city: [''],
      profession: [''],
      interests: [[]]
    });
  }

  loadUserData() {
    const userId = this.route.snapshot.paramMap.get('id');
    this.myProfile = !userId;

    // Subscribe to the authenticated user from the centralized service
    this.userService.currentUser.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.authUser = user;
      if (this.myProfile) {
        if (user) {
          this.handleUserData(user);
        }
      }
    });

    if (!this.myProfile && userId) {
      this.fetchUserProfileDirectly(userId);
    }
  }

  handleUserData(user: User) {
    this.viewedUser = user;
    this.mainAvatar = this.viewedUser ? this.viewedUser.mainAvatar : '';
    this.populateForm();
    this.pageLoading = false;
    this.changeDetectorRef.detectChanges();
  }

  fetchUserProfileDirectly(userId: string) {
    this.pageLoading = true;
    this.userService.getUserProfile(userId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (user) => {
        this.handleUserData(user);
      },
      error: (err) => {
        console.error('Error fetching user profile:', err);
        this.pageLoading = false;
        this.changeDetectorRef.detectChanges();
      }
    });
  }

  populateForm() {
    if (this.form && this.viewedUser) {
      this.form.patchValue({
        firstName: this.viewedUser.firstName,
        lastName: this.viewedUser.lastName,
        avatar: this.viewedUser.avatar,
        birthDate: this.viewedUser.birthDate,
        gender: this.viewedUser.gender,
        education: this.viewedUser.education,
        school: this.viewedUser.school,
        country: this.viewedUser.country,
        city: this.viewedUser.city,
        profession: this.viewedUser.profession,
        interests: this.viewedUser.interests
      });
    }
  }

  startEditing() {
    this.edit = true;
  }

  cancelEditing() {
    this.edit = false;
    this.populateForm(); // Reset form with current user data
  }

  saveChanges() {
    if (this.form.valid) {
      this.pageLoading = true;
      const updatedData = {
        ...this.form.value,
        avatar: this.viewedUser.avatar // Ensure avatars are included
      };

      const userId = this.viewedUser._id;

      this.userService.updateUser(userId, updatedData).subscribe({
        next: (response) => {
          console.log('User updated successfully:', response);
          if (this.myProfile) {
            // Update the centralized user state
            this.userService.setCurrentUser({ ...this.viewedUser, ...updatedData });
          } else {
            // For other users, just update local state
            Object.assign(this.viewedUser, updatedData);
          }
          this.edit = false;
          this.pageLoading = false;
          this.changeDetectorRef.detectChanges();
        },
        error: (err) => {
          console.error('Error updating user:', err);
          this.pageLoading = false;
          this.changeDetectorRef.detectChanges();
        }
      });
    }
  }
}
