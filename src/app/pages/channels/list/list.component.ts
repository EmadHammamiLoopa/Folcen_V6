import { AlertController, IonInfiniteScroll, PopoverController } from '@ionic/angular';
import { NativeStorage } from '@ionic-native/native-storage/ngx';
import { ActivatedRoute, Router } from '@angular/router';
import { Channel } from './../../../models/Channel';
import { ToastService } from './../../../services/toast.service';
import { ChannelService } from './../../../services/channel.service';
import { Component, OnInit, ViewChild } from '@angular/core';
import { User } from 'src/app/models/User';
import * as _ from 'lodash';
import { ChannelPopoverComponent } from '../list/ChannelPopoverComponent';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent implements OnInit {
  @ViewChild('infinitScroll') infinitScroll: IonInfiniteScroll;
  explorationLevel: 'city' | 'country' | 'global' = 'city';


  user: User | undefined;
  authUserId: string = '';
  pageLoading = false;
  page: number = 0;
  channels: Channel[] = [];
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
  searchTimeout: any; // Add this line to declare the searchTimeout variable


  constructor(
    private channelService: ChannelService,
    private toastService: ToastService,
    private router: Router,
    private route: ActivatedRoute,
    private nativeStorage: NativeStorage,
    private alertCtrl: AlertController,
    private popoverController: PopoverController
  ) {}

  ngOnInit() {
    // Only load user data and channels if they haven't been loaded yet
    if (!this.user) {
        this.loadUserData(); 
    }
}

ionViewWillEnter() {
  // Always refresh the list when entering the view to ensure new channels are shown
  this.page = 0;
  this.getType();
}


getChannelUserId(channel: Channel): string {
    console.log('Channel:', channel);

    try {
      const u = channel && (channel as any).user;
      if (!u) return '';

      // If channel.user is a string (i.e., the user ID), return it directly
      if (typeof u === 'string') {
        console.log('User is a string, returning user ID:', u);
        return u;
      }

      // If it's an instance of our User class, it may expose `id` getter
      if (typeof u.getId === 'function') {
        const got = u.getId();
        if (got) return got;
      }

      // Check common id fields safely
      const maybeId = (u && (u._id || u.id)) || (u && typeof u.toObject === 'function' && (u.toObject()._id || u.toObject().id));
      if (maybeId) {
        console.log('User object id extracted:', maybeId);
        return String(maybeId);
      }

      // Also check common alternate fields on the channel itself (owner variants)
      const alt = (channel as any)._userId || (channel as any).userId || (channel as any).owner || (channel as any).ownerId || (channel as any).createdBy;
      if (alt) return String(alt);

      // No id found — only log during local development to avoid noisy console in prod
      return '';
    } catch (e) {
      console.warn('Error extracting channel user id', e, channel && (channel as any).user);
      return '';
    }
}

  isOwner(channel: Channel): boolean {
    if (!channel) return false;
    return channel.isOwner(this.authUserId);
  }


  getType() {
    this.route.paramMap.subscribe(params => {
      this.type = params.get('type') || '';
      this.loadUserData();
    });
  }

  onCategoryChange(val: any) {
    this.selectedCategory = String(val || '');
    // refresh list using new category filter
    this.page = 0;
    this.getChannels(null, true);
  }

  loadUserData() {
    if (window.cordova) {
      (async () => {
        try {
          let u: any = null;
          try { u = await this.nativeStorage.getItem('currentUser'); } catch(e) {}
          if (!u) {
            try { u = await this.nativeStorage.getItem('currentUser'); } catch(e) { /* ignore */ }
          }
          if (!u) try { u = await this.nativeStorage.getItem('user'); } catch(e) {}
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
  const raw = localStorage.getItem('currentUser') || localStorage.getItem('user');
  const user = raw ? JSON.parse(raw) : null;
    if (user) {
      this.user = new User().initialize(user);
      // normalize auth user id to a simple string for templates
      try { this.authUserId = this.user.id || this.user._id || ''; } catch (e) { this.authUserId = '';} 
      this.getChannels(null, true);
    }
  }

  search(searchWord: string) {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  
    this.searchTimeout = setTimeout(() => {
      this.searchWord = searchWord;
      // Reset paging so explore API will be called with the new search term
      this.page = 0;
      this.getChannels(null, true);
    }, 300); // Wait for 300ms after the last keystroke before making the API call
  }
  
  deleteChannel(channel: Channel, event: Event) {
    event.stopPropagation(); // Prevent click event from propagating to the parent
  
    // Add your logic for deleting the channel here
    this.channelService.deleteChannel(channel.id).then(
      (resp: any) => {
        this.toastService.presentSuccessToastr('Channel deleted successfully');
        this.channels = this.channels.filter(ch => ch.id !== channel.id);
      },
      err => {
        this.toastService.presentErrorToastr('Failed to delete the channel');
      }
    );
  }
  
  async presentPopover(ev: any, channel: any) {
    const popover = await this.popoverController.create({
      component: ChannelPopoverComponent,
      componentProps: { channel },
      event: ev,
      translucent: true,
      cssClass: 'channel-info-popover',
      mode: 'ios'
    });
    return await popover.present();
  }

  handleResponse(resp: any, level: 'city' | 'country' | 'global', event?: any) {
    this.pageLoading = false; // Ensure loading state is reset
    if (event) event.target.complete();
  
    if (resp && resp.data) {
      console.log("response:", resp);
      console.log("resp.data:", resp.data);
  
      if (Array.isArray(resp.data.channels) && resp.data.channels.length > 0) {
        const initializedChannels = resp.data.channels.map(channelData => Channel.createFromData(channelData));
  
        if (this.page === 1) {
          // Initialize channels list with the first page data
          this.channels = initializedChannels;
        } else {
          // Concatenate and deduplicate channels, keeping the newer data (from initializedChannels)
          const merged = [...this.channels, ...initializedChannels];
          this.channels = _.uniqBy(merged.reverse(), 'id').reverse();
        }
  
        console.log('Channels after deduplication:', this.channels);
        console.log('Number of channels:', this.channels.length);
  
        // Disable infinite scroll if there are no more pages
        if (!resp.data.more) {
          if (this.infinitScroll) this.infinitScroll.disabled = true;
        }
  
      } else {
        // Only show prompts if in 'explore' type, not in 'my channels'
        if (this.type === 'explore') {
          // No channels found, handle prompts for other exploration levels
          if (level === 'city') {
            // Prompt to explore country level if no channels found in city
            this.promptExploreOptions('country');
          } else if (level === 'country') {
            // Prompt to explore global level if no channels found in country
            this.promptExploreOptions('global');
          } else if (level === 'global') {
            // No channels found globally, prompt user to create their own channel
            this.promptCreateChannel(); // Global level reached, only prompt to create a channel
          }
        } else {
          // No channels and no further prompts, stop loading
          if (this.infinitScroll) this.infinitScroll.disabled = true;
        }
      }
    } else {
      this.toastService.presentErrorToastr('Failed to load channels');
    }
  }
  
  getTypechannel(channel: Channel): string | undefined {
    return channel.type;
  }
  
  
  
  promptCreateChannel() {
    this.alertCtrl.create({
      header: 'No Channels Found',
      message: 'No channels were found. Would you like to create your own channel?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.router.navigate(['/tabs/channels/list/followed']);
          }
        },
        {
          text: 'Create Channel',
          handler: () => {
            this.router.navigate(['/tabs/channels/form']); // Updated path to match your route configuration
          }
        }
      ]
    }).then(alert => alert.present());
  }
  
  
  
  async promptExploreOptions(level: 'country' | 'global') {
    let header = '';
    let message = '';
  
    if (level === 'country') {
      header = 'No Channels Found in Your City';
      message = 'Would you like to explore channels in your country, or create your own channel?';
    } else if (level === 'global') {
      header = 'No Channels Found in Your Country';
      message = 'Would you like to explore channels around the world, or create your own channel?';
    }
  
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.router.navigate(['/tabs/channels/list/followed']);
          }
        },
        {
          text: level === 'country' ? 'Explore Country' : 'Explore Global',
          handler: () => {
            this.page = 0;
            console.log(`Page reset to: ${this.page} for ${level} level`);
  
            this.explorationLevel = level;
            this.exploreChannels(this.explorationLevel); // Trigger exploration at the next level
          }
        },
        {
          text: 'Create Channel',
          handler: () => {
            this.router.navigate(['/tabs/channels/form']); // Navigate to the create channel page
          }
        }
      ]
    });
    await alert.present();
  }

  
  handleError(err, event?: any) {
    this.pageLoading = false;
    if (event) event.target.complete();
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
    if (!this.user) return;

    console.log(`Current page: ${this.page}`);  // Log the current page

    this.pageLoading = true;
    if (refresh) {
        // Reset page only if refresh is true, to avoid redundant resets
        this.page = 0;
        console.log(`Page reset to: ${this.page}`);  // Log after resetting the page

        // Only clear channels array if refreshing for non-explore types
        if (this.type !== 'explore') {
            this.channels = [];  // Clear the existing channels array
        }
    }

    if (this.type === 'mines') {
        this.channelService.myChannels(this.page++, this.searchWord)
            .then(
                (resp: any) => this.handleResponse(resp, 'city', event),
                err => this.handleError(err, event)
            );

    } else if (this.type === 'followed') {
      this.channelService.followedChannels(this.page++, this.searchWord, this.selectedCategory)
            .then(
                (resp: any) => {
                    this.handleResponse(resp, 'city', event);
            this.sortStaticChannels();  // Ensure static channels are sorted
            // merge static city channels so user sees default-followed statics
            this.getAndMergeCityStatics();
                },
                err => this.handleError(err, event)
            );

    } else if (this.type === 'explore') {
        // Avoid making redundant calls to exploreChannels if the page isn't 0
        if (this.page === 0) {
            this.exploreChannels(this.explorationLevel, event);
        } else {
          this.pageLoading = false;
          if (event) event.target.complete();
        }
    } else {
      this.pageLoading = false;
      if (event) event.target.complete();
    }
}

  async getAndMergeCityStatics() {
    // Fetch static city channels for the user's city and country and merge into followed list as default-followed
    try {
      if (!this.user) return;
      const resp: any = await this.channelService.getCityChannels(this.user.city || '', this.user.country || '', 0, '');
      if (resp && resp.data && Array.isArray(resp.data.channels)) {
        const statics = resp.data.channels.map(ch => Channel.createFromData(ch)).filter(c => ['static','static_events','static_dating'].includes(c.type));
        statics.forEach(s => {
          // if not already present, add and mark as followed locally
          if (!this.channels.find(c => c.id === s.id)) {
            try {
              if (!s.followers) s.followers = [];
              if (this.user && !s.followers.includes(this.user.id)) s.followers.push(this.user.id);
            } catch (e) { /* ignore */ }
            this.channels.push(s);
          }
        });
        // dedupe
        this.channels = _.uniqBy(this.channels.reverse(), 'id').reverse();
        // Optionally persist default follows server-side if configured (localStorage key 'persist_default_channel_follows' === '1')
        try {
          const persist = localStorage.getItem('persist_default_channel_follows') === '1';
          if (persist && this.user) {
            statics.forEach(async s => {
              try {
                // only follow on server when not already followed
                if (!s.followers || !s.followers.includes(this.user.id)) {
                  await this.channelService.follow(s.id);
                }
              } catch (e) { /* ignore follow errors */ }
            });
          }
        } catch (e) {}
      }
    } catch (e) { console.warn('Failed to fetch/merge city statics', e); }
  }


sortStaticChannels() {
  this.channels = this.channels.sort((a, b) => {
    const staticTypes = ['static', 'static_events', 'static_dating'];

    if (staticTypes.includes(a.type) && !staticTypes.includes(b.type)) {
      return -1;
    } else if (!staticTypes.includes(a.type) && staticTypes.includes(b.type)) {
      return 1;
    }
    return 0;
  });
}

  

  async promptExploreCountry() {
    const alert = await this.alertCtrl.create({
      header: 'No Channels Found',
      message: 'No channels were found in your city. Would you like to explore channels in your country?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.router.navigate(['/tabs/channels/list/followed']);
          }
        },
        {
          text: 'Explore Country',
          handler: () => {
            this.page = 0;  
            console.log(`Page reset to: ${this.page} for country level`);  // Log the page reset for country

            this.explorationLevel = 'country';  
            this.exploreChannels(this.explorationLevel);  
          }
        }
      ]
    });
    await alert.present();
  }
  

  async promptExploreGlobal() {
    const alert = await this.alertCtrl.create({
      header: 'No Channels Found',
      message: 'No channels were found in your country. Would you like to explore channels around the world?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.router.navigate(['/tabs/channels/list/followed']);
          }
        },
        {
          text: 'Explore Global',
          handler: () => {
            this.page = 0;  // Reset the page number for a new search
            console.log(`Page reset to: ${this.page} for global level`);  // Log the page reset for global

            this.explorationLevel = 'global';  // Update exploration level to 'global'
            this.exploreChannels(this.explorationLevel);  // Trigger exploration at the global level
          }
        }
      ]
    });
    await alert.present();
  }

  exploreChannels(level: 'city' | 'country' | 'global' = 'city', event?: any) {
    console.log(`exploreChannels API called ${level} level`);

    // Reset channels array when switching exploration levels
    if (this.explorationLevel !== level) {
        this.channels = [];
    }

    // Ensure API call is only made when the page is 0
    if (this.page === 0) {
        this.explorationLevel = level;
        this.channelService.exploreChannels(this.page++, this.searchWord, level, this.selectedCategory)
            .then(
                (resp: any) => {
                    console.log('Response from exploreChannels API:', resp);
                    console.log(`Current page after API call: ${this.page}`);

                    if (resp.data && resp.data.channels) {
                        const initializedChannels = resp.data.channels.map(channelData => {
                            return Channel.createFromData(channelData);
                        });

                        // Handle response and deduplication as usual
                        this.handleResponse({ data: { channels: initializedChannels } }, level, event);
                      // if exploring followed view, also merge city static channels so user sees default-followed statics
                      if (this.type === 'followed') {
                        this.getAndMergeCityStatics();
                      }
                    } else {
                      this.pageLoading = false;
                      if (event) event.target.complete();
                    }
                },
                err => this.handleError(err, event)
            );
    } else {
      this.pageLoading = false;
      if (event) event.target.complete();
    }
}

  

  follow(channel: Channel) {
    if (!this.user) return;

    this.followLoading.push(channel.id);
    this.channelService.follow(channel.id)
      .then(
        (resp: any) => {
          this.followLoading.splice(this.followLoading.indexOf(channel.id), 1);
          this.toastService.presentSuccessToastr(resp.message);
          const uid = this.user.id || this.user._id || '';
          if (resp.data) {
            // followed: ensure uid is present as a string
            try {
              if (!channel.followers) channel.followers = [];
              const exists = channel.followers.find((f: any) => {
                if (!f) return false;
                if (typeof f === 'string') return f === uid;
                if (typeof f === 'object') return f._id === uid || f.id === uid;
                return false;
              });
              if (!exists) channel.followers.push(uid);
            } catch (e) { console.warn('Error updating followers after follow', e); }
          } else {
            // unfollow: remove any entries that match uid
            try {
              if (!channel.followers) channel.followers = [];
              channel.followers = channel.followers.filter((f: any) => {
                if (!f) return false;
                if (typeof f === 'string') return f !== uid;
                if (typeof f === 'object') return String(f._id || f.id) !== uid;
                return true;
              });

              // If we are in the followed list, remove it from the channels array directly
              if (this.type === 'followed') {
                this.channels = this.channels.filter(c => c.id !== channel.id);
              }
            } catch (e) { console.warn('Error updating followers after unfollow', e); }
          }
        },
        err => {
          this.followLoading.splice(this.followLoading.indexOf(channel.id), 1);
          this.toastService.presentErrorToastr(err);
        }
      );
  }

  showChannel(channel: Channel) {
    // Ensure owner info is present when navigating from 'mines' (user's own channels)
    const chObj: any = channel.toObject();
    try {
      const hasUser = chObj.user && Object.keys(chObj.user).length > 0;
      if (!hasUser && this.type === 'mines' && this.authUserId) {
        chObj.user = { _id: this.authUserId, id: this.authUserId };
      }
    } catch (e) {}

    this.router.navigate(['/tabs/channels/channel'], {
      queryParams: {
        channel: JSON.stringify(chObj)
      }
    });
  }
}
