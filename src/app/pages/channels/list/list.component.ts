import { AlertController, IonInfiniteScroll, ModalController, PopoverController } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { ActivatedRoute, Router } from '@angular/router';
import { Channel } from './../../../models/Channel';
import { ToastService } from './../../../services/toast.service';
import { ChannelService } from './../../../services/channel.service';
import { Component, OnInit, ViewChild } from '@angular/core';
import { User } from 'src/app/models/User';
import { SessionAuthStateService } from 'src/app/services/session-auth-state.service';
import * as _ from 'lodash';
import { ChannelPopoverComponent } from '../list/ChannelPopoverComponent';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent implements OnInit {
  @ViewChild('infinitScroll') infinitScroll!: IonInfiniteScroll;
  explorationLevel: 'city' | 'country' | 'global' = 'city';

  user: User | undefined;
  authUserId: string = '';
  pageLoading = false;
  page: number = 0;
  channels: Channel[] = [];
  backupChannels: Channel[] = [];
  nonSearchChannels: Channel[] = [];
  searchWord = "";
  selectedCategory: string = '';
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
    'Existence', 'Reality', 'Consciousness', 'Spirit', 'Soul', 'God'
  ];
  type: string = '';
  followLoading: string[] = [];
  searchTimeout: any;
  private readonly followStateStorageKey = 'channelFollowStateChanged';

  constructor(
    public channelService: ChannelService,
    public toastService: ToastService,
    public router: Router,
    public route: ActivatedRoute,
    private nativeStorage: NativeStorage,
    public alertCtrl: AlertController,
    public popoverController: PopoverController,
    public modalController: ModalController
  ) {}

  ngOnInit() {
    // Route data is resolved when the Ionic view actually enters.
    // Avoid starting a duplicate channels request here.
  }

  ionViewWillEnter() {
    this.page = 0;
    this.getType();
  }

  getChannelUserId(channel: Channel): string {
    try {
      const u = channel && (channel as any).user;
      if (!u) return '';
      if (typeof u === 'string') return u;
      if (typeof u.getId === 'function') {
        const got = u.getId();
        if (got) return got;
      }
      const maybeId = (u && (u._id || u.id)) || (u && typeof u.toObject === 'function' && (u.toObject()._id || u.toObject().id));
      if (maybeId) return String(maybeId);
      const alt = (channel as any)._userId || (channel as any).userId || (channel as any).owner || (channel as any).ownerId || (channel as any).createdBy;
      if (alt) return String(alt);
      return '';
    } catch (e) {
      return '';
    }
  }

  isOwner(channel: Channel): boolean {
    if (!channel) return false;
    return channel.isOwner(this.authUserId);
  }

  isFollowing(channel: Channel): boolean {
    if (!channel || !this.authUserId) return false;
    return channel.followedBy(this.authUserId);
  }

  private readPendingFollowState(): { id: string; followed: boolean; at: number } | null {
    try {
      const raw = localStorage.getItem(this.followStateStorageKey);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (!state || !state.id || typeof state.followed !== 'boolean') return null;
      if (state.at && Date.now() - Number(state.at) > 120000) {
        localStorage.removeItem(this.followStateStorageKey);
        return null;
      }
      return state;
    } catch (e) {
      return null;
    }
  }

  private rememberFollowState(channelId: string, followed: boolean) {
    try {
      localStorage.setItem(this.followStateStorageKey, JSON.stringify({
        id: channelId,
        followed,
        at: Date.now()
      }));
    } catch (e) {}
  }

  private applyPendingFollowState() {
    const state = this.readPendingFollowState();
    if (!state) return;

    const uid = String(this.authUserId || this.user?.id || this.user?._id || '');
    const syncList = (list: Channel[] = []) => {
      const updated = list.map(channel => {
        if (!channel || String(channel.id) !== String(state.id)) return channel;
        if (uid) {
          let followers = [...(channel.followers || [])];
          if (state.followed) {
            if (!channel.followedBy(uid)) followers.push(uid);
          } else {
            followers = followers.filter((f: any) => {
              const fid = typeof f === 'object' ? (f && (f._id || f.id)) : f;
              return String(fid) !== uid;
            });
          }
          channel.followers = followers;
        }
        return channel;
      });
      if (this.type === 'followed' && !state.followed) {
        return updated.filter(channel => String(channel.id) !== String(state.id));
      }
      return updated;
    };

    this.channels = syncList(this.channels);
    this.backupChannels = syncList(this.backupChannels);
    this.nonSearchChannels = syncList(this.nonSearchChannels);
  }

  private normalizeCategory(value: any): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ');
  }

  private categoryForChannel(channel: Channel): string {
    const fromCategory = this.normalizeCategory(channel?.category);
    if (fromCategory) return fromCategory;
    const type = String(channel?.type || '').toLowerCase();
    const name = String(channel?.name || '').toLowerCase();
    if (type === 'static_dating' || name.includes('dating')) return 'dating';
    if (type === 'static_events' || name.includes('events')) return 'events';
    if (name.includes('local news')) return 'news';
    if (name.includes('arts')) return 'arts';
    if (name.includes('found')) return 'found';
    if (name.includes('watch')) return 'watch';
    return '';
  }

  getType() {
    // Ionic re-enters this view many times. Do not create a new paramMap
    // subscription on every entry and do not discard an already-rendered
    // channel list when the route type did not change.
    const nextType = this.route.snapshot.paramMap.get('type') || '';
    const typeChanged = nextType !== this.type;

    this.type = nextType;
    this.page = 0;

    if (typeChanged) {
      this.channels = [];
      this.backupChannels = [];
      this.nonSearchChannels = [];
    }

    if (!this.user) {
      this.loadUserData();
    } else {
      this.getChannels(null, true);
    }
  }

  onCategoryChange(val: any) {
    this.selectedCategory = String(val || '');
    this.searchWord = ''; 
    this.page = 0;
    this.getChannels(null, true);
  }

  loadUserData() {
    if (window.cordova) {
      (async () => {
        try {
          const u =
            await SessionAuthStateService
              .readNativeUserFalsyFallback(
                this.nativeStorage
              );

          if (u) {
            this.user = new User().initialize(u);
            try { this.authUserId = this.user.id || this.user._id || ''; } catch(e) { this.authUserId = ''; }
            this.getChannels(null, true);
          } else {
            this.loadUserDataFromLocalStorage();
          }
        } catch (err) {
          this.loadUserDataFromLocalStorage();
        }
      })();
    } else {
      this.loadUserDataFromLocalStorage();
    }
  }

  loadUserDataFromLocalStorage() {
    const raw = SessionAuthStateService.readLocalUserRaw();
    const user = raw ? JSON.parse(raw) : null;
    if (user) {
      this.user = new User().initialize(user);
      try { this.authUserId = this.user.id || this.user._id || ''; } catch (e) { this.authUserId = '';} 
      this.getChannels(null, true);
    }
  }

  search(value?: string) {
    if (value !== undefined) {
      this.searchWord = value;
    }
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    const word = (this.searchWord || '').toString().trim();
    if (word) {
      this.selectedCategory = '';
    }
    const searchBase = this.nonSearchChannels.length > 0 ? this.nonSearchChannels : this.backupChannels;
    if (word && searchBase && searchBase.length > 0) {
      const lowerWord = word.toLowerCase();
      this.channels = searchBase.filter(c => 
        (c.name && c.name.toLowerCase().includes(lowerWord)) || 
        (c.description && c.description.toLowerCase().includes(lowerWord)) ||
        (c.category && c.category.toLowerCase().includes(lowerWord)) ||
        (c.tags && c.tags.some(t => t.toLowerCase().includes(lowerWord)))
      );
    } else if (!word) {
      this.channels = [...this.nonSearchChannels];
      this.backupChannels = [...this.nonSearchChannels];
    }
    this.searchTimeout = setTimeout(() => {
      this.pageLoading = true;
      this.page = 0;
      this.getChannels(null, true);
    }, 600); 
  }

  deleteChannel(channel: Channel, event: Event) {
    event.stopPropagation();
    this.channelService.deleteChannel(channel.id).then(
      () => {
        this.toastService.presentSuccessToastr('Channel deleted successfully');
        this.channels = (this.channels || []).filter(ch => ch.id !== channel.id);
        this.backupChannels = (this.backupChannels || []).filter(ch => ch.id !== channel.id);
        this.nonSearchChannels = (this.nonSearchChannels || []).filter(ch => ch.id !== channel.id);
      },
      err => {
        this.toastService.presentErrorToastr('Failed to delete the channel');
      }
    );
  }

  async presentPopover(ev: any, channel: any) {
    if (ev) {
      ev.stopPropagation();
    }
    const modal = await this.modalController.create({
      component: ChannelPopoverComponent,
      componentProps: { channel },
      cssClass: 'full-screen-modal',
      mode: 'ios'
    });
    return await modal.present();
  }

  handleResponse(resp: any, level: 'city' | 'country' | 'global', event?: any, pageNum: number = 0) {
    this.pageLoading = false;
    if (event && event.target && typeof event.target.complete === 'function') {
      event.target.complete();
    }
    if (resp && resp.data) {
      if (Array.isArray(resp.data.channels) && resp.data.channels.length > 0) {
        const initializedChannels = resp.data.channels.map(channelData => Channel.createFromData(channelData));
        if (pageNum === 0) {
          const existingStatics = (this.channels || []).filter(c => ['static', 'static_events', 'static_dating'].includes(c.type));
          this.channels = _.uniqBy([...existingStatics, ...initializedChannels], 'id');
        } else {
          const merged = [...(this.channels || []), ...initializedChannels];
          this.channels = _.uniqBy(merged, 'id');
        }
        
        this.backupChannels = [...this.channels];
        if (!this.searchWord) {
          this.nonSearchChannels = [...this.channels];
        }
        this.applyPendingFollowState();

        if (resp.data.more === false || resp.data.channels.length < 10) {
          if (this.infinitScroll) {
            this.infinitScroll.disabled = true;
          }
        }
      } else {
        if (pageNum === 0) {
          if (!this.searchWord || (this.channels && this.channels.length === 0)) {
            this.channels = [];
          }
        }
        if (this.infinitScroll) {
          this.infinitScroll.disabled = true;
        }
      }
    } else {
      this.toastService.presentErrorToastr('Failed to load channels');
    }
  }

  getTypechannel(channel: Channel): string | undefined {
    return channel.type;
  }

  onChannelImgError(event: Event, channel: Channel) {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      const wrapper = img.closest('.avatar-wrapper');
      if (wrapper && !wrapper.querySelector('.channel-initials')) {
        const el = document.createElement('div');
        el.className = 'channel-initials';
        const hue = ((channel.name?.charCodeAt(0) || 65) * 137) % 360;
        el.style.background = `hsl(${hue}, 55%, 38%)`;
        el.textContent = channel.name?.charAt(0)?.toUpperCase() || '?';
        wrapper.insertBefore(el, wrapper.firstChild);
      }
    }
  }

  handleError(err: any, event?: any) {
    this.pageLoading = false;
    if (event && event.target && typeof event.target.complete === 'function') {
      event.target.complete();
    }
    this.toastService.presentErrorToastr(err);
  }

  getExploreTitle() {
    if (this.explorationLevel === 'city') {
      return `Explore channels (${this.user ? this.user.city : ''})`;
    } else if (this.explorationLevel === 'country') {
      return `Explore channels (${this.user ? this.user.country : ''})`;
    } else {
      return `Explore channels (Global)`;
    }
  }

  getChannels(event?: any, refresh?: boolean) {
    if (this.pageLoading && !refresh) {
      if (event && event.target && typeof event.target.complete === 'function') {
        event.target.complete();
      }
      return;
    }
    this.pageLoading = true;
    if (refresh) {
      this.page = 0;
      if (this.infinitScroll) this.infinitScroll.disabled = false;
    }
    const currentPage = this.page;
    if (this.type === 'mines') {
      this.channelService.myChannels(this.page++, this.searchWord)
        .then(
          (resp: any) => {
            this.handleResponse(resp, 'city', event, currentPage);
          },
          err => this.handleError(err, event)
        );
    } else if (this.type === 'followed') {
      const activeSearch = (this.searchWord || '').toString().trim();
      const catToUse = activeSearch ? '' : this.selectedCategory;
      this.channelService.followedChannels(this.page++, activeSearch, catToUse)
        .then(
          (resp: any) => {
            this.handleResponse(resp, 'city', event, currentPage);
            this.sortStaticChannels();
            this.getAndMergeCityStatics();
          },
          err => this.handleError(err, event)
        );
    } else if (this.type === 'explore') {
      this.exploreChannels(this.explorationLevel, event);
    } else {
      this.pageLoading = false;
      if (event && event.target && typeof event.target.complete === 'function') {
        event.target.complete();
      }
    }
  }

  exploreChannels(level: 'city' | 'country' | 'global', event?: any) {
    this.explorationLevel = level;
    this.pageLoading = true;
    const activeSearch = (this.searchWord || '').toString().trim();
    const categoryToSearch = activeSearch ? '' : this.selectedCategory;
    const currentPage = this.page;
    this.channelService.exploreChannels(this.page++, activeSearch, level, categoryToSearch)
      .then(
        (resp: any) => {
          if (resp && resp.data && resp.data.channels) {
            const initializedChannels = resp.data.channels.map(channelData => Channel.createFromData(channelData));
            this.handleResponse({ data: { channels: initializedChannels, more: resp.data.more } }, level, event, currentPage);
            if (this.type === 'followed' || (this.type === 'explore' && level === 'city')) {
              this.getAndMergeCityStatics();
            }
          } else {
            this.handleResponse(resp, level, event, currentPage);
            if (this.type === 'followed' || (this.type === 'explore' && level === 'city')) {
              this.getAndMergeCityStatics();
            }
          }
        },
        err => this.handleError(err, event)
      );
  }

  async getAndMergeCityStatics() {
    try {
      if (!this.user) return;
      if (this.type === 'explore' && this.explorationLevel !== 'city') return;
      const resp: any = await this.channelService.getCityChannels(this.user.city || '', this.user.country || '', 0, '');
      if (resp && resp.data && Array.isArray(resp.data.channels)) {
        const statics = resp.data.channels.map(ch => Channel.createFromData(ch)).filter(c => ['static', 'static_events', 'static_dating'].includes(c.type));
        const uid = this.user?.id || this.user?._id || '';
        statics.forEach(s => {
          const sCat = s.category ? s.category.toLowerCase() : '';
          const currentCat = this.selectedCategory ? this.selectedCategory.toLowerCase() : '';
          const isFollowing = s.followedBy(uid);
          if (this.type === 'followed' && !isFollowing) return;
          if (this.type === 'explore') {
            if (isFollowing) return;
            if (currentCat && this.categoryForChannel(s) !== currentCat && !this.searchWord) return;
          }
          if (!(this.channels || []).find(c => c.id === s.id)) {
            this.channels.push(s);
          }
        });
        this.sortStaticChannels();
        this.channels = _.uniqBy(this.channels.reverse(), 'id').reverse();
        this.backupChannels = [...this.channels];
        if (!this.searchWord) this.nonSearchChannels = [...this.channels];
        this.applyPendingFollowState();
      }
    } catch (e) { }
  }

  sortStaticChannels() {
    this.channels = (this.channels || []).sort((a, b) => {
      const staticTypes = ['static', 'static_events', 'static_dating'];
      if (staticTypes.includes(a.type) && !staticTypes.includes(b.type)) return -1;
      if (!staticTypes.includes(a.type) && staticTypes.includes(b.type)) return 1;
      return 0;
    });
  }

  follow(channel: Channel) {
    if (!this.user) return;
    const uid = String(this.user?.id || this.user?._id || '');
    const wasFollowing = channel.followedBy(uid);
    this.followLoading.push(channel.id);
    this.channelService.follow(channel.id)
      .then(
        (resp: any) => {
          this.followLoading.splice(this.followLoading.indexOf(channel.id), 1);
          this.toastService.presentSuccessToastr(resp.message);
          const isNowFollowing = !wasFollowing;
          this.rememberFollowState(channel.id, isNowFollowing);
          if (isNowFollowing) {
            try {
              if (!channel.followers) channel.followers = [];
              if (!channel.followedBy(uid)) channel.followers.push(uid);
              if (this.type === 'explore') {
                this.channels = this.channels.filter(c => c.id !== channel.id);
                this.backupChannels = this.backupChannels.filter(c => c.id !== channel.id);
                this.nonSearchChannels = this.nonSearchChannels.filter(c => c.id !== channel.id);
              }
            } catch (e) { }
          } else {
            try {
              channel.followers = (channel.followers || []).filter((f: any) => {
                const fid = typeof f === 'object' ? (f._id || f.id) : f;
                return String(fid) !== String(uid);
              });
              if (this.type === 'followed') {
                this.channels = this.channels.filter(c => c.id !== channel.id);
                this.backupChannels = this.backupChannels.filter(c => c.id !== channel.id);
                this.nonSearchChannels = this.nonSearchChannels.filter(c => c.id !== channel.id);
              }
            } catch (e) { }
          }
        },
        err => {
          this.followLoading.splice(this.followLoading.indexOf(channel.id), 1);
          this.toastService.presentErrorToastr(err);
        }
      );
  }

  showChannel(channel: Channel) {
    const chObj: any = channel.toObject();
    try {
      if (!chObj.user && this.type === 'mines' && this.authUserId) {
        chObj.user = { _id: this.authUserId, id: this.authUserId };
      }
    } catch (e) { }
    this.router.navigate(['/tabs/channels/channel'], {
      queryParams: { channel: JSON.stringify(chObj) }
    });
  }
}
