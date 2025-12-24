import { DataService } from './../../services/data.service';
import { UserService } from './../../services/user.service';
import { Component, Input, OnInit, Output, EventEmitter, OnChanges, SimpleChange, SimpleChanges } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-form',
  templateUrl: './form.component.html',
  styleUrls: ['./form.component.scss']
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
        this.data = (resp && resp.data && resp.data.user) ? resp.data.user : (resp && resp.user) ? resp.user : (resp && resp.data) ? resp.data : resp;
        console.log(resp.data);
        this.setHeaderValues();
      },
      err => {
        err = err.error;
        this.loading = false;
        this.error = err;
        console.log(err);
      }
    )
  }

  setHeaderValues(){
    this.headersChanged.emit(this.headers.map(header => {
      // Prefer direct field, then nested user field
      const val = (this.data && this.data[header.name]) !== undefined ? this.data[header.name] : (this.data && this.data.user && this.data.user[header.name]) ? this.data.user[header.name] : undefined;
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
    const defaultAvatar = './../../../assets/user.jpeg';
    if (!v) return defaultAvatar;
    if (typeof v === 'string') {
      if (v.startsWith('http://') || v.startsWith('https://')) return v;
      if (v.startsWith('/')) return backendRoot + v;
      return backendRoot + '/' + v;
    }
    if (Array.isArray(v) && v.length) return this.getAvatarUrl(v[0]);
    if (v.url) return v.url.startsWith('http') ? v.url : backendRoot + v.url;
    if (v.path) return v.path.startsWith('http') ? v.path : backendRoot + v.path;
    if (v.mainAvatar) return v.mainAvatar.startsWith('http') ? v.mainAvatar : backendRoot + v.mainAvatar;
    if (v.avatar && Array.isArray(v.avatar) && v.avatar.length) return this.getAvatarUrl(v.avatar[0]);
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
    err = err.error;
    if(err.errors){
      this.errors = err.errors;
      this.error = "Invalid data";
    }
    else this.error = err;
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
