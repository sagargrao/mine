import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

export const firebaseReady = Object.values(firebaseConfig).every((value) => value.trim() !== '')

const app = firebaseReady
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export async function signUpUser(email: string, password: string, displayName: string) {
  if (!auth) {
    throw new Error('Firebase is not configured. Add the values from your .env file first.')
  }

  const result = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName.trim()) {
    await updateProfile(result.user, { displayName: displayName.trim() })
  }
  return result.user
}

export async function signInUser(email: string, password: string) {
  if (!auth) {
    throw new Error('Firebase is not configured. Add the values from your .env file first.')
  }

  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function resetPasswordForEmail(email: string) {
  if (!auth) {
    throw new Error('Firebase is not configured. Add the values from your .env file first.')
  }

  await sendPasswordResetEmail(auth, email)
}

export async function signOutUser() {
  if (!auth) {
    throw new Error('Firebase is not configured. Add the values from your .env file first.')
  }

  await signOut(auth)
}

export function getFirebaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'

  if (message.includes('auth/email-already-in-use')) {
    return 'Email already registered.'
  }

  if (
    message.includes('auth/invalid-email')
    || message.includes('auth/user-not-found')
    || message.includes('auth/wrong-password')
    || message.includes('auth/invalid-credential')
    || message.includes('auth/invalid-login-credentials')
  ) {
    return 'Invalid email or password.'
  }

  if (message.includes('auth/weak-password')) {
    return 'Choose a stronger password.'
  }

  if (message.includes('auth/network-request-failed')) {
    return 'Unable to connect to Firebase. Check your internet connection and try again.'
  }

  if (message.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is disabled in Firebase Authentication.'
  }

  if (message.includes('permission-denied')) {
    return 'Firebase denied this request. Check that the latest Firestore security rules are deployed.'
  }

  if (message.includes('Firebase is not configured')) {
    return 'Firebase has not been configured yet. Add your .env values.'
  }

  return message
}

export type { User }
