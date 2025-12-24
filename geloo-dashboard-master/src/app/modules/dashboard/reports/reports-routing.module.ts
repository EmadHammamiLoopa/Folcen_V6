import { DisplayReportComponent } from './display-report/display-report.component';
import { ListComponent } from './list/list.component';
import { ReportsComponent } from './reports.component';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
   {
     path: "",
     component: ReportsComponent,
     children: [
       {
         path: "",
         redirectTo: "list",
         pathMatch: "full"
       },
       {
         path: "list",
         component: ListComponent
       },
       {
         path: "display/:id",
         component: DisplayReportComponent
       }
     ]
   }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class ReportsRoutingModule { }
