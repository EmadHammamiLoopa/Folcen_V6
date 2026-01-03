import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { JsonService } from 'src/app/services/json.service';
import { SearchOptionsComponent } from './search-options.component';

describe('SearchOptionsComponent', () => {
  let component: SearchOptionsComponent;
  let fixture: ComponentFixture<SearchOptionsComponent>;
  let modalCtrlMock: any;

  beforeEach(async () => {
    modalCtrlMock = { dismiss: jasmine.createSpy('dismiss') };
    const jsonServiceStub = { getInterests: () => Promise.resolve([]) } as Partial<JsonService>;

    await TestBed.configureTestingModule({
      declarations: [SearchOptionsComponent],
      imports: [FormsModule, IonicModule.forRoot()],
      providers: [
        { provide: ModalController, useValue: modalCtrlMock },
        { provide: JsonService, useValue: jsonServiceStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchOptionsComponent);
    component = fixture.componentInstance;
  });

  it('normalizes checkItems to booleans on init', async () => {
    component.checkItems = { profession: '1', education: '0', foo: 1, bar: 0 } as any;
    component.checkItemsNames = Object.keys(component.checkItems);
    component.ngOnInit();
    await fixture.whenStable();
    expect(component.checkItems.profession).toBeTrue();
    expect(component.checkItems.education).toBeFalse();
    expect(component.checkItems.foo).toBeTrue();
    expect(component.checkItems.bar).toBeFalse();
  });

  it('reset updates toggles but does not dismiss', () => {
    component.checkItems = { profession: true, education: true } as any;
    component.checkItemsNames = Object.keys(component.checkItems);
    component.reset();
    expect(modalCtrlMock.dismiss).toHaveBeenCalledWith({ reset: true });
    expect(component.checkItems.profession).toBeFalse();
    expect(component.checkItems.education).toBeFalse();
  });

  it('submit dismisses with converted values and fields', () => {
    component.checkItems = { profession: true, education: false, foo: true } as any;
    component.checkItemsNames = Object.keys(component.checkItems);
    component.gender = 'male';
    component.minAge = 20 as any;
    component.maxAge = 30 as any;
    component.interests = 'x,y';
    component.languages = 'en';
    component.online = true;

    component.submit();

    expect(modalCtrlMock.dismiss).toHaveBeenCalled();
    const payload = modalCtrlMock.dismiss.calls.mostRecent().args[0];
    expect(payload.profession).toBe('1');
    expect(payload.education).toBe('0');
    expect(payload.foo).toBe('1');
    expect(payload.gender).toBe('male');
    expect(payload.minAge).toBe('20');
    expect(payload.maxAge).toBe('30');
    expect(payload.interests).toBe('x,y');
    expect(payload.languages).toBe('en');
    expect(payload.online).toBe('1');
  });

  it('removeInterest/removeLanguage do not auto-submit', () => {
    component.interestsChips = ['a','b'];
    component.languagesChips = ['en','fr'];
    component.removeInterest(0);
    component.removeLanguage(1);
    expect(modalCtrlMock.dismiss).not.toHaveBeenCalled();
    expect(component.interestsChips).toEqual(['b']);
    expect(component.languagesChips).toEqual(['en']);
  });
});

