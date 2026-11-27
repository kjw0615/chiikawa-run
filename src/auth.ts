/**
 * Client for Supabase Auth and User Data (Stateless REST/GoTrue calls)
 * Reference: chiikawa-watermelon SupabaseClient architecture
 */

export interface AuthUser {
  id: string;
  email?: string;
  nickname: string;
  coins: number;
  ownedSkins: string[]; // e.g. ['default', 'momonga-hula']
  equippedSkin: string; // e.g. 'default' | 'momonga-hula'
  highScore: number;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  user?: AuthUser;
}

const SUPABASE_URL = 'https://vpbsmhbulqjbsjruxyfc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B9jrnSWDIGKKoa3htoy7yA_2Elcdnbh';

const STORAGE_KEY = 'chiikawa_run_auth_v1';
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30분 비활성 시 자동 로그아웃
const ACTIVITY_THROTTLE_MS = 5 * 1000; // 타임스탬프 저장 5초 쓰로틀

export class SupabaseAuthService {
  private user: AuthUser | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private listeners: Array<(user: AuthUser | null) => void> = [];

  private lastActivityTime: number = Date.now();
  private inactivityTimer: any = null;
  private activityListenerAttached: boolean = false;
  private onActivityBound: (() => void) | null = null;

  constructor() {
    this.loadSession();
  }

  public subscribe(fn: (user: AuthUser | null) => void): () => void {
    this.listeners.push(fn);
    try {
      fn(this.user);
    } catch (e) {
      console.warn('authService.subscribe listener error:', e);
    }
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach(fn => {
      try {
        fn(this.user);
      } catch (e) {
        console.warn('authService.notify listener error:', e);
      }
    });
  }

  public getUser(): AuthUser | null {
    return this.user;
  }

  public isAuthenticated(): boolean {
    return !!this.user;
  }

  private loadSession() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const lastActive = Number(parsed.lastActivity) || 0;
        const now = Date.now();

        // 30분 비활성 만료 검사 (브라우저를 닫았다가 30분 뒤에 켠 경우 포함)
        if (lastActive > 0 && (now - lastActive > INACTIVITY_TIMEOUT_MS)) {
          localStorage.removeItem(STORAGE_KEY);
          this.user = null;
          this.accessToken = null;
          this.refreshToken = null;
          return;
        }

        this.user = parsed.user || null;
        this.accessToken = parsed.accessToken || null;
        this.refreshToken = parsed.refreshToken || null;
        this.lastActivityTime = now;

        if (this.user) {
          this.startInactivityTracker();
        }

        // Verify or refresh if needed in background
        if (this.refreshToken) {
          this.refreshSession();
        }
      }
    } catch {
      // LocalStorage error fallback
    }
  }

  private saveSession() {
    try {
      if (this.user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          user: this.user,
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          lastActivity: this.lastActivityTime
        }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Start tracking user activity (mouse, key, touch) for 30m auto-logout
   */
  public startInactivityTracker() {
    this.lastActivityTime = Date.now();
    this.resetInactivityTimer();

    if (typeof window === 'undefined' || this.activityListenerAttached) return;

    this.onActivityBound = () => this.handleUserActivity();
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'pointerdown', 'wheel'];
    events.forEach(ev => window.addEventListener(ev, this.onActivityBound!, { passive: true }));
    this.activityListenerAttached = true;
  }

  public stopInactivityTracker() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (typeof window !== 'undefined' && this.activityListenerAttached && this.onActivityBound) {
      const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'pointerdown', 'wheel'];
      events.forEach(ev => window.removeEventListener(ev, this.onActivityBound!));
      this.activityListenerAttached = false;
      this.onActivityBound = null;
    }
  }

  private handleUserActivity() {
    if (!this.user) return;
    const now = Date.now();
    if (now - this.lastActivityTime > ACTIVITY_THROTTLE_MS) {
      this.lastActivityTime = now;
      this.saveSession();
    }
    this.resetInactivityTimer();
  }

  private resetInactivityTimer() {
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    if (!this.user) return;

    this.inactivityTimer = setTimeout(() => {
      this.handleInactivityTimeout();
    }, INACTIVITY_TIMEOUT_MS);
  }

  private handleInactivityTimeout() {
    if (!this.user) return;
    this.logout();
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        if ((window as unknown as { showCustomAlert?: (msg: string, title?: string) => void }).showCustomAlert) {
          (window as unknown as { showCustomAlert: (msg: string, title?: string) => void }).showCustomAlert(
            '30분 동안 활동이 없어 안전을 위해 자동 로그아웃되었습니다.',
            '자동 로그아웃'
          );
        }
      }, 50);
    }
  }

  /**
   * Check if a nickname is already taken via RPC
   */
  public async checkNicknameAvailable(nickname: string): Promise<boolean> {
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nickname_available`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_nick: nickname })
      });
      if (resp.ok) {
        return (await resp.json()) === true;
      }
    } catch {
      // ignore
    }
    return true;
  }

  /**
   * Sign up with Nickname, Email, Password
   */
  public async signUp(nickname: string, email: string, password: string): Promise<AuthResult> {
    try {
      const isAvailable = await this.checkNicknameAvailable(nickname);
      if (!isAvailable) {
        return { ok: false, error: '이미 사용 중인 닉네임입니다.' };
      }

      const resp = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          data: {
            nickname,
            coins: 0,
            owned_skins: ['default'],
            equipped_skin: 'default',
            high_score: 0
          }
        })
      });

      const data = await resp.json();
      if (!resp.ok) {
        let msg = data.error_description || data.msg || '회원가입에 실패했습니다.';
        if (msg.includes('already registered')) msg = '이미 등록된 이메일입니다.';
        return { ok: false, error: msg };
      }

      // If session returned immediately (autoconfirm)
      if (data.user) {
        this.accessToken = data.access_token || null;
        this.refreshToken = data.refresh_token || null;
        this.user = {
          id: data.user.id,
          email: data.user.email,
          nickname: nickname,
          coins: 0,
          ownedSkins: ['default'],
          equippedSkin: 'default',
          highScore: 0
        };
        this.saveSession();
        this.persistUserState();
        this.startInactivityTracker();
        this.notify();
        return { ok: true, user: this.user };
      }

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || '네트워크 오류가 발생했습니다.' };
    }
  }

  /**
   * Log in by Nickname + Password or Email + Password
   */
  public async login(nickOrEmail: string, password: string): Promise<AuthResult> {
    try {
      let targetEmail = nickOrEmail;

      // If input is nickname (no @), resolve email via RPC login_email
      if (!nickOrEmail.includes('@')) {
        const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/login_email`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ p_nick: nickOrEmail, p_password: password })
        });

        if (rpcResp.ok) {
          const resolved = await rpcResp.json();
          if (resolved) {
            targetEmail = resolved;
          } else {
            return { ok: false, error: '아이디(닉네임) 또는 비밀번호가 일치하지 않습니다.' };
          }
        }
      }

      const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: targetEmail,
          password
        })
      });

      const data = await resp.json();
      if (!resp.ok) {
        return { ok: false, error: '아이디 또는 비밀번호가 일치하지 않습니다.' };
      }

      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;

      // Fetch profile nickname
      let nickname = data.user.user_metadata?.nickname || nickOrEmail;
      try {
        const profResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}&select=nickname`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${this.accessToken}`
          }
        });
        if (profResp.ok) {
          const rows = await profResp.json();
          if (rows && rows[0]?.nickname) nickname = rows[0].nickname;
        }
      } catch {
        // fallback to metadata
      }

      // Fetch or restore coins/skins from user_inventory table, user_metadata, and local storage
      const meta = data.user.user_metadata || {};
      const userStoreKey = `user_state_${data.user.id}`;
      let localState = { coins: 0, ownedSkins: ['default'], equippedSkin: 'default' };
      try {
        const s = localStorage.getItem(userStoreKey);
        if (s) localState = JSON.parse(s);
      } catch {}

      // Try reading directly from public.user_inventory table
      let dbInv: { coins?: number; owned_skins?: string[]; equipped_skin?: string; high_score?: number } | null = null;
      try {
        const invResp = await fetch(`${SUPABASE_URL}/rest/v1/user_inventory?user_id=eq.${data.user.id}&select=*`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${this.accessToken}`
          }
        });
        if (invResp.ok) {
          const rows = await invResp.json();
          if (rows && rows.length > 0) dbInv = rows[0];
        }
      } catch {}

      // Merge priorities: user_inventory DB table > user_metadata > local storage
      const serverCoins = typeof dbInv?.coins === 'number'
        ? dbInv.coins
        : (typeof meta.coins === 'number' ? meta.coins : 0);
      const mergedCoins = Math.max(serverCoins, localState.coins);

      const serverSkins: string[] = Array.isArray(dbInv?.owned_skins)
        ? dbInv.owned_skins
        : (Array.isArray(meta.owned_skins) ? meta.owned_skins : []);
      const mergedSkins = Array.from(new Set(['default', ...serverSkins, ...localState.ownedSkins]));

      const equippedSkin = dbInv?.equipped_skin || meta.equipped_skin || localState.equippedSkin || 'default';

      let localHighScore = 0;
      try {
        localHighScore = Number(localStorage.getItem('little-escape-best') || 0);
      } catch {}
      const serverHighScore = typeof dbInv?.high_score === 'number'
        ? dbInv.high_score
        : (typeof meta.high_score === 'number' ? meta.high_score : 0);
      const mergedHighScore = Math.max(serverHighScore, localHighScore, (localState as any).highScore || 0);

      this.user = {
        id: data.user.id,
        email: data.user.email,
        nickname,
        coins: mergedCoins,
        ownedSkins: mergedSkins,
        equippedSkin,
        highScore: mergedHighScore
      };

      this.saveSession();
      this.persistUserState();
      this.startInactivityTracker();
      this.notify();
      return { ok: true, user: this.user };
    } catch (e: any) {
      return { ok: false, error: e.message || '네트워크 오류가 발생했습니다.' };
    }
  }

  public async refreshSession(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: this.refreshToken })
      });
      if (resp.ok) {
        const data = await resp.json();
        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;

        // 1. Sync from user_inventory table if available
        if (this.user) {
          try {
            const invResp = await fetch(`${SUPABASE_URL}/rest/v1/user_inventory?user_id=eq.${this.user.id}&select=*`, {
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${this.accessToken}`
              }
            });
            if (invResp.ok) {
              const rows = await invResp.json();
              if (rows && rows.length > 0) {
                const inv = rows[0];
                if (typeof inv.coins === 'number') this.user.coins = Math.max(this.user.coins, inv.coins);
                if (typeof inv.high_score === 'number') this.user.highScore = Math.max(this.user.highScore || 0, inv.high_score);
                if (Array.isArray(inv.owned_skins)) {
                  this.user.ownedSkins = Array.from(new Set(['default', ...this.user.ownedSkins, ...inv.owned_skins]));
                }
                if (inv.equipped_skin) this.user.equippedSkin = inv.equipped_skin;
                this.persistUserState(false);
                this.notify();
              }
            }
          } catch {}
        }

        // 2. Fallback to user_metadata if available
        if (data.user?.user_metadata && this.user) {
          const meta = data.user.user_metadata;
          if (typeof meta.coins === 'number') {
            this.user.coins = Math.max(this.user.coins, meta.coins);
          }
          if (typeof meta.high_score === 'number') {
            this.user.highScore = Math.max(this.user.highScore || 0, meta.high_score);
          }
          if (Array.isArray(meta.owned_skins)) {
            this.user.ownedSkins = Array.from(new Set(['default', ...this.user.ownedSkins, ...meta.owned_skins]));
          }
          if (meta.equipped_skin) {
            this.user.equippedSkin = meta.equipped_skin;
          }
          this.persistUserState(false);
          this.notify();
        }

        this.saveSession();
        return true;
      }
    } catch {}
    return false;
  }

  public logout() {
    this.user = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.stopInactivityTracker();
    this.saveSession();
    this.notify();
  }

  /**
   * Update user coins (e.g. after a run ends)
   */
  public addCoins(amount: number) {
    if (!this.user || amount <= 0) return;
    this.user.coins += amount;
    this.persistUserState();
    this.saveSession();
    this.notify();
  }

  /**
   * Spend user coins
   */
  public spendCoins(amount: number): boolean {
    if (!this.user || this.user.coins < amount) return false;
    this.user.coins -= amount;
    this.persistUserState();
    this.saveSession();
    this.notify();
    return true;
  }

  /**
   * Unlock a skin in shop
   */
  public unlockSkin(skinId: string): boolean {
    if (!this.user) return false;
    if (!this.user.ownedSkins.includes(skinId)) {
      this.user.ownedSkins.push(skinId);
      this.persistUserState();
      this.saveSession();
      this.notify();
    }
    return true;
  }

  /**
   * Equip skin
   */
  public equipSkin(skinId: string): boolean {
    if (!this.user || !this.user.ownedSkins.includes(skinId)) return false;
    this.user.equippedSkin = skinId;
    this.persistUserState();
    this.saveSession();
    this.notify();
    return true;
  }

  public unequipSkin(): boolean {
    if (!this.user) return false;
    this.user.equippedSkin = 'default';
    this.persistUserState();
    this.saveSession();
    this.notify();
    return true;
  }

  /**
   * Update high score if greater than current best
   */
  public updateHighScore(score: number): boolean {
    if (!this.user) return false;
    const rounded = Math.floor(score);
    if (rounded > (this.user.highScore || 0)) {
      this.user.highScore = rounded;
      this.persistUserState();
      this.saveSession();
      this.notify();
      return true;
    }
    return false;
  }

  private syncTimer: any = null;

  /**
   * Save user state locally and sync to Supabase Cloud user_metadata
   */
  private persistUserState(syncCloud: boolean = true) {
    if (!this.user) return;
    const userStoreKey = `user_state_${this.user.id}`;
    localStorage.setItem(userStoreKey, JSON.stringify({
      coins: this.user.coins,
      ownedSkins: this.user.ownedSkins,
      equippedSkin: this.user.equippedSkin,
      highScore: this.user.highScore
    }));

    if (syncCloud && this.accessToken) {
      if (this.syncTimer) clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(async () => {
        try {
          if (!this.user || !this.accessToken) return;

          // 1. Sync directly to public.user_inventory table (visible in Supabase Table Editor)
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/user_inventory`, {
              method: 'POST',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
              },
              body: JSON.stringify({
                user_id: this.user.id,
                nickname: this.user.nickname,
                coins: this.user.coins,
                owned_skins: this.user.ownedSkins,
                equipped_skin: this.user.equippedSkin,
                high_score: this.user.highScore || 0,
                updated_at: new Date().toISOString()
              })
            });
          } catch {}

          // 2. Dual backup to auth.users user_metadata
          try {
            await fetch(`${SUPABASE_URL}/auth/v1/user`, {
              method: 'PUT',
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                data: {
                  coins: this.user.coins,
                  owned_skins: this.user.ownedSkins,
                  equipped_skin: this.user.equippedSkin,
                  high_score: this.user.highScore || 0
                }
              })
            });
          } catch {}
        } catch {
          // Network failure fallback; local state preserved
        }
      }, 300);
    }
  }
}

export const authService = new SupabaseAuthService();
