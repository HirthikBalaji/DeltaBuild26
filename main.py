"""
Dev Metrics API — Live Version
Replaces CSV reads with direct Jira + GitHub API calls.
GitHub data is disk-cached (TTL configurable) since fetching is slow.
Jira data is memory-cached with a short TTL.

Env vars required:
    JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY
    GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO
Optional:
    GITHUB_BRANCH, GITHUB_SINCE, GITHUB_UNTIL
    GITHUB_CACHE_TTL_HOURS  (default: 6)
    JIRA_CACHE_TTL_SECONDS  (default: 300)
    GITHUB_CACHE_FILE       (default: .github_cache.json)
"""

import os
import csv
import json
import math
import time
import logging
import asyncio
import sys
from datetime import datetime
from typing import Generator, List, Dict, Any, Optional

import requests
from requests.auth import HTTPBasicAuth
import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import ollama

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────
JIRA_BASE_URL       = os.environ.get("JIRA_BASE_URL", "https://your-domain.atlassian.net")
JIRA_EMAIL          = os.environ.get("JIRA_EMAIL", "")
JIRA_API_TOKEN      = os.environ.get("JIRA_API_TOKEN", "")
JIRA_PROJECT_KEY    = os.environ.get("JIRA_PROJECT_KEY", "")
PAGE_SIZE           = 100

GITHUB_TOKEN        = os.environ.get("GITHUB_TOKEN", "")
GITHUB_OWNER        = os.environ.get("GITHUB_OWNER", "")
GITHUB_REPO         = os.environ.get("GITHUB_REPO", "")
GITHUB_BRANCH       = os.environ.get("GITHUB_BRANCH", "")
GITHUB_SINCE        = os.environ.get("GITHUB_SINCE", "")
GITHUB_UNTIL        = os.environ.get("GITHUB_UNTIL", "")
GITHUB_SLEEP        = 0.25   # seconds between GH requests

GITHUB_CACHE_FILE   = os.environ.get("GITHUB_CACHE_FILE", ".github_cache.json")
GITHUB_CACHE_TTL    = int(os.environ.get("GITHUB_CACHE_TTL_HOURS", "6")) * 3600  # seconds
JIRA_CACHE_TTL      = int(os.environ.get("JIRA_CACHE_TTL_SECONDS", "300"))

SLACK_BOT_TOKEN     = os.environ.get("SLACK_BOT_TOKEN", "")          # xoxb-…
SLACK_CHANNEL_IDS   = os.environ.get("SLACK_CHANNEL_IDS", "C0ALWEDLYUQ")        # comma-separated channel IDs
SLACK_CACHE_TTL     = int(os.environ.get("SLACK_CACHE_TTL_SECONDS", "120"))  # default: 2 min
SLACK_MSG_LIMIT     = int(os.environ.get("SLACK_MSG_LIMIT", "200"))   # messages per channel
# ───────────────────────────────────────────────────────────────────────────────

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory caches
reasoning_cache: dict = {}
dna_cache: dict = {}
_jira_cache: dict = {"data": None, "ts": 0.0}
_slack_cache: dict = {"data": None, "ts": 0.0}


# ══════════════════════════════════════════════════════════════════════════════
#  JIRA API HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _jira_auth() -> HTTPBasicAuth:
    if not JIRA_EMAIL or not JIRA_API_TOKEN:
        raise RuntimeError("JIRA_EMAIL and JIRA_API_TOKEN must be set.")
    return HTTPBasicAuth(JIRA_EMAIL, JIRA_API_TOKEN)


def _jira_get(path: str, params: dict | None = None) -> dict:
    url = f"{JIRA_BASE_URL.rstrip('/')}/rest/api/3/{path.lstrip('/')}"
    resp = requests.get(url, auth=_jira_auth(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _jira_post(path: str, body: dict) -> dict:
    url = f"{JIRA_BASE_URL.rstrip('/')}/rest/api/3/{path.lstrip('/')}"
    resp = requests.post(
        url, auth=_jira_auth(),
        data=json.dumps(body),
        timeout=30,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()


def _jira_plain_text(body) -> str:
    """Extract plain text from Atlassian Document Format (ADF) or plain string."""
    if isinstance(body, str):
        return body.strip()
    texts: list[str] = []
    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "text":
                texts.append(node.get("text", ""))
            for child in node.get("content", []):
                walk(child)
        elif isinstance(node, list):
            for item in node:
                walk(item)
    walk(body)
    return " ".join(texts).strip()


def _jira_display_name(person: dict | None, fallback: str = "unknown") -> str:
    if not person:
        return fallback
    return person.get("displayName") or person.get("emailAddress", fallback)


def fetch_jira_issues(project_key: str) -> list[dict]:
    """Return list of issue dicts: key, title, status, assignee, created, updated."""
    issues = []
    next_page_token: str | None = None
    while True:
        payload: dict = {
            "jql": f'project = "{project_key}" ORDER BY created ASC',
            "maxResults": PAGE_SIZE,
            "fields": ["summary", "status", "assignee", "created", "updated"],
        }
        if next_page_token:
            payload["nextPageToken"] = next_page_token
        data = _jira_post("search/jql", payload)
        batch = data.get("issues", [])
        if not batch:
            break
        for issue in batch:
            fields = issue.get("fields", {})
            issues.append({
                "key":      issue["key"],
                "title":    fields.get("summary", ""),
                "status":   fields.get("status", {}).get("name", ""),
                "assignee": _jira_display_name(fields.get("assignee"), "Unassigned"),
                "created":  fields.get("created", ""),
                "updated":  fields.get("updated", ""),
            })
        next_page_token = data.get("nextPageToken")
        if not next_page_token:
            break
    log.info("Fetched %d Jira issues", len(issues))
    return issues


def fetch_jira_comments(project_key: str) -> list[dict]:
    """Return list of comment dicts: issue_key, comment_id, author, comment, created."""
    comments: list[dict] = []

    # First get all issue keys
    next_page_token: str | None = None
    issue_keys: list[str] = []
    while True:
        payload: dict = {
            "jql": f'project = "{project_key}" ORDER BY created ASC',
            "maxResults": PAGE_SIZE,
            "fields": ["summary"],
        }
        if next_page_token:
            payload["nextPageToken"] = next_page_token
        data = _jira_post("search/jql", payload)
        batch = data.get("issues", [])
        if not batch:
            break
        issue_keys.extend(i["key"] for i in batch)
        next_page_token = data.get("nextPageToken")
        if not next_page_token:
            break

    for issue_key in issue_keys:
        log.info("Fetching comments for %s …", issue_key)
        start = 0
        while True:
            data = _jira_get(f"issue/{issue_key}/comment", {
                "startAt": start,
                "maxResults": PAGE_SIZE,
                "orderBy": "created",
            })
            batch = data.get("comments", [])
            if not batch:
                break
            for c in batch:
                comments.append({
                    "issue_key":  issue_key,
                    "comment_id": c["id"],
                    "author":     _jira_display_name(c.get("author", {})),
                    "comment":    _jira_plain_text(c.get("body", "")),
                    "created":    c.get("created", ""),
                })
            start += len(batch)
            if start >= data.get("total", 0):
                break

    log.info("Fetched %d Jira comments", len(comments))
    return comments


def get_jira_data() -> tuple[list[dict], list[dict]]:
    """Return (issues, comments) with memory caching."""
    now = time.time()
    if _jira_cache["data"] and (now - _jira_cache["ts"]) < JIRA_CACHE_TTL:
        log.info("Using cached Jira data (age: %.0fs)", now - _jira_cache["ts"])
        return _jira_cache["data"]

    if not JIRA_PROJECT_KEY:
        log.warning("JIRA_PROJECT_KEY not set, skipping Jira fetch")
        return [], []

    issues   = fetch_jira_issues(JIRA_PROJECT_KEY)
    comments = fetch_jira_comments(JIRA_PROJECT_KEY)
    _jira_cache["data"] = (issues, comments)
    _jira_cache["ts"]   = now
    return issues, comments


# ══════════════════════════════════════════════════════════════════════════════
#  SLACK API HELPERS
# ══════════════════════════════════════════════════════════════════════════════

_SLACK_HEADERS: dict = {}
if SLACK_BOT_TOKEN:
    _SLACK_HEADERS = {
        "Authorization": f"Bearer {SLACK_BOT_TOKEN}",
        "Content-Type": "application/json",
    }

SLACK_SENTIMENT_KEYWORDS = {
    "positive": ["thanks", "great", "awesome", "nice work", "well done", "lgtm", "approved",
                 "good job", "brilliant", "excellent", "perfect", "love it", "ship it"],
    "negative": ["blocker", "broken", "bug", "failed", "urgent", "critical", "down",
                 "error", "crash", "outage", "regression", "revert"],
    "neutral":  [],
}


def _slack_get(path: str, params: dict | None = None) -> dict:
    url = f"https://slack.com/api/{path}"
    resp = requests.get(url, headers=_SLACK_HEADERS, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"Slack API error on {path}: {data.get('error', 'unknown')}")
    return data


def _slack_sentiment(text: str) -> str:
    tl = text.lower()
    pos = sum(1 for w in SLACK_SENTIMENT_KEYWORDS["positive"] if w in tl)
    neg = sum(1 for w in SLACK_SENTIMENT_KEYWORDS["negative"] if w in tl)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def fetch_slack_channels() -> list[dict]:
    """Return list of channels the bot has access to."""
    channels: list[dict] = []
    cursor = None
    while True:
        params: dict = {"limit": 200, "exclude_archived": "true", "types": "public_channel,private_channel"}
        if cursor:
            params["cursor"] = cursor
        data = _slack_get("conversations.list", params)
        channels.extend(data.get("channels", []))
        cursor = data.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            break
    return channels


def fetch_slack_messages(channel_id: str, limit: int = 200) -> list[dict]:
    """Fetch recent messages from a Slack channel."""
    params: dict = {"channel": channel_id, "limit": min(limit, 1000)}
    data = _slack_get("conversations.history", params)
    return data.get("messages", [])


def fetch_slack_users() -> dict[str, str]:
    """Return {user_id: display_name} mapping."""
    user_map: dict[str, str] = {}
    cursor = None
    while True:
        params: dict = {"limit": 200}
        if cursor:
            params["cursor"] = cursor
        data = _slack_get("users.list", params)
        for member in data.get("members", []):
            uid = member.get("id", "")
            profile = member.get("profile", {})
            name = (profile.get("display_name") or profile.get("real_name") or member.get("name") or uid)
            user_map[uid] = name
        cursor = data.get("response_metadata", {}).get("next_cursor")
        if not cursor:
            break
    return user_map


def _compute_slack_stats(messages: list[dict], user_map: dict[str, str]) -> dict:
    """
    Aggregate message-level data into per-developer Slack metrics:
      message_count, avg_sentiment, reaction_count, thread_replies, mention_count
    """
    dev_stats: dict[str, dict] = {}
    total_msgs = 0
    sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0}

    for msg in messages:
        if msg.get("subtype"):          # skip joins/leaves/bot posts
            continue
        uid = msg.get("user", "")
        if not uid:
            continue
        name = normalize_name(user_map.get(uid, uid))
        text = msg.get("text", "")
        sentiment = _slack_sentiment(text)
        reactions = sum(r.get("count", 0) for r in msg.get("reactions", []))
        replies   = int(msg.get("reply_count", 0))
        mentions  = text.count("<@")

        if name not in dev_stats:
            dev_stats[name] = {
                "name": name, "message_count": 0,
                "positive": 0, "negative": 0, "neutral": 0,
                "reaction_count": 0, "thread_replies": 0, "mention_count": 0,
            }
        s = dev_stats[name]
        s["message_count"]  += 1
        s[sentiment]        += 1
        s["reaction_count"] += reactions
        s["thread_replies"] += replies
        s["mention_count"]  += mentions
        total_msgs          += 1
        sentiment_counts[sentiment] += 1

    # Post-process: compute avg sentiment label + score
    for s in dev_stats.values():
        total = max(s["message_count"], 1)
        pos_ratio = s["positive"] / total
        neg_ratio = s["negative"] / total
        if pos_ratio > 0.4:
            s["avg_sentiment"] = "positive"
        elif neg_ratio > 0.3:
            s["avg_sentiment"] = "negative"
        else:
            s["avg_sentiment"] = "neutral"
        # Collaboration score: weighted mix of reactions + replies (out of 100)
        s["collab_score"] = min(100, round(
            (s["reaction_count"] / max(total_msgs, 1)) * 3000 +
            (s["thread_replies"] / max(total_msgs, 1)) * 2000 +
            (pos_ratio * 40)
        ))

    return {
        "dev_stats":        list(dev_stats.values()),
        "total_messages":   total_msgs,
        "sentiment_summary": sentiment_counts,
    }


def get_slack_data() -> dict:
    """
    Return aggregated Slack metrics with caching.
    Returns:
      {
        "channels": [...],       # list of {id, name, message_count, ...}
        "dev_stats": [...],      # per-developer stats
        "total_messages": int,
        "sentiment_summary": {...},
        "recent_messages": [...] # last 20 messages across all channels (for the feed)
      }
    """
    now = time.time()
    if _slack_cache["data"] and (now - _slack_cache["ts"]) < SLACK_CACHE_TTL:
        log.info("Using cached Slack data (age: %.0fs)", now - _slack_cache["ts"])
        return _slack_cache["data"]

    if not SLACK_BOT_TOKEN:
        log.warning("SLACK_BOT_TOKEN not set, skipping Slack fetch")
        return {"channels": [], "dev_stats": [], "total_messages": 0,
                "sentiment_summary": {"positive": 0, "negative": 0, "neutral": 0},
                "recent_messages": []}

    try:
        user_map   = fetch_slack_users()
        channel_ids = [c.strip() for c in SLACK_CHANNEL_IDS.split(",") if c.strip()] if SLACK_CHANNEL_IDS else []

        # If no explicit channels, discover them
        if not channel_ids:
            all_channels = fetch_slack_channels()
            channel_ids  = [c["id"] for c in all_channels[:10]]  # cap at 10 channels

        all_messages:  list[dict] = []
        channel_stats: list[dict] = []

        for ch_id in channel_ids:
            try:
                ch_info = _slack_get("conversations.info", {"channel": ch_id}).get("channel", {})
                msgs    = fetch_slack_messages(ch_id, limit=SLACK_MSG_LIMIT)
                real_msgs = [m for m in msgs if not m.get("subtype") and m.get("user")]
                channel_stats.append({
                    "id":            ch_id,
                    "name":          ch_info.get("name", ch_id),
                    "message_count": len(real_msgs),
                    "topic":         (ch_info.get("topic") or {}).get("value", ""),
                })
                for m in msgs:
                    m["_channel_id"]   = ch_id
                    m["_channel_name"] = ch_info.get("name", ch_id)
                all_messages.extend(msgs)
            except Exception as e:
                log.warning("Could not fetch Slack channel %s: %s", ch_id, e)

        aggregated = _compute_slack_stats(all_messages, user_map)

        # Build recent messages feed (last 20 non-bot messages, sorted by ts)
        recent = sorted(
            [m for m in all_messages if not m.get("subtype") and m.get("user")],
            key=lambda m: float(m.get("ts", 0)), reverse=True
        )[:20]
        recent_feed = [{
            "ts":       m.get("ts", ""),
            "channel":  m.get("_channel_name", ""),
            "user":     normalize_name(user_map.get(m.get("user", ""), m.get("user", "unknown"))),
            "text":     m.get("text", "")[:200],
            "sentiment": _slack_sentiment(m.get("text", "")),
            "reactions": sum(r.get("count", 0) for r in m.get("reactions", [])),
        } for m in recent]

        result = {
            "channels":         channel_stats,
            "dev_stats":        aggregated["dev_stats"],
            "total_messages":   aggregated["total_messages"],
            "sentiment_summary": aggregated["sentiment_summary"],
            "recent_messages":  recent_feed,
        }
        _slack_cache["data"] = result
        _slack_cache["ts"]   = now
        log.info("Slack data fetched: %d messages across %d channels", aggregated["total_messages"], len(channel_stats))
        return result

    except Exception as e:
        log.error("Slack fetch error: %s", e, exc_info=True)
        return {"channels": [], "dev_stats": [], "total_messages": 0,
                "sentiment_summary": {"positive": 0, "negative": 0, "neutral": 0},
                "recent_messages": [], "error": str(e)}


# ══════════════════════════════════════════════════════════════════════════════
#  GITHUB API HELPERS  (with disk cache)
# ══════════════════════════════════════════════════════════════════════════════

_GH_HEADERS = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
if GITHUB_TOKEN:
    _GH_HEADERS["Authorization"] = f"Bearer {GITHUB_TOKEN}"


def _gh_get(path: str, params: dict | None = None) -> dict | list:
    url = f"https://api.github.com/{path.lstrip('/')}"
    resp = requests.get(url, headers=_GH_HEADERS, params=params, timeout=30)
    if resp.status_code == 404:
        return {}
    resp.raise_for_status()
    return resp.json()


def _gh_iter_commits(owner: str, repo: str) -> Generator[dict, None, None]:
    params: dict = {"per_page": PAGE_SIZE, "page": 1}
    if GITHUB_BRANCH: params["sha"]    = GITHUB_BRANCH
    if GITHUB_SINCE:  params["since"]  = GITHUB_SINCE
    if GITHUB_UNTIL:  params["until"]  = GITHUB_UNTIL
    while True:
        data = _gh_get(f"repos/{owner}/{repo}/commits", params)
        if not isinstance(data, list) or not data:
            break
        yield from data
        if len(data) < PAGE_SIZE:
            break
        params["page"] += 1
        time.sleep(GITHUB_SLEEP)


def _gh_commit_detail(owner: str, repo: str, sha: str) -> dict:
    time.sleep(GITHUB_SLEEP)
    return _gh_get(f"repos/{owner}/{repo}/commits/{sha}")


def _gh_pr_for_commit(owner: str, repo: str, sha: str) -> str:
    time.sleep(GITHUB_SLEEP)
    data = _gh_get(f"repos/{owner}/{repo}/commits/{sha}/pulls")
    if isinstance(data, list) and data:
        return str(data[0].get("number", ""))
    return ""


def _gh_pr_reviews(owner: str, repo: str, pr_number: str) -> str:
    if not pr_number:
        return ""
    time.sleep(GITHUB_SLEEP)
    data = _gh_get(f"repos/{owner}/{repo}/pulls/{pr_number}/reviews")
    if not isinstance(data, list):
        return ""
    parts = [
        f"{(r.get('user') or {}).get('login','unknown')}:{r.get('state','')}"
        for r in data
    ]
    return "; ".join(parts)


def _load_github_cache() -> tuple[list[dict], float]:
    """Return (rows, fetched_at_timestamp) or ([], 0)."""
    if os.path.exists(GITHUB_CACHE_FILE):
        try:
            with open(GITHUB_CACHE_FILE, "r", encoding="utf-8") as fh:
                cached = json.load(fh)
            return cached.get("rows", []), cached.get("fetched_at", 0.0)
        except Exception as e:
            log.warning("Could not read GitHub cache: %s", e)
    return [], 0.0


def _save_github_cache(rows: list[dict]) -> None:
    try:
        with open(GITHUB_CACHE_FILE, "w", encoding="utf-8") as fh:
            json.dump({"fetched_at": time.time(), "rows": rows}, fh)
        log.info("GitHub cache saved (%d rows) → %s", len(rows), GITHUB_CACHE_FILE)
    except Exception as e:
        log.warning("Could not write GitHub cache: %s", e)


def fetch_github_log(owner: str, repo: str) -> list[dict]:
    """
    Fetch commit/file rows from GitHub API.
    Returns one dict per (commit × file), same shape as the old CSV.
    Schema: author, commit_sha, additions, deletions, file, message, pr_id, review
    """
    rows: list[dict] = []
    for commit in _gh_iter_commits(owner, repo):
        sha = commit["sha"]
        log.info("GH: processing commit %s …", sha[:7])
        detail = _gh_commit_detail(owner, repo, sha)
        if not detail:
            continue

        commit_info = detail.get("commit", {})
        author_name = (
            (detail.get("author") or {}).get("login")
            or (commit_info.get("author") or {}).get("name", "unknown")
        )
        message = commit_info.get("message", "").split("\n")[0]
        pr_id   = _gh_pr_for_commit(owner, repo, sha)
        review  = _gh_pr_reviews(owner, repo, pr_id) if pr_id else ""

        files = detail.get("files", [])
        if not files:
            rows.append({
                "author":     author_name,
                "commit_sha": sha,
                "additions":  detail.get("stats", {}).get("additions", 0),
                "deletions":  detail.get("stats", {}).get("deletions", 0),
                "file":       "",
                "message":    message,
                "pr_id":      pr_id,
                "review":     review,
            })
        else:
            for f in files:
                rows.append({
                    "author":     author_name,
                    "commit_sha": sha,
                    "additions":  f.get("additions", 0),
                    "deletions":  f.get("deletions", 0),
                    "file":       f.get("filename", ""),
                    "message":    message,
                    "pr_id":      pr_id,
                    "review":     review,
                })
    return rows


def get_github_data() -> list[dict]:
    """
    Return GitHub rows, using disk cache when fresh.
    Cache TTL is controlled by GITHUB_CACHE_TTL_HOURS (default 6 h).
    """
    rows, fetched_at = _load_github_cache()
    age = time.time() - fetched_at
    if rows and age < GITHUB_CACHE_TTL:
        log.info("Using cached GitHub data (age: %.0fs / TTL: %ds)", age, GITHUB_CACHE_TTL)
        return rows

    if not GITHUB_OWNER or not GITHUB_REPO:
        log.warning("GITHUB_OWNER / GITHUB_REPO not set, skipping GitHub fetch")
        return rows  # return stale cache rather than nothing, if available

    log.info("Fetching fresh GitHub data (cache age: %.0fs) …", age)
    rows = fetch_github_log(GITHUB_OWNER, GITHUB_REPO)
    _save_github_cache(rows)
    return rows


# ══════════════════════════════════════════════════════════════════════════════
#  FORCE-REFRESH ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/refresh/github")
async def refresh_github():
    """Delete the GitHub disk cache so the next /api/data re-fetches from the API."""
    if os.path.exists(GITHUB_CACHE_FILE):
        os.remove(GITHUB_CACHE_FILE)
        return {"status": "cache_cleared", "message": "GitHub cache cleared. Next request will re-fetch."}
    return {"status": "no_cache", "message": "No cache file found."}


@app.post("/api/refresh/jira")
async def refresh_jira():
    """Invalidate the in-memory Jira cache."""
    _jira_cache["data"] = None
    _jira_cache["ts"]   = 0.0
    return {"status": "cache_cleared", "message": "Jira cache invalidated. Next request will re-fetch."}


# ══════════════════════════════════════════════════════════════════════════════
#  NAME NORMALISATION
# ══════════════════════════════════════════════════════════════════════════════

def normalize_name(name: str) -> str:
    if not name:
        return "Unknown"
    lower = name.lower()
    if "hirthik"     in lower:                         return "Hirthik"
    if "anandhappriya" in lower or "anandha" in lower: return "Anandhappriya"
    if "laptop"      in lower:                         return "LapTop"
    if "rohan"       in lower:                         return "Rohan Kumar"
    if "john"        in lower:                         return "John Smith"
    if "priya"       in lower:                         return "Priya Sharma"
    if "alice"       in lower:                         return "Alice Dev"
    return name


def get_email(name: str) -> str:
    return f"{(name or 'unknown').lower().replace(' ', '.')}@example.com"


# ══════════════════════════════════════════════════════════════════════════════
#  METRICS CALCULATION  (same logic as before, but from live data)
# ══════════════════════════════════════════════════════════════════════════════

def calculate_metrics():
    try:
        dev_data: dict[str, dict] = {}
        file_data: dict[str, dict] = {}
        tickets: list[dict] = []
        deps: list[dict] = []
        issue_to_assignee: dict[str, str] = {}

        # ── 1. Jira Issues ──────────────────────────────────────────────────
        jira_issues, jira_comments = get_jira_data()

        for row in jira_issues:
            assignee = normalize_name(row["assignee"])
            issue_to_assignee[row["key"]] = assignee
            if assignee not in dev_data:
                dev_data[assignee] = {
                    "name": assignee, "avatar": assignee[:2].upper(), "role": "Engineer",
                    "email": get_email(assignee),
                    "commits": 0, "additions": 0, "files": set(), "sprints": [0, 0, 0, 0],
                    "jira": {"total": 0, "done": 0, "inprog": 0, "todo": 0, "comments": 0},
                    "flow": {"score": 0}, "psych": {"score": 0, "collab": 0, "directive": 0, "total": 0},
                    "skills": ["Dev"],
                }
            d = dev_data[assignee]
            d["jira"]["total"] += 1
            if   row["status"] == "Done":        d["jira"]["done"]   += 1
            elif row["status"] == "In Progress": d["jira"]["inprog"] += 1
            else:                                d["jira"]["todo"]   += 1

            tickets.append({
                "key":            row["key"],
                "title":          row["title"],
                "status":         row["status"],
                "assignee":       assignee,
                "assignee_email": d["email"],
                "risk":           math.floor(os.urandom(1)[0] / 256 * 90),
            })

        # ── 2. GitHub Commits ────────────────────────────────────────────────
        github_rows = get_github_data()

        for row in github_rows:
            author    = normalize_name(row["author"])
            file_name = row["file"]
            additions = int(row["additions"]) if row.get("additions") else 0

            if author not in dev_data:
                dev_data[author] = {
                    "name": author, "avatar": author[:2].upper(), "role": "Engineer",
                    "email": get_email(author),
                    "commits": 0, "additions": 0, "files": set(), "sprints": [0, 0, 0, 0],
                    "jira": {"total": 0, "done": 0, "inprog": 0, "todo": 0, "comments": 0},
                    "flow": {"score": 0}, "psych": {"score": 0, "collab": 0, "directive": 0, "total": 0},
                    "skills": ["Dev"],
                }
            d = dev_data[author]
            d["commits"]   += 1
            d["additions"] += additions
            d["files"].add(file_name)
            d["sprints"][math.floor(os.urandom(1)[0] / 256 * 4)] += 1

            if file_name not in file_data:
                file_data[file_name] = {
                    "file": file_name, "total": 0, "bus": 0,
                    "entropy": 0, "top_owner": "", "top_pct": 0, "devs": {}
                }
            file_data[file_name]["total"] += 1
            file_data[file_name]["devs"][author] = file_data[file_name]["devs"].get(author, 0) + 1

        # ── 3. Jira Comments ─────────────────────────────────────────────────
        for row in jira_comments:
            author         = normalize_name(row["author"])
            target_issue   = row["issue_key"]
            target_assignee = issue_to_assignee.get(target_issue)
            comment_text   = row["comment"].lower()

            if author in dev_data:
                d = dev_data[author]
                d["jira"]["comments"] += 1
                d["psych"]["total"]   += 1
                if any(w in comment_text for w in ["help", "verify", "add", "implement"]):
                    d["psych"]["collab"] += 1
                if any(w in comment_text for w in ["must", "fix", "broken"]):
                    d["psych"]["directive"] += 1

            if target_assignee and author != target_assignee:
                edge = next((e for e in deps if e["from"] == author and e["to"] == target_assignee), None)
                if not edge:
                    edge = {"from": author, "to": target_assignee, "weight": 0, "label": ""}
                    deps.append(edge)
                edge["weight"] += 1
                edge["label"]   = f"{edge['weight']} interactions"

        # ── 4. Final dev calculations ────────────────────────────────────────
        devs_list: list[dict] = []
        for name, d in dev_data.items():
            num_files = len(d["files"])
            d["files"] = num_files

            # Psych safety
            psych_collab_pct = (
                d["psych"]["collab"] / d["psych"]["total"] * 100
            ) if d["psych"]["total"] > 0 else 0
            d["psych"]["score"] = (
                round((d["psych"]["collab"] / d["psych"]["total"]) * 50 + 20)
                if d["psych"]["total"] > 0 else 50
            )
            d["psych"]["breakdown"] = [
                {"label": "Collaborative Ratio", "value": f"{psych_collab_pct:.1f}%",
                 "weight": "50%", "reason": "Measures positive interactions like help/verify/implement vs total comments."},
                {"label": "Base Safety", "value": "20 pts",
                 "weight": "20%", "reason": "Baseline psychological safety score for active team members."},
            ]

            # Flow
            d["flow"]["score"] = min(100, round(50 + (d["commits"] / 10)))
            d["flow"]["label"] = "Deep Focus" if d["flow"]["score"] >= 75 else "Moderate Focus"
            d["flow"]["avg_lines"]        = d["additions"] / d["commits"] if d["commits"] > 0 else 0
            d["flow"]["files_per_commit"] = num_files / d["commits"]      if d["commits"] > 0 else 0
            d["flow"]["msg_quality"]      = 85
            d["flow"]["breakdown"] = [
                {"label": "Commit Frequency", "value": f"{d['commits']} commits",
                 "weight": "50%", "reason": "Higher frequency suggests continuous integration and progress."},
                {"label": "Base Flow", "value": "50 pts",
                 "weight": "50%", "reason": "Starting point for flow detection metrics."},
            ]

            j  = d["jira"]
            dc = min(d["commits"]   / 84   * 30, 30)
            da = min(d["additions"] / 2375 * 25, 25)
            dt = min((j["done"] + j["inprog"] * 0.5) / j["total"] * 20, 20) if j["total"] > 0 else 0
            dco = min(j["comments"] / 70 * 15, 15)
            df  = min(num_files / 20 * 10, 10)
            d["contribution"] = round(dc + da + dt + dco + df)
            d["contribution_breakdown"] = [
                {"label": "Commit Volume",  "value": f"{d['commits']} commits",  "points": round(dc),  "max": 30,
                 "reason": "Weighted by total team max (84 commits). Measures output frequency."},
                {"label": "Code Impact",    "value": f"{d['additions']} lines",   "points": round(da),  "max": 25,
                 "reason": "Weighted by total team max (2375 lines). Measures volume of change."},
                {"label": "Task Progress",  "value": f"{j['done']}/{j['total']} done", "points": round(dt), "max": 20,
                 "reason": "Measures Jira completion rate (Done + 0.5*InProgress)."},
                {"label": "Communication",  "value": f"{j['comments']} comments", "points": round(dco), "max": 15,
                 "reason": "Measures active participation in issue discussions."},
                {"label": "Knowledge Area", "value": f"{num_files} files",        "points": round(df),  "max": 10,
                 "reason": "Measures breadth of codebase ownership."},
            ]

            # Burnout
            burnout         = 0
            burnout_reasons = []
            cpd = d["commits"] / 30
            if   cpd > 2.5: burnout += 30; burnout_reasons.append({"label": "High Velocity",     "points": 30, "reason": "Commits per day > 2.5 indicates potential over-exertion."})
            elif cpd > 1.5: burnout += 20; burnout_reasons.append({"label": "Moderate Velocity", "points": 20, "reason": "Commits per day > 1.5 is elevated."})
            elif cpd > 0.8: burnout += 10; burnout_reasons.append({"label": "Stable Velocity",   "points": 10, "reason": "Commits per day > 0.8 is healthy but active."})

            ch = d["additions"]
            if   ch > 2000: burnout += 28; burnout_reasons.append({"label": "Massive Churn",  "points": 28, "reason": "Over 2000 lines added in a single period."})
            elif ch > 1000: burnout += 18; burnout_reasons.append({"label": "High Churn",     "points": 18, "reason": "Over 1000 lines added."})
            elif ch >  400: burnout +=  9; burnout_reasons.append({"label": "Moderate Churn", "points":  9, "reason": "Over 400 lines added."})

            op = j["todo"] + j["inprog"]
            if   op > 18: burnout += 28; burnout_reasons.append({"label": "Backlog Overload", "points": 28, "reason": "Over 18 open tasks assigned."})
            elif op > 12: burnout += 18; burnout_reasons.append({"label": "Heavy Backlog",    "points": 18, "reason": "Over 12 open tasks assigned."})
            elif op >  6: burnout +=  9; burnout_reasons.append({"label": "Active Backlog",   "points":  9, "reason": "Over 6 open tasks assigned."})

            if   j["comments"] > 55: burnout += 14; burnout_reasons.append({"label": "Discussion Fatigue", "points": 14, "reason": "Extremely high comment volume (>55)."})
            elif j["comments"] > 25: burnout +=  8; burnout_reasons.append({"label": "Active Discussion",  "points":  8, "reason": "Elevated comment volume (>25)."})

            d["burnout"]           = min(burnout, 100)
            d["burnout_breakdown"] = burnout_reasons
            d["risk"]              = ("critical" if d["burnout"] >= 80 else
                                       "high"    if d["burnout"] >= 60 else
                                       "medium"  if d["burnout"] >= 35 else "low")
            d["pattern"]     = ("Sprint Sprinter" if d["commits"] > 70 else
                                  "Collaborator"   if j["comments"] > 50 else
                                  "Deep Coder"     if d["additions"] / max(d["commits"], 1) > 20 else
                                  "Specialist")
            d["open_tasks"]  = j["todo"] + j["inprog"]
            d["burnout_traj"] = {"s5": d["burnout"] + 2, "s6": d["burnout"] + 5, "slope": 2.1}
            d["dims"] = {
                "commits":  round(dc  / 30  * 100),
                "code":     round(da  / 25  * 100),
                "tasks":    round(dt  / 20  * 100),
                "collab":   round(dco / 15  * 100),
                "coverage": round(df  / 10  * 100),
            }
            devs_list.append(d)

        # ── 5. File risk ─────────────────────────────────────────────────────
        files_list: list[dict] = []
        for file_name, f in file_data.items():
            dev_counts   = list(f["devs"].values())
            total_commits = sum(dev_counts)
            entropy = 0.0
            if total_commits > 0:
                for count in dev_counts:
                    p = count / total_commits
                    if p > 0:
                        entropy -= p * math.log2(p)
            f["entropy"] = entropy
            f["bus"]     = len([c for c in dev_counts if total_commits > 0 and (c / total_commits) > 0.2])
            if f["devs"]:
                top_owner   = max(f["devs"], key=f["devs"].get)
                f["top_owner"]   = top_owner
                f["top_pct"]     = round((f["devs"][top_owner] / total_commits) * 100) if total_commits > 0 else 0
                f["top_burnout"] = dev_data[top_owner]["burnout"] if top_owner in dev_data else 0
                f["risk"]        = round(
                    (f["entropy"] / 2.5 * 40) +
                    ((5 - f["bus"]) / 4  * 30) +
                    (f["top_burnout"] / 100 * 30)
                )
            else:
                f["risk"] = 0
            files_list.append(f)

        return {"devs": devs_list, "fileData": files_list, "deps": deps, "tickets": tickets}

    except Exception as e:
        log.error("Error calculating metrics: %s", e, exc_info=True)
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/data")
async def get_data():
    return calculate_metrics()


@app.get("/api/reasoning/{dev_name}")
async def get_reasoning(dev_name: str):
    metrics = calculate_metrics()
    if not metrics:
        return {"error": "Could not calculate metrics"}
    dev = next((d for d in metrics["devs"] if d["name"] == dev_name), None)
    if not dev:
        return {"error": "Developer not found"}

    cache_key = f"{dev_name}_{dev['commits']}_{dev['additions']}_{dev['burnout']}"
    if cache_key in reasoning_cache:
        return {"reasoning": reasoning_cache[cache_key]}

    prompt = f"""
Analyze the following developer metrics and provide a concise, professional assessment (3-4 sentences).
Developer: {dev['name']}
Role: {dev['role']}
Commits: {dev['commits']}
Lines Added: {dev['additions']}
Contribution Score: {dev['contribution']}/100
Burnout Index: {dev['burnout']}%
Flow State: {dev['flow']['label']} ({dev['flow']['score']} score)
Psychological Safety: {dev['psych']['score']}/100
Jira Tasks: {dev['jira']['total']} total, {dev['open_tasks']} open.

Highlight strengths and potential risks (like burnout or fragmentation). Use a supportive, data-driven tone.
"""
    try:
        response = ollama.chat(model="llama3.2", messages=[
            {"role": "system", "content": "You are a senior engineering manager providing performance insights."},
            {"role": "user",   "content": prompt},
        ])
        reasoning = response["message"]["content"]
        reasoning_cache[cache_key] = reasoning
        return {"reasoning": reasoning}
    except Exception as e:
        log.error("Ollama error: %s", e)
        return {"error": "AI reasoning currently unavailable. Ensure Ollama is running with llama3.2."}


@app.get("/api/rebalance/analyze")
async def analyze_rebalance():
    metrics = calculate_metrics()
    if not metrics:
        return {"error": "Could not calculate metrics"}

    overloaded = [d for d in metrics["devs"] if d["burnout"] >= 65]
    available  = [d for d in metrics["devs"] if d["burnout"] <  35]

    if not overloaded:
        return {"suggestions": [], "message": "No developers are currently overloaded (Burnout > 65)."}
    if not available:
        return {"suggestions": [], "message": "No developers are currently available to take on more work (Burnout < 35)."}

    tickets_to_reassign = [
        t for t in metrics["tickets"]
        if t["status"] != "Done" and t["assignee"] in [d["name"] for d in overloaded]
    ]

    prompt = f"""
Suggest a rebalancing plan for these Jira tickets.
Tickets to reassign: {json.dumps(tickets_to_reassign[:10])}

Available developers to receive tickets:
{json.dumps([{{'name': d['name'], 'email': d['email'], 'burnout': d['burnout'], 'open_tasks': d['open_tasks']}} for d in available])}

Return a JSON list only. Format:
[
  {{"issue_key": "DEV-1", "assignee_email": "EMAIL_OF_FREE_DEVELOPER", "reason": "Short reason why this dev is a good fit", "current_assignee": "Name"}}
]
Ensure the JSON is valid and only includes the list. Don't add conversational filler.
"""
    try:
        response = ollama.chat(model="llama3.2", messages=[
            {"role": "system", "content": "You are an AI Resource Planning Agent. You must output valid JSON lists."},
            {"role": "user",   "content": prompt},
        ])
        content = response["message"]["content"]
        start = content.find("[")
        end   = content.rfind("]") + 1
        suggestions = json.loads(content[start:end])
        return {"suggestions": suggestions}
    except Exception as e:
        log.error("Ollama rebalance error: %s", e)
        return {"error": f"AI analysis failed: {str(e)}"}


@app.post("/api/rebalance/execute")
async def execute_rebalance(reassignments: List[Dict[str, str]]):
    results = []
    async with httpx.AsyncClient() as client:
        for item in reassignments:
            payload = {"issue_key": item["issue_key"], "assignee_email": item["assignee_email"]}
            try:
                response = await client.post("http://localhost:8000/reassign", json=payload, timeout=5.0)
                results.append({
                    "issue_key": item["issue_key"],
                    "status": "success" if response.status_code < 400 else "failed",
                    "code": response.status_code,
                })
            except Exception as e:
                results.append({"issue_key": item["issue_key"], "status": "error", "error": str(e)})
    return {"results": results}


@app.get("/api/dna/{dev_name}")
async def get_dna(dev_name: str):
    metrics = calculate_metrics()
    if not metrics:
        return {"error": "Could not calculate metrics"}
    dev = next((d for d in metrics["devs"] if d["name"] == dev_name), None)
    if not dev:
        return {"error": "Developer not found"}

    cache_key = f"{dev_name}_{dev['commits']}_{dev['additions']}_{dev['burnout']}"
    if cache_key in dna_cache:
        return dna_cache[cache_key]

    try:
        c        = max(dev["commits"], 1)
        a        = dev["additions"]
        f_score  = dev["flow"]["score"]
        p_score  = dev["psych"]["score"]
        burnout  = dev["burnout"]
        j_total  = max(dev["jira"]["total"], 1)
        j_comments = dev["jira"]["comments"]
        avg_lines  = a / c

        logic_complexity  = min(100, max(10, round((avg_lines / 30 * 50) + (f_score / 100 * 50))))
        refactor_tendency = min(100, max(10, round(100 - (avg_lines / 40 * 100))))
        if c < 5: refactor_tendency = 30
        bug_injection_rate = min(100, max(5,  round((burnout / 100 * 60) + (min(a, 2000) / 2000 * 40))))
        review_strictness  = min(100, max(15, round((j_comments / j_total) * 30 + 40)))
        risk_tolerance     = min(100, max(20, round((avg_lines / 50 * 50) + ((100 - p_score) / 100 * 50))))

        files_touched = dev.get("files", 10)
        if isinstance(files_touched, set): files_touched = len(files_touched)
        innovation_index = min(100, max(10, round(
            (p_score / 100 * 40) + (min(files_touched, 20) / 20 * 40) + (f_score / 100 * 20)
        )))

        traits = {
            "Logic Complexity":  logic_complexity,
            "Refactor Tendency": refactor_tendency,
            "Review Strictness": review_strictness,
            "Risk Tolerance":    risk_tolerance,
            "Innovation Index":  innovation_index,
        }
        dominant = max(traits, key=traits.get)
        summaries = {
            "Logic Complexity":  "Deep focus engineer resolving highly complex logic with structured deep-work sessions.",
            "Refactor Tendency": "Meticulous optimizer who frequently refactors and polishes existing codebases iteratively.",
            "Review Strictness": "Quality gatekeeper with strong communication and high standards in peer reviews.",
            "Risk Tolerance":    "Fast-moving experimentalist willing to take bold bets and push large features rapidly.",
            "Innovation Index":  "Highly collaborative pioneer exploring broad areas of the codebase with creative solutions.",
        }

        dna_res = {
            "logic_complexity":   int(logic_complexity),
            "refactor_tendency":  int(refactor_tendency),
            "bug_injection_rate": int(bug_injection_rate),
            "review_strictness":  int(review_strictness),
            "risk_tolerance":     int(risk_tolerance),
            "innovation_index":   int(innovation_index),
            "behavioral_summary": summaries[dominant],
        }
        dna_cache[cache_key] = dna_res
        return dna_res
    except Exception as e:
        log.error("DNA calculation error: %s", e)
        return {"error": f"Math-based DNA analysis failed: {str(e)}"}


@app.get("/api/slack")
async def get_slack():
    """Return cached Slack metrics (channels, per-dev stats, recent messages)."""
    return get_slack_data()


@app.post("/api/refresh/slack")
async def refresh_slack():
    """Invalidate the in-memory Slack cache."""
    _slack_cache["data"] = None
    _slack_cache["ts"]   = 0.0
    return {"status": "cache_cleared", "message": "Slack cache invalidated. Next request will re-fetch."}


@app.get("/api/cache/status")
async def cache_status():
    """Show current cache ages so you know when data was last fetched."""
    _, gh_fetched_at = _load_github_cache()
    gh_age  = time.time() - gh_fetched_at if gh_fetched_at else None
    jira_age = time.time() - _jira_cache["ts"] if _jira_cache["ts"] else None
    slack_age = time.time() - _slack_cache["ts"] if _slack_cache["ts"] else None
    return {
        "github": {
            "cache_file":   GITHUB_CACHE_FILE,
            "ttl_seconds":  GITHUB_CACHE_TTL,
            "age_seconds":  round(gh_age)  if gh_age  is not None else None,
            "is_fresh":     gh_age  is not None and gh_age  < GITHUB_CACHE_TTL,
        },
        "jira": {
            "ttl_seconds":  JIRA_CACHE_TTL,
            "age_seconds":  round(jira_age) if jira_age is not None else None,
            "is_fresh":     jira_age is not None and jira_age < JIRA_CACHE_TTL,
        },
        "slack": {
            "ttl_seconds":  SLACK_CACHE_TTL,
            "age_seconds":  round(slack_age) if slack_age is not None else None,
            "is_fresh":     slack_age is not None and slack_age < SLACK_CACHE_TTL,
        },
    }


@app.get("/api/events")
async def events(request: Request):
    """SSE stream — pushes fresh metrics on connect, then every JIRA_CACHE_TTL seconds."""
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            data = calculate_metrics()
            if data:
                # Attach live Slack data to the SSE payload
                data["slack"] = get_slack_data()
                yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(JIRA_CACHE_TTL)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
