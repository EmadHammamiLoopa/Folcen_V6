import { Request } from './Request';
import { Message } from './Message';
import constants from 'src/app/helpers/constants';
import { AvatarUrlUtil } from '../utils/avatar-url.util';

type RequestEnum = 'requesting' | 'requested';

interface UserSubscription {
  id: string;
  expireDate: Date | null;
}



export class User {

  // Normalize idempotency cache to avoid re-running heavy normalization for identical payloads
  private static normalizationCache = new Map<string, { fingerprint: string; normalized: User }>();

  public _id: string;
  private _firstName: string;
  private _lastName: string;
  private _email: string;
  private _emailVerified: boolean;
  private _birthDate: Date | null;
  private _gender: string;
  private _address: string;
  private _aboutMe: string;
  private _avatar: string[] = [];
  private _mainAvatar: string;
  private _isFriend: boolean;
  private _isFollowing: boolean = false;
  private _isFollower: boolean = false;
  private _followStatus: string | null = null;
  private _isPrivate: boolean = false;
  private _status: string;
  private _education: string;
  private _profession: string;
  private _school: string;
  private _interests: string[];
  private _languages: string[];
  private _country: string;
  private _city: string;
  private _followed: boolean;
  private _friend: boolean;
  private _request: RequestEnum | null;
  private _requests: Request[];
  public _online: boolean;
  private _messages: Message[];
  private _subscription: UserSubscription | null;
  private _randomVisible: boolean;
  private _allowVideoRequestsFromNonFriends: boolean;
  private _ageVisible: boolean;
  private _genderVisible: boolean;
  private _loggedIn: boolean;
  private _visitProfile: boolean;
  private _profileCreated: boolean;
  private _enabled: boolean;
  private _is2FAEnabled: boolean;
  private _twoFAToken: string;
  private _role: string;
  private _banned: boolean;
  private _reports: any[];
  private _followers: any[];
  private _following: any[];
  private _friends: any[];
  private _blockedUsers: any[];
  private _followedChannels: any[];
  private _messagedUsers: any[];
  private _deletedAt: Date | null;
  private _createdAt: Date | null;
  private _updatedAt: Date | null;
  private _salt: string;
  private _hashed_password: string;
  private _lastSeen: Date | null;  // <-- New property added here
  private _peerId: string | null;  // ✅ Add peerId property
  public _lastSeenText: string | null;
  private _missedCallBudget: number = 0; // ✅ Add budget property
  private _avatarStyle: string;
  private _avatarSeed: string;
  private _avatarVariant: string;
  private _avatarOverrides: any;
  private _followersCount: number;
  private _followingCount: number;
  private _friendsCount: number;
  private _pendingFollowRequestsCount: number;
  private _pendingFriendRequestsCount: number;

  private static computeFingerprint(payload: any): string {
    if (!payload) return '';
    const id = payload._id || payload.id || '';
    const updated = payload.updatedAt || payload.updated_at || '';
    const followersLen = Array.isArray(payload.followers) ? payload.followers.length : 0;
    const followingLen = Array.isArray(payload.following) ? payload.following.length : 0;
    const friendsLen = Array.isArray(payload.friends) ? payload.friends.length : 0;

    const followersCount =
      payload.followersCount !== undefined
        ? Number(payload.followersCount)
        : followersLen;

    const followingCount =
      payload.followingCount !== undefined
        ? Number(payload.followingCount)
        : followingLen;

    const friendsCount =
      payload.friendsCount !== undefined
        ? Number(payload.friendsCount)
        : friendsLen;
    const interestsStr = Array.isArray(payload.interests)
      ? payload.interests.join('|')
      : (payload.interests || '');
    const languagesStr = Array.isArray(payload.languages)
      ? payload.languages.join('|')
      : (payload.languages || '');
    const avatarFields = [
      payload.avatarStyle || '',
      payload.avatarSeed || '',
      payload.avatarVariant || '',
      payload.avatarOverrides ? JSON.stringify(payload.avatarOverrides) : '',
      payload.mainAvatar || '',
      payload._mainAvatar || '',
      payload.profilePhoto || '',
      payload.profilePicture || '',
      payload.photo || '',
      payload.picture || '',
      payload.image || '',
      payload.avatarUrl ? JSON.stringify(payload.avatarUrl) : '',
      Array.isArray(payload.avatar) ? payload.avatar.join(',') : (payload.avatar || '')
    ].join('|');
    const videoRequests = payload.allowVideoRequestsFromNonFriends === false ? 'videoRequests:false' : 'videoRequests:true';
    return [
      id,
      updated,
      payload.email || '',
      payload.birthDate || '',
      followersLen,
      followingLen,
      friendsLen,
      followersCount,
      followingCount,
      friendsCount,
      Number(payload.pendingFollowRequestsCount || 0),
      Number(payload.pendingFriendRequestsCount || 0),
      interestsStr,
      languagesStr,
      avatarFields,
      videoRequests
    ].join('|');
  }

  private static decodeMaybeEncodedList(value: string): string[] | null {
    if (!value || typeof value !== 'string') return null;

    // Attempt base64 decode if it looks encoded and has no spaces
    // Lenient check: allow missing padding and length > 4 to avoid false positives with short words
    const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 4;
    if (looksBase64) {
      try {
        // Add padding if missing for atob
        let b64 = value;
        while (b64.length % 4 !== 0) b64 += "=";
        const decoded = atob(b64);
        if (decoded && /[A-Za-z]/.test(decoded)) {
          const parts = decoded.split(/[,;|]/).map(p => p.trim()).filter(Boolean);
          if (parts.length) return parts;
        }
      } catch (e) {
        // ignore decode errors
      }
    }

    // Fallback: if the string already contains separators, split it
    if (value.indexOf(',') !== -1 || value.indexOf('|') !== -1 || value.indexOf(';') !== -1) {
      const parts = value.split(/[,;|]/).map(p => p.trim()).filter(Boolean);
      if (parts.length) return parts;
    }

    return null;
  }

  constructor(
    id: string = '',
    firstName: string = '',
    lastName: string = '',
    email: string = '',
    emailVerified: boolean = false,
    birthDate: Date | null = null,
    gender: string = 'Not specified',
    address: string = '',
    aboutMe: string = '',
    avatar: string[] = [],
    mainAvatar: string = '',
    status: string = '',
    education: string = 'Undefined',
    profession: string = 'Undefined',
    school: string = 'Undefined',
    interests: string[] = [],
    languages: string[] = [],
    country: string = '',
    city: string = '',
    followed: boolean = false,
    friend: boolean = false,
    isFriend: boolean = false,
    request: RequestEnum | null = null,
    requests: Request[] = [],
    online: boolean = false,
    messages: Message[] = [],
    subscription: UserSubscription | null = null,
    randomVisible: boolean = false,
    allowVideoRequestsFromNonFriends: boolean = true,
    ageVisible: boolean = false,
    genderVisible: boolean = false,
    loggedIn: boolean = false,
    visitProfile: boolean = false,
    profileCreated: boolean = false,
    enabled: boolean = false,
    is2FAEnabled: boolean = false,
    twoFAToken: string = '',
    role: string = '',
    banned: boolean = false,
    reports: any[] = [],
    followers: any[] = [],
    following: any[] = [],
    friends: any[] = [],
    blockedUsers: any[] = [],
    followedChannels: any[] = [],
    messagedUsers: any[] = [],
    deletedAt: Date | null = null,
    createdAt: Date | null = null,
    updatedAt: Date | null = null,
    salt: string = '',
    hashed_password: string = '',
    lastSeen: Date | null = null,  // <-- Initialize lastSeen here
    peerId: string | null = null,  // ✅ Add peerId to constructor
    lastSeenText: string | null = null,
    avatarStyle: string = 'avataaars',
    avatarSeed: string = '',
    avatarVariant: string = 'classic',
    avatarOverrides: any = null,
    followersCount: number = 0,
    followingCount: number = 0,
    friendsCount: number = 0,
    pendingFollowRequestsCount: number = 0,
    pendingFriendRequestsCount: number = 0,
  ) {
    this._id = id;
    this._firstName = firstName;
    this._lastName = lastName;
    this._email = email;
    this._emailVerified = emailVerified;
    this._birthDate = birthDate;
    this._gender = gender;
    this._address = address;
    this._aboutMe = aboutMe;
    this.avatar = avatar;
    this._mainAvatar = mainAvatar;
    this._status = status;
    this._education = education;
    this._profession = profession;
    this._school = school;
    this._interests = interests;
    this._languages = languages;
    this._country = country;
    this._city = city;
    this._followed = followed;
    this._friend = friend;
    this._isFriend = isFriend;
    this._request = request;
    this._requests = requests;
    this._online = online;
    this._messages = messages;
    this._subscription = subscription;
    this._randomVisible = randomVisible;
    this._allowVideoRequestsFromNonFriends = allowVideoRequestsFromNonFriends;
    this._ageVisible = ageVisible;
    this._genderVisible = genderVisible;
    this._loggedIn = loggedIn;
    this._visitProfile = visitProfile;
    this._profileCreated = profileCreated;
    this._enabled = enabled;
    this._is2FAEnabled = is2FAEnabled;
    this._twoFAToken = twoFAToken;
    this._role = role;
    this._banned = banned;
    this._reports = reports;
    this._followers = followers;
    this._following = following;
    this._friends = friends;
    this._blockedUsers = blockedUsers;
    this._followedChannels = followedChannels;
    this._messagedUsers = messagedUsers;
    this._deletedAt = deletedAt;
    this._createdAt = createdAt;
    this._updatedAt = updatedAt;
    this._salt = salt;
    this._hashed_password = hashed_password;
    this._lastSeen = lastSeen;  // <-- Assign lastSeen here
    this._peerId = peerId;  // ✅ Assign peerId
    this._lastSeenText = lastSeenText;
    this._avatarStyle = avatarStyle;
    this._avatarSeed = avatarSeed;
    this._avatarVariant = avatarVariant;
    this._avatarOverrides = avatarOverrides;
    this._followersCount = followersCount;
    this._followingCount = followingCount;
    this._friendsCount = friendsCount;
    this._pendingFollowRequestsCount = pendingFollowRequestsCount;
    this._pendingFriendRequestsCount = pendingFriendRequestsCount;
  }

  // Getter methods
  get id(): string { return this._id; }
  get firstName(): string { return this._firstName; }
  get lastName(): string { return this._lastName; }
  get fullName(): string { return `${this._firstName} ${this._lastName}`; }
  get email(): string { return this._email; }
  get emailVerified(): boolean { return this._emailVerified; }
  get gender(): string { return this._gender; }
  get birthDate(): Date | null { return this._birthDate; }
  get address(): string { return this._address; }
  get aboutMe(): string { return this._aboutMe; }
  get status(): string { return this._status; }
  get avatar(): string[] { return this._avatar; }

  /**
   * Returns a filtered list of avatars, excluding default/placeholder ones.
   * Each item contains the raw path and the full URL.
   */
  get avatars(): { path: string, url: string }[] {
    if (!Array.isArray(this._avatar)) return [];

    // Uploaded avatar filenames already provide their own stable revision.
    // Reusing profile.updatedAt (or Date.now()) here changes the browser cache
    // key for the exact same image whenever the User object is refreshed.
    return this._avatar
      .filter(path => !this.isDefaultAvatar(path))
      .map(path => ({
        path,
        url: this.avatarUrl(path)
      }));
  }

  /**
   * Public wrapper for constructAvatarUrl
   */
  public avatarUrl(path: string): string {
    return this.constructAvatarUrl(path);
  }

  get mainAvatarPath(): string {
    return this._mainAvatar;
  }

  get mainAvatar(): string {
    // 1. Prioritize real uploaded photo (mainAvatar) if it's not a DiceBear/Default URL
    if (this._mainAvatar && !this.isDefaultAvatar(this._mainAvatar)) {
      return this.constructAvatarUrl(this._mainAvatar);
    }

    const firstUploadedAvatar = Array.isArray(this._avatar)
      ? this._avatar.find(path => path && !this.isDefaultAvatar(path))
      : '';
    if (firstUploadedAvatar) {
      return this.constructAvatarUrl(firstUploadedAvatar);
    }

    // 2. Fallback to customized avataaars if style is set
    if (this._avatarStyle === 'avataaars') {
      return AvatarUrlUtil.buildAvataaarsUrl({
        avatarStyle: this._avatarStyle,
        avatarSeed: this._avatarSeed,
        avatarVariant: this._avatarVariant,
        avatarOverrides: this._avatarOverrides,
        _id: this._id
      });
    }

    // 3. Last resort: Default DiceBear URL
    return this.getDefaultAvatar(this._gender);
  }

  public isDefaultAvatar(avatarUrl: string): boolean {
    if (!avatarUrl) return true;
    const urlStr = String(avatarUrl);
    return this.isOldDefaultAvatar(urlStr) ||
           urlStr.includes('dicebear.com') ||
           urlStr.includes('default-avatar.png') ||
           urlStr.includes('avatar-placeholder');
  }

  get avatarStyle(): string { return this._avatarStyle; }
  get avatarSeed(): string { return this._avatarSeed; }
  get avatarVariant(): string { return this._avatarVariant; }
  get avatarOverrides(): any { return this._avatarOverrides; }
  get lastSeen(): Date | null { return this._lastSeen; }  // <-- Add a getter for lastSeen
  get role(): string { return this._role; }

  get friends(): any[] { return this._friends; }
  set friends(friends: any[]) { this._friends = friends; }

  // Expose followed channels via public accessor to allow safe merges
  get followedChannels(): any[] { return this._followedChannels; }
  set followedChannels(channels: any[]) { this._followedChannels = Array.isArray(channels) ? channels : []; }

  get followers(): any[] { return this._followers; }
  set followers(followers: any[]) { this._followers = followers; }

  get blockedUsers(): any[] { return this._blockedUsers; }
  set blockedUsers(blocked: any[]) { this._blockedUsers = blocked; }

  get following(): any[] { return this._following; }
  set following(following: any[]) { this._following = following; }

  get isFriend(): boolean { return this._isFriend; }
  set isFriend(isFriend: boolean) { this._isFriend = isFriend; }

  get isFollowing(): boolean { return this._isFollowing; }
  set isFollowing(isFollowing: boolean) { this._isFollowing = isFollowing; }

  get isFollower(): boolean { return this._isFollower; }
  set isFollower(isFollower: boolean) { this._isFollower = isFollower; }

  get followStatus(): string | null { return this._followStatus; }
  set followStatus(followStatus: string | null) { this._followStatus = followStatus; }

  get isPrivate(): boolean { return this._isPrivate; }
  set isPrivate(isPrivate: boolean) { this._isPrivate = isPrivate; }

  set lastSeen(lastSeen: Date | null) { this._lastSeen = lastSeen; }  // <-- Add a setter for lastSeen

  get education(): string { return this._education; }
  get profession(): string { return this._profession; }
  get school(): string { return this._school; }
  get interests(): string[] { return this._interests; }
  get languages(): string[] { return this._languages; }
  get city(): string { return this._city; }
  get country(): string { return this._country; }
  get followed(): boolean { return this._followed; }
  get friend(): boolean { return this._friend; }
  get request(): RequestEnum | null { return this._request; }
  get online(): boolean { return this._online; }
  get messages(): Message[] { return this._messages; }
  get requests(): Request[] { return this._requests; }
  get subscription(): UserSubscription | null { return this._subscription; }
  get randomVisible(): boolean { return this._randomVisible; }
  get allowVideoRequestsFromNonFriends(): boolean { return this._allowVideoRequestsFromNonFriends; }
  get ageVisible(): boolean { return this._ageVisible; }
  get genderVisible(): boolean { return this._genderVisible; }
  get loggedIn(): boolean { return this._loggedIn; }
  get visitProfile(): boolean { return this._visitProfile; }
  get updatedAt(): Date | null { return this._updatedAt; }
  get createdAt(): Date | null { return this._createdAt; }

  get lastSeenText(): string | null { return this._lastSeenText; }
  set lastSeenText(lastSeenText: string | null) { this._lastSeenText = lastSeenText; }

  get missedCallBudget(): number { return this._missedCallBudget; }
  set missedCallBudget(value: number) { this._missedCallBudget = value; }

  get followersCount(): number { return this._followersCount; }
  set followersCount(value: number) { this._followersCount = value; }

  get followingCount(): number { return this._followingCount; }
  set followingCount(value: number) { this._followingCount = value; }

  get friendsCount(): number { return this._friendsCount; }
  set friendsCount(value: number) { this._friendsCount = value; }

  get pendingFollowRequestsCount(): number { return this._pendingFollowRequestsCount; }
  set pendingFollowRequestsCount(value: number) { this._pendingFollowRequestsCount = value; }

  get pendingFriendRequestsCount(): number { return this._pendingFriendRequestsCount; }
  set pendingFriendRequestsCount(value: number) { this._pendingFriendRequestsCount = value; }

  public getPeerId(): string | null {
    return this._peerId;
}

  // ✅ Setter for peerId
public setPeerId(peerId: string | null): void {
    this._peerId = peerId;
}
get peerId(): string | null {
  return this._peerId;
}

// ✅ Setter for Peer ID
set peerId(peerId: string | null) {
  this._peerId = peerId;
}
  // Setter methods
  set id(id: string) { this._id = id; }
  set firstName(firstName: string) { this._firstName = firstName; }
  set lastName(lastName: string) { this._lastName = lastName; }
  set email(email: string) { this._email = email; }
  set emailVerified(emailVerified: boolean) { this._emailVerified = emailVerified; }
  set birthDate(birthDate: Date | null) { this._birthDate = birthDate; }
  set gender(gender: string) { this._gender = gender; }
  set address(address: string) { this._address = address; }
  set avatar(avatars: any) {
    if (Array.isArray(avatars)) {
      this._avatar = avatars
        .map((avatar: string) => this.normalizeStoredAvatarPath(avatar))
        .filter(Boolean);
    } else {
      this._avatar = [];
    }
  }

  set mainAvatar(mainAvatar: string) { this._mainAvatar = this.normalizeStoredAvatarPath(mainAvatar); }
  set avatarStyle(avatarStyle: string) { this._avatarStyle = avatarStyle; }

  set status(status: string) { this._status = status; }
  set education(education: string) { this._education = education; }
  set profession(profession: string) { this._profession = profession; }
  set school(school: string) { this._school = (school === 'undefined' || !school) ? '' : school; }
  set country(country: string) { this._country = (country === 'undefined' || !country || !String(country).trim()) ? '-' : String(country).trim(); }
  set aboutMe(aboutMe: string) { this._aboutMe = (aboutMe === 'undefined' || !aboutMe) ? '' : aboutMe; }

  set city(city: string) { this._city = (city === 'undefined' || !city || !String(city).trim()) ? '-' : String(city).trim(); }
  set interests(interests: string[]) {
    this._interests = interests.filter(interest => interest.trim().length > 0);
    this.sortInterests();
  }
  set languages(languages: string[]) {
    this._languages = Array.isArray(languages) ? languages.filter(l => l && l.trim().length > 0) : [];
  }
  set followed(followed: boolean) { this._followed = followed; }
  set friend(friend: boolean) { this._friend = friend; }
  set request(request: RequestEnum | null) { this._request = request; }
  set online(online: boolean) { this._online = online; }
  set messages(messages: Message[]) { this._messages = messages; }
  set profileCreated(profileCreated: boolean) { this._profileCreated = profileCreated; }
  set requests(requests: Request[]) {
    this._requests = requests.map(req => new Request().initialize(req));
  }
  set subscription(subscription: UserSubscription | null) {
    this._subscription = subscription;
  }
  set randomVisible(randomVisible: boolean) { this._randomVisible = randomVisible; }
  set allowVideoRequestsFromNonFriends(value: boolean) { this._allowVideoRequestsFromNonFriends = value; }
  set ageVisible(ageVisible: boolean) { this._ageVisible = ageVisible; }
  set genderVisible(genderVisible: boolean) { this._genderVisible = genderVisible; }
  set loggedIn(loggedIn: boolean) { this._loggedIn = loggedIn; }
  set visitProfile(visitProfile: boolean) { this._visitProfile = visitProfile; }

  private constructAvatarUrl(avatarPath: string): string {
    avatarPath = this.normalizeStoredAvatarPath(avatarPath);
    if (!avatarPath) {
      return `${constants.DOMAIN_URL}/uploads/default-avatar.png`; // Default avatar URL
    }
    if (avatarPath.startsWith('data:image')) {

      return avatarPath; // Return as is if it is already a base64 image
    }
    if (avatarPath.startsWith('http')) {

      return avatarPath; // Return as is if it is already a complete URL
    }
    return `${constants.DOMAIN_URL}${avatarPath.startsWith('/') ? avatarPath : `/${avatarPath}`}`;
  }

  private normalizeStoredAvatarPath(avatarPath: any): string {
    if (avatarPath && typeof avatarPath === 'object') {
      avatarPath = this.firstUsableAvatarValue([
        avatarPath.path,
        avatarPath.url,
        avatarPath.mainAvatar,
        avatarPath.profilePhoto,
        avatarPath.profilePicture,
        avatarPath.photo,
        avatarPath.picture,
        avatarPath.image,
        avatarPath.src
      ]);
    }
    if (!avatarPath || avatarPath === 'undefined' || avatarPath === 'null' || avatarPath === '[object Object]') return '';
    let path = String(avatarPath).trim();
    if (!path || path === 'undefined' || path === 'null' || path === '[object Object]') return '';

    if (path.startsWith('data:image')) return path;

    try {
      const url = new URL(path);
      const backend = new URL(constants.DOMAIN_URL);
      if (url.origin === backend.origin) {
        path = url.pathname;
      } else {
        return path;
      }
    } catch (_) {
      // Relative path, keep it as a stored path.
    }

    return path.split('?')[0].split('#')[0];
  }

  private firstUsableAvatarValue(values: any[]): any {
    for (const value of values || []) {
      if (Array.isArray(value)) {
        const fromArray = this.firstUsableAvatarValue(value);
        if (fromArray) return fromArray;
        continue;
      }
      if (value && typeof value === 'object') {
        const fromObject = this.firstUsableAvatarValue([
          value.path,
          value.url,
          value.mainAvatar,
          value.profilePhoto,
          value.profilePicture,
          value.photo,
          value.picture,
          value.image,
          value.src
        ]);
        if (fromObject) return fromObject;
        continue;
      }
      const clean = typeof value === 'string' ? value.trim() : '';
      if (clean && clean !== 'undefined' && clean !== 'null' && clean !== '[object Object]') {
        return clean;
      }
    }
    return '';
  }

  public getMainAvatar(): string {
    if (this._mainAvatar && !this.isDefaultAvatar(this._mainAvatar)) {
      return this.constructAvatarUrl(this._mainAvatar);
    }
    const firstUploadedAvatar = Array.isArray(this._avatar)
      ? this._avatar.find(path => path && !this.isDefaultAvatar(path))
      : '';
    if (firstUploadedAvatar) {
      return this.constructAvatarUrl(firstUploadedAvatar);
    }
    if (this._avatarStyle === 'avataaars') {
      return AvatarUrlUtil.buildAvataaarsUrl({
        avatarStyle: this._avatarStyle,
        avatarSeed: this._avatarSeed,
        avatarVariant: this._avatarVariant,
        avatarOverrides: this._avatarOverrides,
        _id: this._id
      });
    }
    return this.getDefaultAvatar(this._gender);
  }



  private getDefaultAvatar(gender: string): string {
    const seed = this._id || Math.random().toString(36).substring(7);
    // Use avataaars with happy eyes and smile mouth for a "happy face" default
    return `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}&eyes=happy&mouth=smile`;
  }

  private isOldDefaultAvatar(avatar: string): boolean {
    if (!avatar) return false;
    const oldDefaults = [
      'male.webp', 'female.webp', 'other.webp',
      '/public/images/avatars/male.webp',
      '/public/images/avatars/female.webp',
      '/public/images/avatars/other.webp',
      constants.defaultMaleAvatarUrl,
      constants.defaultFemaleAvatarUrl,
      constants.defaultOtherAvatarUrl,
      'dicebear.com/9.x/bottts', // Old monster/robot style
      'dicebear.com/7.x/bottts',
      'dicebear.com/6.x/bottts'
    ];
    return oldDefaults.some(d => avatar.includes(d));
  }

  public getId(): string {
    return this._id;
  }



  public getAge(isLoggedInUser: boolean): number | null {
  //  console.log('loggedIn:', isLoggedInUser);
  //  console.log('ageVisible:', this._ageVisible);
   // console.log('birthDate:', this._birthDate);

    // If it's the logged-in user's profile, always return the age, otherwise check ageVisible
    if ((!this._ageVisible && !isLoggedInUser) || !this._birthDate) {
     ///   console.log('Returning null - either age is not visible or birth date is missing.');
        return null;
    }

    const today = new Date();
    const birthDate = new Date(this._birthDate);
 //   console.log('Today\'s Date:', today);
  //  console.log('Birth Date:', birthDate);

    let age = today.getFullYear() - birthDate.getFullYear();

    const monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
        age--; // Adjust age if the birthday hasn't occurred yet this year
    }

   // console.log('Final Age:', age);
    return age;
}



  private isValidUserData(user: any): boolean {
    const requiredFields = [
      '_id', 'firstName', 'lastName', 'email', 'birthDate', 'gender'
    ];

    const missingFields = requiredFields.filter(field => !(field in user));
    if (missingFields.length > 0) {
      console.warn('Missing fields in user data:', missingFields);
      return false;
    }
    return true;
  }

  initialize(user: any): User {
    if (!user) return this;
    if (typeof user === 'string') {
      this._id = user;
      return this;
    }
    const cacheKey = user && (user._id || user.id) ? String(user._id || user.id) : null;
    const fingerprint = User.computeFingerprint(user);
    if (cacheKey && fingerprint) {
      const cached = User.normalizationCache.get(cacheKey);
      if (cached && cached.fingerprint === fingerprint) {
        return cached.normalized;
      }
    }
    try {
      const w: any = (typeof window !== 'undefined') ? window : {};
      const counters = w.__initCounters || {};
      counters.userInit = (counters.userInit || 0) + 1;
      w.__initCounters = counters;
    } catch (_) {}
   // console.log('Initializing user:', user);

    // tolerate Buffer-like or numeric-indexed objects produced by some backends
    const tryExtractBytes = (obj: any): number[] | null => {
      if (!obj) return null;
      if (Array.isArray(obj)) return obj.map(n => Number(n));
      if (obj.data && Array.isArray(obj.data)) return obj.data.map((n: any) => Number(n));
      if (obj.buffer && Array.isArray(obj.buffer.data)) return obj.buffer.data.map((n: any) => Number(n));
      // numeric-indexed object { '0': 105, '1': 73, ... }
      const keys = Object.keys(obj).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
      if (keys.length) return keys.map(k => Number(obj[k]));
      return null;
    };

    try {
      if (!user || typeof user !== 'object') {
        console.error('Invalid user data:', user);
        throw new Error('Invalid user data');
      }

      // If the whole `user` is actually a byte container, try to decode it
      const whole = tryExtractBytes(user) || tryExtractBytes(user.buffer) || tryExtractBytes(user.data);
      if (whole && whole.length) {
        try {
          const arr = new Uint8Array(whole);
          const decoded = new TextDecoder().decode(arr);
          if (decoded && decoded.trim().startsWith('{')) {
            user = JSON.parse(decoded);
            console.warn('Decoded Buffer-like user payload into object');
          } else if (whole.length >= 12) {
            // maybe an ObjectId bytes -> hex
            const hex = whole.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
            user = { _id: hex };
            console.warn('Converted Buffer-like id to hex _id');
          }
        } catch (e) {
          // ignore decode errors
        }
      }

      // If backend returned underscored keys (e.g. `_firstName`), expose them without underscore
      const normalizeUnderscoredKeys = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(k => {
          if (k && k.startsWith('_')) {
            const naked = k.slice(1);
            if (!(naked in obj)) obj[naked] = obj[k];
          }
        });
      };
      normalizeUnderscoredKeys(user);

      // Normalize nested _id/id fields that might be buffers
      if (user && typeof user === 'object') {
        const maybeFixId = (candidate: any): string | null => {
          if (!candidate) return null;
          if (typeof candidate === 'string') return candidate;
          const b = tryExtractBytes(candidate) || tryExtractBytes(candidate.buffer) || tryExtractBytes(candidate.data);
          if (b && b.length) return b.map(x => ('0' + (x & 0xFF).toString(16)).slice(-2)).join('');
          try { if (typeof candidate.toString === 'function') { const s = candidate.toString(); if (s && s !== '[object Object]') return s; } } catch(e){}
          return null;
        };

        const maybeDecodeString = (candidate: any): string | null => {
          if (!candidate || typeof candidate === 'string') return candidate;
          const b = tryExtractBytes(candidate) || tryExtractBytes(candidate.buffer) || tryExtractBytes(candidate.data);
          if (b && b.length) {
            try { return new TextDecoder().decode(new Uint8Array(b)); } catch(e) {}
          }
          return null;
        };

        const maybeDecodeArray = (candidate: any): string[] | null => {
          if (!candidate) return null;
          if (Array.isArray(candidate)) return candidate.map(item => maybeDecodeString(item) || String(item));
          const b = tryExtractBytes(candidate) || tryExtractBytes(candidate.buffer) || tryExtractBytes(candidate.data);
          if (b && b.length) {
            try {
              const decoded = new TextDecoder().decode(new Uint8Array(b));
              if (decoded.startsWith('[') && decoded.endsWith(']')) return JSON.parse(decoded);
              return [decoded];
            } catch(e) {}
          }
          return null;
        };

        if (user._id && typeof user._id !== 'string') {
          const nid = maybeFixId(user._id);
          if (nid) user._id = nid;
        }
        if (!user._id && user.id && typeof user.id !== 'string') {
          const nid2 = maybeFixId(user.id);
          if (nid2) user._id = nid2;
        }

        // normalize messages that may have underscored properties like _from, _createdAt, etc.
        if (Array.isArray(user.messages)) {
          user.messages = user.messages.map((m: any) => {
            if (!m || typeof m !== 'object') return m;
            const nm: any = {};
            Object.keys(m).forEach(k => {
              const nk = k.startsWith('_') ? k.slice(1) : k;
              nm[nk] = m[k];
            });
            return nm;
          });
        }

        // Decode fields that might be buffers
        ['firstName', 'lastName', 'email', 'gender', 'address', 'aboutMe', 'status', 'education', 'profession', 'school', 'country', 'city'].forEach(key => {
          if (user[key] && typeof user[key] !== 'string') {
            const decoded = maybeDecodeString(user[key]);
            if (decoded !== null) user[key] = decoded;
          }
        });

        ['interests', 'languages'].forEach(key => {
          if (user[key] && !Array.isArray(user[key])) {
            const decoded = maybeDecodeArray(user[key]);
            if (decoded !== null) user[key] = decoded;
          } else if (Array.isArray(user[key])) {
            user[key] = user[key].map((item: any) => maybeDecodeString(item) || String(item));
          }
        });
      }
    } catch (e) {
      console.warn('Error during user normalization:', e);
    }
    // Performance monitoring
    if (typeof (window as any).__perfMonitor !== 'undefined') {
      (window as any).__perfMonitor.incrementUserNormalize();
    }

    // Ensure simple defaults for missing country/city from backend payload
    try {
      if (!user.country || (typeof user.country === 'string' && !user.country.trim())) user.country = '-';
      if (!user.city || (typeof user.city === 'string' && !user.city.trim())) user.city = '-';
    } catch (e) {}

    this._id = user._id || user.id || '';
    this._firstName = user.firstName || '';
    this._lastName = user.lastName || '';
    this._email = user.email || '';
    this._emailVerified = user.emailVerified !== undefined ? !!user.emailVerified : false;
    this._birthDate = this.safeDate(user.birthDate);
    this._gender = user.gender || 'Not specified';
    this._address = user.address || '';
    this._aboutMe = user.aboutMe || '';
    const avatarInput = Array.isArray(user.avatar)
      ? user.avatar
      : this.firstUsableAvatarValue([user.avatar]) ? [user.avatar] : [];
    this.avatar = this.filterCustomAvatars(avatarInput, user.gender);

    let mainAv = this.normalizeStoredAvatarPath(this.firstUsableAvatarValue([
      user.mainAvatar,
      user._mainAvatar,
      user.profilePhoto,
      user.profilePicture,
      user.photo,
      user.picture,
      user.image,
      user.avatarUrl,
      avatarInput
    ]));
    if (!mainAv || this.isOldDefaultAvatar(mainAv)) {
      this._mainAvatar = this.getDefaultAvatar(this._gender);
    } else {
      this._mainAvatar = mainAv;
    }

    this._status = user.status || '';
    this._education = (user.education === 'undefined' || !user.education) ? 'Undefined' : user.education;
    this._profession = (user.profession === 'undefined' || !user.profession) ? 'Undefined' : user.profession;
    this._school = (user.school === 'undefined' || !user.school) ? '' : user.school;

    // Handle interests - ensure it's always an array
    if (Array.isArray(user.interests)) {
      if (user.interests.length === 1 && typeof user.interests[0] === 'string') {
        const decoded = User.decodeMaybeEncodedList(user.interests[0]);
        this._interests = decoded || user.interests;
      } else {
        this._interests = user.interests.length ? user.interests : ['No Interests'];
      }
    } else if (typeof user.interests === 'string') {
      // Attempt to decode encoded/serialized lists first
      const decodedList = User.decodeMaybeEncodedList(user.interests);
      if (decodedList && decodedList.length) {
        this._interests = decodedList;
      } else {
        this._interests = user.interests.split(',').map((i: string) => i.trim()).filter(Boolean);
        if (!this._interests.length) this._interests = ['No Interests'];
      }
    } else {
      this._interests = ['No Interests'];
    }

    // Handle languages - ensure it's always an array
    if (Array.isArray(user.languages)) {
      if (user.languages.length === 1 && typeof user.languages[0] === 'string') {
        const decoded = User.decodeMaybeEncodedList(user.languages[0]);
        this._languages = decoded || user.languages;
      } else {
        this._languages = user.languages;
      }
    } else if (typeof user.languages === 'string') {
      // Attempt to decode encoded/serialized lists first
      const decodedLanguages = User.decodeMaybeEncodedList(user.languages);
      if (decodedLanguages && decodedLanguages.length) {
        this._languages = decodedLanguages;
      } else {
        this._languages = user.languages.split(',').map((l: string) => l.trim()).filter(Boolean);
      }
    } else {
      this._languages = [];
    }

    this._country = user.country ? String(user.country).trim() : '-';
    this._city = user.city ? String(user.city).trim() : '-';
    this._followed = !!user.followed;
    this._friend = !!user.friend;
    this._isFriend = user.isFriend === undefined ? !!user.friend : !!user.isFriend;
    this._isFollowing = !!user.isFollowing;
    this._isFollower = !!user.isFollower;
    this._followStatus = user.followStatus || null;
    this._isPrivate = !!user.isPrivate;
    this._request = user.request || null;
    (this as any).outgoingRequestId = (user as any).outgoingRequestId || null;
    this._requests = Array.isArray(user.requests) ? user.requests.map((req: any) => new Request().initialize(req)) : [];
    this._online = !!user.online;
    this._messages = Array.isArray(user.messages) ? user.messages.map((msg: any) => new Message().initialize(msg)) : [];
    this._subscription = user.subscription ? {
      id: user.subscription.id,
      expireDate: this.safeDate(user.subscription.expireDate)
    } : null;
    this._randomVisible = user.randomVisible || false;
    this._allowVideoRequestsFromNonFriends = !(user.allowVideoRequestsFromNonFriends === false || user.allowVideoRequestsFromNonFriends === 'false' || user.allowVideoRequestsFromNonFriends === 0 || user.allowVideoRequestsFromNonFriends === '0');
    this._ageVisible = user.ageVisible !== undefined ? !!user.ageVisible : true;
    this._genderVisible = user.genderVisible !== undefined ? !!user.genderVisible : true;
    this._loggedIn = !!user.loggedIn;
    this._visitProfile = user.visitProfile ?? false;
    this._profileCreated = !!user.profileCreated;
    this._enabled = !!user.enabled;
    this._is2FAEnabled = !!user.is2FAEnabled;
    this._twoFAToken = user.twoFAToken || '';
    this._role = user.role || 'USER';
    this._banned = !!user.banned;
    this._reports = Array.isArray(user.reports) ? user.reports : [];

    // Normalize ID arrays to ensure they contain strings, not Buffer-like objects
    const normalizeIdArray = (arr: any[]) => {
      if (!Array.isArray(arr)) return [];
      return arr.map(item => {
        if (typeof item === 'string') return item;
        if (item && (item._id || item.id)) return String(item._id || item.id);
        // Handle Buffer-like objects
        const b = tryExtractBytes(item) || tryExtractBytes(item.buffer) || tryExtractBytes(item.data);
        if (b && b.length) return b.map(x => ('0' + (x & 0xFF).toString(16)).slice(-2)).join('');
        return String(item);
      });
    };

    this._followers = normalizeIdArray(user.followers);
    this._following = normalizeIdArray(user.following);
    this._friends = normalizeIdArray(user.friends);
    this._blockedUsers = normalizeIdArray(user.blockedUsers);

    const safeCount = (
      explicit: any,
      fallback: number
    ): number => {
      if (
        explicit === undefined ||
        explicit === null ||
        explicit === ''
      ) {
        return fallback;
      }

      const value = Number(explicit);

      return Number.isFinite(value)
        ? Math.max(0, value)
        : fallback;
    };

    this._followersCount =
      safeCount(
        user.followersCount,
        this._followers.length
      );

    this._followingCount =
      safeCount(
        user.followingCount,
        this._following.length
      );

    this._friendsCount =
      safeCount(
        user.friendsCount,
        this._friends.length
      );

    this._pendingFollowRequestsCount =
      safeCount(
        user.pendingFollowRequestsCount,
        0
      );

    this._pendingFriendRequestsCount =
      safeCount(
        user.pendingFriendRequestsCount,
        0
      );

    // Handle followedChannels - allow populated objects
    this._followedChannels = Array.isArray(user.followedChannels) ? user.followedChannels.map((c: any) => {
      if (c && typeof c === 'object' && (c._id || c.id)) return c;
      return normalizeIdArray([c])[0];
    }) : [];

    this._messagedUsers = normalizeIdArray(user.messagedUsers);

    this._deletedAt = this.safeDate(user.deletedAt);
    this._createdAt = this.safeDate(user.createdAt);
    this._updatedAt = this.safeDate(user.updatedAt);
    this._salt = user.salt || '';
    this._hashed_password = user.hashed_password || '';
    this._lastSeen = this.safeDate(user.lastSeen);  // <-- Initialize lastSeen here
    this._lastSeenText = user.lastSeenText || null;

    this._peerId = user.peerId || null;  // ✅ Assign peerId
    this._missedCallBudget = user.missedCallBudget || 0; // ✅ Assign budget

    this._avatarStyle = user.avatarStyle !== undefined ? user.avatarStyle : 'avataaars';
    this._avatarSeed = user.avatarSeed || '';
    this._avatarVariant = user.avatarVariant || 'classic';
    this._avatarOverrides = user.avatarOverrides || null;

    if (cacheKey && fingerprint) {
      User.normalizationCache.set(cacheKey, { fingerprint, normalized: this });
    }
    if (!this._profileCreated) {
      this._profileCreated = true;
    }

    if (this._interests.length) {
      this.sortInterests();
    }

    //('User initialized successfully:', this.toObject());

    return this;
  }

  private filterCustomAvatars(avatars: any[], gender: string): string[] {
    return avatars
      .map(avatar => this.normalizeStoredAvatarPath(avatar))
      .filter(avatar => avatar && !this.isDefaultAvatar(avatar));
  }



  private normalizeAvatarPath(avatarPath: string): string {
    // Normalize the path by removing the domain and any '/public' prefix
    try {
      const url = new URL(avatarPath);
      avatarPath = url.pathname; // Extract the path from the URL
    } catch (e) {
      // If it's not a full URL, assume it's already a relative path
    }

    // Remove the '/public' prefix if it exists to standardize paths
    if (avatarPath.startsWith('/public')) {
      avatarPath = avatarPath.replace('/public', '');
    }

    return avatarPath;
  }




  private sortInterests(): void {
    this._interests.sort((a, b) => a.length - b.length);
  }

  toObject(): any {
    return {
      _id: this._id,
      firstName: this._firstName,
      lastName: this._lastName,
      fullName: this.fullName,
      email: this._email,
      birthDate: this._birthDate,
      gender: this._gender,
      address: this._address,
      avatar: this._avatar,
      mainAvatar: this._mainAvatar,
      status: this._status,
      education: this._education,
      profession: this._profession,
      school: this._school,
      interests: this._interests,
      languages: this._languages,
      country: this._country,
      city: this._city,
      online: this._online,
      lastSeen: this._lastSeen,  // <-- Include lastSeen in the object returned
      subscription: this._subscription ? {
        id: this._subscription.id,
        expireDate: this._subscription.expireDate
      } : null,
      randomVisible: this._randomVisible,
      allowVideoRequestsFromNonFriends: this._allowVideoRequestsFromNonFriends,
      ageVisible: this._ageVisible,
      genderVisible: this._genderVisible,
      loggedIn: this._loggedIn,
      visitProfile: this._visitProfile,
      profileCreated: this._profileCreated,
      enabled: this._enabled,
      is2FAEnabled: this._is2FAEnabled,
      twoFAToken: this._twoFAToken,
      role: this._role,
      banned: this._banned,
      reports: this._reports,
      followers: this._followers,
      following: this._following,
      friends: this._friends,

      followersCount: this._followersCount,
      followingCount: this._followingCount,
      friendsCount: this._friendsCount,
      pendingFollowRequestsCount:
        this._pendingFollowRequestsCount,
      pendingFriendRequestsCount:
        this._pendingFriendRequestsCount,

      isFriend: this._isFriend,
      blockedUsers: this._blockedUsers,
      followedChannels: this._followedChannels,
      messagedUsers: this._messagedUsers,
      messages: this._messages,
      deletedAt: this._deletedAt,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
      salt: this._salt,
      peerId: this._peerId,  // ✅ Include peerId
      hashed_password: this._hashed_password,
      aboutMe: this._aboutMe, // Added aboutMe field
      lastSeenText: this._lastSeenText,
      avatarStyle: this._avatarStyle,
      avatarSeed: this._avatarSeed,
      avatarVariant: this._avatarVariant,
      avatarOverrides: this._avatarOverrides,
    };
  }

  private safeDate(val: any): Date | null {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
}
