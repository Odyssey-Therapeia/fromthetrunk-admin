/**
 * Minimal server-side HTML sanitizer for CMS-authored rich-text content.
 *
 * Strips dangerous constructs from editor-supplied HTML before rendering via
 * dangerouslySetInnerHTML. This is defense-in-depth for content that originates
 * from the admin editor (not arbitrary end-user input), so a conservative
 * allowlist approach is appropriate.
 *
 * No external dependency: adding DOMPurify would require a browser DOM (it
 * needs `window`) or isomorphic-dompurify (a new dep). Instead we apply four
 * targeted regex passes that cover the XSS surface for CMS HTML:
 *
 *  1. Strip <script …>…</script> blocks (including cross-line).
 *  2. Strip <iframe>, <object>, <embed>, <form> elements entirely.
 *  3. Strip on* event handler attributes (onclick=, onload=, …).
 *  4. Strip javascript: and data: URI schemes in href/src/action.
 *
 * This is NOT a general-purpose sanitizer — it is scoped to the specific risk
 * surface of CMS-editor output (headings, paragraphs, bold, italic, lists,
 * links, blockquotes). Anything beyond that surface should go through a
 * dedicated library added as a project dependency.
 */
export function sanitizeCmsHtml(html: string): string {
  let out = html;

  // 1. Remove script elements (greedy across newlines, case-insensitive)
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // 2. Remove dangerous embedding elements entirely
  out = out.replace(
    /<(iframe|object|embed|form|base)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ""
  );
  // Self-closing variants
  out = out.replace(/<(iframe|object|embed|form|base)\b[^>]*/gi, "");

  // 3. Strip on* event attributes (e.g. onclick="…", onload='…', onerror=…)
  out = out.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  // 4. Strip javascript: and data: URI schemes in href/src/action attributes
  out = out.replace(
    /(href|src|action)\s*=\s*["']?\s*(javascript|data):[^"'\s>]*/gi,
    "$1=\"\""
  );

  return out;
}
