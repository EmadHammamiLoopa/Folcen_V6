import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { JsonService } from 'src/app/services/json.service';
import { ListSearchComponent } from '../../list-search/list-search.component';

@Component({
  selector: 'app-search-options',
  templateUrl: './search-options.component.html',
  styleUrls: ['./search-options.component.scss'],
})
export class SearchOptionsComponent implements OnInit {
  
  @Input() gender = 'both';
  @Input() checkItems;
  @Input() minAge: number | null = null;
  @Input() maxAge: number | null = null;
  @Input() interests: string = '';
  @Input() languages: string = '';
  @Input() online: boolean = false;
  @Input() options: any = null;
  @Input() isRandomMode: boolean = false;

  interestsList: string[] = [];
  languagesList: string[] = [
    'English', 'French', 'Spanish', 'German', 'Arabic', 'Chinese', 'Japanese', 
    'Russian', 'Portuguese', 'Italian', 'Turkish', 'Hindi', 'Dutch'
  ];

  interestsChips: string[] = [];
  languagesChips: string[] = [];
  checkItemsNames: string[] = [];

  constructor(
    public modalCtrl: ModalController,
    private jsonService: JsonService
  ) { }

  ngOnInit() {
    this.loadInterests();
    // ensure checkItems is an object so toggles bind safely
    if (!this.checkItems || typeof this.checkItems !== 'object') this.checkItems = {};
    this.checkItemsNames = Object.keys(this.checkItems || {});
    
    if (this.interests) {
      this.interestsChips = this.interests.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (this.languages) {
      this.languagesChips = this.languages.split(',').map(s => s.trim()).filter(Boolean);
    }
    // Normalize incoming checkItems values to booleans so ion-toggle binds correctly
    if (this.checkItems && this.checkItemsNames && this.checkItemsNames.length) {
      this.checkItemsNames.forEach(k => {
        try {
          const v = this.checkItems[k];
          this.checkItems[k] = (v === true || v === 1 || v === '1');
        } catch (e) {
          console.warn('Failed to normalize checkItem', k, e);
          this.checkItems[k] = false;
        }
      });
    }

    // no selects for profession/education here — toggles only
  }

  async loadInterests() {
    try {
      this.interestsList = await this.jsonService.getInterests();
    } catch (e) {
      console.error('Could not load interests', e);
    }
  }

  async openInterestsModal() {
    const modal = await this.modalCtrl.create({
      component: ListSearchComponent,
      componentProps: {
        data: this.interestsList,
        title: 'Select Interests',
        multiSelect: true
      }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data && Array.isArray(data)) {
      data.forEach(item => {
        const val = typeof item === 'string' ? item : item.name;
        if (val && !this.interestsChips.includes(val)) {
          this.interestsChips.push(val);
        }
      });
    }
  }

  async openLanguagesModal() {
    const modal = await this.modalCtrl.create({
      component: ListSearchComponent,
      componentProps: {
        data: this.languagesList,
        title: 'Select Languages',
        multiSelect: true
      }
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();
    if (data && Array.isArray(data)) {
      data.forEach(item => {
        const val = typeof item === 'string' ? item : item.name;
        if (val && !this.languagesChips.includes(val)) {
          this.languagesChips.push(val);
        }
      });
    }
  }

  removeInterest(i: number) {
    this.interestsChips.splice(i, 1);
  }

  removeLanguage(i: number) {
    this.languagesChips.splice(i, 1);
  }

  // Reset form fields to defaults and apply
  reset() {
    this.gender = 'both';
    this.minAge = null;
    this.maxAge = null;
    this.interestsChips = [];
    this.languagesChips = [];
    // Clear raw inputs too so submit() won't fall back to stale input props
    this.interests = '';
    this.languages = '';
    this.online = false;
    if (this.checkItemsNames && this.checkItemsNames.length) {
      this.checkItemsNames.forEach(k => {
        try { this.checkItems[k] = false; } catch (e) { /* ignore */ }
      });
    }
    // Clear persisted filters so next open uses defaults
    try { localStorage.removeItem('friend_search_last_filters'); } catch (e) { /* ignore */ }
    try { (window as any).nativeStorage && (window as any).nativeStorage.remove('friend_search_last_filters'); } catch (e) { /* ignore */ }
    console.log('SearchOptionsComponent.reset(): clearing persisted filters and dismissing');
    // Signal parent that filters were reset so it can refresh and clear any persisted snapshot
    this.modalCtrl.dismiss({ reset: true });
  }

  // No preset saving — just submit the selected filters
  submit(){
    // Ensure checkItems are converted to '1'/'0' strings reliably
    if (!this.checkItemsNames || !this.checkItemsNames.length) this.checkItemsNames = Object.keys(this.checkItems || {});
    this.checkItemsNames.forEach(item => {
      const v = this.checkItems[item];
      this.checkItems[item] = (v === true || v === 1 || v === '1') ? '1' : '0';
    });

    const data: any = { gender: this.gender, ...(this.checkItems || {}) };
    console.log('SearchOptionsComponent.submit(): dismissing modal with data', data);

    // profession/education are provided via checkItems toggles (already spread into data)

    if (this.minAge) data.minAge = String(this.minAge);
    if (this.maxAge) data.maxAge = String(this.maxAge);
    // prefer chips arrays if available (nicer UX), fall back to raw input
    if (this.interestsChips && this.interestsChips.length) data.interests = this.interestsChips.join(',');
    else if (this.interests && this.interests.trim()) data.interests = this.interests.split(',').map(s => s.trim()).filter(Boolean).join(',');

    if (this.languagesChips && this.languagesChips.length) data.languages = this.languagesChips.join(',');
    else if (this.languages && this.languages.trim()) data.languages = this.languages.split(',').map(s => s.trim()).filter(Boolean).join(',');

    if (this.online || this.isRandomMode) data.online = '1';

    // Persist empty/cleared filters as explicit empty values so parent can store exact snapshot
    data.minAge = (this.minAge !== null && this.minAge !== undefined) ? String(this.minAge) : '';
    data.maxAge = (this.maxAge !== null && this.maxAge !== undefined) ? String(this.maxAge) : '';

    // Ensure explicit keys exist so parent can persist exact snapshot for toggles and lists
    if (data.profession === undefined) data.profession = this.checkItems && this.checkItems.profession ? this.checkItems.profession : '0';
    if (data.education === undefined) data.education = this.checkItems && this.checkItems.education ? this.checkItems.education : '0';
    if (data.interests === undefined) data.interests = '';
    if (data.languages === undefined) data.languages = '';
    if (data.online === undefined) data.online = this.online ? '1' : '0';

    this.modalCtrl.dismiss(data);
  }

}
