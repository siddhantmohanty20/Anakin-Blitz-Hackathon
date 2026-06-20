'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Brain,
  X,
  BarChart3,
  ExternalLink,
  Loader2,
  Mail,
  Copy,
  Check,
} from 'lucide-react';

interface Job {
  id: string;
  title: string;
  company: string;
  description: string;
  match_score: number | null;
  status: 'pending' | 'applied' | 'skipped';
  created_at: string;
  missing_keywords: string[] | null;
  ai_suggestions: string[] | null;
}

interface Profile {
  full_name: string;
  target_roles: string[];
  years_experience: number;
  resume_text: string;
  openai_api_key: string;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground">
        Unscored
      </Badge>
    );
  }
  if (score >= 80) {
    return (
      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20">
        {score}%
      </Badge>
    );
  }
  if (score >= 60) {
    return (
      <Badge variant="secondary" className="bg-amber-500/15 text-amber-400 border-amber-500/20">
        {score}%
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-red-500/15 text-red-400 border-red-500/20">
      {score}%
    </Badge>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analysisJob, setAnalysisJob] = useState<Job | null>(null);
  const [emailJob, setEmailJob] = useState<Job | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [matcherLoading, setMatcherLoading] = useState(false);

  useEffect(() => {
    fetchJobs();
    fetchProfile();
  }, []);

  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setJobs(data as Job[]);
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

  const handleSkip = async (jobId: string) => {
    const { error } = await supabase.from('jobs').update({ status: 'skipped' }).eq('id', jobId);
    if (!error) {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast({ title: 'Job skipped' });
    }
  };

  const handleApply = async (jobId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: jobData } = await supabase.from('jobs').select('*').eq('id', jobId).maybeSingle();
    if (!jobData) return;

    const { error } = await supabase.from('jobs').update({ status: 'applied', user_id: userData.user.id }).eq('id', jobId);
    if (!error) {
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      toast({ title: 'Moved to Applications' });
    }
  };

  const handleRunScraper = async () => {
    setScraperLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setScraperLoading(false);
    toast({ title: 'Scraper finished', description: 'New jobs fetched from Anakin API' });
    fetchJobs();
  };

  const handleRunMatcher = async () => {
    setMatcherLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setMatcherLoading(false);
    toast({ title: 'Matcher finished', description: 'Jobs scored against your resume' });
    fetchJobs();
  };

  const handleDraftEmail = async (job: Job) => {
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Discovery Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Scrape and match jobs against your resume
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleRunScraper}
            disabled={scraperLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {scraperLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Run Scraper
          </Button>
          <Button
            onClick={handleRunMatcher}
            disabled={matcherLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {matcherLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
            Run Matcher
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex gap-6">
        <span className="flex items-center gap-1">
          <Search className="w-3 h-3 text-blue-400" />
          Fetches jobs via Anakin API based on Target Roles
        </span>
        <span className="flex items-center gap-1">
          <Brain className="w-3 h-3 text-purple-400" />
          Scores pending jobs against your resume using OpenAI
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="py-12 text-center">
            <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No pending jobs found. Run the scraper to fetch new listings.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job) => (
            <Card key={job.id} className="border-border bg-card hover:border-primary/30 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold leading-tight">{job.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{job.company}</p>
                  </div>
                  <ScoreBadge score={job.match_score} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground line-clamp-3">{job.description}</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSkip(job.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Skip
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAnalysisJob(job)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <BarChart3 className="w-4 h-4 mr-1" />
                    Analyze Gap
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApply(job.id)}
                    className="ml-auto"
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Apply
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Resume Analysis Modal */}
      <Dialog open={!!analysisJob} onOpenChange={() => setAnalysisJob(null)}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Resume Gap Analysis
            </DialogTitle>
          </DialogHeader>
          {analysisJob && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                  Missing Keywords
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(analysisJob.missing_keywords ?? ['React', 'TypeScript', 'Next.js', 'Tailwind CSS']).map((kw) => (
                    <Badge key={kw} variant="secondary" className="bg-red-500/10 text-red-400 border-red-500/20">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  AI Suggestions to Add
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {(analysisJob.ai_suggestions ?? [
                    'Add quantifiable achievements (e.g., "improved performance by 40%")',
                    'Mention experience with CI/CD pipelines and Docker',
                    'Include specific project outcomes and team size led',
                    'Highlight contributions to open-source projects',
                  ]).map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
