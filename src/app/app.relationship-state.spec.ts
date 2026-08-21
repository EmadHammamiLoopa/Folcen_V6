import { AppComponent } from './app.component';
import { User } from './models/User';
import { UserService } from './services/user.service';

describe('relationship realtime state ownership', () => {
  it('AppComponent does not rebuild relationship identity arrays from count statistics', () => {
    const source = AppComponent.toString();

    expect(source).not.toContain("Array(stats.followers).fill('')");
    expect(source).not.toContain("Array(stats.following).fill('')");
    expect(source).not.toContain("Array(stats.friends).fill('')");
    expect(source).not.toContain('SocketService.followUpdate$');
  });

  it('UserService remains the canonical owner and preserves real relationship IDs', () => {
    const service: any = Object.create(UserService.prototype);
    const current = new User().initialize({
      _id: 'current-user',
      followers: ['existing-follower'],
      following: ['existing-following'],
      friends: ['existing-friend'],
      followersCount: 1,
      followingCount: 1,
      friendsCount: 1,
      pendingFollowRequestsCount: 2,
      pendingFriendRequestsCount: 3,
    });

    let emitted: User | null = null;
    service.currentUserSubject = {
      value: current,
      next: (user: User) => { emitted = user; },
    };
    service.getCurrentUserId = () => 'current-user';
    service.triggerFriendsRefresh = () => {};

    service.handleSocialRealtimeUpdate({
      followerId: 'current-user',
      followedId: 'new-followed-user',
      status: 'active',
      actorStatistics: {
        followers: 7,
        following: 2,
        friends: 4,
      },
    });

    expect(emitted).toBeTruthy();
    expect(emitted!.followers).toEqual(['existing-follower']);
    expect(emitted!.following).toEqual(['existing-following', 'new-followed-user']);
    expect(emitted!.friends).toEqual(['existing-friend']);
    expect(emitted!.followers).not.toContain('');
    expect(emitted!.following).not.toContain('');
    expect(emitted!.friends).not.toContain('');
    expect(emitted!.followersCount).toBe(7);
    expect(emitted!.followingCount).toBe(2);
    expect(emitted!.friendsCount).toBe(4);
  });
});
