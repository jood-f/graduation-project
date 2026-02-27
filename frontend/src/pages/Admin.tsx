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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

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
    drone_team: number;
  };
}

const roleColors: Record<UserRole, string> = {
  admin: 'bg-destructive text-destructive-foreground',
  operator: 'bg-primary text-primary-foreground',
  drone_team: 'bg-accent text-accent-foreground',
};

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  operator: 'Operator',
  drone_team: 'Drone Team',
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

      const response = await apiFetch(`${API_BASE_URL}/admin/users`, {
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
    drone_team: 0,
  };

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: UserRole }) => {
      if (!currentUser?.id) {
        throw new Error('Current user not found');
      }

      const response = await apiFetch(`${API_BASE_URL}/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to update role');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User role updated successfully');
    },
    onError: (error) => {
      console.error('Error updating role:', error);
      toast.error('Failed to update user role');
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
        <div className="grid gap-4 md:grid-cols-3">
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
              <Table>
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
                          <span>{user.name}</span>
                          {user.user_id === currentUser?.id && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email || 'N/A'}</TableCell>
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
                          onValueChange={(value) => handleRoleChange(user.user_id, value as UserRole)}
                          disabled={updateRoleMutation.isPending}
                        >
                          <SelectTrigger className="w-32 ml-auto">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="operator">Operator</SelectItem>
                            <SelectItem value="drone_team">Drone Team</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
