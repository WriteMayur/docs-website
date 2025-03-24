const { Octokit } = require("@octokit/rest");
const fs = require('fs');
const path = require('path');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const owner = 'your-github-username';
const repo = 'your-repository-name';
const developBranch = 'develop';
const releaseNotesDir = 'release-notes';
const releaseNotesFile = path.join(releaseNotesDir, 'release-notes.md');

async function getMergedPRsSinceLastRelease() {
  const { data: pulls } = await octokit.pulls.list({
    owner,
    repo,
    state: 'closed',
    base: developBranch,
    sort: 'updated',
    direction: 'desc',
  });

  const lastReleaseDate = await getLastReleaseDate();
  return pulls.filter(pr => new Date(pr.merged_at) > new Date(lastReleaseDate));
}

async function getLastReleaseDate() {
  if (!fs.existsSync(releaseNotesFile)) {
    return new Date(0); // Return epoch if no release notes exist
  }

  const content = fs.readFileSync(releaseNotesFile, 'utf8');
  const match = content.match(/Release Date: (.*)/);
  return match ? new Date(match[1]) : new Date(0);
}

async function generateReleaseNotes() {
  const prs = await getMergedPRsSinceLastRelease();
  const newDocs = [];
  const majorChanges = [];
  const minorChanges = [];
  const releaseNotes = [];

  for (const pr of prs) {
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: pr.number,
    });

    const mdxFiles = files.filter(file => file.filename.endsWith('.mdx'));
    if (mdxFiles.length === 0) continue;

    const summary = pr.body.split('\n').slice(0, 2).join(' '); // First 2 lines of PR body

    if (pr.labels.some(label => label.name === 'From_TW')) {
      majorChanges.push({
        title: pr.title,
        summary,
        url: pr.html_url,
      });
    } else {
      minorChanges.push({
        title: pr.title,
        summary,
        url: pr.html_url,
      });
    }

    for (const file of mdxFiles) {
      if (file.status === 'added') {
        newDocs.push({
          filename: file.filename,
          summary,
          url: pr.html_url,
        });
      }
    }
  }

  const releaseNumber = getNextReleaseNumber();
  const releaseOverview = prs.map(pr => `- ${pr.title}`).join('\n');

  const releaseNotesContent = `
# Docs Release Notes for ${releaseNumber}

## Release Overview
${releaseOverview}

## New Documentation
${newDocs.map(doc => `- [${doc.filename}](${doc.url}): ${doc.summary}`).join('\n')}

## Major Changes
${majorChanges.map(change => `- [${change.title}](${change.url}): ${change.summary}`).join('\n')}

## Minor Changes
${minorChanges.map(change => `- [${change.title}](${change.url}): ${change.summary}`).join('\n')}

## Release Notes
${releaseNotes.map(note => `- ${note}`).join('\n')}

Release Date: ${new Date().toISOString()}
`;

if (!fs.existsSync(releaseNotesDir)) {
    fs.mkdirSync(releaseNotesDir);
  }

  fs.writeFileSync(releaseNotesFile, releaseNotesContent.trim());
  console.log('Release notes generated successfully.');
}

function getNextReleaseNumber() {
  // Implement logic to determine the next release number
  // This could be based on tags, previous release notes, or any other versioning strategy
  // For simplicity, let's assume a simple incrementing number
  const previousReleaseNumber = getLastReleaseNumber();
  return previousReleaseNumber + 1;
}

function getLastReleaseNumber() {
  if (!fs.existsSync(releaseNotesFile)) {
    return 0; // Start from 0 if no release notes exist
  }

  const content = fs.readFileSync(releaseNotesFile, 'utf8');
  const match = content.match(/Docs Release Notes for (\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

generateReleaseNotes().catch(error => {
  console.error('Error generating release notes:', error);
  process.exit(1);
});