import { IonInfiniteScroll } from '@ionic/angular';
import { ToastService } from './../../../../services/toast.service';
import { JobService } from './../../../../services/job.service';
import { Job } from './../../../../models/Job';
import { ActivatedRoute, Router } from '@angular/router';
import { Component, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent implements OnInit {
  @ViewChild('infinitScroll') infinitScroll: IonInfiniteScroll;

  pageLoading = false;
  jobs: Job[];
  page: number;
  searchQuery: string;
  type: string;

  constructor(private jobService: JobService, private toastService: ToastService,private route: ActivatedRoute,
              private router: Router) { }

  ngOnInit() {
  }

  ionViewWillEnter(){
    this.pageLoading = true;
    this.searchQuery = "";
    this.page = 0;
    this.getPageType();
  }


  showJobForm(){
    this.pageLoading = true;
    this.jobService.getStorePermession()
    .then(
      (resp: any) => {
          if (resp && resp.data && resp.data.date) {
            this.router.navigate(['/tabs/subscription'], {
              queryParams: {
                lastDate: resp.data.date
              }
            });
          } else {
            this.router.navigateByUrl('/tabs/small-business/jobs/form');
          }
          this.pageLoading = false;
        },
      err => {
        console.log(err);
        this.pageLoading = false;
      }
    )
  }

  getPageType(){
    this.route.paramMap
    .subscribe(
      param => {
        this.type = param.get('type');
        this.page = 0;
        this.getJobs(null);
      }
    )
  }

  search(val: string){
    this.page = 0;
    this.searchQuery = val;
    console.log('search');

    this.getJobs(null);
  }

  handleResponse(event, refresh, resp: any){

    if(!event || refresh) this.jobs = [];

    if (refresh && this.infinitScroll) this.infinitScroll.disabled = false

    if(event){
      event.target.complete();
      if(! (resp?.data?.more) && !refresh) event.target.disabled = true;
    }

    const list = resp?.data?.jobs || [];
    list.forEach(prd => {
      try {
        const job = new Job(prd);
        this.jobs.push(job);
      } catch (e) { /* skip malformed item */ }
    })

    this.pageLoading = false;
  }

  handleError(err, event?){
    console.log(err);
    if (event) event.target.complete();
    this.pageLoading = false;
    this.toastService.presentErrorToastr(err);
  }

  getJobs(event, refresh?){
    if(refresh) this.page = 0;
    if(this.type == 'posted'){
      this.jobService.posted(this.page++, this.searchQuery)
      .then(
        resp => this.handleResponse(event, refresh, resp),
        err => this.handleError(err, event)
      );
    }else{
      this.jobService.available(this.page++, this.searchQuery)
      .then(
        resp => this.handleResponse(event, refresh, resp),
        err => this.handleError(err, event)
      );
    }
  }
}
