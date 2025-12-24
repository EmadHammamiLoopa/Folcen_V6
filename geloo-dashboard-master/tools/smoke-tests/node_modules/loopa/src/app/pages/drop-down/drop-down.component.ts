import { PopoverController } from '@ionic/angular';
import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-drop-down',
  templateUrl: './drop-down.component.html',
  styleUrls: ['./drop-down.component.scss'],
})
export class DropDownComponent implements OnInit {

  @Input() items: {
    text: string,
    icon: string,
    event: string
  }[] = [];

  constructor(private popoverController: PopoverController) { }

  ngOnInit() {}

  dismiss(event){
    this.popoverController.dismiss({event})
  }

}
