'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Save, Loader2, X } from 'lucide-react';

interface ProfileData {
  id?: string;
  full_name: string;
  target_roles: string[];
  years_experience: number;
  resume_text: string;
  openai_api_key: string;
}

export default function ProfilePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    target_roles: [],
    years_experience: 0,
    resume_text: '',
    openai_api_key: '',
  });
  const [roleInput, setRoleInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (data) {
        setProfile({
          full_name: data.full_name || '',
          target_roles: data.target_roles || [],
          years_experience: data.years_experience || 0,
          resume_text: data.resume_text || '',
          openai_api_key: data.openai_api_key || '',
        });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRole = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = roleInput.trim().replace(/,$/, '');
      if (val && !profile.target_roles.includes(val)) {
        setProfile((prev) => ({ ...prev, target_roles: [...prev.target_roles, val] }));
        setRoleInput('');
      }
    }
  };

  const handleRemoveRole = (role: string) => {
    setProfile((prev) => ({
      ...prev,
      target_roles: prev.target_roles.filter((r) => r !== role),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast({ title: 'Not authenticated', description: 'Please sign in to save your profile.', variant: 'destructive' });
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userData.user.id,
          full_name: profile.full_name,
          target_roles: profile.target_roles,
          years_experience: profile.years_experience,
          resume_text: profile.resume_text,
          openai_api_key: profile.openai_api_key,
          updated_at: new Date().toISOString(),
        });
      if (error) {
        toast({ title: 'Error saving profile', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Profile saved successfully' });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Profile & Settings</h1>
        <Card className="border-border bg-card animate-pulse h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile & Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure your preferences for scraping and AI matching
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Your Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="full-name">Full Name</Label>
            <Input
              id="full-name"
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              placeholder="John Doe"
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-roles">Target Job Roles</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {profile.target_roles.map((role) => (
                <Badge key={role} variant="secondary" className="bg-secondary gap-1 pr-1">
                  {role}
                  <button
                    onClick={() => handleRemoveRole(role)}
                    className="ml-1 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              id="target-roles"
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={handleAddRole}
              placeholder="Frontend Developer, React Engineer (press Enter or comma to add)"
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="years-exp">Years of Experience</Label>
            <Input
              id="years-exp"
              type="number"
              min={0}
              max={50}
              value={profile.years_experience}
              onChange={(e) => setProfile({ ...profile, years_experience: parseInt(e.target.value) || 0 })}
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="resume">Master Resume / CV</Label>
            <Textarea
              id="resume"
              value={profile.resume_text}
              onChange={(e) => setProfile({ ...profile, resume_text: e.target.value })}
              placeholder="Paste your full resume text here for AI matching..."
              rows={10}
              className="bg-secondary border-border resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="openai-key">OpenAI API Key</Label>
            <div className="relative">
              <Input
                id="openai-key"
                type={showKey ? 'text' : 'password'}
                value={profile.openai_api_key}
                onChange={(e) => setProfile({ ...profile, openai_api_key: e.target.value })}
                placeholder="sk-..."
                className="bg-secondary border-border pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Required to run the AI Matcher.</p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
