/*
# Seed mock jobs data

1. Changes
- Inserts 4 realistic tech-industry job listings as mock data for the dashboard.
- Jobs are assigned to a placeholder user so they appear for authenticated users.

2. Important Notes
- This is seed data for demo purposes.
*/

DO $$
DECLARE
  demo_user_id uuid;
BEGIN
  -- Find or create a demo user
  SELECT id INTO demo_user_id FROM auth.users LIMIT 1;
  
  IF demo_user_id IS NULL THEN
    -- Create a demo user if none exists
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role)
    VALUES (
      gen_random_uuid(),
      'demo@jobscout.app',
      crypt('demo123456', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{}',
      '{}',
      false,
      'authenticated'
    )
    RETURNING id INTO demo_user_id;
  END IF;

  INSERT INTO jobs (user_id, title, company, description, match_score, status, missing_keywords, ai_suggestions, created_at)
  VALUES
    (
      demo_user_id,
      'Senior Frontend Developer',
      'Stripe',
      'We are looking for a Senior Frontend Developer to lead our design system team. You will work with React, TypeScript, and modern tooling to build accessible, performant UI components used by millions of merchants. Experience with design systems and component libraries is a plus.',
      92,
      'pending',
      ARRAY['Design Systems', 'Accessibility', 'Storybook'],
      ARRAY['Add quantifiable achievements (e.g., "improved performance by 40%")', 'Mention experience with CI/CD pipelines and Docker', 'Include specific project outcomes and team size led'],
      now() - interval '1 day'
    ),
    (
      demo_user_id,
      'React Engineer',
      'Vercel',
      'Join Vercel to build the future of the web. As a React Engineer, you will work on Next.js, server components, and edge runtime features. Strong understanding of React internals, concurrent features, and performance optimization required.',
      78,
      'pending',
      ARRAY['Next.js', 'Edge Runtime', 'Concurrent React'],
      ARRAY['Highlight contributions to open-source projects', 'Mention experience with serverless architectures', 'Add metrics around bundle size or load time improvements'],
      now() - interval '2 days'
    ),
    (
      demo_user_id,
      'Full Stack TypeScript Developer',
      'Linear',
      'Linear is hiring a Full Stack TypeScript Developer to help us build the fastest issue tracking tool. You will work across the stack: React frontend, Node.js backend, and PostgreSQL. We value craft, attention to detail, and product intuition.',
      65,
      'pending',
      ARRAY['Node.js', 'PostgreSQL', 'Product Intuition'],
      ARRAY['Include examples of full-stack projects you have shipped', 'Mention experience with real-time sync or WebSockets', 'Add details about working in small, high-trust teams'],
      now() - interval '3 days'
    ),
    (
      demo_user_id,
      'Staff Software Engineer - UI Platform',
      'Netflix',
      'Netflix is seeking a Staff Software Engineer for our UI Platform team. You will define the architecture for our TV and web applications, mentor engineers, and drive cross-functional initiatives. Deep expertise in React, state management, and large-scale frontend systems is essential.',
      45,
      'pending',
      ARRAY['TV Platform', 'State Management', 'Large Scale Systems'],
      ARRAY['Add leadership experience and team size managed', 'Mention experience with A/B testing and experimentation', 'Include details about cross-functional collaboration'],
      now() - interval '4 days'
    )
  ON CONFLICT DO NOTHING;
END $$;
