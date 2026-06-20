'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Mail, Loader2, Copy, Check, ExternalLink } from 'lucide-react';

interface Application {
  id: string;
  title: string;
  company: string;
  status: string;
  created_at: string;
}

interface Profile {
  full_name: string;
  target_roles: string[];
  years_experience: number;
  anakin_api_key: string;
}

export default function ApplicationsPage() {
  const { toast } = useToast();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [emailJob, setEmailJob] = useState<Application | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchApplications();
    fetchProfile();
  }, []);

  const fetchApplications = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', userData.user.id)
      .eq('status', 'applied')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setApplications(data as Application[]);
    }
    setLoading(false);
  };

  const fetchProfile = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (data) {
      setProfile(data as Profile);
    }
  };

  // The "chatgpt" Wire action is async: the initial POST can come back
  // "processing" + poll_url, which needs polling via GET /v1/wire/jobs/{id}.
  //
  // Confirmed against two real responses that the poll response has TWO
  // status layers:
  //   - outer: result.status -- "completed" once the job finishes
  //   - inner: result.data.status -- "ok", the chatgpt action's own status
  // The actual generated text is nested two levels deep, at
  // result.data.data.answer_text. pollChatgptTask below returns result.data
  // (the inner layer) once done, so callers read draft text from
  // `<returned>.data.answer_text` -- matching handleDraftEmail's
  // `result.data?.answer_text` below.
  const pollChatgptTask = async (pollUrl: string, apiKey: string) => {
    let attempts = 0;
    const maxAttempts = 20; // chatgpt completions can take ~25s+ based on testing

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const pollResponse = await fetch(`https://api.anakin.io${pollUrl}`, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey }
      });

      if (!pollResponse.ok) {
        throw new Error(`Polling failed: ${pollResponse.statusText}`);
      }

      const result = await pollResponse.json();

      if (result.status === 'completed' || result.status === 'ok') {
        return result.data ?? result;
      }
      if (result.status === 'processing' || result.status === 'pending') {
        continue; // keep polling
      }
      // anything else (e.g. "failed", "error") is a terminal failure
      throw new Error(result.error || `Task failed with status: ${result.status}`);
    }

    throw new Error('Email generation timed out.');
  };

  const handleDraftEmail = async (job: Application) => {
    if (!profile?.anakin_api_key) {
      toast({ title: "API Key Missing", description: "Please add your Anakin API Key in your profile settings.", variant: "destructive" });
      return;
    }

    setEmailJob(job);
    setEmailLoading(true);
    setEmailDraft('');

    try {
      const response = await fetch('https://api.anakin.io/v1/wire/task', {
        method: 'POST',
        headers: {
          'X-API-Key': profile.anakin_api_key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action_id: "chatgpt",
          params: {
            prompt: `Write a professional cold email to apply for the ${job.title} position at ${job.company}. My background: ${profile.years_experience} years of experience in ${profile.target_roles.join(', ')}. Tone: Professional and enthusiastic.`,
            web_search: false,
            additional_prompt: "",
            include_html: false
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Anakin API error: ${response.statusText}`);
      }

      let result = await response.json();

      if (result.status === 'processing' && result.poll_url) {
        // After this, `result` is the INNER layer ({ status: "ok", data: { answer_text, ... } }),
        // matching the shape of an immediate (non-polled) "ok" response below.
        result = await pollChatgptTask(result.poll_url, profile.anakin_api_key);
      } else if (result.status !== 'ok' && result.status !== 'completed') {
        throw new Error(result.error || `Task did not complete successfully (status: ${result.status}).`);
      }

      const draft = result.data?.answer_text;

      if (!draft) {
        console.error('[DraftEmail] Unrecognized response shape:', result);
        throw new Error('No answer text found in response. Check console for the raw response shape.');
      }

      setEmailDraft(draft);
    } catch (error: any) {
      console.error('[DraftEmail] Failed:', error);
      toast({ title: "Generation Failed", description: error.message || "Could not connect to Anakin API.", variant: "destructive" });
      setEmailJob(null);
    } finally {
      setEmailLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(emailDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applications Board</h1>
        <p className="text-muted-foreground text-sm mt-1">Track your applied roles and use AI to draft outreach emails.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : applications.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-12 text-center">
            <ExternalLink className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No applications yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Card key={app.id} className="border-border bg-card">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{app.title}</h3>
                  <p className="text-sm text-muted-foreground">{app.company}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleDraftEmail(app)}>
                  <Mail className="w-4 h-4 mr-2" /> Draft Cold Email
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!emailJob} onOpenChange={() => setEmailJob(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader><DialogTitle>AI Generated Outreach</DialogTitle></DialogHeader>
          {emailLoading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Generating your personalized email...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <ScrollArea className="h-64 rounded-lg bg-secondary p-4 border border-border">
                <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">{emailDraft}</pre>
              </ScrollArea>
              <Button onClick={copyToClipboard} className="w-full">
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}