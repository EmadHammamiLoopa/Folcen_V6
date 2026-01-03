import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-sandglass-loader',
  templateUrl: './sandglass-loader.component.html',
  styleUrls: ['./sandglass-loader.component.scss']
})
export class SandglassLoaderComponent {
  @Input() message: string = 'Please wait';
  @Input() visible: boolean = false;
}
