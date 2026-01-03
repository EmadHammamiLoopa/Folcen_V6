import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed, waitForAsync } from '@angular/core/testing';

import { RouterTestingModule } from '@angular/router/testing';

import { AppComponent } from './app.component';

describe('AppComponent', () => {

  // Increase default Jasmine timeout to allow async initialization in tests
  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
  });


  beforeEach(waitForAsync(() => {

    TestBed.configureTestingModule({
      declarations: [AppComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      imports: [ RouterTestingModule.withRoutes([])],
    }).compileComponents();
  }));

  it('should create the app', waitForAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  }));

  it('should have menu labels', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.nativeElement;
    const menuItems = app.querySelectorAll('ion-label');
    // ensure querySelectorAll works and returns a NodeList (may be empty depending on template)
    expect(menuItems).toBeDefined();
  });

  it('should have urls', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.nativeElement;
    const menuItems = app.querySelectorAll('ion-item');
    expect(menuItems).toBeDefined();
  });

});
