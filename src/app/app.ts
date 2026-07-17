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
  status?: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.baseUrl;
  private readonly adminTokenStorageKey = 'roadRescueAdminToken';

  readonly statusOptions = ['pending', 'approved', 'rejected'];

  users: AdminUser[] = [];
  providers: AdminProvider[] = [];

  isLoading = false;
  isAuthenticating = false;
  isAdminAuthenticated = false;
  errorMessage = '';
  successMessage = '';
  adminLogin = {
    email: '',
    password: ''
  };

  newUser = {
    userName: '',
    email: '',
    password: ''
  };

  newProvider = {
    serviceProviderName: '',
    email: '',
    password: '',
    status: 'pending'
  };

  editingUserId: string | null = null;
  editUserDraft = {
    userName: '',
    email: ''
  };

  /**
   * On init: verify the stored token is still valid by hitting a protected
   * endpoint. If it's expired or missing we stay on the login screen instead
   * of showing a blank, broken dashboard.
   */
  async ngOnInit(): Promise<void> {
    const token = localStorage.getItem(this.adminTokenStorageKey);
    if (!token) {
      this.isAdminAuthenticated = false;
      return;
    }

    // Verify token by fetching admins — if the server returns 401/403 the
    // handleUnauthorized helper will clear the stale token automatically.
    try {
      await firstValueFrom(
        this.http.get<AdminUser[]>(`${this.apiBase}/admin/admins`, this.getAuthOptions())
      );
      this.isAdminAuthenticated = true;
      await this.loadDashboardData();
    } catch (error) {
      // Token is expired or invalid — force re-login
      this.handleUnauthorized(error);
      if (!this.isAdminAuthenticated) {
        this.errorMessage = 'Session expired. Please log in again.';
      }
    }
  }

  async loginAdmin(): Promise<void> {
    this.isAuthenticating = true;
    this.clearMessages();
    try {
      const response = await firstValueFrom(
        this.http.post<{ token: string }>(`${this.apiBase}/admin/login`, this.adminLogin)
      );
      localStorage.setItem(this.adminTokenStorageKey, response.token);
      this.isAdminAuthenticated = true;
      this.adminLogin = {
        email: '',
        password: ''
      };
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
    if (showMessage) {
      this.successMessage = 'Logged out successfully.';
    }
  }

  async loadDashboardData(): Promise<void> {
    if (!this.isAdminAuthenticated) {
      return;
    }

    this.isLoading = true;
    this.clearMessages();
    try {
      const [users, providers] = await Promise.all([
        firstValueFrom(this.http.get<AdminUser[]>(`${this.apiBase}/admin/users`, this.getAuthOptions())),
        firstValueFrom(
          this.http.get<AdminProvider[]>(`${this.apiBase}/admin/providers`, this.getAuthOptions())
        )
      ]);
      this.users = users;
      this.providers = providers;
    } catch (error) {
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage = this.getErrorMessage(error, 'Failed to load dashboard data');
    } finally {
      this.isLoading = false;
    }
  }

  async addUser(): Promise<void> {
    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(this.http.post(`${this.apiBase}/admin/users`, this.newUser, this.getAuthOptions()));
      this.successMessage = 'User added successfully.';
      this.newUser = {
        userName: '',
        email: '',
        password: ''
      };
      await this.loadDashboardData();
    } catch (error) {
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage = this.getErrorMessage(error, 'Failed to add user');
    } finally {
      this.isLoading = false;
    }
  }

  async addProvider(): Promise<void> {
    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/admin/providers`, this.newProvider, this.getAuthOptions())
      );
      this.successMessage = 'Provider added successfully.';
      this.newProvider = {
        serviceProviderName: '',
        email: '',
        password: '',
        status: 'pending'
      };
      await this.loadDashboardData();
    } catch (error) {
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage = this.getErrorMessage(error, 'Failed to add provider');
    } finally {
      this.isLoading = false;
    }
  }

  async deleteUser(userName: string): Promise<void> {
    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(
        this.http.delete(`${this.apiBase}/admin/users/${encodeURIComponent(userName)}`, this.getAuthOptions())
      );
      this.successMessage = `User "${userName}" deleted successfully.`;
      await this.loadDashboardData();
    } catch (error) {
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage = this.getErrorMessage(error, 'Failed to delete user');
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
          this.getAuthOptions()
        )
      );
      this.successMessage = `Provider "${serviceProviderName}" deleted successfully.`;
      await this.loadDashboardData();
    } catch (error) {
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage = this.getErrorMessage(error, 'Failed to delete provider');
    } finally {
      this.isLoading = false;
    }
  }

  startUserEdit(user: AdminUser): void {
    this.clearMessages();
    this.editingUserId = user._id;
    this.editUserDraft = {
      userName: user.userName,
      email: user.email
    };
  }

  cancelUserEdit(): void {
    this.editingUserId = null;
    this.editUserDraft = {
      userName: '',
      email: ''
    };
  }

  async saveUserEdit(userId: string): Promise<void> {
    const userName = this.editUserDraft.userName.trim();
    const email = this.editUserDraft.email.trim();

    if (!userName || !email) {
      this.errorMessage = 'User name and email are required.';
      this.successMessage = '';
      return;
    }

    this.isLoading = true;
    this.clearMessages();
    try {
      await firstValueFrom(
        this.http.patch(
          `${this.apiBase}/admin/users/${encodeURIComponent(userId)}`,
          {
            userName,
            email
          },
          this.getAuthOptions()
        )
      );
      this.successMessage = `Updated "${userName}" successfully.`;
      this.cancelUserEdit();
      await this.loadDashboardData();
    } catch (error) {
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage = this.getErrorMessage(error, 'Failed to update user');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Update a provider's status.
   * Bug fix: guard against the initial ngModelChange fired during render
   * by comparing the new value against the current persisted status.
   */
  async updateProviderStatus(provider: AdminProvider, status: string): Promise<void> {
    // Skip if the status hasn't actually changed (avoids spurious API calls on render)
    if (provider.status === status) return;

    this.clearMessages();
    // Optimistically update local state so the select reflects the change immediately
    provider.status = status;

    try {
      await firstValueFrom(
        this.http.patch(
          `${this.apiBase}/admin/providers/status`,
          { serviceProviderName: provider.serviceProviderName, status },
          this.getAuthOptions()
        )
      );
      this.successMessage = `Updated ${provider.serviceProviderName} to "${status}".`;
    } catch (error) {
      if (this.handleUnauthorized(error)) {
        return;
      }
      this.errorMessage = this.getErrorMessage(error, 'Failed to update provider status');
      // Reload to restore the actual server state on failure
      await this.loadDashboardData();
    }
  }

  private getAuthOptions(): { headers: HttpHeaders } {
    const token = localStorage.getItem(this.adminTokenStorageKey);
    return {
      headers: new HttpHeaders({
        Authorization: token ? `Bearer ${token}` : ''
      })
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
      if (typedError.error?.message) {
        return typedError.error.message;
      }
    }
    return fallback;
  }
}
