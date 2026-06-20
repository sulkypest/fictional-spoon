(function() {
  const firebaseConfig = {
    apiKey: 'AIzaSyA6UdbZT_t5gNuhQ3W6mMgzxrsB9y87ozE',
    authDomain: 'draft-punk-a0735.firebaseapp.com',
    projectId: 'draft-punk-a0735',
    storageBucket: 'draft-punk-a0735.firebasestorage.app',
    messagingSenderId: '771798680673',
    appId: '1:771798680673:web:65cf1424be555814d4d620'
  };

  console.log('Firebase config loaded');

  if (!window.firebase) {
    console.error('Firebase SDK not loaded!');
  } else {
    console.log('Firebase SDK found, initializing app');
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase app initialized');
  }

  const auth = firebase.auth();
  const provider = new firebase.auth.GoogleAuthProvider();
  console.log('Firebase auth and provider set up');

  function init(onAuthStateChanged) {
    console.log('FirebaseAuth.init called, setting up listener');
    auth.onAuthStateChanged((user) => {
      console.log('Auth state changed:', user ? `User ${user.email}` : 'No user');
      if (typeof onAuthStateChanged === 'function') {
        onAuthStateChanged(user);
      }
    });
  }

  async function signIn() {
    try {
      console.log('signIn called, initiating popup...');
      const result = await auth.signInWithPopup(provider);
      console.log('signInWithPopup successful, user:', result.user?.email);
      return auth.currentUser;
    } catch (e) {
      console.error('Firebase signIn error:', {
        code: e.code,
        message: e.message,
        full: e
      });
      throw e;
    }
  }

  async function signOut() {
    try {
      await auth.signOut();
    } catch (e) {
      console.error('Firebase signOut error', e);
      throw e;
    }
  }

  async function getToken() {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }

  function getCurrentUser() {
    return auth.currentUser;
  }

  window.FirebaseAuth = {
    init,
    signIn,
    signOut,
    getToken,
    getCurrentUser,
  };
})();
