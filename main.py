import os
import csv
import json
import asyncio
import math
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from watchfiles import awatch
import ollama
import httpx

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "Data")
GITHUB_CSV = os.path.join(DATA_DIR, "github_raw_dataset.csv")
JIRA_ISSUES_CSV = os.path.join(DATA_DIR, "jira_issues.csv")
JIRA_COMMENTS_CSV = os.path.join(DATA_DIR, "jira_comments.csv")

# Simple in-memory cache for AI reasoning
reasoning_cache = {}

def normalize_name(name: str) -> str:
    if not name: return "Unknown"
    lower = name.lower()
    if 'hirthik' in lower: return "Hirthik"
    if 'anandhappriya' in lower or 'anandha' in lower: return "Anandhappriya"
    if 'laptop' in lower: return "LapTop"
    if 'rohan' in lower: return "Rohan Kumar"
    if 'john' in lower: return "John Smith"
    if 'priya' in lower: return "Priya Sharma"
    if 'alice' in lower: return "Alice Dev"
    return name

def get_email(name: str) -> str:
    return f"{name.lower().replace(' ', '.') or 'unknown'}@example.com"

def calculate_metrics():
    try:
        dev_data = {}
        file_data = {}
        tickets = []
        deps = []
        issue_to_assignee = {}

        # 1. Process Jira Issues
        if os.path.exists(JIRA_ISSUES_CSV):
            with open(JIRA_ISSUES_CSV, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    assignee = normalize_name(row['assignee'])
                    issue_to_assignee[row['key']] = assignee
                    if assignee not in dev_data:
                        dev_data[assignee] = {
                            "name": assignee, "avatar": assignee[:2].upper(), "role": "Engineer",
                            "email": get_email(assignee),
                            "commits": 0, "additions": 0, "files": set(), "sprints": [0,0,0,0],
                            "jira": {"total": 0, "done": 0, "inprog": 0, "todo": 0, "comments": 0},
                            "flow": {"score": 0}, "psych": {"score": 0, "collab": 0, "directive": 0, "total": 0},
                            "skills": ["Dev"]
                        }
                    
                    d = dev_data[assignee]
                    d["jira"]["total"] += 1
                    if row['status'] == 'Done': d["jira"]["done"] += 1
                    elif row['status'] == 'In Progress': d["jira"]["inprog"] += 1
                    else: d["jira"]["todo"] += 1

                    tickets.append({
                        "key": row['key'], "title": row['title'], "status": row['status'],
                        "assignee": assignee, "assignee_email": d["email"],
                        "risk": math.floor(os.urandom(1)[0] / 256 * 90)
                    })

        # 2. Process Github Data
        if os.path.exists(GITHUB_CSV):
            with open(GITHUB_CSV, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    author = normalize_name(row['author'])
                    file = row['file']
                    additions = int(row['additions']) if row.get('additions') else 0

                    if author not in dev_data:
                        dev_data[author] = {
                            "name": author, "avatar": author[:2].upper(), "role": "Engineer",
                            "email": get_email(author),
                            "commits": 0, "additions": 0, "files": set(), "sprints": [0,0,0,0],
                            "jira": {"total": 0, "done": 0, "inprog": 0, "todo": 0, "comments": 0},
                            "flow": {"score": 0}, "psych": {"score": 0, "collab": 0, "directive": 0, "total": 0},
                            "skills": ["Dev"]
                        }
                    
                    d = dev_data[author]
                    d["commits"] += 1
                    d["additions"] += additions
                    d["files"].add(file)
                    d["sprints"][math.floor(os.urandom(1)[0] / 256 * 4)] += 1

                    if file not in file_data:
                        file_data[file] = {"file": file, "total": 0, "bus": 0, "entropy": 0, "top_owner": "", "top_pct": 0, "devs": {}}
                    file_data[file]["total"] += 1
                    file_data[file]["devs"][author] = file_data[file]["devs"].get(author, 0) + 1

        # 3. Process Jira Comments
        if os.path.exists(JIRA_COMMENTS_CSV):
            with open(JIRA_COMMENTS_CSV, mode='r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    author = normalize_name(row['author'])
                    target_issue = row['issue_key']
                    target_assignee = issue_to_assignee.get(target_issue)
                    comment_text = row['comment'].lower()

                    if author in dev_data:
                        d = dev_data[author]
                        d["jira"]["comments"] += 1
                        d["psych"]["total"] += 1
                        is_collab = any(word in comment_text for word in ['help', 'verify', 'add', 'implement'])
                        is_directive = any(word in comment_text for word in ['must', 'fix', 'broken'])
                        if is_collab: d["psych"]["collab"] += 1
                        if is_directive: d["psych"]["directive"] += 1

                    if target_assignee and author != target_assignee:
                        edge = next((d for d in deps if d['from'] == author and d['to'] == target_assignee), None)
                        if not edge:
                            edge = {"from": author, "to": target_assignee, "weight": 0, "label": ""}
                            deps.append(edge)
                        edge["weight"] += 1
                        edge["label"] = f"{edge['weight']} interactions"

        # Final calculations for Devs
        devs_list = []
        for name, d in dev_data.items():
            num_files = len(d["files"])
            d["files"] = num_files
            
            # Psych Safety Breakdown
            psych_collab_pct = (d["psych"]["collab"] / d["psych"]["total"] * 100) if d["psych"]["total"] > 0 else 0
            d["psych"]["score"] = round((d["psych"]["collab"] / d["psych"]["total"]) * 50 + 20) if d["psych"]["total"] > 0 else 50
            d["psych"]["breakdown"] = [
                {"label": "Collaborative Ratio", "value": f"{psych_collab_pct:.1f}%", "weight": "50%", "reason": "Measures positive interactions like help/verify/implement vs total comments."},
                {"label": "Base Safety", "value": "20 pts", "weight": "20%", "reason": "Baseline psychological safety score for active team members."}
            ]

            # Flow Breakdown
            d["flow"]["score"] = min(100, round(50 + (d["commits"] / 10)))
            d["flow"]["label"] = "Deep Focus" if d["flow"]["score"] >= 75 else "Moderate Focus"
            d["flow"]["avg_lines"] = d["additions"] / d["commits"] if d["commits"] > 0 else 0
            d["flow"]["files_per_commit"] = num_files / d["commits"] if d["commits"] > 0 else 0
            d["flow"]["msg_quality"] = 85
            d["flow"]["breakdown"] = [
                {"label": "Commit Frequency", "value": f"{d['commits']} commits", "weight": "50%", "reason": "Higher frequency suggests continuous integration and progress."},
                {"label": "Base Flow", "value": "50 pts", "weight": "50%", "reason": "Starting point for flow detection metrics."}
            ]

            j = d["jira"]
            dc = min(d["commits"] / 84 * 30, 30)
            da = min(d["additions"] / 2375 * 25, 25)
            dt = min((j["done"] + j["inprog"] * 0.5) / j["total"] * 20, 20) if j["total"] > 0 else 0
            dco = min(j["comments"] / 70 * 15, 15)
            df = min(num_files / 20 * 10, 10)
            d["contribution"] = round(dc + da + dt + dco + df)
            d["contribution_breakdown"] = [
                {"label": "Commit Volume", "value": f"{d['commits']} commits", "points": round(dc), "max": 30, "reason": "Weighted by total team max (84 commits). Measures output frequency."},
                {"label": "Code Impact", "value": f"{d['additions']} lines", "points": round(da), "max": 25, "reason": "Weighted by total team max (2375 lines). Measures volume of change."},
                {"label": "Task Progress", "value": f"{j['done']}/{j['total']} done", "points": round(dt), "max": 20, "reason": "Measures Jira completion rate (Done + 0.5*InProgress)."},
                {"label": "Communication", "value": f"{j['comments']} comments", "points": round(dco), "max": 15, "reason": "Measures active participation in issue discussions."},
                {"label": "Knowledge Area", "value": f"{num_files} files", "points": round(df), "max": 10, "reason": "Measures breadth of codebase ownership."}
            ]

            burnout = 0
            cpd = d["commits"] / 30
            burnout_reasons = []
            if cpd > 2.5: 
                burnout += 30
                burnout_reasons.append({"label": "High Velocity", "points": 30, "reason": "Commits per day > 2.5 indicates potential over-exertion."})
            elif cpd > 1.5: 
                burnout += 20
                burnout_reasons.append({"label": "Moderate Velocity", "points": 20, "reason": "Commits per day > 1.5 is elevated."})
            elif cpd > 0.8: 
                burnout += 10
                burnout_reasons.append({"label": "Stable Velocity", "points": 10, "reason": "Commits per day > 0.8 is healthy but active."})
            
            ch = d["additions"]
            if ch > 2000: 
                burnout += 28
                burnout_reasons.append({"label": "Massive Churn", "points": 28, "reason": "Over 2000 lines added in a single period."})
            elif ch > 1000: 
                burnout += 18
                burnout_reasons.append({"label": "High Churn", "points": 18, "reason": "Over 1000 lines added."})
            elif ch > 400: 
                burnout += 9
                burnout_reasons.append({"label": "Moderate Churn", "points": 9, "reason": "Over 400 lines added."})
            
            op = j["todo"] + j["inprog"]
            if op > 18: 
                burnout += 28
                burnout_reasons.append({"label": "Backlog Overload", "points": 28, "reason": "Over 18 open tasks assigned."})
            elif op > 12: 
                burnout += 18
                burnout_reasons.append({"label": "Heavy Backlog", "points": 18, "reason": "Over 12 open tasks assigned."})
            elif op > 6: 
                burnout += 9
                burnout_reasons.append({"label": "Active Backlog", "points": 9, "reason": "Over 6 open tasks assigned."})
            
            if j["comments"] > 55: 
                burnout += 14
                burnout_reasons.append({"label": "Discussion Fatigue", "points": 14, "reason": "Extremely high comment volume (>55)."})
            elif j["comments"] > 25: 
                burnout += 8
                burnout_reasons.append({"label": "Active Discussion", "points": 8, "reason": "Elevated comment volume (>25)."})
            
            d["burnout"] = min(burnout, 100)
            d["burnout_breakdown"] = burnout_reasons
            d["risk"] = "critical" if d["burnout"] >= 80 else "high" if d["burnout"] >= 60 else "medium" if d["burnout"] >= 35 else "low"
            d["pattern"] = "Sprint Sprinter" if d["commits"] > 70 else "Collaborator" if j["comments"] > 50 else "Deep Coder" if d["additions"] / max(d["commits"], 1) > 20 else "Specialist"
            d["open_tasks"] = j["todo"] + j["inprog"]
            d["burnout_traj"] = {"s5": d["burnout"] + 2, "s6": d["burnout"] + 5, "slope": 2.1}
            d["dims"] = {
                "commits": round(dc / 30 * 100), "code": round(da / 25 * 100),
                "tasks": round(dt / 20 * 100), "collab": round(dco / 15 * 100), "coverage": round(df / 10 * 100)
            }
            devs_list.append(d)

        # Final calculations for Files
        files_list = []
        for file, f in file_data.items():
            dev_counts = list(f["devs"].values())
            total_commits = sum(dev_counts)
            entropy = 0
            if total_commits > 0:
                for count in dev_counts:
                    p = count / total_commits
                    if p > 0:
                        entropy -= p * math.log2(p)
            f["entropy"] = entropy
            f["bus"] = len([c for c in dev_counts if total_commits > 0 and (c / total_commits) > 0.2])
            
            if f["devs"]:
                top_owner = max(f["devs"], key=f["devs"].get)
                f["top_owner"] = top_owner
                f["top_pct"] = round((f["devs"][top_owner] / total_commits) * 100) if total_commits > 0 else 0
                f["top_burnout"] = dev_data[top_owner]["burnout"] if top_owner in dev_data else 0
                f["risk"] = round((f["entropy"] / 2.5 * 40) + ((5 - f["bus"]) / 4 * 30) + (f["top_burnout"] / 100 * 30))
            else:
                f["risk"] = 0
            files_list.append(f)

        return {"devs": devs_list, "fileData": files_list, "deps": deps, "tickets": tickets}
    except Exception as e:
        print(f"Error parsing metrics: {e}")
        import traceback
        traceback.print_exc()
        return None

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

    # Check cache
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
        response = ollama.chat(model='llama3.2', messages=[
            {'role': 'system', 'content': 'You are a senior engineering manager providing performance insights.'},
            {'role': 'user', 'content': prompt}
        ])
        reasoning = response['message']['content']
        reasoning_cache[cache_key] = reasoning
        return {"reasoning": reasoning}
    except Exception as e:
        print(f"Ollama error: {e}")
        return {"error": "AI reasoning currently unavailable. Ensure Ollama is running with llama3.2."}

@app.get("/api/rebalance/analyze")
async def analyze_rebalance():
    metrics = calculate_metrics()
    if not metrics:
        return {"error": "Could not calculate metrics"}
    
    overloaded = [d for d in metrics["devs"] if d["burnout"] >= 65]
    available = [d for d in metrics["devs"] if d["burnout"] < 35]
    
    if not overloaded:
        return {"suggestions": [], "message": "No developers are currently overloaded (Burnout > 65)."}
    if not available:
        return {"suggestions": [], "message": "No developers are currently available to take on more work (Burnout < 35)."}

    # Collect open tickets for overloaded devs
    tickets_to_reassign = [t for t in metrics["tickets"] if t["status"] != "Done" and t["assignee"] in [d["name"] for d in overloaded]]
    
    prompt = f"""
    Suggest a rebalancing plan for these Jira tickets. 
    Tickets to reassign: {json.dumps(tickets_to_reassign[:10])}
    
    Available developers to receive tickets:
    {json.dumps([{'name': d['name'], 'email': d['email'], 'burnout': d['burnout'], 'open_tasks': d['open_tasks']} for d in available])}
    
    Return a JSON list only. Format:
    [
      {{"issue_key": "DEV-1", "assignee_email": "EMAIL_OF_FREE_DEVELOPER", "reason": "Short reason why this dev is a good fit", "current_assignee": "Name"}}
    ]
    Ensure the JSON is valid and only includes the list. Don't add conversational filler.
    """

    try:
        response = ollama.chat(model='llama3.2', messages=[
            {'role': 'system', 'content': 'You are an AI Resource Planning Agent. You must output valid JSON lists.'},
            {'role': 'user', 'content': prompt}
        ])
        content = response['message']['content']
        # Extract JSON list if the LLM added filler
        start = content.find("[")
        end = content.rfind("]") + 1
        suggestions = json.loads(content[start:end])
        return {"suggestions": suggestions}
    except Exception as e:
        print(f"Ollama rebalance error: {e}")
        return {"error": f"AI analysis failed: {str(e)}"}

@app.post("/api/rebalance/execute")
async def execute_rebalance(reassignments: List[Dict[str, str]]):
    results = []
    async with httpx.AsyncClient() as client:
        for item in reassignments:
            payload = {
                "issue_key": item["issue_key"],
                "assignee_email": item["assignee_email"]
            }
            try:
                # Assuming port 8000 is running an endpoint like /reassign or similar
                # Since the user specified localhost:8000, we'll try that.
                response = await client.post("http://localhost:8000/reassign", json=payload, timeout=5.0)
                results.append({
                    "issue_key": item["issue_key"],
                    "status": "success" if response.status_code < 400 else "failed",
                    "code": response.status_code
                })
            except Exception as e:
                results.append({
                    "issue_key": item["issue_key"],
                    "status": "error",
                    "error": str(e)
                })
    return {"results": results}

@app.get("/api/events")
async def events(request: Request):
    async def event_generator():
        # Initial data push
        data = calculate_metrics()
        yield f"data: {json.dumps(data)}\n\n"
        
        # Watch for file changes
        async for changes in awatch(DATA_DIR):
            data = calculate_metrics()
            if data:
                yield f"data: {json.dumps(data)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3001)
