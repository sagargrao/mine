// Mock Firebase for local development without needing real Firebase credentials

type MockUser = {
  uid: string
  email: string
  displayName: string
}

type MockAuthState = {
  user: MockUser | null
  users: Record<string, { email: string; password: string; displayName: string; uid: string }>
  privateSpaces: Record<string, any>
  messages: Record<string, any[]>
}

const MOCK_STORAGE_KEY = 'MINE_MOCK_DB'

// Event system for auth state changes
const authListeners = new Set<(user: MockUser | null) => void>()

export function onMockAuthStateChanged(callback: (user: MockUser | null) => void) {
  authListeners.add(callback)
  // Call immediately with current state
  const db = getMockDb()
  callback(db.user)

  return () => {
    authListeners.delete(callback)
  }
}

function notifyAuthListeners(user: MockUser | null) {
  authListeners.forEach((listener) => listener(user))
}

function getMockDb(): MockAuthState {
  const stored = localStorage.getItem(MOCK_STORAGE_KEY)
  return stored
    ? JSON.parse(stored)
    : {
        user: null,
        users: {},
        privateSpaces: {},
        messages: {},
      }
}

function saveMockDb(db: MockAuthState) {
  localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db))
  notifyAuthListeners(db.user)
}

export const mockAuthService = {
  signup: (email: string, password: string, displayName: string) => {
    const db = getMockDb()
    if (db.users[email]) {
      throw new Error('auth/email-already-in-use')
    }

    const uid = `user_${Date.now()}`
    db.users[email] = { email, password, displayName, uid }
    db.user = { uid, email, displayName }
    saveMockDb(db)

    return { uid, email, displayName }
  },

  login: (email: string, password: string) => {
    const db = getMockDb()
    const user = db.users[email]

    if (!user || user.password !== password) {
      throw new Error('auth/wrong-password')
    }

    db.user = { uid: user.uid, email, displayName: user.displayName }
    saveMockDb(db)
    return db.user
  },

  logout: () => {
    const db = getMockDb()
    db.user = null
    saveMockDb(db)
  },

  getCurrentUser: (): MockUser | null => {
    const db = getMockDb()
    return db.user
  },

  resetPassword: (email: string) => {
    const db = getMockDb()
    if (!db.users[email]) {
      throw new Error('auth/user-not-found')
    }
    // In mock, just set a temporary password
    db.users[email].password = 'temp-reset-password'
    saveMockDb(db)
  },
}

export const mockFirestoreService = {
  getUserProfile: (uid: string) => {
    const db = getMockDb()
    const userEntry = Object.values(db.users).find((u) => u.uid === uid)
    if (!userEntry) return null
    return {
      uid,
      email: userEntry.email,
      displayName: userEntry.displayName,
      spaceId: null,
      createdAt: Date.now(),
    }
  },

  updateUserProfile: (uid: string, data: any) => {
    const db = getMockDb()
    const userEntry = Object.values(db.users).find((u) => u.uid === uid)
    if (userEntry) {
      Object.assign(userEntry, data)
      saveMockDb(db)
    }
  },

  createSpace: (code: string, uid: string) => {
    const db = getMockDb()
    const spaceId = `space_${Date.now()}`
    db.privateSpaces[spaceId] = {
      id: spaceId,
      code,
      members: [uid],
      createdBy: uid,
      createdAt: Date.now(),
    }
    db.messages[spaceId] = []
    saveMockDb(db)
    return spaceId
  },

  joinSpace: (code: string, uid: string) => {
    const db = getMockDb()
    const space = Object.values(db.privateSpaces).find((s: any) => s.code === code)
    if (!space) {
      throw new Error('Space not found')
    }
    if (space.members.length >= 2) {
      throw new Error('Space is full')
    }
    space.members.push(uid)
    saveMockDb(db)
    return space.id
  },

  getSpace: (spaceId: string) => {
    const db = getMockDb()
    return db.privateSpaces[spaceId] || null
  },

  addMessage: (spaceId: string, text: string, senderId: string, senderName: string) => {
    const db = getMockDb()
    if (!db.messages[spaceId]) {
      db.messages[spaceId] = []
    }
    db.messages[spaceId].push({
      id: `msg_${Date.now()}`,
      text,
      senderId,
      senderName,
      createdAt: Date.now(),
      status: 'sent',
    })
    saveMockDb(db)
  },

  getMessages: (spaceId: string) => {
    const db = getMockDb()
    return db.messages[spaceId] || []
  },

  leaveSpace: (spaceId: string, uid: string) => {
    const db = getMockDb()
    const space = db.privateSpaces[spaceId]
    if (space) {
      space.members = space.members.filter((id: string) => id !== uid)
      if (space.members.length === 0) {
        delete db.privateSpaces[spaceId]
        delete db.messages[spaceId]
      }
      saveMockDb(db)
    }
  },
}

