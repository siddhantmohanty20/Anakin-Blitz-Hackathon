'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  description: string;
}

interface Profile {
  full_name: string;
  target_roles: string[];
  years_experience: number;
  resume_text: string;
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
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
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

  const handleDraftEmail = async (job: Application) => {
    setEmailJob(job);
    setEmailLoading(true);
    setEmailDraft('');
    await new Promise((r) => setTimeout(r, 2000));
    const draft = `Subject: Application for ${job.title} at ${job.company}

Hi Hiring Manager,

I hope this message finds you well. I came across the ${job.title} opening at ${job.company} and was immediately excited by the opportunity to contribute to your team.

With ${profile?.years_experience || 'several'} years of experience in ${profile?.target_roles?.join(', ') || 'software development'}, I have honed my skills in building scalable, user-centric applications. My background aligns closely with the requirements outlined in your job description, and I am confident I can bring immediate value.

I have attached my resume for your review and would welcome the chance to discuss how my experience can support ${job.company}'s goals. Please let me know if you need any additional information.

Looking forward to hearing from you.

Best regards,
${profile?.full_name || '[Your Name]'}`;
    setEmailDraft(draft);
    setEmailLoading(false);
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
        <p className="text-muted-foreground text-sm mt-1">
          Track jobs you have applied to and draft outreach emails
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : applications.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-12 text-center">
            <ExternalLink className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No applications yet. Apply to jobs from the Discovery Dashboard.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <Card key={app.id} className="border-border bg-card hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base">{app.title}</h3>
                      <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        Applied
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{app.company}</p>
                    <p className="text-xs text-muted-foreground">
                      Applied on {new Date(app.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDraftEmail(app)}
                    className="shrink-0"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Draft Cold Email
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cold Email Modal */}
      <Dialog open={!!emailJob} onOpenChange={() => setEmailJob(null)}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Recruiter Outreach
            </DialogTitle>
          </DialogHeader>
          {emailLoading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Searching for recruiter and drafting email...</p>
            </div>
          ) : (
            <div className="space-y-4 mt-2">
              <ScrollArea className="h-64 rounded-lg bg-secondary p-4 border border-border">
                <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                  {emailDraft}
                </pre>
              </ScrollArea>
              <Button onClick={copyToClipboard} className="w-full" variant="outline">
                {copied ? <Check className="w-4 h-4 mr-2 text-emerald-400" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
