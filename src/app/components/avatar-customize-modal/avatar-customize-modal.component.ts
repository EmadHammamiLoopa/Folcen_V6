import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { AvatarUrlUtil, AvatarProfile, AVATAAARS_OPTIONS } from '../../utils/avatar-url.util';
import { UserService } from '../../services/user.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-avatar-customize-modal',
  templateUrl: './avatar-customize-modal.component.html',
  styleUrls: ['./avatar-customize-modal.component.scss']
})
export class AvatarCustomizeModalComponent implements OnInit {
  @Input() profile: any;

  tempProfile: AvatarProfile = {};
  options = AVATAAARS_OPTIONS;
  previewUrl: string = '';

  constructor(
    private modalCtrl: ModalController,
    private userService: UserService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    // Manually copy properties to handle User class getters/private fields
    const p = this.profile || {};
    this.tempProfile = {
      _id: p._id,
      id: p.id,
      firstName: p.firstName || p._firstName,
      lastName: p.lastName || p._lastName,
      username: p.username || p._username,
      avatarSeed: p.avatarSeed || p._avatarSeed || Math.random().toString(36).substring(2, 15),
      avatarStyle: p.avatarStyle || p._avatarStyle || 'avataaars',
      avatarVariant: p.avatarVariant || p._avatarVariant || 'classic',
      avatarOverrides: JSON.parse(JSON.stringify(p.avatarOverrides || p._avatarOverrides || {
        top: 'auto',
        hairColor: 'auto',
        hatColor: 'auto',
        accessories: 'auto',
        accessoriesColor: 'auto',
        facialHair: 'auto',
        facialHairColor: 'auto',
        clothing: 'auto',
        clothingColor: 'auto',
        clothingGraphic: 'auto',
        skinTone: 'auto',
        backgroundColor: 'auto',
        backgroundType: 'gradientLinear',
        eyes: 'auto',
        eyebrows: 'auto',
        mouth: 'auto'
      }))
    };
  }

  setOverride(key: string, value: string) {
    const overrides = { ...(this.tempProfile.avatarOverrides || {}) };
    (overrides as any)[key] = value;
    // Force avatarStyle to 'avataaars' to ensure buildAvataaarsUrl is used for live preview
    this.tempProfile = { ...this.tempProfile, avatarOverrides: overrides, avatarStyle: 'avataaars' };
  }

  regenerateSeed() {
    this.tempProfile = {
      ...this.tempProfile,
      avatarSeed: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      avatarStyle: 'avataaars'
    };
  }

  randomize() {
    const overrides: any = { ...(this.tempProfile.avatarOverrides || {}) };
    overrides.top = this.options.top[Math.floor(Math.random() * this.options.top.length)];
    overrides.accessories = this.options.accessories[Math.floor(Math.random() * this.options.accessories.length)];
    overrides.facialHair = this.options.facialHair[Math.floor(Math.random() * this.options.facialHair.length)];
    overrides.facialHairColor = this.options.facialHairColor[Math.floor(Math.random() * this.options.facialHairColor.length)];
    overrides.hairColor = this.options.hairColor[Math.floor(Math.random() * this.options.hairColor.length)];
    overrides.clothing = this.options.clothing[Math.floor(Math.random() * this.options.clothing.length)];
    overrides.clothingColor = this.options.clothingColor[Math.floor(Math.random() * this.options.clothingColor.length)];
    overrides.clothingGraphic = this.options.clothingGraphic[Math.floor(Math.random() * this.options.clothingGraphic.length)];
    overrides.hatColor = this.options.hatColor[Math.floor(Math.random() * this.options.hatColor.length)];
    overrides.accessoriesColor = this.options.accessoriesColor[Math.floor(Math.random() * this.options.accessoriesColor.length)];
    overrides.skinTone = this.options.skinTone[Math.floor(Math.random() * this.options.skinTone.length)];
    overrides.backgroundColor = this.options.backgroundColor[Math.floor(Math.random() * this.options.backgroundColor.length)];
    overrides.backgroundType = Math.random() > 0.5 ? 'solid' : 'gradientLinear';
    overrides.eyes = this.options.eyes[Math.floor(Math.random() * this.options.eyes.length)];
    overrides.eyebrows = this.options.eyebrows[Math.floor(Math.random() * this.options.eyebrows.length)];
    overrides.mouth = this.options.mouth[Math.floor(Math.random() * this.options.mouth.length)];
    
    this.tempProfile = { ...this.tempProfile, avatarOverrides: overrides, avatarStyle: 'avataaars' };
  }

  reset() {
    this.tempProfile.avatarOverrides = {
      top: 'auto',
      hairColor: 'auto',
      hatColor: 'auto',
      accessories: 'auto',
      facialHair: 'auto',
      facialHairColor: 'auto',
      clothing: 'auto',
      clothingColor: 'auto',
      clothingGraphic: 'auto',
      accessoriesColor: 'auto',
      skinTone: 'auto',
      backgroundColor: 'auto',
      backgroundType: 'gradientLinear',
      eyes: 'auto',
      eyebrows: 'auto',
      mouth: 'auto'
    };
    this.tempProfile = { ...this.tempProfile, avatarStyle: 'avataaars' };
  }

  save() {
    const updateData = {
      avatarSeed: this.tempProfile.avatarSeed,
      avatarOverrides: this.tempProfile.avatarOverrides,
      avatarStyle: 'avataaars',
      mainAvatar: '' // Clear uploaded main avatar so customized one takes precedence
    };
    
    console.log('Saving avatar update:', updateData);

    this.userService.updateProfile(updateData).subscribe({
      next: (res) => {
        console.log('Avatar update response:', res);
        this.toastService.presentSuccessToastr('Avatar updated successfully');
        this.modalCtrl.dismiss(this.tempProfile);
      },
      error: (err) => {
        console.error('Error updating avatar', err);
        this.toastService.presentErrorToastr('Failed to update avatar');
      }
    });
  }

  close() {
    this.modalCtrl.dismiss();
  }
}
