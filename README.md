# JobScout 🚀

An AI-powered career management platform that automates job discovery, resume analysis, and personalized outreach to eliminate job search fatigue.

## 📌 Overview

JobScout streamlines the job application process by helping candidates discover relevant opportunities, analyze resume fit, and generate tailored cold outreach emails—all from a single dashboard.

Instead of manually searching for jobs and crafting personalized messages, users can focus on networking and interview preparation while JobScout handles the repetitive tasks.

## ✨ Features

* 🔍 **AI-Powered Job Discovery** based on user-defined target roles
* 📄 **Resume Analysis & Matching** using OpenAI models
* 📧 **Personalized Cold Outreach Email Generation**
* 📑 **Automated Job Enrichment** through URL scraping
* 📊 **Application Tracking Dashboard**

## 🏗️ Architecture

1. Users specify their target roles and upload their resumes.
2. The Anakin Wire API fetches relevant job opportunities.
3. A batch URL scraper enriches job listings by extracting structured information from job postings.
4. OpenAI analyzes the user's resume against enriched job descriptions to evaluate job fit and identify skill gaps.
5. The Anakin Wire API generates personalized cold outreach emails.
6. The frontend polls asynchronous tasks and updates the dashboard automatically when processing is complete.

## 🛠️ Tech Stack

### Frontend

* React
* Tailwind CSS

### Backend & Services

* Supabase (Authentication & Database)
* Anakin Wire API
* OpenAI API

### AI & Automation

* Resume Analysis
* Job Matching
* Cold Email Generation

## 🔄 Asynchronous Workflow

Job retrieval, enrichment, and email generation are handled asynchronously.

The application implements a custom polling mechanism that continuously monitors the `poll_url` returned by the Wire API and automatically updates the UI once processing is complete.

## 🚀 Getting Started

### Prerequisites

* Node.js (v18+)
* npm or yarn
* Supabase account
* OpenAI API key
* Anakin Wire API credentials

### Installation

```bash
git clone https://github.com/siddhantmohanty20/Anakin-Blitz-Hackathon.git

cd Anakin-Blitz-Hackathon

npm install
```

### Environment Variables

Create a `.env` file in the project root and add:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key

VITE_OPENAI_API_KEY=your_openai_api_key

VITE_ANAKIN_API_KEY=your_anakin_api_key
```

### Run Locally

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:5173
```

## 🔮 Future Enhancements

* Browser extension for one-click job saving
* AI-generated resume customization
* Interview preparation assistant
* Job application analytics
* LinkedIn integration

## 👨‍💻 Team

Built during the Anakin Blitz Hackathon.

Contributors:

* Siddhant Mohanty
