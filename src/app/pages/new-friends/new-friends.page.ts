
import { ChangeDetectorRef, Component, OnInit, ViewChild, OnDestroy } from '@angular/core';
import { IdService } from 'src/app/services/id.service';
import { Router } from '@angular/router';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { IonInfiniteScroll, IonSlides, ModalController } from '@ionic/angular';
import { UserService } from 'src/app/services/user.service';
import { SessionAuthStateService } from 'src/app/services/session-auth-state.service';
import { RequestService } from 'src/app/services/request.service';
import { ToastService } from 'src/app/services/toast.service';
import { SearchOptionsComponent } from './search-options/search-options.component';
import { User } from './../../models/User';
import { AdMobFeeService } from './../../services/admobfree.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-new-friends',
  templateUrl: './new-friends.page.html',
  styleUrls: ['./new-friends.page.scss'],
})
export class NewFriendsPage implements OnInit, OnDestroy {
  @ViewChild('infinitScroll') infinitScroll: IonInfiniteScroll;
  @ViewChild('slides') slides: IonSlides;

  users: (User | { isDivider: true, scope?: string })[] = [];
  isGlobalSearch: boolean = false; // Declare and initialize

  options = {
    gender: 'both',
    profession: '0',
    education: '0',
    minAge: null as any,
    maxAge: null as any,
    interestsList: '',
    languages: '',
    online: false
  }
  // presets removed per UX update; filters are not persisted
  page = 0;
  pageLoading = false;
  initialSlide = 0;
  showSlides = false;
  random = false;
  authUser: User;
  slideOpts = {
    initialSlide: 0,
    speed: 400,
    onlyExternal: false
  };
  private destroy$ = new Subject<void>();
  showSandglass: boolean = false;

  private getExcludedUserIds(): Set<string> {
    const currentUser = this.authUser || this.userService.currentUserValue;
    const excluded = new Set<string>();
    const myId = currentUser?._id || currentUser?.id;
    if (myId) excluded.add(String(myId));

    const blocked = currentUser?.blockedUsers || [];
    blocked.forEach((entry: any) => {
      const blockedId = typeof entry === 'string' ? entry : (entry?._id || entry?.id);
      if (blockedId) excluded.add(String(blockedId));
    });

    return excluded;
  }

  /** Tracks users the current user has already acted on (requested / followed) this session */
  connectState = new Map<string, 'requested' | 'following'>();


  constructor(private userService: UserService, private modalController: ModalController, private router: Router,
              private changeDetectorRef: ChangeDetectorRef, private nativeStorage: NativeStorage, private adMobFeeService: AdMobFeeService,
              private idService: IdService, private requestService: RequestService, private toastService: ToastService) { }

  async ngOnInit() {
    // Load saved filters first so initial fetch uses persisted filters
    try { await this.loadLastFilters(); } catch (e) { /* ignore */ }
    this.getAuthUser();
    this.getNearUsers(null, true);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleRandom(){
    this.users = [];
    this.pageLoading = true;
    this.getNearUsers(null, true)
  }

  getAuthUser() {
    this.userService.currentUser.pipe(takeUntil(this.destroy$)).subscribe(user => {
      if (user) {
        this.authUser = user;
        const excludedUserIds = this.getExcludedUserIds();
        this.users = this.users.filter((entry: any) => entry?.isDivider || !excludedUserIds.has(String(entry?._id || entry?.id || '')));
        this.changeDetectorRef.detectChanges();
      }
    });
  }
  

  fallbackToLocalStorage() {
    try {
  const raw = SessionAuthStateService.readLocalUserRaw();
  const user = raw ? JSON.parse(raw) : null;
      if (user) {
        this.authUser = new User().initialize(user);
      } else {
        this.pageLoading = false;
      }
    } catch (err) {
      this.pageLoading = false;
    }
  }

  getNearUsers(event?, refresh?) {
    if (refresh) {
      this.page = 0;
      this.pageLoading = true;
    }
  
  let params: any = { type: this.random ? 'random' : 'near' };
  
  // map client option keys to API expected params and sanitize placeholders
  if (this.options.gender && this.options.gender !== 'both') params.gender = this.options.gender;
  if (this.options.profession && this.options.profession !== '0') params.profession = this.options.profession;
  if (this.options.education && this.options.education !== '0') params.education = this.options.education;
  if (this.options.interestsList && String(this.options.interestsList).trim() !== '' && this.options.interestsList !== '0') params.interests = this.options.interestsList;
  if (this.options.languages && String(this.options.languages).trim() !== '' && this.options.languages !== '0') params.languages = this.options.languages;
  if (this.options.minAge !== null && this.options.minAge !== undefined && String(this.options.minAge) !== '0') params.minAge = String(this.options.minAge);
  if (this.options.maxAge !== null && this.options.maxAge !== undefined && String(this.options.maxAge) !== '0') params.maxAge = String(this.options.maxAge);
  if (this.options.online === true) params.online = '1';

  // Remove keys that are placeholders ('0') or empty/null to keep the query clean
  Object.keys(params).forEach(k => {
    const v = params[k];
    if (v === null || v === undefined) delete params[k];
    if (String(v).trim() === '') delete params[k];
    if (k !== 'type' && String(v) === '0') delete params[k];
    if (String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') delete params[k];
  });

  this.userService.getUsers(this.page++, params)
      .subscribe(
        (resp: any) => {
          this.isGlobalSearch = resp.data.isGlobalSearch; // Capture the flag from the backend
          if (refresh) this.users = [];
  
          const excludedUserIds = this.getExcludedUserIds();
          resp.data.users.forEach(user => {
            if (user.isDivider) {
              this.users.push({ isDivider: true, scope: user.scope });
            } else {
              const initializedUser = new User().initialize(user);
              const userId = (initializedUser as any).id || (initializedUser as any)._id;
              if (userId && excludedUserIds.has(String(userId))) {
                return;
              }
              if (userId && !this.connectState.has(userId)) {
                if (user.followRequestSent) {
                  this.connectState.set(userId, 'following');
                } else if (user.requestSent) {
                  this.connectState.set(userId, 'requested');
                }
              }
              this.users.push(initializedUser);
            }
          });
  
          if (refresh && this.infinitScroll) this.infinitScroll.disabled = false;
  
          if (this.random) {
            this.showSlides = true;
            this.initialSlide = 0;
          }
  
          if (event) {
            event.target.complete();
            if (!resp.data.more && !refresh) event.target.disabled = true;
          }
  
          if (refresh && this.slides) {
            this.slides.slideTo(0, 200);
          }
  
          this.pageLoading = false;
          this.changeDetectorRef.detectChanges();
        },
        err => {
          if (event) {
            event.target.complete();
          }
          if (refresh && this.infinitScroll) this.infinitScroll.disabled = false;
  
          this.pageLoading = false;
          console.warn(err);
        }
      );
  }
  
  isUser(user: any): user is User {
    return user && !user.isDivider;
  }

  hasRealUsers(): boolean {
    return this.users && this.users.some(u => this.isUser(u));
  }
  
  

  async presentSearchByModal(){
    const modal = await this.modalController.create({
      componentProps: {
        // pass the full options so the modal shows current selections
        options: { ...this.options },
        checkItems: {
          profession: this.options.profession,
          education: this.options.education,
        },
        gender: this.options.gender,
        minAge: this.options.minAge,
        maxAge: this.options.maxAge,
        interests: this.options.interestsList,
        languages: this.options.languages,
        online: this.options.online,
        isRandomMode: this.random
      },
      component: SearchOptionsComponent
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    // If modal signalled a reset, clear stored snapshot and reset options
    if (data && data.reset) {
      this.options = { gender: 'both', profession: '0', education: '0', minAge: null as any, maxAge: null as any, interestsList: '', languages: '', online: false };
      try { await this.nativeStorage.remove('friend_search_last_filters'); } catch (e) { localStorage.removeItem('friend_search_last_filters'); }
      this.page = 0;
      this.getNearUsers(null, true);
      return;
    }

    if(data && Object.keys(data).length){
      // Normalize returned data into our options structure
      this.options.gender = data.gender || 'both';
      this.options.profession = data.profession || '0';
      this.options.education = data.education || '0';
      this.options.minAge = data.minAge ? Number(data.minAge) : null;
      this.options.maxAge = data.maxAge ? Number(data.maxAge) : null;
      this.options.interestsList = data.interests || '';
      this.options.languages = data.languages || '';
      this.options.online = data.online === '1' || data.online === true;
      
      this.page = 0;
      this.getNearUsers(null, true);

      // Persist last-applied filters synchronously to localStorage to avoid race/reversion
      try {
        const defaults = { gender: 'both', profession: '0', education: '0', minAge: null, maxAge: null, interestsList: '', languages: '', online: false };
        const snapshot: any = { ...this.options };
        if (!snapshot.interestsList) snapshot.interestsList = '';
        // If snapshot equals defaults, remove stored snapshot
        if (JSON.stringify(snapshot) === JSON.stringify(defaults)) {
          try { this.nativeStorage.remove('friend_search_last_filters'); } catch (_) { localStorage.removeItem('friend_search_last_filters'); }
        } else {
          try { this.nativeStorage.setItem('friend_search_last_filters', snapshot); } catch (e) { localStorage.setItem('friend_search_last_filters', JSON.stringify(snapshot)); }
        }
      } catch (e) {
        // ignore storage errors but ensure localStorage fallback
        try { localStorage.setItem('friend_search_last_filters', JSON.stringify(this.options)); } catch (_) { /* ignore */ }
      }
    }
  }
  async loadLastFilters() {
    try {
      let saved: any = null;
      try {
        saved = await this.nativeStorage.getItem('friend_search_last_filters');
      } catch (e) {
        // nativeStorage may not be available in browser; fallback to localStorage
        try {
          const raw = localStorage.getItem('friend_search_last_filters');
          if (raw) saved = JSON.parse(raw);
        } catch (err) { saved = null; }
      }
      if (!saved) return;
      this.options.gender = saved.gender || this.options.gender;
      this.options.profession = saved.profession || this.options.profession;
      this.options.education = saved.education || this.options.education;
      this.options.minAge = saved.minAge !== undefined ? saved.minAge : this.options.minAge;
      this.options.maxAge = saved.maxAge !== undefined ? saved.maxAge : this.options.maxAge;
      this.options.interestsList = saved.interestsList || saved.interests || this.options.interestsList;
      this.options.languages = saved.languages || this.options.languages;
      this.options.online = saved.online === true || String(saved.online) === '1' || this.options.online;
    } catch (e) { /* ignore parse errors */ }
  }
  // Preset functions removed. Filters are transient only.

  showUser(ind: number){
    this.initialSlide = ind;
    this.showSlides = true
  }

  isAdmin(user: any): boolean {
    if (!user) return false;
    const role = (user.role || '').toUpperCase();
    return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'SUPER ADMIN';
  }

  showProfile(id: any){
    // Normalize incoming id (handle Buffer-like objects, legacy id fields, or transport encodings)
    let targetId: any = id;
    try {
      if (!targetId) return;
      // prefer string coercion
      if (typeof targetId !== 'string') {
        targetId = (targetId && (targetId._id || targetId.id)) ? (targetId._id || targetId.id) : String(targetId);
      }
      // try IdService normalization if available
      try {
        const norm = this.idService && this.idService.normalizeId ? this.idService.normalizeId(targetId) : null;
        if (norm) targetId = norm;
      } catch (e) { /* ignore normalization errors */ }

        const cached = this.userService.getCachedProfile(targetId);
        
        // 🚫 Guard: Do not allow viewing Admin profiles
        if (cached && this.isAdmin(cached)) {
          return;
        }

        if (cached) {
          this.router.navigate(['/tabs/profile/display', String(targetId)]);
          return;
        }
    } catch (e) { /* ignore */ }

    this.showSandglass = true;
    this.changeDetectorRef.markForCheck();
    this.router.navigate(['/tabs/profile/display', String(targetId)]).finally(() => {
      this.showSandglass = false;
      try { this.changeDetectorRef.markForCheck(); } catch (e) {}
    });
  }

  skipSlide(){
    this.slides.slideNext();
  }

  /**
   * Connect button tap on a grid card.
   * - Private profile  → send a follow request  (warm bell icon → check)
   * - Public profile   → send a friend request  (user-plus icon → check)
   */
  connectAction(user: User, event: Event) {
    event.stopPropagation();
    const userId = user.id || (user as any)._id;
    if (!userId) return;

    // If already sent — tap again to cancel
    if (this.connectState.has(userId)) {
      const currentState = this.connectState.get(userId);
      this.connectState.delete(userId);
      this.changeDetectorRef.detectChanges();

      if (currentState === 'following') {
        this.userService.unfollow(userId).subscribe(
          (resp: any) => {
            this.toastService.presentSuccessToastr(resp?.message || 'Follow request cancelled.');
            this.changeDetectorRef.detectChanges();
          },
          (err: any) => {
            this.connectState.set(userId, 'following');
            this.toastService.presentErrorToastr(err?.error?.message || 'Could not cancel follow request.');
            this.changeDetectorRef.detectChanges();
          }
        );
      } else {
        this.requestService.cancelRequestByUser(userId).then(
          (resp: any) => {
            this.toastService.presentSuccessToastr(resp?.message || 'Friend request cancelled.');
            this.changeDetectorRef.detectChanges();
          },
          (err: any) => {
            this.connectState.set(userId, 'requested');
            this.toastService.presentErrorToastr(err?.error?.message || 'Could not cancel request.');
            this.changeDetectorRef.detectChanges();
          }
        );
      }
      return;
    }

    if (user.isPrivate) {
      this.connectState.set(userId, 'following');
      this.userService.follow(userId).subscribe(
        (resp: any) => {
          this.toastService.presentSuccessToastr(resp?.message || 'Follow request sent!');
          this.changeDetectorRef.detectChanges();
        },
        (err: any) => {
          this.connectState.delete(userId);
          this.toastService.presentErrorToastr(err?.error?.message || 'Could not send follow request.');
          this.changeDetectorRef.detectChanges();
        }
      );
    } else {
      this.connectState.set(userId, 'requested');
      this.requestService.request(userId).then(
        (resp: any) => {
          this.toastService.presentSuccessToastr(resp?.message || 'Friend request sent!');
          this.changeDetectorRef.detectChanges();
        },
        (err: any) => {
          this.connectState.delete(userId);
          this.toastService.presentErrorToastr(err?.error?.message || 'Could not send friend request.');
          this.changeDetectorRef.detectChanges();
        }
      );
    }
  }

}
