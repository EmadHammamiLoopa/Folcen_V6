import { JsonService } from './../../../../services/json.service';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-channel-form',
  templateUrl: './channel-form.component.html',
  styleUrls: ['./channel-form.component.scss']
})
export class ChannelFormComponent implements OnInit {


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
        name: "name",
        title: "name",
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
        name: "approved",
        title: "approvement",
        type: 'boolean',
        options: ['not approved', 'approved'],
        value: true
      },
      {
        name: "enabled",
        title: "status",
        type: 'boolean',
        options: ['disabled', 'enabled'],
        value: true
      },
      {
        name: "global",
        title: "Add to all users",
        type: 'checkbox',
        value: false
      }
    ]
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
