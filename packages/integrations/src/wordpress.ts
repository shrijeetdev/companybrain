// WordPress REST client — publishes a post via application-password basic auth.
// SECURITY: status defaults to 'draft' and the function REFUSES to publish even if a
// caller asks for 'publish' — the draft floor is enforced here (defense in depth),
// because a public post is indexed within minutes and hard to un-publish. If true
// auto-publish is ever wanted, that's a deliberate change to this default.
// Never throws: network/parse/auth failures return { ok:false, error }.

export interface WordpressCreds {
  apiUrl: string;       // e.g. https://blog.example.com (no trailing slash)
  username: string;
  appPassword: string;  // WordPress "application password" (spaces included)
}

export interface PublishResult {
  ok: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
}

function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

export async function publishPost(opts: {
  creds: WordpressCreds;
  title: string;
  content: string;
  /** Always 'draft' regardless of input — see file header. */
  status?: 'draft' | 'publish';
  fetchImpl?: typeof fetch;
}): Promise<PublishResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.creds.apiUrl.replace(/\/+$/, '');
  const url = `${base}/wp-json/wp/v2/posts`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth(opts.creds.username, opts.creds.appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: opts.title,
        content: opts.content,
        status: 'draft', // enforced floor — ignores opts.status
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.parse(raw)?.message ?? ''; } catch { /* non-json */ }
      return { ok: false, error: `WordPress ${res.status}: ${detail || raw.slice(0, 200)}` };
    }
    const json = JSON.parse(raw) as { id?: number; link?: string };
    return { ok: true, postId: json.id, postUrl: json.link };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}
