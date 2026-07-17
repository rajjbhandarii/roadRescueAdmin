import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from './environments/environment';

interface AdminUser {
  _id: string;
  userName: string;
  email: string;
  status?: string;
}

interface AdminProvider {
  _id: string;
  serviceProviderName: string;
  email: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.baseUrl;
  private readonly adminTokenStorageKey = 'roadRescueAdminToken';

  users: AdminUser[] = [];
  providers: AdminProvider[] = [];

  isLoading = false;
  isAuthenticating = false;
  isAdminAuthenticated = false;
  errorMessage = '';
  successMessage = '';

  adminLogin = { email: '', password: '' };
  newUser = { userName: '', email: '', password: '' };
  newProvider = { serviceProviderName: '', email: '', password: '' };

  editingUserId: string | null = null;
  editUserDraft = { userName: '', email: '' };

  editingProviderId: string | null = null;
  editProviderDraft = { serviceProviderName: '', email: '' };

  // ── Init ──────────────────────────────────────────────────────────────

  /**
   * Verify the stored token is still valid before showing the dashboard.
   * Uses a single load call that also fetches dashboard data in one pass.
   */
  async ngOnInit(): Promise<void> {
    const token = localStorage.getItem(this.adminTokenStorageKey);
    if (!token) return;

    try {
      // Piggy-back on loadDashboardData which already makes the auth'd calls.
      // If the token is expired, handleUnauthorized will clear it.
      this.isAdminAuthenticated = true;
      await this.loadDashboardData();
    } catch {
      this.isAdminAuthenticated = false;
    }
  }

  async loginAdmin(): Promise<void> {
    this.isAuthenticating = true;
    this.clearMessages();
    try {
      const response = await firstValueFrom(
        this.http.post<{ token: string }>(`${this.apiBase}/admin/login`, this.adminLogin),
      );
      localStorage.setItem(this.adminTokenStorageKey, response.token);
      this.isAdminAuthenticated = true;
      this.adminLogin = { email: '', password: '' };
      await this.loadDashboardData();
      this.successMessage = 'Admin logged in successfully.';
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error, 'Failed to login as admin');
    } finally {
      this.isAuthenticating = false;
    }
  }

  logoutAdmin(showMessage = true): void {
    localStorage.removeItem(this.adminTokenStorageKey);
    this.isAdminAuthenticated = false;
    this.users = [];
    this.providers = [];
    this.cancelUserEdit();
    this.cancelProviderEdit();
    if (showMessage) this.successMessage = 'Logged out successfully.';
  }

  /** Full re-fetch — only called on login/refresh, not after every mutation. */
  async loadDashboardData(): Promise<void> {
    if (!this.isAdminAuthenticated) return;

    this.isLoading = true;
    this.clearMessages();
    try {
      const [users, providers] = await Promise.all([
        firstValueFrom(
          this.http.get<AdminUser[]>(`${this.apiBase}/admin/users`, this.getAuthOptions()),
        ),
        firstValueFrom(
          this.http.get<AdminProvider[]>(`${this.apiBase}/admin/providers`, this.getAuthOptions()),
        ),
      ]);
      this.users = users;
      this.providers = providers;
    } catch (error) {
      if (this.handleUnauthorized(error)) return;
      this.errorMessage = this.getErrorMessage(error, 'Failed to load dashboard data');
    } finally {
      this.isLoading = false;
    }
  }

  // ── Users ─────────────────────────────────────────────────────────────

  async addUser(): Promise<void> {
    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/admin/users`, this.newUser, this.getAuthOptions()),
      );
      // Re-fetch only users so we get the server-assigned _id
      const users = await firstValueFrom(
        this.http.get<AdminUser[]>(`${this.apiBase}/admin/users`, this.getAuthOptions()),
      );
      this.users = users;
      this.successMessage = 'User added successfully.';
      this.newUser = { userName: '', email: '', password: '' };
    } catch (error) {
      if (this.handleUnauthorized(error)) return;
      this.errorMessage = this.getErrorMessage(error, 'Failed to add user');
    } finally {
      this.isLoading = false;
    }
  }

  async deleteUser(userName: string): Promise<void> {
    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(
        this.http.delete(
          `${this.apiBase}/admin/users/${encodeURIComponent(userName)}`,
          this.getAuthOptions(),
        ),
      );
      // Optimistic local update — no re-fetch needed
      this.users = this.users.filter(u => u.userName !== userName);
      this.successMessage = `User "${userName}" deleted successfully.`;
    } catch (error) {
      if (this.handleUnauthorized(error)) return;
      this.errorMessage = this.getErrorMessage(error, 'Failed to delete user');
    } finally {
      this.isLoading = false;
    }
  }

  startUserEdit(user: AdminUser): void {
    this.clearMessages();
    this.editingUserId = user._id;
    this.editUserDraft = { userName: user.userName, email: user.email };
  }

  cancelUserEdit(): void {
    this.editingUserId = null;
    this.editUserDraft = { userName: '', email: '' };
  }

  async saveUserEdit(userId: string): Promise<void> {
    const userName = this.editUserDraft.userName.trim();
    const email = this.editUserDraft.email.trim();

    if (!userName || !email) {
      this.errorMessage = 'User name and email are required.';
      return;
    }

    this.isLoading = true;
    this.clearMessages();
    try {
      console.log("Editing ID:", userId);
      console.log("Draft:", this.editUserDraft);
      console.log("API URL:", `${this.apiBase}/admin/users/${userId}`);
      console.log("email:", email);
      await firstValueFrom(
        this.http.patch(
          `${this.apiBase}/admin/users/${userId}`,
          { userName, email },
          this.getAuthOptions(),
        ),
      );
      // Optimistic local update — no re-fetch needed
      this.users = this.users.map(u =>
        u._id === userId ? { ...u, userName, email } : u,
      );
      this.successMessage = `Updated "${userName}" successfully.`;
      this.cancelUserEdit();
    } catch (error) {
      if (this.handleUnauthorized(error)) return;
      this.errorMessage = this.getErrorMessage(error, 'Failed to update user');
    } finally {
      this.isLoading = false;
    }
  }

  // ── Providers ─────────────────────────────────────────────────────────

  async addProvider(): Promise<void> {
    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/admin/providers`, this.newProvider, this.getAuthOptions()),
      );
      // Re-fetch only providers so we get the server-assigned _id
      const providers = await firstValueFrom(
        this.http.get<AdminProvider[]>(`${this.apiBase}/admin/providers`, this.getAuthOptions()),
      );
      this.providers = providers;
      this.successMessage = 'Provider added successfully.';
      this.newProvider = { serviceProviderName: '', email: '', password: '' };
    } catch (error) {
      if (this.handleUnauthorized(error)) return;
      this.errorMessage = this.getErrorMessage(error, 'Failed to add provider');
    } finally {
      this.isLoading = false;
    }
  }

  async deleteProvider(serviceProviderName: string): Promise<void> {
    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(
        this.http.delete(
          `${this.apiBase}/admin/providers/${encodeURIComponent(serviceProviderName)}`,
          this.getAuthOptions(),
        ),
      );
      // Optimistic local update — no re-fetch needed
      this.providers = this.providers.filter(
        p => p.serviceProviderName !== serviceProviderName,
      );
      this.successMessage = `Provider "${serviceProviderName}" deleted successfully.`;
    } catch (error) {
      if (this.handleUnauthorized(error)) return;
      this.errorMessage = this.getErrorMessage(error, 'Failed to delete provider');
    } finally {
      this.isLoading = false;
    }
  }

  startProviderEdit(provider: AdminProvider): void {
    this.clearMessages();
    this.editingProviderId = provider._id;
    this.editProviderDraft = {
      serviceProviderName: provider.serviceProviderName,
      email: provider.email,
    };
  }

  cancelProviderEdit(): void {
    this.editingProviderId = null;
    this.editProviderDraft = { serviceProviderName: '', email: '' };
  }

  async saveProviderEdit(providerId: string): Promise<void> {
    const serviceProviderName = this.editProviderDraft.serviceProviderName.trim();
    const email = this.editProviderDraft.email.trim();

    if (!serviceProviderName || !email) {
      this.errorMessage = 'Provider name and email are required.';
      return;
    }

    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(
        this.http.patch(
          `${this.apiBase}/admin/providers/${encodeURIComponent(providerId)}`,
          { serviceProviderName, email },
          this.getAuthOptions(),
        ),
      );
      // Optimistic local update — no re-fetch needed
      this.providers = this.providers.map(p =>
        p._id === providerId ? { ...p, serviceProviderName, email } : p,
      );
      this.successMessage = `Updated "${serviceProviderName}" successfully.`;
      this.cancelProviderEdit();
    } catch (error) {
      if (this.handleUnauthorized(error)) return;
      this.errorMessage = this.getErrorMessage(error, 'Failed to update provider');
    } finally {
      this.isLoading = false;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private getAuthOptions(): { headers: HttpHeaders } {
    const token = localStorage.getItem(this.adminTokenStorageKey);
    return {
      headers: new HttpHeaders({
        Authorization: token ? `Bearer ${token}` : '',
      }),
    };
  }

  private handleUnauthorized(error: unknown): boolean {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      (error.status === 401 || error.status === 403)
    ) {
      this.logoutAdmin(false);
      this.errorMessage = 'Session expired or unauthorized. Please login again.';
      this.successMessage = '';
      return true;
    }
    return false;
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const typedError = error as { error?: { message?: string } };
      if (typedError.error?.message) return typedError.error.message;
    }
    return fallback;
  }
}
