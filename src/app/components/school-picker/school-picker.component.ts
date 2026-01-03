import { Component, OnInit } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SchoolService } from '../../pages/profile/form/school.service';

interface CountryOption {
  name: string;
  code: string;
}

@Component({
  selector: 'app-school-picker',
  templateUrl: './school-picker.component.html'
})
export class SchoolPickerComponent implements OnInit {
  countries$: Observable<CountryOption[]> = of([]);
  universities$: Observable<string[]> = of([]);
  selectedCountryCode = '';

  constructor(private schoolService: SchoolService) {}

  ngOnInit(): void {
    this.countries$ = this.schoolService.getCountries();
    this.universities$ = of([]);
  }

  onCountryChange(code: string) {
    this.selectedCountryCode = code;
    if (!code) {
      this.universities$ = of([]);
      return;
    }
    this.universities$ = this.schoolService.getUniversityNames(code);
  }
}
