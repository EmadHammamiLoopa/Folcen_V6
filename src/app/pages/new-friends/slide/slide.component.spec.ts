import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { SlideComponent } from './slide.component';

describe('SlideComponent', () => {
  let component: SlideComponent;
  let fixture: ComponentFixture<SlideComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ SlideComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SlideComponent);
    component = fixture.componentInstance;
    // Creation-only test: do not run component lifecycle here.
    // ngOnInit/async behavior is covered by dedicated tests.
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
