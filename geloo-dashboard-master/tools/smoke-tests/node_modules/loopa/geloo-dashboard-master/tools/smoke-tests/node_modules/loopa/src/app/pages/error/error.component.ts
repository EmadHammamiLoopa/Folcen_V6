import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-error',
  templateUrl: './error.component.html',
  styleUrls: ['./error.component.scss'],
})
export class ErrorComponent implements OnInit {

  type: string;
  data: any;

  constructor(private route: ActivatedRoute, private router: Router) { }

  ngOnInit() {
    this.getType();
  }

  getType(){
    this.route.paramMap.subscribe(
      params => {
        this.type = params.get('type');
        this.route.queryParamMap.subscribe(
          query => {
            console.log(query.get('data'));

            this.data = JSON.parse(query.get('data'));
          }
        )
      }
    )
  }

  reload(){
    this.router.navigateByUrl('/tabs/profile')
  }

  openUrl(url, target = '_system'){
    window.open(encodeURI(url), target, 'location=yes');
  }
}
