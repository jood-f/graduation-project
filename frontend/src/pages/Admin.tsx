import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Shield, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { UserRole } from '@/types';

interface UserWithRole {
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string | null;
}

interface AdminUsersResponse {
  users: UserWithRole[];
  counts: {
    total_users: number;
    admins: number;
    operators: number;
  };
}

interface UpdateUserRoleResponse {
  user_id: string;
  role: UserRole;
}

const roleColors: Record<UserRole, string> = {
  admin: 'bg-destructive text-destructive-foreground',
  operator: 'bg-primary text-primary-foreground',
};

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  operator: 'Operator',
};

export default function Admin() {
  const { hasRole, user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // Only admins can access this page
  if (!hasRole(['admin'])) {
    return <Navigate to="/" replace />;
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<AdminUsersResponse> => {
      if (!currentUser?.id) {
        throw new Error('Current user not found');
      }

      const response = await apiFetch('/admin/users', {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch users');
      }

      return response.json();
    },
    enabled: !!currentUser?.id,
  });

  const users = data?.users || [];
  const counts = data?.counts || {
    total_users: 0,
    admins: 0,
    operators: 0,
  };

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: UserRole }) => {
      if (!currentUser?.id) {
        throw new Error('Current user not found');
      }

      const response = await apiFetch(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const text = await response.text();
        let message = 'Failed to update role';
        try {
          const body = text ? JSON.parse(text) : null;
          message = body?.detail || body?.message || message;
        } catch {
          if (text) {
            message = text;
          }
        }
        throw new Error(message);
      }

      return response.json() as Promise<UpdateUserRoleResponse>;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<AdminUsersResponse>(['admin-users'], (previousData) => {
        if (!previousData) {
          return previousData;
        }

        const currentRole = previousData.users.find(
          (user) => user.user_id === updatedUser.user_id
        )?.role;

        if (!currentRole || currentRole === updatedUser.role) {
          return previousData;
        }

        const users = previousData.users.map((user) =>
          user.user_id === updatedUser.user_id
            ? { ...user, role: updatedUser.role }
            : user
        );

        const counts = {
          ...previousData.counts,
          admins:
            previousData.counts.admins +
            (updatedUser.role === 'admin' ? 1 : 0) -
            (currentRole === 'admin' ? 1 : 0),
          operators:
            previousData.counts.operators +
            (updatedUser.role === 'operator' ? 1 : 0) -
            (currentRole === 'operator' ? 1 : 0),
        };

        return { ...previousData, users, counts };
      });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User role updated successfully');
    },
    onError: (error) => {
      console.error('Error updating role:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update user role');
    },
  });

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    // Prevent admin from demoting themselves
    if (userId === currentUser?.id && newRole !== 'admin') {
      toast.error("You cannot demote yourself from admin");
      return;
    }
    updateRoleMutation.mutate({ userId, newRole });
  };

  return (
    <MainLayout title="Admin Panel">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{counts.total_users}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {counts.admins}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Operators</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {counts.operators}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Manage user roles and permissions. Changes take effect immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">Failed to load users: {(error as Error).message}</p>
            ) : (
              <>
                <div className="space-y-4 md:hidden">
                  {users.map((user) => (
                    <div key={user.user_id} className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                          {user.name?.charAt(0) || 'U'}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{user.name || 'Unnamed User'}</p>
                            {user.user_id === currentUser?.id && (
                              <Badge variant="outline" className="text-xs">You</Badge>
                            )}
                          </div>
                          <p className="break-all text-sm text-muted-foreground">{user.email || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <p className="text-muted-foreground">Current role</p>
                          <Badge className={roleColors[user.role]}>{roleLabels[user.role]}</Badge>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Member since</p>
                          <p>{user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Change role</p>
                        <Select
                          value={user.role}
                          onValueChange={(value) => {
                            const nextRole = value as UserRole;
                            if (nextRole !== user.role) {
                              handleRoleChange(user.user_id, nextRole);
                            }
                          }}
                          disabled={updateRoleMutation.isPending}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="operator">Operator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block">
                  <Table className="min-w-[52rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Current Role</TableHead>
                        <TableHead>Member Since</TableHead>
                        <TableHead className="text-right">Change Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.user_id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium">
                                {user.name?.charAt(0) || 'U'}
                              </div>
                              <span className="max-w-[14rem] truncate">{user.name}</span>
                              {user.user_id === currentUser?.id && (
                                <Badge variant="outline" className="text-xs">You</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="break-all text-muted-foreground">{user.email || 'N/A'}</TableCell>
                          <TableCell>
                            <Badge className={roleColors[user.role]}>
                              {roleLabels[user.role]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Select
                              value={user.role}
                              onValueChange={(value) => {
                                const nextRole = value as UserRole;
                                if (nextRole !== user.role) {
                                  handleRoleChange(user.user_id, nextRole);
                                }
                              }}
                              disabled={updateRoleMutation.isPending}
                            >
                              <SelectTrigger className="ml-auto w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="operator">Operator</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
            {!isLoading && !error && users.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">No users found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
