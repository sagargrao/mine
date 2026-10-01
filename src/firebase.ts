import { initializeApp, type FirebaseApp } from 'firebase/app'
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
import { mockAuthService, mockFirestoreService } from './mockFirebase'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
}

// Use mock Firebase if no real config is available (for demo/development)
const isUsingMock = !Object.values(firebaseConfig).every((value) => value !== '')
export const firebaseReady = true // Always ready now (real or mock)
export const usingMockFirebase = isUsingMock

let app: FirebaseApp | null = null

if (!isUsingMock && Object.values(firebaseConfig).every((value) => value !== '')) {
  app = initializeApp(firebaseConfig)
}

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null

export async function signUpUser(email: string, password: string, displayName: string) {
  if (isUsingMock) {
    return mockAuthService.signup(email, password, displayName) as any
  }

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
  if (isUsingMock) {
    return mockAuthService.login(email, password) as any
  }

  if (!auth) {
    throw new Error('Firebase is not configured. Add the values from your .env file first.')
  }

  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function resetPasswordForEmail(email: string) {
  if (isUsingMock) {
    mockAuthService.resetPassword(email)
    return
  }

  if (!auth) {
    throw new Error('Firebase is not configured. Add the values from your .env file first.')
  }

  await sendPasswordResetEmail(auth, email)
}

export async function signOutUser() {
  if (isUsingMock) {
    mockAuthService.logout()
    return
  }

  if (!auth) return
  await signOut(auth)
}

export function getFirebaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'

  if (message.includes('auth/email-already-in-use')) {
    return 'This email is already in use.'
  }

  if (message.includes('auth/invalid-email')) {
    return 'The email address looks invalid.'
  }

  if (message.includes('auth/weak-password')) {
    return 'Choose a stronger password.'
  }

  if (message.includes('auth/user-not-found') || message.includes('auth/wrong-password')) {
    return 'Incorrect email or password.'
  }

  if (message.includes('Firebase is not configured')) {
    return 'Firebase has not been configured yet. Add your .env values.'
  }

  return message
}

// Helper functions for mock Firebase operations
export function getCurrentMockUser() {
  if (!isUsingMock) return null
  return mockAuthService.getCurrentUser()
}

export function getMockUserProfile(uid: string) {
  if (!isUsingMock) return null
  return mockFirestoreService.getUserProfile(uid)
}

export function updateMockUserProfile(uid: string, data: any) {
  if (!isUsingMock) return
  mockFirestoreService.updateUserProfile(uid, data)
}

export function createMockSpace(code: string, uid: string) {
  if (!isUsingMock) return null
  return mockFirestoreService.createSpace(code, uid)
}

export function joinMockSpace(code: string, uid: string) {
  if (!isUsingMock) return null
  return mockFirestoreService.joinSpace(code, uid)
}

export function getMockSpace(spaceId: string) {
  if (!isUsingMock) return null
  return mockFirestoreService.getSpace(spaceId)
}

export function addMockMessage(spaceId: string, text: string, senderId: string, senderName: string) {
  if (!isUsingMock) return
  mockFirestoreService.addMessage(spaceId, text, senderId, senderName)
}

export function getMockMessages(spaceId: string) {
  if (!isUsingMock) return []
  return mockFirestoreService.getMessages(spaceId)
}

export function leaveMockSpace(spaceId: string, uid: string) {
  if (!isUsingMock) return
  mockFirestoreService.leaveSpace(spaceId, uid)
}

export type { User }
