import type { GroupMember } from "../types.js";

export function formatMemberTelegramLink(member: GroupMember): string {
  const username = member.username?.trim().replace(/^@/, "");
  if (username) return `https://t.me/${username}`;
  return `tg://user?id=${member.userId}`;
}

export function chunkLines(lines: string[], maxLen = 4000): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLen && current) {
      chunks.push(current);
      current = line;
      continue;
    }
    current = candidate;
  }
  if (current) chunks.push(current);
  return chunks;
}
