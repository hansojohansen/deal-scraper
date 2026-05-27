# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Python deal scraper. Stack and storage are TBD — update this file as decisions are made.

GitHub: https://github.com/hansojohansen/deal-scraper

## Git Workflow

After every meaningful change, commit and push to GitHub:

```bash
git add <files>
git commit -m "concise description of what changed"
git push
```

Commit message conventions:
- Use present tense imperative: "Add price parser" not "Added price parser"
- Be specific: "Add Amazon price scraper" not "Update scraper"
- One logical change per commit

Never batch unrelated changes into a single commit.

## Environment

- Virtual environment: use `venv/` (already gitignored)
- Secrets and API keys: store in `.env` (already gitignored), never hardcode
- Python version: target 3.10+

## Scraping Guidelines

- Respect `robots.txt` and rate-limit requests (add delays between requests)
- Store raw HTML/responses during development for debugging without re-fetching
- Use realistic User-Agent headers
