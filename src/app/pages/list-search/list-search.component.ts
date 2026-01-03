import { Component, OnInit, Input } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-list-search',
  templateUrl: './list-search.component.html',
  styleUrls: ['./list-search.component.scss'],
})
export class ListSearchComponent implements OnInit {
  @Input() data: any[];
  @Input() title: string;
  @Input() multiSelect: boolean = false;
  @Input() maxSelection: number = 0; // 0 means no limit

  searchTerm: string = '';
  paginatedData: any[] = [];
  pageSize: number = 20;
  currentPage: number = 0;
  selectedItems: any[] = [];

  constructor(private modalCtrl: ModalController) {}

  ngOnInit() {
    console.log('ListSearchComponent initialized with data:', this.data);

    // Normalize incoming data into an array of items suitable for display.
    // Acceptable input shapes:
    // - Array of strings: ['Afghanistan','Albania']
    // - Array of objects: [{ name: 'Afghanistan', values: [...] }, ...]
    // - Object mapping: { Afghanistan: [...], Albania: [...] }
    // - Array with single mapping object: [ { Afghanistan: [...], Albania: [...] } ]
    let src = this.data || [];

    // If src is a stringified JSON representing an object, parse it
    if (typeof src === 'string') {
      try {
        const parsed = JSON.parse(src);
        src = parsed;
      } catch (e) {
        // leave as string
      }
    }

    // If src is an array with a single mapping-object element, unwrap it
    if (Array.isArray(src) && src.length === 1 && src[0] && typeof src[0] === 'object' && !src[0].name && Object.keys(src[0]).length > 1) {
      const obj = src[0];
      src = Object.keys(obj).map(k => ({ name: k, values: obj[k] }));
    }

    // If src is an object mapping country -> list, convert to array
    if (!Array.isArray(src) && src && typeof src === 'object') {
      src = Object.keys(src).map(k => ({ name: k, values: src[k] }));
    }

    this.data = Array.isArray(src) ? src : [src];
    this.paginatedData = (this.data || []).slice(0, this.pageSize);
  }

  // Derive a human-friendly label for an item (handles string, object with name/label/title, or first-string-property)
  getLabel(item: any): string {
    if (item === null || item === undefined) return '';
    if (typeof item === 'string') {
      const s = item.trim();
      // If the string looks like JSON object, try to parse and extract a friendly label
      if (s.startsWith('{') && s.endsWith('}')) {
        try {
          const parsed = JSON.parse(s);
          if (parsed && typeof parsed === 'object') {
            const keys = Object.keys(parsed);
            if (keys.length === 1 && Array.isArray(parsed[keys[0]])) return keys[0];
            if (typeof parsed.name === 'string') return parsed.name;
          }
        } catch (e) {
          // not valid JSON, fall back to raw string
        }
      }
      return item;
    }
    if (typeof item === 'object') {
      // Handle objects like { "CountryName": [ ... ] } -> show the country name
      const keys = Object.keys(item);
      if (keys.length === 1 && Array.isArray(item[keys[0]])) {
        return keys[0];
      }
      if (typeof item.name === 'string' && item.name.trim()) return item.name;
      if (typeof item.label === 'string' && item.label.trim()) return item.label;
      if (typeof item.title === 'string' && item.title.trim()) return item.title;
      if (typeof item.school === 'string' && item.school.trim()) return item.school;
      // fallback: return first string property value
      for (const k of Object.keys(item)) {
        if (typeof item[k] === 'string' && item[k].trim()) return item[k];
      }
      try {
        return JSON.stringify(item);
      } catch (e) {
        return String(item);
      }
    }
    return String(item);
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  confirm() {
    this.modalCtrl.dismiss(this.selectedItems);
  }

  selectData(item) {
    if (this.multiSelect) {
      const index = this.selectedItems.indexOf(item);
      if (index > -1) {
        this.selectedItems.splice(index, 1);
      } else {
        if (this.maxSelection > 0 && this.selectedItems.length >= this.maxSelection) {
          // Optional: show a toast or alert if limit reached
          return;
        }
        this.selectedItems.push(item);
      }
    } else {
      this.modalCtrl.dismiss(item);
    }
  }

  isSelected(item) {
    return this.selectedItems.includes(item);
  }

  search(event: Event) {
    const searchTerm = (event.target as HTMLInputElement).value;
    this.searchTerm = searchTerm;
    this.currentPage = 0;
  
    if (searchTerm && searchTerm.trim() !== '') {
      const q = searchTerm.toLowerCase();
      this.paginatedData = (this.data || [])
        .filter(item => this.getLabel(item).toLowerCase().includes(q))
        .slice(0, this.pageSize);
    } else {
      this.paginatedData = (this.data || []).slice(0, this.pageSize);
    }
  }
  

  loadMore(event) {
    setTimeout(() => {
      this.currentPage++;
      const newItems = this.data.slice(this.currentPage * this.pageSize, (this.currentPage + 1) * this.pageSize);
      this.paginatedData = this.paginatedData.concat(newItems);
      // guard against undefined data
      if (!Array.isArray(newItems) || newItems.length === 0) {
        event.target.disabled = true;
      }
      event.target.complete();

      // If no more new items, disable the infinite scroll
      if (newItems.length < this.pageSize) {
        event.target.disabled = true;
      }
    }, 500);
  }
}
