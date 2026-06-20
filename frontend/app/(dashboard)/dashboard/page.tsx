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
  FileSearch,
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
  enriched?: boolean | null;
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

// Polls a batch URL Scraper job (POST /v1/url-scraper/batch) until it reports
// completed or failed. Distinct from pollAnakinTask above because this endpoint
// has no poll_url in the body -- you construct GET /v1/url-scraper/{jobId} yourself,
// and the terminal states are "completed" / "failed" rather than "processing".
const pollBatchScrapeTask = async (jobId: string, apiKey: string) => {
  let attempts = 0;
  const maxAttempts = 15; // batches of up to 10 parallel URLs can take longer than a single scrape

  while (attempts < maxAttempts) {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const pollResponse = await fetch(`https://api.anakin.io/v1/url-scraper/${jobId}`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!pollResponse.ok) throw new Error(`Polling failed: ${pollResponse.statusText}`);
    const data = await pollResponse.json();

    if (data.status === 'completed') return data;
    if (data.status === 'failed') throw new Error(data.error || 'Batch scrape failed');
    // status is "pending" or "processing" -- keep polling
  }

  throw new Error('Enrichment polling timed out');
};

// Splits an array into chunks of `size`. The batch scraper accepts a max of
// 10 URLs per request, so jobs beyond that need to go out in multiple batches.
const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// Threshold used to decide whether a job's description still looks like a
// short Wire snippet (needs enriching) versus a full scraped JD. Also used
// as a fallback signal for isJobEnriched when the `enriched` column isn't
// present on a row.
const MIN_DESC_LENGTH = 400;

// Sort order for the job list: enriched jobs first (so a freshly-enriched
// batch is immediately visible at the top), then by match_score descending
// within each group (unscored jobs sort after scored ones), then by
// created_at descending as a stable tiebreaker.
const sortJobs = (list: Job[]): Job[] => {
  return [...list].sort((a, b) => {
    const aEnriched = isJobEnriched(a) ? 1 : 0;
    const bEnriched = isJobEnriched(b) ? 1 : 0;
    if (aEnriched !== bEnriched) return bEnriched - aEnriched;

    const aScore = a.match_score ?? -1;
    const bScore = b.match_score ?? -1;
    if (aScore !== bScore) return bScore - aScore;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
};

// Treats a job as "enriched" if the explicit `enriched` column says so, or --
// for rows from before that column existed / if it isn't present in your
// schema yet -- falls back to the same length heuristic Enrich uses to decide
// what needs scraping. Keeping both means sorting & filtering agree even if
// you haven't run the `enriched` column migration yet.
const isJobEnriched = (job: Job): boolean => {
  if (job.enriched === true) return true;
  if (job.enriched === false) return false;
  return !!job.description && job.description.length >= MIN_DESC_LENGTH;
};
// than stripping tags from the entire page (which would include nav, footer,
// scripts, and other boilerplate -- confirmed against a real Indeed response
// that the batch scraper returns full-page `html`, not a pre-cleaned field).
//
// Tries Indeed's markup first, then falls back to Jobicy's, since those are
// the two sources handleRunScraper currently populates `job.url` from. Add
// more patterns here if you wire in additional sources later.
const extractJobDescriptionFromHtml = (html: string | null | undefined): string | null => {
  if (!html) return null;

  const cleanup = (raw: string) =>
    raw
      .replace(/<br\s*\/?>/gi, '\n')   // preserve line breaks before stripping tags
      .replace(/<[^>]*>?/gm, '')       // strip remaining tags
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')      // collapse excess blank lines
      .trim();

  // Indeed: <div id="jobDescriptionText" ...>...</div>
  const indeedMatch = html.match(
    /<div[^>]*id="jobDescriptionText"[^>]*>([\s\S]*?)<\/div>\s*<div\s+role="separator"/
  );
  if (indeedMatch && indeedMatch[1]) {
    const text = cleanup(indeedMatch[1]);
    if (text.length > 50) return text;
  }

  // Jobicy: job content commonly sits inside a div/section carrying
  // "job-description" in its class name. Looser pattern since Jobicy's
  // markup wasn't directly verified the way Indeed's was -- if this doesn't
  // match your actual Jobicy pages, tighten/replace this selector.
  const jobicyMatch = html.match(
    /<(?:div|section)[^>]*class="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/(?:div|section)>/i
  );
  if (jobicyMatch && jobicyMatch[1]) {
    const text = cleanup(jobicyMatch[1]);
    if (text.length > 50) return text;
  }

  return null;
};

export default function DashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [analysisJob, setAnalysisJob] = useState<Job | null>(null);
  const [viewJob, setViewJob] = useState<Job | null>(null);
  const [emailJob, setEmailJob] = useState<Job | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [enricherLoading, setEnricherLoading] = useState(false);
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
      setJobs(sortJobs(data as Job[]));
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

  // Enrich: takes the short, truncated descriptions populated by the scraper
  // (Wire returns brief snippets, not full JDs) and replaces them with the
  // full job description text pulled from each job's source page via the
  // Universal Scraper batch endpoint. Run this after Scraper and before Matcher
  // so the AI match step works off complete job descriptions.
  const handleRunEnricher = async () => {
    if (!profile?.anakin_api_key) {
      toast({ title: 'Missing API Key', description: 'Please add your Anakin API Key in your profile.', variant: 'destructive' });
      return;
    }

    const jobsToEnrich = jobs.filter((j) => j.url && !isJobEnriched(j));

    if (jobsToEnrich.length === 0) {
      toast({ title: 'Nothing to enrich', description: 'All jobs are already enriched.' });
      return;
    }

    setEnricherLoading(true);
    toast({ title: 'Enriching Jobs...', description: `Fetching full descriptions for ${jobsToEnrich.length} jobs.` });

    const batches = chunkArray(jobsToEnrich, 10);
    let successCount = 0;
    let failCount = 0;
    const enrichedTextById = new Map<string, string>();

    for (const batch of batches) {
      try {
        const submitResponse = await fetch('https://api.anakin.io/v1/url-scraper/batch', {
          method: 'POST',
          headers: {
            'X-API-Key': profile.anakin_api_key,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            urls: batch.map((j) => j.url),
            country: 'us', // confirmed working against Indeed in testing; switch per-source if needed
            useBrowser: false, // Indeed's JD is in static HTML -- flip to true only if a source needs JS rendering
            generateJson: false
          })
        });

        if (!submitResponse.ok) {
          console.warn(`Batch submit failed: ${submitResponse.statusText}`);
          failCount += batch.length;
          continue;
        }

        const submitData = await submitResponse.json();
        const result = await pollBatchScrapeTask(submitData.jobId, profile.anakin_api_key);

        const resultsByUrl = new Map(
          (result.results || []).map((r: any) => [r.url, r])
        );

        for (const job of batch) {
          const urlResult: any = resultsByUrl.get(job.url);

          if (!urlResult || urlResult.status !== 'completed') {
            console.warn(`Enrich failed for job ${job.id}: ${urlResult?.error || 'no result'}`);
            failCount++;
            continue;
          }

          const fullText = extractJobDescriptionFromHtml(urlResult.html);

          if (!fullText) {
            console.warn(`Enrich produced no usable text for job ${job.id} -- selector may not match this page`);
            failCount++;
            continue;
          }

          // Try writing both description and the enriched flag. If your
          // `jobs` table doesn't have an `enriched` column yet, this update
          // call fails entirely (Supabase rejects unknown columns) -- so we
          // fall back to writing just `description` in that case rather than
          // losing the enrichment text too.
          let { error } = await supabase
            .from('jobs')
            .update({ description: fullText, enriched: true })
            .eq('id', job.id);

          if (error) {
            const fallback = await supabase
              .from('jobs')
              .update({ description: fullText })
              .eq('id', job.id);
            error = fallback.error;
          }

          if (error) throw error;
          enrichedTextById.set(job.id, fullText);
          successCount++;
        }
      } catch (e) {
        console.warn('Batch enrich error:', e);
        failCount += batch.length;
      }
    }

    // Update local state immediately (description + enriched flag) and
    // re-sort so newly enriched jobs jump to the top right away, instead of
    // waiting on the fetchJobs() refetch below.
    setJobs((prev) =>
      sortJobs(
        prev.map((j) =>
          enrichedTextById.has(j.id)
            ? { ...j, description: enrichedTextById.get(j.id)!, enriched: true }
            : j
        )
      )
    );

    toast({
      title: 'Enrichment Finished',
      description: `${successCount} jobs enriched${failCount > 0 ? `, ${failCount} failed` : ''}.`,
      className: successCount > 0 ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20' : undefined
    });

    await fetchJobs();
    setEnricherLoading(false);
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
    const resultsById = new Map<string, { match_score: number; missing_keywords: string[]; ai_suggestions: string[] }>();

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

        resultsById.set(job.id, result);
      }

      // Apply results locally and re-sort by score, instead of a full page
      // reload -- sortJobs already places higher match_score on top.
      setJobs((prev) =>
        sortJobs(
          prev.map((j) => {
            const r = resultsById.get(j.id);
            return r
              ? { ...j, match_score: r.match_score, missing_keywords: r.missing_keywords, ai_suggestions: r.ai_suggestions }
              : j;
          })
        )
      );

      toast({ title: 'Success', description: 'Matching complete.' });
    } catch (e) {
      console.error("[Matcher] Fatal Exception:", e);
      toast({ title: 'Error', description: 'Failed to process. Check console for details.', variant: 'destructive' });
      // Even on a fatal exception partway through, apply whatever results
      // we did get before the error, rather than discarding completed work.
      if (resultsById.size > 0) {
        setJobs((prev) =>
          sortJobs(
            prev.map((j) => {
              const r = resultsById.get(j.id);
              return r
                ? { ...j, match_score: r.match_score, missing_keywords: r.missing_keywords, ai_suggestions: r.ai_suggestions }
                : j;
            })
          )
        );
      }
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
          <Button onClick={handleRunEnricher} disabled={enricherLoading} className="bg-amber-600 hover:bg-amber-700 text-white">
            {enricherLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileSearch className="w-4 h-4 mr-2" />}
            Enrich
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
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold leading-tight">{job.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{job.company}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isJobEnriched(job) && (
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-400 border-amber-500/20">
                        Enriched
                      </Badge>
                    )}
                    <ScoreBadge score={job.match_score} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p
                  onClick={() => setViewJob(job)}
                  className="text-sm text-muted-foreground line-clamp-3 cursor-pointer hover:text-foreground transition-colors"
                  title="Click to read full description"
                >
                  {job.description}
                </p>
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

      <Dialog open={!!viewJob} onOpenChange={() => setViewJob(null)}>
        <DialogContent className="max-w-3xl w-[90vw] bg-card border-border max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="leading-tight">{viewJob?.title}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">{viewJob?.company}</p>
              </div>
              {viewJob && isJobEnriched(viewJob) && (
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-400 border-amber-500/20 shrink-0">
                  Enriched
                </Badge>
              )}
            </div>
          </DialogHeader>
          <ScrollArea className="h-[55vh] rounded-lg bg-secondary/40 border border-border p-4">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap pr-4">
              {viewJob?.description}
            </p>
          </ScrollArea>
          {viewJob?.url && (
            <Button
              size="sm"
              onClick={() => window.open(viewJob.url, '_blank')}
              className="self-start"
            >
              <ExternalLink className="w-4 h-4 mr-1" /> View Original Posting
            </Button>
          )}
        </DialogContent>
      </Dialog>

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