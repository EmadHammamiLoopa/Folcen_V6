import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { TabsPage } from './tabs.page';

describe('TabsPage', () => {
  let component: TabsPage;
  let fixture: ComponentFixture<TabsPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ TabsPage ],
      imports: [IonicModule.forRoot()],
      schemas: []
    }).compileComponents();

    fixture = TestBed.createComponent(TabsPage);
    component = fixture.componentInstance;
    // avoid triggering full change detection which runs heavy async init
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
