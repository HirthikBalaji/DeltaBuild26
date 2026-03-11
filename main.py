import os
import csv
import json
import asyncio
import math
from typing import List, Dict, Any
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from watchfiles import awatch

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
                        "assignee": assignee, "risk": math.floor(os.urandom(1)[0] / 256 * 90)
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
            d["psych"]["score"] = round((d["psych"]["collab"] / d["psych"]["total"]) * 50 + 20) if d["psych"]["total"] > 0 else 50
            d["flow"]["score"] = min(100, round(50 + (d["commits"] / 10)))
            d["flow"]["label"] = "Deep Focus" if d["flow"]["score"] >= 75 else "Moderate Focus"
            d["flow"]["avg_lines"] = d["additions"] / d["commits"] if d["commits"] > 0 else 0
            d["flow"]["files_per_commit"] = num_files / d["commits"] if d["commits"] > 0 else 0
            d["flow"]["msg_quality"] = 85

            j = d["jira"]
            dc = min(d["commits"] / 84 * 30, 30)
            da = min(d["additions"] / 2375 * 25, 25)
            dt = min((j["done"] + j["inprog"] * 0.5) / j["total"] * 20, 20) if j["total"] > 0 else 0
            dco = min(j["comments"] / 70 * 15, 15)
            df = min(num_files / 20 * 10, 10)
            d["contribution"] = round(dc + da + dt + dco + df)

            burnout = 0
            cpd = d["commits"] / 30
            if cpd > 2.5: burnout += 30
            elif cpd > 1.5: burnout += 20
            elif cpd > 0.8: burnout += 10
            
            ch = d["additions"]
            if ch > 2000: burnout += 28
            elif ch > 1000: burnout += 18
            elif ch > 400: burnout += 9
            
            op = j["todo"] + j["inprog"]
            if op > 18: burnout += 28
            elif op > 12: burnout += 18
            elif op > 6: burnout += 9
            
            if j["comments"] > 55: burnout += 14
            elif j["comments"] > 25: burnout += 8
            
            d["burnout"] = min(burnout, 100)
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
