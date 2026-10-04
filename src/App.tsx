import {useEffect ,useRef,useState} from 'react'
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
  writeBatch,
} from 'firebase/firestore'
import {onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth'
import {
  CheckCheck,
  Copy,
  Heart,
  Lock,
  MessageCircle,
  Send,
  Settings,
  Share2,
  Sparkles,
  WifiOff,
} from 'lucide-react'
import { auth, db, firebaseReady, getFirebaseErrorMessage, resetPasswordForEmail, signInUser, signOutUser, signUpUser } from './lib/firebase'

type UserProfile = {
  uid: string
  email: string
  displayName: string
  spaceId?: string | null
  createdAt?: Timestamp | string | number | null
}

type PrivateSpace = {
  id: string
  pairingCode: string
  members: string[]
  createdBy: string
  status: 'waiting' | 'paired'
  createdAt?: Timestamp | string | number | null
}

type ChatMessage = {
  id: string
  text: string
  senderId: string
  senderName: string
  createdAt?: Timestamp | string | number | null
  status?: string
}

type AuthMode = 'login' | 'signup'

type TabKey = 'home' | 'chat' | 'settings'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const generatePairingCode = () => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const randomBytes = crypto.getRandomValues(new Uint8Array(8))
  const suffix = Array.from(randomBytes, (byte) => alphabet[byte % alphabet.length]).join('')
  return `MINE-${suffix}`
}

function formatTime(value?: Timestamp | string | number | null) {
  if (!value) return 'just now'

  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  if ('toDate' in value) {
    return value.toDate().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return 'just now'
}

function App() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [space, setSpace] = useState<PrivateSpace | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('home')
  const [offline, setOffline] = useState(() => (typeof navigator === 'undefined' ? false : !navigator.onLine))
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const handleAppInstalled = () => setInstallPrompt(null)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    if (!auth || !db) {
      setAuthLoading(false)
      return
    }

    const firestore = db

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user)

      if (!user) {
        setUserProfile(null)
        setSpace(null)
        setAuthLoading(false)
        return
      }

      const userRef = doc(firestore, 'users', user.uid)
      const snapshot = await getDoc(userRef)
      const profile = snapshot.exists()
        ? ({ uid: user.uid, ...(snapshot.data() as Partial<UserProfile>) } as UserProfile)
        : ({
            uid: user.uid,
            email: user.email ?? '',
            displayName: user.displayName ?? 'You',
            spaceId: null,
            createdAt: Date.now(),
          } satisfies UserProfile)

      if (!snapshot.exists()) {
        await setDoc(userRef, profile)
      }

      setUserProfile(profile)
      if (!profile.spaceId) {
        setSpace(null)
      }
      setAuthLoading(false)
    })

    const updateOfflineStatus = () => setOffline(!navigator.onLine)
    window.addEventListener('online', updateOfflineStatus)
    window.addEventListener('offline', updateOfflineStatus)

    return () => {
      unsubscribe()
      window.removeEventListener('online', updateOfflineStatus)
      window.removeEventListener('offline', updateOfflineStatus)
    }
  }, [])

  useEffect(() => {
    if (!authUser || !db || !userProfile?.spaceId) {
      return
    }

    const spaceRef = doc(db, 'privateSpaces', userProfile.spaceId)
    const unsubscribe = onSnapshot(spaceRef, (snapshot) => {
      if (!snapshot.exists()) {
        setSpace(null)
        return
      }

      setSpace({ id: snapshot.id, ...(snapshot.data() as Omit<PrivateSpace, 'id'>) })
    })

    return () => unsubscribe()
  }, [authUser, userProfile?.spaceId])

  const handleLeaveSpace = async () => {
    if (!auth || !db || !userProfile?.spaceId) return

    try {
      const spaceRef = doc(db, 'privateSpaces', userProfile.spaceId)
      const spaceSnapshot = await getDoc(spaceRef)
      const batch = writeBatch(db)

      if (spaceSnapshot.exists()) {
        const spaceData = spaceSnapshot.data() as PrivateSpace
        const currentUid = auth.currentUser?.uid
        const members = spaceData.members
        const nextMembers = members.filter((memberId) => memberId !== currentUid)

        if (!currentUid || !members.includes(currentUid)) {
          throw new Error('Your account is not a member of this private space.')
        }

        if (nextMembers.length > 0) {
          batch.update(spaceRef, { members: nextMembers, status: 'waiting' })
        } else {
          batch.delete(spaceRef)
          batch.delete(doc(db, 'pairingCodes', spaceData.pairingCode))
        }
      } else {
        console.warn('The linked private space was not found; clearing the stale profile link.')
      }

      batch.set(
        doc(db, 'users', userProfile.uid),
        { ...userProfile, spaceId: null },
        { merge: true },
      )
      await batch.commit()

      setUserProfile({ ...userProfile, spaceId: null })
      setSpace(null)
      setActiveTab('home')
    } catch (caughtError) {
      window.alert(getFirebaseErrorMessage(caughtError))
    }
  }

  if (!firebaseReady) {
    return <SetupRequired />
  }

  if (authLoading) {
    return <LoadingScreen />
  }

  if (!authUser) {
    return <AuthScreen />
  }

  if (!userProfile?.spaceId && !space) {
    return <PairingScreen profile={userProfile} onJoinedSpace={(updatedProfile) => setUserProfile(updatedProfile)} />
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f1ff] text-[#261b36]">
      {offline && (
        <div className="flex items-center justify-center gap-2 bg-[#f3e5ff] px-4 py-2 text-sm font-medium text-[#4e345f]">
          <WifiOff className="h-4 w-4" />
          You&apos;re offline
        </div>
      )}

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden border-x border-[#eadbf7] bg-white shadow-[0_15px_35px_rgba(54,34,72,0.08)]">
        <header className="border-b border-[#f0e7f7] px-4 pb-3 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-[#8f7ca8]">MINE</p>
              <h1 className="mt-1 text-2xl font-semibold text-[#2c2142]">Just ours.</h1>
            </div>
            <div className="rounded-full bg-[#f3eaff] p-2 text-[#5b3674]">
              <Heart className="h-5 w-5" fill="currentColor" />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          {activeTab === 'home' && (
            <HomeTab profile={userProfile} space={space} onSignOut={async () => { await signOutUser(); setAuthUser(null); }} />
          )}

          {activeTab === 'chat' && (
            <ChatPanel
              key={space?.id ?? userProfile?.spaceId ?? 'unpaired'}
              currentUser={authUser}
              currentProfile={userProfile}
              spaceId={space?.id ?? userProfile?.spaceId ?? null}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              profile={userProfile}
              space={space}
              installPrompt={installPrompt}
              onLeaveSpace={handleLeaveSpace}
              onSignOut={async () => {
                await signOutUser()
                setAuthUser(null)
              }}
            />
          )}
        </main>

        <nav className="flex border-t border-[#efe4f7] bg-white px-2 py-2">
          {[
            { key: 'home', label: 'Home', icon: Sparkles },
            { key: 'chat', label: 'Chat', icon: MessageCircle },
            { key: 'settings', label: 'Settings', icon: Settings },
          ].map((item) => {
            const Icon = item.icon
            const selected = activeTab === item.key

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveTab(item.key as TabKey)}
                className={`flex flex-1 flex-col items-center justify-center rounded-2xl px-2 py-3 text-[11px] font-medium transition ${
                  selected ? 'bg-[#f3eaff] text-[#4c2d61]' : 'text-[#7d6d92]'
                }`}
              >
                <Icon className="mb-1 h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signup')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please add your email and password.')
      return
    }

    if (mode === 'signup' && !displayName.trim()) {
      setError('Please choose a display name.')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (mode === 'signup') {
        const user = await signUpUser(email.trim(), password, displayName.trim())

        if (db && auth) {
          const firestore = db
          const userProfile: UserProfile = {
            uid: user.uid,
            email: user.email ?? '',
            displayName: user.displayName ?? displayName.trim(),
            spaceId: null,
            createdAt: Date.now(),
          }

          await setDoc(doc(firestore, 'users', user.uid), userProfile)
        }

        setSuccess('Account created. Create or join your private space next.')
      } else {
        await signInUser(email.trim(), password)
      }
    } catch (caughtError) {
      setError(getFirebaseErrorMessage(caughtError))
    } finally {
      setLoading(false)
    }
  }

  const requestReset = async () => {
    if (!email.trim()) {
      setError('Add your email first to reset your password.')
      return
    }

    try {
      await resetPasswordForEmail(email.trim())
      setSuccess('Password reset email sent.')
    } catch (caughtError) {
      setError(getFirebaseErrorMessage(caughtError))
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#fff7f4_0%,_#f6f0ff_40%,_#f1ebfb_100%)] px-4 py-8 text-[#2d2340]">
      <div className="w-full max-w-sm rounded-[32px] border border-[#efe2fb] bg-white p-6 shadow-[0_15px_40px_rgba(89,57,103,0.12)]">
        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#f5e9ff] text-2xl text-[#4d2f67] shadow-inner">
            <Heart className="h-8 w-8" fill="currentColor" />
          </div>
        </div>

        <p className="text-center text-[10px] uppercase tracking-[0.32em] text-[#927eb2]">MINE</p>
        <h2 className="mt-2 text-center text-3xl font-semibold text-[#2b213c]">Just ours.</h2>
        <p className="mt-2 text-center text-sm text-[#685d7b]">A private space for two.</p>

        <div className="mt-6 grid grid-cols-2 rounded-full bg-[#f5f0fb] p-1">
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === 'signup' ? 'bg-white text-[#352742] shadow' : 'text-[#7e7394]'
            }`}
          >
            Sign up
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              mode === 'login' ? 'bg-white text-[#352742] shadow' : 'text-[#7e7394]'
            }`}
          >
            Login
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {mode === 'signup' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#7b6788]">Name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-[#eadcf7] bg-[#faf6ff] px-3 py-3 text-sm outline-none transition focus:border-[#d6baf8]"
                placeholder="Your name"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#7b6788]">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-[#eadcf7] bg-[#faf6ff] px-3 py-3 text-sm outline-none transition focus:border-[#d6baf8]"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#7b6788]">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-[#eadcf7] bg-[#faf6ff] px-3 py-3 text-sm outline-none transition focus:border-[#d6baf8]"
              placeholder="••••••••"
            />
          </label>
        </div>

        {error && <p className="mt-4 rounded-2xl bg-[#fef1f2] px-3 py-2 text-sm text-[#9a2d4f]">{error}</p>}
        {success && <p className="mt-4 rounded-2xl bg-[#eefaf4] px-3 py-2 text-sm text-[#1d6d4a]">{success}</p>}

        <button
          type="button"
          disabled={loading}
          onClick={submit}
          className="mt-6 flex w-full items-center justify-center rounded-2xl bg-[#2d2143] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#221632] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Login'}
        </button>

        {mode === 'login' && (
          <button
            type="button"
            onClick={requestReset}
            className="mt-3 w-full text-center text-xs font-medium text-[#5c4176] underline underline-offset-4"
          >
            Reset password
          </button>
        )}
      </div>
    </div>
  )
}

function PairingScreen({
  profile,
  onJoinedSpace,
}: {
  profile: UserProfile | null
  onJoinedSpace: (updatedProfile: UserProfile) => void
}) {
  const [ownCode, setOwnCode] = useState<string | null>(null)
  const [partnerCode, setPartnerCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  const createSpace = async () => {
    if (!auth || !db || !profile) return

    const firestore = db
    const currentUser = auth.currentUser

    if (!currentUser || currentUser.uid !== profile.uid) {
      setError('Please sign in again before creating a private space.')
      return
    }

    setCreating(true)
    setFeedback('')
    setError('')

    try {
      let code = ''
      let pairingCodeRef: ReturnType<typeof doc> | null = null

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = generatePairingCode()
        const candidateRef = doc(firestore, 'pairingCodes', candidate)
        if (!(await getDoc(candidateRef)).exists()) {
          code = candidate
          pairingCodeRef = candidateRef
          break
        }
      }

      if (!code || !pairingCodeRef) {
        throw new Error('Could not create a unique pairing code. Please try again.')
      }

      const spaceRef = doc(collection(firestore, 'privateSpaces'))
      const batch = writeBatch(firestore)
      batch.set(spaceRef, {
        id: spaceRef.id,
        pairingCode: code,
        members: [currentUser.uid],
        createdBy: currentUser.uid,
        status: 'waiting',
        createdAt: serverTimestamp(),
      })
      batch.set(pairingCodeRef, { spaceId: spaceRef.id })
      batch.set(
        doc(firestore, 'users', profile.uid),
        {
          ...profile,
          spaceId: spaceRef.id,
          displayName: profile.displayName || auth.currentUser?.displayName || 'You',
        },
        { merge: true },
      )
      await batch.commit()

      setOwnCode(code)
      setFeedback('Your private space is ready ❤️')
      onJoinedSpace({ ...profile, spaceId: spaceRef.id })
    } catch (caughtError) {
      setError(getFirebaseErrorMessage(caughtError))
    } finally {
      setCreating(false)
    }
  }

  const joinSpace = async () => {
    if (!auth || !db || !profile) return

    const currentUser = auth.currentUser
    if (!currentUser || currentUser.uid !== profile.uid) {
      setError('Please sign in again before joining a private space.')
      return
    }

    if (profile.spaceId) {
      setError('You already have a private space.')
      return
    }

    const cleanCode = partnerCode.trim().toUpperCase()
    if (!cleanCode) {
      setError('Enter a pairing code.')
      return
    }

    const firestore = db

    setJoining(true)
    setFeedback('')
    setError('')

    try {
      const pairingCodeSnapshot = await getDoc(doc(firestore, 'pairingCodes', cleanCode))
      if (!pairingCodeSnapshot.exists()) {
        setError('Invalid pairing code.')
        return
      }

      const spaceId = pairingCodeSnapshot.data().spaceId
      if (typeof spaceId !== 'string' || !spaceId) {
        throw new Error('This pairing code is invalid. Ask your partner to create a new code.')
      }

      const batch = writeBatch(firestore)
      batch.update(doc(firestore, 'privateSpaces', spaceId), {
        members: arrayUnion(currentUser.uid),
        status: 'paired',
      })
      batch.set(
        doc(firestore, 'users', profile.uid),
        {
          ...profile,
          spaceId,
        },
        { merge: true },
      )
      await batch.commit()

      setFeedback('Your private space is ready ❤️')
      onJoinedSpace({ ...profile, spaceId })
    } catch (caughtError) {
      setError(getFirebaseErrorMessage(caughtError))
    } finally {
      setJoining(false)
    }
  }

  const copyCode = async () => {
    if (!ownCode) return
    await navigator.clipboard.writeText(ownCode)
    setFeedback('Code copied to clipboard.')
  }

  const shareCode = async () => {
    if (!ownCode) return

    const shareData = {
      title: 'MINE private code',
      text: `Your MINE private code is ${ownCode}`,
    }

    if (navigator.share) {
      await navigator.share(shareData)
      return
    }

    await navigator.clipboard.writeText(ownCode)
    setFeedback('Code copied to clipboard.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f0ff] px-4 py-8">
      <div className="w-full max-w-md rounded-[28px] border border-[#efe3f7] bg-white p-5 shadow-[0_12px_32px_rgba(94,64,108,0.08)]">
        <div className="mb-5 flex items-center justify-center gap-2 text-[#563d72]">
          <Lock className="h-5 w-5" />
          <p className="text-xs font-semibold uppercase tracking-[0.22em]">Private pairing</p>
        </div>

        <h2 className="text-2xl font-semibold text-[#2b2240]">Create or join your private space</h2>

        <div className="mt-6 rounded-[24px] border border-[#efe3f7] bg-[#faf6ff] p-4">
          <p className="text-xs uppercase tracking-[0.24em] text-[#8571a2]">Your MINE private code</p>
          <p className="mt-3 text-2xl font-semibold tracking-[0.16em] text-[#2d2143]">{ownCode ?? 'Not created yet'}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={createSpace}
              disabled={creating}
              className="flex-1 rounded-2xl bg-[#2d2143] px-3 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create code'}
            </button>
            <button
              type="button"
              onClick={copyCode}
              disabled={!ownCode}
              className="rounded-2xl border border-[#e9dffd] bg-white px-3 py-2.5 text-sm font-medium text-[#483960] disabled:opacity-40"
            >
              <span className="flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Copy
              </span>
            </button>
            <button
              type="button"
              onClick={shareCode}
              disabled={!ownCode}
              className="rounded-2xl border border-[#e9dffd] bg-white px-3 py-2.5 text-sm font-medium text-[#483960] disabled:opacity-40"
            >
              <span className="flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                Share
              </span>
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#7b6788]">Partner code</span>
            <input
              value={partnerCode}
              onChange={(event) => setPartnerCode(event.target.value)}
              className="w-full rounded-2xl border border-[#eadcf7] bg-[#faf6ff] px-3 py-3 text-sm outline-none transition focus:border-[#d6baf8]"
              placeholder="MINE-7K92X"
            />
          </label>

          <button
            type="button"
            onClick={joinSpace}
            disabled={joining}
            className="w-full rounded-2xl bg-[#1d8a67] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {joining ? 'Joining...' : 'Join private space'}
          </button>
        </div>

        {feedback && <p className="mt-4 rounded-2xl bg-[#edfaf4] px-3 py-2 text-sm text-[#1d6d4a]">{feedback}</p>}
        {error && <p className="mt-4 rounded-2xl bg-[#fdf0f3] px-3 py-2 text-sm text-[#9a2d4f]">{error}</p>}
      </div>
    </div>
  )
}

function HomeTab({
  profile,
  space,
  onSignOut,
}: {
  profile: UserProfile | null
  space: PrivateSpace | null
  onSignOut: () => Promise<void>
}) {
  return (
    <div className="flex h-full flex-col p-4 pb-20">
      <div className="rounded-[28px] bg-[linear-gradient(180deg,_#f8ecff_0%,_#fff7f8_100%)] p-5 shadow-[0_12px_28px_rgba(73,51,87,0.08)]">
        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#f3eaff] text-[#4a315f]">
            <Heart className="h-8 w-8" fill="currentColor" />
          </div>
        </div>
        <p className="mt-4 text-center text-[10px] uppercase tracking-[0.3em] text-[#8d7da8]">MINE</p>
        <h2 className="mt-2 text-center text-2xl font-semibold text-[#2d2240]">{profile?.displayName ?? 'You'}</h2>
        <p className="mt-1 text-center text-sm text-[#685d7b]">A private space for two.</p>

        <div className="mt-5 rounded-[20px] border border-[#f0e4f7] bg-white/80 p-3 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#8a7999]">Private space</p>
          <p className="mt-2 text-base font-medium text-[#352748]">{space?.pairingCode ?? 'Pending pairing'}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {[
          { label: 'Chat', icon: MessageCircle },
          { label: 'Memories', icon: Heart },
          { label: 'Our Days', icon: Sparkles },
          { label: 'Mood', icon: Lock },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="rounded-[24px] border border-[#efe6f8] bg-white p-4 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f3eaff] text-[#4c2d62]">
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-sm font-medium text-[#2f243f]">{item.label}</p>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="mt-auto rounded-2xl border border-[#f0dfe8] bg-[#fff7fb] px-4 py-3 text-sm font-medium text-[#7a4259]"
      >
        Logout
      </button>
    </div>
  )
}

function ChatPanel({
  currentUser,
  currentProfile,
  spaceId,
}: {
  currentUser: FirebaseUser
  currentProfile: UserProfile | null
  spaceId: string | null
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!db || !spaceId) return

    const firestore = db
    const messagesQuery = query(collection(firestore, 'privateSpaces', spaceId, 'messages'), orderBy('createdAt', 'asc'))
    const unsubscribe = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const nextMessages = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ChatMessage, 'id'>),
        })) as ChatMessage[]
        setMessages(nextMessages)
        setError('')
      },
      (caughtError) => setError(getFirebaseErrorMessage(caughtError)),
    )

    return () => unsubscribe()
  }, [spaceId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!db || !spaceId || !input.trim()) return

    const firestore = db
    setSending(true)
    setError('')

    try {
      await addDoc(collection(firestore, 'privateSpaces', spaceId, 'messages'), {
        text: input.trim(),
        senderId: currentUser.uid,
        senderName: currentProfile?.displayName ?? currentUser.displayName ?? 'You',
        createdAt: serverTimestamp(),
        status: 'sent',
        type: 'text',
        readBy: [currentUser.uid],
        editedAt: null,
        replyTo: null,
      })
      setInput('')
    } catch (caughtError) {
      setError(getFirebaseErrorMessage(caughtError))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#faf7ff]">
      <div className="flex items-center justify-between border-b border-[#efe4f7] bg-white px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-[#8d7ca6]">Private chat</p>
          <h3 className="mt-1 text-base font-semibold text-[#2b2140]">Your person</h3>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-[#edf9f1] px-2.5 py-1 text-[11px] font-medium text-[#236d45]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2eb56f]" />
          Online
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {error && <p className="rounded-2xl bg-[#fdf0f3] px-3 py-2 text-sm text-[#9a2d4f]">{error}</p>}
        {messages.length === 0 && (
          <div className="rounded-[22px] border border-dashed border-[#e8d7f5] bg-white p-4 text-sm text-[#715f86]">
            Start your first private message.
          </div>
        )}

        {messages.map((message) => {
          const isMine = message.senderId === currentUser.uid

          return (
            <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-[22px] px-3.5 py-2.5 shadow-sm ${
                  isMine ? 'bg-[#2d2143] text-white' : 'bg-white text-[#2d2241]'
                }`}
              >
                <div className="text-[11px] font-medium opacity-70">{message.senderName}</div>
                <p className="mt-1 break-words text-sm leading-6">{message.text}</p>
                <div className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${isMine ? 'text-[#d9d1ef]' : 'text-[#7d6d92]'}`}>
                  <span>{formatTime(message.createdAt)}</span>
                  {isMine && (
                    <span className="inline-flex items-center gap-1">
                      {message.status === 'sent' ? 'Sent' : 'Read'}
                      {message.status === 'sent' ? <CheckCheck className="h-3 w-3" /> : <CheckCheck className="h-3 w-3" />}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[#efe4f7] bg-white p-3">
        <div className="flex items-center gap-2 rounded-[20px] border border-[#eee3fa] bg-[#faf6ff] px-3 py-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Write a private message..."
            className="w-full bg-transparent text-sm text-[#2d2241] outline-none placeholder:text-[#7b6f8d]"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void sendMessage()
              }
            }}
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2d2143] text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsTab({
  profile,
  space,
  installPrompt,
  onLeaveSpace,
  onSignOut,
}: {
  profile: UserProfile | null
  space: PrivateSpace | null
  installPrompt: BeforeInstallPromptEvent | null
  onLeaveSpace: () => Promise<void>
  onSignOut: () => Promise<void>
}) {
  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="rounded-[24px] border border-[#ebdef7] bg-white p-4">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#8c7ba6]">Profile</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3eaff] text-[#4f355f]">
            <Heart className="h-5 w-5" fill="currentColor" />
          </div>
          <div>
            <p className="font-semibold text-[#2a2140]">{profile?.displayName ?? 'You'}</p>
            <p className="text-xs text-[#6d617e]">{profile?.email ?? 'No email saved'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-[#ebdef7] bg-white p-4">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#8c7ba6]">Private space</p>
        <p className="mt-3 text-sm text-[#2a2140]">Code: {space?.pairingCode ?? 'Not paired'}</p>
        <p className="mt-2 text-sm text-[#2a2140]">Private space ID: {space?.id ?? 'No space yet'}</p>
      </div>

      {installPrompt && (
        <button
          type="button"
          onClick={() => {
            void installPrompt.prompt()
          }}
          className="w-full rounded-[20px] bg-[#2d2143] px-4 py-3 text-left text-sm font-medium text-white"
        >
          Install app
        </button>
      )}

      {space && (
        <button
          type="button"
          onClick={() => void onLeaveSpace()}
          className="w-full rounded-[20px] border border-[#f0dfe8] bg-[#fff7fb] px-4 py-3 text-left text-sm font-medium text-[#7a4259]"
        >
          Leave private space
        </button>
      )}

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="w-full rounded-[20px] border border-[#f0dfe8] bg-[#fff7fb] px-4 py-3 text-left text-sm font-medium text-[#7a4259]"
      >
        Logout
      </button>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f1ff] text-[#2d2143]">
      <div className="rounded-[24px] border border-[#ecdffb] bg-white px-5 py-4 text-sm font-medium shadow-[0_12px_28px_rgba(105,75,124,0.08)]">
        Loading MINE...
      </div>
    </div>
  )
}

function SetupRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f1ff] px-4">
      <div className="max-w-md rounded-[28px] border border-[#eee0f7] bg-white p-6 text-[#2d2140] shadow-[0_12px_32px_rgba(92,64,99,0.1)]">
        <div className="mb-4 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#f3eaff] text-[#4c3165]">
            <Heart className="h-8 w-8" fill="currentColor" />
          </div>
        </div>
        <p className="text-center text-[10px] uppercase tracking-[0.28em] text-[#8e7ba7]">MINE</p>
        <h2 className="mt-3 text-center text-2xl font-semibold">Firebase setup needed</h2>
        <p className="mt-3 text-sm leading-6 text-[#6f637b]">
          Add your Firebase keys to the .env file and restart the app. This is required before sign up and private pairing can work.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-[18px] bg-[#f8f2ff] p-3 text-xs text-[#3a2a49]">
{`VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...`}
        </pre>
      </div>
    </div>
  )
}

export default App
