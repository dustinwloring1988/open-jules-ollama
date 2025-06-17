export class BranchNamingAgent {
  constructor(ollamaService, model) {
    this.ollamaService = ollamaService;
    this.model = model;
  }

  async generateBranchName(task, plan) {
    const systemPrompt = `You are responsible for creating concise, descriptive Git branch names.

Branch naming conventions:
- Use lowercase letters and hyphens
- Be descriptive but concise (max 50 characters)
- Use prefixes like: feature/, fix/, refactor/, docs/, etc.
- Avoid special characters except hyphens
- Make it clear what the branch accomplishes

Examples:
- feature/add-user-authentication
- fix/resolve-payment-bug
- refactor/optimize-database-queries
- docs/update-api-documentation

Return ONLY the branch name, nothing else.`;

    const prompt = `Task: ${task}

Plan Summary: ${plan.substring(0, 500)}...

Generate a concise, descriptive Git branch name for this task. Follow Git branch naming conventions and make it clear what this branch accomplishes.

Branch name:`;

    try {
      const response = await this.ollamaService.generateResponse(this.model, prompt, systemPrompt);
      
      // Clean up the response to ensure it's just the branch name
      let branchName = response.trim()
        .replace(/^(branch name:?\s*)/i, '')
        .replace(/[^a-z0-9\-\/]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();

      // Ensure it starts with a valid prefix
      if (!branchName.includes('/')) {
        branchName = `feature/${branchName}`;
      }

      return branchName;
    } catch (error) {
      console.error('Branch Naming Agent error:', error);
      throw new Error('Failed to generate branch name');
    }
  }
}