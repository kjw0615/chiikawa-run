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
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  user?: AuthUser;
}

const SUPABASE_URL = 'https://vpbsmhbulqjbsjruxyfc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B9jrnSWDIGKKoa3htoy7yA_2Elcdnbh';

const STORAGE_KEY = 'chiikawa_run_auth_v1';

export class SupabaseAuthService {
  private user: AuthUser | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private listeners: Array<(user: AuthUser | null) => void> = [];

  constructor() {
    this.loadSession();
  }

  public subscribe(fn: (user: AuthUser | null) => void): () => void {
    this.listeners.push(fn);
    fn(this.user);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach(fn => fn(this.user));
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
        this.user = parsed.user || null;
        this.accessToken = parsed.accessToken || null;
        this.refreshToken = parsed.refreshToken || null;
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
          refreshToken: this.refreshToken
        }));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
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
          data: { nickname }
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
          equippedSkin: 'default'
        };
        this.saveSession();
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

      // Fetch or restore local coins/skins for this account
      const userStoreKey = `user_state_${data.user.id}`;
      let localState = { coins: 0, ownedSkins: ['default'], equippedSkin: 'default' };
      try {
        const s = localStorage.getItem(userStoreKey);
        if (s) localState = JSON.parse(s);
      } catch {}

      this.user = {
        id: data.user.id,
        email: data.user.email,
        nickname,
        coins: localState.coins,
        ownedSkins: localState.ownedSkins,
        equippedSkin: localState.equippedSkin
      };

      this.saveSession();
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

  private persistUserState() {
    if (!this.user) return;
    const userStoreKey = `user_state_${this.user.id}`;
    localStorage.setItem(userStoreKey, JSON.stringify({
      coins: this.user.coins,
      ownedSkins: this.user.ownedSkins,
      equippedSkin: this.user.equippedSkin
    }));
  }
}

export const authService = new SupabaseAuthService();
