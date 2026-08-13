import { useState } from 'react';
import { Plus, AlertCircle, Copy, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button, Alert } from '@medicore/ui';
import { useUsers } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { usePermissions } from '@/hooks/use-permissions';
import { UsersTable } from './components/users-table';
import { TenantRole } from '@medicore/shared-types';

function UsersPage() {
  const { users, isLoading, error, create, update } = useUsers();
  const { roles } = useRoles();
  const { isAdmin } = usePermissions();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [tenantRole, setTenantRole] = useState<TenantRole>(TenantRole.TENANT_USER);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setEmail('');
    setFullName('');
    setTenantRole(TenantRole.TENANT_USER);
    setSelectedRoleId(null);
    setCreateError(null);
    setShowCreateModal(true);
  };

  const handleCloseCreate = () => {
    setShowCreateModal(false);
    setEmail('');
    setFullName('');
    setTenantRole(TenantRole.TENANT_USER);
    setSelectedRoleId(null);
    setCreateError(null);
  };

  const handleOpenEdit = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (user) {
      setEditingUserId(userId);
      setEmail(user.email);
      setFullName(user.fullName);
      setTenantRole(user.tenantRole);
      setSelectedRoleId(user.roleId || null);
      setCreateError(null);
      setShowEditModal(true);
    }
  };

  const handleCloseEdit = () => {
    setShowEditModal(false);
    setEditingUserId(null);
    setEmail('');
    setFullName('');
    setTenantRole(TenantRole.TENANT_USER);
    setSelectedRoleId(null);
    setCreateError(null);
  };

  const handleUpdateUser = async () => {
    if (!fullName.trim()) {
      setCreateError('Full name is required');
      return;
    }

    setIsUpdating(true);
    setCreateError(null);

    try {
      const payload: any = {
        fullName: fullName.trim(),
        tenantRole,
      };

      if (selectedRoleId && selectedRoleId.trim()) {
        payload.roleId = selectedRoleId;
      }

      console.log('Updating user with payload:', payload);

      if (editingUserId) {
        await update(editingUserId, payload);
        handleCloseEdit();
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateUser = async () => {
    if (!email.trim()) {
      setCreateError('Email is required');
      return;
    }

    if (!fullName.trim()) {
      setCreateError('Full name is required');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const payload: any = {
        email: email.trim(),
        fullName: fullName.trim(),
        tenantRole,
      };

      if (selectedRoleId && selectedRoleId.trim()) {
        payload.roleId = selectedRoleId;
      }

      console.log('Creating user with payload:', payload);

      const result = await create(payload);

      if (result && 'temporaryPassword' in result) {
        setTempPassword(result.temporaryPassword);
        setShowPasswordModal(true);
        handleCloseCreate();
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsCreating(false);
    }
  };

  const copyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage users and assign roles"
        actions={
          <Button onClick={handleOpenCreate} disabled={!isAdmin}>
            <Plus className="mr-2 h-4 w-4" />
            New User
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <span>Failed to load users</span>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex h-96 items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No users yet"
          description="Create your first user to get started"
        />
      ) : (
        <UsersTable users={users} onEdit={handleOpenEdit} />
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseCreate();
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-background p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Create User</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add a new user and assign a role.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseCreate}
                className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error message */}
            {createError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <span>{createError}</span>
              </Alert>
            )}

            {/* Form */}
            <div className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-2">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                />
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium mb-2">Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                />
              </div>

              {/* Tenant Role */}
              <div>
                <label className="block text-sm font-medium mb-2">Tenant Role *</label>
                <select
                  value={tenantRole}
                  onChange={(e) => {
                    const role = e.target.value as TenantRole;
                    setTenantRole(role);
                    if (role === TenantRole.TENANT_SUPER_ADMIN) {
                      setSelectedRoleId(null);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                >
                  <option value="TENANT_USER">User</option>
                  <option value="TENANT_SUPER_ADMIN">Admin</option>
                </select>
              </div>

              {/* Role Assignment */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Assigned Role {tenantRole === TenantRole.TENANT_USER ? '(Optional)' : ''}
                </label>
                {tenantRole === TenantRole.TENANT_SUPER_ADMIN ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 dark:bg-slate-800 dark:border-slate-700">
                    <p className="text-sm">Not applicable - Admin has full access</p>
                  </div>
                ) : (
                  <select
                    value={selectedRoleId || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      console.log('Selected role value:', value);
                      setSelectedRoleId(value || null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                  >
                    <option value="">-- No Role --</option>
                    {roles
                      .filter((r) => r.isActive)
                      .map((role) => {
                        const roleId = role.id || (role as any)._id;
                        return (
                          <option key={roleId} value={roleId}>
                            {role.name}
                          </option>
                        );
                      })}
                  </select>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseCreate}
                disabled={isCreating}
              >
                Cancel
              </Button>

              <Button type="button" onClick={handleCreateUser} disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Password Dialog */}
      {showPasswordModal && tempPassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowPasswordModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-background p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">User Created Successfully</h2>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Share this temporary password with the user. It can only be displayed once.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={tempPassword}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm dark:bg-slate-900 dark:border-slate-700"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyPassword}
                  className="flex items-center gap-2"
                >
                  {passwordCopied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              onClick={() => setShowPasswordModal(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && editingUserId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseEdit();
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-background p-6 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Edit User</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Update user details and role assignment.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseEdit}
                className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error message */}
            {createError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <span>{createError}</span>
              </Alert>
            )}

            {/* Form */}
            <div className="space-y-4">
              {/* Email (read-only) */}
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 dark:bg-slate-800 dark:border-slate-700"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-sm font-medium mb-2">Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                />
              </div>

              {/* Tenant Role */}
              <div>
                <label className="block text-sm font-medium mb-2">Tenant Role *</label>
                <select
                  value={tenantRole}
                  onChange={(e) => {
                    const role = e.target.value as TenantRole;
                    setTenantRole(role);
                    if (role === TenantRole.TENANT_SUPER_ADMIN) {
                      setSelectedRoleId(null);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                >
                  <option value="TENANT_USER">User</option>
                  <option value="TENANT_SUPER_ADMIN">Admin</option>
                </select>
              </div>

              {/* Role Assignment */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Assigned Role {tenantRole === TenantRole.TENANT_USER ? '(Optional)' : ''}
                </label>
                {tenantRole === TenantRole.TENANT_SUPER_ADMIN ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 dark:bg-slate-800 dark:border-slate-700">
                    <p className="text-sm">Not applicable - Admin has full access</p>
                  </div>
                ) : (
                  <select
                    value={selectedRoleId || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      console.log('Selected role value:', value);
                      setSelectedRoleId(value || null);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-900 dark:border-slate-700"
                  >
                    <option value="">-- No Role --</option>
                    {roles
                      .filter((r) => r.isActive)
                      .map((role) => {
                        const roleId = role.id || (role as any)._id;
                        return (
                          <option key={roleId} value={roleId}>
                            {role.name}
                          </option>
                        );
                      })}
                  </select>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseEdit}
                disabled={isUpdating}
              >
                Cancel
              </Button>

              <Button type="button" onClick={handleUpdateUser} disabled={isUpdating}>
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default UsersPage;
