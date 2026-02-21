import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-channels-header',
  templateUrl: './channels-header.component.html',
  styleUrls: ['./channels-header.component.scss'],
})
export class ChannelsHeaderComponent implements OnInit {

  constructor(public router: Router) { }

  ngOnInit() {}

  isMines() {
    return this.router.url.includes('/mines');
  }

  isFollowed() {
    return this.router.url.includes('/followed');
  }

}
