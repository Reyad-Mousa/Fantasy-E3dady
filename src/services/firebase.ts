/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// Configure Auth without popup/redirect resolvers to avoid loading gapi in idle sessions.
export const auth = (() => {
    try {
        return initializeAuth(app, {
            persistence: [browserLocalPersistence],
        });
    } catch {
        // When auth was already initialized (e.g. HMR), reuse the existing instance.
        return getAuth(app);
    }
})();
export const db = getFirestore(app);

export default app;
