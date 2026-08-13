import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserRequest, CreateUserResponse, UpdateUserRequest, UpdateUserStatusRequest, User, UserStatus } from '@medicore/shared-types';
import { apiFetch, ApiError } from '@/lib/api-client';
import { toast } from '@medicore/ui';

export const USERS_QUERY_KEY = ['users'];

async function fetchUsers(): Promise<User[]> {
  return apiFetch<User[]>('/users');
}

async function createUser(dto: CreateUserRequest): Promise<CreateUserResponse> {
  return apiFetch<CreateUserResponse>('/users', {
    method: 'POST',
    body: dto,
  });
}

async function updateUser(id: string, dto: UpdateUserRequest): Promise<User> {
  return apiFetch<User>(`/users/${id}`, {
    method: 'PATCH',
    body: dto,
  });
}

async function setUserStatus(id: string, dto: UpdateUserStatusRequest): Promise<User> {
  return apiFetch<User>(`/users/${id}/status`, {
    method: 'PATCH',
    body: dto,
  });
}

async function deleteUser(id: string): Promise<void> {
  return apiFetch<void>(`/users/${id}`, {
    method: 'DELETE',
  });
}

export function useUsers() {
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: (data) => {
      const { temporaryPassword, ...user } = data;
      queryClient.setQueryData(USERS_QUERY_KEY, (old: User[] | undefined) => [
        ...(old ?? []),
        user,
      ]);
      toast.success('User created successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to create user');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateUserRequest }) => updateUser(id, dto),
    onSuccess: (data) => {
      queryClient.setQueryData(USERS_QUERY_KEY, (old: User[] | undefined) =>
        old ? old.map((u) => (u.id === data.id ? data : u)) : [data],
      );
      toast.success('User updated successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update user');
    },
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      setUserStatus(id, { status }),
    onSuccess: (data) => {
      queryClient.setQueryData(USERS_QUERY_KEY, (old: User[] | undefined) =>
        old ? old.map((u) => (u.id === data.id ? data : u)) : [data],
      );
      toast.success(`User ${data.status.toLowerCase()}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to update user status');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: (_data, id) => {
      queryClient.setQueryData(USERS_QUERY_KEY, (old: User[] | undefined) =>
        old ? old.filter((u) => u.id !== id) : [],
      );
      toast.success('User deleted successfully');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Failed to delete user');
    },
  });

  return {
    users: usersQuery.data ?? [],
    isLoading: usersQuery.isLoading,
    error: usersQuery.error,
    create: async (dto: CreateUserRequest) => {
      return createMutation.mutateAsync(dto);
    },
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    update: async (id: string, dto: UpdateUserRequest) => {
      return updateMutation.mutateAsync({ id, dto });
    },
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    setStatus: async (id: string, status: UserStatus) => {
      return setStatusMutation.mutateAsync({ id, status });
    },
    isSettingStatus: setStatusMutation.isPending,
    setStatusError: setStatusMutation.error,
    delete: async (id: string) => {
      return deleteMutation.mutateAsync(id);
    },
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}
