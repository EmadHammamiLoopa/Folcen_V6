import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayServiceComponent } from './display-service.component';

describe('DisplayServiceComponent', () => {
  let component: DisplayServiceComponent;
  let fixture: ComponentFixture<DisplayServiceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayServiceComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DisplayServiceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
