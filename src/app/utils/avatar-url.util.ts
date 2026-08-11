export const AVATAAARS_OPTIONS = {
  top: [
    'hat', 'hijab', 'turban', 'winterHat1', 'winterHat02', 'winterHat03', 'winterHat04',
    'bob', 'bun', 'curly', 'curvy', 'dreads', 'frida', 'fro', 'froBand', 'longButNotTooLong',
    'miaWallace', 'shavedSides', 'straight02', 'straight01', 'straightAndStrand',
    'dreads01', 'dreads02', 'frizzle', 'shaggy', 'shaggyMullet', 'shortCurly',
    'shortFlat', 'shortRound', 'shortWaved', 'sides', 'theCaesar', 'theCaesarAndSidePart',
    'bigHair', 'none'
  ],
  hairColor: [
    'a55728', '2c1b18', 'b58143', 'd6b370', '724133', '4a312c', 'f59797', 'ecdcbf', 'c93305', 'e8e1e1'
  ],
  accessories: [
    'none', 'kurt', 'prescription01', 'prescription02', 'round', 'sunglasses', 'wayfarers', 'eyepatch'
  ],
  facialHair: [
    'none', 'beardLight', 'beardMajestic', 'beardMedium', 'moustacheFancy', 'moustacheMagnum'
  ],
  facialHairColor: [
    'a55728', '2c1b18', 'b58143', 'd6b370', '724133', '4a312c', 'f59797', 'ecdcbf', 'c93305', 'e8e1e1'
  ],
  clothing: [
    'blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'graphicShirt', 'hoodie', 'overall', 'shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck'
  ],
  clothingColor: [
    '262e33', '65c9ff', '5199e4', '25557c', 'e6e6e6', '929598', '3c4f5c', 'b1e2ff', 'a7ffc4', 'ffdeb5', 'ffafb9', 'ffffb1', 'ff488e', 'ff5c5c', 'ffffff'
  ],
  clothingGraphic: [
    'bat', 'bear', 'cumbia', 'deer', 'diamond', 'hola', 'pizza', 'resist', 'skull', 'skullOutline'
  ],
  accessoriesColor: [
    '262e33', '65c9ff', '5199e4', '25557c', 'e6e6e6', '929598', '3c4f5c', 'b1e2ff', 'a7ffc4', 'ffdeb5', 'ffafb9', 'ffffb1', 'ff488e', 'ff5c5c', 'ffffff'
  ],
  hatColor: [
    '262e33', '65c9ff', '5199e4', '25557c', 'e6e6e6', '929598', '3c4f5c', 'b1e2ff', 'a7ffc4', 'ffdeb5', 'ffafb9', 'ffffb1', 'ff488e', 'ff5c5c', 'ffffff'
  ],
  skinTone: [
    '614335', 'ae5d29', 'd08b5b', 'edb98a', 'f8d25c', 'fd9841', 'ffdbb4'
  ],
  backgroundColor: [
    'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', '3c1053', 'ad5389', 'a1c4fd', 'c2e9fb', 'fbc2eb'
  ],
  eyes: [
    'default', 'closed', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'wink', 'winkWacky'
  ],
  eyebrows: [
    'default', 'defaultNatural', 'flatNatural', 'raisedExcited', 'raisedExcitedNatural', 'unibrowNatural', 'upDown', 'upDownNatural'
  ],
  mouth: [
    'default', 'disbelief', 'eating', 'serious', 'smile', 'tongue', 'twinkle'
  ]
};

export interface AvatarOverrides {
  top?: string;
  hairColor?: string;
  accessories?: string;
  facialHair?: string;
  facialHairColor?: string;
  clothing?: string;
  clothingColor?: string;
  clothingGraphic?: string;
  hatColor?: string;
  accessoriesColor?: string;
  skinTone?: string;
  backgroundColor?: string;
  backgroundType?: 'solid' | 'gradientLinear';
  eyes?: string;
  eyebrows?: string;
  mouth?: string;
  [key: string]: any;
}

export interface AvatarProfile {
  avatarStyle?: string;
  avatarSeed?: string;
  avatarVariant?: string;
  avatarOverrides?: AvatarOverrides;
  _id?: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  userName?: string;
  mainAvatar?: string;
  avatarUrl?: any;
  photo?: string;
  profilePhoto?: string;
  profilePicture?: string;
  picture?: string;
  image?: string;
  [key: string]: any;
}

export class AvatarUrlUtil {
  private static baseURL = 'https://api.dicebear.com/9.x/avataaars/svg';

  static getAvatarUrl(profile: AvatarProfile, backendRoot: string = ''): string {
    if (!profile) return '';

    const isOldDiceBear = (url: string) => {
      if (!url) return false;
      return url.includes('dicebear.com') && (url.includes('/bottts/') || url.includes('/avataaars/') === false);
    };

    const normalizeUrl = (rawUrl: any) => {
      if (typeof rawUrl === 'function') return '';
      let url = rawUrl;
      if (url && typeof url === 'object') {
        url = url.path || url.url || url.mainAvatar || url.src || '';
      }
      url = String(url || '').trim();
      if (!url) return '';
      if (url === 'undefined' || url === 'null' || url === '[object Object]') return '';
      if (url.startsWith('http') || url.startsWith('data:')) return url;
      
      const fullUrl = backendRoot + (url.startsWith('/') ? '' : '/') + url;
      const timestamp = profile.updatedAt ? new Date(profile.updatedAt).getTime() : Date.now();
      const separator = fullUrl.includes('?') ? '&' : '?';
      return `${fullUrl}${separator}v=${timestamp}`;
    };

    const avatarList = Array.isArray(profile.avatar)
      ? profile.avatar
      : (profile.avatar ? [profile.avatar] : []);
    const candidates = [
      profile.mainAvatar,
      profile.profilePhoto,
      profile.profilePicture,
      profile.photo,
      profile.picture,
      profile.image,
      profile.avatarUrl,
      ...avatarList
    ];
    const normalizedCandidates = candidates
      .map(normalizeUrl)
      .filter(Boolean);
    const uploadedAvatar = normalizedCandidates.find(url => !url.includes('dicebear.com'));
    const mainAvatar = normalizedCandidates[0] || '';

    // 1. Prioritize real uploaded photos before generated/custom avatars.
    if (uploadedAvatar) {
      return uploadedAvatar;
    }

    // 2. If it's a customized DiceBear avatar, build the URL with overrides
    if (profile.avatarStyle === 'avataaars') {
      return this.buildAvataaarsUrl(profile);
    }

    // 3. Fallback to mainAvatar if it exists and is NOT an old DiceBear style
    if (mainAvatar && !isOldDiceBear(mainAvatar)) {
      return mainAvatar;
    }

    // 4. Last resort: Generate a default DiceBear avataaars URL
    const seed = profile._id || profile.id || profile.username || 'default';
    return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&eyes=happy&mouth=smile`;
  }

  static buildAvataaarsUrl(profile: AvatarProfile): string {
    const seed = profile.avatarSeed || profile._id || profile.id || 'default';
    const params = new URLSearchParams();

    params.set('seed', seed);
    
    const overrides: AvatarOverrides = profile.avatarOverrides || {};

    // Use overrides or defaults
    params.set('mouth', overrides.mouth && overrides.mouth !== 'auto' ? overrides.mouth : 'smile');
    params.set('eyes', overrides.eyes && overrides.eyes !== 'auto' ? overrides.eyes : 'happy');
    params.set('eyebrows', overrides.eyebrows && overrides.eyebrows !== 'auto' ? overrides.eyebrows : 'raisedExcitedNatural');
    
    // Top / Hair
    if (overrides.top === 'none') {
      params.set('topProbability', '0');
    } else if (overrides.top && overrides.top !== 'auto') {
      params.set('top', overrides.top);
      params.set('topProbability', '100');
    }

    // Accessories
    if (overrides.accessories === 'none' || overrides.accessories === 'blank') {
      params.set('accessoriesProbability', '0');
    } else if (overrides.accessories && overrides.accessories !== 'auto') {
      params.set('accessories', overrides.accessories);
      params.set('accessoriesProbability', '100');
    }

    // Facial Hair
    if (overrides.facialHair === 'none' || overrides.facialHair === 'blank') {
      params.set('facialHairProbability', '0');
    } else if (overrides.facialHair && overrides.facialHair !== 'auto') {
      params.set('facialHair', overrides.facialHair);
      params.set('facialHairProbability', '100');
    }

    if (overrides.hairColor && overrides.hairColor !== 'auto') params.set('hairColor', overrides.hairColor);
    if (overrides.facialHairColor && overrides.facialHairColor !== 'auto') params.set('facialHairColor', overrides.facialHairColor);
    if (overrides.clothing && overrides.clothing !== 'auto') params.set('clothing', overrides.clothing);
    if (overrides.clothingColor && overrides.clothingColor !== 'auto') params.set('clothesColor', overrides.clothingColor);
    if (overrides.clothingGraphic && overrides.clothingGraphic !== 'auto') params.set('clothingGraphic', overrides.clothingGraphic);
    if (overrides.hatColor && overrides.hatColor !== 'auto') params.set('hatColor', overrides.hatColor);
    if (overrides.accessoriesColor && overrides.accessoriesColor !== 'auto') params.set('accessoriesColor', overrides.accessoriesColor);
    
    // Fix skinColor parameter name for DiceBear
    if (overrides.skinTone && overrides.skinTone !== 'auto') {
      params.set('skinColor', overrides.skinTone);
    }

    // Background handling - make it more attractive with gradients by default
    let bgColor = overrides.backgroundColor;
    if (!bgColor || bgColor === 'auto') {
      bgColor = this.pickFrom(seed, AVATAAARS_OPTIONS.backgroundColor);
    }

    params.set('backgroundColor', bgColor);
    params.set('backgroundType', overrides.backgroundType === 'gradientLinear' ? 'gradientLinear' : 'solid');
    
    if (params.get('backgroundType') === 'gradientLinear') {
      params.set('backgroundRotation', '45');
    }

    return `${this.baseURL}?${params.toString()}`;
  }

  static stableHash(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  static pickFrom(seed: string, options: string[]): string {
    const hash = this.stableHash(seed);
    return options[hash % options.length];
  }
}
