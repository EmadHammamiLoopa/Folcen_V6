import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-alert',
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.scss']
})
export class AlertComponent implements OnInit, OnChanges {

  @Input() title: string;
  @Input() message: string;
  @Input() type: string;

  color: string;
  icon: string;

  constructor() { }

  ngOnInit(): void {
  }

  ngOnChanges(changes: SimpleChanges){
    if(changes.type){
      this.setColor();
    }
  }

  setColor(){
    switch (this.type) {
      case 'success':
        this.color = 'green';
        this.icon = 'fas fa-check';
        break;
      case 'info':
        this.color = 'blue';
        this.icon = 'fas fa-info';
        break;
      case 'danger':
        this.color = 'red';
        this.icon = 'fas fa-times';
        break;

      default:
        break;
    }
  }

}
