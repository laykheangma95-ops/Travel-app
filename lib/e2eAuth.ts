import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';

export const E2E_AUTH_COOKIE = 'domner-e2e-session';
export const E2E_USERS_KEY = 'domner-e2e-users';
export const E2E_LAST_SIGNUP_LINK_KEY = 'domner-e2e-last-signup-link';
export const E2E_LAST_RESET_LINK_KEY = 'domner-e2e-last-reset-link';

const E2E_EMAIL_OTP_KEY = 'domner-e2e-email-otp';
const E2E_RECOVERY_OTP_KEY = 'domner-e2e-recovery-otp';
const E2E_PHONE_OTP_KEY = 'domner-e2e-phone-otp';
const E2E_AUTH_EVENT_KEY = 'domner-e2e-auth-event';

type Lang = 'km' | 'en';

interface StoredUser {
  id: string;
  email: string;
  password: string;
  confirmedAt: string | null;
  fullName: string | null;
  phone: string | null;
  passportCountry: string;
  preferredLanguage: Lang;
}

interface StoredProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  passport_country: string;
  preferred_language: Lang;
  telegram_username: string | null;
}

interface StoredOtp {
  email?: string;
  phone?: string;
  code: string;
}

interface CallbackPayload {
  kind: 'oauth' | 'verify';
  provider: 'google' | 'apple' | 'email';
  user: StoredUser;
}

interface RecoveryPayload {
  user: StoredUser;
}

interface SessionCookie {
  user: StoredUser;
}

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

const listeners = new Set<AuthListener>();
let storageBridgeInstalled = false;
let cachedBrowserClient: SupabaseClient | null = null;

function clientEnabled(): boolean {
  return process.env.NEXT_PUBLIC_E2E_AUTH === 'true';
}

export function e2eAuthEnabled(): boolean {
  return process.env.DOMNER_E2E_AUTH === 'true' || process.env.NEXT_PUBLIC_E2E_AUTH === 'true';
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function encodeToken(value: unknown): string {
  const json = JSON.stringify(value);
  const base64 =
    typeof window === 'undefined'
      ? Buffer.from(json, 'utf8').toString('base64')
      : window.btoa(json);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeToken<T>(value: string): T | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const json =
      typeof window === 'undefined'
        ? Buffer.from(padded, 'base64').toString('utf8')
        : window.atob(padded);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function cookieValue(name: string, cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return null;
}

function readClientCookie(name: string): string | null {
  if (!hasWindow()) return null;
  return cookieValue(name, document.cookie);
}

function writeClientCookie(name: string, value: string | null): void {
  if (!hasWindow()) return;
  if (value === null) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

function readLocal<T>(key: string, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function nextId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readUsers(): StoredUser[] {
  return readLocal<StoredUser[]>(E2E_USERS_KEY, []);
}

function writeUsers(users: StoredUser[]): void {
  writeLocal(E2E_USERS_KEY, users);
}

function upsertUser(user: StoredUser): StoredUser {
  const users = readUsers();
  const index = users.findIndex((candidate) => normalizedEmail(candidate.email) === normalizedEmail(user.email));
  if (index === -1) {
    users.push(user);
  } else {
    users[index] = { ...users[index], ...user };
  }
  writeUsers(users);
  return index === -1 ? user : users[index];
}

function findUserByEmail(email: string): StoredUser | null {
  const target = normalizedEmail(email);
  return readUsers().find((candidate) => normalizedEmail(candidate.email) === target) ?? null;
}

function toSupabaseUser(user: StoredUser): User {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    phone: user.phone,
    confirmed_at: user.confirmedAt,
    created_at: user.confirmedAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {
      full_name: user.fullName,
      phone: user.phone,
      passport_country: user.passportCountry,
      preferred_language: user.preferredLanguage,
    },
  } as User;
}

function sessionFromUser(user: StoredUser | null): Session | null {
  if (!user) return null;
  return {
    access_token: `e2e-access-${user.id}`,
    refresh_token: `e2e-refresh-${user.id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: toSupabaseUser(user),
  } as Session;
}

function readSessionCookie(): SessionCookie | null {
  const raw = readClientCookie(E2E_AUTH_COOKIE);
  if (!raw) return null;
  return decodeToken<SessionCookie>(raw);
}

function persistSessionUser(user: StoredUser | null): void {
  if (!user) return;
  const existing = findUserByEmail(user.email);
  upsertUser({
    ...user,
    password: existing?.password ?? user.password,
  });
}

function readSessionUser(): StoredUser | null {
  const session = readSessionCookie();
  if (!session?.user) return null;
  persistSessionUser(session.user);
  return session.user;
}

function setSessionUser(user: StoredUser | null): Session | null {
  if (!user) {
    writeClientCookie(E2E_AUTH_COOKIE, null);
    return null;
  }
  const sessionCookie: SessionCookie = { user };
  writeClientCookie(E2E_AUTH_COOKIE, encodeToken(sessionCookie));
  persistSessionUser(user);
  return sessionFromUser(user);
}

function otpStore(key: string): StoredOtp[] {
  return readLocal<StoredOtp[]>(key, []);
}

function setOtp(key: string, otp: StoredOtp): void {
  const entries = otpStore(key).filter(
    (entry) => entry.email !== otp.email || entry.phone !== otp.phone
  );
  entries.push(otp);
  writeLocal(key, entries);
}

function consumeOtp(key: string, match: Partial<StoredOtp>, code: string): StoredOtp | null {
  const entries = otpStore(key);
  const index = entries.findIndex(
    (entry) =>
      entry.code === code &&
      (match.email ? entry.email === match.email : true) &&
      (match.phone ? entry.phone === match.phone : true)
  );
  if (index === -1) return null;
  const [hit] = entries.splice(index, 1);
  writeLocal(key, entries);
  return hit;
}

function callbackLink(path: string, payload: CallbackPayload): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('code', encodeToken(payload));
  if (payload.kind === 'verify') url.searchParams.set('type', 'signup');
  return url.toString();
}

function recoveryLink(path: string, payload: RecoveryPayload): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('token_hash', encodeToken(payload));
  url.searchParams.set('type', 'recovery');
  url.searchParams.set('email', payload.user.email);
  return url.toString();
}

function broadcast(event: AuthChangeEvent, session: Session | null): void {
  for (const listener of listeners) listener(event, session);
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(
      E2E_AUTH_EVENT_KEY,
      JSON.stringify({ event, session, at: Date.now() })
    );
  } catch {
    // Best effort only.
  }
}

function installStorageBridge(): void {
  if (!hasWindow() || storageBridgeInstalled) return;
  window.addEventListener('storage', (event) => {
    if (event.key !== E2E_AUTH_EVENT_KEY || !event.newValue) return;
    try {
      const payload = JSON.parse(event.newValue) as { event: AuthChangeEvent; session: Session | null };
      for (const listener of listeners) listener(payload.event, payload.session);
    } catch {
      // Ignore malformed test data.
    }
  });
  storageBridgeInstalled = true;
}

function ensureExistingUser(email: string, defaults?: Partial<StoredUser>): StoredUser {
  const existing = findUserByEmail(email);
  if (existing) return existing;
  return upsertUser({
    id: nextId(),
    email: normalizedEmail(email),
    password: defaults?.password ?? 'Password123!',
    confirmedAt: defaults?.confirmedAt ?? new Date().toISOString(),
    fullName: defaults?.fullName ?? 'Domner Traveller',
    phone: defaults?.phone ?? null,
    passportCountry: defaults?.passportCountry ?? 'KH',
    preferredLanguage: defaults?.preferredLanguage ?? 'km',
  });
}

function makeBrowserClient(): SupabaseClient {
  const auth = {
    async signInWithOAuth({
      provider,
      options,
    }: {
      provider: 'google' | 'apple';
      options?: { redirectTo?: string };
    }) {
      const user = ensureExistingUser(
        provider === 'google' ? 'google.user@domner.test' : 'apple.user@privaterelay.appleid.com',
        {
          confirmedAt: new Date().toISOString(),
          fullName: provider === 'google' ? 'Google Traveller' : 'Apple Traveller',
        }
      );
      const destination = options?.redirectTo ?? `${window.location.origin}/auth/callback`;
      window.location.assign(
        callbackLink(destination, {
          kind: 'oauth',
          provider,
          user,
        })
      );
      return { data: { provider }, error: null };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const user = findUserByEmail(email);
      if (!user || user.password !== password) {
        return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
      }
      if (!user.confirmedAt) {
        return { data: { session: null, user: null }, error: { message: 'Email not confirmed' } };
      }
      const session = setSessionUser(user);
      broadcast('SIGNED_IN', session);
      return { data: { session, user: session?.user ?? null }, error: null };
    },

    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
    }) {
      if (findUserByEmail(email)) {
        return { data: { user: null, session: null }, error: { message: 'User already registered' } };
      }
      const user = upsertUser({
        id: nextId(),
        email: normalizedEmail(email),
        password,
        confirmedAt: null,
        fullName: typeof options?.data?.full_name === 'string' ? options.data.full_name : null,
        phone: typeof options?.data?.phone === 'string' ? options.data.phone : null,
        passportCountry:
          typeof options?.data?.passport_country === 'string'
            ? options.data.passport_country
            : 'KH',
        preferredLanguage:
          options?.data?.preferred_language === 'en' ? 'en' : 'km',
      });
      const redirectTo = options?.emailRedirectTo ?? `${window.location.origin}/auth/callback`;
      window.localStorage.setItem(
        E2E_LAST_SIGNUP_LINK_KEY,
        callbackLink(redirectTo, { kind: 'verify', provider: 'email', user })
      );
      return { data: { user: toSupabaseUser(user), session: null }, error: null };
    },

    async signInWithOtp({
      email,
      phone,
      options,
    }: {
      email?: string;
      phone?: string;
      options?: { shouldCreateUser?: boolean; emailRedirectTo?: string };
    }) {
      if (email) {
        let user = findUserByEmail(email);
        if (!user && !options?.shouldCreateUser) {
          return { data: { user: null, session: null }, error: { message: 'Email address not authorized' } };
        }
        if (!user) user = ensureExistingUser(email, { confirmedAt: new Date().toISOString() });
        setOtp(E2E_EMAIL_OTP_KEY, { email: user.email, code: '123456' });
        return { data: { user: toSupabaseUser(user), session: null }, error: null };
      }

      if (phone) {
        setOtp(E2E_PHONE_OTP_KEY, { phone, code: '123456' });
        return { data: { user: null, session: null }, error: null };
      }

      return { data: { user: null, session: null }, error: { message: 'Unsupported provider' } };
    },

    async verifyOtp(args: {
      email?: string;
      phone?: string;
      token?: string;
      token_hash?: string;
      type: 'email' | 'recovery' | 'sms' | 'phone_change';
    }) {
      if (args.token_hash && args.type === 'recovery') {
        const payload = decodeToken<RecoveryPayload>(args.token_hash);
        if (!payload?.user) {
          return { data: { session: null, user: null }, error: { message: 'Email link is invalid or has expired' } };
        }
        const confirmed = {
          ...ensureExistingUser(payload.user.email, payload.user),
          confirmedAt: payload.user.confirmedAt ?? new Date().toISOString(),
        };
        upsertUser(confirmed);
        const session = setSessionUser(confirmed);
        broadcast('SIGNED_IN', session);
        return { data: { session, user: session?.user ?? null }, error: null };
      }

      if (args.type === 'email' && args.email && args.token) {
        const otp = consumeOtp(E2E_EMAIL_OTP_KEY, { email: normalizedEmail(args.email) }, args.token);
        if (!otp) {
          return { data: { session: null, user: null }, error: { message: 'Invalid token' } };
        }
        const user = ensureExistingUser(args.email, { confirmedAt: new Date().toISOString() });
        const confirmed = { ...user, confirmedAt: user.confirmedAt ?? new Date().toISOString() };
        upsertUser(confirmed);
        const session = setSessionUser(confirmed);
        broadcast('SIGNED_IN', session);
        return { data: { session, user: session?.user ?? null }, error: null };
      }

      if (args.type === 'recovery' && args.email && args.token) {
        const otp = consumeOtp(E2E_RECOVERY_OTP_KEY, { email: normalizedEmail(args.email) }, args.token);
        if (!otp) {
          return { data: { session: null, user: null }, error: { message: 'Invalid token' } };
        }
        const user = ensureExistingUser(args.email, { confirmedAt: new Date().toISOString() });
        const session = setSessionUser(user);
        broadcast('SIGNED_IN', session);
        return { data: { session, user: session?.user ?? null }, error: null };
      }

      if (args.type === 'sms' && args.phone && args.token) {
        const otp = consumeOtp(E2E_PHONE_OTP_KEY, { phone: args.phone }, args.token);
        if (!otp) {
          return { data: { session: null, user: null }, error: { message: 'Invalid token' } };
        }
        const user = ensureExistingUser(`phone-${args.phone}@domner.test`, {
          phone: args.phone,
          confirmedAt: new Date().toISOString(),
        });
        const session = setSessionUser(user);
        broadcast('SIGNED_IN', session);
        return { data: { session, user: session?.user ?? null }, error: null };
      }

      if (args.type === 'phone_change' && args.phone && args.token) {
        const otp = consumeOtp(E2E_PHONE_OTP_KEY, { phone: args.phone }, args.token);
        if (!otp) {
          return { data: { session: null, user: null }, error: { message: 'Invalid token' } };
        }
        const current = readSessionUser();
        if (!current) {
          return { data: { session: null, user: null }, error: { message: 'Session missing' } };
        }
        const updated = { ...current, phone: args.phone };
        upsertUser(updated);
        const session = setSessionUser(updated);
        broadcast('USER_UPDATED', session);
        return { data: { session, user: session?.user ?? null }, error: null };
      }

      return { data: { session: null, user: null }, error: { message: 'Unsupported provider' } };
    },

    async resetPasswordForEmail(email: string, { redirectTo }: { redirectTo?: string } = {}) {
      const user = findUserByEmail(email);
      if (user) {
        setOtp(E2E_RECOVERY_OTP_KEY, { email: user.email, code: '123456' });
        const destination = redirectTo ?? `${window.location.origin}/reset-password`;
        window.localStorage.setItem(E2E_LAST_RESET_LINK_KEY, recoveryLink(destination, { user }));
      }
      return { data: {}, error: null };
    },

    async updateUser(attributes: { password?: string; phone?: string }) {
      const current = readSessionUser();
      if (!current) return { data: { user: null }, error: { message: 'Session missing' } };
      const updated = {
        ...current,
        password: attributes.password ?? current.password,
        phone: attributes.phone ?? current.phone,
      };
      upsertUser(updated);
      const session = setSessionUser(updated);
      broadcast('USER_UPDATED', session);
      return { data: { user: session?.user ?? null }, error: null };
    },

    async getSession() {
      const user = readSessionUser();
      return { data: { session: sessionFromUser(user) }, error: null };
    },

    async getUser() {
      const user = readSessionUser();
      return { data: { user: user ? toSupabaseUser(user) : null }, error: null };
    },

    onAuthStateChange(listener: AuthListener) {
      installStorageBridge();
      listeners.add(listener);
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(listener);
            },
          },
        },
      };
    },

    async signOut() {
      setSessionUser(null);
      broadcast('SIGNED_OUT', null);
      return { error: null };
    },
  };

  const client = {
    auth,
    from(table: string) {
      if (table !== 'profiles') {
        return {
          update: () => ({
            eq: async () => ({ data: null, error: null }),
          }),
        };
      }

      return {
        update(values: Partial<StoredProfile>) {
          return {
            async eq(column: string, value: string) {
              if (column !== 'id') return { data: null, error: null };
              const current = readSessionUser();
              if (!current || current.id !== value) return { data: null, error: null };
              const updated = {
                ...current,
                phone: values.phone ?? current.phone,
              };
              upsertUser(updated);
              setSessionUser(updated);
              return { data: null, error: null };
            },
          };
        },
      };
    },
  };

  return client as unknown as SupabaseClient;
}

function emptyRowsQuery<T>(rows: T[]) {
  const result = { data: rows, error: null };
  const query = {
    eq() {
      return query;
    },
    or() {
      return query;
    },
    order() {
      return query;
    },
    limit() {
      return query;
    },
    is() {
      return query;
    },
    then<TResult1 = typeof result, TResult2 = never>(
      onfulfilled?:
        | ((value: typeof result) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };
  return query;
}

function emptyMutationQuery() {
  const result = { data: null, error: null };
  const query = {
    eq() {
      return query;
    },
    is() {
      return query;
    },
    then<TResult1 = typeof result, TResult2 = never>(
      onfulfilled?:
        | ((value: typeof result) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };
  return query;
}

type E2EGlobal = typeof globalThis & {
  __domnerE2EProfiles?: Map<string, StoredProfile>;
};

function profileStore(): Map<string, StoredProfile> {
  const globalScope = globalThis as E2EGlobal;
  if (!globalScope.__domnerE2EProfiles) {
    globalScope.__domnerE2EProfiles = new Map();
  }
  return globalScope.__domnerE2EProfiles;
}

export function e2eSupabaseFromRequest(request: Request): SupabaseClient {
  const user = readE2EUserFromRequest(request);

  const client = {
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
    },
    from(table: string) {
      if (table === 'notifications') {
        return {
          select() {
            return emptyRowsQuery([]);
          },
          update() {
            return emptyMutationQuery();
          },
        };
      }

      if (table !== 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }

      return {
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  if (column !== 'id' || !user || user.id !== value) {
                    return { data: null, error: null };
                  }
                  return { data: profileStore().get(value) ?? null, error: null };
                },
              };
            },
          };
        },
        upsert(values: StoredProfile) {
          const stored = {
            id: values.id,
            full_name: values.full_name ?? null,
            phone: values.phone ?? null,
            passport_country: values.passport_country,
            preferred_language: values.preferred_language === 'en' ? ('en' as Lang) : ('km' as Lang),
            telegram_username: values.telegram_username ?? null,
          };
          profileStore().set(stored.id, stored);
          return {
            select() {
              return {
                async single() {
                  return { data: stored, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return client as unknown as SupabaseClient;
}

export function readE2EUserFromRequest(request: Request): User | null {
  if (!e2eAuthEnabled()) return null;
  const raw = cookieValue(E2E_AUTH_COOKIE, request.headers.get('cookie'));
  if (!raw) return null;
  const session = decodeToken<SessionCookie>(raw);
  return session?.user ? toSupabaseUser(session.user) : null;
}

export function readE2ECallbackUser(code: string): User | null {
  const payload = decodeToken<CallbackPayload>(code);
  if (!payload?.user) return null;
  const user = {
    ...payload.user,
    confirmedAt: payload.user.confirmedAt ?? new Date().toISOString(),
  };
  return toSupabaseUser(user);
}

export function e2eCallbackCookieValue(code: string): string | null {
  const payload = decodeToken<CallbackPayload>(code);
  if (!payload?.user) return null;
  const user = {
    ...payload.user,
    confirmedAt: payload.user.confirmedAt ?? new Date().toISOString(),
  };
  return encodeToken({ user });
}

export function createE2EBrowserSupabase(): SupabaseClient | null {
  if (!clientEnabled() || !hasWindow()) return null;
  if (!cachedBrowserClient) {
    cachedBrowserClient = makeBrowserClient();
  }
  return cachedBrowserClient;
}
