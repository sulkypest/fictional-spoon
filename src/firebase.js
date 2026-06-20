(function() {
  const firebaseConfig = {
    apiKey: 'AIzaSyA6UdbZT_t5gNuhQ3W6mMgzxrsB9y87ozE',
    authDomain: 'draft-punk-a0735.firebaseapp.com',
    projectId: 'draft-punk-a0735',
    storageBucket: 'draft-punk-a0735.firebasestorage.app',
    messagingSenderId: '771798680673',
    appId: '1:771798680673:web:65cf1424be555814d4d620'
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const provider = new firebase.auth.GoogleAuthProvider();

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
      await auth.signInWithPopup(provider);
      return auth.currentUser;
    } catch (e) {
      console.error('Firebase signIn error', e);
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
