import { JsonService } from './../../../../services/json.service';
import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-job-form',
    templateUrl: './job-form.component.html',
    styleUrls: ['./job-form.component.scss'],
    standalone: false
})
export class JobFormComponent implements OnInit {

  countries = {};
  headers = [];
  error = false;

  constructor(private jsonService: JsonService) { }

  ngOnInit(): void {
    this.getJsonData();
  }

  getJsonData(){
    this.jsonService.getCountries()
    .subscribe(resp => {
      this.countries = resp;
      this.initializeHeaders();
    }, err => this.showServerErorr());
  }

  showServerErorr(){
    this.error = true
  }

  initializeHeaders(){
    this.headers = [
      {
        name: "photo",
        title: "",
        type: "image",
        value: ''
      },
      {
        name: "id",
        title: "id",
        hidden: true,
        value: ''
      },
      {
        name: "title",
        title: "title",
        type: 'text',
        value: ''
      },
      {
        name: "description",
        title: "description",
        type: 'textarea',
        value: ''
      },
      {
        name: "country",
        title: "country",
        type: 'select',
        width: '1/2',
        options: Object.keys(this.countries),
        value: Object.keys(this.countries)[0]
      },
      {
        name: "city",
        title: "city",
        type: 'select',
        width: '1/2',
        options: this.countries[Object.keys(this.countries)[0]],
        value: this.countries[Object.keys(this.countries)[0]][0]
      },
      {
        name: "company",
        title: "company",
        type: 'text',
        value: ''
      },
      {
        name: "email",
        title: "E-mail",
        type: 'email',
        value: ''
      },
      {
        name: "enabled",
        title: "status",
        type: 'boolean',
        options: ['disabled', 'enabled'],
        value: true
      }
    ];
  }

  changeHeaders(headers){
    this.headers = headers;
  }

  fieldChanged(event){
    if(event.name == 'country'){
      this.headers = this.headers.map(header => {
        if(header.name == 'city'){
          header.options = this.countries[event.value];
          header.value = this.countries[event.value][0];
        }
        return header;
      });
    }
  }

}
