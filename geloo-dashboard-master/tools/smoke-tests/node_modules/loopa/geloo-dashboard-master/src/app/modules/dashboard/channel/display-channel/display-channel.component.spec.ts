import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DisplayChannelComponent } from './display-channel.component';

describe('DisplayChannelComponent', () => {
  let component: DisplayChannelComponent;
  let fixture: ComponentFixture<DisplayChannelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DisplayChannelComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DisplayChannelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
