import { JsonService } from './../../../../services/json.service';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-plan-rule-form',
  templateUrl: './plan-rule-form.component.html',
  styleUrls: ['./plan-rule-form.component.scss']
})
export class PlanRuleFormComponent implements OnInit {

  countries: any = {};
  currencies: any = {};
  headers: any[] = [];
  error = false;

  constructor(private jsonService: JsonService) { }

  ngOnInit(): void {
    this.getJsonData();
  }

  getJsonData(){
    this.jsonService.getCountries()
    .subscribe(resp => {
      this.countries = resp;
      this.jsonService.getCurrencies()
      .subscribe(resp => {
        this.currencies = resp;
        this.initializeHeaders();
      })
    }, err => this.error = true);
  }

  initializeHeaders(){
    this.headers = [
      {
        name: "id",
        title: "ID",
        hidden: true,
        value: ''
      },
      {
        name: "name",
        title: "Rule Name",
        type: 'text',
        value: ''
      },
      {
        name: "type",
        title: "Rule Type",
        type: 'select',
        options: ['FREE_PLAN', 'PRICE_OVERRIDE'],
        value: 'FREE_PLAN'
      },
      {
        name: "priority",
        title: "Priority (Higher = stronger)",
        type: 'number',
        value: 0
      },
      {
        name: "isActive",
        title: "Is Active",
        type: 'boolean',
        options: ['No', 'Yes'],
        value: true
      },
      {
        name: "expiresAt",
        title: "Expires At (Optional)",
        type: 'date',
        value: ''
      },
      {
        name: "targetCountries",
        title: "Target Countries",
        type: 'input-list',
        value: ['']
      },
      {
        name: "targetCities",
        title: "Target Cities",
        type: 'input-list',
        value: ['']
      },
      {
        name: "targetRoles",
        title: "Target Roles (e.g. ADMIN, USER)",
        type: 'input-list',
        value: ['']
      },
      {
        name: "targetUsers",
        title: "Target User IDs",
        type: 'input-list',
        value: ['']
      },
      {
        name: "dayPrice",
        title: "Day Price (for PRICE_OVERRIDE)",
        type: 'number',
        width: '1/2',
        value: 0
      },
      {
        name: "weekPrice",
        title: "Week Price (for PRICE_OVERRIDE)",
        type: 'number',
        width: '1/2',
        value: 0
      },
      {
        name: "monthPrice",
        title: "Month Price (for PRICE_OVERRIDE)",
        type: 'number',
        width: '1/2',
        value: 0
      },
      {
        name: "yearPrice",
        title: "Year Price (for PRICE_OVERRIDE)",
        type: 'number',
        width: '1/2',
        value: 0
      },
      {
        name: "currency",
        title: "Currency (for PRICE_OVERRIDE)",
        type: 'select',
        options: Object.keys(this.currencies),
        value: Object.keys(this.currencies)[0]
      }
    ];
  }

  changeHeaders(headers){
    this.headers = headers;
  }
}
