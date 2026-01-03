import { AvatarCustomizeModalComponent } from './avatar-customize-modal.component';
import { of } from 'rxjs';

describe('AvatarCustomizeModalComponent (unit)', () => {
  let modalCtrl: any;
  let userService: any;
  let toastService: any;
  let comp: AvatarCustomizeModalComponent;

  beforeEach(() => {
    modalCtrl = { dismiss: jasmine.createSpy('dismiss') };
    userService = { updateProfile: jasmine.createSpy('updateProfile').and.returnValue(of({ user: { _id: 'u1' } })) };
    toastService = { presentToast: jasmine.createSpy('presentToast') };

    comp = new AvatarCustomizeModalComponent(modalCtrl, userService, toastService);
  });

  it('initializes tempProfile from profile input (mapping private fields)', () => {
    comp.profile = { _id: 'u1', _firstName: 'Jane', _lastName: 'Doe', _avatarSeed: 's1' } as any;
    comp.ngOnInit();
    expect(comp.tempProfile._id).toBe('u1');
    expect(comp.tempProfile.firstName).toBe('Jane');
    expect(comp.tempProfile.avatarSeed).toBe('s1');
  });

  it('setOverride updates tempProfile immutably', () => {
    comp.profile = { _id: 'u1' } as any;
    comp.ngOnInit();
    const beforeRef = comp.tempProfile;
    comp.setOverride('top', 'shortHair');
    expect(comp.tempProfile).not.toBe(beforeRef);
    expect((comp.tempProfile.avatarOverrides as any).top).toBe('shortHair');
  });

  it('regenerateSeed generates a new seed', () => {
    comp.profile = { _id: 'u1', avatarSeed: 'old' } as any;
    comp.ngOnInit();
    const oldSeed = comp.tempProfile.avatarSeed;
    comp.regenerateSeed();
    expect(comp.tempProfile.avatarSeed).toBeDefined();
    expect(comp.tempProfile.avatarSeed).not.toBe(oldSeed);
  });

  it('randomize fills overrides and save calls userService', (done) => {
    comp.profile = { _id: 'u1' } as any;
    comp.ngOnInit();
    comp.randomize();
    expect(comp.tempProfile.avatarOverrides).toBeDefined();
    comp.save();
    expect(userService.updateProfile).toHaveBeenCalled();
    // simulate async response
    userService.updateProfile().subscribe(() => {
      expect(toastService.presentToast).toHaveBeenCalledWith('Avatar updated successfully');
      expect(modalCtrl.dismiss).toHaveBeenCalled();
      done();
    });
  });
});
