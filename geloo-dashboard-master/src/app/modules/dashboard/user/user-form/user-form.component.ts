import { JsonService } from './../../../../services/json.service';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-user-form',
  templateUrl: './user-form.component.html',
  styleUrls: ['./user-form.component.scss']
})
export class UserFormComponent implements OnInit {

  countries = {};
  professions = [];
  interests = [];
  education = [];
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
      this.jsonService.getEducation()
      .subscribe((resp: any) => {
        this.education = resp;
        this.jsonService.getProfessions()
        .subscribe((resp: any) => {
          this.professions = resp;
          this.jsonService.getInterests()
          .subscribe((resp: any) => {
            this.interests = resp;
            this.initializeHeaders();
          }, err => this.showServerErorr());
        }, err => this.showServerErorr());
      }, err => this.showServerErorr());
    }, err => this.showServerErorr());
  }

  showServerErorr(){
    this.error = true
  }

  initializeHeaders(){
    this.headers = [
      {
        name: "avatar",
        title: "",
        type: "avatar",
        value: ''
      },
      {
        name: "id",
        title: "#",
        hidden: true,
        value: ''
      },
      {
        name: "firstName",
        title: "first name",
        type: 'text',
        width: '1/2',
        value: ''
      },
      {
        name: "lastName",
        title: "last name",
        type: 'text',
        width: '1/2',
        value: ''
      },
      {
        name: "email",
        title: "E-mail",
        type: 'email',
        value: ''
      },
      {
        name: "password",
        title: "Password",
        width: '1/2',
        type: 'password',
        value: ''
      },
      {
        name: "password_confirmation",
        title: "Password confirmation",
        width: '1/2',
        type: 'password',
        value: ''
      },
      {
        name: "role",
        title: "role",
        type: 'select',
        options: ['USER', 'ADMIN', 'SUPER ADMIN'],
        width: '1/3',
        value: 'USER'
      },
      {
        name: "enabled",
        title: "status",
        type: 'boolean',
        width: '1/3',
        options: ['Disabled', 'Enabled'],
        value: true
      },
      {
        name: "gender",
        title: "gender",
        type: 'select',
        options: ['male', 'female'],
        width: '1/3',
        value: 'male'
      },
      {
        name: "phone",
        title: "phone",
        type: 'text',
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
        name: "birthDate",
        title: "birth date",
        type: 'date',
        value: new Date()
      },
      {
        name: "school",
        title: "school",
        type: 'text',
        width: '1/2',
        value: ''
      },
      {
        name: "education",
        title: "education",
        type: 'select',
        options: this.education,
        width: '1/2',
        value: this.education[0]
      },
      {
        name: "profession",
        title: "profession",
        type: 'select',
        options: this.professions,
        value: this.professions[0]
      },
      {
        name: "interests",
        title: "interests",
        type: 'select-tags',
        options: this.interests,
        value: []
      },
      {
        name: "createdAt",
        title: "Joined Date",
        type: 'text',
        width: '1/2',
        readonly: true,
        value: ''
      },
      {
        name: "lastSeen",
        title: "Last Active",
        type: 'text',
        width: '1/2',
        readonly: true,
        value: ''
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
      console.log(this.headers);

    }
  }

}
