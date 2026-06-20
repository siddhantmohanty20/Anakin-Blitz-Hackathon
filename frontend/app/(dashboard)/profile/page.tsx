'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, uploadMasterResume, getMasterResumeUrl } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Save, Loader2, X, Upload, CheckCircle2, FileText, ExternalLink } from 'lucide-react';

interface ProfileData {
  id?: string;
  full_name: string;
  target_roles: string[];
  years_experience: number;
  openai_api_key: string;
  anakin_api_key: string; // Added Anakin API Key
  resume_text?: string; // Kept for backwards compatibility if needed
}

export default function ProfilePage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileData>({
    full_name: '',
    target_roles: [],
    years_experience: 0,
    openai_api_key: '',
    anakin_api_key: '', // Initialize Anakin API Key
  });
  const [roleInput, setRoleInput] = useState('');
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showAnakinKey, setShowAnakinKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  // File state
  const [fileName, setFileName] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProfileAndResume();
  }, []);

  const fetchProfileAndResume = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // 1. Fetch Profile Data
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setProfile({
          ...profile,
          ...data,
          // Ensure these default to empty strings if null in DB
          openai_api_key: data.openai_api_key || '',
          anakin_api_key: data.anakin_api_key || ''
        } as ProfileData);
      }

      // 2. Fetch Existing Resume from Storage
      const url = await getMasterResumeUrl(userData.user.id);
      if (url) {
        setResumeUrl(url);
        setFileName("Existing Resume (Stored securely)");
      }

    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('No user found');

      const { error } = await supabase.from('profiles').upsert({
        id: userData.user.id,
        ...profile,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
      toast({ title: 'Profile saved', description: 'Your information has been updated.' });
    } catch (error: any) {
      toast({ title: 'Error saving profile', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const addRole = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && roleInput.trim()) {
      e.preventDefault();
      if (!profile.target_roles.includes(roleInput.trim())) {
        setProfile({ ...profile, target_roles: [...profile.target_roles, roleInput.trim()] });
      }
      setRoleInput('');
    }
  };

  const removeRole = (roleToRemove: string) => {
    setProfile({
      ...profile,
      target_roles: profile.target_roles.filter((role) => role !== roleToRemove),
    });
  };

  // --- NEW STORAGE FILE UPLOAD LOGIC ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast({ title: 'Authentication Error', description: 'You must be logged in.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    setFileName(file.name);

    try {
      // Use the utility function from your lib/supabase.ts
      const { path, error } = await uploadMasterResume(file, userData.user.id);

      if (error) {
        throw new Error(error);
      }

      toast({ 
        title: 'Upload Successful', 
        description: 'Your resume has been saved to your secure vault.',
        className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20'
      });

      // Refresh the URL so the user can immediately view their uploaded file
      const url = await getMasterResumeUrl(userData.user.id);
      setResumeUrl(url);

    } catch (error: any) {
      setFileName(null);
      toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      // Reset input so the same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Set your target roles and upload your resume for AI matching.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Professional Details</CardTitle>
          <CardDescription>This information powers the Anakin Scraper</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              placeholder="John Doe"
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <Label>Target Roles</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {profile.target_roles.map((role) => (
                <Badge key={role} variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                  {role}
                  <button onClick={() => removeRole(role)} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              value={roleInput}
              onChange={(e) => setRoleInput(e.target.value)}
              onKeyDown={addRole}
              placeholder="Type a role and press Enter (e.g., Frontend Engineer)"
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="experience">Years of Experience</Label>
            <Input
              id="experience"
              type="number"
              min="0"
              value={profile.years_experience}
              onChange={(e) => setProfile({ ...profile, years_experience: parseInt(e.target.value) || 0 })}
              className="bg-secondary border-border w-32"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Resume Upload (PDF, DOCX, TXT)</Label>
              {resumeUrl && (
                <a 
                  href={resumeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" /> View Current
                </a>
              )}
            </div>
            
            {/* Hidden File Input */}
            <input 
              type="file" 
              accept=".pdf,.docx,.txt,.md" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden" 
              disabled={uploading}
            />
            
            {/* Custom Upload Box */}
            <div 
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors
                ${uploading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}
                ${resumeUrl ? 'border-primary/50 bg-primary/5' : 'border-border bg-secondary/50 hover:bg-secondary hover:border-primary/50'}`}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                  <p className="font-medium text-sm text-foreground">Uploading to secure vault...</p>
                </>
              ) : fileName ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                  <p className="font-medium text-sm text-foreground">{fileName}</p>
                  <p className="text-xs text-muted-foreground mt-1">Click to replace file</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="font-medium text-sm text-foreground">Click to upload your resume</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports PDF, DOCX, TXT, and MD</p>
                </>
              )}
            </div>
          </div>

          {/* API Integrations Section */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h3 className="text-sm font-medium">API Integrations</h3>
            
            <div className="space-y-2">
              <Label htmlFor="anakin-key">Anakin API Key</Label>
              <div className="relative">
                <Input
                  id="anakin-key"
                  type={showAnakinKey ? 'text' : 'password'}
                  value={profile.anakin_api_key}
                  onChange={(e) => setProfile({ ...profile, anakin_api_key: e.target.value })}
                  placeholder="Your Anakin API Key"
                  className="bg-secondary border-border pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAnakinKey(!showAnakinKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAnakinKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Required to fetch job listings via the Anakin API.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="openai-key">OpenAI API Key</Label>
              <div className="relative">
                <Input
                  id="openai-key"
                  type={showOpenAIKey ? 'text' : 'password'}
                  value={profile.openai_api_key}
                  onChange={(e) => setProfile({ ...profile, openai_api_key: e.target.value })}
                  placeholder="sk-..."
                  className="bg-secondary border-border pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOpenAIKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Required to run the AI Matcher on your Dashboard.</p>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving || uploading} className="w-full sm:w-auto">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Profile Details
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}