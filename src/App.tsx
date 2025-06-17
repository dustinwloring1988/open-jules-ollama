import React, { useState, useEffect } from 'react';
import { Settings, Play, Github, Zap } from 'lucide-react';
import { StatusConsole } from './components/StatusConsole';
import { SettingsModal } from './components/SettingsModal';
import { RepoSelector } from './components/RepoSelector';

interface AgentModels {
  planner: string;
  branchNamer: string;
  embedder: string;
  developer: string;
  reviewer: string;
  prWriter: string;
  generator: string;
}

interface StatusEntry {
  timestamp: string;
  status: 'info' | 'success' | 'error' | 'warning';
  message: string;
  data?: unknown;
}

function App() {
  const [githubToken, setGithubToken] = useState<string>('');
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [taskPrompt, setTaskPrompt] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [status, setStatus] = useState<StatusEntry[]>([]);
  const [agentModels, setAgentModels] = useState<AgentModels>({
    planner: '',
    branchNamer: '',
    embedder: '',
    developer: '',
    reviewer: '',
    prWriter: '',
    generator: 'llama3'
  });

  // Load saved settings on component mount
  useEffect(() => {
    const savedToken = localStorage.getItem('github-token');
    const savedModels = localStorage.getItem('agent-models');
    
    if (savedToken) setGithubToken(savedToken);
    if (savedModels) {
      try {
        setAgentModels(JSON.parse(savedModels));
      } catch (_e) {
        console.error('Error parsing saved models:', _e);
      }
    }
  }, []);

  const handleRunTask = async () => {
    if (!githubToken || !selectedRepo || !selectedBranch || !taskPrompt) {
      alert('Please fill in all required fields');
      return;
    }

    if (!Object.values(agentModels).every(model => model)) {
      alert('Please configure all agent models in Settings');
      return;
    }

    setIsRunning(true);
    setStatus([]);

    try {
      const response = await fetch('http://localhost:3001/api/run-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: githubToken,
          repo: selectedRepo,
          baseBranch: selectedBranch,
          task: taskPrompt,
          agentModels
        })
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Failed to get readable stream from response");

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              setStatus(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString(),
                ...data
              }]);
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
    } catch (error: unknown) {
      setStatus(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        status: 'error',
        message: `Connection error: ${(error as Error).message}`
      }]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleTokenSave = (token: string) => {
    setGithubToken(token);
    localStorage.setItem('github-token', token);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl">
              <img src="/open-jules-logo.png" alt="Open Jules Logo" className="w-12 h-12" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Open Jules</h1>
              <p className="text-blue-200">Multi-agent automation powered by Ollama</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors"
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
              <Github className="w-6 h-6 mr-2" />
              Configuration
            </h2>

            <div className="space-y-6">
              {/* GitHub Token */}
              <div>
                <label className="block text-sm font-medium text-blue-100 mb-2">
                  GitHub Personal Access Token
                </label>
                <input
                  type="password"
                  value={githubToken}
                  onChange={(e) => handleTokenSave(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-blue-200 mt-1">
                  Requires 'repo' scope for full functionality
                </p>
              </div>

              {/* Repository Selector */}
              <RepoSelector
                token={githubToken}
                selectedRepo={selectedRepo}
                selectedBranch={selectedBranch}
                onRepoSelect={setSelectedRepo}
                onBranchSelect={setSelectedBranch}
              />

              {/* Task Prompt */}
              <div>
                <label className="block text-sm font-medium text-blue-100 mb-2">
                  Task Description
                </label>
                <textarea
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder="Describe the coding task you want to automate..."
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Run Button */}
              <button
                onClick={handleRunTask}
                disabled={isRunning || !githubToken || !selectedRepo || !selectedBranch || !taskPrompt}
                className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 disabled:from-slate-600 disabled:to-slate-600 rounded-lg text-white font-semibold transition-all duration-200 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    <span>Run Task</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Status Console */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <StatusConsole status={status} />
          </div>
        </div>

        {/* Settings Modal */}
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          agentModels={agentModels}
          onModelsChange={(models: AgentModels) => setAgentModels(models)}
        />
      </div>
    </div>
  );
}

export default App;
