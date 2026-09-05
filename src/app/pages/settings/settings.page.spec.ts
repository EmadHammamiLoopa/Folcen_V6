import { SettingsPage } from './settings.page';

describe('SettingsPage', () => {
  it('should create', () => {
    const component = new SettingsPage(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    expect(component).toBeTruthy();
    expect(component.pageLoading).toBeFalse();
    expect(component.loading).toBeFalse();
    expect(component.isUpdating).toBeFalse();
    expect(component.blockedUsers).toEqual([]);
  });
});
