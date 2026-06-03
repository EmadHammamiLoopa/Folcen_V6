const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function count(text, pattern) {
  const m = text.match(pattern);
  return m ? m.length : 0;
}

function sliceBetween(text, startNeedle, endNeedle) {
  const start = text.indexOf(startNeedle);
  if (start === -1) return '';
  const end = text.indexOf(endNeedle, start);
  return text.slice(start, end === -1 ? undefined : end);
}

const files = {
  app: read('src/app/app.component.ts'),
  signin: read('src/app/pages/auth/signin/signin.component.ts'),
  newFriends: read('src/app/pages/new-friends/new-friends.page.ts'),
  userModel: read('src/app/models/User.ts'),
  productModel: read('src/app/models/Product.ts'),
  perfMonitor: read('src/app/services/performance-monitor.service.ts'),
  authInterceptor: read('src/app/guards/auth.interceptor.ts'),
  authController: read('isen-backend-master_onprimse/app/controllers/AuthController.js'),
  userController: read('isen-backend-master_onprimse/app/controllers/UserController.js'),
};

const signinSuccess = sliceBetween(files.signin, 'private async _handleSigninSuccess', 'private async clearStaleAuthData');
const appInitialize = sliceBetween(files.app, 'initializeApp()', 'startConnectionMonitoring()');
const backendSignin = sliceBetween(files.authController, 'exports.signin', 'exports.authUser');
const getUsers = sliceBetween(files.userController, 'exports.getUsers', 'function buildBaseFilter');

const metrics = {
  frontendHotConsoleLogs:
    count(files.userModel, /console\.log/g) +
    count(files.productModel, /console\.log/g) +
    count(files.newFriends, /console\.log/g) +
    count(files.perfMonitor, /console\.log/g),
  userModelInitializeLogs: count(sliceBetween(files.userModel, 'initialize(user: any)', 'private filterCustomAvatars'), /console\.log/g),
  productInitializeLogs: count(sliceBetween(files.productModel, 'initialize(product: any)', 'return this;'), /console\.log/g),
  loginBlockingSocketAwaits: count(signinSuccess, /await\s+SocketService\.initializeSocket/g),
  signupBlockingSocketAwaits: count(read('src/app/pages/auth/signup/signup.component.ts'), /await\s+SocketService\.initializeSocket/g),
  appStartupAwaitCount: count(appInitialize, /await\s+/g),
  appStartupSocketInitCalls: count(appInitialize, /SocketService\.initializeSocket/g),
  appStartupUserRefreshCalls: count(appInitialize, /refreshCurrentUser|sessionStore\.init|getUserData|loadRequests/g),
  interceptorNativeStorageReads: count(files.authInterceptor, /nativeStorage\.getItem\('token'\)/g),
  interceptorPlatformReadyWaits: count(files.authInterceptor, /platform\.ready\(\)/g),
  backendSigninAwaitedAuthEvents: count(backendSignin, /await\s+AuthEvent\.create/g),
  backendSigninAwaitedUserSaves: count(backendSignin, /await\s+user\.save/g),
  getUsersSequentialScopes:
    count(getUsers, /await\s+findUsersInCity/g) +
    count(getUsers, /await\s+findUsersInCountry/g) +
    count(getUsers, /await\s+findUsersGlobally/g),
};

const weights = {
  frontendHotConsoleLogs: 3,
  userModelInitializeLogs: 8,
  productInitializeLogs: 5,
  loginBlockingSocketAwaits: 50,
  signupBlockingSocketAwaits: 40,
  appStartupAwaitCount: 8,
  appStartupSocketInitCalls: 15,
  appStartupUserRefreshCalls: 10,
  interceptorNativeStorageReads: 25,
  interceptorPlatformReadyWaits: 25,
  backendSigninAwaitedAuthEvents: 25,
  backendSigninAwaitedUserSaves: 30,
  getUsersSequentialScopes: 12,
};

const weightedScore = Object.entries(metrics).reduce((sum, [key, value]) => {
  return sum + value * (weights[key] || 1);
}, 0);

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  root,
  weightedScore,
  metrics,
}, null, 2));
