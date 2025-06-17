import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PlannerAgent } from './agents/planner.js';
import { BranchNamingAgent } from './agents/branch-namer.js';
import { EmbedderAgent } from './agents/embedder.js';
import { DeveloperAgent } from './agents/developer.js';
import { ReviewerAgent } from './agents/reviewer.js';
import { PRWriterAgent } from './agents/pr-writer.js';
import { GitManager } from './git/git-manager.js';
import { GitHubManager } from './github/github-manager.js';
import { OllamaService } from './services/ollama.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize services
const ollamaService = new OllamaService();

app.get('/api/models', async (req, res) => {
  try {
    const models = await ollamaService.getModels();
    res.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models from Ollama' });
  }
});

app.post('/api/repos', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'GitHub token is required' });
    }

    const githubManager = new GitHubManager(token);
    const repos = await githubManager.getRepositories();
    res.json(repos);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

app.post('/api/branches', async (req, res) => {
  try {
    const { token, owner, repo } = req.body;
    if (!token || !owner || !repo) {
      return res.status(400).json({ error: 'Token, owner, and repo are required' });
    }

    const githubManager = new GitHubManager(token);
    const branches = await githubManager.getBranches(owner, repo);
    res.json(branches);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

app.post('/api/run-task', async (req, res) => {
  try {
    const { token, repo, baseBranch, task, agentModels } = req.body;
    
    if (!token || !repo || !baseBranch || !task || !agentModels) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Sanitize the repo parameter
    const sanitizeFilename = require('sanitize-filename');
    const sanitizedRepo = sanitizeFilename(repo);
    if (!sanitizedRepo) {
      return res.status(400).json({ error: 'Invalid repository name' });
    }

    // Set up SSE for real-time updates
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const sendUpdate = (status, message, data = null) => {
      res.write(`data: ${JSON.stringify({ status, message, data })}\n\n`);
    };

    try {
      // Initialize managers and agents
      const githubManager = new GitHubManager(token);
      const gitManager = new GitManager();
      
      const plannerAgent = new PlannerAgent(ollamaService, agentModels.planner);
      const branchNamingAgent = new BranchNamingAgent(ollamaService, agentModels.branchNamer);
      const embedderAgent = new EmbedderAgent(ollamaService, agentModels.embedder, agentModels.generator);
      const developerAgent = new DeveloperAgent(ollamaService, agentModels.developer);
      const reviewerAgent = new ReviewerAgent(ollamaService, agentModels.reviewer);
      const prWriterAgent = new PRWriterAgent(ollamaService, agentModels.prWriter);

      sendUpdate('info', 'Starting task execution...');

      // Step 1: Planner Agent
      sendUpdate('info', 'Planning task decomposition...');
      const plan = await plannerAgent.generatePlan(task);
      sendUpdate('success', 'Task plan generated', { plan });

      // Step 2: Branch Naming Agent
      sendUpdate('info', 'Generating branch name...');
      const branchName = await branchNamingAgent.generateBranchName(task, plan);
      sendUpdate('success', 'Branch name generated', { branchName });

      // Step 3: Clone and setup repository
      sendUpdate('info', 'Cloning repository...');
      const [owner, repoName] = repo.split('/');
      const repoPath = await gitManager.cloneRepository(token, owner, repoName, baseBranch);
      sendUpdate('success', 'Repository cloned successfully');

      // Step 4: Create new branch
      sendUpdate('info', 'Creating new branch...');
      await gitManager.createBranch(repoPath, branchName);
      sendUpdate('success', 'New branch created', { branchName });

      // Step 5: Embedder Agent
      sendUpdate('info', 'Analyzing codebase...');
      const codebaseContext = await embedderAgent.analyzeCodebase(repoPath, task);
      sendUpdate('success', 'Codebase analysis completed');

      // Step 6: Developer Agent
      sendUpdate('info', 'Implementing changes...');
      const changes = await developerAgent.implementChanges(repoPath, task, plan, codebaseContext);
      sendUpdate('success', 'Changes implemented', { changes });

      // Step 7: Reviewer Agent
      sendUpdate('info', 'Reviewing changes...');
      const reviewResult = await reviewerAgent.reviewChanges(repoPath, changes, task);
      sendUpdate('success', 'Changes reviewed', { reviewResult });

      // Apply review suggestions if any
      if (reviewResult.hasImprovements) {
        sendUpdate('info', 'Applying review improvements...');
        await developerAgent.applyImprovements(repoPath, reviewResult.improvements);
        sendUpdate('success', 'Review improvements applied');
      }

      // Step 8: Commit and push changes
      sendUpdate('info', 'Committing changes...');
      await gitManager.commitChanges(repoPath, `${task}\n\n${plan}`);
      sendUpdate('success', 'Changes committed');

      sendUpdate('info', 'Pushing branch to GitHub...');
      await gitManager.pushBranch(repoPath, branchName);
      sendUpdate('success', 'Branch pushed to GitHub');

      // Step 9: PR Writer Agent
      sendUpdate('info', 'Generating pull request...');
      const prContent = await prWriterAgent.generatePR(task, plan, changes, reviewResult);
      sendUpdate('success', 'Pull request content generated');

      // Step 10: Create pull request
      sendUpdate('info', 'Creating pull request...');
      const pullRequest = await githubManager.createPullRequest(
        owner,
        repoName,
        branchName,
        baseBranch,
        prContent.title,
        prContent.body
      );
      sendUpdate('success', 'Pull request created successfully!', { 
        prUrl: pullRequest.html_url,
        prNumber: pullRequest.number 
      });

    } catch (error) {
      console.error('Task execution error:', error);
      sendUpdate('error', `Task failed: ${error.message}`);
    }

    res.end();
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Server error occurred' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});