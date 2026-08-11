export const SYSTEM_PERMISSION_SEED: Array<{ key: string; name: string; description: string; module: string }> = [
  {
    key: 'users:read',
    name: 'View users',
    description: 'View the list of users and their details',
    module: 'Users',
  },
  {
    key: 'users:create',
    name: 'Create users',
    description: 'Create new users in the organization',
    module: 'Users',
  },
  {
    key: 'users:update',
    name: 'Edit users',
    description: 'Edit user details and assign roles',
    module: 'Users',
  },
  {
    key: 'users:deactivate',
    name: 'Activate/deactivate users',
    description: 'Activate or deactivate user accounts',
    module: 'Users',
  },
  {
    key: 'roles:read',
    name: 'View roles',
    description: 'View the list of roles and their permissions',
    module: 'Roles',
  },
  {
    key: 'roles:create',
    name: 'Create roles',
    description: 'Create new roles in the organization',
    module: 'Roles',
  },
  {
    key: 'roles:update',
    name: 'Edit roles',
    description: 'Edit role details and permissions',
    module: 'Roles',
  },
  {
    key: 'roles:delete',
    name: 'Delete roles',
    description: 'Delete roles from the organization',
    module: 'Roles',
  },
  {
    key: 'permissions:read',
    name: 'View permissions',
    description: 'View the list of available permissions',
    module: 'Permissions',
  },
  {
    key: 'permissions:create',
    name: 'Create permissions',
    description: 'Create new custom permissions',
    module: 'Permissions',
  },
  {
    key: 'permissions:update',
    name: 'Edit permissions',
    description: 'Edit permission details',
    module: 'Permissions',
  },
  {
    key: 'permissions:delete',
    name: 'Delete permissions',
    description: 'Delete custom permissions',
    module: 'Permissions',
  },
];
