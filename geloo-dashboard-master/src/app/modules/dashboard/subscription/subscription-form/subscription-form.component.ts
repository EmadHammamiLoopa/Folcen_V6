import { JsonService } from './../../../../services/json.service';
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-subscription-form',
  templateUrl: './subscription-form.component.html',
  styleUrls: ['./subscription-form.component.scss']
})
export class SubscriptionFormComponent implements OnInit {

  currencies: any = {}; // Adjusted to handle both array and object structures.
  headers: any[] = [];
  error = false;
  errorMessage: string = '';

  constructor(private jsonService: JsonService) { }

  ngOnInit(): void {
    this.getJsonData();
  }

  getJsonData(){
    this.jsonService.getCurrencies()
      .subscribe(resp => {
        this.currencies = resp;
        if (Object.keys(this.currencies).length === 0) {
          this.errorMessage = 'No currencies available';
          this.error = true;
          return;
        }
        this.initializeHeaders();
      }, err => {
        this.showServerError('Failed to load currencies. Please try again later.');
      });
  }

  showServerError(message: string){
    this.error = true;
    this.errorMessage = message;
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
        name: "offers",
        title: "Offers",
        type: 'input-list',
        value: ['']
      },
      {
        name: "dayPrice",
        title: "Day Price",
        type: 'number',
        width: '1/2',
        value: 0
      },
      {
        name: "weekPrice",
        title: "Week Price",
        type: 'number',
        width: '1/2',
        value: 0
      },
      {
        name: "monthPrice",
        title: "Month Price",
        type: 'number',
        width: '1/2',
        value: 0
      },
      {
        name: "yearPrice",
        title: "Year Price",
        type: 'number',
        width: '1/2',
        value: 0
      },
      {
        name: "currency",
        title: "Currency",
        type: 'select',
        options: Array.isArray(this.currencies) ? this.currencies : Object.keys(this.currencies), // Flexible handling
        value: Array.isArray(this.currencies) ? this.currencies[0] : Object.keys(this.currencies)[0]
      },
    ];
  }

  changeHeaders(headers){
    this.headers = headers;
  }

}
