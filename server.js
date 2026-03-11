const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, 'Data');

app.use(cors());

// --- NAME MAPPING ---
function normalizeName(name) {
  if (!name) return "Unknown";
  const lower = name.toLowerCase();
  if (lower.includes('hirthik')) return "Hirthik";
  if (lower.includes('anandhappriya') || lower.includes('anandha')) return "Anandhappriya";
  if (lower.includes('laptop')) return "LapTop";
  if (lower.includes('rohan')) return "Rohan Kumar";
  if (lower.includes('john')) return "John Smith";
  if (lower.includes('priya')) return "Priya Sharma";
  if (lower.includes('alice')) return "Alice Dev";
  return name;
}

// --- METRICS CALCULATION ---
function calculateMetrics() {
  try {
    const githubRaw = fs.readFileSync(path.join(DATA_DIR, 'github_raw_dataset.csv'), 'utf-8');
    const jiraIssuesRaw = fs.readFileSync(path.join(DATA_DIR, 'jira_issues.csv'), 'utf-8');
    const jiraCommentsRaw = fs.readFileSync(path.join(DATA_DIR, 'jira_comments.csv'), 'utf-8');

    const github = parse(githubRaw, { columns: true, skip_empty_lines: true });
    const jiraIssues = parse(jiraIssuesRaw, { columns: true, skip_empty_lines: true });
    const jiraComments = parse(jiraCommentsRaw, { columns: true, skip_empty_lines: true });

    const devData = {};
    const fileData = {};
    const tickets = [];
    const deps = [];
    const issueToAssignee = {};

    // 1. Process Jira Issues
    jiraIssues.forEach(issue => {
      const assignee = normalizeName(issue.assignee);
      issueToAssignee[issue.key] = assignee;
      if (!devData[assignee]) {
        devData[assignee] = { name: assignee, avatar: assignee.substring(0,2).toUpperCase(), role: "Engineer", commits: 0, additions: 0, files: new Set(), sprints: [0,0,0,0], jira: { total: 0, done: 0, inprog: 0, todo: 0, comments: 0 }, flow: { score: 0 }, psych: { score: 0, collab: 0, directive: 0, total: 0 }, skills: ["Dev"] };
      }
      devData[assignee].jira.total++;
      if (issue.status === 'Done') devData[assignee].jira.done++;
      else if (issue.status === 'In Progress') devData[assignee].jira.inprog++;
      else devData[assignee].jira.todo++;

      tickets.push({
        key: issue.key,
        title: issue.title,
        status: issue.status,
        assignee: assignee,
        risk: Math.floor(Math.random() * 90) // Placeholder risk logic
      });
    });

    // 2. Process Github Data
    github.forEach(commit => {
      const author = normalizeName(commit.author);
      const file = commit.file;
      const additions = parseInt(commit.additions) || 0;

      if (!devData[author]) {
        devData[author] = { name: author, avatar: author.substring(0,2).toUpperCase(), role: "Engineer", commits: 0, additions: 0, files: new Set(), sprints: [0,0,0,0], jira: { total: 0, done: 0, inprog: 0, todo: 0, comments: 0 }, flow: { score: 0 }, psych: { score: 0, collab: 0, directive: 0, total: 0 }, skills: ["Dev"] };
      }
      devData[author].commits++;
      devData[author].additions += additions;
      devData[author].files.add(file);
      // Randomly distribute to sprints for demo
      devData[author].sprints[Math.floor(Math.random()*4)] += 1;

      if (!fileData[file]) {
        fileData[file] = { file, total: 0, bus: 0, entropy: 0, top_owner: "", top_pct: 0, devs: {} };
      }
      fileData[file].total++;
      fileData[file].devs[author] = (fileData[file].devs[author] || 0) + 1;
    });

    // 3. Process Jira Comments (for Psych Safety and Dependencies)
    jiraComments.forEach(comment => {
      const author = normalizeName(comment.author);
      const targetIssue = comment.issue_key;
      const targetAssignee = issueToAssignee[targetIssue];

      if (devData[author]) {
        devData[author].jira.comments++;
        devData[author].psych.total++;
        const isCollab = comment.comment.toLowerCase().includes('help') || comment.comment.toLowerCase().includes('verify') || comment.comment.toLowerCase().includes('add') || comment.comment.toLowerCase().includes('implement');
        const isDirective = comment.comment.toLowerCase().includes('must') || comment.comment.toLowerCase().includes('fix') || comment.comment.toLowerCase().includes('broken');
        if (isCollab) devData[author].psych.collab++;
        if (isDirective) devData[author].psych.directive++;
      }

      if (targetAssignee && author !== targetAssignee) {
        let edge = deps.find(d => d.from === author && d.to === targetAssignee);
        if (!edge) {
          edge = { from: author, to: targetAssignee, weight: 0, label: "" };
          deps.push(edge);
        }
        edge.weight++;
        edge.label = `${edge.weight} interactions`;
      }
    });

    // Final calculations for Devs
    const devs = Object.values(devData).map(d => {
      d.files = d.files.size;
      d.psych.score = d.psych.total > 0 ? Math.round((d.psych.collab / d.psych.total) * 50 + 20) : 50;
      // Flow logic simplified
      d.flow.score = Math.min(100, Math.round(50 + (d.commits / 10)));
      d.flow.label = d.flow.score >= 75 ? "Deep Focus" : "Moderate Focus";
      d.flow.avg_lines = d.commits > 0 ? d.additions / d.commits : 0;
      d.flow.files_per_commit = d.commits > 0 ? d.files / d.commits : 0;
      d.flow.msg_quality = 85;

      // Contribution & Burnout (re-use logic from deviq-ultimate.jsx)
      const j = d.jira;
      const dc = Math.min(d.commits/84*30,30);
      const da = Math.min(d.additions/2375*25,25);
      const dt = j.total>0?Math.min((j.done+j.inprog*0.5)/j.total*20,20):0;
      const dco= Math.min(j.comments/70*15,15);
      const df = Math.min(d.files/20*10,10);
      d.contribution = Math.round(dc+da+dt+dco+df);

      let burnout=0;
      const cpd=d.commits/30;
      if(cpd>2.5)burnout+=30;else if(cpd>1.5)burnout+=20;else if(cpd>0.8)burnout+=10;
      const ch=d.additions;
      if(ch>2000)burnout+=28;else if(ch>1000)burnout+=18;else if(ch>400)burnout+=9;
      const op=j.todo+j.inprog;
      if(op>18)burnout+=28;else if(op>12)burnout+=18;else if(op>6)burnout+=9;
      if(j.comments>55)burnout+=14;else if(j.comments>25)burnout+=8;
      d.burnout=Math.min(burnout,100);
      d.risk=d.burnout>=80?"critical":d.burnout>=60?"high":d.burnout>=35?"medium":"low";
      d.pattern=d.commits>70?"Sprint Sprinter":j.comments>50?"Collaborator":d.additions/Math.max(d.commits,1)>20?"Deep Coder":"Specialist";
      d.open_tasks = j.todo + j.inprog;
      d.burnout_traj = { s5: d.burnout + 2, s6: d.burnout + 5, slope: 2.1 };
      d.dims = {commits:Math.round(dc/30*100),code:Math.round(da/25*100),tasks:Math.round(dt/20*100),collab:Math.round(dco/15*100),coverage:Math.round(df/10*100)};
      return d;
    });

    // Final calculations for Files
    const files = Object.values(fileData).map(f => {
      const devCounts = Object.values(f.devs);
      const sum = devCounts.reduce((a, b) => a + b, 0);
      let ent = 0;
      devCounts.forEach(c => {
        const p = c / sum;
        ent -= p * Math.log2(p);
      });
      f.entropy = ent || 0;
      f.bus = devCounts.filter(c => (c / sum) > 0.2).length;
      let topOwner = "";
      let topCount = 0;
      for (let dev in f.devs) {
        if (f.devs[dev] > topCount) {
          topCount = f.devs[dev];
          topOwner = dev;
        }
      }
      f.top_owner = topOwner;
      f.top_pct = Math.round((topCount / sum) * 100);
      f.top_burnout = devData[topOwner] ? devData[topOwner].burnout : 0;
      f.risk = Math.round((f.entropy / 2.5 * 40) + ( (5-f.bus)/4 * 30 ) + (f.top_burnout/100 * 30));
      return f;
    });

    return { devs, fileData: files, deps, tickets };
  } catch (err) {
    console.error("Error parsing metrics:", err);
    return null;
  }
}

// --- SSE BROADCAST ---
let clients = [];
function sendToAllClients(data) {
  clients.forEach(client => client.res.write(`data: ${JSON.stringify(data)}\n\n`));
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const data = calculateMetrics();
  res.write(`data: ${JSON.stringify(data)}\n\n`);

  const clientId = Date.now();
  clients.push({ id: clientId, res });

  req.on('close', () => {
    clients = clients.filter(c => c.id !== clientId);
  });
});

app.get('/api/data', (req, res) => {
  res.json(calculateMetrics());
});

// Watch for changes
chokidar.watch(DATA_DIR).on('change', () => {
  console.log("CSV changed. Re-parsing...");
  const data = calculateMetrics();
  if (data) sendToAllClients(data);
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
