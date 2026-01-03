import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-plan-rule-list',
  templateUrl: './plan-rule-list.component.html',
  styleUrls: ['./plan-rule-list.component.scss']
})
export class PlanRuleListComponent implements OnInit {

  headers = [
    { name: "name", title: "Name", type: "text" },
    { name: "type", title: "Type", type: "text" },
    { name: "priority", title: "Priority", type: "number" },
    { name: "isActive", title: "Active", type: "boolean", values: ['No', 'Yes'] },
    { name: "expiresAt", title: "Expires At", type: "date" }
  ];

  constructor() { }

  ngOnInit(): void {}

  getDisplayLink = (row: any): string => {
    return `/dashboard/subscriptions/rules/form/edit?id=${row.id || row._id}`;
  }
}
