interface PushFileOptions {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  content: string;
  commitMessage: string;
}

interface GitHubFileResponse {
  sha: string;
}

async function githubRequest<T>(
  method: string,
  url: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok && res.status !== 404) {
    const errorBody = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${errorBody}`);
  }

  return res.json() as Promise<T>;
}

export async function pushFile(options: PushFileOptions): Promise<void> {
  const { token, owner, repo, branch, filePath, content, commitMessage } = options;
  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

  // Fetch existing file SHA so GitHub knows we're updating (not creating a conflict)
  let sha: string | undefined;
  try {
    const existing = await githubRequest<GitHubFileResponse>('GET', `${apiBase}?ref=${branch}`, token);
    sha = existing?.sha;
  } catch {
    // File doesn't exist yet — sha stays undefined, GitHub will create it
  }

  await githubRequest('PUT', apiBase, token, {
    message: commitMessage,
    content: encodedContent,
    branch,
    ...(sha ? { sha } : {}),
  });
}
