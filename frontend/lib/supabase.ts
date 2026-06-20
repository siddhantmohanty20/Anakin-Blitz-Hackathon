import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables! Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==========================================
// RESUME STORAGE UTILITIES (PDF, DOCX, TXT, MD)
// ==========================================

export async function uploadMasterResume(
  file: File,
  userId: string
): Promise<{ path: string; error: string | null }> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  
  // Array of allowed file extensions
  const allowedExtensions = ['pdf', 'docx', 'txt', 'md'];
  
  if (!ext || !allowedExtensions.includes(ext)) {
    return { path: "", error: "Invalid file type. Allowed types: PDF, DOCX, TXT, MD." };
  }

  const path = `${userId}/master-resume.${ext}`;

  const { error } = await supabase.storage
    .from("resumes")
    .upload(path, file, { upsert: true });

  if (error) return { path: "", error: error.message };
  return { path, error: null };
}

export async function getMasterResumeUrl(userId: string): Promise<string | null> {
  // Check common extensions to find the user's uploaded resume
  const extensions = ["pdf", "docx", "txt", "md"];
  
  for (const ext of extensions) {
    const { data } = await supabase.storage
      .from("resumes")
      .createSignedUrl(`${userId}/master-resume.${ext}`, 3600);
    
    if (data?.signedUrl) return data.signedUrl;
  }
  
  return null;
}