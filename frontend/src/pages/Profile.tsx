import { type ReactNode, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { type LucideIcon, User, Mail, Shield, Calendar, Key, Loader2 } from 'lucide-react';

interface ProfileDetailProps {
  icon: LucideIcon;
  label: string;
  value?: string;
  valueClassName?: string;
  children?: ReactNode;
}

function ProfileDetail({
  icon: Icon,
  label,
  value,
  valueClassName = 'text-sm sm:text-base',
  children,
}: ProfileDetailProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/30 p-4">
      <Label className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Label>
      <div className="mt-3 min-h-10">
        {children ?? <p className={valueClassName}>{value}</p>}
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleSave = async () => {
    try {
      await updateProfile({ name });
      setIsEditing(false);
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
      toast.success('Password updated successfully');
    } catch (error) {
      toast.error('Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (!user) {
    return (
      <MainLayout title="Profile">
        <p>Please log in to view your profile.</p>
      </MainLayout>
    );
  }

  const formattedRole = user.role.replace(/_/g, ' ');
  const memberSince = new Date(user.createdAt).toLocaleDateString();

  return (
    <MainLayout title="Profile">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-xl sm:text-2xl">Profile Information</CardTitle>
              <CardDescription>
                Manage your account details and preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-4 pb-4 sm:px-6 sm:pb-6">
              <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-background/20 p-4 sm:flex-row sm:items-center sm:gap-5">
                <Avatar className="h-16 w-16 sm:h-20 sm:w-20">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="bg-primary text-xl text-primary-foreground sm:text-2xl">
                    {user.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-2">
                  <h3 className="break-words text-xl font-semibold sm:text-2xl">{user.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="w-fit capitalize">
                      {formattedRole}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="max-w-full whitespace-normal break-all text-left text-muted-foreground"
                    >
                      {user.email}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <ProfileDetail
                  icon={User}
                  label="Full Name"
                  value={user.name}
                  valueClassName="break-words text-sm sm:text-base"
                >
                  {isEditing ? (
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  ) : undefined}
                </ProfileDetail>

                <ProfileDetail
                  icon={Mail}
                  label="Email Address"
                  value={user.email}
                  valueClassName="break-all text-sm text-muted-foreground sm:text-base"
                />

                <ProfileDetail
                  icon={Shield}
                  label="Role"
                  value={formattedRole}
                  valueClassName="text-sm capitalize sm:text-base"
                />

                <ProfileDetail
                  icon={Calendar}
                  label="Member Since"
                  value={memberSince}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {isEditing ? (
                  <>
                    <Button onClick={handleSave} className="w-full sm:w-auto">
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="w-full sm:w-auto"
                  >
                    Edit Profile
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="overflow-hidden">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                  <Key className="h-5 w-5" />
                  Security
                </CardTitle>
                <CardDescription>
                  Manage your password and security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">
                <div className="rounded-lg border border-border/60 bg-background/30 p-4">
                  <div className="flex flex-col gap-4">
                    <div className="min-w-0">
                      <p className="font-medium">Password</p>
                      <p className="text-sm text-muted-foreground">
                        Change your account password without leaving the app
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsChangingPassword((current) => !current);
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                      className="w-full sm:w-auto"
                    >
                      {isChangingPassword ? 'Cancel' : 'Change Password'}
                    </Button>
                  </div>

                  {isChangingPassword ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="new-password">New Password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          placeholder="Enter a new password"
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirm-new-password">Confirm Password</Label>
                        <Input
                          id="confirm-new-password"
                          type="password"
                          placeholder="Repeat the new password"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Button
                          onClick={handleResetPassword}
                          disabled={isUpdatingPassword}
                          className="w-full sm:w-auto"
                        >
                          {isUpdatingPassword ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Update Password
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-background/30 p-4">
                    <p className="text-sm font-medium text-muted-foreground">Signed in as</p>
                    <p className="mt-2 break-all text-sm sm:text-base">{user.email}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/30 p-4">
                    <p className="text-sm font-medium text-muted-foreground">Account role</p>
                    <p className="mt-2 text-sm capitalize sm:text-base">{formattedRole}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
