import { useState } from 'react';
import { Plus, AlertCircle, Copy, Check } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button, Alert, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Input } from '@medicore/ui';
import { useUsers } from '@/hooks/use-users';
import { usePermissions } from '@/hooks/use-permissions';
import { UsersTable } from './components/users-table';
import { UserDialog } from './components/user-dialog';

type DialogMode = 'create' | 'edit' | null;

function UsersPage() {
  const { users, isLoading, error } = useUsers();
  const { has } = usePermissions();
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);

  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) : undefined;

  const handleOpenCreate = () => {
    setSelectedUserId(null);
    setTempPassword(null);
    setDialogMode('create');
  };

  const handleOpenEdit = (id: string) => {
    setSelectedUserId(id);
    setDialogMode('edit');
  };

  const handleCloseDialog = () => {
    setDialogMode(null);
    setSelectedUserId(null);
  };

  const handleUserCreated = (password: string) => {
    setTempPassword(password);
    setShowPasswordDialog(true);
    setDialogMode(null);
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
          <Button onClick={handleOpenCreate} disabled={!has('users:create')}>
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

      <UserDialog
        open={dialogMode !== null}
        mode={dialogMode as Exclude<DialogMode, null>}
        user={selectedUser}
        onOpenChange={(open) => !open && handleCloseDialog()}
        onUserCreated={handleUserCreated}
      />

      {/* Temporary Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Created Successfully</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this temporary password with the user. It can only be displayed once.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={tempPassword || ''}
                className="font-mono text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={copyPassword}
              >
                {passwordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowPasswordDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UsersPage;
