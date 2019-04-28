import { Toolkit } from 'actions-toolkit';

import { createPatch } from 'diff';

import { generateArtifacts } from './artifacts';

Toolkit.run(
  async tools => {
    const started = new Date();
    const { owner, repo } = tools.context.repo;

    tools.log.info('Starting check run');

    const artifacts = await generateArtifacts(tools);

    if (artifacts.new === artifacts.old) {
      tools.exit.success('No Typescript Changes');
    } else {
      const patch = createPatch('electron.d.ts', artifacts.old, artifacts.new, '', '');

      await tools.github.checks.create({
        owner,
        repo,
        name: 'Typescript Comparison',
        head_sha: tools.context.payload.pull_request.head.sha,
        conclusion: 'neutral' as 'neutral',
        details_url: 'https://github.com/electron/archaeologist',
        started_at: started.toISOString(),
        completed_at: new Date().toISOString(),
        output: {
          title: 'Typescript Changes Detected',
          summary: `Looks like the \`electron.d.ts\` file changed.\n\n\`\`\`\`\`\`diff\n${patch}\n\`\`\`\`\`\``,
        },
      });

      tools.exit.success('Typescript Changes Detected');
    }
  },
  {
    event: ['pull_request.opened', 'pull_request.reopened', 'pull_request.synchronize'],
  },
);
