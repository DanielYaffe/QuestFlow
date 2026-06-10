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

class GitHubHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GitHubHttpError';
  }
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

  if (!res.ok) {
    const errorBody = await res.text();
    let githubMessage: string;
    try {
      githubMessage = (JSON.parse(errorBody) as { message?: string }).message ?? errorBody;
    } catch {
      githubMessage = errorBody;
    }

    switch (res.status) {
      case 401:
        throw new GitHubHttpError(401, 'Invalid or expired GitHub token — update it in Settings.');
      case 403:
        throw new GitHubHttpError(403, "Access denied — make sure your token has 'repo' scope.");
      case 409:
        throw new GitHubHttpError(409, 'Conflict: the file was modified remotely. Try again.');
      default:
        throw new GitHubHttpError(res.status, githubMessage || `GitHub error (${res.status})`);
    }
  }

  return res.json() as Promise<T>;
}

function buildVariantPath(filePath: string, n: number): string {
  const dot = filePath.lastIndexOf('.');
  return dot === -1
    ? `${filePath}(${n})`
    : `${filePath.slice(0, dot)}(${n})${filePath.slice(dot)}`;
}

function contentUrl(owner: string, repo: string, filePath: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath).replace(/%2F/g, '/')}`;
}

async function fetchSha(
  url: string,
  branch: string,
  token: string,
): Promise<string | undefined> {
  try {
    const existing = await githubRequest<GitHubFileResponse>(
      'GET',
      `${url}?ref=${encodeURIComponent(branch)}`,
      token,
    );
    return existing?.sha;
  } catch (err) {
    // Only swallow "file not found" 404s. Other 404 messages (e.g. "No commit
    // found for the ref …") mean the branch is missing and should propagate.
    if (err instanceof GitHubHttpError && err.status === 404 && err.message === 'Not Found') {
      return undefined;
    }
    throw err;
  }
}

// Returns the actual path the file was committed to (may differ from filePath
// when a conflict forced a numbered suffix to be used).
export async function pushFile(options: PushFileOptions): Promise<string> {
  const { token, owner, repo, branch, filePath, content, commitMessage } = options;
  const encodedContent = Buffer.from(content, 'utf-8').toString('base64');

  const MAX_VARIANTS = 5;

  for (let attempt = 0; attempt <= MAX_VARIANTS; attempt++) {
    const currentPath = attempt === 0 ? filePath : buildVariantPath(filePath, attempt);
    const apiUrl = contentUrl(owner, repo, currentPath);

    const sha = await fetchSha(apiUrl, branch, token);

    try {
      await githubRequest('PUT', apiUrl, token, {
        message: commitMessage,
        content: encodedContent,
        branch,
        ...(sha ? { sha } : {}),
      });
      return currentPath;
    } catch (err) {
      if (err instanceof GitHubHttpError) {
        // 409 = SHA is stale (concurrent edit). Try the next numbered variant.
        if (err.status === 409 && attempt < MAX_VARIANTS) continue;

        if (err.status === 404) {
          throw new Error(`Repository '${owner}/${repo}' not found — check the owner and repo name.`);
        }
        if (err.message.toLowerCase().includes('reference')) {
          throw new Error(`Branch '${branch}' not found — check the branch name.`);
        }
      }
      throw err;
    }
  }

  throw new Error(`Push failed: could not write after ${MAX_VARIANTS} attempts.`);
}
