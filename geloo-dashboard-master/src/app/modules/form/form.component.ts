import { DataService } from './../../services/data.service';
import { UserService } from './../../services/user.service';
import { AvatarUrlUtil } from './../../utils/avatar-url-util';
import { Component, Input, OnInit, Output, EventEmitter, OnChanges, SimpleChange, SimpleChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
    selector: 'app-form',
    templateUrl: './form.component.html',
    styleUrls: ['./form.component.scss'],
    standalone: false
})
export class FormComponent implements OnInit, OnChanges {

  @Input() singleName: string;
  @Input() plurarName: string;

  @Input() retrieveURL: string;
  @Input() storeURL: string;
  @Input() updateURL: string;
  @Input() redirectLink: string;

  @Input() headers: {
    name: string,
    title: string,
    type?: string,
    width?: string,
    hidden?: boolean,
    readonly?: boolean,
    options?: string[],
    values?: string[],
    value?: any
  }[] = undefined;
  @Input() icon = "";
  @Output() headersChanged = new EventEmitter();
  @Output() onChange = new EventEmitter();

  imagesUrl = {};
  errors: any;
  error: string;
  loading = true;
  saveLoading = false;
  type: string;
  dataId: string;
  data;

  constructor(private sanitizer: DomSanitizer, private dataService: DataService, private router: Router,
              private route: ActivatedRoute) { }

  ngOnInit(): void {
  }

  ngOnChanges(changes: SimpleChanges){
    if(!this.type && this.headers && this.headers.length) this.getFormType();
  }

  getFormType(){
    this.route.paramMap
    .subscribe(
      params => {
        this.type = params.get('type');
        if(this.type == 'edit'){
          this.route.queryParamMap
          .subscribe(
            query => {
              this.dataId = query.get('id');
              this.getData();
            }
          )
        }else this.loading = false;
      }
    )
  }

  getData(){
    const url = this.retrieveURL.replace(/:id/g, this.dataId);
    this.error = undefined;
    this.dataService.sendGetRequest(url, {})
    .subscribe(
      (resp: any) => {
        this.loading = false;
        // Support different backend shapes: resp.data.user, resp.user, or resp.data
        const pName = (this.plurarName || '').toLowerCase();
        if (pName === 'users') {
          this.data = (resp && resp.data && resp.data.user) ? resp.data.user : (resp && resp.user) ? resp.user : (resp && resp.data) ? resp.data : resp;
        } else if (pName === 'comments') {
          this.data = (resp && resp.data && resp.data.comment) ? resp.data.comment : (resp && resp.comment) ? resp.comment : (resp && resp.data) ? resp.data : resp;
        } else {
          this.data = (resp && resp.data) ? resp.data : resp;
        }
        console.log('Form data loaded:', this.data);
        this.setHeaderValues();
      },
      err => {
        const errorMsg = err.error && err.error.message ? err.error.message : (typeof err.error === 'string' ? err.error : 'Failed to load data');
        this.loading = false;
        this.error = errorMsg;
        console.log('Error loading form data:', err);
      }
    )
  }

  setHeaderValues(){
    this.headersChanged.emit(this.headers.map(header => {
      // Prefer direct field, then nested user field
      let val = (this.data && this.data[header.name]) !== undefined ? this.data[header.name] : (this.data && this.data.user && this.data.user[header.name]) !== undefined ? this.data.user[header.name] : undefined;
      
      // Special handling for boolean fields to ensure they are not treated as undefined when false
      if (header.type === 'boolean' && val === undefined) {
        val = false;
      }

      this.fieldChanged(header.name, val)
      if(header.type == 'avatar' || header.type == 'image'){
        this.imagesUrl[header.name] = this.getAvatarUrl(val);
        return header;
      }
      let value = val;
      return{
        ...header,
        value
      }
    }))
  }

  getAvatarUrl(v: any): string {
    const backendRoot = this.dataService ? (this.dataService as any).apiUrl ? (this.dataService as any).apiUrl.replace(/\/api\/v1\/?$/i, '') : '' : '';
    
    // If it's a user object or has user-like avatar fields, use AvatarUrlUtil
    if (v && (v.avatarStyle || v.mainAvatar || v.avatarSeed)) {
      return AvatarUrlUtil.getAvatarUrl(v, backendRoot);
    }

    const defaultAvatar = './../../../assets/user.jpeg';
    if (!v) return defaultAvatar;
    
    let url = '';
    if (typeof v === 'string') {
      if (v.startsWith('http://') || v.startsWith('https://')) url = v;
      else if (v.startsWith('/')) url = backendRoot + v;
      else url = backendRoot + '/' + v;
    } else if (Array.isArray(v) && v.length) {
      return this.getAvatarUrl(v[0]);
    } else if (v.url) {
      url = v.url.startsWith('http') ? v.url : backendRoot + v.url;
    } else if (v.path) {
      url = v.path.startsWith('http') ? v.path : backendRoot + v.path;
    } else if (v.mainAvatar) {
      url = v.mainAvatar.startsWith('http') ? v.mainAvatar : backendRoot + v.mainAvatar;
    } else if (v.avatar && Array.isArray(v.avatar) && v.avatar.length) {
      return this.getAvatarUrl(v.avatar[0]);
    }

    if (url) {
      // Add cache-busting timestamp if updatedAt exists
      if (this.data && this.data.updatedAt) {
        const timestamp = new Date(this.data.updatedAt).getTime();
        url += (url.includes('?') ? '&' : '?') + 't=' + timestamp;
      }
      return url;
    }
    return defaultAvatar;
  }

  fieldChanged(name: string, value){
    this.onChange.emit({name, value});
  }

  addTag(header, event){
    const value = event.target.value;
    if(!header.value.includes(value)) header.value.push(value);
  }

  removeTag(header, tagInd){
    header.value.splice(tagInd, 1);
  }

  setImage(header, $event){
    const image = $event.target.files[0];
    this.imagesUrl[header.name] = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(image));
    header.value = image;
  }

  getFormData(values){
    const formData = new FormData();
    this.headers.forEach(header => {
      switch (header.type) {
        case 'image':
        case 'avatar':{
          if(header.value){
            formData.append(header.name, header.value, 'image')
          }
          break;
        }
        case 'select-tags':
          formData.append(header.name, header.value);
          break;
        case 'input-list': {
          const list = header.value.filter(val => val.length)
          formData.append(header.name, JSON.stringify(list));
          break;
        }

        default:
          formData.append(header.name, header.value)
          break;
      }
    })
    return formData;
  }

  beforeRequest(){
    this.error = undefined;
    this.errors = undefined;
    this.saveLoading = true;
  }

  handleResponse(resp){
    this.router.navigate([this.redirectLink], {
      queryParams: {
        flashMessage: resp.message
      }
    })
    this.saveLoading = false;
  }

  handleError(err){
    this.saveLoading = false;

    // DataService normalizes HTTP failures to
    // { message, status, errorCode, detail, url }.
    // Preserve support for direct HttpErrorResponse-shaped errors as well.
    const responseBody =
      err && err.detail && err.detail.error !== undefined
        ? err.detail.error
        : (err && err.error !== undefined ? err.error : null);

    const validationErrors =
      responseBody &&
      typeof responseBody === 'object' &&
      responseBody.errors &&
      typeof responseBody.errors === 'object'
        ? responseBody.errors
        : null;

    if (validationErrors) {
      this.errors = validationErrors;
      this.error = "Invalid data";
    } else {
      this.errors = undefined;

      const candidate =
        (err && typeof err.message === 'string' && err.message) ||
        (responseBody &&
          typeof responseBody === 'object' &&
          typeof responseBody.message === 'string' &&
          responseBody.message) ||
        (responseBody &&
          typeof responseBody === 'object' &&
          typeof responseBody.errors === 'string' &&
          responseBody.errors) ||
        (typeof responseBody === 'string' && responseBody) ||
        'Request failed';

      this.error = candidate;
    }

    const timer = setInterval(() => {
      if(document.body.scrollTop) document.body.scrollTop = --document.documentElement.scrollTop;
      else clearInterval(timer)
    }, 10)
  }

  updateUser(values){
    this.beforeRequest();
    const url = this.updateURL.replace(/:id/g, this.dataId);
    this.dataService.sendPutRequest(url, this.getFormData(values))
    .subscribe(
      resp => {
        this.handleResponse(resp);
      },
      err => {
        this.handleError(err)
      }
    )
  }
  trackByIndex(index: number, obj: any): any {
    return index;
  }
  storeUser(values){
    this.beforeRequest();
    this.dataService.sendPostRequest(this.storeURL, this.getFormData(values))
    .subscribe(
      resp => {
        this.handleResponse(resp);
      },
      err => {
        this.handleError(err)
      }
    )
  }

  addElemToList(header, ind){
    header.value.push('');
  }

  removeElemFromList(header, ind){
    header.value.splice(ind, 1);
  }

}
