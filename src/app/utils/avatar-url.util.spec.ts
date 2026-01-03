import { AvatarUrlUtil, AVATAAARS_OPTIONS } from './avatar-url.util';

describe('AvatarUrlUtil', () => {
  it('buildAvataaarsUrl includes seed and overrides', () => {
    const profile: any = {
      avatarSeed: 'seed-123',
      avatarOverrides: {
        top: 'shortHair',
        skinTone: 'ffdbb4',
        backgroundColor: 'b6e3f4',
        backgroundType: 'solid'
      }
    };

    const url = AvatarUrlUtil.buildAvataaarsUrl(profile);

    expect(url).toContain('seed=seed-123');
    expect(url).toContain('top=shortHair');
    expect(url).toContain('skinColor=ffdbb4');
    expect(url).toContain('backgroundColor=b6e3f4');
    expect(url).toContain('backgroundType=solid');
  });

  it('pickFrom is deterministic', () => {
    const opt = ['a', 'b', 'c', 'd'];
    const a = AvatarUrlUtil.pickFrom('user-1', opt);
    const b = AvatarUrlUtil.pickFrom('user-1', opt);
    expect(a).toBe(b);
    expect(opt.indexOf(a)).toBeGreaterThanOrEqual(0);
  });
});
