  'use client';

  import { useState, useEffect } from 'react';
  import { useRouter } from 'next/navigation';
  import { supabase } from '@/lib/supabase';
  import { Button } from '@/components/ui/button';
  import { Badge } from '@/components/ui/badge';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
  import { ScrollArea } from '@/components/ui/scroll-area';
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
    url: string;
    match_score: number | null;
    status: 'pending' | 'applied' | 'skipped';
    created_at: string;
    missing_keywords: string[] | null;
    ai_suggestions: string[] | null;
  }

  interface Profile {
    id: string;
    full_name: string;
    target_roles: string[];
    years_experience: number;
    resume_text: string;
    openai_api_key: string;
    anakin_api_key: string; 
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

  const pollAnakinTask = async (initialData: any, apiKey: string) => {
    let currentData = initialData;
    let attempts = 0;
    const maxAttempts = 15; 
    const pollUrl = initialData.poll_url; 

    while (currentData.status === "processing" && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 3000));
      const pollResponse = await fetch(`https://api.anakin.io${pollUrl}`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!pollResponse.ok) throw new Error(`Polling failed: ${pollResponse.statusText}`);
      currentData = await pollResponse.json();
    }
    
    return currentData;
  };

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
      fetchProfile().then(() => fetchJobs());
    }, []);

    const fetchJobs = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('user_id', userData.user.id)
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

    const handleApply = async (job: Job) => {
      if (!profile) return;

      const { error } = await supabase.from('jobs').update({ status: 'applied' }).eq('id', job.id);
      if (!error) {
        setJobs((prev) => prev.filter((j) => j.id !== job.id));
        toast({ title: 'Moved to Applications' });
        if (job.url) {
          window.open(job.url, '_blank');
        }
      }
    };

    const handleRunScraper = async () => {
      if (!profile || !profile.target_roles || profile.target_roles.length === 0) {
        toast({ title: 'Missing Information', description: 'Please add target roles in your profile first.', variant: 'destructive' });
        return;
      }

      if (!profile.anakin_api_key) {
        toast({ title: 'Missing API Key', description: 'Please add your Anakin API Key in your profile.', variant: 'destructive' });
        return;
      }

      setScraperLoading(true);
      toast({ title: 'Scraping Jobs...', description: 'This may take up to 30 seconds as we fetch live data.' });

      try {
        const searchQuery = profile.target_roles.join(', ');
        const jobicyQuery = profile.target_roles.join(' '); 
        
        let scrapedJobs: any[] = [];

        try {
          const indeedResponse = await fetch(`https://api.anakin.io/v1/wire/task`, {
            method: 'POST',
            headers: {
              'X-API-Key': profile.anakin_api_key, 
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action_id: "in_search_jobs",
              params: {
                query: searchQuery,
                location: "Bengaluru, Karnataka", 
                start: 0,
                sort: "relevance",
                country_domain: "in" 
              }
            })
          });

          if (indeedResponse.ok) {
            let responseData = await indeedResponse.json();
            if (responseData.status === "processing" && responseData.poll_url) {
              responseData = await pollAnakinTask(responseData, profile.anakin_api_key);
            }
            const rawIndeedJobs = responseData.data?.data?.jobs || responseData.data?.jobs || [];
            
            const formattedIndeed = rawIndeedJobs.map((job: any) => ({
              user_id: profile.id,
              title: job.title || "Unknown Title",
              company: job.company || "Unknown Company",
              description: job.snippet ? job.snippet.replace(/<[^>]*>?/gm, '').trim() : "No description provided.",
              url: job.url || "https://indeed.com",
              status: "pending"
            }));
            
            scrapedJobs = [...scrapedJobs, ...formattedIndeed];
          }
        } catch (e) {
          console.warn("Indeed Scraper Failed:", e);
        }

        try {
          const jobicyResponse = await fetch(`https://api.anakin.io/v1/wire/task`, {
            method: 'POST',
            headers: {
              'X-API-Key': profile.anakin_api_key, 
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action_id: "jb_jobs",
              params: {
                count: 10,          
                geo: "",            
                industry: "",       
                tag: jobicyQuery    
              }
            })
          });

          if (jobicyResponse.ok) {
            let responseData = await jobicyResponse.json();
            if (responseData.status === "processing" && responseData.poll_url) {
              responseData = await pollAnakinTask(responseData, profile.anakin_api_key);
            }

            let rawJobicyJobs = responseData.data?.data?.jobs || responseData.data?.jobs || [];
            if (rawJobicyJobs.length === 0 && Array.isArray(responseData.data?.data)) {
              rawJobicyJobs = responseData.data.data;
            } else if (rawJobicyJobs.length === 0 && Array.isArray(responseData.data)) {
              rawJobicyJobs = responseData.data;
            }

            const formattedJobicy = rawJobicyJobs.map((job: any) => ({
              user_id: profile.id,
              title: job.title || job.jobTitle || job.name || "Unknown Title",
              company: job.company || job.companyName || "Unknown Company",
              description: (job.description || job.jobDescription || job.snippet || "No description provided.").replace(/<[^>]*>?/gm, '').trim(),
              url: job.url || job.jobUrl || job.applyUrl || "https://jobicy.com",
              status: "pending"
            }));
            
            scrapedJobs = [...scrapedJobs, ...formattedJobicy];
          }
        } catch (e) {
          console.warn("Jobicy Scraper Failed:", e);
        }

        if (scrapedJobs.length === 0) {
            throw new Error(`APIs returned 0 jobs.`);
        }

        const { error } = await supabase.from('jobs').insert(scrapedJobs);
        if (error) throw error;

        toast({ 
          title: 'Multi-Scraper Finished', 
          description: `Successfully fetched ${scrapedJobs.length} real jobs.`,
          className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20'
        });
        
        await fetchJobs();
      } catch (error: any) {
        console.error(error);
        toast({ title: 'Scraper Error', description: error.message || 'Failed to save jobs.', variant: 'destructive' });
      } finally {
        setScraperLoading(false);
      }
    };

    const handleRunMatcher = async () => {
      console.log("[Matcher] Started...");

      // 1. Check API Key
      if (!profile?.openai_api_key) {
        console.error("[Matcher] Error: Missing OpenAI API Key");
        toast({ title: 'Error', description: 'Missing OpenAI API Key', variant: 'destructive' });
        return;
      }

      setMatcherLoading(true);
      try {
        console.log(`[Matcher] Jobs to process: ${jobs.length}`);
        
        const isResumeValid = profile.resume_text && profile.resume_text.length > 200;
        
        for (const job of jobs) {
          console.log(`[Matcher] Analyzing job: ${job.title} (${job.id})`);
          
          const prompt = `
  You are an expert recruitment consultant. Evaluate the candidate for the role: ${job.title} at ${job.company}.
  ${isResumeValid ? `Candidate Resume: ${profile.resume_text}` : `Candidate Target Roles: ${profile.target_roles.join(', ')}. Note: Detailed resume content is currently unavailable, evaluate based on target role alignment.`}

  Job Description: ${job.description}

  Provide a match score (0-100). If the resume is missing details, do not automatically score 0; estimate based on the target roles.
  Respond ONLY with JSON:
  {
    "match_score": <number>,
    "missing_keywords": ["keyword1"],
    "ai_suggestions": ["suggestion1"]
  }`;

          console.log("[Matcher] Sending OpenAI request...");

          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${profile.openai_api_key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: "user", content: prompt }]
            })
          });

          if (!res.ok) {
            const errText = await res.text();
            console.error("[Matcher] OpenAI API Error:", errText);
            throw new Error(`API Error: ${res.status}`);
          }

          const data = await res.json();
          console.log("[Matcher] Received response:", data);
          
          const result = JSON.parse(data.choices[0].message.content.replace(/```json|```/g, ""));
          
          await supabase.from('jobs').update({
            match_score: result.match_score,
            missing_keywords: result.missing_keywords,
            ai_suggestions: result.ai_suggestions
          }).eq('id', job.id);
        }
        
        toast({ title: 'Success', description: 'Matching complete.' });
        window.location.reload();
      } catch (e) {
        console.error("[Matcher] Fatal Exception:", e);
        toast({ title: 'Error', description: 'Failed to process. Check console for details.', variant: 'destructive' });
      } finally {
        setMatcherLoading(false);
      }
    };

    const handleDraftEmail = async (job: Job) => {
      setEmailJob(job);
      setEmailLoading(true);
      setEmailDraft('');
      await new Promise((r) => setTimeout(r, 2000));
      const draft = `Subject: Application for ${job.title} at ${job.company}

  Hi Hiring Manager,

  I hope this message finds you well. I came across the ${job.title} opening at ${job.company} and was immediately excited by the opportunity.

  With my background in ${profile?.target_roles?.join(', ') || 'software development'}, I am confident I can bring immediate value.

  I have attached my resume for your review. Looking forward to hearing from you.

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
            <Button onClick={handleRunScraper} disabled={scraperLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {scraperLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Run Scraper
            </Button>
            <Button onClick={handleRunMatcher} disabled={matcherLoading} className="bg-purple-600 hover:bg-purple-700 text-white">
              {matcherLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
              Run Matcher
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
          </div>
        ) : jobs.length === 0 ? (
          <Card className="border-border bg-card">
            <CardContent className="py-12 text-center">
              <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No pending jobs. Run the scraper to fetch new listings.</p>
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
                    <Button variant="ghost" size="sm" onClick={() => handleSkip(job.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                      <X className="w-4 h-4 mr-1" /> Skip
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setAnalysisJob(job)} className="text-muted-foreground hover:text-foreground" disabled={job.match_score === null}>
                      <BarChart3 className="w-4 h-4 mr-1" /> Analyze Gap
                    </Button>
                    <Button size="sm" onClick={() => handleApply(job)} className="ml-auto">
                      <ExternalLink className="w-4 h-4 mr-1" /> Apply
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!analysisJob} onOpenChange={() => setAnalysisJob(null)}>
          <DialogContent className="max-w-2xl bg-card border-border">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" /> Resume Gap Analysis</DialogTitle></DialogHeader>
            {analysisJob && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-red-400">Missing Keywords</h3>
                  <div className="flex flex-wrap gap-2">
                    {(analysisJob.missing_keywords ?? []).length > 0 ? analysisJob.missing_keywords!.map((kw) => (
                      <Badge key={kw} variant="secondary" className="bg-red-500/10 text-red-400 border-red-500/20">{kw}</Badge>
                    )) : <p className="text-sm text-muted-foreground">No missing keywords found.</p>}
                  </div>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-amber-400">AI Suggestions</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {(analysisJob.ai_suggestions ?? []).length > 0 ? analysisJob.ai_suggestions!.map((s, i) => (
                      <li key={i} className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />{s}</li>
                    )) : <p className="text-sm text-muted-foreground">Run the matcher to generate suggestions.</p>}
                  </ul>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }