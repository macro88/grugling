// Fixtures for the routing spike: a tool catalog + hand-labelled prompts.
// The labels are the human-curated bit — they define "correct". Throwaway shell
// otherwise.

export interface Tool {
  name: string;
  desc: string;
}

// 15 tools a modest personal assistant might plausibly carry. `chat` is the
// no-tool escape hatch (the Route "this is conversation, not a task" answer) and
// is always offered in every candidate set.
export const TOOLS: Tool[] = [
  { name: "system_health", desc: "Report CPU, memory, disk and load of this machine." },
  { name: "fetch_url", desc: "Fetch a web page or URL and return its content." },
  { name: "set_reminder", desc: "Schedule a reminder or timed job for the user." },
  { name: "list_reminders", desc: "List the user's scheduled reminders and jobs." },
  { name: "search_memory", desc: "Recall previously stored facts about the user." },
  { name: "save_memory", desc: "Store a durable fact about the user for later." },
  { name: "read_file", desc: "Read the contents of a local file by path." },
  { name: "write_file", desc: "Create or overwrite a local file with content." },
  { name: "list_files", desc: "List files in a local directory." },
  { name: "run_command", desc: "Run a shell command on the local machine." },
  { name: "send_message", desc: "Send a message or notification to the user." },
  { name: "get_weather", desc: "Look up the current weather for a location." },
  { name: "calculate", desc: "Evaluate an arithmetic expression." },
  { name: "current_time", desc: "Get the current date and time." },
  { name: "chat", desc: "No tool needed — just reply conversationally." },
];

export interface Case {
  prompt: string;
  expected: string; // gold tool name
}

// One prompt per tool, plus deliberate near-misses (read_file vs list_files,
// set_reminder vs send_message, calculate vs current_time) to surface real
// routing errors rather than only easy hits.
export const CASES: Case[] = [
  { prompt: "How much RAM is free right now?", expected: "system_health" },
  { prompt: "Grab the text from https://example.com/article and tell me what it says.", expected: "fetch_url" },
  { prompt: "Remind me to call mum at 6pm today.", expected: "set_reminder" },
  { prompt: "What reminders do I currently have set?", expected: "list_reminders" },
  { prompt: "What's my sister's birthday again?", expected: "search_memory" },
  { prompt: "Remember that I'm allergic to penicillin.", expected: "save_memory" },
  { prompt: "Show me what's inside ~/notes/todo.md", expected: "read_file" },
  { prompt: "Create a file shopping.txt containing 'milk and eggs'.", expected: "write_file" },
  { prompt: "What files are in my Downloads folder?", expected: "list_files" },
  { prompt: "Run `git status` in the current repo.", expected: "run_command" },
  { prompt: "Send me a notification when the backup finishes.", expected: "send_message" },
  { prompt: "Will it rain in London tomorrow?", expected: "get_weather" },
  { prompt: "What's 1893 multiplied by 47?", expected: "calculate" },
  { prompt: "What's the time in UTC right now?", expected: "current_time" },
  { prompt: "I'm feeling a bit down today.", expected: "chat" },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

// Build a candidate set of size k for a case: always include the gold tool and
// `chat`, then fill with deterministic distractors rotated by case index so the
// set is reproducible but varies across cases. Returns names in a deterministic
// order (gold is NOT placed first — that would leak position bias).
export function candidateSet(c: Case, k: number, caseIndex: number): string[] {
  const must = new Set<string>([c.expected, "chat"]);
  const pool = TOOLS.map((t) => t.name).filter((n) => !must.has(n));
  const rotated = pool.slice(caseIndex % pool.length).concat(pool.slice(0, caseIndex % pool.length));
  const fill = rotated.slice(0, Math.max(0, k - must.size));
  const names = [...must, ...fill];
  // Deterministic stable sort so position of gold is not always the same.
  return names.sort((a, b) => hash(a + caseIndex) - hash(b + caseIndex));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
