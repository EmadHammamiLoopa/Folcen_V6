import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-comment-form',
  templateUrl: './comment-form.component.html',
  styleUrls: ['./comment-form.component.scss']
})
export class CommentFormComponent implements OnInit {
  headers = [];

  constructor() { }

  ngOnInit(): void {
    this.initializeHeaders();
  }

  initializeHeaders() {
    this.headers = [
      {
        name: "id",
        title: "ID",
        hidden: true,
        value: ''
      },
      {
        name: "text",
        title: "Comment Text",
        type: "textarea",
        required: true,
        value: ''
      },
      {
        name: "anonyme",
        title: "Anonymous",
        type: "boolean",
        values: ["No", "Yes"],
        value: false
      }
    ];
  }
}
