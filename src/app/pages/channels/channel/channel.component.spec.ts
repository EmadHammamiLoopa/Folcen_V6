import { ChannelComponent } from './channel.component';

describe('ChannelComponent', () => {
  it('should create', () => {
    const component = new ChannelComponent(
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
    expect(component.posts).toEqual([]);
    expect(component.page).toBe(0);
    expect(component.pageLoading).toBeFalse();
  });
});
