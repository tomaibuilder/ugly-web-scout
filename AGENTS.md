# Ugly Web Scout - Agent Memo

This document contains key technical information and architectural decisions for the Ugly Web Scout project.

## Core Technologies
- **Backend:** Node.js (Queue Worker)
- **Database:** PostgreSQL
- **Frontend:** Web-based dashboard (details TBD)

## API Integrations
- **Google Places API:** To source business websites based on user queries (e.g., "dentists in London").
- **OpenAI GPT API:** For the core website design audit. The model will be prompted to act as a web-design auditor and return a JSON object with the analysis.
- **DropContact API:** For enriching exported leads with owner/contact information.

## Key Technical Requirements
- **Auditing Process:**
    - The worker will fetch URLs from a job queue.
    - It will call the GPT API with the URL.
    - The system will run up to 50 audits in parallel.
- **Caching:**
    - GPT audit results will be cached by domain to prevent duplicate API calls and reduce costs.
- **Data Storage:**
    - Audit results (score, quadrant, reasons, URL, timestamp) will be stored in a Postgres database.
- **Enrichment:**
    - DropContact enrichment will be done in batches of 100 to optimize credit usage.
- **Performance Goal:**
    - Process and score over 100 domains in under 2 minutes.
