import { Button } from './../../models/Button';
import { List } from './../../models/List';
import { Header } from './../../models/Header';
import Swal from 'sweetalert2';
import { NotificationService } from './../../services/notification.service';
import { DataService } from './../../services/data.service';
import { Component, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-display',
  templateUrl: './display.component.html',
  styleUrls: ['./display.component.scss']
})

export class DisplayComponent implements OnInit {

  @Input() singleName: string;
  @Input() icon: string;
  @Input() deleteURL
  @Input() headers: Header[] = undefined;
  @Input() retrieveURL: string;
  @Input() redirectURL: string;
  @Input() editLink: string;
  @Input() buttons: Button[] = [];
  @Input() list: List = undefined;

  data: any;
  loading = false;
  dataId: string;
  error: string;

  constructor(private route: ActivatedRoute, private dataService: DataService, private router: Router,
              private notification: NotificationService) { }

  ngOnInit(): void {
    this.getDataId();
  }

  getDataId() {
    // Retrieve the parameter from the route
    this.route.paramMap.subscribe(params => {
      console.log('Incoming route parameters:', params.keys, params);
      // Prefer path params but fall back to query param `id` to support different navigation styles
      this.dataId = params.get('subscriptionId') || params.get('id') || params.get('_id') || this.route.snapshot.queryParamMap.get('id');
      console.log('Retrieved dataId:', this.dataId); // Debugging log

      if (!this.dataId) {
        console.error('dataId is null or undefined. Skipping getData.');
        this.error = 'Invalid or missing ID provided.';
        return; // Prevent further execution
      }

      this.getData(); // Fetch the data if an ID was found
    });
  }
  

  getData(){
    const url = this.retrieveURL.replace(/:id/g, this.dataId);
    this.error = undefined;
    this.dataService.sendGetRequest(url, {})
    .subscribe(
      (resp: any) => {
        this.loading = false;
        // support nested response shapes
        this.data = (resp && resp.data && resp.data.user) ? resp.data.user : (resp && resp.user) ? resp.user : (resp && resp.data) ? resp.data : resp;
        console.log(this.data);
        
      },
      err => {
        err = err.error;
        this.loading = false;
        this.error = err;
      }
    )
  }

  // compute avatar URL similar to table.getAvatar
  getAvatar(row: any, name: string): string {
    const v = row && row[name] ? row[name] : null;
    const backendRoot = (this.dataService as any).apiUrl ? (this.dataService as any).apiUrl.replace(/\/api\/v1\/?$/i, '') : '';
    const defaultAvatar = backendRoot + '/public/images/avatars/other.webp';
    if (!v) return defaultAvatar;
    if (typeof v === 'string') {
      if (v.startsWith('http://') || v.startsWith('https://')) return v;
      if (v.startsWith('/')) return backendRoot + v;
      return backendRoot + '/' + v;
    }
    if (Array.isArray(v) && v.length) return this.getAvatar({ [name]: v[0] }, name);
    if (v.url) return (v.url.startsWith('http') ? v.url : backendRoot + v.url);
    if (v.path) return (v.path.startsWith('http') ? v.path : backendRoot + v.path);
    if (v.mainAvatar) return (v.mainAvatar.startsWith('http') ? v.mainAvatar : backendRoot + v.mainAvatar);
    if (v.avatar && Array.isArray(v.avatar) && v.avatar.length) return this.getAvatar({ [name]: v.avatar[0] }, name);
    return defaultAvatar;
  }

  showErrorMessage(message){
    this.notification.showError(message, 'Error');
  }

  showSuccessMessage(message){
    this.notification.showSuccess(message, 'Success');
  }

  showConf(button: Button){
    return Swal.fire(button.confirmation)
  }

  handleBtn(button: Button){
    if(button.confirmation){
      this.showConf(button)
      .then(
        res => {
          if(res.isConfirmed){
            if(typeof res.value == 'string'){
              const data = {};
              data[button.confirmation.inputAttributes.name] = res.value;
              this.btnGuideEvent(button, data);
            }
            else this.btnGuideEvent(button);
          }
        }
      )
    }else this.btnGuideEvent(button);
  }

  btnGuideEvent(button: Button, data = {}){
    button.request ? this.doRequest(button, data) : this.navigateBtn(button)
  }

  navigateBtn(button: Button) {
    let link: string;
  
    if (typeof button.link === 'string') {
      // If `link` is a string, replace placeholders
      link = button.link.replace(/:id/g, this.dataId);
    } else if (typeof button.link === 'function') {
      // If `link` is a function, call it with the row data
      link = button.link(this.data);
    } else {
      console.error('Invalid link type:', button.link);
      return; // Exit if link is not a valid string or function
    }
  
    this.router.navigateByUrl(link);
  }
  

  doRequest(button: Button, data = {}){
    const url = button.request.url.replace(/:id/g, this.dataId)
    this.dataService.sendRequest(button.request.methode, url, data)
    .subscribe(
      (resp: any) => {
        if(button.request.redirectURL)
          this.router.navigateByUrl(button.request.redirectURL)

        this.getData();
        this.showSuccessMessage(resp.message);
      },
      err => {
        this.showErrorMessage(err.error);
      }
    )
  }

  getId(v: any): string {
    if (!v) return '';
    // If it's a row object, try to get _id or id
    if (typeof v === 'object' && !Array.isArray(v) && (v._id || v.id)) {
      return this.getId(v._id || v.id);
    }
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      if (v.$oid) return String(v.$oid);
      if (v.toHexString && typeof v.toHexString === 'function') return v.toHexString();
      
      // Handle Buffer-like objects from Mongoose/BSON
      const buf = v.buffer || v.data || v;
      if (buf && (typeof buf === 'object' || Array.isArray(buf))) {
        const keys = Object.keys(buf).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
        if (keys.length >= 12) {
          return keys.map(k => Number(buf[k]).toString(16).padStart(2, '0')).join('');
        }
      }
      
      if (v._id) return this.getId(v._id);
      if (v.id) return this.getId(v.id);
    }
    // Fallback to string representation but avoid [object Object]
    const s = String(v);
    return s === '[object Object]' ? '' : s;
  }

  navigateToLink(header: any) {
    const linkParts = header.link.split(':');
    const resolvedLink = linkParts.map((el, ind) => {
      if (ind % 2 === 0) return el;
      // Extract ID safely from the data property
      return this.getId(this.data[el]);
    }).join('');
    
    console.log('Navigating to resolved link:', resolvedLink);
    this.router.navigateByUrl(resolvedLink);
  }

  listNavigateToLink(button: any, row: any): void {
    console.log('Row received in listNavigateToLink:', row);
  
    // Convert row to object if it's a string (assume it's an ID)
    if (typeof row === 'string') {
      row = { _id: row };
      console.log('Row is a string. Converting it to an object with _id:', row);
    }
  
    let link: string | null;
    if (typeof button.link === 'function') {
      link = button.link(row); // Call the function to resolve the link
    } else if (typeof button.link === 'string') {
      const id = this.getId(row);
      link = button.link.replace(/:id/g, id).replace(/:_id/g, id);
    } else {
      link = button.link;
    }
  
    console.log('Resolved link:', link);
    if (!link) {
      console.error('Invalid link. Navigation aborted.');
      return;
    }
  
    this.router.navigateByUrl(link);
  }
  
  
  handleReportAction(row: any, action: string): void {
    const id = this.getId(row);
    console.log("Handling report action:", action, "for report ID:", id);

    const url = `report/report/${id}/action`; // Updated to match backend route
    const payload = { action };
  
    this.dataService.sendRequest('post', url, payload).subscribe(
      (resp: any) => {
        console.log("Response received:", resp);
        this.showSuccessMessage(resp.message);
        
        // Update local data to reflect changes
        row.solved = true;
        row.status = "Resolved";
  
        // Refresh the report list
        this.getData();
      },
      (err) => {
        console.error('Error handling report action:', err);
        this.showErrorMessage(err.error || 'Failed to process the action');
      }
    );
  }
  
  
  

  allowToShowBtn(button: Button): boolean{
    if(button.condition){
      const inverse = button.condition.includes('!')
      const elem = button.condition.replace('!', '')
      return inverse ? !this.data[elem] : this.data[elem]
    }else {
      return true;
    }
  }
}
